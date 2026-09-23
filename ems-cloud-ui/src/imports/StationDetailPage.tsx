import { useState, useRef, useLayoutEffect, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import type { Station } from "../App";

// ── Shared styles ─────────────────────────────────────────────────────────────
const mono = { fontFamily: "'JetBrains Mono',monospace" } as const;

const card = {
  background: "#fff",
  border: "1px solid #dbe6df",
  borderRadius: 12,
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
} as const;

const STATUS_COLOR: Record<string, string> = {
  online: "#10b981", fault: "#ef4444", offline: "#76857f", building: "#1f7a68",
};

// ── Chart data generators (memoised per station) ──────────────────────────────
function makePowerData(station: Station) {
  const base = Math.max(0.2, station.activePower / 1000);
  return Array.from({ length: 25 }, (_, h) => {
    const t = (h / 24) * Math.PI * 2;
    const n = () => (Math.random() - 0.5) * 0.07;
    return {
      time: `${String(h).padStart(2, "0")}:00`,
      load:    +(base * 1.3 + Math.sin(t + 0.5) * 0.45 + n()).toFixed(2),
      grid:    +(base * 0.35 + Math.sin(t + 1.2) * 0.16 + n()).toFixed(2),
      storage: +(Math.sin(t) * 0.25 + n()).toFixed(2),
    };
  });
}

function makeSocData(station: Station) {
  let s = Math.max(8, station.soc - 28);
  return Array.from({ length: 25 }, (_, h) => {
    const t = (h / 24) * Math.PI * 2;
    s = Math.min(94, Math.max(6, s + Math.sin(t * 2) * 2.5 + (Math.random() - 0.4) * 2.5));
    return { time: `${String(h).padStart(2, "0")}:00`, soc: +s.toFixed(1) };
  });
}

// ── useChartWidth: ResizeObserver-based responsive chart width ─────────────────
function useChartWidth(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(500);
  useLayoutEffect(() => {
    if (!ref.current) return;
    // clientWidth includes padding; chart gets content box
    const padding = 32; // 16px each side
    setW(Math.max(200, ref.current.clientWidth - padding));
    const ro = new ResizeObserver(([e]) =>
      setW(Math.max(200, e.contentRect.width))
    );
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return w;
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(15,23,42,0.92)", color: "#fff", padding: "8px 12px", borderRadius: 6, fontSize: 11 }}>
      <div style={{ color: "#76857f", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginTop: 2 }}>
          {p.name}: <span style={mono}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Energy Flow icons ─────────────────────────────────────────────────────────
function GridIcon() {
  return (
    <svg width="34" height="42" viewBox="0 0 34 42" fill="none">
      <line x1="17" y1="2" x2="5"  y2="40" stroke="#61716b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="2" x2="29" y2="40" stroke="#61716b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="3"  y1="16" x2="31" y2="16" stroke="#76857f" strokeWidth="1.2"/>
      <line x1="7"  y1="28" x2="27" y2="28" stroke="#76857f" strokeWidth="1.2"/>
      <line x1="5"  y1="40" x2="29" y2="40" stroke="#61716b" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="1"  y1="2"  x2="33" y2="2"  stroke="#76857f" strokeWidth="1"/>
      <circle cx="17" cy="2" r="2" fill="#76857f"/>
    </svg>
  );
}

function SolarIcon() {
  return (
    <svg width="42" height="26" viewBox="0 0 42 26" fill="none">
      {([[0,0],[1,0],[2,0],[0,1],[1,1],[2,1]] as [number,number][]).map(([c,r]) => (
        <rect key={`${c}${r}`} x={c*14+1} y={r*13+1} width={12} height={11} rx={2}
          fill="#dcebe4" stroke="#1f7a68" strokeWidth="1"/>
      ))}
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg width="42" height="38" viewBox="0 0 42 38" fill="none">
      <rect x="2" y="17" width="38" height="21" rx="2" fill="#e8f0eb" stroke="#76857f" strokeWidth="1.5"/>
      <polygon points="2,17 21,4 40,17" fill="#d8e3dc" stroke="#76857f" strokeWidth="1.5"/>
      <rect x="6"  y="21" width="7" height="7" rx="1" fill="#78aa9b"/>
      <rect x="17" y="21" width="8" height="7" rx="1" fill="#78aa9b"/>
      <rect x="29" y="21" width="7" height="7" rx="1" fill="#78aa9b"/>
      <rect x="15" y="27" width="12" height="11" rx="1" fill="#cbd8d0"/>
    </svg>
  );
}

function BatteryIcon({ soc }: { soc: number }) {
  const color = soc >= 60 ? "#10b981" : soc >= 30 ? "#f97316" : "#ef4444";
  const pct = Math.max(0, Math.min(100, soc));
  return (
    <svg width="42" height="26" viewBox="0 0 42 26" fill="none">
      <rect x="1" y="5" width="36" height="16" rx="3" fill="#f0fdf8" stroke={color} strokeWidth="1.5"/>
      <rect x="37" y="9" width="4" height="8" rx="1" fill={color}/>
      <rect x="3" y="7" width={Math.round(pct*0.32)} height="12" rx="2" fill={color} opacity={0.45}/>
    </svg>
  );
}

function PCSIcon() {
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
      <rect x="2" y="2" width="34" height="34" rx="6" fill="#eaf5ef" stroke="#1f7a68" strokeWidth="1.5"/>
      <circle cx="19" cy="19" r="8" stroke="#1f7a68" strokeWidth="1.4"/>
      <path d="M13,19 h4 l2-4 2 8 2-4 h4" stroke="#1f7a68" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// ── Energy Flow node ──────────────────────────────────────────────────────────
interface FlowNodeProps {
  x: number; y: number; // percentage
  icon: React.ReactNode;
  label: string; sub: string; value: string; color: string;
}

function FlowNode({ x, y, icon, label, sub, value, color }: FlowNodeProps) {
  return (
    <div style={{
      position: "absolute", left: `${x}%`, top: `${y}%`,
      transform: "translate(-50%, -50%)",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
      width: 86,
    }}>
      {icon}
      <div style={{ textAlign: "center", lineHeight: 1.35 }}>
        <div style={{ fontSize: 10, color: "#465b53" }}>
          <span style={{ fontWeight: 600 }}>{label}</span>
          <span style={{ color: "#76857f" }}>·{sub}</span>
        </div>
        <div style={{ ...mono, fontSize: 11, fontWeight: 700, color }}>{value}</div>
      </div>
    </div>
  );
}

// ── Energy Flow diagram ───────────────────────────────────────────────────────
function EnergyFlow({ station }: { station: Station }) {
  const pvMW    = station.pvOutput > 0 ? station.pvOutput.toFixed(2) : "1.46";
  const loadMW  = station.activePower > 0 ? (station.activePower / 1000).toFixed(2) : "1.72";
  const batMW   = station.storageCapacity > 0 ? station.storageCapacity.toFixed(2) : "0.36";

  // Node positions [left%, top%] — matches SVG viewBox (0 0 100 100)
  const nodes: (FlowNodeProps & { id: string })[] = [
    { id: "grid",    x: 15, y: 26, icon: <GridIcon />,               label: "电网", sub: "购电", value: "0.62 MW",   color: "#1f7a68" },
    { id: "pcs",     x: 50, y: 60, icon: <PCSIcon />,                label: "PCS",  sub: "充电", value: "0.36 MW",   color: "#2a806e" },
    { id: "load",    x: 85, y: 26, icon: <BuildingIcon />,           label: "负荷", sub: "用电", value: `${loadMW} MW`, color: "#10b981" },
    { id: "solar",   x: 15, y: 82, icon: <SolarIcon />,              label: "光伏", sub: "发电", value: `${pvMW} MW`,  color: "#f59e0b" },
    { id: "battery", x: 85, y: 82, icon: <BatteryIcon soc={station.soc} />, label: "电池", sub: "充电", value: `${batMW} MW`, color: "#10b981" },
  ];

  // SVG paths in viewBox 0-100 (preserveAspectRatio="none" maps % → coordinate)
  const edges = [
    { d: "M15,26 C32,26 32,60 50,60", color: "#1f7a68", delay: "0s" },
    { d: "M15,82 C32,82 32,60 50,60", color: "#f59e0b", delay: "0.45s" },
    { d: "M50,60 C68,60 68,26 85,26", color: "#10b981", delay: "0.2s" },
    { d: "M50,60 C68,60 68,82 85,82", color: "#2a806e", delay: "0.65s" },
  ];

  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "54%", background: "#f4f8f5", borderRadius: 10 }}>
      <div style={{ position: "absolute", inset: 0 }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <style>{`@keyframes flowLine{from{stroke-dashoffset:10}to{stroke-dashoffset:0}}`}</style>
          </defs>
          {edges.map((e, i) => (
            <path key={i} d={e.d} fill="none" stroke={e.color} strokeWidth="0.6"
              strokeDasharray="2.5 1.8"
              style={{ animation: "flowLine 0.9s linear infinite", animationDelay: e.delay }}/>
          ))}
        </svg>
        {nodes.map((n) => <FlowNode key={n.id} {...n} />)}
      </div>
    </div>
  );
}

// ── Station Info Card ─────────────────────────────────────────────────────────
function StationInfoCard({ station }: { station: Station }) {
  return (
    <div style={{ ...card, padding: 14, flexShrink: 0, width: 196 }}>
      <div style={{ height: 88, borderRadius: 8, overflow: "hidden", background: "#e8f0eb", marginBottom: 10 }}>
        {station.imageUrl ? (
          <img src={station.imageUrl} alt={station.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#cbd8d0" }}>
            暂无图片
          </div>
        )}
      </div>
      <div style={{ ...mono, fontSize: 10, color: "#76857f", marginBottom: 8 }}>{station.code}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
        {[
          { label: "额定功率", value: `${(station.ratedPower / 1000).toFixed(2)} MW` },
          { label: "额定容量", value: `${station.storageCapacity.toFixed(2)} MWh` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: "#f4f8f5", borderRadius: 7, padding: "7px 8px" }}>
            <div style={{ fontSize: 9, color: "#76857f", marginBottom: 2 }}>{label}</div>
            <div style={{ ...mono, fontSize: 12, fontWeight: 700, color: "#1d2f2a" }}>{value}</div>
          </div>
        ))}
      </div>

      {[
        { label: "站点类型", value: station.type || "工商业储能" },
        { label: "运行模式", value: station.mode || "自用+需量控制" },
        { label: "所在区域", value: station.region || "—" },
      ].map(({ label, value }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: "#76857f" }}>{label}</span>
          <span style={{ fontSize: 11, color: "#24423b", fontWeight: 500 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Trend Charts ──────────────────────────────────────────────────────────────
const POWER_LINES = [
  { key: "load",    name: "负荷", color: "#10b981" },
  { key: "grid",    name: "电网", color: "#1f7a68" },
  { key: "storage", name: "储能", color: "#2a806e" },
] as const;

const RANGE_BTNS = ["D", "M", "Y"] as const;

function TrendCharts({ station }: { station: Station }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartW = useChartWidth(containerRef);
  const [rangeIdx, setRangeIdx] = useState(0);
  const powerData = useMemo(() => makePowerData(station), [station.id]);
  const socData   = useMemo(() => makeSocData(station),   [station.id]);

  const [clock, setClock] = useState("");
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      return [d.getHours(), d.getMinutes(), d.getSeconds()]
        .map((v) => String(v).padStart(2, "0")).join(":");
    };
    setClock(fmt());
    const id = setInterval(() => setClock(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  const last = powerData[powerData.length - 1];

  return (
    <div ref={containerRef} style={{ ...card, padding: 16, flex: 1 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>运行趋势</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#76857f" }}>今天 2026-09-07</span>
        {RANGE_BTNS.map((b, i) => (
          <button key={b} onClick={() => setRangeIdx(i)}
            style={{
              padding: "2px 7px", borderRadius: 4, border: "1px solid #d8e3dc",
              background: rangeIdx === i ? "#eaf5ef" : "none",
              color: rangeIdx === i ? "#1f7a68" : "#61716b",
              fontSize: 10, cursor: "pointer", fontWeight: rangeIdx === i ? 600 : 400,
            }}>{b}</button>
        ))}
        <span style={{ fontSize: 10, color: "#61716b", marginLeft: 2, cursor: "pointer" }}>总计</span>
      </div>

      {/* Power chart */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#465b53" }}>站点功率 MW</span>
          {POWER_LINES.map((l) => (
            <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 14, height: 2, background: l.color, borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: "#61716b" }}>
                {l.name} <span style={{ ...mono, fontWeight: 700, color: l.color }}>
                  {last[l.key]} MW
                </span>
              </span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ ...mono, fontSize: 11, color: "#76857f" }}>{clock}</span>
        </div>
        <LineChart width={chartW} height={110} data={powerData} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8f0eb" vertical={false}/>
          <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#76857f" }} axisLine={false} tickLine={false} interval={3}/>
          <YAxis tick={{ fontSize: 9, fill: "#76857f" }} axisLine={false} tickLine={false}/>
          <Tooltip content={<ChartTip />}/>
          {POWER_LINES.map((l) => (
            <Line key={l.key} type="monotone" dataKey={l.key} name={l.name}
              stroke={l.color} strokeWidth={1.5} dot={false}/>
          ))}
        </LineChart>
      </div>

      <div style={{ height: 12 }} />

      {/* SOC chart */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: "#465b53" }}>SOC %</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 14, height: 2, background: "#10b981", borderRadius: 1 }} />
            <span style={{ fontSize: 10, color: "#61716b" }}>SOC {station.soc}%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 14, height: 0, borderTop: "1.5px dashed #f59e0b" }} />
            <span style={{ fontSize: 10, color: "#76857f" }}>上限 90%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 14, height: 0, borderTop: "1.5px dashed #ef4444" }} />
            <span style={{ fontSize: 10, color: "#76857f" }}>下限 20%</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ ...mono, fontSize: 11, color: "#76857f" }}>{clock}</span>
        </div>
        <LineChart width={chartW} height={110} data={socData} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e8f0eb" vertical={false}/>
          <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#76857f" }} axisLine={false} tickLine={false} interval={3}/>
          <YAxis tick={{ fontSize: 9, fill: "#76857f" }} axisLine={false} tickLine={false} domain={[0, 100]}/>
          <Tooltip content={<ChartTip />}/>
          <ReferenceLine y={90} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1}/>
          <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="4 3" strokeWidth={1}/>
          <Line type="monotone" dataKey="soc" name="SOC" stroke="#10b981" strokeWidth={1.5} dot={false}/>
        </LineChart>
      </div>
    </div>
  );
}

