import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { DEMO_MODE } from "@/api/client"
import OperationsSettlementPage from "./OperationsSettlementPage"
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  X,
} from "lucide-react"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Station } from "@/App"
import {
  buildStationRevenueModel,
  getDefaultRevenueDateRange,
  type RevenueDateRange,
  type RevenueGranularity,
} from "@/data/stationMetrics"
import { Badge, Button, PageHeader, Select } from "./ui/Workspace"
import "./station-revenue.css"

import "./station-api-overview.css"

type RevenueModel = ReturnType<typeof buildStationRevenueModel>
type RevenueRow = RevenueModel["detailRows"][number]
const series = [
  { key: "settled", label: "已结算", color: "#21865a" },
  { key: "pending", label: "待结算", color: "#176b5d" },
  { key: "est", label: "暂估", color: "#c28a1c" },
  { key: "cumulative", label: "累计收益", color: "#505968" },
] as const
const sourceColors: Record<string, string> = {
  峰谷套利: "#176b5d",
  需量节省: "#12817e",
  光伏盈用: "#c28a1c",
  VPP响应: "#8060a5",
  罚款与调差: "#c02e36",
}
const money = (value: number) =>
  `${
    value < 0 ? "-" : ""
  }¥ ${Math.abs(Math.round(value)).toLocaleString("zh-CN")}`
const shortNumber = (value: number) =>
  Math.abs(value) >= 10000
    ? `${(value / 10000).toFixed(1)}万`
    : value.toLocaleString("zh-CN")

