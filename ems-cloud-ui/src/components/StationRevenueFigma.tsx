import { useEffect, useMemo, useState } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Station } from "@/App"
import { allRows, DEMO_MODE } from "@/api/client"
import { adaptSettlement } from "@/api/settlement"
import type { SettlementRecord } from "@/data/stationSettlement"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import { stationDataNow } from "@/data/dataClock"
import {
  completeSettlementMoney,
  settlementRecords,
  SETTLEMENT_STATES,
} from "@/data/stationSettlement"
import { saveBlob } from "./apiAnalytics"
import OperationsSettlementPage from "./OperationsSettlementPage"
import "./station-revenue-figma.css"

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const amount = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—"
export default function StationRevenueFigma({ station }: { station: Station }) {
  const { user } = useAuth()
  const today = DEMO_MODE ? stationDataNow(station) : new Date()
  const [granularity, setGranularity] = useState("月")
  const [from, setFrom] = useState(() =>
    dateKey(new Date(today.getFullYear(), today.getMonth(), 1)),
  )
  const [to, setTo] = useState(() => dateKey(today))
  const [showSettlement, setShowSettlement] = useState(false)
  const [page, setPage] = useState(1)
  const [queried, setQueried] = useState<SettlementRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const canRead =
    DEMO_MODE || hasStationPermission(user, station.id, "revenue.read")
  useEffect(() => {
    if (DEMO_MODE) return
    setQueried([])
    setError("")
    setLoading(false)
    if (!canRead || !from || !to || from > to) return
    const controller = new AbortController()
    setLoading(true)
    allRows(
      `/stations/${encodeURIComponent(station.id)}/settlements?${new URLSearchParams({ from, to })}`,
      controller.signal,
    )
      .then((rows) => {
        if (!controller.signal.aborted) setQueried(rows.map(adaptSettlement))
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "读取收益失败")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [station.id, from, to, canRead])
  const all = useMemo(
    () => settlementRecords(station, dateKey(today)),
    [station, today.getTime()],
  )
  const queryStation = DEMO_MODE
    ? station
    : {
        ...station,
        operations: {
          ...station.operations,
          settlement: { source: "connected" as const, records: queried },
        },
      }
  const records = (
    DEMO_MODE ? all : settlementRecords(queryStation as Station, dateKey(today))
  ).filter((item) => item.date >= from && item.date <= to)
  const currencies = [...new Set(records.map((item) => item.currency))]
  const mixed = currencies.length > 1
  const currency = currencies[0] ?? "CNY"
  const yesterday = dateKey(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1),
  )
  const total = (items: typeof records) =>
    new Set(items.map((item) => item.currency)).size > 1
      ? null
      : completeSettlementMoney(items.map((item) => item.realized))
  const yesterdayRows = all.filter((item) => item.date === yesterday)
  const monthRows = all.filter(
    (item) =>
      item.date >=
        dateKey(new Date(today.getFullYear(), today.getMonth(), 1)) &&
      item.date <= dateKey(today),
  )
  const groups = new Map<string, typeof records>()
  records.forEach((item) => {
    const key = granularity === "年" ? item.date.slice(0, 7) : item.date
    groups.set(key, [...(groups.get(key) ?? []), item])
  })
  const grouped = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({ date, net: total(rows) }))
  const headers = [
    "日期",
    "峰谷套利",
    "需量节省",
    "光伏自用",
    "VPP响应",
    "损耗与调整",
    "净收益",
    "数据状态",
  ]
  const rowValues = (item: typeof records[number]) => [
    item.date,
    amount(item.income.arbitrage),
    amount(item.income.demand),
    amount(item.income.pv),
    amount(item.income.response),
    amount(
      completeSettlementMoney([
        item.adjustment,
        item.costs.purchase == null ? null : -item.costs.purchase,
        item.costs.operating == null ? null : -item.costs.operating,
        item.costs.penalty == null ? null : -item.costs.penalty,
      ]),
    ),
    amount(item.realized),
    SETTLEMENT_STATES[item.status],
  ]
  const canExport =
    DEMO_MODE || hasStationPermission(user, station.id, "report.export")
  function exportCsv() {
    if (!canExport || !records.length) return
    const safe = (value: string) =>
      `"${(/^[=+@\t\r\n]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`
    saveBlob(
      new Blob(
        [
          "\uFEFF" +
            [[...headers, "币种"], ...records.map((item) => [...rowValues(item), item.currency])]
              .map((row) => row.map(safe).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      `${station.code}-revenue-${from}-${to}.csv`,
    )
  }
  function choosePeriod(value: string) {
    setGranularity(value)
    setPage(1)
    const start = new Date(today)
    if (value === "周") start.setDate(start.getDate() - 6)
    if (value === "月") start.setDate(1)
    if (value === "年") start.setMonth(0, 1)
    setFrom(dateKey(start))
    setTo(dateKey(today))
  }
  if (showSettlement)
    return (
      <div className="station-revenue-figma">
        <button className="ui-button" onClick={() => setShowSettlement(false)}>
          ← 返回运营收益
        </button>
        <OperationsSettlementPage
          stations={[station]}
          onOpenStation={() => {}}
        />
      </div>
    )
  return (
    <main className="station-revenue-figma">
      {(loading || error) && (
        <p role={error ? "alert" : "status"}>{error || "正在读取收益数据…"}</p>
      )}
      <section className="station-revenue-summary" aria-label="收益汇总">
        {[
          [
            "昨日净收益",
            total(yesterdayRows),
            yesterdayRows[0]?.currency ?? "CNY",
          ],
          ["本月累计收益", total(monthRows), monthRows[0]?.currency ?? "CNY"],
        ].map(([label, value, unit]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>
              {amount(value as number | null)} <small>{unit}</small>
            </strong>
            <p>
              {DEMO_MODE
                ? "演示结算数据"
                : value === null
                  ? "暂无完整结算数据"
                  : "根据已接入结算记录计算"}
            </p>
          </div>
        ))}
        <button
          className="station-revenue-settlement-link"
          onClick={() => setShowSettlement(true)}
        >
          结算明细与操作 →
        </button>
      </section>
      <section className="station-revenue-trend" aria-label="收益趋势">
        <header>
          <div>
            <h2>收益趋势</h2>
            <p>
              选定周期收益{" "}
              <strong>{amount(mixed ? null : total(records))}</strong>{" "}
              {mixed ? "多币种未汇总" : currency}
            </p>
          </div>
          <div className="station-revenue-controls">
            <div>
              {["周", "月", "年"].map((value) => (
                <button
                  key={value}
                  aria-pressed={value === granularity}
                  onClick={() => choosePeriod(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <input
              aria-label="收益开始日期"
              type="date"
              value={from}
              max={to}
              onChange={(event) => {
                if (event.target.value) {
                  setFrom(event.target.value)
                  setPage(1)
                }
              }}
            />
            <span>至</span>
            <input
              aria-label="收益结束日期"
              type="date"
              value={to}
              min={from}
              onChange={(event) => {
                if (event.target.value) {
                  setTo(event.target.value)
                  setPage(1)
                }
              }}
            />
          </div>
        </header>
        <div className="station-revenue-plot">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={mixed ? [] : grouped}
              margin={{ top: 18, right: 20, left: 6, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e9edf0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => [amount(Number(value)), "净收益"]}
              />
              <Bar
                dataKey="net"
                fill="#318c76"
                radius={[3, 3, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
          {(!records.length || mixed) && (
            <span className="station-chart-empty">
              {mixed ? "不同币种无法合并展示" : "暂无收益趋势数据"}
            </span>
          )}
        </div>
      </section>
      <section className="station-revenue-details" aria-label="收益明细">
        <header>
          <h2>收益明细</h2>
          <button
            className="ui-button"
            disabled={!canExport || !records.length}
            onClick={exportCsv}
          >
            导出
          </button>
        </header>
        <div className="ui-table-scroll">
          <table>
            <thead>
              <tr>
                {headers.map((label) => (
                  <th key={label}>
                    {label}
                    {label !== "日期" && label !== "数据状态" && !mixed
                      ? ` (${currency})`
                      : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.slice((page - 1) * 10, page * 10).map((item) => (
                <tr key={item.id}>
                  {rowValues(item).map((value, index) => (
                    <td key={index}>
                      {value}
                      {index > 0 && index < 7 && mixed
                        ? ` ${item.currency}`
                        : ""}
                    </td>
                  ))}
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td colSpan={8} className="station-revenue-empty">
                    所选日期范围暂无收益明细
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer>
          <span>共 {records.length} 条</span>
          <button
            disabled={page === 1}
            onClick={() => setPage((value) => value - 1)}
          >
            上一页
          </button>
          <span>
            {page} / {Math.max(1, Math.ceil(records.length / 10))}
          </span>
          <button
            disabled={page * 10 >= records.length}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </footer>
      </section>
    </main>
  )
}
