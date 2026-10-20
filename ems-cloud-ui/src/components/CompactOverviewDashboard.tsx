import { useEffect, useState } from "react"

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { normalizeTelemetry } from "@/data/stationTelemetry"

import { parseDateTimeInput } from "@/preferences/date"

import type { Station } from "@/App"

import type { AuthUser, NavLabel } from "@/auth/roles"

import { hasStationPermission } from "@/auth/apiPermissions"

import { allRows, DEMO_MODE, type ApiRow } from "@/api/client"

import { overviewCommunication } from "./overviewCommunication"

import { dateKey, formatDate } from "@/preferences/date"

import MapView from "./MapView"

import "./compact-overview-dashboard.css"

export function observedEnergyTrend(
  stations: Station[],
  start: string,
  end: string,
) {
  const days = new Map<string, {
    date: string
    charge: number
    discharge: number
  }>()

  for (const station of stations) {
    const telemetry = normalizeTelemetry(station.telemetryHistory ?? [])

    const samples = telemetry.some((p) => Number.isFinite(p.storage))
      ? telemetry
      : (station.operations?.samples ?? []).map((p) => ({
          timestamp: Date.parse(p.timestamp),
          storage: p.storage,
          intervalMinutes: undefined,
        }))

    const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp)

    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1],
        b = sorted[i],
        minutes = (b.timestamp - a.timestamp) / 60000

      const day = dateKey(a.timestamp)

      if (
        !day ||
        day < start ||
        day > end ||
        day !== dateKey(b.timestamp) ||
        !Number.isFinite(a.storage) ||
        !Number.isFinite(b.storage) ||
        minutes <= 0 ||
        minutes > 60
      )
        continue

      const row = days.get(day) ?? { date: day, charge: 0, discharge: 0 }

      const first = a.storage!,
        last = b.storage!,
        hours = minutes / 60

      // Integrate only observed adjacent good samples; missing days stay absent.

      const split =
        first * last < 0
          ? Math.abs(first) / (Math.abs(first) + Math.abs(last))
          : null

      if (split !== null) {
        const e1 = (Math.abs(first) * hours * split) / 2 / 1000,
          e2 = (Math.abs(last) * hours * (1 - split)) / 2 / 1000
        row[first < 0 ? "charge" : "discharge"] += e1
        row[last < 0 ? "charge" : "discharge"] += e2
      } else {
        row.charge +=
          (((Math.max(0, -first) + Math.max(0, -last)) / 2) * hours) / 1000
        row.discharge +=
          (((Math.max(0, first) + Math.max(0, last)) / 2) * hours) / 1000
      }

      days.set(day, row)
    }
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

type Props = {
  stations: Station[]

  user: AuthUser

  region: string

  onOpenStation: (id: string, subNav?: string) => void

  onNavigate: (nav: NavLabel) => void

  nav: NavLabel[]

  show: (card: string) => boolean

  period: string

  range: {
    start: string
    end: string
  }
}

