import type { Station } from "@/App"

type Status = Station["status"]
export type StationTrendRange = "D" | "M" | "Y"
export type RevenueGranularity = "日" | "周" | "月" | "年"
export type RevenueDateRange = {
  start: string
  end: string
}

export const STATUS_META: Record<Status, { label: string, color: string }> = {
  online: { label: "在线", color: "#10b981" },
  fault: { label: "故障", color: "#ef4444" },
  offline: { label: "离线", color: "#76857f" },
  building: { label: "建设中", color: "#1f7a68" },
}

const STATUS_ORDER: Status[] = ["online", "fault", "offline", "building"]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round(value: number, digits = 2) {
  const base = 10 ** digits
  return Math.round(value * base) / base
}

function sumBy(stations: Station[], pick: (station: Station) => number) {
  return stations.reduce((total, station) => total + pick(station), 0)
}

function distribute(total: number, count: number, phase = 0) {
  const weights = Array.from({ length: count }, (_, index) => {
    const t = ((index + phase) / Math.max(1, count - 1)) * Math.PI * 2
    return 0.75 + Math.sin(t) * 0.22 + Math.cos(t * 2.4) * 0.12
  })
  const weightTotal = weights.reduce((value, item) => value + item, 0) || 1
  return weights.map((weight) => round((total * weight) / weightTotal, 2))
}

function stationTrendPointCount(range: StationTrendRange) {
  if (range === "M") return 30
  if (range === "Y") return 12
  return 25
}

function stationTrendLabel(range: StationTrendRange, index: number) {
  if (range === "D") return index === 24 ? "24:00" : `${String(index).padStart(2, "0")}:00`
  if (range === "M") return `${index + 1}日`
  return `${index + 1}月`
}

const DAY_MS = 24 * 60 * 60 * 1000

