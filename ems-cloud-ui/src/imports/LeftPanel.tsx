import { useState } from "react";
import { ChevronRight, Leaf, Flame, TreePine } from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip } from "recharts";

const todayData = [
  { h: "00", charge: 12, discharge: 8 },
  { h: "02", charge: 18, discharge: 12 },
  { h: "04", charge: 8,  discharge: 5  },
  { h: "06", charge: 22, discharge: 15 },
  { h: "08", charge: 35, discharge: 28 },
  { h: "10", charge: 42, discharge: 35 },
  { h: "12", charge: 38, discharge: 32 },
  { h: "14", charge: 28, discharge: 20 },
  { h: "16", charge: 32, discharge: 25 },
  { h: "18", charge: 25, discharge: 18 },
  { h: "20", charge: 18, discharge: 14 },
  { h: "22", charge: 14, discharge: 10 },
];

const monthData = [
  { h: "1",  charge: 280, discharge: 210 },
  { h: "5",  charge: 320, discharge: 240 },
  { h: "10", charge: 305, discharge: 225 },
  { h: "15", charge: 350, discharge: 270 },
  { h: "20", charge: 330, discharge: 248 },
  { h: "25", charge: 360, discharge: 265 },
  { h: "30", charge: 320, discharge: 220 },
];

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(15,23,42,0.88)", color: "#fff", padding: "5px 9px", borderRadius: 5, fontSize: 10 }}>
      <div style={{ color: "#76857f", marginBottom: 2 }}>{label}</div>
      <div style={{ color: "#78aa9b" }}>充 {payload[0]?.value}</div>
      <div style={{ color: "#b7d4c9" }}>放 {payload[1]?.value}</div>
    </div>
  );
};

const card = {
  background: "rgba(255,255,255,0.96)",
  border: "1px solid #dbe6df",
  borderRadius: 12,
  backdropFilter: "blur(12px)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  padding: "14px 14px 12px",
} as const;

const label = { fontSize: 10, color: "#76857f" } as const;
const title = { fontSize: 11, fontWeight: 600, color: "#1d2f2a" } as const;

export default function LeftPanel() {
  const [tab, setTab] = useState<"today" | "month">("today");
  const data = tab === "today" ? todayData : monthData;

  return (
    <div className="flex flex-col gap-2.5">

      {/* ── 站点运营概况 ── */}
      <div style={card}>
        <div className="flex items-center justify-between mb-3">
          <span style={title}>站点运营概况</span>
          <button style={{ color: "#cbd8d0" }}><ChevronRight size={13} /></button>
        </div>

        {/* Total + status row */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <div style={label}>站点总数</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: "#1d2f2a", lineHeight: 1, marginTop: 2 }}>8</div>
          </div>
          <div className="flex flex-col gap-1 pb-1 text-right">
            {[
              { label: "在线", count: 5, color: "#10b981" },
              { label: "故障", count: 1, color: "#ef4444" },
              { label: "离线", count: 1, color: "#76857f" },
              { label: "建设中", count: 1, color: "#1f7a68" },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-end gap-1.5">
                <span style={{ fontSize: 10, color: "#61716b" }}>{s.label}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: s.color, minWidth: 12, textAlign: "right" }}>{s.count}</span>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Proportional status bar */}
        <div className="flex rounded-full overflow-hidden mb-3" style={{ height: 3 }}>
          <div style={{ flex: 5, background: "#10b981" }} />
          <div style={{ flex: 1, background: "#ef4444" }} />
          <div style={{ flex: 1, background: "#cbd8d0" }} />
          <div style={{ flex: 1, background: "#1f7a68" }} />
        </div>

        {/* Devices */}
        <div className="flex items-center justify-between">
          <span style={label}>关联设备数</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1d2f2a", fontFamily: "'JetBrains Mono',monospace" }}>692</span>
        </div>
        <div className="rounded-full overflow-hidden mt-1.5" style={{ height: 3, background: "#e8f0eb" }}>
          <div style={{ width: "88%", height: "100%", background: "#1f7a68" }} />
        </div>
      </div>

      {/* ── 储能充放趋势 ── */}
      <div style={card}>
        <div className="flex items-center justify-between mb-3">
          <span style={title}>储能充放趋势</span>
          <div className="flex gap-3">
            {(["today", "month"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 10, background: "none", border: "none", cursor: "pointer",
                color: tab === t ? "#1f7a68" : "#76857f",
                fontWeight: tab === t ? 600 : 400,
                borderBottom: `1px solid ${tab === t ? "#1f7a68" : "transparent"}`,
                paddingBottom: 1,
              }}>
                {t === "today" ? "今日" : "本月"}
              </button>
            ))}
          </div>
        </div>

        {/* Summary numbers */}
        <div className="flex gap-4 mb-3">
          <div>
            <div style={label}>充电量</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1f7a68", marginTop: 1 }}>
              {tab === "today" ? "320.60" : "9,842"}
              <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2, color: "#76857f" }}>MWh</span>
            </div>
          </div>
          <div style={{ width: 1, background: "#e8f0eb" }} />
          <div>
            <div style={label}>放电量</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#78aa9b", marginTop: 1 }}>
              {tab === "today" ? "220.60" : "7,210"}
              <span style={{ fontSize: 9, fontWeight: 400, marginLeft: 2, color: "#76857f" }}>MWh</span>
            </div>
          </div>
        </div>

        <div style={{ height: 72 }}>
          <BarChart width={200} height={72} data={data} barGap={1} barSize={tab === "today" ? 5 : 9} margin={{ top: 0, right: 0, bottom: 0, left: -22 }}>
            <XAxis dataKey="h" tick={{ fontSize: 7, fill: "#76857f" }} axisLine={false} tickLine={false} interval={tab === "today" ? 2 : 0} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148,163,184,0.07)" }} />
            <Bar dataKey="charge"    fill="#1f7a68" radius={[1,1,0,0]} />
            <Bar dataKey="discharge" fill="#b7d4c9" radius={[1,1,0,0]} />
          </BarChart>
        </div>

        <div className="flex gap-3 mt-2">
          {[["充电","#1f7a68"],["放电","#b7d4c9"]].map(([n,c]) => (
            <div key={n} className="flex items-center gap-1">
              <div style={{ width: 8, height: 3, background: c, borderRadius: 1 }} />
              <span style={{ fontSize: 9, color: "#76857f" }}>{n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 社会与环境效益 ── */}
      <div style={card}>
        <div style={{ ...title, marginBottom: 12 }}>社会与环境效益</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Leaf size={14} />, value: "551.1", unit: "t", label: "CO₂减排" },
            { icon: <Flame size={14} />, value: "180.4", unit: "t", label: "标准煤" },
            { icon: <TreePine size={14} />, value: "30,309", unit: "棵", label: "等效植树" },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center" style={{ padding: "8px 4px", background: "#f4f8f5", borderRadius: 8 }}>
              <div style={{ color: "#1f7a68", marginBottom: 4 }}>{item.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1d2f2a", lineHeight: 1 }}>{item.value}</div>
              <div style={{ fontSize: 8, color: "#76857f", marginTop: 2 }}>{item.unit}</div>
              <div style={{ fontSize: 9, color: "#61716b", marginTop: 1 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
