import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import { DEMO_MODE } from "@/api/client"
import { useMemo, useState } from "react"
import { ArrowRight, Download, Search } from "lucide-react"
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
import {
  buildOperationsStation,
  exportOperationsCsv,
  finite,
  operationsDate,
  sumKnown,
} from "@/data/operations"
import { stationsDataNow } from "@/data/dataClock"
import { PageHeader } from "./ui/Workspace"
import "./operations-center.css"
import StationPriceSettingsPage from "./StationPriceSettingsPage"
import OperationsSchedulePage from "./OperationsSchedulePage"
import OperationsMarketPage from "./OperationsMarketPage"
import OperationsSettlementPage from "./OperationsSettlementPage"
import type { RegisterLeaveGuard } from "./useEditorLeaveGuard"

const TABS = ["运营总览", "策略执行", "市场服务", "收益结算", "电价设置"] as const
type Tab = (typeof TABS)[number]

function daysInRange(start: string, end: string) {
  if (!start || !end || start > end) return []
  const days: string[] = []
  const cursor = new Date(`${start}T12:00:00`)
  while (operationsDate(cursor) <= end && days.length < 366) {
    days.push(operationsDate(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

function weekStart(now: Date) {
  const date = new Date(now)
  date.setDate(date.getDate() - 6)
  return operationsDate(date)
}

const amount = (value: number | null) =>
  value === null ? "--" : `¥ ${Math.round(value).toLocaleString("zh-CN")}`
const energy = (value: number | null) =>
  value === null ? "--" : value.toLocaleString("zh-CN", { maximumFractionDigits: 1 })

function OperationsOverview({
  stations,
  onOpenStation,
}: {
  stations: Station[]
  onOpenStation: (id: string, subNav?: string) => void
}) {
  const [now] = useState(() => stationsDataNow(stations))
  const today = operationsDate(now)
  const [region, setRegion] = useState("")
  const [type, setType] = useState("")
  const [query, setQuery] = useState("")
  const [start, setStart] = useState(() => weekStart(now))
  const [end, setEnd] = useState(() => today)
  const days = useMemo(() => daysInRange(start, end), [start, end])
  const scoped = useMemo(
    () =>
      stations.filter(
        (station) =>
          (!region || station.region === region) &&
          (!type || station.type === type),
      ),
    [stations, region, type],
  )
  const daily = useMemo(
    () =>
      days.map((date) => ({
        date,
        label: date.slice(5),
        revenue: sumKnown(
          scoped.map((station) => buildOperationsStation(station, date, now).day.total),
        ),
      })),
    [days, scoped, now],
  )
  const todayRows = useMemo(
    () => scoped.map((station) => buildOperationsStation(station, today, now)),
    [scoped, today, now],
  )
  const monthRows = useMemo(
    () => scoped.map((station) => buildOperationsStation(station, end, now)),
    [scoped, end, now],
  )
  const periodTotal = sumKnown(daily.map((point) => point.revenue))
  const periodByStation = useMemo(
    () =>
      scoped.map((station) => {
        const records = days.map((date) => buildOperationsStation(station, date, now))
        const samples = records.flatMap((record) =>
          record.power.map((point) => point.storage).filter(finite),
        )
        return {
          station,
          today: todayRows.find((row) => row.station.id === station.id)?.day.total ?? null,
          month: monthRows.find((row) => row.station.id === station.id)?.month.total ?? null,
          period: sumKnown(records.map((record) => record.day.total)),
          charge: samples.length
            ? samples.reduce((total, power) => total + Math.max(0, -power), 0) / 4000
            : null,
          discharge: samples.length
            ? samples.reduce((total, power) => total + Math.max(0, power), 0) / 4000
            : null,
        }
      }),
    [scoped, days, now, todayRows, monthRows],
  )
  const visible = periodByStation.filter((row) =>
    `${row.station.name} ${row.station.code}`.toLowerCase().includes(query.trim().toLowerCase()),
  )

  function exportRows() {
    exportOperationsCsv(
      `站点经营明细-${start}-${end}.csv`,
      ["站点", "今日收益(元)", "本月收益(元)", "所选时段收益(元)", "时段充电量(MWh)", "时段放电量(MWh)"],
      visible.map((row) => [
        row.station.name,
        row.today,
        row.month,
        row.period,
        row.charge,
        row.discharge,
      ]),
    )
  }

  return (
    <div className="ops-overview">
      <section className="ops-filterbar" aria-label="运营范围与时间">
        <span>运营范围</span>
        <select aria-label="运营区域" value={region} onChange={(event) => setRegion(event.target.value)}>
          <option value="">全部区域 · {stations.length}站</option>
          {[...new Set(stations.map((station) => station.region))].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <span>站点类型</span>
        <select aria-label="站点类型" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="">全部类型</option>
          {[...new Set(stations.map((station) => station.type))].map((value) => (
            <option key={value} value={value}>{value === "BESS" ? "工商业储能" : value}</option>
          ))}
        </select>
        <span>统计时间</span>
        <button
          className="operations-button is-active"
          onClick={() => { setStart(weekStart(now)); setEnd(today) }}
        >
          近一周
        </button>
        <div className="ops-date-range">
          <input aria-label="收益开始日期" type="date" value={start} max={end} onChange={(event) => setStart(event.target.value)} />
          <span>—</span>
          <input aria-label="收益结束日期" type="date" value={end} min={start} max={today} onChange={(event) => setEnd(event.target.value)} />
        </div>
      </section>

      <section className="ops-summary" aria-label="收益指标">
        {[
          ["今日收益", amount(sumKnown(todayRows.map((row) => row.day.total))), today],
          ["本月收益", amount(sumKnown(monthRows.map((row) => row.month.total))), end.slice(0, 7)],
          ["所选时段收益", amount(periodTotal), `${start.slice(5)} — ${end.slice(5)}`],
        ].map(([label, value, note], index) => (
          <div key={label}>
            <span>{label}</span>
            <strong data-testid={index === 0 ? "operations-day-revenue" : undefined}>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </section>

      <section className="ops-panel ops-revenue-chart" aria-label="收益趋势">
        <div className="ops-panel-heading">
          <h2>收益趋势</h2>
          <span className="ops-chart-legend"><i />站点收益</span>
        </div>
        <div className="ops-chart-unit">元</div>
        <div className="ops-chart" data-testid="operations-chart">
          {daily.some((point) => point.revenue !== null) ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart data={daily} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--ui-border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--ui-muted)", fontSize: 12 }} />
                <YAxis width={52} tickLine={false} axisLine={false} tick={{ fill: "var(--ui-muted)", fontSize: 12 }} tickFormatter={(value) => Number(value).toLocaleString("zh-CN")} />
                <Tooltip
                  formatter={(value) => [amount(Number(value)), "站点收益"]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                  contentStyle={{ border: "1px solid var(--ui-border)", borderRadius: 6, fontSize: 12 }}
                />
                <Bar dataKey="revenue" name="站点收益" fill="var(--ui-primary)" maxBarSize={52} radius={[2, 2, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="operations-empty">所选时段暂无收益数据</div>
          )}
        </div>
      </section>

      <section className="ops-panel ops-detail" aria-label="站点经营明细">
        <div className="ops-panel-heading">
          <h2>站点经营明细</h2>
          <div className="operations-actions">
            <label className="ops-search">
              <Search size={15} />
              <input aria-label="搜索经营站点" type="search" placeholder="搜索站点" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button className="operations-button" onClick={exportRows} disabled={!visible.length}>
              <Download size={15} />导出
            </button>
          </div>
        </div>
        <div className="operations-table-scroll">
          <table>
            <thead>
              <tr>
                {["站点", "今日收益（元）", "本月收益（元）", "所选时段收益（元）", "时段充电量（MWh）", "时段放电量（MWh）", ""].map((label) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.station.id}>
                  <td><strong>{row.station.name}</strong></td>
                  <td className="operations-numeric">{energy(row.today)}</td>
                  <td className="operations-numeric">{energy(row.month)}</td>
                  <td className="operations-numeric">{energy(row.period)}</td>
                  <td className="operations-numeric">{energy(row.charge)}</td>
                  <td className="operations-numeric">{energy(row.discharge)}</td>
                  <td>
                    <button className="operations-link" onClick={() => onOpenStation(row.station.id, "运营收益")}>
                      查看收益 <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && <div className="operations-empty">没有符合条件的站点</div>}
      </section>
    </div>
  )
}

export default function OperationsCenterPage({
  stations,
  onOpenStation,
  allowedTabs = TABS,
  registerLeaveGuard,
  requestLeave,
}: {
  stations: Station[]
  onOpenStation: (id: string, subNav?: string) => void
  allowedTabs?: readonly Tab[]
  registerLeaveGuard?: RegisterLeaveGuard
  requestLeave?: () => Promise<boolean>
}) {
  const {user} = useAuth()
  const forCapability = (code: string) => DEMO_MODE ? stations : stations.filter(station => hasStationPermission(user, station.id, code))
  const visibleTabs = TABS.filter((item) => allowedTabs.includes(item))
  const [tab, setTab] = useState<Tab>(visibleTabs[0] ?? "运营总览")
  const [tariffStationId, setTariffStationId] = useState("")
  const tariffStations = forCapability("tariff.manage")
  const tariffStation = tariffStations.find(station => station.id === tariffStationId) ?? tariffStations[0]
  const activeTab = visibleTabs.includes(tab)
    ? tab
    : (visibleTabs[0] ?? "运营总览")
  return (
    <main className="operations-page">
      <PageHeader
        title="运营中心"
        description="统一查看站点收益、策略执行、市场服务和收益结算。"
      />
      {!DEMO_MODE && <p style={{padding: "8px 24px", fontSize:12}}>计划、市场服务与结算来自业务服务器。内部草稿、审批及复核不触发设备控制、外部市场交易或付款；执行数据缺失时显示未知。</p>}
      <nav className="ui-tabs ops-tabs" aria-label="运营中心二级导航">
        {visibleTabs.map((item) => (
          <button key={item} aria-current={activeTab === item ? "page" : undefined} onClick={() => { void (async () => {
            if (item !== activeTab && requestLeave && !(await requestLeave())) return
            setTab(item)
          })() }}>
            {item}
          </button>
        ))}
      </nav>
      {activeTab === "运营总览" && <OperationsOverview stations={stations} onOpenStation={onOpenStation} />}
      {activeTab === "策略执行" && <OperationsSchedulePage stations={forCapability("strategy.read")} onOpenStation={onOpenStation} registerLeaveGuard={registerLeaveGuard} requestLeave={requestLeave} />}
      {activeTab === "市场服务" && <OperationsMarketPage stations={forCapability("market.read")} onOpenStation={onOpenStation} />}
      {activeTab === "电价设置" && <section><label className="dispatch-toolbar">电价站点 <select aria-label="电价站点" value={tariffStation?.id ?? ""} onChange={event => { const id = event.target.value; void (async () => {
        if (id !== tariffStation?.id && requestLeave && !(await requestLeave())) return
        setTariffStationId(id)
      })() }}>{tariffStations.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>{tariffStation ? <StationPriceSettingsPage key={tariffStation.id} station={tariffStation} registerLeaveGuard={registerLeaveGuard} /> : <p className="operations-empty">暂无授权站点</p>}</section>}
      {activeTab === "收益结算" && <OperationsSettlementPage stations={forCapability("revenue.read")} onOpenStation={onOpenStation} />}
    </main>
  )
}
