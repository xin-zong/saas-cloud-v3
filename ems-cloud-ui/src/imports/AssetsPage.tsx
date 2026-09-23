import { useState, useRef, useEffect } from "react";
import { Star, Pencil, MapPin, Globe, CheckCircle } from "lucide-react";
import StationEditPage, { DRAFT_KEY } from "./StationEditPage";
import MapQueryTab from "./MapQueryTab";
import SmartRulesTab from "./SmartRulesTab";
import type { Station } from "../App";

// ─── Palette ─────────────────────────────────────────────────────────────────
const G = {
  green: "#10b981", greenBg: "#f0fdf8",
  red: "#ef4444",   redBg: "#fff5f5",
  blue: "#1f7a68",  blueBg: "#eaf5ef",
  gray: "#76857f",  grayBg: "#e8f0eb",
};

// ─── Derived display helpers ──────────────────────────────────────────────────
function getApprovalTag(s: Station) {
  if (s.status === "fault")    return { label: "告警",   color: G.red,  bg: G.redBg  };
  if (s.status === "building") return { label: "建设中", color: G.blue, bg: G.blueBg };
  if (s.dataStatus === "connected") return { label: "已接入", color: G.green, bg: G.greenBg };
  if (s.dataStatus === "partial")   return { label: "部分接入", color: G.gray, bg: G.grayBg };
  return { label: "未接入", color: G.gray, bg: G.grayBg };
}

function getRunTag(s: Station) {
  if (s.status === "offline")  return { label: "离线",   color: G.gray,  bg: G.grayBg  };
  if (s.status === "building") return { label: "建设中", color: G.blue,  bg: G.blueBg  };
  if (s.status === "fault")    return { label: "异常",   color: G.red,   bg: G.redBg   };
  if (s.runStatus === "正常")  return { label: "正常",   color: G.green, bg: G.greenBg };
  return { label: s.runStatus, color: G.gray, bg: G.grayBg };
}

function getDataEntry(s: Station) {
  if (s.dataStatus === "connected") return { label: "已接入",   color: G.green, bg: G.greenBg };
  if (s.dataStatus === "partial")   return { label: "部分接入", color: G.gray,  bg: G.grayBg  };
  return { label: "未接入", color: G.gray, bg: G.grayBg };
}

function getSocColor(soc: number) {
  return soc >= 60 ? G.green : soc >= 40 ? G.gray : G.red;
}

function getUpdateColor(s: Station) {
  if (s.updateTime === "离线" || s.updateTime === "—") return G.red;
  if (s.updateTime.includes("分钟") || s.updateTime === "刚刚") return G.green;
  return G.gray;
}

// ─── Region filter list ───────────────────────────────────────────────────────
const REGION_MENU = [
  { label: "全部区域", value: "" },
  { group: "中国大陆" },
  { label: "华东", value: "华东" }, { label: "华南", value: "华南" },
  { label: "华北", value: "华北" }, { label: "华中", value: "华中" },
  { label: "西南", value: "西南" }, { label: "西北", value: "西北" },
  { label: "东北", value: "东北" },
  { group: "亚太" },
  { label: "东南亚", value: "东南亚" }, { label: "日韩", value: "日韩" },
  { label: "南亚", value: "南亚" },    { label: "澳洲", value: "澳洲" },
  { group: "欧洲" },
  { label: "西欧", value: "西欧" }, { label: "中东欧", value: "中东欧" }, { label: "北欧", value: "北欧" },
  { group: "美洲" },
  { label: "北美", value: "北美" }, { label: "拉丁美洲", value: "拉丁美洲" },
  { group: "中东 & 非洲" },
  { label: "中东", value: "中东" }, { label: "非洲", value: "非洲" },
];

const TABS = ["列表查询", "收藏站点", "地图查询", "智能视图"];
const mono = { fontFamily: "'JetBrains Mono',monospace" };

function SocBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 44, height: 4, borderRadius: 2, background: "#e8f0eb", overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ ...mono, fontSize: 11, fontWeight: 600, color }}>{pct}%</span>
    </div>
  );
}

