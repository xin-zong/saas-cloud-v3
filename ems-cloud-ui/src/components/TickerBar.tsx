import { DEMO_MODE } from "@/api/client"
import { Station } from "@/App";
import type { UserRole } from "@/auth/roles";

const STATUS_COLOR: Record<string, string> = {
  online: "#10b981",
  fault: "#ef4444",
  offline: "#76857f",
  building: "#1f7a68",
};

const STATUS_LABEL: Record<string, string> = {
  online: "在线",
  fault: "故障",
  offline: DEMO_MODE ? "离线" : "未知",
  building: "建设中",
};

interface Props {
  stations: Station[];
  onSelectStation: (s: Station) => void;
  role: UserRole;
}

function TickerItem({
  station,
  onClick,
  role,
}: {
  station: Station;
  onClick: () => void;
  role: UserRole;
}) {
  const isFault = station.status === "fault";
  const deviceTotal =
    station.devices.online +
    station.devices.fault +
    station.devices.offline +
    station.devices.building;
  const accessLabel =
    station.dataStatus === "connected"
      ? "已接入"
      : station.dataStatus === "partial"
        ? "部分接入"
        : "待接入";
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 flex-shrink-0 rounded-full transition-colors"
      style={{
        padding: "3px 12px 3px 8px",
        margin: "0 6px",
        background: isFault ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.6)",
        border: `1px solid ${isFault ? "rgba(239,68,68,0.2)" : "#dbe6df"}`,
        cursor: "pointer",
      }}
    >
      {/* Status dot */}
      <div style={{ position: "relative", width: 7, height: 7, flexShrink: 0 }}>
        {isFault && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: STATUS_COLOR[station.status],
            animation: "tickerPulse 1.8s ease-out infinite",
          }} />
        )}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: STATUS_COLOR[station.status],
        }} />
      </div>

      {/* Name */}
      <span style={{ fontSize: 11, fontWeight: 600, color: isFault ? "#ef4444" : "#24423b", whiteSpace: "nowrap" }}>
        {station.name}
      </span>

      {/* Status */}
      <span style={{ fontSize: 10, color: STATUS_COLOR[station.status], whiteSpace: "nowrap" }}>
        {STATUS_LABEL[station.status]}
      </span>

      {/* Metrics follow the signed-in role's work context. */}
      {role === "integrator" ? (
        <>
          <span style={{ fontSize: 9, color: "#cbd8d0" }}>|</span>
          <span
            style={{
              fontSize: 10,
              color: "#61716b",
              whiteSpace: "nowrap",
            }}
          >
            {accessLabel}
          </span>
          <span style={{ fontSize: 9, color: "#cbd8d0" }}>|</span>
          <span
            style={{
              fontSize: 10,
              color: "#61716b",
              fontFamily: "'JetBrains Mono',monospace",
              whiteSpace: "nowrap",
            }}
          >
            {Number.isFinite(deviceTotal) ? deviceTotal : "—"} 台设备
          </span>
        </>
      ) : station.activePower > 0 ? (
        <>
          <span style={{ fontSize: 9, color: "#cbd8d0" }}>|</span>
          <span style={{ fontSize: 10, color: "#61716b", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
            {station.activePower} kW
          </span>
          <span style={{ fontSize: 9, color: "#cbd8d0" }}>|</span>
          <span style={{ fontSize: 10, color: "#61716b", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
            {station.loadRate}%
          </span>
        </>
      ) : null}

      {/* Alert hint */}
      {station.alerts.length > 0 && (
        <>
          <span style={{ fontSize: 9, color: "#fca5a5" }}>|</span>
          <span style={{ fontSize: 10, color: "#ef4444", whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>
            ⚠ {station.alerts[0].msg}
          </span>
        </>
      )}
    </button>
  );
}

export default function TickerBar({ stations, onSelectStation, role }: Props) {
  const minimumVisibleItems = 12;
  const repeatCount =
    stations.length > 0 ? Math.ceil(minimumVisibleItems / stations.length) : 0;
  const loopItems = Array.from({ length: repeatCount }, () => stations).flat();
  const items = [...loopItems, ...loopItems];
  const duration = Math.max(24, loopItems.length * 2.8);

  return (
    <div
      className="flex-shrink-0 flex items-center overflow-hidden"
      style={{
        height: 34,
        background: "rgba(248,250,252,0.95)",
        borderBottom: "1px solid #dbe6df",
        position: "relative",
      }}
    >
      {/* Left label */}
      <div
        className="flex items-center gap-1.5 flex-shrink-0 px-3"
        style={{
          height: "100%",
          borderRight: "1px solid #dbe6df",
          background: "rgba(248,250,252,0.98)",
          zIndex: 2,
        }}
      >
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "tickerPulse 2s ease-out infinite" }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: "#61716b", whiteSpace: "nowrap" }}>实时状态</span>
      </div>

      {/* Fade edges */}
      <div style={{ position: "absolute", left: 88, top: 0, bottom: 0, width: 24, background: "linear-gradient(to right, rgba(248,250,252,0.95), transparent)", zIndex: 1, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 32, background: "linear-gradient(to left, rgba(248,250,252,0.95), transparent)", zIndex: 1, pointerEvents: "none" }} />

      {/* Scrolling track */}
      <div style={{ overflow: "hidden", flex: 1, height: "100%", display: "flex", alignItems: "center" }}>
        {stations.length > 0 ? (
          <div
            data-ticker-track
            style={{
              display: "flex",
              alignItems: "center",
              width: "max-content",
              minWidth: "max-content",
              animation: `tickerScroll ${duration}s linear infinite`,
              willChange: "transform",
            }}
          >
            {items.map((station, i) => (
              <TickerItem
                key={`${station.id}-${i}`}
                station={station}
                role={role}
                onClick={() => onSelectStation(station)}
              />
            ))}
          </div>
        ) : (
          <span style={{ paddingLeft: 12, fontSize: 11, color: "#61716b" }}>暂无站点数据</span>
        )}
      </div>

      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-ticker-track] {
            animation-duration: ${duration}s !important;
            animation-iteration-count: infinite !important;
          }
        }
        @keyframes tickerPulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          70%  { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
