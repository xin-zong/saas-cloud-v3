import type { Station } from "@/App"
import { finite, operationsDate } from "./operations"
import type { RevenueDateRange } from "./stationMetrics"

export const SETTLEMENT_STATES = {
  metered: "计量齐备",
  calculated: "初算完成",
  reviewing: "复核中",
  settled: "已结算",
  disputed: "争议中",
  unknown: "待核验",
} as const
export type SettlementState = keyof typeof SETTLEMENT_STATES
export const SETTLEMENT_INCOME = [
  { key: "arbitrage", label: "峰谷套利", color: "#217e68" },
  { key: "demand", label: "需量节省", color: "#3179b9" },
  { key: "response", label: "需求响应", color: "#7959a6" },
  { key: "gridServices", label: "电网服务", color: "#25846e" },
  { key: "pv", label: "光伏收益", color: "#ad731a" },
  { key: "other", label: "其他收入", color: "#6c7f8d" },
] as const
export const SETTLEMENT_COSTS = [
  { key: "purchase", label: "购电成本" },
  { key: "operating", label: "运营成本" },
  { key: "penalty", label: "罚则调差" },
] as const
export type IncomeKey = typeof SETTLEMENT_INCOME[number]["key"]
export type CostKey = typeof SETTLEMENT_COSTS[number]["key"]
export type SettlementRecord = {
  id: string
  date: string
  currency?: string
  contract?: string
  service?: string
  status?: SettlementState
  realized?: number | null
  pending?: number | null
  settled?: number | null
  disputed?: number | null
  estimated?: number | null
  adjustment?: number | null
  statementAmount?: number | null
  difference?: number | null
  income?: Partial<Record<IncomeKey, number | null>>
  costs?: Partial<Record<CostKey, number | null>>
  meterComplete?: boolean
  calculationComplete?: boolean
  disputeReason?: string
  evidence?: {
    reference?: string
    meterKwh?: number | null
    baselineKwh?: number | null
    pricePerKwh?: number | null
    rule?: string
    instruction?: string
    performance?: string
  }
}
export type SettlementData = {
  source?: "demo" | "connected"
  records: SettlementRecord[]
}
const cents = (value: number) =>
  Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100)
export function sumSettlementMoney(values: (number | null | undefined)[]) {
  const known = values.filter(finite)
  return known.length
    ? known.reduce((sum, value) => sum + cents(value), 0) / 100
    : null
}
const money = (value: unknown) => (finite(value) ? cents(value) / 100 : null)
// Financial totals are unknown when any participating record omits that amount.
export const completeSettlementMoney = (
  values: (number | null | undefined)[],
) => (values.every(finite) ? sumSettlementMoney(values) : null)
export function validSettlementRange(range: RevenueDateRange) {
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    operationsDate(new Date(`${value}T12:00:00`)) === value
  return valid(range.start) && valid(range.end) && range.start <= range.end
}

function demoRecord(
  station: Station,
  date: string,
  realized: number,
  estimated: number,
): SettlementRecord {
  const status: SettlementState =
    station.status === "fault"
      ? "disputed"
      : station.status === "offline"
        ? "reviewing"
        : station.dataStatus === "partial"
          ? "calculated"
          : "settled"
  const settled =
    status === "settled"
      ? realized
      : status === "disputed"
        ? Math.round(realized * 0.58)
        : 0
  const pending = money(realized - settled)!
  const disputed = status === "disputed" ? Math.round(pending * 0.35) : 0
  const purchase = Math.round(Math.abs(realized) * 0.045),
    operating = Math.round(Math.abs(realized) * 0.018),
    penalty = status === "disputed" ? Math.round(Math.abs(realized) * 0.025) : 0
  const gross = realized + purchase + operating + penalty
  const arbitrage = Math.round(gross * 0.365),
    demand = Math.round(gross * 0.26),
    response = Math.round(gross * 0.205)
  return {
    id: `demo-${date}`,
    date,
    contract: `DEMO-${station.code}`,
    service: station.mode,
    currency: "CNY",
    status,
    realized,
    pending,
    settled,
    disputed,
    estimated,
    income: {
      arbitrage,
      demand,
      response,
      gridServices: money(gross - arbitrage - demand - response)!,
      pv: 0,
      other: 0,
    },
    costs: { purchase, operating, penalty },
    adjustment: 0,
    difference:
      status === "disputed"
        ? disputed
        : status === "calculated"
          ? money(realized * 0.006)
          : 0,
    meterComplete: station.status !== "offline",
    calculationComplete: station.status !== "offline",
    disputeReason: status === "disputed" ? "需求响应基线待复核" : undefined,
    evidence: {
      reference: `DEMO-${station.code}-${date}`,
      rule: "示例核算记录",
      instruction: station.mode,
      performance: "示例数据，未关联实际执行回执",
    },
  }
}

