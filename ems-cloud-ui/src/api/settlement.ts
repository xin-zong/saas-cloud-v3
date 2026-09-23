import type { SettlementRecord } from "../data/stationSettlement"
import type { ApiRow } from "./client"
const text = (v: unknown) => (v == null ? "" : String(v))
const amount = (v: unknown) =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v)
const cents = (v: number) =>
  Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 100)
export function adaptSettlement(row: ApiRow): SettlementRecord {
  const lines = Object.fromEntries(
    ((row.lines ?? []) as ApiRow[]).map((line) => [
      text(line.category),
      amount(line.amount),
    ]),
  )
  const incomeKeys = [
    "arbitrage",
    "demand",
    "response",
    "gridServices",
    "pv",
    "other",
  ]
  const costKeys = ["purchase", "operating", "penalty"]
  const complete = row.calculation_complete === true
  // A completed calculation defines omitted categories as not applicable; otherwise they are unknown.
  const categories = (keys: string[]) =>
    Object.fromEntries(
      keys.map((key) => [key, lines[key] ?? (complete ? 0 : null)]),
    )
  const income = categories(incomeKeys),
    costs = categories(costKeys)
  const adjustment = lines.adjustment ?? (complete ? 0 : null)
  const realized = complete
    ? (Object.values(income).reduce<number>((s, v) => s + cents(v ?? 0), 0) -
        Object.values(costs).reduce<number>((s, v) => s + cents(v ?? 0), 0) +
        cents(adjustment ?? 0)) /
      100
    : null
  const payments = row.payments as ApiRow[] | undefined
  const settled = payments
    ? payments.reduce((sum, p) => sum + cents(Number(p.amount)), 0) / 100
    : null
  const statement = amount(row.statement_amount)
  return {
    id: text(row.id),
    date: text(row.recognition_date),
    currency: text(row.currency),
    contract: text(row.contract_code),
    status: row.status as SettlementRecord["status"],
    income,
    costs,
    adjustment,
    realized,
    settled,
    pending:
      realized !== null && settled !== null
        ? (cents(realized) - cents(settled)) / 100
        : null,
    disputed: row.status === "disputed" ? null : 0,
    estimated: amount(row.estimated_amount),
    statementAmount: statement,
    difference:
      realized !== null && statement !== null
        ? (cents(realized) - cents(statement)) / 100
        : null,
    meterComplete: row.meter_complete === true,
    calculationComplete: complete,
    evidence: { reference: text(row.reference) },
  }
}
