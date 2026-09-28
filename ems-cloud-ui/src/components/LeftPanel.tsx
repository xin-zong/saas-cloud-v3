import { DEMO_MODE } from "@/api/client"
import { useMemo, useState } from "react"
import {
  AlertTriangle,
  CircleCheckBig,
  Flame,
  Leaf,
  PlugZap,
  TreePine,
} from "lucide-react"
import { Bar, BarChart, Tooltip, XAxis, ResponsiveContainer } from "recharts"
import type { Station } from "@/App"
import type { UserRole } from "@/auth/roles"
import {
  buildDeviceSummary,
  buildEnvironmentalMetrics,
  buildStatusItems,
  buildStorageTrend,
  summarizeTrend,
} from "@/data/stationMetrics"

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.88)",
        color: "#fff",
        padding: "5px 9px",
        borderRadius: 5,
        fontSize: 10,
      }}
    >
      <div style={{ color: "#76857f", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "#78aa9b" }}>充 {payload[0]?.value}</div>
      <div style={{ color: "#b7d4c9" }}>放 {payload[1]?.value}</div>
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
  onViewStations?: () => void
}

function formatMwh(value: number) {
  return value >= 1000 ? value.toLocaleString() : value.toFixed(2)
}

function EnvironmentalIcon({ kind }: { kind: string }) {
  return <img src={`/figma/overview/map/${kind === "coal" ? "imgFlame" : kind === "tree" ? "imgTrees" : "imgLeaf"}.svg`} alt="" />
}

