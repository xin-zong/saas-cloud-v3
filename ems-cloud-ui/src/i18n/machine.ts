/** Display-only machine translation. Never pass request bodies or auth headers here. */
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
type Fetcher = (url: string, options?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>
type Entry = { text: string; savedAt: number }
type Job = { text: string; generation: number; resolve: (text: string | undefined) => void }
export const containsChinese = (text: string) => /[\u3400-\u9fff]/.test(text)
const MAX_BYTES = 480
const CACHE_LIMIT = 2000
const CACHE_AGE = 30 * 86400000

function eligible(text: string, targetChinese = false) {
  if (!(targetChinese ? /[A-Za-z]/.test(text) : containsChinese(text)) || text.length > 12000) return false
  if (/(?:password|token|secret|authorization|密码|口令)\s*[:=]\s*\S+/i.test(text)) return false
  try { const value = JSON.parse(text); if (value && typeof value === 'object') return false } catch { /* Human-readable text. */ }
  return true
}

function protect(text: string) {
  const tokens: string[] = []
  const masked = text.replace(/https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[A-Za-z][A-Za-z0-9]*(?:[-_./][A-Za-z0-9]+)+|[A-Za-z]+\d[A-Za-z0-9_-]*|-?\d+(?:\.\d+)?(?:\s*(?:MWh|kWh|MW|kW|°C|℃|Hz|V|A|%))?/g, value => {
    const id = tokens.push(value) - 1
    return `ZXQ${id}QXZ`
  })
  const chunks: string[] = []
  let chunk = ''
  for (const unit of masked.match(/ZXQ\d+QXZ|[\s\S]/gu) ?? []) {
    if (new TextEncoder().encode(chunk + unit).length > MAX_BYTES) { chunks.push(chunk); chunk = '' }
    chunk += unit
  }
  if (chunk) chunks.push(chunk)
  return { tokens, chunks }
}

function decodeEntities(value: string) {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, key: string) => {
    if (key.startsWith('#')) {
      const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity
    }
    return entities[key.toLowerCase()] ?? entity
  })
}

export class MachineTranslator {
  private scope = ''
  private enabled = false
  private generation = 0
  private revision = 0
  private active = 0
  private unavailable = false
  private cache = new Map<string, Entry>()
  private pending = new Map<string, Promise<string | undefined>>()
  private failed = new Set<string>()
  private queue: Job[] = []
  private controllers = new Set<AbortController>()
  private listeners = new Set<() => void>()
  private fetcher: Fetcher
  private storage?: StorageLike
  private endpoint: string
  private targetChinese: boolean

