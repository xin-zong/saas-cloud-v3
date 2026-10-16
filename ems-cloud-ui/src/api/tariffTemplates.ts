import { api, send } from './client'

export type TariffBand = 'peak' | 'flat' | 'valley' | 'superPeak'
export type TariffPricingMode = 'fixed' | 'tou'
export type ServerTariffPeriod = { startMinute: number; endMinute: number; band: TariffBand; pricePerKwh: string }
export type ServerTariffTemplate = { id: string; name: string; currency: string; pricingMode: TariffPricingMode; periods: ServerTariffPeriod[]; version: number }
export type TariffBinding = { id: string; stationId: string; templateId: string | null; templateVersion: number | null; name: string; currency: string; pricingMode: TariffPricingMode | null; periods: ServerTariffPeriod[]; validFrom: string; validUntil: string; active: boolean; version: number; modifiable: boolean }
export const TARIFF_BANDS: { value: TariffBand; label: string }[] = [{ value: 'peak', label: '峰' }, { value: 'flat', label: '平' }, { value: 'valley', label: '谷' }, { value: 'superPeak', label: '尖峰' }]
export function normalizeTariffPrice(value: string): string {
  if (typeof value !== 'string' || value.length > 64 || !/^-?\d+(?:\.\d{1,6})?$/.test(value)) throw new Error('价格须为最多六位小数的十进制字符串，可为零或负价。')
  const negative = value.startsWith('-'), [whole, fraction = ''] = value.replace(/^-/, '').split('.')
  const micros = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'))
  if (micros > 99999999999999n) throw new Error('价格绝对值不能超过 99999999.999999。')
  return `${negative && micros !== 0n ? '-' : ''}${micros / 1000000n}.${String(micros % 1000000n).padStart(6, '0')}`
}
export function normalizeTariffPeriods(mode: TariffPricingMode, periods: ServerTariffPeriod[]): ServerTariffPeriod[] {
  if (!['fixed', 'tou'].includes(mode) || !Array.isArray(periods) || !periods.length || periods.length > 96) throw new Error('请选择固定或分时购电规则，时段数量为 1—96。')
  const rows = periods.map(period => {
    if (!Number.isInteger(period.startMinute) || !Number.isInteger(period.endMinute) || period.startMinute < 0 || period.endMinute > 1440 || period.startMinute >= period.endMinute || !TARIFF_BANDS.some(band => band.value === period.band)) throw new Error('时段时间或峰平谷类型无效。')
    return { startMinute: period.startMinute, endMinute: period.endMinute, band: period.band, pricePerKwh: normalizeTariffPrice(period.pricePerKwh) }
  }).sort((a, b) => a.startMinute - b.startMinute)
  let cursor = 0
  for (const period of rows) { if (period.startMinute !== cursor) throw new Error('时段须无空隙、无重叠地覆盖 00:00—24:00。'); cursor = period.endMinute }
  if (cursor !== 1440) throw new Error('时段须完整覆盖 00:00—24:00。')
  if (mode === 'fixed' && (rows.length !== 1 || rows[0].band !== 'flat')) throw new Error('固定购电规则必须是单个全天平段。')
  return rows
}
export function tariffMinute(value: string, end = false): number {
  if (end && value === '24:00') return 1440
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('请输入有效时间 HH:mm；结束时间可使用 24:00。')
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}
export const tariffTime = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
export function shanghaiToday(now = new Date()): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function shanghaiTomorrow(now = new Date()): string {
  const date = new Date(`${shanghaiToday(now)}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
export function validateTariffBindingDates(validFrom: string, validUntil: string, now = new Date()) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!valid(validFrom) || !valid(validUntil)) throw new Error('请选择有效的生效日期和结束日期。')
  if (validFrom < shanghaiTomorrow(now)) throw new Error('生效日期须为上海时间明天或之后。')
  if (validUntil <= validFrom) throw new Error('结束日期须晚于生效日期，且不包含结束当日。')
  return { validFrom, validUntil }
}
export const canModifyTariffBinding = (binding: Pick<TariffBinding, 'active' | 'modifiable' | 'validFrom'>, now = new Date()) => binding.active && binding.modifiable && binding.validFrom >= shanghaiTomorrow(now)
function templateBody(template: Pick<ServerTariffTemplate, 'name' | 'currency' | 'pricingMode' | 'periods'>) {
  const name = template.name.trim()
  if (!name || name.length > 50) throw new Error('模板名称须为 1—50 个字符。')
  if (!/^[A-Z]{3}$/.test(template.currency)) throw new Error('币种须为三位大写字母。')
  return { name, currency: template.currency, pricingMode: template.pricingMode, periods: normalizeTariffPeriods(template.pricingMode, template.periods) }
}
const root = (stationId: string) => `/stations/${encodeURIComponent(stationId)}/tariff-bindings`
const bindingPath = (binding: Pick<TariffBinding, 'stationId' | 'id'>) => `${root(binding.stationId)}/${encodeURIComponent(binding.id)}`
export const loadTariffTemplates = () => api<ServerTariffTemplate[]>('/tariff-templates')
export const loadTariffTemplate = (id: string) => api<ServerTariffTemplate>(`/tariff-templates/${encodeURIComponent(id)}`)
export const createTariffTemplate = (template: Pick<ServerTariffTemplate, 'name' | 'currency' | 'pricingMode' | 'periods'>) => send<ServerTariffTemplate>('/tariff-templates', 'POST', templateBody(template))
export const updateTariffTemplate = (template: ServerTariffTemplate) => send<ServerTariffTemplate>(`/tariff-templates/${encodeURIComponent(template.id)}`, 'PUT', { ...templateBody(template), expectedVersion: template.version })
export const archiveTariffTemplate = (template: Pick<ServerTariffTemplate, 'id' | 'version'>) => send<void>(`/tariff-templates/${encodeURIComponent(template.id)}?expectedVersion=${template.version}`, 'DELETE')
export const loadTariffBindings = (stationId: string, includeInactive = true) => api<TariffBinding[]>(`${root(stationId)}?includeInactive=${includeInactive}`)
export const createTariffBinding = (stationId: string, template: Pick<ServerTariffTemplate, 'id' | 'version'>, validFrom: string, validUntil: string) => send<TariffBinding>(root(stationId), 'POST', { templateId: template.id, expectedTemplateVersion: template.version, ...validateTariffBindingDates(validFrom, validUntil) })
export function updateTariffBindingDates(binding: Pick<TariffBinding, 'stationId' | 'id' | 'version' | 'validFrom' | 'modifiable' | 'active'>, validFrom: string, validUntil: string) {
  if (!canModifyTariffBinding(binding)) throw new Error('该绑定已生效、已解除或已变为历史只读，不能修改。')
  return send<TariffBinding>(bindingPath(binding), 'PUT', { ...validateTariffBindingDates(validFrom, validUntil), expectedVersion: binding.version })
}
export function removeTariffBinding(binding: Pick<TariffBinding, 'stationId' | 'id' | 'version' | 'validFrom' | 'modifiable' | 'active'>) {
  if (!canModifyTariffBinding(binding)) throw new Error('该绑定已生效、已解除或已变为历史只读，不能解除。')
  return send<TariffBinding>(`${bindingPath(binding)}?expectedVersion=${binding.version}`, 'DELETE')
}
export const loadTariffBindingHistory = (binding: Pick<TariffBinding, 'stationId' | 'id'>) => api<TariffBinding[]>(`${bindingPath(binding)}/history`)