function formatDateInput(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function addDateInputDays(value: string, days: number) {
  const next = parseDateInput(value)
  next.setDate(next.getDate() + days)
  return formatDateInput(next)
}

function dateRangeDays(range: RevenueDateRange) {
  const start = parseDateInput(range.start)
  const end = parseDateInput(range.end)
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.max(1, Math.floor((endUtc - startUtc) / DAY_MS) + 1)
}

export function getDefaultRevenueDateRange(
  granularity: RevenueGranularity = "日",
  referenceDate = new Date(),
): RevenueDateRange {
  const end = new Date(referenceDate)
  const start = new Date(referenceDate)

  if (granularity === "周") {
    const mondayOffset = (end.getDay() + 6) % 7
    start.setDate(end.getDate() - mondayOffset)
  } else if (granularity === "月") {
    start.setDate(1)
  } else if (granularity === "年") {
    start.setMonth(0, 1)
  }

  return {
    start: formatDateInput(start),
    end: formatDateInput(end),
  }
}

function monthCount(range: RevenueDateRange) {
  const start = parseDateInput(range.start)
  const end = parseDateInput(range.end)
  return Math.max(
    1,
    (end.getFullYear() - start.getFullYear()) * 12 +
      end.getMonth() -
      start.getMonth() +
      1,
  )
}

function yearCount(range: RevenueDateRange) {
  const start = parseDateInput(range.start)
  const end = parseDateInput(range.end)
  return Math.max(1, end.getFullYear() - start.getFullYear() + 1)
}

function revenuePointCount(
  granularity: RevenueGranularity,
  range: RevenueDateRange,
) {
  if (granularity === "年") return Math.min(18, monthCount(range))
  return Math.min(31, dateRangeDays(range))
}

function revenueDetailDates(range: RevenueDateRange) {
  const middleOffset = Math.round((dateRangeDays(range) - 1) / 2)
  return [
    range.start,
    addDateInputDays(range.start, middleOffset),
    range.end,
  ]
}

function revenueScale(granularity: RevenueGranularity) {
  if (granularity === "周") return 1.8
  if (granularity === "月") return 4.6
  if (granularity === "年") return 18
  return 1
}

type RevenueTrendPoint = {
  date: string
  settled: number
  pending: number
  est: number
  isCurrent?: boolean
}

type RevenueSourceTotals = {
  peakValley: number
  demand: number
  pv: number
  vpp: number
  penalty: number
}

type RevenueHistoryPoint = NonNullable<Station["revenueHistory"]>[number]
type RevenueBucketWindow = {
  start: Date
  end: Date
  label: string
}

function numeric(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function historyBucketLabel(value: Date, granularity: RevenueGranularity) {
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  if (granularity === "年") {
    return `${value.getFullYear()}-${month}`
  }
  return `${month}-${day}`
}

function normalizeHistoryPoint(point: RevenueHistoryPoint) {
  const hasStatusValues =
    point.settled !== undefined ||
    point.pending !== undefined ||
    point.est !== undefined
  const sourceTotal =
    numeric(point.peakValley) +
    numeric(point.demand) +
    numeric(point.pv) +
    numeric(point.vpp) +
    numeric(point.penalty)
  const inferredAmount = numeric(point.amount) || Math.max(0, sourceTotal)

  return {
    settled: hasStatusValues ? Math.max(0, numeric(point.settled)) : 0,
    pending: hasStatusValues ? Math.max(0, numeric(point.pending)) : 0,
    est: hasStatusValues ? Math.max(0, numeric(point.est)) : inferredAmount,
    source: {
      peakValley: numeric(point.peakValley),
      demand: numeric(point.demand),
      pv: numeric(point.pv),
      vpp: numeric(point.vpp),
      penalty: numeric(point.penalty),
    },
    hasSourceValues:
      point.peakValley !== undefined ||
      point.demand !== undefined ||
      point.pv !== undefined ||
      point.vpp !== undefined ||
      point.penalty !== undefined,
  }
}

function historyPointTotal(point: RevenueHistoryPoint) {
  const normalized = normalizeHistoryPoint(point)
  return normalized.settled + normalized.pending + normalized.est
}

function sumHistoryRange(history: RevenueHistoryPoint[], range: RevenueDateRange) {
  return history.reduce((total, point) => {
    const date = point.date.slice(0, 10)
    if (date < range.start || date > range.end) return total
    return total + historyPointTotal(point)
  }, 0)
}

function previousRevenueDateRange(
  granularity: RevenueGranularity,
  range: RevenueDateRange,
): RevenueDateRange {
  const start = parseDateInput(range.start)
  const end = parseDateInput(range.end)

  if (granularity === "年") {
    const previousStart = new Date(start)
    const previousEnd = new Date(end)
    previousStart.setFullYear(previousStart.getFullYear() - 1)
    previousEnd.setFullYear(previousEnd.getFullYear() - 1)
    return {
      start: formatDateInput(previousStart),
      end: formatDateInput(previousEnd),
    }
  }

  if (granularity === "月") {
    const previousStart = new Date(start)
    const previousEnd = new Date(end)
    previousStart.setMonth(previousStart.getMonth() - 1)
    previousEnd.setMonth(previousEnd.getMonth() - 1)
    return {
      start: formatDateInput(previousStart),
      end: formatDateInput(previousEnd),
    }
  }

  const days = dateRangeDays(range)
  const previousEnd = new Date(start)
  previousEnd.setDate(previousEnd.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousStart.getDate() - days + 1)
  return {
    start: formatDateInput(previousStart),
    end: formatDateInput(previousEnd),
  }
}

function buildRevenueBucketWindows(
  granularity: RevenueGranularity,
  dateRange: RevenueDateRange,
) {
  const start = parseDateInput(dateRange.start)
  const end = parseDateInput(dateRange.end)
  const pointCount = revenuePointCount(granularity, dateRange)

  if (granularity === "年") {
    return Array.from({ length: pointCount }, (_, index) => {
      const bucketStart = new Date(start)
      bucketStart.setDate(1)
      bucketStart.setMonth(bucketStart.getMonth() + index)

      const bucketEnd = new Date(bucketStart)
      bucketEnd.setMonth(bucketEnd.getMonth() + 1, 0)

      return {
        start: bucketStart < start ? start : bucketStart,
        end: bucketEnd > end ? end : bucketEnd,
        label: historyBucketLabel(bucketStart, granularity),
      }
    })
  }

  const totalDays = dateRangeDays(dateRange)
  return Array.from({ length: pointCount }, (_, index) => {
    const startOffset = Math.floor((index * totalDays) / pointCount)
    const endOffset = Math.max(
      startOffset,
      Math.floor(((index + 1) * totalDays) / pointCount) - 1,
    )
    return {
      start: parseDateInput(addDateInputDays(dateRange.start, startOffset)),
      end: parseDateInput(
        addDateInputDays(dateRange.start, Math.min(totalDays - 1, endOffset)),
      ),
      label: historyBucketLabel(
        parseDateInput(addDateInputDays(dateRange.start, startOffset)),
        granularity,
      ),
    }
  })
}

function buildConnectedRevenueTrend(
  station: Station,
  granularity: RevenueGranularity,
  dateRange: RevenueDateRange,
) {
  const history = station.revenueHistory
  if (!history?.length) return null

  const sourceTotals: RevenueSourceTotals = {
    peakValley: 0,
    demand: 0,
    pv: 0,
    vpp: 0,
    penalty: 0,
  }
  let hasSourceValues = false

  const windows = buildRevenueBucketWindows(granularity, dateRange)
  const currentDate = parseDateInput(formatDateInput(new Date()))
  const data = windows.map((window) => ({
    date: window.label,
    settled: 0,
    pending: 0,
    est: 0,
    isCurrent: window.start <= currentDate && window.end >= currentDate,
    bucketStart: window.start,
    bucketEnd: window.end,
    source: {
      peakValley: 0,
      demand: 0,
      pv: 0,
      vpp: 0,
      penalty: 0,
    },
  }))

  history.forEach((point) => {
    const pointDate = point.date.slice(0, 10)
    if (pointDate < dateRange.start || pointDate > dateRange.end) return

    const parsedDate = parseDateInput(pointDate)
    const bucket = data.find(
      (candidate) => parsedDate >= candidate.bucketStart &&
        parsedDate <= candidate.bucketEnd,
    )
    if (!bucket) return
    const normalized = normalizeHistoryPoint(point)
    bucket.settled += normalized.settled
    bucket.pending += normalized.pending
    bucket.est += normalized.est
    bucket.source.peakValley += normalized.source.peakValley
    bucket.source.demand += normalized.source.demand
    bucket.source.pv += normalized.source.pv
    bucket.source.vpp += normalized.source.vpp
    bucket.source.penalty += normalized.source.penalty

    sourceTotals.peakValley += normalized.source.peakValley
    sourceTotals.demand += normalized.source.demand
    sourceTotals.pv += normalized.source.pv
    sourceTotals.vpp += normalized.source.vpp
    sourceTotals.penalty += normalized.source.penalty
    hasSourceValues ||= normalized.hasSourceValues
  })

  return {
    data: data.map(({ bucketStart: _bucketStart, bucketEnd: _bucketEnd, source: _source, ...point }) => point),
    sourceTotals,
    hasSourceValues,
  }
}

export function parseCurrency(value: string) {
  if (!value || value.trim() === "—") return 0
  const normalized = value.replace(/[^\d.-]/g, "")
  const result = Number(normalized)
  return Number.isFinite(result) ? result : 0
}

export function formatCompactCurrency(value: number) {
  if (value >= 10000) return `¥${(value / 1000).toFixed(2)}k`
  return `¥${value.toFixed(2)}`
}

export function buildStatusItems(stations: Station[]) {
  const counts = STATUS_ORDER.reduce(
    (result, status) => ({ ...result, [status]: 0 }),
    {} as Record<Status, number>,
  )
  stations.forEach((station) => {
    counts[station.status] += 1
  })

  return STATUS_ORDER.map((status) => ({
    status,
    ...STATUS_META[status],
    count: counts[status],
  }))
}

export function buildDeviceSummary(stations: Station[]) {
  const total = sumBy(
    stations,
    (station) =>
      station.devices.online +
      station.devices.fault +
      station.devices.offline +
      station.devices.building,
  )
  const online = sumBy(stations, (station) => station.devices.online)

  return {
    total,
    online,
    onlinePct: total ? Math.round((online / total) * 100) : 0,
  }
}

export function buildStorageTrend(stations: Station[], range: "today" | "month") {
  const labels =
    range === "today"
      ? ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"]
      : ["1", "5", "10", "15", "20", "25", "30"]
  const storageMwh = Math.max(0.1, sumBy(stations, (station) => station.storageCapacity))
  const activeMw = Math.max(0, sumBy(stations, (station) => station.activePower) / 1000)
  const averageSoc = stations.length
    ? sumBy(stations, (station) => station.soc) / stations.length
    : 0
  const rangeScale = range === "today" ? 1 : 28
  const chargeTotal = (storageMwh * (1.15 - averageSoc / 180) + activeMw * 1.8) * rangeScale
  const dischargeTotal = (storageMwh * (0.45 + averageSoc / 160) + activeMw * 1.25) * rangeScale
  const charge = distribute(Math.max(0, chargeTotal), labels.length, 0.1)
  const discharge = distribute(Math.max(0, dischargeTotal), labels.length, 0.38)

  return labels.map((h, index) => ({
    h,
    charge: charge[index],
    discharge: discharge[index],
  }))
}

export function summarizeTrend(data: { charge: number, discharge: number }[]) {
  return {
    charge: round(data.reduce((total, item) => total + item.charge, 0), 2),
    discharge: round(data.reduce((total, item) => total + item.discharge, 0), 2),
  }
}

export function buildEnvironmentalMetrics(stations: Station[]) {
  const month = summarizeTrend(buildStorageTrend(stations, "month"))
  const mwh = month.discharge

  return [
    { kind: "co2", value: round(mwh * 0.57, 1), unit: "t", label: "CO2减排" },
    { kind: "coal", value: round(mwh * 0.185, 1), unit: "t", label: "标准煤" },
    { kind: "tree", value: Math.round(mwh * 31.6), unit: "棵", label: "等效植树" },
  ]
}

export function buildCapacityItems(stations: Station[]) {
  const runningStations = stations.filter(
    (station) => station.status === "online" || station.status === "fault",
  )
  const ratedMw = sumBy(stations, (station) => station.ratedPower) / 1000
  const runningRatedMw = sumBy(runningStations, (station) => station.ratedPower) / 1000
  const pvOutput = sumBy(runningStations, (station) => station.pvOutput)
  const storageTotal = sumBy(stations, (station) => station.storageCapacity)
  const storageRunning = sumBy(runningStations, (station) => station.storageCapacity)

  return [
    {
      label: "发电机组",
      value: round(sumBy(runningStations, (station) => station.generator), 2),
      total: round(Math.max(ratedMw, runningRatedMw), 2),
      unit: "MW",
      pct: ratedMw ? Math.round((runningRatedMw / ratedMw) * 100) : 0,
      color: "#1f7a68",
    },
    {
      label: "光伏系统",
      value: round(pvOutput, 2),
      total: round(Math.max(pvOutput / 0.82, pvOutput), 2),
      unit: "MWp",
      pct: pvOutput ? 82 : 0,
      color: "#4f8f7e",
    },
    {
      label: "储能系统",
      value: round(storageRunning, 2),
      total: round(storageTotal, 2),
      unit: "MWh",
      pct: storageTotal ? Math.round((storageRunning / storageTotal) * 100) : 0,
      color: "#78aa9b",
    },
  ]
}

export function buildEnergyMix(stations: Station[]) {
  return [
    {
      name: "光伏(Solar)",
      value: round(sumBy(stations, (station) => station.pvOutput), 2),
      color: "#1f7a68",
    },
    {
      name: "电网(Grid)",
      value: round(sumBy(stations, (station) => station.activePower) / 1000, 2),
      color: "#78aa9b",
    },
    {
      name: "发电机(Gen)",
      value: round(sumBy(stations, (station) => station.generator), 2),
      color: "#dcebe4",
    },
  ]
}

export function buildRevenueSeries(stations: Station[]) {
  const totalRevenue = sumBy(stations, (station) => parseCurrency(station.revenue))
  const values = distribute(Math.max(0, totalRevenue * 0.015), 7, 0.52)
  return values.map((v, index) => ({ d: index + 1, v: round(v, 2) }))
}

export function buildRevenueSummary(stations: Station[]) {
  const series = buildRevenueSeries(stations)
  const cumulative = sumBy(stations, (station) => parseCurrency(station.revenue))
  return {
    yesterday: series[series.length - 1]?.v ?? 0,
    cumulative,
  }
}

export function buildGlobalAlerts(stations: Station[]) {
  return stations
    .flatMap((station) =>
      station.alerts.map((alert) => ({
        site: station.shortName || station.name,
        msg: alert.msg,
        time: alert.time,
        level: alert.level,
      })),
    )
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "critical" ? -1 : 1))
}

