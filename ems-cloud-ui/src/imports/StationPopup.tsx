import { X, Zap, Battery, Sun } from "lucide-react";
import { PieChart, Pie, Cell } from "recharts";
import { Station } from "../App";

const STATUS_COLOR: Record<string, string> = {
  online: "#10b981",
  fault: "#ef4444",
  offline: "#76857f",
  building: "#1f7a68",
};

interface Props {
  station: Station;
  onClose: () => void;
  onOpenStation: (id: string) => void;
}

export default function StationPopup({ station, onClose, onOpenStation }: Props) {
  const { devices } = station;
  const total = devices.online + devices.fault + devices.offline + devices.building;
  const pieData = [
    { name: "在线", value: devices.online, color: "#10b981" },
    { name: "故障", value: devices.fault, color: "#ef4444" },
    { name: "离线", value: devices.offline, color: "#76857f" },
    { name: "建设中", value: devices.building, color: "#1f7a68" },
  ].filter((d) => d.value > 0);

  return (
    <div
      className="absolute rounded-xl overflow-hidden"
      style={{
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 268,
        background: "#fff",
        border: "1px solid #d8e3dc",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
        zIndex: 1500,
        animation: "popupIn 0.18s ease",
      }}
    >
      <style>{`
        @keyframes popupIn {
          from { opacity: 0; transform: translate(-50%, -52%) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid #e8f0eb" }}
      >
        <div>
          <div className="font-semibold" style={{ fontSize: 13, color: "#1d2f2a" }}>
            {station.name}
          </div>
          <div style={{ fontSize: 10, color: "#76857f", fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>
            {station.code}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full transition-colors hover:bg-slate-100"
          style={{ width: 22, height: 22, color: "#76857f" }}
        >
          <X size={13} />
        </button>
      </div>

      {/* Device status donut */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid #e8f0eb" }}
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
            <span style={{ fontSize: 15, fontWeight: 700, color: "#1d2f2a", lineHeight: 1 }}>{total}</span>
            <span style={{ fontSize: 8, color: "#76857f", marginTop: 1 }}>Devices</span>
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
              <span style={{ fontSize: 10, color: "#61716b" }}>
                {item.label} <span style={{ fontWeight: 600, color: "#24423b" }}>{item.value}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Power metrics row */}
      <div
        className="grid grid-cols-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid #e8f0eb", gap: "0 8px" }}
      >
        <div>
          <div style={{ fontSize: 9, color: "#76857f", marginBottom: 1 }}>有功功率</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
            {station.activePower}
            <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2 }}>kW</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#76857f", marginBottom: 1 }}>额定功率</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#24423b" }}>
            {station.ratedPower}
            <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2 }}>kW</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#76857f", marginBottom: 1 }}>负载率</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#24423b" }}>
            {station.loadRate}
            <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 1 }}>%</span>
          </div>
        </div>
      </div>

      {/* Sub-systems */}
      <div
        className="grid grid-cols-3 px-4 py-2.5"
        style={{ borderBottom: "1px solid #e8f0eb", gap: "0 8px" }}
      >
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Sun size={9} style={{ color: "#76857f" }} />
            <span style={{ fontSize: 9, color: "#76857f" }}>光伏出力</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#1d2f2a" }}>
            {station.pvOutput} <span style={{ fontSize: 9, fontWeight: 400 }}>MWp</span>
          </div>
          <div style={{ fontSize: 9, color: "#76857f", marginTop: 1 }}>可用率 91.2%</div>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Battery size={9} style={{ color: "#1f7a68" }} />
            <span style={{ fontSize: 9, color: "#76857f" }}>储能容量</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#1d2f2a" }}>
            {station.storageCapacity} <span style={{ fontSize: 9, fontWeight: 400 }}>MWh</span>
          </div>
          <div style={{ fontSize: 9, color: "#76857f", marginTop: 1 }}>SOC {station.soc}%</div>
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Zap size={9} style={{ color: "#10b981" }} />
            <span style={{ fontSize: 9, color: "#76857f" }}>发电机组</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#1d2f2a" }}>
            {station.generator} <span style={{ fontSize: 9, fontWeight: 400 }}>MW</span>
          </div>
          <div style={{ fontSize: 9, color: "#10b981", marginTop: 1 }}>● 在线</div>
        </div>
      </div>

      {/* Alerts */}
      {station.alerts.length > 0 && (
        <div
          className="px-4 py-2"
          style={{ borderBottom: "1px solid #e8f0eb" }}
        >
          {station.alerts.map((alert, i) => (
            <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
              <div
                className="rounded-full flex-shrink-0"
                style={{ width: 6, height: 6, background: alert.level === "critical" ? "#ef4444" : "#76857f" }}
              />
              <span style={{ fontSize: 10, color: "#24423b", flex: 1 }}>{alert.msg}</span>
              <span style={{ fontSize: 9, color: "#76857f", fontFamily: "'JetBrains Mono', monospace" }}>
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
            background: "#1f7a68",
            border: "none",
            color: "#fff",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#176b5d"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1f7a68"; }}
        >
          进入站点详情 →
        </button>
      </div>
    </div>
  );
}
