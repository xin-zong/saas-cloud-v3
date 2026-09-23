export const DEMO_MODE = import.meta.env.VITE_DATA_MODE === 'demo'
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:18090/api').replace(/\/$/, '')
const TOKEN_KEY = 'enerlution-api-token'
export const getToken = () => sessionStorage.getItem(TOKEN_KEY) || null
let sessionVersion = 0
export const getSessionVersion = () => sessionVersion
export const setToken = (token: string | null) => { sessionVersion++; if (token) sessionStorage.setItem(TOKEN_KEY, token); else sessionStorage.removeItem(TOKEN_KEY) }
export const CAPABILITIES_CHANGED = 'enerlution:permissions-changed'
let refreshCapabilities: ((invalidate?: boolean) => Promise<void>) | null = null
export function registerCapabilityRefresh(refresh: ((invalidate?: boolean) => Promise<void>) | null) { refreshCapabilities = refresh }
export async function refreshAfterForbidden() {
  window.dispatchEvent(new Event(CAPABILITIES_CHANGED))
  await refreshCapabilities?.(true)
}
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const version = getSessionVersion()
  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new ApiError('无法连接服务，请检查网络或服务地址。', 0)
  }
  let body: { code: number; msg?: string; data: T }
  try { body = await response.json() } catch { throw new ApiError('服务器返回了无效响应。', response.status) }
  if (getToken() !== token || getSessionVersion() !== version) throw new ApiError('会话已变化，请重新操作。', 401)
  if (response.status === 401 || body.code === 401) {
    // A late response from a previous session must not clear a newer session.
    if (getToken() === token) { setToken(null); window.dispatchEvent(new Event('enerlution:unauthorized')) }
  }
  if (response.status === 403 || body.code === 403) {
    if (!path.startsWith('/auth/')) {
      window.dispatchEvent(new Event(CAPABILITIES_CHANGED))
      await refreshCapabilities?.(true)
    }
    throw new ApiError(`权限已变化，已刷新当前权限。${body.msg || '无权执行此操作。'}`, 403)
  }
  if (!response.ok || (body.code !== 0 && body.code !== 200)) throw new ApiError(body.msg || `请求失败 (${response.status})`, body.code || response.status)
  if (options.method && options.method !== 'GET' && /^(\/members(?:\/|$)|\/platform\/(roles|organizations)(?:\/|$))/.test(path)) {
    await refreshCapabilities?.(true)
    if (getToken() !== token || getSessionVersion() !== version) throw new ApiError('会话已变化，请重新操作。', 401)
  }
  return body.data
}
export const send = <T>(path: string, method: string, body?: unknown) => api<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
export type ApiRow = Record<string, unknown>
export async function allRows<T = ApiRow>(path: string, signal?: AbortSignal): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; ; offset += 100) {
    const rows = await api<T[]>(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`, { signal })
    result.push(...rows)
    if (rows.length < 100) return result
  }
}
