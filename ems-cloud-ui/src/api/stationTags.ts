import { api, send } from './client'
export type StationTag = { id: string; name: string; description: string; version: number }
export const listStationTags = (q = '', limit = 100, offset = 0) => api<StationTag[]>(`/station-tags?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`)
export async function allStationTags() {
  const result: StationTag[] = []
  for (let offset = 0; ; offset += 100) {
    const rows = await listStationTags('', 100, offset)
    result.push(...rows)
    if (rows.length < 100) return result
  }
}
export const createStationTag = (draft: Pick<StationTag, 'name' | 'description'>) => send<StationTag>('/station-tags', 'POST', draft)
export const updateStationTag = (tag: StationTag) => send<StationTag>(`/station-tags/${encodeURIComponent(tag.id)}`, 'PUT', { name: tag.name, description: tag.description, expectedVersion: tag.version })
export const deleteStationTag = (tag: Pick<StationTag, 'id' | 'version'>) => send<void>(`/station-tags/${encodeURIComponent(tag.id)}?expectedVersion=${tag.version}`, 'DELETE')
export const loadStationTags = (id: string) => api<StationTag[]>(`/stations/${encodeURIComponent(id)}/tags`)
export const assignStationTags = (id: string, tagIds: string[]) => send<StationTag[]>(`/stations/${encodeURIComponent(id)}/tags`, 'PUT', { tagIds })
