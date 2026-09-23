import { DEMO_MODE } from "@/api/client"
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, Upload, MapPin, Lock, ChevronDown, ToggleLeft, ToggleRight } from "lucide-react";
import type { Station } from "@/App";

export const DRAFT_KEY = "enerlution_new_draft";

const REGIONS = ["华东","华南","华北","华中","西南","西北","东北","东南亚","日韩","欧洲","北美"];
const RUN_STATUS = ["正常","待机","维护中","异常"];
const TYPES = ["BESS","PV","Wind","Hybrid","Diesel"];
const MODES = ["削峰填谷","需量管理","备用电源","调频响应","光储联动","离网运行"];

const inputStyle: React.CSSProperties = {
  height: 36, borderRadius: 7, border: "1px solid #d8e3dc",
  padding: "0 12px", fontSize: 13, color: "#1d2f2a",
  background: "#fff", outline: "none", width: "100%",
};
const readonlyStyle: React.CSSProperties = {
  ...inputStyle, background: "#f4f8f5", color: "#76857f", cursor: "not-allowed",
};
const sectionStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #dbe6df",
  padding: "20px 24px", marginBottom: 16,
};
const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, color: "#1d2f2a",
  marginBottom: 16, display: "flex", alignItems: "center", gap: 8,
};
const accentStyle: React.CSSProperties = {
  width: 3, height: 14, borderRadius: 2, background: "#1f7a68", flexShrink: 0,
};
const grid2: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px",
};
const labelStyle = { fontSize: 12, color: "#61716b", fontWeight: 500 };

// ─── Dialog ──────────────────────────────────────────────────────────────────
type DialogConfig = {
  icon: "success" | "warning" | "confirm";
  title: string;
  message: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
};

