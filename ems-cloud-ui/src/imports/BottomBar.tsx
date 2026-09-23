import { useState } from "react";
import { AlertTriangle, ChevronRight, Bell } from "lucide-react";
import { Station } from "../App";

interface Props {
  stations: Station[];
  onSelectStation: (s: Station) => void;
}

const globalAlerts = [
  { site: "BESS-01", msg: "电池单体温升过高异常", time: "14:31:05", level: "critical" as const },
  { site: "PCS-02", msg: "交流侧电压径偏离目标", time: "14:28:40", level: "warning" as const },
];

const subsystems = [
  { label: "光伏可用率", value: "99.85%", color: "#10b981" },
  { label: "储能充放效率", value: "91.20%", color: "#1f7a68" },
  { label: "发电机组可用率", value: "100.00%", color: "#10b981" },
];

export default function BottomBar({ stations, onSelectStation }: Props) {
  const [hoveredAlert, setHoveredAlert] = useState<number | null>(null);

  return (
    <div
      className="flex-shrink-0 flex items-stretch"
      style={{
        height: 96,
        background: "rgba(255,255,255,0.98)",
        borderTop: "1px solid #dbe6df",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.04)",
      }}
    >
      {/* Alerts section */}
      <div
        className="flex flex-col justify-center px-6"
        style={{ flex: 1, borderRight: "1px solid #e8f0eb", minWidth: 0 }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <Bell size={14} style={{ color: "#ef4444" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>异常与告警实时监控</span>
          </div>
          <button className="flex items-center gap-1" style={{ color: "#1f7a68", fontSize: 12 }}>
            查看全部
            <ChevronRight size={12} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {globalAlerts.map((alert, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-md transition-colors cursor-pointer"
              onMouseEnter={() => setHoveredAlert(i)}
              onMouseLeave={() => setHoveredAlert(null)}
              style={{
                background: hoveredAlert === i ? "#f4f8f5" : "transparent",
                padding: "2px 6px",
                margin: "0 -6px",
              }}
            >
              <AlertTriangle
                size={12}
                style={{ color: alert.level === "critical" ? "#ef4444" : "#76857f", flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: "#24423b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <span style={{ fontWeight: 600 }}>{alert.site}</span> {alert.msg}
              </span>
              <span style={{ fontSize: 11, color: "#76857f", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
                {alert.time}
              </span>
              <span
                className="text-white rounded flex-shrink-0"
                style={{
                  fontSize: 10,
                  background: alert.level === "critical" ? "#ef4444" : "#76857f",
                  padding: "2px 7px",
                }}
              >
                {alert.level === "critical" ? "严重" : "警告"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Subsystem metrics */}
      <div className="flex items-center gap-8 px-8 flex-shrink-0">
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1d2f2a", whiteSpace: "nowrap" }}>
          子系统可用性与出力
        </span>
        {subsystems.map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1">
            <div style={{ fontSize: 10, color: "#76857f" }}>{item.label}</div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: item.color,
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1,
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
