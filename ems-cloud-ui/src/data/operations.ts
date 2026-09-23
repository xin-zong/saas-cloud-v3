import type { Station } from "@/App"
import { normalizeTelemetry } from "./stationTelemetry"
import type { MarketResource, MarketKind } from "./stationMarket"
import type { SettlementData } from "./stationSettlement"

export type PowerKey = "load" | "pv" | "storage" | "grid"
export type OperationsSample = {
  timestamp: string
  load?: number | null
  pv?: number | null
  storage?: number | null
  grid?: number | null
  plannedStorage?: number | null
  soc?: number | null
}
export type OperatingPeriod = {
  id: string
  date: string
  start: string
  end: string
  mode: "charge" | "discharge" | "standby"
  power: number
}
export type MarketService = {
  id: string
  date: string
  name: string
  capacity: number
  revenue: number | null
  status: "待执行" | "执行中" | "已完成" | "已取消"
  kind?: MarketKind
  eventId?: string
  start?: string
  end?: string
  delivery?: { timestamp: string; power: number | null }[]
  attention?: string
}
export type OperationsData = {
  source?: "demo" | "connected"
  samples?: OperationsSample[]
  plan?: OperatingPeriod[]
  marketServices?: MarketService[]
  market?: MarketResource
  settlement?: SettlementData
  dispatch?: { planType?: "dayAhead" | "intraday"; version?: string }
}
export type PowerRow = { minute: number } & Record<PowerKey, number | null>
export const POWER_SERIES = [
  { key: "load", name: "负荷", color: "#2877cc" },
  { key: "pv", name: "光伏", color: "#198e76" },
  { key: "storage", name: "储能", color: "#7a8492" },
  { key: "grid", name: "电网", color: "#b96b14" },
] as const
export const PERIOD_NAMES = {
  charge: "充电",
  discharge: "放电",
  standby: "待机",
}

export function operationsDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
export function minuteLabel(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
}
export function timeMinute(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) return NaN
  const [h, m] = value.split(":").map(Number)
  return h * 60 + m
}
export function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}
export function sumKnown(values: (number | null)[]) {
  const known = values.filter(finite)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}

function revenueBetween(station: Station, start: string, end: string) {
  const points =
    station.revenueHistory?.filter(
      (p) => p.date.slice(0, 10) >= start && p.date.slice(0, 10) <= end,
    ) ?? []
  const total = (key: "settled" | "pending" | "est") =>
    sumKnown(points.map((p) => (finite(p[key]) ? p[key]! : null)))
  const amounts = points.map((p) => {
    const statuses = sumKnown([
      p.settled ?? null,
      p.pending ?? null,
      p.est ?? null,
    ])
    return (
      statuses ??
      (finite(p.amount)
        ? p.amount
        : sumKnown([
            p.peakValley ?? null,
            p.demand ?? null,
            p.pv ?? null,
            p.vpp ?? null,
            p.penalty ?? null,
          ]))
    )
  })
  return {
    total: sumKnown(amounts),
    settled: total("settled"),
    pending: total("pending"),
    estimated: total("est"),
  }
}

export function stationSamples(station: Station, date: string, now: Date) {
  const demo =
    station.operations?.source === "demo" ||
    (station.operations === undefined && station.telemetryHistory === undefined)
  const available =
    station.status !== "offline" && station.status !== "building"
  let samples: OperationsSample[]
  if (station.operations?.samples !== undefined)
    samples = station.operations.samples
  else if (station.telemetryHistory !== undefined) {
    samples = normalizeTelemetry(station.telemetryHistory).map((row) => ({
      timestamp: new Date(row.timestamp).toISOString(),
      load: row.load,
      pv: row.pv,
      storage: row.storage,
      soc: row.soc,
      // Grid voltage is not grid power; only derive net import with all generation known.
      grid: [row.load, row.pv, row.storage, row.generator].every(finite)
        ? row.load! - row.pv! - row.storage! - row.generator!
        : null,
    }))
  } else if (demo && available && date <= operationsDate(now)) {
    samples = Array.from({ length: 96 }, (_, i) => {
      const hour = i / 4
      const daylight = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI))
      const load =
        Math.max(0, station.activePower) *
        (1.3 + 0.65 * Math.sin(((hour - 5) / 24) * Math.PI * 2))
      const pv = station.pvOutput * 1000 * daylight
      const storage =
        station.activePower *
        (hour < 5
          ? -0.6
          : hour < 9
            ? 0
            : hour < 12
              ? 0.8
              : hour < 16
                ? -0.3
                : hour < 21
                  ? 1
                  : 0)
      return {
        timestamp: `${date}T${minuteLabel(i * 15)}:00`,
        load,
        pv,
        storage,
        grid: load - pv - storage,
      }
    })
  } else samples = []

  const normalized = new Map<number, OperationsSample>()
  samples.forEach((sample) => {
    const time = Date.parse(sample.timestamp)
    if (
      !Number.isFinite(time) ||
      operationsDate(new Date(time)) !== date ||
      (!demo && time > now.getTime())
    )
      return
    normalized.set(time, { ...normalized.get(time), ...sample })
  })
  return {
    demo,
    samples: [...normalized.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, sample]) => ({ ...sample, time })),
  }
}