// ── Device Detail ─────────────────────────────────────────────────────────────
const DEVICE_TABS = ["电网", "光伏", "负荷", "PCS", "电池"] as const;
type DeviceTab = typeof DEVICE_TABS[number];

function DeviceDetail({ station }: { station: Station }) {
  const [tab, setTab] = useState<DeviceTab>("电池");

  const metrics: Record<DeviceTab, { label: string; value: string; unit?: string }[]> = {
    "电网": [
      { label: "当前功率",  value: "0.62",           unit: "MW"  },
      { label: "电压",      value: "220 / 380",       unit: "V"   },
      { label: "频率",      value: "50.1",            unit: "Hz"  },
      { label: "功率因数",  value: "0.98"                         },
      { label: "日用电量",  value: "8.4",             unit: "MWh" },
    ],
    "光伏": [
      { label: "发电功率",  value: station.pvOutput > 0 ? station.pvOutput.toFixed(2) : "1.46", unit: "MW"    },
      { label: "日发电量",  value: "8.2",             unit: "MWh"  },
      { label: "MPPT效率", value: "98.5",             unit: "%"    },
      { label: "辐照强度",  value: "842",             unit: "W/m²" },
      { label: "组件温度",  value: "38.2",            unit: "°C"   },
    ],
    "负荷": [
      { label: "用电功率",  value: station.activePower > 0 ? (station.activePower / 1000).toFixed(2) : "1.72", unit: "MW" },
      { label: "功率因数",  value: "0.95"                         },
      { label: "日用电量",  value: "12.4",            unit: "MWh" },
      { label: "负载率",    value: `${station.loadRate}`,         unit: "%"   },
    ],
    "PCS": [
      { label: "充电功率",      value: "0.36",        unit: "MW"  },
      { label: "效率",          value: "96.5",        unit: "%"   },
      { label: "直流母线电压",  value: "830",         unit: "V"   },
      { label: "温度",          value: "28.5",        unit: "°C"  },
      { label: "运行状态",      value: "充电中"                   },
    ],
    "电池": [
      { label: "SOC",       value: `${station.soc}.0`, unit: "%"  },
      { label: "SOH",       value: "96.8",           unit: "%"    },
      { label: "有功功率",  value: "+234",           unit: "kW"   },
      { label: "张弛电压",  value: "768",            unit: "V"    },
      { label: "张弛电流",  value: "305",            unit: "A"    },
      { label: "最高温度",  value: "31.6",           unit: "°C"   },
      { label: "单体压差",  value: "18",             unit: "mV"   },
    ],
  };

  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>设备详情</span>
        <span style={{ fontSize: 10, color: "#76857f" }}>当前选中 · 电池簇 01</span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", background: "#f4f8f5", borderRadius: 7, padding: 3, marginBottom: 12, gap: 2 }}>
        {DEVICE_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "5px 0", borderRadius: 5, border: "none", cursor: "pointer",
              fontSize: 11, fontWeight: tab === t ? 600 : 400,
              color: tab === t ? "#1f7a68" : "#61716b",
              background: tab === t ? "#fff" : "none",
              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              transition: "all 0.12s",
            }}>{t}</button>
        ))}
      </div>

      {/* Status badge (battery only) */}
      {tab === "电池" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "#f0fdf8", borderRadius: 7, marginBottom: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }}/>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#10b981" }}>在线 · 充电</span>
          <span style={{ ...mono, fontSize: 10, color: "#76857f", marginLeft: "auto" }}>BMS-01 · 14:32:17</span>
        </div>
      )}

      {/* Metric rows */}
      {metrics[tab].map(({ label, value, unit }) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #f4f8f5" }}>
          <span style={{ fontSize: 11, color: "#61716b" }}>{label}</span>
          <span style={{ ...mono, fontSize: 12, fontWeight: 600, color: "#1d2f2a" }}>
            {value}
            {unit && <span style={{ fontSize: 10, color: "#76857f", fontWeight: 400, marginLeft: 2 }}>{unit}</span>}
          </span>
        </div>
      ))}

      <button style={{ width: "100%", marginTop: 12, padding: "7px 0", borderRadius: 7, border: "1px solid #d8e3dc", background: "none", fontSize: 11, color: "#1f7a68", cursor: "pointer" }}>
        查看设备完整档案 →
      </button>
    </div>
  );
}

