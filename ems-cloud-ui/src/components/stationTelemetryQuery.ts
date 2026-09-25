import type { Station } from "@/App"
import {
  SIGNALS,
  type TelemetrySample,
  type SignalId,
} from "@/data/stationTelemetry"
import { loadHistory, loadPoints } from "./apiAnalytics"

// Only unambiguous measurement names are mapped; unknown channels remain empty.
export async function queryStationTelemetry(
  station: Station,
  from: Date,
  to: Date,
  minutes: number,
  signal: AbortSignal,
): Promise<TelemetrySample[]> {
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    to <= from ||
    to.getTime() - from.getTime() > 366 * 86400000
  )
    throw new Error("请选择一年内有效的采样时间范围")
  const points = await loadPoints(station.id, signal)
  const aliases: Partial<Record<SignalId, string[]>> = {
    soc: ["电池SOC", "SOC"],
    storage: ["充放电功率", "电池功率", "储能功率"],
    pcs: ["交流有功功率", "PCS功率"],
    pv: ["光伏有功功率", "光伏功率"],
    load: ["负荷功率"],
    temperature: ["最高单体温度"],
    dcVoltage: ["直流母线电压"],
    gridVoltage: ["并网电压"],
    generator: ["发电机功率"],
  }
  const normalize = (value: string) =>
    value.replace(/[\s_/-]/g, "").toLowerCase()
  const mapped = SIGNALS.flatMap((item) => {
    const names = (aliases[item.id] ?? [item.name]).map(normalize)
    const candidates = points.filter(
      (point) =>
        names.includes(normalize(point.name)) && point.unit === item.unit,
    )
    return candidates.length === 1
      ? [{ id: item.id, point: candidates[0] }]
      : []
  })
  const batches = await Promise.all(
    mapped.map(async (item) => {
      const rows = []
      for (let cursor = from.getTime(); cursor < to.getTime(); ) {
        const end = Math.min(to.getTime(), cursor + 31 * 86400000)
        rows.push(
          ...(await loadHistory(
            item.point.id,
            new Date(cursor),
            new Date(end),
            minutes,
            signal,
          )),
        )
        cursor = end
      }
      return { id: item.id, rows }
    }),
  )
  const rows = new Map<number, TelemetrySample>()
  for (const batch of batches)
    for (const row of batch.rows) {
      const sample = rows.get(row.timestamp) ?? {
        timestamp: new Date(row.timestamp).toISOString(),
        values: {},
        intervalMinutes: minutes,
      }
      sample.values[batch.id] = row.value
      rows.set(row.timestamp, sample)
    }
  return [...rows].sort(([a], [b]) => a - b).map(([, row]) => row)
}
