import { DEMO_MODE } from "@/api/client"
import { useMemo } from "react"
import { Area, AreaChart, Cell, Pie, PieChart, Tooltip } from "recharts"
import type { Station } from "@/App"
import type { UserRole } from "@/auth/roles"
import {
  buildCapacityItems,
  buildEnergyMix,
  buildRevenueSeries,
  buildRevenueSummary,
  formatCompactCurrency,
} from "@/data/stationMetrics"

const RevTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.88)",
        color: "#fff",
        padding: "3px 7px",
        borderRadius: 4,
        fontSize: 10,
      }}
    >
      ¥{payload[0]?.value}
    </div>
  )
}

const card = {
  background: "rgba(255,255,255,0.94)",
  border: "1px solid transparent",
  borderRadius: 12,
  backdropFilter: "blur(12px)",
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
  padding: "16px",
} as const

const label = { fontSize: 10, color: "#76857f" } as const
const title = { fontSize: 14, fontWeight: 700, color: "#18232d" } as const
const mono = { fontFamily: "'JetBrains Mono',monospace" } as const

interface Props {
  stations: Station[]
  role: UserRole
}

export default function RightPanel({ stations, role }: Props) {
  const capacityItems = useMemo(() => buildCapacityItems(stations), [stations])
  const energyData = useMemo(() => buildEnergyMix(stations).map((item, index) => ({ ...item, color: ["#4c6ef5", "#2f875a", "#f59e0b"][index] })), [stations])
  const revenueData = useMemo(() => DEMO_MODE ? buildRevenueSeries(stations) : [], [stations])
  const revenueSummary = useMemo(() => buildRevenueSummary(stations), [stations])
  const total = energyData.reduce((a, b) => a + b.value, 0)
  const activeAlarms = stations.reduce(
    (sum, station) => sum + station.alerts.length,
    0,
  )
  const faultDevices = stations.reduce(
    (sum, station) => sum + station.devices.fault,
    0,
  )
  const healthyStations = stations.filter(
    (station) => station.status === "online" && !station.alerts.length,
  ).length
  const connectedStations = stations.filter(
    (station) => station.dataStatus === "connected",
  ).length
  const pendingStations = stations.filter(
    (station) =>
      station.status === "building" || station.dataStatus !== "connected",
  ).length
  const accessRate = stations.length
    ? Math.round((connectedStations / stations.length) * 100)
    : 0


  return (
    <div className="flex flex-col gap-2.5">
      <div style={card}>
        <div className="mb-3 flex items-center justify-between">
          <span style={title}>
            {role === "integrator" ? "已接入容量" : "在线运行容量"}
          </span>
          <span style={{ ...label, fontSize: 9 }}>TODAY</span>
        </div>

        <div className="flex flex-col gap-2">
          {capacityItems.map((item) => (
            <div key={item.label}>
              <div className="mb-1.5 flex items-center justify-between">
                <span style={{ fontSize: 10, color: "#465b53" }}>
                  {item.label}
                </span>
                <div className="flex items-baseline gap-1">
                  <span
                    data-metric={`capacity-${item.label}`}
                    style={{
                      ...mono,
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#1d2f2a",
                    }}
                  >
                    {DEMO_MODE ? item.value : "—"}
                  </span>
                  <span style={{ ...mono, fontSize: 9, color: "#76857f" }}>
                    / {DEMO_MODE ? item.total : item.label === "储能系统" && stations.length ? (stations.reduce((sum, station) => sum + station.storageCapacity, 0) / 1000).toLocaleString() : "—"} {item.unit}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="flex-1 overflow-hidden rounded-full"
                  style={{ height: 4, background: "#e6eee9" }}
                >
                  <div
                    style={{
                      width: `${DEMO_MODE ? item.pct : 0}%`,
                      height: "100%",
                      background: item.color,
                      borderRadius: 4,
                      transition: "width 0.6s ease",
                    }}
                  />
                </div>
                <span
                  style={{
                    ...mono,
                    fontSize: 9,
                    color: "#76857f",
                    minWidth: 26,
                    textAlign: "right",
                  }}
                >
                  {DEMO_MODE ? `${item.pct}%` : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <div className="mb-3 flex items-center justify-between">
          <span style={title}>
            {role === "integrator" ? "站点能源构成" : "能源供应与构成"}
          </span>
          <span style={{ ...label, fontSize: 9 }}>TODAY</span>
        </div>

        <div className="flex items-center gap-3">
          <div
            className="relative flex-shrink-0"
            data-chart="energy-mix"
            style={{ width: 72, height: 72 }}
          >
            <PieChart width={72} height={72}>
              <Pie
                isAnimationActive={false}
                data={DEMO_MODE ? energyData : [{ name: "暂无数据", value: 1, color: "#e6eee9" }]}
                cx="50%"
                cy="50%"
                innerRadius={22}
                outerRadius={34}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
                strokeWidth={2}
                stroke="#fff"
              >
                {(DEMO_MODE ? energyData : [{ name: "暂无数据", value: 1, color: "#e6eee9" }]).map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                data-metric="energy-total"
                style={{ ...mono, fontSize: 13, fontWeight: 700, color: "#1d2f2a" }}
              >
                {DEMO_MODE ? total.toFixed(2) : "—"}
              </span>
              <span style={{ fontSize: 8, color: "#76857f" }}>MW</span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2">
            {energyData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: item.color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 10, color: "#61716b" }}>
                    {item.name}
                  </span>
                </div>
                <span
                  style={{
                    ...mono,
                    fontSize: 10,
                    fontWeight: 600,
                    color: "#24423b",
                  }}
                >
                  {DEMO_MODE ? item.value : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {role === "owner" ? (
        <div style={card} data-role-panel="revenue-summary">
          <div style={{ ...title, marginBottom: 12 }}>收益概览</div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {[
              {
                label: "昨日收益",
                value: formatCompactCurrency(revenueSummary.yesterday),
                metric: "revenue-yesterday",
              },
              {
                label: "累计收益",
                value: formatCompactCurrency(revenueSummary.cumulative),
                metric: "revenue-cumulative",
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  background: "#f5f9f6",
                  borderRadius: 8,
                  padding: "8px 10px",
                }}
              >
                <div style={label}>{item.label}</div>
                <div
                  data-metric={item.metric}
                  style={{
                    ...mono,
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1d2f2a",
                    marginTop: 2,
                  }}
                >
                  {DEMO_MODE ? item.value : "—"}
                </div>
              </div>
            ))}
          </div>

          <div style={{ height: 48, position: "relative" }} data-chart="revenue-trend">
            {!DEMO_MODE && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", borderBottom: "1px solid #e6eee9", ...label }}>暂无收益趋势数据</div>}
            <AreaChart
              width={200}
              height={48}
              data={revenueData}
              margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ff9800" stopOpacity={0.06} />
                  <stop offset="95%" stopColor="#ff9800" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Tooltip content={<RevTooltip />} />
              <Area
                type="monotone"
                dataKey="v"
                stroke="#ff9800"
                strokeWidth={1.5}
                fill="url(#revGrad)"
                dot={false}
              />
            </AreaChart>
          </div>
        </div>
      ) : role === "operator" ? (
        <div style={card} data-role-panel="operation-health">
          <div style={{ ...title, marginBottom: 12 }}>运行健康</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["健康站点", healthyStations],
              ["活动告警", activeAlarms],
              ["故障设备", faultDevices],
            ].map(([itemLabel, value]) => (
              <div
                key={itemLabel}
                style={{ background: "#f5f9f6", padding: "9px 5px" }}
              >
                <div style={label}>{itemLabel}</div>
                <strong
                  style={{
                    ...mono,
                    display: "block",
                    marginTop: 3,
                    color: "#1d2f2a",
                    fontSize: 14,
                  }}
                >
                  {DEMO_MODE || itemLabel === "活动告警" ? value : "—"}
                </strong>
              </div>
            ))}
          </div>
          <p
            style={{
              margin: "10px 0 0",
              color: "#61716b",
              fontSize: 9,
              lineHeight: 1.5,
            }}
          >
            告警处置、巡检与工单操作请进入运维中心。
          </p>
        </div>
      ) : (
        <div style={card} data-role-panel="delivery-readiness">
          <div style={{ ...title, marginBottom: 12 }}>交付就绪度</div>
          <div className="mb-2 flex items-end justify-between">
            <div>
              <div style={label}>站点接入完成率</div>
              <strong
                style={{
                  ...mono,
                  display: "block",
                  marginTop: 3,
                  color: "#1d2f2a",
                  fontSize: 20,
                }}
              >
                {DEMO_MODE ? `${accessRate}%` : "—"}
              </strong>
            </div>
            <span style={{ ...label }}>
              {DEMO_MODE ? connectedStations : "—"} / {stations.length} 站
            </span>
          </div>
          <div
            style={{
              height: 5,
              overflow: "hidden",
              background: "#e6eee9",
              borderRadius: 3,
            }}
          >
            <div
              style={{
                width: `${DEMO_MODE ? accessRate : 0}%`,
                height: "100%",
                background: "#1f7a68",
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span style={label}>待接入或待补全</span>
            <strong style={{ ...mono, fontSize: 13, color: "#1d2f2a" }}>
              {DEMO_MODE ? pendingStations : "—"}
            </strong>
          </div>
        </div>
      )}
    </div>
  )
}
