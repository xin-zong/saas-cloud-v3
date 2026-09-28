import { api, type ApiRow } from './client'

export type EmsAccess = { stationPermissions?: Record<string, string[]> }
export const emsAllowed = (user: EmsAccess | null | undefined, station: string, code: string) => !!user?.stationPermissions?.[station]?.includes(code)
export type Observation = ApiRow & { pointId: string | null; value: unknown; valueType: string; quality: string; sourceTime: number | null; receivedAt: number | null; supportedAggregations?: string[] }
export type Gateway = { ems_uuid: string; device_id: string; binding_period_id: string; reachable: boolean | null; last_fresh_heartbeat: string | null }
export type Latest = { items: Observation[]; total: number; hasMore: boolean }
export type StationEms = { gateways: Gateway[]; latest: Latest | null; points: ApiRow[]; responseAt: string }
export function adaptObservation(row: ApiRow): Observation {
  // The wire API already emits exact decimals/identifiers as strings. Never parse them here.
  return { ...row, pointId: row.pointId == null ? null : String(row.pointId), value: row.value ?? null,
    valueType: typeof row.valueType === 'string' ? row.valueType : 'unknown', quality: typeof row.quality === 'string' ? row.quality : 'unknown',
    sourceTime: typeof row.sourceTime === 'number' ? row.sourceTime : null, receivedAt: typeof row.receivedAt === 'number' ? row.receivedAt : null }
}
/** A finite display-only conversion; never use for authoritative totals/statistics. */
export function chartNumber(row: Pick<Observation, 'value' | 'valueType' | 'quality'>): number | null {
  if (row.value == null || row.valueType !== 'number' || row.quality !== 'valid' || typeof row.value !== 'string') return null
  const number = Number(row.value); return Number.isFinite(number) ? number : null
}
export async function loadStationEms(user: EmsAccess, id: string, signal: AbortSignal): Promise<StationEms> {
  if (!emsAllowed(user, id, 'ems.read')) throw new Error('没有该站点的 EMS 读取权限')
  const path = `/stations/${encodeURIComponent(id)}`
  const [gateways, latest, points] = await Promise.all([
    api<Gateway[]>(`${path}/ems`, { signal }),
    emsAllowed(user, id, 'telemetry.read') ? api<Latest>(`${path}/telemetry/latest?limit=200&offset=0`, { signal }) : null,
    emsAllowed(user, id, 'telemetry.read') ? api<ApiRow[]>(`${path}/points`, { signal }) : [],
  ])
  return { gateways, latest: latest ? { ...latest, items: latest.items.map(adaptObservation) } : null, points, responseAt: new Date().toISOString() }
}
export const readEms = <T = ApiRow>(id: string, route: string, signal: AbortSignal) => api<T>(`/ems/${encodeURIComponent(id)}/${route}`, { signal })
export function loadEmsHistory(pointId: string, from: Date, to: Date, aggregation: string, minutes: number, signal: AbortSignal): Promise<ApiRow[]> {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 31 * 86400000) throw new Error('请选择 31 天内有效的查询时段')
  if (!['last','avg','min','max','delta'].includes(aggregation) || ![1,5,15,30,60].includes(minutes)) throw new Error('不支持的聚合方式或粒度')
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), source: 'ems', aggregation, minutes: String(minutes) })
  return api<ApiRow[]>(`/points/${encodeURIComponent(pointId)}/history?${query}`, { signal })
}
/** Owns cancellation + generation protection even when a transport ignores AbortSignal. */
export function createLatestRequest<T>(publish: (value: T) => void, fail: (error: unknown) => void = () => {}) {
  let controller: AbortController | null = null, generation = 0
  const cancel = () => { generation++; controller?.abort(); controller = null }
  return { cancel, async run(load: (signal: AbortSignal) => Promise<T>) {
    cancel(); const epoch = generation, request = new AbortController(); controller = request
    try { const result = await load(request.signal); if (epoch === generation && !request.signal.aborted) publish(result) }
    catch (error) { if (epoch === generation && !request.signal.aborted) fail(error) }
  } }
}
export async function mutateEms<T = ApiRow>(path: string, body: ApiRow, signal: AbortSignal) {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body), signal })
}
export const exactText = (value: unknown): string => value == null ? '—（未知）' : typeof value === 'object' ? JSON.stringify(value) : String(value)

/** Bucket types come from original historical evidence, never a current sample. */
export function historyChartNumber(row: ApiRow): number | null {
  if (row.conflict || row.resetUnknown || !Array.isArray(row.evidence) || !row.evidence.length) return null
  const evidence = Object.prototype.hasOwnProperty.call(row,'selectedSourceTimeKind')
    ? (row.evidence as ApiRow[]).filter(item=>item.sourceTimeKind === row.selectedSourceTimeKind)
    : row.evidence as ApiRow[]
  const ordered = [...evidence].sort((a,b)=>Number(a.sourceTime)-Number(b.sourceTime)||Number(a.receivedAt)-Number(b.receivedAt))
  const samples = evidence.filter(item=>item.quality === 'valid' && item.valueType !== 'null')
  const numeric = row.aggregation === 'last' ? ordered[ordered.length - 1]?.valueType === 'number' : samples.length > 0 && samples.every(item => item.valueType === 'number')
  return chartNumber({value:row.value,valueType:numeric?'number':'unknown',quality:String(row.quality)})
}
