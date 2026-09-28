import { loadHistory, type HistoryBucket, type MeasurementPoint } from "./apiAnalytics"

const EVIDENCE: unique symbol = Symbol("analysis-evidence")
export type AnalysisRow = { timestamp: number; [id: string]: number | null | undefined; [EVIDENCE]?: Record<string, HistoryBucket> }
export const analysisEvidence = (row: AnalysisRow | undefined, id: string): HistoryBucket | undefined => row?.[EVIDENCE]?.[id]
/** Current freshness is derived at render time; stored historical quality remains unchanged. */
export function liveChannelEvidence(evidence: HistoryBucket | undefined, now: number): HistoryBucket | undefined {
  if (!evidence || evidence.staleReason) return evidence
  const reason = evidence.sourceTime == null || evidence.receivedAt == null ? "time_unknown"
    : now - evidence.sourceTime > 90000 ? "source_time_expired"
    : now - evidence.receivedAt > 90000 ? "received_time_expired" : null
  return reason ? { ...evidence, staleReason: reason } : evidence
}
export function validChannelSample(row: AnalysisRow, id: string): boolean {
  const evidence = analysisEvidence(row, id)
  return evidence ? evidence.quality === "valid" && evidence.exactValue != null && !evidence.staleReason : typeof row[id] === "number"
}
export type AnalysisChannel = { id: string; group: string; name: string; unit: string; color: string; numeric?: boolean; source?: string }
export type AnalysisMetric = "power" | "soc" | "energy"
export const metricSignals = (metric: AnalysisMetric): string[] =>
  metric === "soc" ? ["soc"] : metric === "energy" ? ["storage"] : ["pv", "load", "storage", "grid", "pcs"]

export function registeredChannels(points: MeasurementPoint[]): AnalysisChannel[] {
  const colors = ["#198469", "#3078ca", "#c58019", "#8060b7", "#317c9d"]
  return points.map((point, index) => ({
    id: `point:${point.id}`, group: point.device_name || `设备 ${point.device_id || "未关联"}`,
    name: `${point.name} · ${point.id}`, unit: point.unit, color: colors[index % colors.length], numeric: ["unknown", "null", undefined].includes(point.valueType) ? undefined : numericPoint(point), source: point.source ?? "legacy",
  }))
}

export const numericPoint = (point: MeasurementPoint) => point.valueType === "number" || point.source !== "ems" && point.valueType == null
export function defaultAnalysisPoints(points: MeasurementPoint[], metric?: AnalysisMetric): MeasurementPoint[] {
  return points.filter(point => numericPoint(point) && (!metric || pointMatchesMetric(point, metric))).sort((a, b) => Number(b.source === "ems") - Number(a.source === "ems")).slice(0, 4)
}

export function pointMatchesMetric(point: MeasurementPoint, metric: AnalysisMetric) {
  if (point.source === "ems") {
    if (point.namespace !== "cabinet") return false
    if (metric === "soc") return point.sourceId === "20018"
    if (metric === "energy") return point.sourceId === "20024"
    return ["20024", "20107", "20197", "20248"].includes(point.sourceId ?? "")
  }
  const name = point.name.replace(/[\s_/-]/g, "").toLowerCase()
  if (metric === "soc") return point.unit === "%" && ["soc", "电池soc"].includes(name)
  if (metric === "energy") return point.unit === "kW" && ["充放电功率", "电池功率", "储能功率"].includes(name)
  return point.unit === "kW"
}

