import { loadHistory, type MeasurementPoint } from "./apiAnalytics"

export type AnalysisRow = { timestamp: number; [id: string]: number | null | undefined }
export type AnalysisChannel = { id: string; group: string; name: string; unit: string; color: string }
export type AnalysisMetric = "power" | "soc" | "energy"
export const metricSignals = (metric: AnalysisMetric): string[] =>
  metric === "soc" ? ["soc"] : metric === "energy" ? ["storage"] : ["pv", "load", "storage", "grid", "pcs"]

export function registeredChannels(points: MeasurementPoint[]): AnalysisChannel[] {
  const colors = ["#198469", "#3078ca", "#c58019", "#8060b7", "#317c9d"]
  return points.map((point, index) => ({
    id: `point:${point.id}`, group: `设备 ${point.device_id || "未关联"}`,
    name: `${point.name} · ${point.id}`, unit: point.unit, color: colors[index % colors.length],
  }))
}

export function pointMatchesMetric(point: MeasurementPoint, metric: AnalysisMetric) {
  const name = point.name.replace(/[\s_/-]/g, "").toLowerCase()
  if (metric === "soc") return point.unit === "%" && ["soc", "电池soc"].includes(name)
  if (metric === "energy") return point.unit === "kW" && ["充放电功率", "电池功率", "储能功率"].includes(name)
  return point.unit === "kW"
}

export async function queryRegisteredTelemetry(points: MeasurementPoint[], from: Date, to: Date, minutes: number, signal: AbortSignal): Promise<AnalysisRow[]> {
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from || +to - +from > 366 * 86400000)
    throw new Error("请选择一年内有效的采样时间范围")
  const rows = new Map<number, AnalysisRow>()
  await Promise.all(points.map(async point => {
    const id = `point:${point.id}`
    const buckets = new Map<number, number>()
    for (let cursor = +from; cursor < +to;) {
      const end = Math.min(+to, cursor + 31 * 86400000)
      for (const row of await loadHistory(point.id, new Date(cursor), new Date(end), minutes, signal))
        buckets.set(row.timestamp, row.value)
      cursor = end
    }
    const times = [...buckets.keys()].sort((a, b) => a - b)
    for (let index = 0; index < times.length; index++) {
      const time = times[index]
      const row = rows.get(time) ?? { timestamp: time }
      row[id] = buckets.get(time)!
      rows.set(time, row)
      // Explicit break prevents charts from drawing across absent API intervals.
      const next = time + minutes * 60000
      if (index + 1 < times.length && times[index + 1] > next) {
        const gap = rows.get(next) ?? { timestamp: next }
        gap[id] = null
        rows.set(next, gap)
      }
    }
  }))
  return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp)
}

export function intervalEnergy(rows: { timestamp: number; storage?: number | null; intervalMinutes?: number }[], start: number, end: number) {
  let charge = 0, discharge = 0, valid = false
  for (const row of rows) {
    if (typeof row.storage !== "number" || !Number.isFinite(row.storage) || !row.intervalMinutes || row.intervalMinutes <= 0) continue
    const duration = Math.max(0, Math.min(end, row.timestamp + row.intervalMinutes * 60000) - Math.max(start, row.timestamp))
    if (!duration) continue
    valid = true
    const energy = row.storage * duration / 3600000
    if (energy < 0) charge += energy
    else discharge += energy
  }
  return { charge: valid ? charge : null, discharge: valid ? discharge : null }
}