// ── Alert Panel ───────────────────────────────────────────────────────────────
type AlertLevel = "critical" | "warning" | "recovered";

interface AlertItem {
  level: AlertLevel;
  msg: string;
  device: string;
  time: string;
}

function buildAlerts(station: Station): AlertItem[] {
  const fromStation: AlertItem[] = station.alerts.map((a, i) => ({
    level: a.level as AlertLevel,
    msg: a.msg,
    device: `BMS-0${i + 2}`,
    time: a.time,
  }));
  const extras: AlertItem[] = [
    { level: "warning",   msg: "PCS 通信抖动",     device: "PCS-01", time: "13:48" },
    { level: "warning",   msg: "电表数据质量异常",  device: "MTR-01", time: "13:36" },
    { level: "recovered", msg: "消防控制器离线",    device: "FSS-01", time: "12:06" },
  ];
  return [...fromStation, ...extras];
}

const LVL: Record<AlertLevel, { label: string; color: string; bg: string }> = {
  critical:  { label: "严重",  color: "#ef4444", bg: "#fff5f5" },
  warning:   { label: "一般",  color: "#f97316", bg: "#fff7ed" },
  recovered: { label: "已恢复", color: "#76857f", bg: "#f4f8f5" },
};

function AlertPanel({ station }: { station: Station }) {
  const alerts = useMemo(() => buildAlerts(station), [station.id]);
  const [tab, setTab] = useState<"all" | AlertLevel>("all");

  const counts = {
    critical: alerts.filter((a) => a.level === "critical").length,
    warning:  alerts.filter((a) => a.level === "warning").length,
    recovered: alerts.filter((a) => a.level === "recovered").length,
  };

  const displayed = tab === "all" ? alerts : alerts.filter((a) => a.level === tab);

  const filterTabs: { key: "all" | AlertLevel; label: string; count: number }[] = [
    { key: "all",       label: "全部",   count: alerts.length },
    { key: "critical",  label: "严重",   count: counts.critical },
    { key: "warning",   label: "一般",   count: counts.warning },
    { key: "recovered", label: "已恢复", count: counts.recovered },
  ];

  return (
    <div style={{ ...card, padding: 14, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>实时告警</span>
        {counts.critical > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>{counts.critical}条活动告警</span>
        )}
      </div>

      {/* Alert level tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e8f0eb", marginBottom: 8 }}>
        {filterTabs.map(({ key, label, count }) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: "5px 10px", fontSize: 11, border: "none", background: "none", cursor: "pointer",
              color: tab === key ? "#1f7a68" : "#61716b",
              fontWeight: tab === key ? 600 : 400,
              borderBottom: tab === key ? "2px solid #1f7a68" : "2px solid transparent",
            }}>
            {label} {count > 0 && <span style={mono}>{count}</span>}
          </button>
        ))}
      </div>

      {/* Col headers */}
      <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 64px 52px", gap: 8, paddingBottom: 6, borderBottom: "1px solid #e8f0eb" }}>
        {["等级", "告警内容", "设备", "时间"].map((h) => (
          <span key={h} style={{ fontSize: 10, color: "#76857f", fontWeight: 500 }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {displayed.map((a, i) => {
          const cfg = LVL[a.level];
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "40px 1fr 64px 52px", gap: 8,
              padding: "8px 0", borderBottom: "1px solid #f4f8f5", alignItems: "center",
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 5px", borderRadius: 4, color: cfg.color, background: cfg.bg, textAlign: "center" }}>
                {cfg.label}
              </span>
              <span style={{ fontSize: 12, color: "#24423b" }}>{a.msg}</span>
              <span style={{ ...mono, fontSize: 10, color: "#76857f" }}>{a.device}</span>
              <span style={{ ...mono, fontSize: 10, color: "#76857f" }}>{a.time}</span>
            </div>
          );
        })}
        {displayed.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 0", fontSize: 12, color: "#76857f" }}>暂无告警</div>
        )}
      </div>

      <button style={{ marginTop: 10, fontSize: 11, color: "#1f7a68", background: "none", border: "none", cursor: "pointer", textAlign: "right", padding: 0 }}>
        查看全部告警 →
      </button>
    </div>
  );
}

// ── Station Overview layout ───────────────────────────────────────────────────
function StationOverview({ station }: { station: Station }) {
  return (
    <div style={{ flex: 1, display: "flex", gap: 12, padding: "12px 16px 16px", overflow: "auto", minHeight: 0 }}>
      {/* Left column */}
      <div style={{ flex: "0 0 63%", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
          <StationInfoCard station={station}/>
          <div style={{ flex: 1, ...card, padding: 14, overflow: "hidden" }}>
            <EnergyFlow station={station}/>
          </div>
        </div>
        <TrendCharts station={station}/>
      </div>
      {/* Right column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, minWidth: 0 }}>
        <DeviceDetail station={station}/>
        <AlertPanel station={station}/>
      </div>
    </div>
  );
}

// ── Placeholder for unimplemented sub-pages ────────────────────────────────────
function Placeholder({ nav }: { nav: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#76857f" }}>
      <div style={{ fontSize: 36 }}>🚧</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#61716b" }}>{nav}</div>
      <div style={{ fontSize: 12 }}>功能开发中，敬请期待</div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
const SUB_NAVS = ["站点概览", "运营收益", "运行策略", "AI策略", "告警信息", "数据分析", "设备详情"] as const;

interface Props {
  tabs: Station[];
  activeId: string;
  onClose: (id: string) => void;
  onSetActive: (id: string) => void;
  onBack: () => void;
}

export default function StationDetailPage({ tabs, activeId, onClose, onSetActive, onBack }: Props) {
  const station = tabs.find((s) => s.id === activeId);
  const [subNav, setSubNav] = useState<string>("站点概览");

  // Reset sub-nav when switching station tabs
  useEffect(() => { setSubNav("站点概览"); }, [activeId]);

  if (!station) return null;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: "#f0f4f8", overflow: "hidden" }}>

      {/* ── Multi-station tab bar ── */}
      <div style={{ display: "flex", alignItems: "stretch", background: "#fff", borderBottom: "1px solid #d8e3dc", flexShrink: 0 }}>
        <div style={{ display: "flex", flex: 1, overflowX: "auto" }}>
          {tabs.map((tab) => {
            const active = tab.id === activeId;
            return (
              <div key={tab.id} onClick={() => onSetActive(tab.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "11px 14px 9px", cursor: "pointer", flexShrink: 0,
                  borderBottom: active ? "2px solid #1f7a68" : "2px solid transparent",
                  color: active ? "#1f7a68" : "#61716b",
                  background: active ? "rgba(239,246,255,0.5)" : "none",
                  transition: "all 0.1s",
                }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLOR[tab.status], flexShrink: 0 }}/>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tab.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                  style={{ display: "flex", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 2, color: "#cbd8d0", borderRadius: 3 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#76857f"; (e.currentTarget as HTMLButtonElement).style.background = "#e8f0eb"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#cbd8d0"; (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
                >
                  <X size={11}/>
                </button>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", padding: "0 12px", fontSize: 11, color: "#76857f", flexShrink: 0 }}>
            已打开 {tabs.length}
          </div>
        </div>

        {/* Back button */}
        <button onClick={onBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "0 18px", border: "none", borderLeft: "1px solid #e8f0eb",
            background: "none", fontSize: 12, color: "#61716b", cursor: "pointer", flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget as HTMLButtonElement).style.background = "#f4f8f5"}
          onMouseLeave={(e) => (e.currentTarget as HTMLButtonElement).style.background = "none"}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="0.5" y="1.5" width="12" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="0.5" y="5.75" width="12" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="0.5" y="10"   width="12" height="1.5" rx="0.75" fill="currentColor"/>
          </svg>
          站点列表
        </button>
      </div>

      {/* ── Secondary navigation ── */}
      <div style={{ display: "flex", background: "#fff", borderBottom: "1px solid #d8e3dc", padding: "0 20px", flexShrink: 0 }}>
        {SUB_NAVS.map((nav) => {
          const active = nav === subNav;
          return (
            <button key={nav} onClick={() => setSubNav(nav)}
              style={{
                padding: "12px 16px 10px", fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "#1f7a68" : "#61716b",
                background: "none", border: "none",
                borderBottom: active ? "2px solid #1f7a68" : "2px solid transparent",
                cursor: "pointer", transition: "all 0.12s", whiteSpace: "nowrap",
              }}>
              {nav}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      {subNav === "站点概览"
        ? <StationOverview station={station}/>
        : <Placeholder nav={subNav}/>}
    </div>
  );
}
