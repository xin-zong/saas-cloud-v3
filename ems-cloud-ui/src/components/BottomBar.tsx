import { DEMO_MODE } from "@/api/client"
import { useMemo, useState } from "react"
import { AlertTriangle, Bell, ChevronRight } from "lucide-react"
import type { Station } from "@/App"
import type { UserRole } from "@/auth/roles"
import { buildGlobalAlerts, buildSubsystems } from "@/data/stationMetrics"

interface Props {
  stations: Station[]
  onSelectStation: (s: Station) => void
  onViewAll: () => void
  role: UserRole
}

export default function BottomBar({
  stations,
  onSelectStation,
  onViewAll,
  role,
}: Props) {
  const [hoveredAlert, setHoveredAlert] = useState<number | null>(null)
  const globalAlerts = useMemo(() => buildGlobalAlerts(stations), [stations])
  const subsystems = useMemo(() => buildSubsystems(stations), [stations])
  const visibleAlerts = globalAlerts.slice(0, 2)
  const heading =
    role === "owner"
      ? "资产安全动态"
      : role === "operator"
        ? "异常与告警实时监控"
        : "接入异常与交付提醒"
  const actionLabel =
    role === "owner" ? "查看异常站点" : "进入运维中心"
  const subsystemHeading =
    role === "integrator" ? "设备接入与通信" : "子系统可用性与出力"

  return (
    <div
      className="flex-shrink-0 flex items-stretch"
      style={{
        height: 96,
        background: "rgba(255,255,255,0.94)",
        borderTop: "1px solid #dbe6df",
        boxShadow: "0 -10px 24px rgba(24,52,45,0.06)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        className="flex flex-col justify-center px-6"
        style={{ flex: 1, borderRight: "1px solid #e6eee9", minWidth: 0 }}
      >
        <div className="mb-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={14} style={{ color: "#ef4444" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>
              {heading}
            </span>
          </div>
          <button
            className="flex items-center gap-1"
            style={{ color: "#176b5d", fontSize: 12 }}
            onClick={onViewAll}
          >
            {actionLabel}
            <ChevronRight size={12} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {visibleAlerts.map((alert, index) => {
            const station = stations.find(
              (item) => item.shortName === alert.site || item.name === alert.site,
            )

            return (
              <div
                key={`${alert.site}-${alert.time}-${alert.msg}`}
                className="flex cursor-pointer items-center gap-2.5 rounded-md transition-colors"
                onClick={() => station && onSelectStation(station)}
                onMouseEnter={() => setHoveredAlert(index)}
                onMouseLeave={() => setHoveredAlert(null)}
                style={{
                  background: hoveredAlert === index ? "#f4f8f5" : "transparent",
                  padding: "2px 6px",
                  margin: "0 -6px",
                }}
              >
                <AlertTriangle
                  size={12}
                  style={{
                    color: alert.level === "critical" ? "#ef4444" : "#76857f",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    color: "#24423b",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{alert.site}</span> {alert.msg}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "#76857f",
                    fontFamily: "'JetBrains Mono', monospace",
                    flexShrink: 0,
                  }}
                >
                  {alert.time}
                </span>
                <span
                  className="flex-shrink-0 rounded text-white"
                  style={{
                    fontSize: 10,
                    background: alert.level === "critical" ? "#ef4444" : "#76857f",
                    padding: "2px 7px",
                  }}
                >
                  {alert.level === "critical" ? "严重" : "警告"}
                </span>
              </div>
            )
          })}

          {visibleAlerts.length === 0 && (
            <div
              style={{
                padding: "2px 6px",
                fontSize: 12,
                color: "#76857f",
              }}
            >
              当前无活动告警
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-8 px-8">
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1d2f2a", whiteSpace: "nowrap" }}>
          {subsystemHeading}
        </span>
        {subsystems.map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1">
            <div style={{ fontSize: 10, color: "#76857f" }}>{item.label}</div>
            <div
              data-metric={`subsystem-${item.label}`}
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: item.color,
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1,
              }}
            >
              {DEMO_MODE ? item.value : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
