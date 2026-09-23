import type { Station } from "@/App"
import {
  finite,
  minuteLabel,
  operationsDate,
  stationPlan,
  stationSamples,
  timeMinute,
  type OperatingPeriod,
} from "./operations"

export type DispatchKind = "dayAhead" | "intraday"
export type DispatchPoint = {
  minute: number
  planned: number | null
  actual: number | null
  delta: number | null
}
export type DispatchDraft = {
  id: string
  stationId: string
  date: string
  kind: DispatchKind
  periods: OperatingPeriod[]
  note: string
  createdAt: string
}
export const DISPATCH_KIND = { dayAhead: "日前", intraday: "日内" }
const mean = (values: (number | null | undefined)[]) => {
  const valid = values.filter(finite)
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null
}
export function signedPlan(period: OperatingPeriod) {
  return period.mode === "charge"
    ? -period.power
    : period.mode === "discharge"
      ? period.power
      : 0
}
export function dispatchStation(
  station: Station,
  date: string,
  now = new Date(),
) {
  const plan = stationPlan(station, date)
  const { demo, samples } = stationSamples(station, date, now)
  const today = date === operationsDate(now)
  const future = date > operationsDate(now)
  const currentMinute = today
    ? Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) * 15
    : 1425
  const buckets = new Map<number, typeof samples>()
  samples
    .filter((sample) => sample.time <= now.getTime())
    .forEach((sample) => {
      const d = new Date(sample.time)
      const minute = Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) * 15
      buckets.set(minute, [...(buckets.get(minute) ?? []), sample])
    })
  const points: DispatchPoint[] = Array.from({ length: 96 }, (_, i) => {
    const minute = i * 15
    const bucket = buckets.get(minute) ?? []
    // Integrate overlapping durations so off-quarter-hour transitions are not rounded away.
    let covered = 0,
      weighted = 0
    if (!plan.overlap)
      plan.periods.forEach((period) => {
        const overlap = Math.max(
          0,
          Math.min(minute + 15, timeMinute(period.end)) -
            Math.max(minute, timeMinute(period.start)),
        )
        covered += overlap
        weighted += signedPlan(period) * overlap
      })
    const planned =
      mean(bucket.map((sample) => sample.plannedStorage)) ??
      (covered === 15 ? weighted / 15 : null)
    const measured = mean(bucket.map((sample) => sample.storage))
    const actual =
      future || (today && minute > currentMinute)
        ? null
        : demo &&
            today &&
            minute === currentMinute &&
            station.status !== "offline" &&
            station.status !== "building"
          ? station.activePower
          : measured
    return {
      minute,
      planned,
      actual,
      delta: planned !== null && actual !== null ? actual - planned : null,
    }
  })
  const latest = future
    ? (points.find((point) => point.planned !== null) ?? points[0])
    : today
      ? points[currentMinute / 15]
      : (points.filter((point) => point.actual !== null).at(-1) ?? points[95])
  const absolute = latest.delta === null ? null : Math.abs(latest.delta)
  const percent =
    absolute !== null && latest.planned !== null && Math.abs(latest.planned) > 0
      ? (absolute / Math.abs(latest.planned)) * 100
      : null
  const hasPlan = points.some((point) => point.planned !== null)
  const next = today
    ? plan.periods.find(
        (period) =>
          timeMinute(period.start) > now.getHours() * 60 + now.getMinutes(),
      )
    : undefined
  const status =
    station.status === "building"
      ? "建设中"
      : plan.overlap
        ? "计划冲突"
        : station.status === "offline" && today
          ? "数据缺失"
          : !hasPlan
            ? "计划缺口"
            : future
              ? "待执行"
              : latest.actual === null
                ? "数据缺失"
                : absolute !== null &&
                    absolute > Math.max(1, Math.abs(latest.planned ?? 0) * 0.05)
                  ? "需关注"
                  : latest.planned === null
                    ? "计划缺口"
                    : "正常"
  return {
    station,
    date,
    demo: demo || plan.demo,
    points,
    plan,
    current: latest,
    percent,
    hasPlan,
    next,
    status,
    kind: station.operations?.dispatch?.planType ?? "dayAhead",
    version:
      station.operations?.dispatch?.version ??
      (plan.demo ? "示例 V1" : "未提供版本"),
    eligible: station.status !== "building",
    throughMinute: future ? -1 : currentMinute,
  }
}
export type DispatchStation = ReturnType<typeof dispatchStation>