  constructor(options: { fetcher?: Fetcher; storage?: StorageLike; endpoint?: string; targetLanguage?: 'zh-CN' | 'en-GB' } = {}) {
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init))
    this.storage = options.storage
    this.endpoint = options.endpoint ?? 'https://api.mymemory.translated.net/get'
    this.targetChinese = options.targetLanguage === 'zh-CN'
  }
  getRevision = () => this.revision
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getStatus = () => ({ pending: this.pending.size, failed: this.failed.size, enabled: this.enabled })
  private emit() { this.revision++; this.listeners.forEach(listener => listener()) }
  private storageKey() { return `enerlution:machine-translations:v1:${this.scope}${this.targetChinese ? ':zh-CN' : ''}` }

  configure(scope: string, enabled: boolean) {
    if (this.scope === scope && this.enabled === enabled) return
    this.generation++
    this.controllers.forEach(controller => controller.abort())
    this.queue.splice(0).forEach(job => job.resolve(undefined))
    this.pending.clear(); this.failed.clear(); this.unavailable = false
    if (this.scope !== scope) {
      this.cache.clear(); this.scope = scope
      try {
        const entries: unknown = JSON.parse(this.storage?.getItem(this.storageKey()) ?? '[]')
        if (Array.isArray(entries)) for (const entry of entries.slice(-CACHE_LIMIT)) {
          if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1]?.text === 'string' && (this.targetChinese ? containsChinese(entry[1].text) : !containsChinese(entry[1].text)) && Number.isFinite(entry[1].savedAt) && Date.now() - entry[1].savedAt < CACHE_AGE) this.cache.set(entry[0], entry[1])
        }
      } catch { /* Optional local cache cannot prevent rendering. */ }
    }
    this.enabled = enabled; this.emit()
  }
  read(text: string) {
    const entry = this.cache.get(text.trim())
    if (!entry || Date.now() - entry.savedAt >= CACHE_AGE) return undefined
    const prefix = text.match(/^\s*/)?.[0] ?? '', suffix = text.match(/\s*$/)?.[0] ?? ''
    return prefix + entry.text + suffix
  }
  request(text: string): Promise<string | undefined> {
    const source = text.trim()
    if (!this.enabled || !eligible(source, this.targetChinese)) return Promise.resolve(undefined)
    const cached = this.read(source)
    if (cached) return Promise.resolve(cached)
    if (this.failed.has(source)) return Promise.resolve(undefined)
    if (this.unavailable) { this.failed.add(source); this.emit(); return Promise.resolve(undefined) }
    const existing = this.pending.get(source)
    if (existing) return existing
    let resolve!: Job['resolve']
    const promise = new Promise<string | undefined>(done => { resolve = done })
    this.pending.set(source, promise)
    this.queue.push({ text: source, generation: this.generation, resolve })
    this.emit(); this.pump()
    return promise
  }
  retryFailed = () => {
    const texts = [...this.failed]; this.failed.clear(); this.unavailable = false; this.emit()
    texts.forEach(text => { void this.request(text) })
  }
  private pump() {
    while (this.active < 2 && this.enabled && this.queue.length) {
      const job = this.queue.shift()!
      this.active++
      void this.run(job).finally(() => { this.active--; this.pump() })
    }
  }
  private async run(job: Job) {
    const controller = new AbortController()
    this.controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), 12000)
    let serviceUnavailable = false
    try {
      const { tokens, chunks } = protect(job.text)
      const translations: string[] = []
      for (const chunk of chunks) {
        if (!(this.targetChinese ? /[A-Za-z]/.test(chunk.replace(/ZXQ\d+QXZ/g, '')) : containsChinese(chunk))) { translations.push(chunk); continue }
        const url = new URL(this.endpoint, typeof location === 'undefined' ? 'http://localhost' : location.origin)
        url.searchParams.set('q', chunk); url.searchParams.set('langpair', this.targetChinese ? 'en-GB|zh-CN' : 'zh-CN|en-GB'); url.searchParams.set('mt', '1')
        let response: Awaited<ReturnType<Fetcher>>
        try { response = await this.fetcher(url.toString(), { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }) }
        catch (error) { serviceUnavailable = true; throw error }
        if (!response.ok) { serviceUnavailable = true; throw new Error('Translation service unavailable') }
        const body = await response.json()
        const translated = body?.responseData?.translatedText
        if (Number(body?.responseStatus) !== 200 || /MYMEMORY WARNING|DAILY.*LIMIT/i.test(String(translated))) { serviceUnavailable = true; throw new Error('Translation service unavailable') }
        if (typeof translated !== 'string' || !translated.trim() || (this.targetChinese ? !containsChinese(translated) : containsChinese(translated))) throw new Error('Translation not available')
        translations.push(decodeEntities(translated.trim()))
      }
      let text = translations.join(' ')
      tokens.forEach((token, index) => {
        const placeholder = `ZXQ${index}QXZ`
        if (text.split(placeholder).length !== 2) throw new Error('Translation altered an identifier')
        text = text.replace(placeholder, token)
      })
      if (job.generation !== this.generation || !this.enabled) { job.resolve(undefined); return }
      this.cache.delete(job.text); this.cache.set(job.text, { text, savedAt: Date.now() })
      while (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!)
      try { this.storage?.setItem(this.storageKey(), JSON.stringify([...this.cache])) } catch { /* Memory cache still works. */ }
      job.resolve(text)
    } catch {
      if (job.generation === this.generation && this.enabled) {
        this.failed.add(job.text)
        if (serviceUnavailable) {
          this.unavailable = true
          this.queue.splice(0).forEach(queued => { this.failed.add(queued.text); this.pending.delete(queued.text); queued.resolve(undefined) })
        }
      }
      job.resolve(undefined)
    } finally {
      clearTimeout(timer); this.controllers.delete(controller)
      if (job.generation === this.generation) { this.pending.delete(job.text); this.emit() }
    }
  }
}

let browserStorage: StorageLike | undefined
try { if (typeof localStorage !== 'undefined') browserStorage = localStorage } catch { /* Storage may be disabled. */ }
export const machineTranslator = new MachineTranslator({ storage: browserStorage, endpoint: import.meta.env.VITE_TRANSLATION_ENDPOINT || undefined })
export const chineseLabelTranslator = new MachineTranslator({ storage: browserStorage, endpoint: import.meta.env.VITE_TRANSLATION_ENDPOINT || undefined, targetLanguage: 'zh-CN' })