function RevenueTrend({ model }: { model: RevenueModel }) {
  const [hidden, setHidden] = useState<string[]>([])
  const data = useMemo(() => {
    let cumulative = 0
    return model.dailyData.map((point) => ({
      ...point,
      cumulative: (cumulative += point.settled + point.pending + point.est),
    }))
  }, [model.dailyData])
  return (
    <section
      className="revenue-trend"
      data-chart="station-revenue-trend"
      data-source={model.trendDataSource}
    >
      <div className="ui-section-heading">
        <h2>收益趋势</h2>
        <span className="ui-muted">金额 / CNY</span>
      </div>
      <div className="revenue-legend" aria-label="收益图例">
        {series.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={!hidden.includes(item.key)}
            onClick={() =>
              setHidden((current) =>
                current.includes(item.key)
                  ? current.filter((key) => key !== item.key)
                  : [...current, item.key],
              )
            }
          >
            <i style={{ background: item.color }} />
            {item.label}
          </button>
        ))}
      </div>
      <div
        className="revenue-chart"
        role="img"
        aria-label="收益趋势图，按所选日期显示已结算、待结算、暂估及累计收益"
      >
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <ComposedChart
              data={data}
              margin={{ top: 12, right: 0, bottom: 4, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid
                vertical={false}
                stroke="var(--ui-border)"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="date"
                tick={{ fill: "var(--ui-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                yAxisId="period"
                width={54}
                tickFormatter={shortNumber}
                tick={{ fill: "var(--ui-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="cumulative"
                orientation="right"
                width={54}
                hide={hidden.includes("cumulative")}
                tickFormatter={shortNumber}
                tick={{ fill: "var(--ui-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                isAnimationActive={false}
                formatter={(value, name) => [money(Number(value ?? 0)), name]}
                contentStyle={{
                  border: "1px solid var(--ui-border)",
                  borderRadius: 4,
                  fontSize: 12,
                  color: "var(--ui-text)",
                  background: "var(--ui-surface)",
                }}
                cursor={{ fill: "var(--ui-subtle)" }}
              />
              {series.slice(0, 3).map((item) => (
                <Bar
                  key={item.key}
                  yAxisId="period"
                  dataKey={item.key}
                  name={item.label}
                  stackId="revenue"
                  fill={item.color}
                  maxBarSize={36}
                  hide={hidden.includes(item.key)}
                  isAnimationActive={false}
                />
              ))}
              <Line
                yAxisId="cumulative"
                dataKey="cumulative"
                name="累计收益"
                stroke={series[3].color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                hide={hidden.includes("cumulative")}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="revenue-empty">该时间范围暂无收益数据</div>
        )}
      </div>
      <div className="revenue-chart-totals">
        <span>
          已结算 <b>{money(model.settled)}</b>
        </span>
        <span>
          待结算 <b>{money(model.pending)}</b>
        </span>
        <span>
          暂估 <b>{money(model.est)}</b>
        </span>
      </div>
    </section>
  )
}

function RevenueSources({ model }: { model: RevenueModel }) {
  const [source, setSource] = useState("全部来源")
  const total = Math.max(
    1,
    model.sources
      .filter((item) => item.value > 0)
      .reduce((sum, item) => sum + item.value, 0),
  )
  const visible =
    source === "全部来源"
      ? model.sources
      : model.sources.filter((item) => item.label === source)
  return (
    <section className="revenue-sources">
      <div className="ui-section-heading">
        <h2>收益构成</h2>
        <Select
          aria-label="收益构成来源"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option>全部来源</option>
          {model.sources.map((item) => (
            <option key={item.label}>{item.label}</option>
          ))}
        </Select>
      </div>
      <div className="revenue-source-list">
        {visible.map((item) => (
          <div className="revenue-source" key={item.label}>
            <div>
              <span>
                <i style={{ background: sourceColors[item.label] }} />
                {item.label}
              </span>
              <strong>{money(item.value)}</strong>
            </div>
            <div className="revenue-source-track">
              <span
                style={{
                  width: `${Math.min(100, (Math.abs(item.value) / total) * 100)}%`,
                  background: sourceColors[item.label],
                }}
              />
            </div>
            <small>
              {item.value < 0 ? "扣减项" : "收益贡献"}
              <span>{Math.round((Math.abs(item.value) / total) * 100)}%</span>
            </small>
          </div>
        ))}
      </div>
      <div className="revenue-source-net">
        <span>净收益</span>
        <strong>{money(model.netRevenue)}</strong>
      </div>
    </section>
  )
}

function DetailTable({
  model,
  dataSource,
}: {
  model: RevenueModel
  dataSource: string
}) {
  const [expanded, setExpanded] = useState<string[]>([])
  const columns = [
    "日期",
    "峰谷套利",
    "需量节省",
    "光伏盈用",
    "VPP响应",
    "罚款与调差",
    "净收益",
    "数据状态",
  ]
  const keys = ["peakValley", "demand", "pv", "vpp", "penalty", "net"] as const
  const tone = (status: RevenueRow["status"]) =>
    status === "已结算" ? "success" : status === "待结算" ? "info" : "warning"
  return (
    <section className="revenue-details">
      <div className="ui-section-heading">
        <h2>结算追溯</h2>
        <span className="ui-muted">{model.detailRows.length} 条周期记录</span>
      </div>
      <div className="ui-table-scroll">
        <table className="ui-table revenue-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  scope="col"
                  key={column}
                  className={index > 0 && index < 7 ? "is-number" : ""}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.detailRows.map((row) => {
              const key = `${row.date}-${row.status}`
              const isExpanded = expanded.includes(key)
              return (
                <Fragment key={key}>
                  <tr>
                    <td>
                      <button
                        className="revenue-row-toggle"
                        type="button"
                        aria-label={`${
                          isExpanded ? "收起" : "展开"
                        } ${row.date} ${row.status}`}
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpanded((current) =>
                            isExpanded
                              ? current.filter((item) => item !== key)
                              : [...current, key],
                          )
                        }
                      >
                        {isExpanded ? (
                          <ChevronDown size={16} />
                        ) : (
                          <ChevronRight size={16} />
                        )}
                        {row.date}
                      </button>
                    </td>
                    {keys.map((field) => (
                      <td
                        key={field}
                        className={`is-number ${
                          field === "penalty" ? "revenue-negative" : ""
                        }`}
                      >
                        {field === "net" ? (
                          <strong>{money(row[field])}</strong>
                        ) : (
                          money(row[field])
                        )}
                      </td>
                    ))}
                    <td>
                      <Badge tone={tone(row.status)}>{row.status}</Badge>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="revenue-trace-cell">
                        <dl className="revenue-trace">
                          {[
                            ["计量状态", row.meterStatus],
                            ["运行策略", row.strategy],
                            ["电价版本", row.tariffVersion],
                            ["结算版本", row.settlementVersion],
                            ["数据来源", dataSource],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function StationRevenuePage({ station }: { station: Station }) {
  return DEMO_MODE ? (
    <DemoStationRevenue station={station} />
  ) : (
    <ApiStationRevenue key={station.id} station={station} />
  )
}
function ApiStationRevenue({ station }: { station: Station }) {
  const [granularity, setGranularity] = useState<RevenueGranularity>("日")
  const [dateRange, setDateRange] = useState(() =>
    getDefaultRevenueDateRange("日"),
  )
  const [showSettlement, setShowSettlement] = useState(false)
  return (
    <main className="ui-page revenue-workspace">
      <PageHeader
        title="运营收益"
        description={`${station.name} / ${station.mode || "运行模式未配置"}`}
        actions={
          <Button onClick={() => setShowSettlement((value) => !value)}>
            {showSettlement ? "收益概览" : "结算明细与操作"}
          </Button>
        }
      />
      {showSettlement ? (
        <OperationsSettlementPage
          stations={[station]}
          onOpenStation={() => {}}
        />
      ) : (
        <>
          <div className="revenue-toolbar">
            <div
              className="ui-segmented"
              role="group"
              aria-label="收益时间粒度"
            >
              {(["日", "周", "月", "年"] as const).map((item) => (
                <button
                  key={item}
                  aria-pressed={granularity === item}
                  onClick={() => {
                    setGranularity(item)
                    setDateRange(getDefaultRevenueDateRange(item))
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="ui-muted">
              开始日期{" "}
              <input
                className="ui-input"
                aria-label="收益开始日期"
                type="date"
                value={dateRange.start}
                max={dateRange.end}
                onChange={(event) =>
                  setDateRange((value) => ({
                    ...value,
                    start: event.target.value,
                  }))
                }
              />
            </label>
            <label className="ui-muted">
              结束日期{" "}
              <input
                className="ui-input"
                aria-label="收益结束日期"
                type="date"
                value={dateRange.end}
                min={dateRange.start}
                onChange={(event) =>
                  setDateRange((value) => ({
                    ...value,
                    end: event.target.value,
                  }))
                }
              />
            </label>
            <span className="revenue-sync">
              <Activity size={14} />
              收益分析数据待接入
            </span>
          </div>
          <div className="revenue-content">
            <section className="revenue-metrics" aria-label="收益关键指标">
              {[
                [
                  {
                    日: "今日收益",
                    周: "本周收益",
                    月: "本月收益",
                    年: "本年收益",
                  }[granularity],
                  "CNY",
                ],
                ["结算完成率", "%"],
                ["待结算 / 暂估", "CNY"],
                ["数据新鲜度", ""],
              ].map(([label, unit]) => (
                <div className="revenue-metric" key={label}>
                  <span className="revenue-metric-label">{label}</span>
                  <div className="revenue-metric-value">
                    <strong>—</strong>
                    <span>{unit}</span>
                  </div>
                  <span className="revenue-metric-detail">
                    暂无该周期分析数据
                  </span>
                </div>
              ))}
            </section>
            <div className="revenue-main">
              <section className="revenue-trend">
                <div className="ui-section-heading">
                  <h2>收益趋势</h2>
                  <span className="ui-muted">金额 / CNY</span>
                </div>
                <div className="revenue-legend">
                  {series.map((item) => (
                    <span
                      key={item.key}
                      style={{
                        display: "inline-flex",
                        gap: 6,
                        alignItems: "center",
                        fontSize: 12,
                        color: "var(--ui-muted)",
                      }}
                    >
                      <i style={{ background: item.color }} />
                      {item.label}
                    </span>
                  ))}
                </div>
                <div className="revenue-chart station-api-chart-empty">
                  <span>暂无收益趋势数据</span>
                </div>
                <div className="station-api-chart-axis">
                  <span>{dateRange.start}</span>
                  <span>{dateRange.end}</span>
                </div>
                <div className="revenue-chart-totals">
                  <span>
                    已结算 <b>—</b>
                  </span>
                  <span>
                    待结算 <b>—</b>
                  </span>
                  <span>
                    暂估 <b>—</b>
                  </span>
                </div>
              </section>
              <section className="revenue-sources">
                <div className="ui-section-heading">
                  <h2>收益构成</h2>
                  <span className="ui-muted">按收益来源</span>
                </div>
                <div className="revenue-source-list">
                  {Object.entries(sourceColors).map(([label, color]) => (
                    <div className="revenue-source" key={label}>
                      <div>
                        <span>
                          <i style={{ background: color }} />
                          {label}
                        </span>
                        <strong>—</strong>
                      </div>
                      <div className="revenue-source-track" />
                      <small>暂无数据</small>
                    </div>
                  ))}
                </div>
                <div className="revenue-source-net">
                  <span>净收益</span>
                  <strong>—</strong>
                </div>
              </section>
            </div>
            <div className="revenue-health">
              <section>
                <div className="ui-section-heading">
                  <h2>结算健康</h2>
                  <Badge>待核验</Badge>
                </div>
                <dl className="revenue-facts">
                  {["结算版本", "电价版本", "毛收益", "调差扣减"].map(
                    (label) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>—</dd>
                      </div>
                    ),
                  )}
                </dl>
                <p className="revenue-summary">
                  收益分析数据尚未接入，已登记结算记录可在结算明细中查看。
                </p>
              </section>
              <section>
                <div className="ui-section-heading">
                  <h2>待处理事项</h2>
                  <Badge>—</Badge>
                </div>
                <div className="revenue-empty" style={{ minHeight: 90 }}>
                  暂无分析数据
                </div>
              </section>
            </div>
            <section className="revenue-details">
              <div className="ui-section-heading">
                <h2>收益明细</h2>
                <Button onClick={() => setShowSettlement(true)}>
                  查看结算明细 <ChevronRight size={14} />
                </Button>
              </div>
              <div className="ui-table-scroll">
                <table className="ui-table revenue-table">
                  <thead>
                    <tr>
                      {[
                        "日期",
                        "峰谷套利",
                        "需量节省",
                        "光伏盈用",
                        "VPP响应",
                        "罚款与调差",
                        "净收益",
                        "数据状态",
                      ].map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td
                        colSpan={8}
                        style={{
                          textAlign: "center",
                          height: 100,
                          color: "var(--ui-muted)",
                        }}
                      >
                        暂无收益分析明细
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  )
}
function DemoStationRevenue({ station }: { station: Station }) {
  const [granularity, setGranularity] = useState<RevenueGranularity>("日")
  const [dateRange, setDateRange] = useState(() =>
    getDefaultRevenueDateRange("日"),
  )
  const [draft, setDraft] = useState<RevenueDateRange>(dateRange)
  const [dateError, setDateError] = useState("")
  const [dateOpen, setDateOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const model = useMemo(
    () => buildStationRevenueModel(station, granularity, dateRange),
    [station, granularity, dateRange],
  )
  const defaultRange = getDefaultRevenueDateRange(granularity)
  const isDefault =
    dateRange.start === defaultRange.start && dateRange.end === defaultRange.end
  const rangeLabel = isDefault
    ? { 日: "今天", 周: "本周", 月: "本月", 年: "今年" }[granularity]
    : "自定义范围"
  const periodLabel = isDefault
    ? { 日: "今日收益", 周: "本周收益", 月: "本月收益", 年: "今年收益" }[
        granularity
      ]
    : "选定范围收益"
  const comparisonLabel = {
    日: "上一日",
    周: "上一周",
    月: "上月",
    年: "上一年",
  }[granularity]
  const dataSource =
    station.revenueSource === "demo"
      ? "交付包结算数据"
      : model.trendDataSource === "connected"
        ? "已接入结算数据"
        : "补充运行估算"
  const ComparisonIcon =
    model.comparison.changePct >= 0 ? ArrowUpRight : ArrowDownRight
  const leadingSource = [...model.sources]
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)[0]

  useEffect(() => {
    const next = getDefaultRevenueDateRange("日")
    setGranularity("日")
    setDateRange(next)
    setDraft(next)
    setDateError("")
    dialog.current?.close()
    setDateOpen(false)
  }, [station.id])

  function changePeriod(next: RevenueGranularity) {
    const range = getDefaultRevenueDateRange(next)
    setGranularity(next)
    setDateRange(range)
    setDraft(range)
    setDateError("")
    dialog.current?.close()
    setDateOpen(false)
  }
  function applyRange() {
    if (!draft.start || !draft.end) {
      setDateError("请选择开始日期和结束日期")
      return
    }
    if (draft.start > draft.end) {
      setDateError("结束日期不能早于开始日期")
      return
    }
    setDateRange(draft)
    dialog.current?.close()
    setDateOpen(false)
    setDateError("")
  }
  function exportDetails() {
    const header = [
      "日期",
      "峰谷套利",
      "需量节省",
      "光伏盈用",
      "VPP响应",
      "罚款与调差",
      "净收益",
      "数据状态",
    ]
    const lines = model.detailRows.map((row) =>
      [
        row.date,
        row.peakValley,
        row.demand,
        row.pv,
        row.vpp,
        row.penalty,
        row.net,
        row.status,
      ].join(","),
    )
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${header.join(",")}\n${lines.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = `${station.shortName || station.name}-运营收益-${dateRange.start}-${dateRange.end}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  const metrics = [
    {
      label: periodLabel,
      value: model.netRevenue.toLocaleString("zh-CN"),
      unit: "CNY",
      detail: `较${comparisonLabel} ${
        model.comparison.changePct >= 0 ? "+" : ""
      }${model.comparison.changePct}%`,
      Icon: ComparisonIcon,
    },
    {
      label: "结算完成率",
      value: String(model.settlementRate),
      unit: "%",
      detail: `${money(model.settled)} 已结算`,
      Icon: Check,
    },
    {
      label: "待结算 / 暂估",
      value: model.unsettledAmount.toLocaleString("zh-CN"),
      unit: "CNY",
      detail: `待结算 ${money(model.pending)} · 暂估 ${money(model.est)}`,
      Icon: Clock3,
    },
    {
      label: "数据新鲜度",
      value: model.dataFreshness.detail,
      unit: "",
      detail: `最近数据 ${model.dataFreshness.latestDate}`,
      Icon: Activity,
    },
  ]
  const tasks = [
    ...(model.pending > 0
      ? [
          {
            title: `待结算 ${money(model.pending)}`,
            detail: "结算周期与回款状态待核验",
          },
        ]
      : []),
    ...(model.est > 0
      ? [{ title: `暂估 ${money(model.est)}`, detail: "尚未进入正式结算" }]
      : []),
    ...(station.dataStatus !== "connected"
      ? [{ title: "计量链路待核验", detail: model.meterStatus }]
      : []),
    ...(model.adjustment > 0
      ? [
          {
            title: `调差扣减 ${money(model.adjustment)}`,
            detail: "价格与策略执行记录待核验",
          },
        ]
      : []),
  ]

  return (
    <main className="ui-page revenue-workspace">
      <PageHeader
        title="运营收益"
        description={`${station.name} / ${model.strategy}`}
        actions={
          <>
            <Badge
              tone={
                dataSource === "交付包结算数据" ||
                dataSource === "已接入结算数据"
                  ? "success"
                  : "warning"
              }
            >
              {dataSource}
            </Badge>
            <Button onClick={exportDetails}>
              <Download />
              导出明细
            </Button>
          </>
        }
      />
      <div className="revenue-toolbar">
        <div className="ui-segmented" role="group" aria-label="收益时间粒度">
          {(["日", "周", "月", "年"] as const).map((item) => (
            <button
              type="button"
              key={item}
              data-granularity={item}
              aria-pressed={granularity === item && isDefault}
              onClick={() => changePeriod(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <Button
          title="选择日期范围"
          aria-haspopup="dialog"
          aria-expanded={dateOpen}
          data-time-range="station-revenue"
          onClick={() => {
            setDraft(dateRange)
            setDateError("")
            dialog.current?.showModal()
            setDateOpen(true)
          }}
        >
          <CalendarDays />
          <span>
            {dateRange.start} 至 {dateRange.end}
          </span>
          <ChevronDown />
        </Button>
        <span className="ui-muted">
          {rangeLabel} · 对比{comparisonLabel}
        </span>
        <span className="revenue-sync">
          <Activity size={14} />
          {model.dataFreshness.label}
        </span>
      </div>
      <div className="revenue-content">
        <section className="revenue-metrics" aria-label="收益关键指标">
          {metrics.map(({ label, value, unit, detail, Icon }) => (
            <div className="revenue-metric" key={label}>
              <span className="revenue-metric-label">{label}</span>
              <div className="revenue-metric-value">
                <strong
                  data-metric={`station-revenue-${label}`}
                  className={label === "数据新鲜度" ? "is-text" : ""}
                >
                  {value}
                </strong>
                <span>{unit}</span>
              </div>
              <span className="revenue-metric-detail">
                <Icon size={14} />
                {detail}
              </span>
            </div>
          ))}
        </section>
        <div className="revenue-main">
          <RevenueTrend model={model} />
          <RevenueSources key={station.id} model={model} />
        </div>
        <div className="revenue-health">
          <section>
            <div className="ui-section-heading">
              <h2>结算健康</h2>
              <Badge
                tone={
                  station.dataStatus === "connected" ? "success" : "warning"
                }
              >
                {model.meterStatus}
              </Badge>
            </div>
            <dl className="revenue-facts">
              {[
                ["结算版本", model.settlementVersion],
                ["电价版本", model.tariffVersion],
                ["毛收益", money(model.grossRevenue)],
                ["调差扣减", money(-model.adjustment)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="revenue-summary">
              {leadingSource ? (
                <>
                  主要收益来源：{leadingSource.label}，本周期贡献{" "}
                  <strong>{money(leadingSource.value)}</strong>。
                </>
              ) : (
                "该周期暂无正向收益。"
              )}
              未结算金额 <strong>{money(model.unsettledAmount)}</strong>。
            </p>
          </section>
          <section>
            <div className="ui-section-heading">
              <h2>待处理事项</h2>
              <Badge tone={tasks.length ? "warning" : "success"}>
                {tasks.length} 项
              </Badge>
            </div>
            <ul className="revenue-tasks">
              {tasks.map((task) => (
                <li key={task.title}>
                  <CircleAlert size={16} />
                  <div>
                    <strong>{task.title}</strong>
                    <span>{task.detail}</span>
                  </div>
                </li>
              ))}
              {!tasks.length && (
                <li>
                  <Check size={16} />
                  当前无待处理事项
                </li>
              )}
            </ul>
          </section>
        </div>
        <DetailTable
          key={`${station.id}-${dateRange.start}-${dateRange.end}`}
          model={model}
          dataSource={dataSource}
        />
      </div>
      <dialog
        ref={dialog}
        className="ui-dialog revenue-date-dialog"
        aria-labelledby="revenue-date-title"
        data-date-picker="station-revenue"
        onClose={() => setDateOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="ui-dialog-heading">
          <h2 id="revenue-date-title">选择日期范围</h2>
          <Button
            iconOnly
            variant="ghost"
            title="关闭"
            aria-label="关闭日期选择"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </Button>
        </div>
        <div className="revenue-date-fields">
          {(["start", "end"] as const).map((key) => (
            <label key={key}>
              {key === "start" ? "开始日期" : "结束日期"}
              <input
                className="ui-input"
                type="date"
                value={draft[key]}
                data-date-start-input={key === "start" ? true : undefined}
                data-date-end-input={key === "end" ? true : undefined}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                  setDateError("")
                }}
              />
            </label>
          ))}
        </div>
        {dateError && (
          <p className="ui-error" role="alert">
            {dateError}
          </p>
        )}
        <div className="ui-dialog-actions">
          <Button data-date-cancel onClick={() => dialog.current?.close()}>
            取消
          </Button>
          <Button variant="primary" data-date-apply onClick={applyRange}>
            应用
          </Button>
        </div>
      </dialog>
    </main>
  )
}