export function dispatchPortfolio(
  rows: DispatchStation[],
  interval: number = 60,
) {
  const plannedRows = rows.filter((row) => row.hasPlan)
  const points = Array.from({ length: 96 }, (_, i): DispatchPoint => {
    const sum = (key: "planned" | "actual") =>
      plannedRows.length &&
      plannedRows.every((row) => finite(row.points[i][key]))
        ? plannedRows.reduce((total, row) => total + row.points[i][key]!, 0)
        : null
    const planned = sum("planned"),
      actual = sum("actual")
    return {
      minute: i * 15,
      planned,
      actual,
      delta: planned !== null && actual !== null ? actual - planned : null,
    }
  })
  const matched = points.filter((point) => point.delta !== null)
  const latest = matched.at(-1)
  const worst = matched.reduce<DispatchPoint | null>(
    (max, point) =>
      !max || Math.abs(point.delta!) > Math.abs(max.delta!) ? point : max,
    null,
  )
  const mae = mean(matched.map((point) => Math.abs(point.delta!)))
  const mse = mean(matched.map((point) => point.delta! ** 2))
  const expected = points.filter(
    (point) =>
      point.planned !== null && point.minute <= (rows[0]?.throughMinute ?? -1),
  ).length
  const grouped: DispatchPoint[] = []
  const size = Math.max(1, Math.floor(interval / 15))
  for (let i = 0; i < 96; i += size) {
    const bucket = points.slice(i, i + size)
    const all = (key: "planned" | "actual") =>
      bucket.every((point) => point[key] !== null)
        ? mean(bucket.map((point) => point[key]))
        : null
    const planned = all("planned"),
      actual = all("actual")
    grouped.push({
      minute: i * 15,
      planned,
      actual,
      delta: planned !== null && actual !== null ? actual - planned : null,
    })
  }
  return {
    points,
    grouped,
    latest,
    worst,
    mae,
    rmse: mse === null ? null : Math.sqrt(mse),
    energy: matched.length
      ? matched.reduce((sum, point) => sum + point.delta! * 0.25, 0)
      : null,
    completeness: expected ? (matched.length / expected) * 100 : null,
  }
}

export function validateDispatchDraft(
  value: unknown,
  stations: Station[],
): Omit<DispatchDraft, "id" | "createdAt"> {
  if (!value || typeof value !== "object")
    throw new Error("计划必须为 JSON 对象")
  const draft = value as Partial<DispatchDraft>
  if (
    !stations.some(
      (station) =>
        station.id === draft.stationId && station.status !== "building",
    )
  )
    throw new Error("请选择可运营的站点")
  if (
    !draft.date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    operationsDate(new Date(`${draft.date}T12:00:00`)) !== draft.date
  )
    throw new Error("计划日期无效")
  if (draft.kind !== "dayAhead" && draft.kind !== "intraday")
    throw new Error("计划类型无效")
  if (
    !Array.isArray(draft.periods) ||
    !draft.periods.length ||
    draft.periods.length > 96
  )
    throw new Error("计划需要 1 至 96 个时段")
  const station = stations.find((station) => station.id === draft.stationId)!
  const periods = draft.periods
    .map((period, i) => {
      if (
        !period ||
        typeof period !== "object" ||
        !finite(period.power) ||
        period.power < 0 ||
        period.power > station.ratedPower ||
        !["charge", "discharge", "standby"].includes(period.mode)
      )
        throw new Error(
          `第 ${i + 1} 个时段的模式或功率无效，功率上限为 ${station.ratedPower} kW`,
        )
      if (
        !(timeMinute(period.start) < timeMinute(period.end)) ||
        timeMinute(period.start) >= 1440
      )
        throw new Error(`第 ${i + 1} 个时段的时间范围无效`)
      if (period.mode === "standby" && period.power !== 0)
        throw new Error(`第 ${i + 1} 个待机时段功率必须为 0`)
      return {
        id: `period-${i + 1}`,
        date: draft.date!,
        start: period.start,
        end: period.end,
        power: period.power,
        mode: period.mode,
      }
    })
    .sort((a, b) => timeMinute(a.start) - timeMinute(b.start))
  if (
    periods.some(
      (period, i) =>
        i > 0 && timeMinute(period.start) < timeMinute(periods[i - 1].end),
    )
  )
    throw new Error("计划时段不能重叠")
  return {
    stationId: draft.stationId!,
    date: draft.date,
    kind: draft.kind,
    periods,
    note: typeof draft.note === "string" ? draft.note.slice(0, 1000) : "",
  }
}
