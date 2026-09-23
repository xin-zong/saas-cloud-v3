import { useState, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";
import type { Station } from "../App";

// ── Palette ──────────────────────────────────────────────────────────────────
const G = {
  blue: "#1f7a68", blueBg: "#eaf5ef",
  red: "#ef4444",   redBg: "#fff5f5",
  orange: "#f97316", orangeBg: "#fff7ed",
  green: "#10b981", greenBg: "#f0fdf8",
  gray: "#76857f",  grayBg: "#e8f0eb",
};
const mono = { fontFamily: "'JetBrains Mono',monospace" };

// ── Preset smart views ────────────────────────────────────────────────────────
type Preset = {
  id: string;
  label: string;
  tag?: string;
  tagColor?: string;
  filter: (s: Station) => boolean;
  emptyHint: string;
};

const PRESETS: Preset[] = [
  {
    id: "fault",
    label: "告警中的站点",
    tag: "需处理",
    tagColor: G.red,
    filter: (s) => s.status === "fault" || s.alerts.length > 0,
    emptyHint: "暂无告警站点",
  },
  {
    id: "low_soc",
    label: "低电量场站 (<30%)",
    filter: (s) => s.soc < 30,
    emptyHint: "暂无低电量站点",
  },
  {
    id: "recent",
    label: "本周有更新的站点",
    filter: (s) => s.updateTime !== "—" && s.updateTime !== "2天前",
    emptyHint: "暂无最近更新站点",
  },
  {
    id: "pending",
    label: "待审核待发布",
    filter: (s) => s.dataStatus === "disconnected" && s.status !== "building",
    emptyHint: "暂无待审核站点",
  },
  {
    id: "revenue",
    label: "收益异常预警",
    filter: (s) => s.revenue === "—" || s.soc < 20,
    emptyHint: "暂无收益异常站点",
  },
];

// ── Filter condition types ────────────────────────────────────────────────────
type ConditionKey = "region" | "status" | "soc" | "type" | "dataStatus";

const CONDITION_OPTIONS: Record<ConditionKey, { label: string; value: string; test: (s: Station, v: string) => boolean }[]> = {
  region: [
    { label: "华东", value: "华东", test: (s, v) => s.region === v },
    { label: "华南", value: "华南", test: (s, v) => s.region === v },
    { label: "华北", value: "华北", test: (s, v) => s.region === v },
    { label: "华中", value: "华中", test: (s, v) => s.region === v },
    { label: "西南", value: "西南", test: (s, v) => s.region === v },
    { label: "西北", value: "西北", test: (s, v) => s.region === v },
    { label: "东北", value: "东北", test: (s, v) => s.region === v },
  ],
  status: [
    { label: "在线", value: "online", test: (s) => s.status === "online" },
    { label: "告警", value: "fault",  test: (s) => s.status === "fault" },
    { label: "离线", value: "offline", test: (s) => s.status === "offline" },
    { label: "建设中", value: "building", test: (s) => s.status === "building" },
  ],
  soc: [
    { label: "SOC < 30%", value: "low",  test: (s) => s.soc < 30 },
    { label: "SOC 30–60%", value: "mid", test: (s) => s.soc >= 30 && s.soc < 60 },
    { label: "SOC > 60%",  value: "high", test: (s) => s.soc >= 60 },
  ],
  type: [
    { label: "BESS", value: "BESS", test: (s, v) => s.type === v },
    { label: "PV",   value: "PV",   test: (s, v) => s.type === v },
    { label: "Wind", value: "Wind", test: (s, v) => s.type === v },
    { label: "Hybrid", value: "Hybrid", test: (s, v) => s.type === v },
  ],
  dataStatus: [
    { label: "已接入",   value: "connected",    test: (s) => s.dataStatus === "connected" },
    { label: "部分接入", value: "partial",      test: (s) => s.dataStatus === "partial" },
    { label: "未接入",   value: "disconnected", test: (s) => s.dataStatus === "disconnected" },
  ],
};

const CONDITION_LABELS: Record<ConditionKey, string> = {
  region: "区域",
  status: "运行状态",
  soc: "电量范围",
  type: "站点类型",
  dataStatus: "数据接入",
};

type ActiveCondition = { key: ConditionKey; value: string };

// ── Helper: alert level badge ─────────────────────────────────────────────────
function levelBadge(level: "critical" | "warning" | undefined) {
  if (!level) return null;
  const isCrit = level === "critical";
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      color: isCrit ? G.red : G.orange,
      background: isCrit ? G.redBg : G.orangeBg,
      border: `1px solid ${isCrit ? "#fecaca" : "#fed7aa"}`,
    }}>
      {isCrit ? "严重" : "警告"}
    </span>
  );
}

function socDot(soc: number) {
  const color = soc < 30 ? G.red : soc < 60 ? G.orange : G.green;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ ...mono, fontSize: 12, fontWeight: 600, color: "#1d2f2a" }}>{soc}%</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props { stations: Station[] }