export function buildSubsystems(stations: Station[]) {
  const totalStations = Math.max(1, stations.length)
  const pvAvailable =
    (stations.filter((station) => station.pvOutput > 0 && station.dataStatus !== "disconnected")
      .length /
      totalStations) *
    100
  const storageEfficiency = clamp(
    86 +
      (stations.length
        ? sumBy(stations, (station) => station.soc) / stations.length / 10
        : 0),
    0,
    99.9,
  )
  const generatorAvailable =
    (stations.filter((station) => station.generator > 0 && station.status !== "offline").length /
      totalStations) *
    100

  return [
    { label: "光伏可用率", value: `${pvAvailable.toFixed(2)}%`, color: "#10b981" },
    { label: "储能充放效率", value: `${storageEfficiency.toFixed(2)}%`, color: "#1f7a68" },
    {
      label: "发电机组可用率",
      value: `${generatorAvailable.toFixed(2)}%`,
      color: generatorAvailable >= 80 ? "#10b981" : "#f97316",
    },
  ]
}

export function buildStationPowerData(station: Station, range: StationTrendRange = "D") {
  const activeMw = Math.max(0, station.activePower / 1000)
  const pvMw = Math.max(0, station.pvOutput)
  const storageMwh = Math.max(0, station.storageCapacity)
  const generatorMw = Math.max(0, station.generator)
  const pointCount = stationTrendPointCount(range)
  const rangeScale = range === "D" ? 1 : range === "M" ? 0.86 : 0.72

  return Array.from({ length: pointCount }, (_, h) => {
    if (h === pointCount - 1) {
      return {
        time: stationTrendLabel(range, h),
        load: round(activeMw, 2),
        grid: round(Math.max(0, activeMw - pvMw - generatorMw), 2),
        storage: round(((station.soc - 50) / 100) * storageMwh, 2),
      }
    }

    const t = (h / Math.max(1, pointCount - 1)) * Math.PI * 2
    const loadShape = 0.88 + Math.sin(t - 0.85) * 0.18 + Math.cos(t * 2) * 0.08
    const pvShape = Math.max(0, Math.sin(((h - 6) / 12) * Math.PI))
    const storageShape = Math.sin(t + station.soc / 100)

    const load = activeMw * loadShape * rangeScale
    const pv = pvMw * (range === "D" ? pvShape : 0.68 + Math.sin(t - 0.2) * 0.2)
    const grid = Math.max(0, load - pv - generatorMw * 0.35)
    const storage = storageMwh * 0.18 * storageShape * rangeScale

    return {
      time: stationTrendLabel(range, h),
      load: round(Math.max(0, load), 2),
      grid: round(grid, 2),
      storage: round(storage, 2),
    }
  })
}

