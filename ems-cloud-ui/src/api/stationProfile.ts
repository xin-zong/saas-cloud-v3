import { api } from './client'
export type StationProfile = {
  timezone: string | null
  solarCapacityKw: number | null
  gridConnectionDate: string | null
  commissionedOn: string | null
  country: string | null
  province: string | null
  city: string | null
  postcode: string | null
}
export function loadStationProfile(id: string, signal?: AbortSignal) {
  return api<StationProfile | null>(`/stations/${encodeURIComponent(id)}/profile`, { signal })
}
export function stationProfileFields(profile: StationProfile): [string, string][] {
  return [
    ['时区', profile.timezone ?? '—'],
    ['光伏容量 (kW)', profile.solarCapacityKw == null ? '—' : String(profile.solarCapacityKw)],
    ['并网日期', profile.gridConnectionDate ?? '—'],
    ['投运日期', profile.commissionedOn ?? '—'],
    ['国家', profile.country ?? '—'],
    ['省 / 州', profile.province ?? '—'],
    ['城市', profile.city ?? '—'],
    ['邮编', profile.postcode ?? '—'],
  ]
}