export default function CompactOverviewDashboard({
  stations,

  user,

  region,

  onOpenStation,

  onNavigate,

  nav,

  show,

  period,

  range,
}: Props) {
  const [approvals, setApprovals] = useState<ApiRow[]>([]),
    [approvalError, setApprovalError] = useState(false)

  const canApproval = DEMO_MODE || user.permissions.includes("approval.read")

  const scope = stations

    .map((s) => s.id)

    .sort()

    .join("|")

  const permissions = JSON.stringify(user.stationPermissions ?? {})

  useEffect(() => {
    setApprovals([])

    setApprovalError(false)

    if (DEMO_MODE || !canApproval) return

    const control = new AbortController()

    allRows("/approvals", control.signal)

      .then(setApprovals)

      .catch(() => {
        if (!control.signal.aborted) setApprovalError(true)
      })

    return () => control.abort()
  }, [user.id, canApproval, scope, permissions])

  const allowed = (s: Station, p: string) =>
    DEMO_MODE || hasStationPermission(user, s.id, p)

  const communication = overviewCommunication(stations, DEMO_MODE)

  const alerts = stations

    .filter((s) => allowed(s, "alarm.read"))

    .flatMap((s) => s.alerts.map((a) => ({ ...a, station: s })))

  const severe = new Set(
    alerts.filter((a) => a.level === "critical").map((a) => a.station.id),
  ).size

  const warning = new Set(
    alerts

      .filter(
        (a) =>
          a.level !== "critical" &&
          !alerts.some(
            (b) => b.station.id === a.station.id && b.level === "critical",
          ),
      )

      .map((a) => a.station.id),
  ).size

  const normal = stations.filter(
    (s) =>
      allowed(s, "alarm.read") &&
      !alerts.some((a) => a.station.id === s.id) &&
      overviewCommunication([s], DEMO_MODE).online > 0,
  ).length

  const unknown = Math.max(0, stations.length - normal - warning - severe)

  const health = [
    { label: "正常运行", value: normal, color: "#008684" },

    { label: "警告状态", value: warning, color: "#9a5700" },

    { label: "严重故障", value: severe, color: "#b42318" },

    ...(unknown
      ? [{ label: "状态未知", value: unknown, color: "#a5a5aa" }]
      : []),
  ]

  let cursor = 0

  const stops = health.map((h) => {
    const start = cursor

    cursor += stations.length ? (h.value / stations.length) * 100 : 0

    return `${h.color} ${start}% ${cursor}%`
  })

  const todayRevenue = stations

    .filter((s) => allowed(s, "revenue.read"))

    .flatMap((s) =>
      (s.revenueHistory ?? []).filter(
        (p) =>
          p.date.slice(0, 10) === dateKey(new Date()) &&
          typeof p.amount === "number" &&
          Number.isFinite(p.amount),
      ),
    )

  const groups = [...new Set(stations.map((s) => s.region || "未设置区域"))]

    .slice(0, 2)

    .map((name) => ({
      name,

      stations: stations.filter((s) => (s.region || "未设置区域") === name),
    }))

  const orders = stations

    .filter((s) => allowed(s, "workorder.read"))

    .flatMap((s) =>
      (s.maintenance?.workOrders ?? []).map((order) => ({ order, station: s })),
    )

    .sort(
      (a, b) =>
        Date.parse(b.order.createdAt ?? "") -
        Date.parse(a.order.createdAt ?? ""),
    )

    .slice(0, 3)

  const pending = (
    DEMO_MODE
      ? stations.flatMap((s) =>
          (s.maintenance?.approvals ?? []).map((a) => ({
            id: a.id,

            title: a.title,

            status: a.status,

            station_id: s.id,

            requester_name: a.submitter,

            submitted_at: a.submittedAt,
          })),
        )
      : approvals
  )

    .filter(
      (a) =>
        a.status === "pending" &&
        stations.some(
          (s) => String(a.station_id) === s.id && allowed(s, "approval.read"),
        ),
    )

    .slice(0, 3)

  const goOrders = nav.includes("工单与审批")
    ? () => onNavigate("工单与审批")
    : undefined

  const end = period === "自定义" ? range.end : dateKey(new Date())

  const endDate = parseDateTimeInput(end)

  const start =
    period === "自定义"
      ? range.start
      : dateKey(
          endDate.getTime() -
            (period === "近30天" ? 29 : period === "近7天" ? 6 : 0) * 86400000,
        )

  const trend = show("储能充放趋势")
    ? observedEnergyTrend(
        stations.filter((s) => allowed(s, "telemetry.read")),
        start,
        end,
      )
    : []

  const plottedTrend = trend.flatMap((row, index) =>
    index && Date.parse(row.date) - Date.parse(trend[index - 1].date) > 86400000
      ? [
          {
            date: dateKey(
              parseDateTimeInput(trend[index - 1].date).getTime() + 86400000,
            ),
            charge: null,
            discharge: null,
          },
          row,
        ]
      : [row],
  )

  const trendTitle =
    period === "近7天"
      ? "近7天并网储能充放量趋势"
      : period === "近30天"
        ? "近30天并网储能充放量趋势"
        : period === "今日"
          ? "今日并网储能充放量趋势"
          : "自定义并网储能充放量趋势"

  return (
    <div className="compact-dashboard-content" data-figma-node="3666:5742">
      <div className="compact-kpi-row" aria-label="总览核心指标">
        {[
          {
            label: "站点总数",

            value: show("站点运营概况") ? stations.length : "—",

            unit: "个",
          },

          {
            label: "在线站点",

            value: show("站点运营概况") ? communication.online : "—",

            unit: stations.length
              ? `${((communication.online / stations.length) * 100).toFixed(1)}%`
              : "",
          },

          {
            label: "待处理告警",

            value: show("异常与告警实时监控") ? alerts.length : "—",

            unit: "项",
          },

          {
            label: "今日收益",

            value:
              show("收益概览") && todayRevenue.length
                ? todayRevenue.reduce((sum, p) => sum + p.amount!, 0).toFixed(2)
                : "—",

            unit: "元",
          },
        ].map((k) => (
          <article className="compact-kpi" key={k.label}>
            <span>{k.label}</span>
            <div>
              <strong>{k.value}</strong>
              <small>{k.unit}</small>
            </div>
          </article>
        ))}
      </div>
      <div className="compact-dual-row compact-health-row">
        <section className="compact-panel">
          <h2>运行健康分布</h2>
          {show("站点运营概况") ? (
            <div className="compact-health-body">
              <div
                className="compact-health-ring"
                style={{
                  background: stations.length
                    ? `conic-gradient(${stops.join(",")})`
                    : "#e8e8ed",
                }}
              >
                <div>
                  <strong>{stations.length}</strong>
                  <small>总站数</small>
                </div>
              </div>
              <div className="compact-health-legend">
                {health.map((h) => (
                  <div key={h.label}>
                    <span>
                      <i style={{ background: h.color }} />
                      {h.label}
                    </span>
                    <b>
                      {h.value} 个（
                      {stations.length
                        ? Math.round((h.value / stations.length) * 100)
                        : 0}
                      %）
                    </b>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="compact-empty">该模块已在页面定制中隐藏</div>
          )}
        </section>
        <section className="compact-panel">
          <h2>当前各区域储能负荷分布 (MWh)</h2>
          <div className="compact-region-load">
            {show("在线运行容量") && groups.length ? (
              groups.map((g) => (
                <div key={g.name}>
                  <div>
                    <span>{g.name}</span>
                    <b>
                      — /{" "}
                      {g.stations.every((s) =>
                        Number.isFinite(s.storageCapacity),
                      )
                        ? (
                            g.stations.reduce(
                              (sum, s) => sum + s.storageCapacity,

                              0,
                            ) / (DEMO_MODE ? 1 : 1000)
                          )

                            .toFixed(2)
                        : "—"}{" "}
                      MWh
                    </b>
                  </div>
                  <div className="compact-load-track" />
                </div>
              ))
            ) : (
              <div className="compact-empty">暂无授权站点容量数据</div>
            )}
            <small>负荷数据未接通</small>
          </div>
        </section>
      </div>
      <div className="compact-dual-row compact-trend-row">
        <section className="compact-panel">
          <header>
            <h2>{trendTitle}</h2>
            <div className="compact-chart-legend">
              <span>
                <i />
                充电量 (MWh)
              </span>
              <span>
                <i />
                放电量 (MWh)
              </span>
            </div>
          </header>
          {trend.length ? (
            <div
              className="compact-live-chart"
              data-chart="observed-energy-trend"
              aria-label="已观测充放量趋势"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={plottedTrend}
                  margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--ui-border)"
                    strokeDasharray="2 3"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(date) => date.slice(5)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "var(--ui-muted)" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "var(--ui-muted)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--ui-surface)",
                      borderColor: "var(--ui-border)",
                      color: "var(--ui-text)",
                      fontSize: 11,
                    }}
                  />
                  <Line
                    dataKey="charge"
                    name="充电量 (MWh)"
                    stroke="#008684"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="discharge"
                    name="放电量 (MWh)"
                    stroke="#0071e3"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={{ r: 2 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <small>按有效采样区间积分，仅统计已观测数据</small>
            </div>
          ) : (
            <div
              className="compact-chart-empty"
              role="img"
              aria-label="暂无储能趋势数据"
            >
              <div className="compact-chart-grid" />
              <span>
                {!user.permissions.includes("telemetry.read") && !DEMO_MODE
                  ? "当前账号无查看权限"
                  : !show("储能充放趋势")
                    ? "该模块已在页面定制中隐藏"
                    : "暂无已连接的数据"}
              </span>
            </div>
          )}
        </section>
        <section className="compact-panel compact-map-panel">
          <h2>核心站点区域分布</h2>
          <div
            className="compact-region-map"
            role="region"
            aria-label="核心站点实时地图"
          >
            <MapView
              compact
              stations={stations}
              region={region}
              selectedStation={null}
              onSelectStation={(s) => onOpenStation(s.id)}
            />
          </div>
        </section>
      </div>
      <div className="compact-dual-row compact-work-row">
        <section className="compact-panel">
          <header>
            <h2>最新运维工单</h2>
            {goOrders && user.permissions.includes("workorder.read") && (
              <button onClick={goOrders}>查看全部 →</button>
            )}
          </header>
          <table>
            <thead>
              <tr>
                <th>工单编号</th>
                <th>工单类型</th>
                <th>目标场站</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {orders.length ? (
                orders.map(({ order, station }) => (
                  <tr
                    key={`${station.id}:${order.id}`}
                    onClick={goOrders}
                  >
                    <td>{order.id}</td>
                    <td>{order.title}</td>
                    <td>{station.name}</td>
                    <td>
                      <span className={`compact-status ${order.status}`}>
                        {
                          {
                            pending: "待处理",

                            processing: "进行中",

                            completed: "已完成",

                            cancelled: "已取消",
                          }[order.status]
                        }
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="compact-empty">
                    当前范围暂无可查看工单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="compact-panel">
          <header>
            <h2>待审批事项</h2>
            {goOrders && canApproval && (
              <button onClick={goOrders}>查看全部 →</button>
            )}
          </header>
          <div className="compact-approvals">
            {pending.length ? (
              pending.map((a) => (
                <button key={String(a.id)} onClick={goOrders}>
                  <div>
                    <strong>{String(a.title)}</strong>
                    <small>{String(a.requester_name ?? "—")} 发起</small>
                  </div>
                  <time>
                    {formatDate(String(a.submitted_at), {
                      month: "2-digit",

                      day: "2-digit",

                      hour: "2-digit",

                      minute: "2-digit",
                    })}
                  </time>
                </button>
              ))
            ) : (
              <div className="compact-empty">
                {approvalError
                  ? "审批数据加载失败"
                  : canApproval
                    ? "暂无可查看的待审批事项"
                    : "当前账号无查看权限"}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