export async function queryRegisteredTelemetry(points: MeasurementPoint[], from: Date, to: Date, minutes: number, signal: AbortSignal, aggregation?: string): Promise<AnalysisRow[]> {
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from || +to - +from > 366 * 86400000)
    throw new Error("请选择一年内有效的采样时间范围")
  const rows = new Map<number, AnalysisRow>()
  await Promise.all(points.map(async point => {
    const id = `point:${point.id}`
    const buckets = new Map<number, HistoryBucket>()
    for (let cursor = +from; cursor < +to;) {
      const end = Math.min(+to, cursor + 31 * 86400000)
      for (const row of await loadHistory(point, new Date(cursor), new Date(end), minutes, signal, aggregation))
        buckets.set(row.timestamp, point.source === "ems" ? row : { ...row, exactValue: row.value, valueType: "number", quality: "valid", sourceTime: row.timestamp, receivedAt: null, aggregation: aggregation || "avg" })
      cursor = end
    }
    const times = [...buckets.keys()].sort((a, b) => a - b)
    for (let index = 0; index < times.length; index++) {
      const time = times[index]
      const row = rows.get(time) ?? { timestamp: time }
      row[id] = buckets.get(time)!.value
      row[EVIDENCE] = { ...row[EVIDENCE], [id]: buckets.get(time)! }
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

export function mergeAnalysisSnapshot(current: AnalysisRow[], snapshot: { items: Record<string, unknown>[]; serverTime: number }, selected: string[]): AnalysisRow[] {
  const rows = new Map<number, AnalysisRow>(current.map(row => [row.timestamp, { ...row, [EVIDENCE]: { ...row[EVIDENCE] } }]))
  const latest = new Map<string, AnalysisRow>()
  for (const row of current) for (const id of Object.keys(row[EVIDENCE] ?? {})) latest.set(id, row)
  const seen = new Set<string>()
  for (const item of snapshot.items) {
    const id = `point:${item.pointId}`
    if (!selected.includes(id)) continue
    const timestamp = typeof item.sourceTime === "number" ? item.sourceTime : typeof item.receivedAt === "number" ? item.receivedAt : null
    if (timestamp === null || !Number.isFinite(timestamp)) continue
    seen.add(id)
    const previous = latest.get(id)
    if (analysisEvidence(previous, id)?.staleReason === "no_observation") {
      const missing = rows.get(previous!.timestamp)!
      delete missing[id]
      delete missing[EVIDENCE]?.[id]
      if (Object.keys(missing).length === 1 && !Object.keys(missing[EVIDENCE] ?? {}).length) rows.delete(missing.timestamp)
    }
    if (previous && timestamp - previous.timestamp > 90000) {
      const at = previous.timestamp + 90000
      const gap = rows.get(at) ?? { timestamp: at, [EVIDENCE]: {} }
      gap[id] = null
      rows.set(at, gap)
    }
    const row = rows.get(timestamp) ?? { timestamp, [EVIDENCE]: {} }
    const number = item.quality === "valid" && item.valueType === "number" && item.value != null && item.value !== "" && !item.staleReason ? Number(item.value) : NaN
    row[id] = Number.isFinite(number) ? number : null
    row[EVIDENCE] = { ...row[EVIDENCE], [id]: { timestamp, value: row[id]!, samples: 1, exactValue: item.value ?? null, valueType: String(item.valueType ?? "unknown"), quality: String(item.quality ?? "unknown"), sourceTime: typeof item.sourceTime === "number" ? item.sourceTime : null, receivedAt: typeof item.receivedAt === "number" ? item.receivedAt : null, staleReason: item.staleReason, aggregation: "raw" } }
    rows.set(timestamp, row)
  }
  for (const id of selected) {
    if (seen.has(id) || analysisEvidence(latest.get(id), id)?.staleReason === "no_observation") continue
    const row = rows.get(snapshot.serverTime) ?? { timestamp: snapshot.serverTime }
    row[id] = null
    row[EVIDENCE] = { ...row[EVIDENCE], [id]: { timestamp: snapshot.serverTime, value: null, exactValue: null, samples: 0, valueType: "unknown", quality: "unknown", sourceTime: null, receivedAt: null, staleReason: "no_observation" } }
    rows.set(snapshot.serverTime, row)
  }
  return [...rows.values()].filter(row => row.timestamp >= snapshot.serverTime - 3600000).sort((a, b) => a.timestamp - b.timestamp)
}

export function latestChannelEvidence(rows: AnalysisRow[], id: string, preferReceipt = false): HistoryBucket | undefined {
  if (preferReceipt) {
    let latest: HistoryBucket | undefined
    for (const row of rows) {
      const evidence = analysisEvidence(row, id)
      if (evidence && (!latest || (evidence.receivedAt ?? evidence.timestamp) >= (latest.receivedAt ?? latest.timestamp))) latest = evidence
    }
    return latest
  }
  for (let index = rows.length - 1; index >= 0; index--) {
    const evidence = analysisEvidence(rows[index], id)
    if (evidence) return evidence
  }
  return undefined
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
