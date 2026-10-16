import { api, send } from './client'

export const SPACE_TYPES = [
  { value: 10, label: '期' }, { value: 20, label: '座' }, { value: 30, label: '栋' },
  { value: 40, label: '层' }, { value: 50, label: '室' }, { value: 60, label: '房间' },
] as const
export type StationSpaceType = typeof SPACE_TYPES[number]['value']
export type StationSpace = { id: string; stationId: string; parentId: string | null; name: string; type: StationSpaceType; version: number; deviceCount: number }
export type StationSpaceDevice = { deviceId: string; name: string; code: string; spaceId: string | null; spaceName: string | null }
export type StationSpaceDevicePage = { items: StationSpaceDevice[]; total: number }
export type SpaceDeviceFilter = { q?: string; spaceId?: string; unassigned?: boolean; limit?: number; offset?: number }
type SpaceIdentity = Pick<StationSpace, 'stationId' | 'id' | 'version'>
const root = (stationId: string) => `/stations/${encodeURIComponent(stationId)}/spaces`
const item = (space: SpaceIdentity) => `${root(space.stationId)}/${encodeURIComponent(space.id)}`
export function normalizeSpaceName(name: string): string {
  const value = name.trim()
  if (!value || value.length > 80) throw new Error('空间名称须为 1—80 个字符。')
  return value
}
export function normalizedSpaceDeviceIds(ids: string[]): string[] {
  const values = [...new Set(ids)]
  if (!values.length || values.length > 200 || values.some(id => typeof id !== 'string' || !id.trim())) throw new Error('请选择 1—200 台设备。')
  return values
}
export const loadStationSpaces = (stationId: string) => api<StationSpace[]>(root(stationId))
export const createStationSpace = (stationId: string, draft: Pick<StationSpace, 'name' | 'type' | 'parentId'>) => {
  if (!SPACE_TYPES.some(type => type.value === draft.type)) throw new Error('请选择有效的空间类型。')
  return send<StationSpace>(root(stationId), 'POST', { name: normalizeSpaceName(draft.name), type: draft.type, parentId: draft.parentId })
}
export const renameStationSpace = (space: SpaceIdentity, name: string) => send<StationSpace>(item(space), 'PUT', { name: normalizeSpaceName(name), expectedVersion: space.version })
export const moveStationSpace = (space: SpaceIdentity, parentId: string | null) => send<StationSpace>(`${item(space)}/parent`, 'PUT', { parentId, expectedVersion: space.version })
export const deleteStationSpace = (space: SpaceIdentity) => send<void>(`${item(space)}?expectedVersion=${space.version}`, 'DELETE')
export const bindStationSpaceDevices = (space: SpaceIdentity, deviceIds: string[]) => send<StationSpace>(`${item(space)}/devices`, 'PUT', { deviceIds: normalizedSpaceDeviceIds(deviceIds), expectedVersion: space.version })
export const unbindStationSpaceDevice = (space: SpaceIdentity, deviceId: string) => send<StationSpace>(`${item(space)}/devices/${encodeURIComponent(deviceId)}?expectedVersion=${space.version}`, 'DELETE')
export function loadStationSpaceDevices(stationId: string, filter: SpaceDeviceFilter = {}) {
  const query = new URLSearchParams()
  query.set('q', filter.q ?? '')
  if (filter.spaceId) query.set('spaceId', filter.spaceId)
  if (filter.unassigned) query.set('unassigned', 'true')
  query.set('limit', String(filter.limit ?? 20)); query.set('offset', String(filter.offset ?? 0))
  return api<StationSpaceDevicePage>(`/stations/${encodeURIComponent(stationId)}/space-devices?${query}`)
}
/** Defensive traversal keeps an inconsistent snapshot readable without trusting it for writes. */
export function orderedStationSpaces(spaces: StationSpace[]): { space: StationSpace; depth: number }[] {
  const visited = new Set<string>(), result: { space: StationSpace; depth: number }[] = []
  const byId = new Set(spaces.map(space => space.id))
  const children = new Map<string | null, StationSpace[]>()
  for (const space of spaces) children.set(space.parentId, [...(children.get(space.parentId) ?? []), space])
  const walk = (roots: StationSpace[]) => {
    const stack = roots.map(space => ({ space, depth: 0 })).reverse()
    while (stack.length) {
      const row = stack.pop()!
      if (visited.has(row.space.id)) continue
      visited.add(row.space.id); result.push(row)
      for (const child of [...(children.get(row.space.id) ?? [])].reverse()) stack.push({ space: child, depth: row.depth + 1 })
    }
  }
  walk(spaces.filter(space => !space.parentId || !byId.has(space.parentId)))
  walk(spaces.filter(space => !visited.has(space.id)))
  return result
}
export function stationSpaceDescendants(spaces: StationSpace[], id: string): Set<string> {
  const found = new Set<string>(), pending = [id]
  while (pending.length) {
    const current = pending.pop()!
    if (found.has(current)) continue
    found.add(current)
    pending.push(...spaces.filter(space => space.parentId === current).map(space => space.id))
  }
  return found
}
