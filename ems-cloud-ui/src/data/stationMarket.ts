import type { Station } from "@/App"
import {
  finite,
  minuteLabel,
  operationsDate,
  sumKnown,
  timeMinute,
  type MarketService,
} from "./operations"

export const MARKET_KINDS = {
  response: "需求响应",
  arbitrage: "日前套利",
  reserve: "备用容量",
  vpp: "VPP",
} as const
export type MarketKind = keyof typeof MARKET_KINDS
export type MarketQualification = {
  kind: MarketKind
  status: "valid" | "pending" | "expired" | "suspended"
  validUntil?: string
  reference?: string
}
export type MarketCapacity = {
  timestamp: string
  up: number | null
  down: number | null
  occupied: number | null
  durationHours: number | null
  constraint?: string
}
export type MarketResource = {
  source?: "demo" | "connected"
  portfolio?: string
  area?: string
  qualifications?: MarketQualification[]
  capacity?: MarketCapacity | null
  capacityByDate?: Record<string, MarketCapacity | null>
  prices?: {
    timestamp: string
    price: number | null
  }[]
}
export type MarketApplication = {
  id: string
  stationId: string
  date: string
  kind: MarketKind
  direction: "up" | "down"
  start: string
  end: string
  capacity: number
  note: string
  createdAt: string
}
export const QUALIFICATION_NAMES = {
  valid: "有效",
  pending: "待审核",
  expired: "已过期",
  suspended: "已暂停",
}
export const marketKind = (service: MarketService): MarketKind | null =>
  service.kind ??
  (Object.keys(MARKET_KINDS) as MarketKind[]).find(
    (kind) => MARKET_KINDS[kind] === service.name,
  ) ??
  null
const amount = (value: unknown) => (finite(value) && value >= 0 ? value : null)
const dayTimestamp = (date: string, minute: number) =>
  `${date}T${minuteLabel(minute)}:00`

function demoResource(
  station: Station,
  date: string,
  now: Date,
): MarketResource {
  const available =
    station.status !== "offline" &&
    station.status !== "building" &&
    station.dataStatus !== "disconnected"
  const occupied = station.ratedPower * 0.16
  const up = Math.max(
    0,
    station.ratedPower * 0.85 * Math.max(0, (station.soc - 15) / 85) - occupied,
  )
  const down = Math.max(
    0,
    station.ratedPower * 0.85 * Math.max(0, (95 - station.soc) / 95),
  )
  return {
    source: "demo",
    portfolio:
      station.type === "BESS" ? "工商业储能组合" : `${station.type}组合`,
    area: station.region,
    qualifications:
      station.status === "building"
        ? [{ kind: "response", status: "pending" }]
        : (Object.keys(MARKET_KINDS) as MarketKind[]).map((kind) => ({
            kind,
            status: "valid",
            reference: `DEMO-${station.code}`,
          })),
    capacity:
      date <= operationsDate(now)
        ? {
            timestamp:
              date === operationsDate(now)
                ? now.toISOString()
                : `${date}T23:59:00`,
            up: available ? up : null,
            down: available ? down : null,
            occupied: available ? occupied : null,
            durationHours: available
              ? Math.max(
                  0.25,
                  (station.storageCapacity *
                    1000 *
                    Math.max(0, station.soc - 15)) /
                    100 /
                    Math.max(up, 1),
                )
              : null,
            constraint:
              station.status === "offline"
                ? "数据质量不足"
                : station.status === "fault"
                  ? "PCS 降额"
                  : station.dataStatus === "partial"
                    ? "部分数据缺失"
                    : "",
          }
        : null,
    prices:
      date <= operationsDate(now)
        ? Array.from({ length: 96 }, (_, i) => ({
            timestamp: dayTimestamp(date, i * 15),
            price: Math.round(
              340 +
                180 * Math.sin(((i - 20) / 96) * Math.PI * 2) +
                (i >= 32 && i < 56 ? 230 : 0) +
                (i >= 72 && i < 84 ? 240 : 0),
            ),
          }))
        : [],
  }
}