export default function SmartRulesTab({ stations }: Props) {
  const [presetId, setPresetId] = useState("fault");
  const [search, setSearch] = useState("");
  const [conditions, setConditions] = useState<ActiveCondition[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState<ConditionKey | null>(null);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) {
        setAddOpen(false);
        setAddKey(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const preset = PRESETS.find((p) => p.id === presetId)!;

  // Count per preset (apply only preset filter for sidebar counts)
  function presetCount(p: Preset) {
    return stations.filter(p.filter).length;
  }

  // Apply preset filter + search + all active conditions
  const filtered = stations.filter((s) => {
    if (!preset.filter(s)) return false;
    if (search && !s.name.includes(search) && !s.code.includes(search) && !s.manager.includes(search)) return false;
    return conditions.every(({ key, value }) => {
      const opt = CONDITION_OPTIONS[key].find((o) => o.value === value);
      return opt ? opt.test(s, value) : true;
    });
  });

  function addCondition(key: ConditionKey, value: string) {
    // Avoid duplicate
    if (!conditions.find((c) => c.key === key && c.value === value)) {
      setConditions((prev) => [...prev, { key, value }]);
    }
    setAddOpen(false);
    setAddKey(null);
  }

  function removeCondition(key: ConditionKey, value: string) {
    setConditions((prev) => prev.filter((c) => !(c.key === key && c.value === value)));
  }

  function exportCSV() {
    const rows = [
      ["站点名称", "编号", "状态", "SOC", "告警源", "负责人", "更新时间"],
      ...filtered.map((s) => [
        s.name, s.code, s.status, `${s.soc}%`,
        s.alerts[0]?.msg ?? "—", s.manager, s.updateTime,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${preset.label}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

      {/* ── Left sidebar ──────────────────────────────────────────────── */}
      <div style={{ width: 200, flexShrink: 0, borderRight: "1px solid #d8e3dc", background: "#fff", padding: "20px 12px", overflowY: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#76857f", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12, paddingLeft: 4 }}>
          预设智能视图
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {PRESETS.map((p) => {
            const active = p.id === presetId;
            const count = presetCount(p);
            return (
              <button key={p.id} onClick={() => { setPresetId(p.id); setConditions([]); setSearch(""); }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 10px", borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left",
                  background: active ? G.blueBg : "none",
                  color: active ? G.blue : "#465b53",
                  fontWeight: active ? 600 : 400,
                  fontSize: 13,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#f4f8f5"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              >
                <span style={{ flex: 1, lineHeight: 1.4 }}>{p.label}</span>
                {count > 0 && (
                  <span style={{
                    marginLeft: 6, minWidth: 20, height: 20, borderRadius: 10, padding: "0 6px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: active ? G.blue : "#d8e3dc",
                    color: active ? "#fff" : "#61716b",
                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                    ...mono,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#f4f8f5" }}>

        {/* Header */}
        <div style={{ padding: "16px 24px 0", background: "#fff", borderBottom: "1px solid #d8e3dc" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#1d2f2a" }}>{preset.label}</span>
            {preset.tag && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#fecaca", color: G.red }}>
                {preset.tag}
              </span>
            )}
            <div style={{ flex: 1 }} />

            {/* Search */}
            <div style={{ display: "flex", alignItems: "center", gap: 7, height: 32, borderRadius: 7, border: "1px solid #d8e3dc", background: "#f4f8f5", padding: "0 10px", minWidth: 180 }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                <circle cx="5" cy="5" r="4" stroke="#76857f" strokeWidth="1.4" />
                <path d="M8.5 8.5l2 2" stroke="#76857f" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索过滤名称..."
                style={{ border: "none", background: "none", fontSize: 12, color: "#24423b", outline: "none", flex: 1 }} />
            </div>

            {/* Export */}
            <button onClick={exportCSV}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 7, background: G.blue, color: "#fff", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer" }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1v7M3 5.5l3 3 3-3M1.5 10.5h9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              导出视图列表
            </button>
          </div>

          {/* Filter condition bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#76857f", flexShrink: 0 }}>筛选条件：</span>

            {/* Active condition chips */}
            {conditions.map(({ key, value }) => {
              const opt = CONDITION_OPTIONS[key].find((o) => o.value === value);
              return (
                <span key={`${key}-${value}`} style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "3px 10px 3px 10px", borderRadius: 20,
                  background: G.blueBg, border: `1px solid #b7d4c9`,
                  fontSize: 11, fontWeight: 600, color: G.blue,
                }}>
                  <span style={{ color: "#78aa9b", fontSize: 10 }}>{CONDITION_LABELS[key]}</span>
                  {opt?.label}
                  <button onClick={() => removeCondition(key, value)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", color: "#78aa9b", marginLeft: 2 }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
              );
            })}

            {/* Add condition dropdown */}
            <div ref={addRef} style={{ position: "relative" }}>
              <button onClick={() => { setAddOpen((o) => !o); setAddKey(null); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "3px 10px", borderRadius: 20,
                  border: "1px dashed #cbd8d0", background: "none",
                  fontSize: 11, color: "#61716b", cursor: "pointer",
                }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1v8M1 5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                添加条件
              </button>

              {addOpen && (
                <div style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200,
                  background: "#fff", border: "1px solid #d8e3dc", borderRadius: 10,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                  display: "flex", minWidth: 280,
                }}>
                  {/* Category column */}
                  <div style={{ width: 120, borderRight: "1px solid #e8f0eb", padding: "8px 0" }}>
                    {(Object.keys(CONDITION_OPTIONS) as ConditionKey[]).map((key) => (
                      <button key={key} onClick={() => setAddKey(key)}
                        style={{
                          display: "block", width: "100%", padding: "8px 14px", textAlign: "left",
                          fontSize: 12, border: "none", cursor: "pointer",
                          background: addKey === key ? G.blueBg : "none",
                          color: addKey === key ? G.blue : "#24423b",
                          fontWeight: addKey === key ? 600 : 400,
                        }}>
                        {CONDITION_LABELS[key]}
                      </button>
                    ))}
                  </div>
                  {/* Value column */}
                  <div style={{ flex: 1, padding: "8px 0", minWidth: 140 }}>
                    {addKey ? (
                      CONDITION_OPTIONS[addKey].map((opt) => {
                        const already = !!conditions.find((c) => c.key === addKey && c.value === opt.value);
                        return (
                          <button key={opt.value} onClick={() => !already && addCondition(addKey, opt.value)}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              width: "100%", padding: "8px 14px", fontSize: 12, textAlign: "left",
                              border: "none", cursor: already ? "default" : "pointer",
                              color: already ? "#76857f" : "#24423b",
                              background: "none",
                            }}>
                            {opt.label}
                            {already && (
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke={G.blue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        );
                      })
                    ) : (
                      <div style={{ padding: "20px 14px", fontSize: 11, color: "#76857f" }}>← 选择筛选类型</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {conditions.length > 0 && (
              <button onClick={() => setConditions([])}
                style={{ fontSize: 11, color: "#76857f", background: "none", border: "none", cursor: "pointer", padding: "3px 4px" }}>
                清除全部
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #d8e3dc" }}>
                {["站点名称 / ID", "触发异常与告警源", "级别", "当前电量 (SOC)", "负责人", "告警触发时间", "操作"].map((h) => (
                  <th key={h} style={{
                    padding: "11px 12px", textAlign: "left", fontSize: 11,
                    fontWeight: 500, color: "#76857f", background: "#f4f8f5",
                    whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => {
                const alert = s.alerts[0];
                return (
                  <tr key={s.id}
                    style={{ borderBottom: "1px solid #e8f0eb", background: idx % 2 === 0 ? "#fff" : "#f8fbf8", transition: "background 0.1s" }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "#e8f0eb")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? "#fff" : "#f8fbf8")}
                  >
                    {/* Name */}
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {s.imageUrl ? (
                          <img src={s.imageUrl} alt={s.name} style={{ width: 48, height: 32, objectFit: "cover", borderRadius: 5, flexShrink: 0, background: "#d8e3dc" }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div style={{ width: 48, height: 32, borderRadius: 5, background: "#e8f0eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <MapPin size={13} color="#cbd8d0" />
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>{s.name}</div>
                          <div style={{ ...mono, fontSize: 10, color: "#76857f", marginTop: 1 }}>{s.code}</div>
                        </div>
                      </div>
                    </td>

                    {/* Alert source */}
                    <td style={{ padding: "12px" }}>
                      <span style={{ fontSize: 12, color: alert ? "#465b53" : "#76857f" }}>
                        {alert ? alert.msg : "—"}
                      </span>
                    </td>

                    {/* Level */}
                    <td style={{ padding: "12px" }}>
                      {alert ? levelBadge(alert.level) : <span style={{ fontSize: 12, color: "#76857f" }}>—</span>}
                    </td>

                    {/* SOC */}
                    <td style={{ padding: "12px" }}>
                      {socDot(s.soc)}
                    </td>

                    {/* Manager */}
                    <td style={{ padding: "12px" }}>
                      <span style={{ fontSize: 12, color: "#465b53" }}>{s.manager || "—"}</span>
                    </td>

                    {/* Time */}
                    <td style={{ padding: "12px" }}>
                      <span style={{ ...mono, fontSize: 12, color: "#61716b" }}>{alert?.time ?? s.updateTime}</span>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: G.blue, padding: 0 }}>
                          排查故障
                        </button>
                        <span style={{ color: "#d8e3dc" }}>|</span>
                        <button style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#76857f", padding: 0 }}>
                          忽略
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "#61716b", marginBottom: 6 }}>{preset.emptyHint}</div>
              {(conditions.length > 0 || search) && (
                <div style={{ fontSize: 12, color: "#76857f" }}>尝试减少筛选条件</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