export default function LeftPanel({ stations, role, onViewStations }: Props) {
  const [tab, setTab] = useState<"today" | "month">("today")
  const statusItems = useMemo(() => buildStatusItems(stations).map(item => ({ ...item, color: ({ online: "#2f875a", fault: "#ef4444", offline: "#94a3b8", building: "#4c6ef5" })[item.status] })), [stations])
  const deviceSummary = useMemo(() => buildDeviceSummary(stations), [stations])
  const data = useMemo(() => DEMO_MODE ? buildStorageTrend(stations, tab) : [], [stations, tab])
  const trendSummary = useMemo(() => summarizeTrend(data), [data])
  const environmental = useMemo(() => buildEnvironmentalMetrics(stations), [stations])
  const activeAlarms = stations.reduce(
    (sum, station) => sum + station.alerts.length,
    0,
  )
  const faultDevices = stations.reduce(
    (sum, station) => sum + station.devices.fault,
    0,
  )
  const offlineDevices = stations.reduce(
    (sum, station) => sum + station.devices.offline,
    0,
  )
  const connectedStations = stations.filter(
    (station) => station.dataStatus === "connected",
  ).length
  const partialStations = stations.filter(
    (station) => station.dataStatus === "partial",
  ).length
  const pendingStations = Math.max(
    0,
    stations.length - connectedStations - partialStations,
  )
  const roleScope =
    role === "owner" ? "资产范围" : role === "operator" ? "责任范围" : "交付范围"


  return (
    <div className="flex flex-col gap-2.5">
<div style={card} className="overview-status-card">
<div className="overview-status-heading"><span style={title}>站点运营概况</span>{onViewStations ? <button aria-label="查看站点列表" onClick={onViewStations}><img src="/figma/overview/map/imgChevronRight.svg" alt="" /></button> : <span style={label}>{roleScope}</span>}</div>
<div className="overview-status-total"><span style={label}>站点总数</span><strong data-metric="station-total">{stations.length}</strong></div>
<div className="overview-status-bar">{statusItems.map(item => <span key={item.status} style={{ flex: DEMO_MODE ? item.count : 1, background: DEMO_MODE ? item.color : "#e6eee9" }} />)}</div>
<div className="overview-status-counts">{statusItems.map(item => <span key={item.status}><i style={{ background: item.color }} />{item.label} <b data-metric={"station-status-" + item.status}>{DEMO_MODE ? item.count : "—"}</b></span>)}</div>
<div className="overview-status-total"><span style={label}>关联设备数</span><strong data-metric="device-total">{DEMO_MODE ? deviceSummary.total : stations.reduce((sum, station) => sum + (station.deviceInventory?.length ?? 0), 0)}</strong></div>
<div className="overview-status-bar"><span style={{ width: DEMO_MODE ? deviceSummary.onlinePct + "%" : "0%", background: "#2f875a" }} /></div>
</div>
      {role !== "integrator" ? (
        <div style={card} className="overview-storage-card">
          <div className="mb-3 flex items-center justify-between">
            <span style={title}>储能充放趋势</span>
            <div className="flex gap-3">
              {(["today", "month"] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setTab(item)}
                  style={{
                    fontSize: 10,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: tab === item ? "#1f7a68" : "#76857f",
                    fontWeight: tab === item ? 600 : 400,
                    borderBottom: `1px solid ${
                      tab === item ? "#1f7a68" : "transparent"
                    }`,
                    paddingBottom: 1,
                  }}
                >
                  {item === "today" ? "今日" : "本月"}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex gap-4">
            <div>
              <div style={label}>充电量</div>
              <div
                data-metric="charge-total"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#1f7a68",
                  marginTop: 1,
                }}
              >
                {DEMO_MODE ? formatMwh(trendSummary.charge) : "—"}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 400,
                    marginLeft: 2,
                    color: "#76857f",
                  }}
                >
                  MWh
                </span>
              </div>
            </div>
            <div style={{ width: 1, background: "#e6eee9" }} />
            <div>
              <div style={label}>放电量</div>
              <div
                data-metric="discharge-total"
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#78aa9b",
                  marginTop: 1,
                }}
              >
                {DEMO_MODE ? formatMwh(trendSummary.discharge) : "—"}
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 400,
                    marginLeft: 2,
                    color: "#76857f",
                  }}
                >
                  MWh
                </span>
              </div>
            </div>
          </div>

          <div style={{ height: 120, position: "relative" }} data-chart="storage-trend">
            {!DEMO_MODE && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", borderBottom: "1px solid #e6eee9", background: "repeating-linear-gradient(to top, transparent 0 23px, #f0f5f2 23px 24px)", ...label }}>暂无充放电数据</div>}
            <ResponsiveContainer width="100%" height="100%"><BarChart
              data={data}
              barGap={1}
              barSize={tab === "today" ? 5 : 9}
              margin={{ top: 16, right: 0, bottom: 0, left: 0 }}
            >
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ fill: "rgba(148,163,184,0.07)" }}
              />
              <Bar dataKey="charge" stackId="energy" fill="#2f875a" radius={[2, 2, 0, 0]} />
              <Bar
                dataKey="discharge" stackId="energy"
                fill="#4c6ef5"
                radius={[1, 1, 0, 0]}
              />
            </BarChart></ResponsiveContainer>
          </div>

        </div>
      ) : (
        <div style={card} data-role-panel="delivery-progress">
          <div style={{ ...title, marginBottom: 12 }}>建站与接入进度</div>
          {[
            {
              label: "已完成接入",
              value: connectedStations,
              icon: CircleCheckBig,
              color: "#16734b",
            },
            {
              label: "部分接入",
              value: partialStations,
              icon: PlugZap,
              color: "#925c0b",
            },
            {
              label: "待接入 / 建设中",
              value: pendingStations,
              icon: AlertTriangle,
              color: "#61716b",
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="flex items-center gap-2.5"
                style={{
                  minHeight: 37,
                  borderBottom: "1px solid #edf3ef",
                }}
              >
                <Icon size={14} style={{ color: item.color }} />
                <span style={{ flex: 1, fontSize: 10, color: "#61716b" }}>
                  {item.label}
                </span>
                <strong
                  style={{
                    ...mono,
                    fontSize: 14,
                    color: "#1d2f2a",
                  }}
                >
                  {DEMO_MODE ? item.value : "—"}
                </strong>
              </div>
            )
          })}
        </div>
      )}

      {role === "owner" ? (
        <div style={card} data-role-panel="environmental-benefits">
          <div style={{ ...title, marginBottom: 12 }}>社会与环境效益</div>
          <div className="grid grid-cols-3 gap-2">
            {environmental.map((item) => (
              <div
                key={item.kind}
                className="flex flex-col items-center"
                style={{
                  padding: "8px 4px",
                  background: "#f5f9f6",
                  borderRadius: 8,
                }}
              >
                <div style={{ color: "#1f7a68", marginBottom: 4 }}>
                  <EnvironmentalIcon kind={item.kind} />
                </div>
                <div
                  data-metric={`environment-${item.kind}`}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#1d2f2a",
                    lineHeight: 1,
                  }}
                >
                  {DEMO_MODE ? item.value.toLocaleString() : "—"}
                </div>
                <div style={{ fontSize: 8, color: "#76857f", marginTop: 2 }}>
                  {item.unit}
                </div>
                <div style={{ fontSize: 9, color: "#61716b", marginTop: 1 }}>
                  {item.label}{item.unit}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : role === "operator" ? (
        <div style={card} data-role-panel="maintenance-duty">
          <div style={{ ...title, marginBottom: 12 }}>当班处置态势</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["活动告警", activeAlarms],
              ["故障设备", faultDevices],
              ["离线设备", offlineDevices],
            ].map(([itemLabel, value]) => (
              <div
                key={itemLabel}
                className="flex flex-col items-center"
                style={{ padding: "9px 4px", background: "#f5f9f6" }}
              >
                <strong
                  style={{ ...mono, fontSize: 14, color: "#1d2f2a" }}
                >
                  {DEMO_MODE || itemLabel === "活动告警" ? value : "—"}
                </strong>
                <span style={{ marginTop: 3, fontSize: 9, color: "#61716b" }}>
                  {itemLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={card} data-role-panel="device-access">
          <div style={{ ...title, marginBottom: 12 }}>设备接入概况</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["在线", deviceSummary.online],
              ["故障", faultDevices],
              ["离线", offlineDevices],
            ].map(([itemLabel, value]) => (
              <div
                key={itemLabel}
                className="flex flex-col items-center"
                style={{ padding: "9px 4px", background: "#f5f9f6" }}
              >
                <strong
                  style={{ ...mono, fontSize: 14, color: "#1d2f2a" }}
                >
                  {DEMO_MODE || itemLabel === "活动告警" ? value : "—"}
                </strong>
                <span style={{ marginTop: 3, fontSize: 9, color: "#61716b" }}>
                  {itemLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
