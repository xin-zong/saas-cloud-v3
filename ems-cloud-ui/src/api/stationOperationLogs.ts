import { api } from './client'
export type StationOperationLog = { id: string; stationId: string; action: string; occurredAt: string; actor: string | null; actorGroup: string | null; channel: string | null; ip: string | null; location: null; sharedDetail: boolean; content: string | null }
export type StationOperationLogPage = { items: StationOperationLog[]; limit: number; offset: number; hasMore: boolean }
export type OperationLogFilters = { content?: string; actor?: string; channel?: string; ip?: string; from?: string; to?: string }
export function loadStationOperationLogs(stationId: string, filters: OperationLogFilters = {}, offset = 0, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: '20', offset: String(offset) })
  for (const [key, value] of Object.entries(filters)) if (value?.trim()) params.set(key, value.trim())
  return api<StationOperationLogPage>(`/stations/${encodeURIComponent(stationId)}/operation-logs?${params}`, { signal })
}
