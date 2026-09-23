import { PieChart, Pie, Cell, AreaChart, Area, Tooltip } from "recharts";

const capacityItems = [
  { label: "发电机组", value: 3.43, total: 4.18, unit: "MW",  pct: 83, color: "#1f7a68" },
  { label: "光伏系统", value: 3.91, total: 4.95, unit: "MWp", pct: 79, color: "#4f8f7e" },
  { label: "储能系统", value: 1.43, total: 2.18, unit: "MWh", pct: 68, color: "#78aa9b" },
];

const energyData = [
  { name: "光伏(Solar)",  value: 12.84, color: "#1f7a68" },
  { name: "电网(Grid)",   value: 6.55,  color: "#78aa9b" },
  { name: "柴油(Diesel)", value: 4.29,  color: "#dcebe4" },
];

const revenueData = [
  { d: 1, v: 280 }, { d: 2, v: 310 }, { d: 3, v: 290 },
  { d: 4, v: 345 }, { d: 5, v: 305 }, { d: 6, v: 372 }, { d: 7, v: 329 },
];

const RevTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(15,23,42,0.88)", color: "#fff", padding: "3px 7px", borderRadius: 4, fontSize: 10 }}>
      ¥{payload[0]?.value}
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

const label  = { fontSize: 10, color: "#76857f" } as const;
const title  = { fontSize: 11, fontWeight: 600, color: "#1d2f2a" } as const;
const mono   = { fontFamily: "'JetBrains Mono',monospace" } as const;

export default function RightPanel() {
  const total = energyData.reduce((a, b) => a + b.value, 0);

  return (
    <div className="flex flex-col gap-2.5">

      {/* ── 在线运行容量 ── */}
      <div style={card}>
        <div className="flex items-center justify-between mb-3">
          <span style={title}>在线运行容量</span>
          <span style={{ ...label, fontSize: 9 }}>TODAY</span>
        </div>

        <div className="flex flex-col gap-3">
          {capacityItems.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span style={{ fontSize: 10, color: "#465b53" }}>{item.label}</span>
                <div className="flex items-baseline gap-1">
                  <span style={{ ...mono, fontSize: 11, fontWeight: 600, color: "#1d2f2a" }}>{item.value}</span>
                  <span style={{ ...mono, fontSize: 9, color: "#76857f" }}>/ {item.total} {item.unit}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: "#e8f0eb" }}>
                  <div style={{ width: `${item.pct}%`, height: "100%", background: item.color, borderRadius: 4, transition: "width 0.6s ease" }} />
                </div>
                <span style={{ ...mono, fontSize: 9, color: "#76857f", minWidth: 26, textAlign: "right" }}>{item.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 能源供应与构成 ── */}
      <div style={card}>
        <div className="flex items-center justify-between mb-3">
          <span style={title}>能源供应与构成</span>
          <span style={{ ...label, fontSize: 9 }}>TODAY</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Donut */}
          <div className="relative flex-shrink-0" style={{ width: 72, height: 72 }}>
            <PieChart width={72} height={72}>
              <Pie data={energyData} cx="50%" cy="50%" innerRadius={22} outerRadius={34}
                dataKey="value" startAngle={90} endAngle={-270} strokeWidth={2} stroke="#fff">
                {energyData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
            </PieChart>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: "#1d2f2a" }}>{total.toFixed(0)}</span>
              <span style={{ fontSize: 8, color: "#76857f" }}>GWh</span>
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-2 flex-1">
            {energyData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: "#61716b" }}>{item.name}</span>
                </div>
                <span style={{ ...mono, fontSize: 10, fontWeight: 600, color: "#24423b" }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 收益概览 ── */}
      <div style={card}>
        <div style={{ ...title, marginBottom: 12 }}>收益概览</div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "昨日收益", value: "¥329.60" },
            { label: "累计收益", value: "¥10.60k" },
          ].map(item => (
            <div key={item.label} style={{ background: "#f4f8f5", borderRadius: 8, padding: "8px 10px" }}>
              <div style={label}>{item.label}</div>
              <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: "#1d2f2a", marginTop: 2 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ height: 48 }}>
          <AreaChart width={200} height={48} data={revenueData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1f7a68" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#1f7a68" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip content={<RevTooltip />} />
            <Area type="monotone" dataKey="v" stroke="#1f7a68" strokeWidth={1.5} fill="url(#revGrad)" dot={false} />
          </AreaChart>
        </div>
      </div>

    </div>
  );
}