function demoServices(
  station: Station,
  date: string,
  now: Date,
): MarketService[] {
  if (
    station.status === "offline" ||
    station.status === "building" ||
    date > operationsDate(now)
  )
    return []
  return ([
    {
      kind: "response",
      start: "14:00",
      end: "16:00",
      rate: 0.32,
      revenue: 360,
    },
    {
      kind: "arbitrage",
      start: "18:00",
      end: "20:00",
      rate: 0.24,
      revenue: 180,
    },
    { kind: "reserve", start: "00:00", end: "24:00", rate: 0.12, revenue: 70 },
  ] as const).map((item, index) => {
    const currentMinute =
      date === operationsDate(now)
        ? now.getHours() * 60 + now.getMinutes()
        : 1440
    const start = timeMinute(item.start),
      end = timeMinute(item.end)
    const capacity = Math.round(station.ratedPower * item.rate)
    return {
      id: `${station.id}-${item.kind}`,
      eventId: `demo-${item.kind}`,
      date,
      kind: item.kind,
      name: MARKET_KINDS[item.kind],
      start: item.start,
      end: item.end,
      capacity,
      revenue: Math.round((capacity * item.revenue) / 100),
      status:
        currentMinute < start
          ? "待执行"
          : currentMinute >= end
            ? "已完成"
            : "执行中",
      attention:
        item.kind === "reserve" && station.status === "fault"
          ? "可用容量受设备降额限制"
          : undefined,
      delivery:
        item.kind === "reserve"
          ? []
          : Array.from({ length: (end - start) / 15 }, (_, i) => ({
              timestamp: dayTimestamp(date, start + i * 15),
              power: Math.round(
                Math.min(capacity, Math.max(0, station.activePower)) *
                  (0.88 + 0.08 * Math.sin(i / 2 + index)),
              ),
            })).filter((p) => Date.parse(p.timestamp) <= now.getTime()),
    }
  })
}

export function marketStation(
  station: Station,
  date: string,
  now = new Date(),
) {
  const demo =
    station.operations === undefined ||
    station.operations.market?.source === "demo" ||
    station.operations.source === "demo"
  const resource =
    station.operations?.market ?? (demo ? demoResource(station, date, now) : {})
  const qualifications = (resource.qualifications ?? [])
    .map((q) => ({
      ...q,
      status:
        q.validUntil && q.validUntil < date ? "expired" as const : q.status,
    }))
    .filter((q) => q.kind in MARKET_KINDS && q.status in QUALIFICATION_NAMES)
  const sourceCapacity =
    resource.capacityByDate?.[date] ?? resource.capacity
  const time = sourceCapacity ? Date.parse(sourceCapacity.timestamp) : NaN
  const capacityValid =
    sourceCapacity &&
    Number.isFinite(time) &&
    operationsDate(new Date(time)) === date &&
    (demo || time <= now.getTime())
  const offline = date === operationsDate(now) && (station.status === "offline" || station.status === "building")
  const stale =
    capacityValid &&
    !demo &&
    date === operationsDate(now) &&
    now.getTime() - time > 15 * 60 * 1000
  const capacity = capacityValid
    ? {
        ...sourceCapacity,
        up: offline || stale ? null : amount(sourceCapacity.up),
        down: offline || stale ? null : amount(sourceCapacity.down),
        occupied: amount(sourceCapacity.occupied),
        durationHours: amount(sourceCapacity.durationHours),
      }
    : null
  const services = (
    station.operations?.marketServices ??
    (demo ? demoServices(station, date, now) : [])
  ).filter((s) => s.date === date)
  return {
    station,
    demo,
    date,
    portfolio: resource.portfolio ?? station.project,
    area: resource.area ?? station.region,
    qualifications,
    capacity,
    services,
    prices: resource.prices ?? [],
    constraint: stale
      ? "能力数据已过期"
      : offline
        ? "数据质量不足"
        : capacity?.constraint ||
          (!capacity || capacity.up === null ? "可用能力未接入" : ""),
    validKinds: qualifications
      .filter((q) => q.status === "valid")
      .map((q) => q.kind),
  }
}
export type MarketStation = ReturnType<typeof marketStation>
export type PortfolioService = {
  key: string
  name: string
  kind: MarketKind | null
  start: number | null
  end: number | null
  members: {
    row: MarketStation
    service: MarketService
  }[]
  capacity: number | null
  revenue: number | null
  status: string
  attention: string
  demo: boolean
}