export function settlementRecords(station: Station, today: string) {
  const explicit = station.operations?.settlement
  const demo = explicit
    ? explicit.source === "demo"
    : station.revenueSource === "demo"
  const fallback: SettlementRecord[] = (station.revenueHistory ?? [])
    .filter((point) => !demo || station.status !== "building")
    .map((point) => {
      const realized = completeSettlementMoney([point.settled, point.pending])
      if (demo && realized !== null)
        return demoRecord(station, point.date, realized, point.est ?? 0)
      return {
        id: `history-${point.date}`,
        date: point.date,
        currency: "CNY",
        service: station.mode,
        realized,
        settled: point.settled,
        pending: point.pending,
        estimated: point.est ?? point.amount,
        status:
          finite(point.pending) && point.pending === 0 && finite(point.settled)
            ? "settled"
            : "unknown",
      }
    })
  const unique = new Map<string, SettlementRecord>()
  ;(explicit?.records ?? fallback).forEach((record) => {
    if (
      !record ||
      !record.id ||
      !validSettlementRange({ start: record.date, end: record.date }) ||
      record.date > today
    )
      return
    unique.set(record.id, record)
  })
  return [...unique.values()].map((record) => {
    const settled = money(record.settled),
      pending = money(record.pending)
    const realized =
      record.realized !== undefined
        ? money(record.realized)
        : settled !== null && pending !== null
          ? sumSettlementMoney([settled, pending])
          : null
    const income = Object.fromEntries(
      SETTLEMENT_INCOME.map(({ key }) => [key, money(record.income?.[key])]),
    ) as Record<IncomeKey, number | null>
    const costs = Object.fromEntries(
      SETTLEMENT_COSTS.map(({ key }) => [key, money(record.costs?.[key])]),
    ) as Record<CostKey, number | null>
    const difference =
      record.difference !== undefined
        ? money(record.difference)
        : finite(record.statementAmount) && realized !== null
          ? money(record.statementAmount - realized)
          : null
    const balance = sumSettlementMoney([settled, pending])
    return {
      ...record,
      station,
      demo,
      currency: record.currency || "CNY",
      contract: record.contract || "未提供合同",
      status:
        record.status && record.status in SETTLEMENT_STATES
          ? record.status
          : "unknown" as SettlementState,
      realized,
      settled,
      pending,
      disputed: money(record.disputed),
      estimated: money(record.estimated),
      adjustment: money(record.adjustment),
      difference,
      income,
      costs,
      balanceError:
        settled !== null &&
        pending !== null &&
        realized !== null &&
        Math.abs(balance! - realized) > 0.009,
    }
  })
}
export type NormalizedSettlementRecord = ReturnType<typeof settlementRecords>[number]
export function settlementTotals(records: NormalizedSettlementRecord[]) {
  const total = (
    key: "realized" | "pending" | "settled" | "disputed" | "estimated" | "adjustment" | "difference",
  ) => completeSettlementMoney(records.map((record) => record[key]))
  return {
    realized: total("realized"),
    pending: total("pending"),
    settled: total("settled"),
    disputed: total("disputed"),
    estimated: total("estimated"),
    adjustment: total("adjustment"),
    difference: total("difference"),
    income: Object.fromEntries(
      SETTLEMENT_INCOME.map(({ key }) => [
        key,
        completeSettlementMoney(records.map((record) => record.income[key])),
      ]),
    ) as Record<IncomeKey, number | null>,
    costs: Object.fromEntries(
      SETTLEMENT_COSTS.map(({ key }) => [
        key,
        completeSettlementMoney(records.map((record) => record.costs[key])),
      ]),
    ) as Record<CostKey, number | null>,
  }
}
const STATUS_PRIORITY: Record<SettlementState, number> = {
  disputed: 6,
  reviewing: 5,
  unknown: 4,
  calculated: 3,
  metered: 2,
  settled: 1,
}
export function buildSettlementAccounts(
  stations: Station[],
  range: RevenueDateRange,
  currency: string,
  today = operationsDate(),
) {
  if (!validSettlementRange(range)) return []
  const groups = new Map<string, NormalizedSettlementRecord[]>()
  stations.forEach((station) =>
    settlementRecords(station, today)
      .filter(
        (record) =>
          record.currency === currency &&
          record.date >= range.start &&
          record.date <= range.end,
      )
      .forEach((record) => {
        const key = JSON.stringify([station.id, record.contract, currency])
        groups.set(key, [...(groups.get(key) ?? []), record])
      }),
  )
  return [...groups].map(([key, records]) => {
    records.sort((a, b) => a.date.localeCompare(b.date))
    const status = records.reduce<SettlementState>(
      (result, record) =>
        STATUS_PRIORITY[record.status] > STATUS_PRIORITY[result]
          ? record.status
          : result,
      "settled",
    )
    const totals = settlementTotals(records)
    const maxDifference = Math.max(
      0,
      ...records.map((record) => Math.abs(record.difference ?? 0)),
    )
    return {
      key,
      station: records[0].station,
      contract: records[0].contract,
      currency,
      records,
      status,
      totals,
      maxDifference,
      start: records[0].date,
      end: records[records.length - 1].date,
      demo: records.some((record) => record.demo),
      metered: records.every((record) => record.meterComplete === true),
      calculated: records.every(
        (record) => record.calculationComplete === true,
      ),
      balanceError: records.some((record) => record.balanceError),
      disputeReason: records.find((record) => record.disputeReason)
        ?.disputeReason,
    }
  })
}
export type SettlementAccount = ReturnType<typeof buildSettlementAccounts>[number]