export function buildStationSocData(station: Station, range: StationTrendRange = "D") {
  const targetSoc = clamp(station.soc, 0, 100)
  const pointCount = stationTrendPointCount(range)
  const drift = range === "D" ? 0.65 : range === "M" ? 0.28 : 1.6

  return Array.from({ length: pointCount }, (_, h) => {
    if (h === pointCount - 1) return { time: stationTrendLabel(range, h), soc: round(targetSoc, 1) }

    const distance = pointCount - 1 - h
    const t = (h / Math.max(1, pointCount - 1)) * Math.PI * 2
    const profile = targetSoc - distance * drift + Math.sin(t * 2) * 4

    return {
      time: stationTrendLabel(range, h),
      soc: round(clamp(profile, 0, 100), 1),
    }
  })
}

export function buildStationRevenueModel(
  station: Station,
  granularity: RevenueGranularity = "日",
  dateRange = getDefaultRevenueDateRange(granularity),
) {
  const parsedRevenue = parseCurrency(station.revenue)
  const estimatedRevenue =
    station.activePower * 5.2 + station.storageCapacity * 2800 + station.pvOutput * 900
  const connectedTrend = buildConnectedRevenueTrend(station, granularity, dateRange)
  const trendDataSource = connectedTrend ? "connected" as const : "estimated" as const
  const defaultDays = dateRangeDays(getDefaultRevenueDateRange(granularity))
  const selectedDays = dateRangeDays(dateRange)
  const start = parseDateInput(dateRange.start)
  const end = parseDateInput(dateRange.end)
  const dateSeed =
    start.getFullYear() * 13 +
    (start.getMonth() + 1) * 17 +
    start.getDate() * 19 +
    end.getFullYear() * 7 +
    (end.getMonth() + 1) * 11 +
    end.getDate() * 5
  const dateSignal = 0.92 + ((Math.sin(dateSeed * 0.19) + 1) / 2) * 0.14
  const rangeSignal = (selectedDays / defaultDays) * dateSignal
  const fallbackTotal = Math.max(
    0,
    Math.round((parsedRevenue || estimatedRevenue) * revenueScale(granularity) * rangeSignal),
  )
  const fallbackWindows = buildRevenueBucketWindows(granularity, dateRange)
  const fallbackValues = distribute(fallbackTotal, fallbackWindows.length, 0.31)
  const currentDate = parseDateInput(formatDateInput(new Date()))
  const currentBucketIndex = fallbackWindows.findIndex(
    (window) => window.start <= currentDate && window.end >= currentDate,
  )
  const fallbackDailyData: RevenueTrendPoint[] = fallbackValues.map((value, index) => ({
    date: fallbackWindows[index].label,
    settled:
      currentBucketIndex === -1 || index < currentBucketIndex - 1
        ? Math.round(value)
        : 0,
    pending: index === currentBucketIndex - 1 ? Math.round(value) : 0,
    est: index === currentBucketIndex ? Math.round(value) : 0,
    isCurrent:
      fallbackWindows[index].start <= currentDate &&
      fallbackWindows[index].end >= currentDate,
  }))
  const dailyData = connectedTrend?.data ?? fallbackDailyData
  const settled = Math.round(
    dailyData.reduce((total, point) => total + point.settled, 0),
  )
  const pending = Math.round(
    dailyData.reduce((total, point) => total + point.pending, 0),
  )
  const est = Math.round(
    dailyData.reduce((total, point) => total + point.est, 0),
  )
  const periodTotal = settled + pending + est
  const sourceBase = Math.max(1, periodTotal)
  const fallbackSources: RevenueSourceTotals = {
    peakValley: Math.round(sourceBase * 0.52),
    demand: Math.round(sourceBase * 0.18),
    pv: Math.round(sourceBase * 0.16),
    vpp: Math.round(sourceBase * 0.07),
    penalty: -Math.round(sourceBase * 0.03),
  }
  const sourceTotals =
    connectedTrend?.hasSourceValues ? connectedTrend.sourceTotals : fallbackSources
  const detailDates = revenueDetailDates(dateRange)
  const sources = [
    { label: "峰谷套利", value: sourceTotals.peakValley, color: "#2a806e" },
    { label: "需量节省", value: sourceTotals.demand, color: "#1f7a68" },
    { label: "光伏盈用", value: sourceTotals.pv, color: "#f59e0b" },
    { label: "VPP响应", value: sourceTotals.vpp, color: "#10b981" },
    { label: "罚款与调差", value: sourceTotals.penalty, color: "#ef4444" },
  ]
  const connectedDetailRows =
    station.revenueHistory
      ?.filter((point) => {
        const date = point.date.slice(0, 10)
        return date >= dateRange.start && date <= dateRange.end
      })
      .map((point) => {
        const normalized = normalizeHistoryPoint(point)
        const net =
          normalized.settled + normalized.pending + normalized.est
        return {
          date: point.date.slice(0, 10),
          peakValley: Math.round(normalized.source.peakValley || net),
          demand: Math.round(normalized.source.demand),
          pv: Math.round(normalized.source.pv),
          vpp: Math.round(normalized.source.vpp),
          penalty: Math.round(normalized.source.penalty),
          net: Math.round(net),
          status:
            normalized.est > 0
              ? "当日暂估" as const
              : normalized.pending > 0
                ? "待结算" as const
                : "已结算" as const,
          meterStatus:
            station.dataStatus === "connected"
              ? "计量正常"
              : station.dataStatus === "disconnected"
                ? "数据中断"
                : "需核验",
          strategy: station.mode || "削峰填谷",
          tariffVersion: "PKG-TOU-202609",
          settlementVersion: `PKG-${point.date.replace(/-/g, "")}`,
        }
      }) ?? []
  const fallbackDetailRows = [
    {
      date: detailDates[0],
      peakValley: Math.round(settled * 0.62),
      demand: Math.round(settled * 0.18),
      pv: Math.round(settled * 0.14),
      vpp: Math.round(settled * 0.04),
      penalty: -Math.round(settled * 0.02),
      net: settled,
      status: "已结算" as const,
      meterStatus: station.dataStatus === "connected" ? "计量正常" : "需核验",
      strategy: station.mode || "削峰填谷",
      tariffVersion: "TOU-2026.09",
      settlementVersion: `SET-${dateRange.end.replace(/-/g, "")}-01`,
    },
    {
      date: detailDates[1],
      peakValley: Math.round(pending * 0.58),
      demand: Math.round(pending * 0.2),
      pv: Math.round(pending * 0.13),
      vpp: Math.round(pending * 0.07),
      penalty: -Math.round(pending * 0.02),
      net: pending,
      status: "待结算" as const,
      meterStatus: station.dataStatus === "disconnected" ? "数据中断" : "计量正常",
      strategy: station.mode || "削峰填谷",
      tariffVersion: "TOU-2026.09",
      settlementVersion: `SET-${dateRange.end.replace(/-/g, "")}-02`,
    },
    {
      date: detailDates[2],
      peakValley: Math.round(est * 0.61),
      demand: Math.round(est * 0.18),
      pv: Math.round(est * 0.15),
      vpp: Math.round(est * 0.03),
      penalty: -Math.round(est * 0.03),
      net: est,
      status: "当日暂估" as const,
      meterStatus: station.dataStatus === "connected" ? "实时采集" : "数据延迟",
      strategy: station.mode || "削峰填谷",
      tariffVersion: "TOU-2026.09",
      settlementVersion: `EST-${dateRange.end.replace(/-/g, "")}-03`,
    },
  ]
  const detailRows = connectedDetailRows.length
    ? connectedDetailRows
    : fallbackDetailRows
  const previousRange = previousRevenueDateRange(granularity, dateRange)
  const previousConnectedTotal = station.revenueHistory?.length
    ? sumHistoryRange(station.revenueHistory, previousRange)
    : 0
  const previousTotal = previousConnectedTotal || Math.round(fallbackTotal * 0.914)
  const changePct = previousTotal
    ? round(((periodTotal - previousTotal) / previousTotal) * 100, 1)
    : 0
  const positiveSources = Math.max(
    0,
    sourceTotals.peakValley +
      sourceTotals.demand +
      sourceTotals.pv +
      sourceTotals.vpp,
  )
  const latestHistoryDate = station.revenueHistory
    ?.map((point) => point.date.slice(0, 10))
    .sort()
    .at(-1)

  return {
    settled,
    pending,
    est,
    monthly: settled + pending + est,
    netRevenue: periodTotal,
    grossRevenue: positiveSources,
    adjustment: Math.abs(sourceTotals.penalty),
    settlementRate: periodTotal ? Math.round((settled / periodTotal) * 100) : 0,
    unsettledAmount: pending + est,
    dataFreshness: {
      label: station.dataStatus === "connected" ? "实时同步" : station.dataStatus === "partial" ? "部分同步" : "数据中断",
      detail: station.updateTime || "等待更新",
      latestDate: latestHistoryDate || dateRange.end,
    },
    meterStatus: station.dataStatus === "connected" ? "计量链路正常" : station.dataStatus === "partial" ? "存在待核验点位" : "计量链路中断",
    strategy: station.mode || "削峰填谷",
    tariffVersion: "TOU-2026.09",
    settlementVersion: `SET-${dateRange.end.replace(/-/g, "")}`,
    comparison: {
      previousTotal,
      changePct,
    },
    sources,
    detailRows,
    dailyData,
    trendDataSource,
  }
}
