import { DEMO_MODE } from "@/api/client"
import { useState } from "react";
import { X, Zap, Battery, Sun } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { Station } from "@/App";

const STATUS_COLOR: Record<string, string> = {
  online: "#10b981",
  fault: "#ef4444",
  offline: "#76857f",
  building: "#1f7a68",
};

const CARD_W = 268;

interface Props {
  station: Station;
  initialPos?: { x: number; y: number } | null;
  onClose: () => void;
  onOpenStation: (id: string) => void;
}

export default function StationPopup({ station, initialPos, onClose, onOpenStation }: Props) {
  const { devices } = station;

  // Compute initial position: right of marker if pos given, else center fallback
  function calcInitial() {
    if (!initialPos) return null;
    const vw = window.innerWidth;
    const flipLeft = initialPos.x + 20 + CARD_W > vw;
    return {
      x: flipLeft ? initialPos.x - CARD_W - 16 : initialPos.x + 20,
      y: Math.max(8, initialPos.y - 80),
    };
  }

  const [pos, setPos] = useState<{ x: number; y: number } | null>(calcInitial);

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX - (pos?.x ?? 0);
    const startY = e.clientY - (pos?.y ?? 0);
    function onMove(ev: MouseEvent) {
      setPos({ x: ev.clientX - startX, y: ev.clientY - startY });
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }
  const total = devices.online + devices.fault + devices.offline + devices.building;
  const pieData = [
    { name: "在线", value: devices.online, color: "#10b981" },
    { name: "故障", value: devices.fault, color: "#ef4444" },
    { name: "离线", value: devices.offline, color: "#76857f" },
    { name: "建设中", value: devices.building, color: "#1f7a68" },
  ].filter((d) => d.value > 0);

  const positioned = pos !== null;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        position: "absolute",
        ...(positioned
          ? { left: pos.x, top: pos.y }
          : { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }),
        width: CARD_W,
        background: "#20342f",
        border: "1px solid rgba(104, 154, 139, 0.38)",
        boxShadow: "0 18px 42px rgba(20,45,38,0.24), 0 0 0 1px rgba(255,255,255,0.06) inset",
        color: "#e8f2ee",
        zIndex: 1500,
        animation: "popupIn 0.18s ease",
      }}
    >
      <style>{`
        @keyframes popupIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* Header — drag handle */}
      <div
        onMouseDown={onDragStart}
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(216,227,220,0.12)", cursor: "grab", userSelect: "none" }}
      >
        <div>
          <div className="font-semibold" style={{ fontSize: 13, color: "#f8fbf9" }}>
            {station.name}
          </div>
          <div style={{ fontSize: 10, color: "#94aaa2", fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
            {station.code}
          </div>
        </div>
        <button
          onClick={onClose}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex items-center justify-center rounded-full transition-colors"
          style={{ width: 22, height: 22, color: "#94aaa2", background: "transparent" }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Device status donut */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid rgba(216,227,220,0.12)" }}
      >
        <div className="relative flex-shrink-0" style={{ width: 68, height: 68 }}>
          <PieChart width={68} height={68}>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={24}
              outerRadius={32}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              strokeWidth={1.5}
              stroke="#fff"
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fbf9", lineHeight: 1 }}>{total}</span>
            <span style={{ fontSize: 8, color: "#94aaa2", marginTop: 1 }}>Devices</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 flex-1">
          {[
            { label: "在线", value: devices.online, color: "#10b981" },
            { label: "故障", value: devices.fault, color: "#ef4444" },
            { label: "离线", value: devices.offline, color: "#76857f" },
            { label: "建设中", value: devices.building, color: "#1f7a68" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="rounded-full flex-shrink-0" style={{ width: 6, height: 6, background: item.color }} />
              <span style={{ fontSize: 10, color: "#b8c7c1" }}>
                {item.label} <span style={{ fontWeight: 600, color: "#edf6f2" }}>{Number.isFinite(item.value) ? item.value : "—"}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Power metrics row */}
      <div
        className="grid grid-cols-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(216,227,220,0.12)", gap: "0 8px" }}
      >
        <div>
          <div style={{ fontSize: 9, color: "#94aaa2", marginBottom: 1 }}>有功功率</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
            {Number.isFinite(station.activePower) ? station.activePower : "—"}
            <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2 }}>kW</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#94aaa2", marginBottom: 1 }}>额定功率</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#edf6f2" }}>
            {station.ratedPower}
            <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2 }}>kW</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#94aaa2", marginBottom: 1 }}>负载率</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#edf6f2" }}>
            {Number.isFinite(station.loadRate) ? station.loadRate : "—"}
            <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 1 }}>%</span>
          </div>
        </div>
      </div>

      {/* Sub-systems */}
      <div
        className="grid grid-cols-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid rgba(216,227,220,0.12)", gap: "0 8px" }}
      >
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Sun size={9} style={{ color: "#94aaa2" }} />
            <span style={{ fontSize: 9, color: "#94aaa2" }}>光伏出力</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#edf6f2" }}>
            {Number.isFinite(station.pvOutput) ? station.pvOutput : "—"} <span style={{ fontSize: 9, fontWeight: 400 }}>MWp</span>
          </div>
          <div style={{ fontSize: 9, color: "#94aaa2", marginTop: 1 }}>{DEMO_MODE ? "可用率 91.2%" : "可用率 未知"}</div>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Battery size={9} style={{ color: "#1f7a68" }} />
            <span style={{ fontSize: 9, color: "#94aaa2" }}>储能容量</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#edf6f2" }}>
            {station.storageCapacity} <span style={{ fontSize: 9, fontWeight: 400 }}>{DEMO_MODE ? "MWh" : "kWh"}</span>
          </div>
          <div style={{ fontSize: 9, color: "#94aaa2", marginTop: 1 }}>SOC {Number.isFinite(station.soc) ? station.soc : "—"}%</div>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Zap size={9} style={{ color: "#10b981" }} />
            <span style={{ fontSize: 9, color: "#94aaa2" }}>发电机组</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#edf6f2" }}>
            {Number.isFinite(station.generator) ? station.generator : "—"} <span style={{ fontSize: 9, fontWeight: 400 }}>MW</span>
          </div>
          <div style={{ fontSize: 9, color: "#10b981", marginTop: 1 }}>{DEMO_MODE ? "● 在线" : "状态 未知"}</div>
        </div>
      </div>

      {/* Alerts */}
      {station.alerts.length > 0 && (
        <div
          className="px-4 py-2"
          style={{ borderBottom: "1px solid rgba(216,227,220,0.12)" }}
        >
          {station.alerts.map((alert, i) => (
            <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
              <div
                className="rounded-full flex-shrink-0"
                style={{ width: 6, height: 6, background: alert.level === "critical" ? "#ef4444" : "#76857f" }}
              />
              <span style={{ fontSize: 10, color: "#edf6f2", flex: 1 }}>{alert.msg}</span>
              <span style={{ fontSize: 9, color: "#94aaa2", fontFamily: "'JetBrains Mono', monospace" }}>
                {alert.time}
              </span>
              <span
                className="text-white rounded px-1"
                style={{
                  fontSize: 8,
                  background: alert.level === "critical" ? "#ef4444" : "#76857f",
                  padding: "1px 4px",
                }}
              >
                {alert.level === "critical" ? "严重" : "警告"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* CTA button */}
      <div className="px-4 py-3">
        <button
          onClick={() => onOpenStation(station.id)}
          className="w-full rounded-lg text-xs font-medium transition-all"
          style={{
            padding: "8px 12px",
            background: "transparent",
            border: "1px solid #24c8b0",
            color: "#fff",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(36,200,176,0.12)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          进入站点详情 →
        </button>
      </div>
    </div>
  );
}