// ─── Manager tooltip cell ─────────────────────────────────────────────────────
function ManagerCell({ station: s }: { station: Station }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseEnter() {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    // Position tooltip below the cell, aligned left
    setPos({ top: rect.bottom + 8, left: rect.left });
    setVisible(true);
  }

  if (!s.manager) {
    return <span style={{ fontSize: 12, color: "#76857f" }}>—</span>;
  }

  return (
    <>
      <div
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setVisible(false)}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "default" }}
      >
        <div style={{ width: 24, height: 24, borderRadius: "50%", background: G.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
          {s.manager[0]}
        </div>
        <span style={{ fontSize: 12, color: "#24423b" }}>{s.manager}</span>
      </div>

      {visible && (
        <div
          onMouseEnter={() => setVisible(true)}
          onMouseLeave={() => setVisible(false)}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 9000,
            background: "#fff",
            border: "1px solid #d8e3dc",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            padding: "14px 16px",
            minWidth: 220,
            pointerEvents: "auto",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: G.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
              {s.manager[0]}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1d2f2a" }}>{s.manager}</div>
              {s.role && <div style={{ fontSize: 11, color: "#76857f", marginTop: 1 }}>{s.role}</div>}
            </div>
          </div>

          {/* Contact rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {s.email && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#76857f", flexShrink: 0 }}>✉</span>
                <span style={{ fontSize: 12, color: "#465b53" }}>{s.email}</span>
              </div>
            )}
            {s.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M10.5 8.5c-.4.9-1.5 1.5-2.5 1-1.2-.5-2.4-1.5-3.3-2.5S3 4.8 2.5 3.5C2 2.5 2.7 1.4 3.5 1c.3-.1.5 0 .7.2l1 1.5c.2.3.1.6-.1.8L4.5 4c.5.9 1.5 1.9 2.4 2.4l.5-.6c.2-.2.6-.3.8-.1l1.5 1c.2.2.3.5.3.8z" stroke="#76857f" strokeWidth="1.1" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 12, color: "#465b53" }}>{s.phone}</span>
              </div>
            )}
            {!s.email && !s.phone && (
              <span style={{ fontSize: 11, color: "#cbd8d0" }}>暂无联系方式</span>
            )}
          </div>

          {/* Arrow */}
          <div style={{ position: "absolute", top: -5, left: 14, width: 10, height: 10, background: "#fff", border: "1px solid #d8e3dc", borderRight: "none", borderBottom: "none", transform: "rotate(45deg)" }} />
        </div>
      )}
    </>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  stations: Station[];
  onUpdateStation: (id: string, patch: Partial<Station>) => void;
  onOpenStation: (id: string) => void;
}

export default function AssetsPage({ stations, onUpdateStation, onOpenStation }: Props) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("enerlution_assets_tab") ?? "列表查询");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [regionOpen, setRegionOpen] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const [starred, setStarred] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("enerlution_starred") ?? "{}"); }
    catch { return {}; }
  });

  // editTarget: null = list, "new" = new, Station = editing
  const [editTarget, setEditTarget] = useState<Station | "new" | null>(null);
  // initialDraft: pre-loaded draft for new station (from localStorage)
  const [initialDraft, setInitialDraft] = useState<object | null>(null);
  // resumeDialog: whether to show the "resume draft?" prompt
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  // pending: station id → patch waiting for approval
  const [pending, setPending] = useState<Record<string, Partial<Station>>>({});

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(e.target as Node)) setRegionOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function openNewStation() {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      setShowResumeDialog(true);
    } else {
      setInitialDraft(null);
      setEditTarget("new");
    }
  }

  // ── Draft resume dialog ─────────────────────────────────────────────────────
  if (showResumeDialog) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f8f5" }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: "32px 32px 28px", width: 380, boxShadow: "0 20px 60px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#eaf5ef", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M4 6h14M4 11h10M4 16h7" stroke="#1f7a68" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1d2f2a", marginBottom: 6 }}>发现上次的草稿</div>
            <div style={{ fontSize: 13, color: "#61716b", lineHeight: 1.6 }}>上次新增站点时保存了草稿，是否继续编辑？</div>
          </div>
          <div style={{ display: "flex", gap: 10, width: "100%", marginTop: 4 }}>
            <button
              onClick={() => {
                localStorage.removeItem(DRAFT_KEY);
                setInitialDraft(null);
                setShowResumeDialog(false);
                setEditTarget("new");
              }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #d8e3dc", background: "#fff", color: "#465b53", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              新建空白
            </button>
            <button
              onClick={() => {
                try {
                  const saved = localStorage.getItem(DRAFT_KEY);
                  setInitialDraft(saved ? JSON.parse(saved) : null);
                } catch { setInitialDraft(null); }
                setShowResumeDialog(false);
                setEditTarget("new");
              }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "#1f7a68", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              继续草稿
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Show edit page ──────────────────────────────────────────────────────────
  if (editTarget !== null) {
    const isNew = editTarget === "new";
    const station = isNew ? null : (editTarget as Station);
    return (
      <StationEditPage
        station={station}
        isNew={isNew}
        initialDraft={isNew ? (initialDraft as any) : null}
        onBack={() => { setEditTarget(null); setInitialDraft(null); }}
        onSubmit={(patch) => {
          if (station) {
            setPending((prev) => ({ ...prev, [station.id]: patch }));
          }
          setEditTarget(null);
        }}
      />
    );
  }

  // ── Filter ─────────────────────────────────────────────────────────────────
  const isFavorites = activeTab === "收藏站点";
  const filtered = stations.filter((s) => {
    if (isFavorites) return starred[s.id];
    const matchSearch = s.name.includes(search) || s.code.includes(search) || s.project.includes(search);
    const matchRegion = !region || s.region === region;
    return matchSearch && matchRegion;
  });

  const selectedLabel = REGION_MENU.find((r) => "value" in r && r.value === region)?.label ?? "区域";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f4f8f5", overflow: "hidden", minHeight: 0 }}>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #d8e3dc", background: "#fff", padding: "0 24px" }}>
        {TABS.map((tab) => {
          const active = tab === activeTab;
          return (
            <button key={tab} onClick={() => { setActiveTab(tab); localStorage.setItem("enerlution_assets_tab", tab); }}
              style={{ padding: "13px 20px 11px", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? G.blue : "#61716b", background: "none", border: "none", borderBottom: active ? `2px solid ${G.blue}` : "2px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>
              {tab}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      {!isFavorites && activeTab !== "地图查询" && activeTab !== "智能视图" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", background: "#fff", borderBottom: "1px solid #d8e3dc" }}>
          <button onClick={openNewStation}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 7, background: G.blue, color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v11M1 6.5h11" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
            </svg>
            新增站点
          </button>

          {/* Search */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, maxWidth: 320, height: 34, borderRadius: 7, border: "1px solid #d8e3dc", background: "#f4f8f5", padding: "0 12px" }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
              <circle cx="5.5" cy="5.5" r="4.5" stroke="#76857f" strokeWidth="1.5" />
              <path d="M9 9l2.5 2.5" stroke="#76857f" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input type="text" placeholder="搜索站点名称、ID、区域" value={search} onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, border: "none", background: "none", fontSize: 12, color: "#24423b", outline: "none" }} />
          </div>

          <div style={{ flex: 1 }} />

          {/* Region dropdown */}
          <div ref={regionRef} style={{ position: "relative" }}>
            <button onClick={() => setRegionOpen((o) => !o)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 12px", height: 34, borderRadius: 7, border: `1px solid ${region ? G.blue : "#d8e3dc"}`, background: region ? G.blueBg : "#fff", fontSize: 12, fontWeight: region ? 600 : 400, color: region ? G.blue : "#465b53", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
              <Globe size={12} color={region ? G.blue : "#76857f"} />
              {selectedLabel}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: regionOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
                <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            {regionOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 160, background: "#fff", border: "1px solid #d8e3dc", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 100, maxHeight: 340, overflowY: "auto" }}>
                {REGION_MENU.map((item, i) => {
                  if ("group" in item) return (
                    <div key={i} style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: "#76857f", letterSpacing: "0.06em", textTransform: "uppercase" }}>{item.group}</div>
                  );
                  const active = region === item.value;
                  return (
                    <button key={i} onClick={() => { setRegion(item.value!); setRegionOpen(false); }}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "7px 12px", fontSize: 12, fontWeight: active ? 600 : 400, color: active ? G.blue : "#24423b", background: active ? G.blueBg : "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "#f4f8f5"; }}
                      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = "none"; }}>
                      {item.label}
                      {active && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke={G.blue} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map query tab */}
      {activeTab === "地图查询" && (
        <MapQueryTab stations={stations} />
      )}

      {/* Smart rules tab */}
      {activeTab === "智能视图" && (
        <SmartRulesTab stations={stations} />
      )}

      {/* Table */}
      {activeTab !== "地图查询" && activeTab !== "智能视图" && (
      <div style={{ flex: 1, overflow: "auto", padding: "0 24px 24px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #d8e3dc" }}>
              {["站点名称 / 单联状态","电池/能源","当前电量","运行时间","累计收益","位置","负责人","数据接入","更新情况","运行模式","操作"].map((h) => (
                <th key={h} style={{ padding: "11px 12px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "#76857f", background: "#f4f8f5", whiteSpace: "nowrap", position: "sticky", top: 0, zIndex: 2 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, idx) => {
              const approvalTag = getApprovalTag(s);
              const runTag = getRunTag(s);
              const dataEntry = getDataEntry(s);
              const socColor = getSocColor(s.soc);
              const updateColor = getUpdateColor(s);
              const isPending = !!pending[s.id];

              return (
                <tr key={s.id}
                  onClick={() => onOpenStation(s.id)}
                  style={{ borderBottom: "1px solid #e8f0eb", background: idx % 2 === 0 ? "#fff" : "#f8fbf8", transition: "background 0.12s", cursor: "pointer" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "#e8f0eb")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = idx % 2 === 0 ? "#fff" : "#f8fbf8")}
                >
                  {/* Name */}
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {s.imageUrl ? (
                        <img src={s.imageUrl} alt={s.name} style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#d8e3dc" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div style={{ width: 64, height: 40, borderRadius: 6, background: "#e8f0eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <MapPin size={16} color="#cbd8d0" />
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a", marginBottom: 3 }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: "#76857f", ...mono, marginBottom: 4 }}>{s.code}</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, color: approvalTag.color, background: approvalTag.bg }}>{approvalTag.label}</span>
                          <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 3, color: runTag.color, background: runTag.bg }}>{runTag.label}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Type */}
                  <td style={{ padding: "12px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, color: G.blue, background: G.blueBg, border: `1px solid #b7d4c9` }}>{s.type}</span>
                  </td>

                  {/* SOC */}
                  <td style={{ padding: "12px" }}>
                    <SocBar pct={s.soc} color={socColor} />
                  </td>

                  {/* Runtime */}
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1d2f2a", ...mono }}>{s.activePower > 0 ? `${s.activePower} kW` : "—"}</div>
                    <div style={{ fontSize: 10, color: "#76857f", marginTop: 2 }}>{s.runtime}</div>
                    <div style={{ fontSize: 9, color: "#76857f" }}>运行时长</div>
                  </td>

                  {/* Revenue */}
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1d2f2a", ...mono }}>{s.revenue}</div>
                    <div style={{ fontSize: 9, color: "#76857f", marginTop: 2 }}>累计收益</div>
                  </td>

                  {/* Location */}
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                      <MapPin size={11} color={G.blue} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 11, color: "#465b53" }}>{s.region} / {s.project}</span>
                    </div>
                  </td>

                  {/* Manager */}
                  <td style={{ padding: "12px" }}>
                    <ManagerCell station={s} />
                  </td>

                  {/* Data entry */}
                  <td style={{ padding: "12px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 12, color: dataEntry.color, background: dataEntry.bg }}>{dataEntry.label}</span>
                  </td>

                  {/* Update */}
                  <td style={{ padding: "12px" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: updateColor }}>{s.updateTime}</div>
                    <div style={{ fontSize: 10, color: "#76857f", marginTop: 2 }}>{s.updateSub}</div>
                  </td>

                  {/* Mode */}
                  <td style={{ padding: "12px" }}>
                    <span style={{ fontSize: 12, color: "#24423b", fontWeight: 500 }}>{s.mode}</span>
                  </td>

                  {/* Actions */}
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isPending ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "#fef3c7", color: "#d97706" }}>审核中</span>
                          <button
                            title="模拟审核通过"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Write the approved patch back to the single source of truth
                              onUpdateStation(s.id, { ...pending[s.id], updateTime: "刚刚", updateSub: "审核通过" });
                              setPending((prev) => { const next = { ...prev }; delete next[s.id]; return next; });
                            }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex" }}>
                            <CheckCircle size={14} color={G.green} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); setStarred((prev) => { const next = { ...prev, [s.id]: !prev[s.id] }; localStorage.setItem("enerlution_starred", JSON.stringify(next)); return next; }); }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                            <Star size={14} fill={starred[s.id] ? G.blue : "none"} color={starred[s.id] ? G.blue : "#cbd8d0"} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditTarget(s); }}
                            style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                            <Pencil size={13} color={G.blue} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#76857f", fontSize: 13 }}>
            <Star size={28} color="#d8e3dc" style={{ margin: "0 auto 12px" }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: "#61716b", marginBottom: 6 }}>
              {isFavorites ? "暂无收藏站点" : "未找到匹配站点"}
            </div>
            {isFavorites && <div style={{ fontSize: 12, color: "#76857f" }}>在「列表查询」中点击 ☆ 收藏站点</div>}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