export function stationPlan(station: Station, date: string) {
  const demo =
    station.operations === undefined || station.operations.source === "demo"
  const available =
    station.status !== "offline" && station.status !== "building"
  const source: OperatingPeriod[] =
    station.operations?.plan ??
    (demo && available
      ? [
          {
            id: "night",
            date,
            start: "00:00",
            end: "05:00",
            mode: "charge",
            power: station.ratedPower * 0.6,
          },
          {
            id: "morning",
            date,
            start: "05:00",
            end: "09:00",
            mode: "standby",
            power: 0,
          },
          {
            id: "peak",
            date,
            start: "09:00",
            end: "12:00",
            mode: "discharge",
            power: station.ratedPower * 0.8,
          },
          {
            id: "noon",
            date,
            start: "12:00",
            end: "16:00",
            mode: "charge",
            power: station.ratedPower * 0.3,
          },
          {
            id: "evening",
            date,
            start: "16:00",
            end: "21:00",
            mode: "discharge",
            power: station.ratedPower * 0.8,
          },
          {
            id: "rest",
            date,
            start: "21:00",
            end: "24:00",
            mode: "standby",
            power: 0,
          },
        ]
      : [])
  const periods = source
    .filter(
      (p) =>
        p.date === date &&
        p.mode in PERIOD_NAMES &&
        finite(p.power) &&
        p.power >= 0 &&
        timeMinute(p.start) < timeMinute(p.end),
    )
    .sort((a, b) => timeMinute(a.start) - timeMinute(b.start))
  const overlap = periods.some(
    (p, i) => i > 0 && timeMinute(p.start) < timeMinute(periods[i - 1].end),
  )
  return { demo, periods, overlap }
}

export function buildOperationsStation(
  station: Station,
  date: string,
  now = new Date(),
) {
  const { demo, samples } = stationSamples(station, date, now)
  const today = date === operationsDate(now)
  const current = samples.at(-1)
  const buckets = new Map<number, typeof samples>()
  samples.forEach((sample) => {
    const d = new Date(sample.time)
    const minute = Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) * 15
    buckets.set(minute, [...(buckets.get(minute) ?? []), sample])
  })
  const power: PowerRow[] = Array.from({ length: 96 }, (_, i) => {
    const points = buckets.get(i * 15) ?? []
    const value = (key: PowerKey) => {
      const valid = points.map((p) => p[key]).filter(finite)
      return valid.length
        ? valid.reduce((a, b) => a + b, 0) / valid.length
        : null
    }
    return {
      minute: i * 15,
      load: value("load"),
      pv: value("pv"),
      storage: value("storage"),
      grid: value("grid"),
    }
  })
  const matched = samples.filter(
    (s) => finite(s.plannedStorage) && finite(s.storage),
  )
  const planned = matched.reduce(
    (sum, s) => sum + Math.abs(s.plannedStorage!),
    0,
  )
  const expected = today
    ? Math.min(
        96,
        Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) + 1,
      )
    : 96
  const complete = power.filter((p) =>
    POWER_SERIES.every((s) => finite(p[s.key])),
  ).length
  const month = revenueBetween(station, `${date.slice(0, 7)}-01`, date)
  const lastPower =
    demo &&
    today &&
    station.status !== "offline" &&
    station.status !== "building"
      ? station.activePower
      : current?.storage
  const lastSoc =
    current?.soc ??
    (today && station.status !== "offline" && station.status !== "building"
      ? station.soc
      : null)
  return {
    station,
    demo,
    power,
    day: revenueBetween(station, date, date),
    month,
    storage: finite(lastPower) ? lastPower : null,
    soc: finite(lastSoc) ? Math.max(0, Math.min(100, lastSoc)) : null,
    deviation:
      planned > 0
        ? (matched.reduce(
            (sum, s) => sum + Math.abs(s.storage! - s.plannedStorage!),
            0,
          ) /
            planned) *
          100
        : null,
    completeness:
      demo || date > operationsDate(now)
        ? null
        : Math.min(100, (complete / expected) * 100),
    updatedAt:
      current && !demo
        ? new Date(current.time).toLocaleTimeString("zh-CN", { hour12: false })
        : null,
    plan: stationPlan(station, date),
  }
}
export type OperationsStation = ReturnType<typeof buildOperationsStation>

export function portfolioPower(rows: OperationsStation[]) {
  return Array.from({ length: 96 }, (_, i): PowerRow => {
    // A portfolio sum is only meaningful when every selected station has that signal.
    const value = (key: PowerKey) =>
      rows.length && rows.every((r) => finite(r.power[i][key]))
        ? sumKnown(rows.map((r) => r.power[i][key]))
        : null
    return {
      minute: i * 15,
      load: value("load"),
      pv: value("pv"),
      storage: value("storage"),
      grid: value("grid"),
    }
  })
}

export function powerToEnergy(rows: PowerRow[]): PowerRow[] {
  // Trapezoidal integration in kWh; gaps invalidate subsequent cumulative energy.
  const totals: Record<PowerKey, number> = {
    load: 0,
    pv: 0,
    storage: 0,
    grid: 0,
  }
  const continuous = { load: true, pv: true, storage: true, grid: true }
  return rows.map((row, index) => {
    const next: PowerRow = {
      minute: row.minute,
      load: null,
      pv: null,
      storage: null,
      grid: null,
    }
    POWER_SERIES.forEach(({ key }) => {
      const previous = rows[index - 1]
      if (!finite(row[key]) || (previous && !finite(previous[key])))
        continuous[key] = false
      if (!continuous[key]) return
      if (previous)
        totals[key] +=
          (((previous[key]! + row[key]!) / 2) *
            (row.minute - previous.minute)) /
          60
      next[key] = totals[key]
    })
    return next
  })
}

export function exportOperationsCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][],
) {
  const cell = (value: string | number | null) => {
    const text = value === null ? "" : String(value)
    const safe =
      typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  const blob = new Blob(
    [
      "\uFEFF" +
        [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8" },
  )
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