export function marketServices(
  rows: MarketStation[],
  kind = "",
): PortfolioService[] {
  const grouped = new Map<string, PortfolioService["members"]>()
  rows.forEach((row) =>
    row.services
      .filter((service) => !kind || marketKind(service) === kind)
      .forEach((service) => {
        const key = service.eventId
          ? `${row.area}:${service.date}:${service.eventId}:${service.start ?? ""}:${service.end ?? ""}`
          : `${row.station.id}:${service.id}`
        grouped.set(key, [...(grouped.get(key) ?? []), { row, service }])
      }),
  )
  return [...grouped]
    .map(([key, members]) => {
      const first = members[0].service
      const start = timeMinute(first.start ?? ""),
        end = timeMinute(first.end ?? "")
      const cancelled = members.every((m) => m.service.status === "已取消")
      const active = members.filter((m) => m.service.status !== "已取消")
      return {
        key,
        name: first.name,
        kind: marketKind(first),
        start: Number.isFinite(start) && start < end ? start : null,
        end: Number.isFinite(end) && start < end ? end : null,
        members,
        capacity: sumKnown(active.map((m) => amount(m.service.capacity))),
        revenue: sumKnown(
          active.map((m) =>
            finite(m.service.revenue) ? m.service.revenue : null,
          ),
        ),
        status: cancelled
          ? "已取消"
          : active.some((m) => m.service.status === "执行中")
            ? "正在交付"
            : active.every((m) => m.service.status === "已完成")
              ? "已完成"
              : "等待开始",
        attention: active
          .map((m) => m.service.attention)
          .filter(Boolean)
          .join(" · "),
        demo: members.some((m) => m.row.demo),
      }
    })
    .sort((a, b) => (a.start === 0 && a.end === 1440 ? 1440 : a.start ?? 1440) - (b.start === 0 && b.end === 1440 ? 1440 : b.start ?? 1440))
}

export function marketTimeline(
  rows: MarketStation[],
  services: PortfolioService[],
  date: string,
  now = new Date(),
) {
  const observations = new Map<number, (number | null)[]>()
  rows.forEach((row) => {
    const source = new Map<number, number | null>()
    row.prices.forEach((sample) => {
      const time = Date.parse(sample.timestamp)
      if (Number.isFinite(time) && operationsDate(new Date(time)) === date)
        source.set(time, finite(sample.price) ? sample.price : null)
    })
    source.forEach((price, time) => {
      observations.set(time, [...(observations.get(time) ?? []), price])
    })
  })
  const priceMap = new Map<number, (number | null)[]>()
  observations.forEach((values, time) => {
    const d = new Date(time), minute = Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) * 15
    const price = values.every(value => finite(value) && value === values[0]) ? values[0] : null
    priceMap.set(minute, [...(priceMap.get(minute) ?? []), price])
  })
  return Array.from({ length: 96 }, (_, i) => {
    const minute = i * 15
    const prices = priceMap.get(minute) ?? []
    // Prices are shared market observations, not additive station revenue.
    const price =
      prices.length && prices.every(finite) ? prices.reduce((sum, price) => sum + price!, 0) / prices.length : null
    const matching = services.filter(
      (s) =>
        s.start !== null &&
        s.end !== null &&
        minute >= s.start &&
        minute < s.end &&
        s.status !== "已取消" &&
        s.kind !== "reserve",
    )
    const committed = matching.length
      ? sumKnown(matching.map((s) => s.capacity))
      : null
    const power = matching.flatMap((s) =>
      s.members
        .filter((m) => m.service.status !== "已取消")
        .map(({ service }) => {
          const samples = new Map<number, number | null>()
          service.delivery?.forEach((sample) => {
            const time = Date.parse(sample.timestamp),
              d = new Date(time)
            if (
              Number.isFinite(time) &&
              time <= now.getTime() &&
              operationsDate(d) === date &&
              Math.floor((d.getHours() * 60 + d.getMinutes()) / 15) * 15 ===
                minute
            )
              samples.set(time, finite(sample.power) ? sample.power : null)
          })
          const values = [...samples.values()]
          return values.length && values.every(finite)
            ? values.reduce((sum, value) => sum + value!, 0) / values.length
            : null
        }),
    )
    const actual =
      power.length && power.every(finite)
        ? power.reduce((sum, value) => sum + value!, 0)
        : null
    return { minute, price, committed, actual }
  })
}

