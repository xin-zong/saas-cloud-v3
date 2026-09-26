import type { Station } from "@/App"
import { operationsDate, minuteLabel } from "./operations"
import { dispatchStation, type DispatchPoint } from "./stationDispatch"

export function executionQuality(stations: Station[], start: string, end: string, now: Date) {
  const from = new Date(`${start}T12:00:00`), to = new Date(`${end}T12:00:00`)
  const count = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
  if (!Number.isFinite(count) || count < 1 || count > 31 || operationsDate(from) !== start || operationsDate(to) !== end) {
    throw new Error("时间范围须为有效的连续 1–31 天")
  }
  const points: (DispatchPoint & { label: string; cumulative: number | null })[] = []
  const plannedIds = new Set<string>()
  let expected = 0, cumulative = 0
  for (let day = 0; day < count; day++) {
    const cursor = new Date(from); cursor.setDate(cursor.getDate() + day)
    const date = operationsDate(cursor)
    const rows = stations.map(station => dispatchStation(station, date, now))
    rows.filter(row => row.hasPlan).forEach(row => plannedIds.add(row.station.id))
    for (let i = 0; i < 96; i++) {
      // Every selected station must contribute; no-plan stations cannot disappear from totals.
      const sum = (key: "planned" | "actual") => rows.length && rows.every(row => Number.isFinite(row.points[i][key]))
        ? rows.reduce((total,row) => total + row.points[i][key]!,0) : null
      const planned = sum("planned"), actual = sum("actual")
      const delta = planned !== null && actual !== null ? actual - planned : null
      if (rows.length && i * 15 <= rows[0].throughMinute) expected++
      if (delta !== null) cumulative += delta * 0.25
      points.push({minute:i*15,label:`${date.slice(5)} ${minuteLabel(i*15)}`,planned,actual,delta,cumulative:delta===null?null:cumulative})
    }
  }
  const matched = points.filter(point => point.delta !== null)
  const mae = matched.length ? matched.reduce((sum,p) => sum + Math.abs(p.delta!),0) / matched.length : null
  return {
    points, plannedStations:plannedIds.size,
    rows:stations.map(station => dispatchStation(station,end,now)),
    mae, rmse:matched.length ? Math.sqrt(matched.reduce((sum,p) => sum + p.delta!**2,0) / matched.length) : null,
    energy:matched.length ? cumulative : null,
    coverage:expected ? matched.length / expected * 100 : null,
    worst:matched.reduce<typeof matched[number] | null>((max,p) => !max || Math.abs(p.delta!) > Math.abs(max.delta!) ? p : max,null),
  }
}