function Dialog({ cfg, onClose }: { cfg: DialogConfig; onClose: () => void }) {
  const iconBg = cfg.icon === "success" ? "#f0fdf8" : cfg.icon === "warning" ? "#fff7ed" : "#f0f6ff";
  const iconColor = cfg.icon === "success" ? "#10b981" : cfg.icon === "warning" ? "#f59e0b" : "#1f7a68";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.35)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) { onClose(); cfg.onCancel?.(); } }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: "28px 28px 24px", width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {/* Icon */}
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {cfg.icon === "success" && (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M4 11l5 5 9-9" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {cfg.icon === "warning" && (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 8v5M11 15.5v.5" stroke={iconColor} strokeWidth="2.2" strokeLinecap="round" />
              <path d="M9.27 3.5L2 17h18L12.73 3.5a2 2 0 0 0-3.46 0z" stroke={iconColor} strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          )}
          {cfg.icon === "confirm" && (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="9" stroke={iconColor} strokeWidth="1.8" />
              <path d="M11 7v5M11 14.5v.5" stroke={iconColor} strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1d2f2a", marginBottom: 6 }}>{cfg.title}</div>
          <div style={{ fontSize: 13, color: "#61716b", lineHeight: 1.6 }}>{cfg.message}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 4, width: "100%" }}>
          {cfg.cancel && (
            <button
              onClick={() => { onClose(); cfg.onCancel?.(); }}
              style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "1px solid #d8e3dc", background: "#fff", color: "#465b53", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              {cfg.cancel}
            </button>
          )}
          <button
            onClick={() => { onClose(); cfg.onConfirm(); }}
            style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: cfg.danger ? "#ef4444" : "#1f7a68", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {cfg.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Draft type ───────────────────────────────────────────────────────────────
type Draft = Pick<Station,
  "ratedPower" | "storageCapacity" | "name" | "type" | "status" | "runStatus" | "region" | "project" |
  "address" | "lng" | "lat" | "soc" | "activePower" | "mode" |
  "manager" | "email" | "phone" | "role" | "remark" | "imageUrl"
>;

const emptyDraft: Draft = {
  ratedPower: 0, storageCapacity: 0, name: "", type: "BESS", status: "online", runStatus: "正常",
  region: "华东", project: "", address: "", lng: "", lat: "",
  soc: 0, activePower: 0, mode: "削峰填谷",
  manager: "", email: "", phone: "", role: "", remark: "", imageUrl: "",
};

function toDraft(s: Station | null): Draft {
  if (!s) return emptyDraft;
  return {
    ratedPower: s.ratedPower, storageCapacity: s.storageCapacity, name: s.name, type: s.type, status: s.status, runStatus: s.runStatus,
    region: s.region, project: s.project, address: s.address, lng: s.lng, lat: s.lat,
    soc: s.soc, activePower: s.activePower, mode: s.mode,
    manager: s.manager, email: s.email, phone: s.phone, role: s.role,
    remark: s.remark, imageUrl: s.imageUrl,
  };
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div style={{ position: "relative" }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, appearance: "none", paddingRight: 32, cursor: "pointer" }}>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
      <ChevronDown size={13} color="#76857f" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <fieldset disabled={!DEMO_MODE && !["站点名称", "所属区域", "区域", "详细地址", "地址", "经度", "纬度", "额定功率 (kW)", "储能容量 (kWh)"].includes(label)} style={{border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={labelStyle}>
        {required && <span style={{ color: "#ef4444", marginRight: 2 }}>*</span>}
        {label}
      </span>
      {children}
    </fieldset>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  station: Station | null;
  isNew: boolean;
  initialDraft?: Draft | null;   // pre-loaded draft (from localStorage)
  showRevenue?: boolean;
  onBack: () => void;
  onSubmit: (patch: Partial<Station>) => void | Promise<void>;
}

export default function StationEditPage({
  station,
  isNew,
  initialDraft,
  showRevenue = true,
  onBack,
  onSubmit,
}: Props) {
  const baseDraft = initialDraft ?? toDraft(station);
  const [draft, setDraft] = useState<Draft>(baseDraft);
  // Track last-saved snapshot to detect unsaved changes
  const [savedSnapshot, setSavedSnapshot] = useState<string>(JSON.stringify(baseDraft));
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isDirty = JSON.stringify(draft) !== savedSnapshot;

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: val }));

  // Auto-save new draft to localStorage on change (debounced via useEffect)
  useEffect(() => {
    if (!isNew) return;
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    }, 800);
    return () => clearTimeout(t);
  }, [draft, isNew]);

  function saveDraft() {
    const snapshot = JSON.stringify(draft);
    setSavedSnapshot(snapshot);
    if (isNew) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setDialog({
      icon: "success",
      title: "草稿已保存",
      message: isNew ? "新站点草稿已保存，下次新增时可继续编辑。" : "当前修改已保存为草稿，审核通过后生效。",
      confirm: "知道了",
      onConfirm: () => {},
    });
  }

  function requestBack() {
    if (!isDirty) { doBack(); return; }
    setDialog({
      icon: "warning",
      title: "有未保存的修改",
      message: "当前有未保存的内容，离开后将丢失修改。",
      confirm: "放弃并离开",
      cancel: "继续编辑",
      danger: true,
      onConfirm: doBack,
      onCancel: () => {},
    });
  }

  function doBack() {
    onBack();
  }

  function requestSubmit() {
    if (!DEMO_MODE) {void doSubmit(); return;}
    if (!draft.name.trim()) {
      setDialog({
        icon: "warning",
        title: "请填写必填项",
        message: "站点名称为必填项，请填写后再提交。",
        confirm: "知道了",
        onConfirm: () => {},
      });
      return;
    }
    setDialog({
      icon: "confirm",
      title: "确认提交审核",
      message: `将「${draft.name || "新站点"}」提交至审核流程，审核通过后数据正式生效。`,
      confirm: "确认提交",
      cancel: "取消",
      onConfirm: doSubmit,
    });
  }

  async function doSubmit() {
    if (!DEMO_MODE) {
      try { await onSubmit(draft) }
      catch(error) {setDialog({icon: 'warning', title: '保存失败', message: error instanceof Error ? error.message : '请求失败', confirm: '知道了', onConfirm: () => {}})}
      return
    }
    if (isNew) localStorage.removeItem(DRAFT_KEY);
    onSubmit({
      ...draft,
      shortName: draft.name.slice(0, 4),
      updateTime: "刚刚",
      updateSub: "审核通过",
    });
  }

  const previewImg = draft.imageUrl || station?.imageUrl || "";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f4f8f5", overflow: "hidden", minHeight: 0 }}>

      {dialog && <Dialog cfg={dialog} onClose={() => setDialog(null)} />}

      {!DEMO_MODE && <p style={{padding: 12}}>当前仅保存名称、容量、额定功率、区域、地址及坐标，其他字段尚未接入。</p>}
      {/* Top bar */}
      <div style={{ background: "#fff", borderBottom: "1px solid #d8e3dc", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#76857f" }}>
            <span>站点中心</span><span>/</span>
            <span style={{ color: "#1f7a68", cursor: "pointer" }} onClick={requestBack}>列表查询</span>
            {!isNew && station && <><span>/</span><span style={{ color: "#1f7a68" }}>{station.name}</span></>}
            <span>/</span><span>{isNew ? "新增" : "编辑"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={requestBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
              <ChevronLeft size={16} color="#61716b" />
            </button>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#1d2f2a" }}>
              {isNew ? "新增站点信息" : "编辑站点信息"}
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: isDirty ? "#fef3c7" : "#e8f0eb", color: isDirty ? "#d97706" : "#76857f" }}>
              {isDirty ? "草稿" : "已保存"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button disabled={!DEMO_MODE} title={!DEMO_MODE ? "草稿尚未接入服务器" : undefined} onClick={saveDraft}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 7, border: "1px solid #d8e3dc", background: "#fff", color: "#465b53", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            保存草稿
          </button>
          <button onClick={requestSubmit}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 18px", borderRadius: 7, border: "none", background: "#1f7a68", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 6.5l3.5 3.5 5.5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            提交审核
          </button>
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>

        {/* 基本信息 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><div style={accentStyle} />基本信息</div>
          <div style={grid2}>
            <Field label="站点名称" required>
              <input style={inputStyle} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="请输入站点名称" />
            </Field>
            <Field label="站点 ID">
              <div style={{ position: "relative" }}>
                <input style={readonlyStyle} value={station?.code ?? "自动生成"} readOnly />
                <Lock size={12} color="#cbd8d0" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </Field>
            <Field label="站点类型" required>
              <SelectInput value={draft.type} onChange={(v) => set("type", v)} options={TYPES} />
            </Field>
            <Field label="站点状态">
              <div style={{ display: "flex", alignItems: "center", height: 36, gap: 10 }}>
                <button onClick={() => set("status", draft.status === "online" ? "offline" : "online")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                  {draft.status === "online"
                    ? <ToggleRight size={28} color="#1f7a68" />
                    : <ToggleLeft size={28} color="#76857f" />}
                </button>
                <span style={{ fontSize: 13, fontWeight: 600, color: draft.status === "online" ? "#10b981" : "#76857f" }}>
                  {draft.status === "online" ? "在线" : "离线"}
                </span>
              </div>
            </Field>
            <Field label="运行状态">
              <SelectInput value={draft.runStatus} onChange={(v) => set("runStatus", v)} options={RUN_STATUS} />
            </Field>
            <Field label="概览图">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {previewImg && <img src={previewImg} alt="preview" style={{ width: 56, height: 36, objectFit: "cover", borderRadius: 6, border: "1px solid #d8e3dc", flexShrink: 0 }} />}
                <div>
                  <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png" style={{ display: "none" }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) set("imageUrl", URL.createObjectURL(f)); }} />
                  <button onClick={() => fileRef.current?.click()}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 6, border: "1px solid #d8e3dc", background: "#f4f8f5", fontSize: 12, color: "#1f7a68", cursor: "pointer", fontWeight: 500 }}>
                    <Upload size={11} />上传图片
                  </button>
                  <div style={{ fontSize: 10, color: "#76857f", marginTop: 3 }}>支持 JPG、PNG</div>
                </div>
              </div>
            </Field>
          </div>
        </div>

        {/* 位置信息 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><div style={accentStyle} />位置信息</div>
          <div style={grid2}>
            <Field label="所属区域" required>
              <SelectInput value={draft.region} onChange={(v) => set("region", v)} options={REGIONS} />
            </Field>
            <Field label="所属项目">
              <input style={inputStyle} value={draft.project} onChange={(e) => set("project", e.target.value)} placeholder="请输入项目名称" />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Field label="详细地址" required>
              <div style={{ position: "relative" }}>
                <MapPin size={12} color="#1f7a68" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
                <input style={{ ...inputStyle, paddingLeft: 28 }} value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="请输入详细地址" />
              </div>
            </Field>
          </div>
          <div style={{ marginTop: 14, borderRadius: 8, border: "1px solid #d8e3dc", height: 140, background: "#e8f0eb", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
              {[1,2,3].map((i) => <line key={`h${i}`} x1="0" y1={`${i*25}%`} x2="100%" y2={`${i*25}%`} stroke="#d8e3dc" strokeWidth="1" />)}
              {[1,2,3,4,5,6].map((i) => <line key={`v${i}`} x1={`${i*16.67}%`} y1="0" x2={`${i*16.67}%`} y2="100%" stroke="#d8e3dc" strokeWidth="1" />)}
            </svg>
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1f7a68", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(59,130,246,0.4)" }}>
                <MapPin size={14} color="#fff" fill="#fff" />
              </div>
              <span style={{ fontSize: 10, color: "#76857f" }}>点击地图选取坐标</span>
            </div>
            <button style={{ position: "absolute", top: 8, right: 8, display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, border: "1px solid #d8e3dc", background: "rgba(255,255,255,0.9)", fontSize: 11, color: "#465b53", cursor: "pointer" }}>
              <MapPin size={10} color="#1f7a68" />选取坐标
            </button>
          </div>
          <div style={{ ...grid2, marginTop: 14 }}>
            <Field label="经度">
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#76857f" }}>⊕</span>
                <input style={{ ...inputStyle, paddingLeft: 24 }} value={draft.lng} onChange={(e) => set("lng", e.target.value)} placeholder="120.7153°E" />
              </div>
            </Field>
            <Field label="纬度">
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#76857f" }}>⊕</span>
                <input style={{ ...inputStyle, paddingLeft: 24 }} value={draft.lat} onChange={(e) => set("lat", e.target.value)} placeholder="31.2989°N" />
              </div>
            </Field>
          </div>
        </div>

        {/* 运营概览 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><div style={accentStyle} />运营概览</div>
          <div style={grid2}>
            <Field label="电池容量 (SOC)">
              <div style={{ position: "relative" }}>
                <input style={{ ...inputStyle, paddingRight: 32 }} value={draft.soc} onChange={(e) => set("soc", Number(e.target.value))} placeholder="0" type="number" min={0} max={100} />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#76857f" }}>%</span>
              </div>
            </Field>
            <Field label="当前功率">
              <div style={{ position: "relative" }}>
                <input style={{ ...inputStyle, paddingRight: 32 }} value={draft.activePower} onChange={(e) => set("activePower", Number(e.target.value))} placeholder="0" type="number" min={0} />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#76857f" }}>kW</span>
              </div>
            </Field>
            <Field label="累计运行时间">
              <div style={{ position: "relative" }}>
                <input style={readonlyStyle} value={station?.runtime ?? "—"} readOnly />
                <Lock size={12} color="#cbd8d0" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }} />
              </div>
            </Field>
            {showRevenue && (
              <Field label="累计收益">
                <div style={{ position: "relative" }}>
                  <input style={readonlyStyle} value={station?.revenue ?? "—"} readOnly />
                  <Lock size={12} color="#cbd8d0" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }} />
                </div>
              </Field>
            )}
            <Field label="额定功率 (kW)"><input type="number" value={draft.ratedPower} onChange={e => set("ratedPower", Number(e.target.value))} style={inputStyle}/></Field>
            <Field label="储能容量 (kWh)"><input type="number" value={draft.storageCapacity} onChange={e => set("storageCapacity", Number(e.target.value))} style={inputStyle}/></Field>
            <Field label="运行模式">
              <SelectInput value={draft.mode} onChange={(v) => set("mode", v)} options={MODES} />
            </Field>
          </div>
        </div>

        {/* 负责人 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><div style={accentStyle} />负责人</div>
          <div style={grid2}>
            <Field label="负责人" required>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, borderRadius: "50%", background: "#1f7a68", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>
                  {draft.manager ? draft.manager[0] : "?"}
                </div>
                <input style={{ ...inputStyle, paddingLeft: 34 }} value={draft.manager} onChange={(e) => set("manager", e.target.value)} placeholder="请输入负责人姓名" />
              </div>
            </Field>
            <Field label="联系邮箱">
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#76857f" }}>✉</span>
                <input style={{ ...inputStyle, paddingLeft: 26 }} value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="name@enerlution.com" />
              </div>
            </Field>
            <Field label="联系电话">
              <input style={inputStyle} value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="138-0000-0000" />
            </Field>
            <Field label="职务/角色">
              <input style={inputStyle} value={draft.role} onChange={(e) => set("role", e.target.value)} placeholder="站点运维工程师" />
            </Field>
          </div>
        </div>

        {/* 备注信息 */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}><div style={accentStyle} />备注信息</div>
          <Field label="备注">
            <textarea value={draft.remark} onChange={(e) => set("remark", e.target.value)}
              placeholder="请输入备注信息..." rows={4}
              style={{ borderRadius: 7, border: "1px solid #d8e3dc", padding: "10px 12px", fontSize: 13, color: "#1d2f2a", background: "#fff", outline: "none", width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }} />
          </Field>
        </div>

        {/* Bottom actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingBottom: 8 }}>
          <button onClick={requestBack} style={{ padding: "8px 20px", borderRadius: 7, border: "1px solid #d8e3dc", background: "#fff", color: "#465b53", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>取消</button>
          <button disabled={!DEMO_MODE} title={!DEMO_MODE ? "草稿尚未接入服务器" : undefined} onClick={saveDraft} style={{ padding: "8px 20px", borderRadius: 7, border: "1px solid #d8e3dc", background: "#fff", color: "#465b53", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>保存草稿</button>
          <button onClick={requestSubmit} style={{ padding: "8px 24px", borderRadius: 7, border: "none", background: "#1f7a68", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{DEMO_MODE ? "提交审核" : "保存到服务器"}</button>
        </div>
      </div>
    </div>
  );
}
