import { api, send } from './client'

export type GenerationMonth = { month: number; plannedKwh: string; excellentKwh: string | null }
export type StationGenerationPlan = { id: string; stationId: string; year: number; months: GenerationMonth[]; version: number }

export function generationPlanYears(now = new Date()): number[] {
  const current = Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: 'Asia/Shanghai' }).format(now))
  return Array.from({ length: 41 }, (_, i) => current - 20 + i)
}
function amount(value: string): string {
  if (typeof value !== 'string' || value.length > 64 || !/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value))
    throw new Error('计划电量须为最多 2 位小数的十进制数，单位 kWh。')
  const [whole, fraction = ''] = value.split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents < 1n || cents > 9999999999n) throw new Error('计划电量须在 0.01–99999999.99 kWh 之间。')
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}
export function normalizeGenerationMonths(months: GenerationMonth[]): GenerationMonth[] {
  if (!Array.isArray(months) || months.length !== 12) throw new Error('请填写全部 12 个月的常规计划。')
  const seen = new Set<number>()
  const result = months.map(row => {
    if (!row || !Number.isInteger(row.month) || row.month < 1 || row.month > 12 || seen.has(row.month)) throw new Error('月份必须为不重复的 1–12 月。')
    seen.add(row.month)
    return { month: row.month, plannedKwh: amount(row.plannedKwh), excellentKwh: row.excellentKwh === null || row.excellentKwh === '' ? null : amount(row.excellentKwh) }
  })
  return result.sort((a, b) => a.month - b.month)
}
const root = (stationId: string) => `/stations/${encodeURIComponent(stationId)}/generation-plans`
export const loadStationGenerationPlans = (stationId: string, year?: number) => api<StationGenerationPlan[]>(`${root(stationId)}${year === undefined ? '' : `?year=${year}`}`)
export const createStationGenerationPlan = (stationId: string, year: number, months: GenerationMonth[]) => send<StationGenerationPlan>(root(stationId), 'POST', { year, months: normalizeGenerationMonths(months) })
export const updateStationGenerationPlan = (plan: StationGenerationPlan) => send<StationGenerationPlan>(`${root(plan.stationId)}/${encodeURIComponent(plan.id)}`, 'PUT', { months: normalizeGenerationMonths(plan.months), expectedVersion: plan.version })
export const deleteStationGenerationPlan = (plan: Pick<StationGenerationPlan, 'stationId' | 'id' | 'version'>) => send<void>(`${root(plan.stationId)}/${encodeURIComponent(plan.id)}?expectedVersion=${plan.version}`, 'DELETE')