export function serviceLastDelivery(
  service: PortfolioService,
  date: string,
  now = new Date(),
) {
  return (
    marketTimeline([], [service], date, now)
      .filter((point) => point.actual !== null)
      .at(-1) ?? null
  )
}

export function validateMarketApplication(
  value: unknown,
  rows: MarketStation[],
  drafts: MarketApplication[] = [],
): Omit<MarketApplication, "id" | "createdAt"> {
  if (!value || typeof value !== "object") throw new Error("申报内容无效")
  const draft = value as MarketApplication
  const row = rows.find((row) => row.station.id === draft.stationId)
  if (!row || !row.validKinds.includes(draft.kind))
    throw new Error("所选站点未具备该服务的有效资格")
  if (draft.date !== row.date) throw new Error("服务日期与能力快照日期不一致")
  if (draft.direction !== "up" && draft.direction !== "down")
    throw new Error("请选择调节方向")
  const start = timeMinute(draft.start),
    end = timeMinute(draft.end)
  if (!(start < end)) throw new Error("服务结束时间必须晚于开始时间")
  const available = row.capacity?.[draft.direction]
  if (!finite(available))
    throw new Error("所选日期缺少有效可用能力，无法校验申报")
  if (
    !finite(draft.capacity) ||
    draft.capacity <= 0 ||
    draft.capacity > available
  )
    throw new Error(`申报容量应大于 0 且不超过 ${available.toFixed(1)} kW`)
  if (
    !finite(row.capacity?.durationHours) ||
    (end - start) / 60 > row.capacity.durationHours
  )
    throw new Error("服务时长超过可持续时间或缺少时长数据")
  const overlapping = drafts.filter(
    (d) =>
      d.id !== draft.id &&
      d.stationId === draft.stationId &&
      d.date === draft.date &&
      d.direction === draft.direction &&
      timeMinute(d.start) < end &&
      timeMinute(d.end) > start,
  )
  const boundaries = new Set([
    start,
    ...overlapping.map((d) => Math.max(start, timeMinute(d.start))),
  ])
  if (
    [...boundaries].some(
      (minute) =>
        draft.capacity +
          overlapping
            .filter(
              (d) =>
                timeMinute(d.start) <= minute && timeMinute(d.end) > minute,
            )
            .reduce((sum, d) => sum + d.capacity, 0) >
        available,
    )
  )
    throw new Error("与已保存草稿的时段重叠，总容量超出可用能力")
  return {
    stationId: draft.stationId,
    date: draft.date,
    kind: draft.kind,
    direction: draft.direction,
    start: draft.start,
    end: draft.end,
    capacity: draft.capacity,
    note: typeof draft.note === "string" ? draft.note.slice(0, 1000) : "",
  }
}
