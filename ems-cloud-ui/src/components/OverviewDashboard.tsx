import { useEffect, useRef, useState } from "react"
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { DEMO_MODE } from "@/api/client"
import type { Station } from "@/App"
import type { AuthUser, NavLabel } from "@/auth/roles"
import { buildStorageTrend, buildRevenueSummary } from "@/data/stationMetrics"
import { WORK_ORDER_STATUS } from "@/data/stationMaintenance"
import { Button } from "./ui/Workspace"

const sections = ["运行健康分布", "当前各区域储能负荷分布 (MWh)", "储能充放量趋势", "核心站点区域分布", "最近运维工单", "待审批事项"] as const
const dateString = (date: Date) => date.toLocaleDateString("en-CA")
const initialRange = () => { const end = new Date(); const start = new Date(); start.setDate(start.getDate() - 6); return { start: dateString(start), end: dateString(end) } }
type Props = { stations: Station[]; user: AuthUser; nav: NavLabel[]; onNavigate: (nav: NavLabel) => void; onOpenStation: (id: string) => void; registerLeaveGuard: (guard: null | (() => Promise<boolean>)) => void }

export default function OverviewDashboard({ stations, user, nav, onNavigate, onOpenStation, registerLeaveGuard }: Props) {
  const scopeKey = `enerlution-overview-layout-v1:${DEMO_MODE ? "demo" : "api"}:${user.id}:${stations.map(s => s.id).sort().join(",")}`
  const [visible, setVisible] = useState<string[]>([...sections])
  const [draft, setDraft] = useState<string[]>([...sections])
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [period, setPeriod] = useState("近7天")
  const [range, setRange] = useState(initialRange)
  const [dateDraft, setDateDraft] = useState(initialRange)
  const [custom, setCustom] = useState(false)
  const [leave, setLeave] = useState(false)
  const resolveLeave = useRef<((ok: boolean) => void) | null>(null)
  const dirty = editing && JSON.stringify(visible) !== JSON.stringify(draft)
  useEffect(() => {
    resolveLeave.current?.(false)
    resolveLeave.current = null
    setLeave(false)
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(scopeKey) || "null")
      setVisible(Array.isArray(saved) && saved.length && saved.every(x => sections.includes(x)) ? saved : [...sections])
    } catch { setVisible([...sections]) }
    setEditing(false); setError(""); setNotice("")
  }, [scopeKey])
  useEffect(() => {
    registerLeaveGuard(() => dirty ? new Promise<boolean>(resolve => { resolveLeave.current = resolve; setLeave(true) }) : Promise.resolve(true))
    const unload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }
    window.addEventListener("beforeunload", unload)
    return () => { registerLeaveGuard(null); window.removeEventListener("beforeunload", unload) }
  }, [dirty, registerLeaveGuard])
  useEffect(() => () => { resolveLeave.current?.(false) }, [])
  const finishLeave = (ok: boolean) => { setLeave(false); if (ok) setEditing(false); resolveLeave.current?.(ok); resolveLeave.current = null }
  function cancelEdit() { if (dirty) { setLeave(true); resolveLeave.current = ok => { if (ok) setEditing(false) } } else setEditing(false) }
  const dialogHandlers = useRef({ finishLeave, cancelEdit })
  dialogHandlers.current = { finishLeave, cancelEdit }
  useEffect(() => {
    if (!editing && !custom && !leave) return
    const dialogs = document.querySelectorAll<HTMLElement>(".overview-modal")
    const dialog = dialogs[dialogs.length - 1]
    const previous = document.activeElement as HTMLElement | null
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)')]
    controls()[0]?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (leave) dialogHandlers.current.finishLeave(false); else if (custom) { setCustom(false); setError("") } else dialogHandlers.current.cancelEdit() }
      if (event.key === "Tab") {
        const items = controls(); const first = items[0]; const last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    dialog.addEventListener("keydown", key)
    return () => { dialog.removeEventListener("keydown", key); if (previous?.isConnected) previous.focus() }
  }, [editing, custom, leave])
  function save() {
    if (!draft.length) { setError("请至少保留一个看板模块"); return }
    try { localStorage.setItem(scopeKey, JSON.stringify(draft)); setVisible([...draft]); setEditing(false); setError(""); setNotice("布局已保存至本机") }
    catch { setError("无法保存至本机，请检查浏览器存储后重试") }
  }
  function choosePeriod(value: string) {
    setError("")
    if (value === "自定义") { setDateDraft(range); setCustom(true); return }
    const end = new Date(); const start = new Date(); start.setDate(start.getDate() - (value === "近30天" ? 29 : value === "近7天" ? 6 : 0))
    setRange({ start: dateString(start), end: dateString(end) }); setPeriod(value)
  }
  function exportData() {
    const cell = (value: unknown) => `"${String(typeof value === "number" && !Number.isFinite(value) ? "" : value ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`
    const rows = [["站点", "编码", "区域", "额定功率(kW)", "储能容量", "范围开始", "范围结束", "数据说明"], ...stations.map(s => [s.name, s.code, s.region, s.ratedPower, s.storageCapacity, range.start, range.end, "站点当前快照；趋势未接通的指标不导出"])]
    const blob = new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `总览站点快照-${range.end}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice("已导出当前授权站点快照")
  }
  const status = [{ label: "正常运行", color: "#226d5b", count: stations.filter(s => s.status === "online").length }, { label: "警告状态", color: "#ed8b00", count: stations.filter(s => s.status === "offline").length }, { label: "严重故障", color: "#ef4444", count: stations.filter(s => s.status === "fault").length }]
  const rangeDays = Math.max(1, Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1)
  const trendDays = Math.min(31, rangeDays)
  const demoTrend = DEMO_MODE && stations.length ? buildStorageTrend(stations, period === "今日" ? "today" : "month") : []
  const trend = period === "今日" ? demoTrend : demoTrend.length ? Array.from({ length: trendDays }, (_, i) => {
    const source = demoTrend[Math.min(demoTrend.length - 1, Math.floor(i / trendDays * demoTrend.length))]
    const date = new Date(range.start + "T00:00:00"); date.setDate(date.getDate() + (trendDays === 1 ? 0 : Math.round(i * (rangeDays - 1) / (trendDays - 1))))
    return { h: dateString(date).slice(5), charge: source.charge / 4, discharge: source.discharge / 4 }
  }) : []
  const orders = stations.flatMap(s => (s.maintenance?.workOrders ?? []).map(order => ({ ...order, station: s }))).filter(o => !o.createdAt || (o.createdAt.slice(0, 10) >= range.start && o.createdAt.slice(0, 10) <= range.end)).slice(0, 3)
  const approvals = stations.flatMap(s => (s.maintenance?.approvals ?? []).filter(a => a.status === "pending").map(a => ({ ...a, station: s }))).slice(0, 3)
  const regions = [...new Set(stations.map(s => s.region || "未设置区域"))]
  const regionalCapacity = regions.slice(0, 3).map(region => {
    const members = stations.filter(s => (s.region || "未设置区域") === region)
    const complete = members.every(s => Number.isFinite(s.storageCapacity))
    return { region, complete, capacity: complete ? (members.reduce((sum, s) => sum + s.storageCapacity, 0) / (DEMO_MODE ? 1 : 1000)).toFixed(2) : "—" }
  })
  const alerts = stations.reduce((n, s) => n + s.alerts.length, 0)
  return <section className="overview-dashboard" aria-label="经营看板">
    <div className="overview-dashboard-heading"><div><h1>平台总览运营看板</h1><p>快速获悉全场站的电量分发、设备运行及实时收益趋势</p></div><div className="overview-dashboard-actions">
      <div className="ui-segmented">{["今日", "近7天", "近30天", "自定义"].map(p => <button key={p} aria-pressed={period === p} onClick={() => choosePeriod(p)}>{p}</button>)}</div>
      <Button onClick={exportData}><img src="/figma/overview/dashboard/imgDownload.svg" alt="" />数据导出</Button><Button onClick={() => { setDraft([...visible]); setEditing(true); setError(""); setNotice("") }}><img src="/figma/overview/dashboard/imgEdit.svg" alt="" />页面定制</Button>
    </div></div>
    <div className="overview-dashboard-range">{range.start} — {range.end} · {DEMO_MODE ? "演示数据" : "当前授权站点快照；历史趋势未接通"}</div>
    {notice && <p role="status" className="overview-notice">{notice}</p>}
    <div className="overview-kpis">{[["站点总数", stations.length, "个"], ["在线站点", DEMO_MODE ? status[0].count : "—", "个"], ["待处理告警", alerts, "项"], ["昨日收益", DEMO_MODE && user.role === "owner" ? buildRevenueSummary(stations).yesterday.toFixed(2) : "—", "元"]].map(([label, value, unit]) => <article key={label}><span>{label}</span><div><strong>{value}</strong><small>{unit}</small></div></article>)}</div>
    <div className="overview-dashboard-grid">
      {visible.includes(sections[0]) && <article><h2>{sections[0]}</h2><div className="overview-health"><div className="overview-health-chart"><PieChart width={110} height={110}><Pie isAnimationActive={false} data={DEMO_MODE && stations.length ? status : [{ count: 1, color: "#e9eef1" }]} dataKey="count" innerRadius={38} outerRadius={52} stroke="none">{(DEMO_MODE && stations.length ? status : [{ color: "#e9eef1" }]).map((s, i) => <Cell key={i} fill={s.color} />)}</Pie></PieChart><strong>{stations.length}<small>总站数</small></strong></div><div>{status.map(s => <p key={s.label}><i style={{ background: s.color }} />{s.label}<b>{DEMO_MODE ? s.count : "—"} 个</b></p>)}</div></div></article>}
      {visible.includes(sections[1]) && <article><h2>{sections[1]}</h2>{regionalCapacity.length ? regionalCapacity.map(({ region, complete, capacity }) => <div className="overview-region-load" key={region}><div><span>{region}</span><b>— / {capacity} MWh</b></div><progress value={0} max={100} /><small>{complete ? "负荷数据未接通" : "容量数据不完整 · 负荷数据未接通"}</small></div>) : <div className="overview-empty">暂无授权站点容量数据</div>}</article>}
      {visible.includes(sections[2]) && <article><h2>{period}储能充放量趋势</h2><div className="overview-trend">{trend.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={trend}><XAxis dataKey="h" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} width={35} /><Tooltip /><Line isAnimationActive={false} name="充电量(MWh)" dataKey="charge" stroke="#226d5b" dot={false} /><Line isAnimationActive={false} name="放电量(MWh)" dataKey="discharge" stroke="#4c6ef5" strokeDasharray="4 3" dot={false} /></LineChart></ResponsiveContainer> : <div className="overview-empty">暂无储能趋势数据</div>}</div></article>}
      {visible.includes(sections[3]) && <article><h2>{sections[3]}</h2><div className="overview-region-map"><img src="/figma/overview/dashboard/imgMapLayer.png" alt="区域示意底图，不代表站点位置" /><span>示意底图</span></div><div className="overview-station-links">{stations.map(s => <button key={s.id} onClick={() => onOpenStation(s.id)}>{s.name}</button>)}</div></article>}
      {visible.includes(sections[4]) && <article><div className="overview-card-heading"><h2>{sections[4]}</h2>{nav.includes("工单与审批") && <button onClick={() => onNavigate("工单与审批")}>查看全部 →</button>}</div><table><thead><tr><th>工单编号</th><th>工单类型</th><th>目标场站</th><th>状态</th></tr></thead><tbody>{orders.map(o => <tr key={o.id}><td>{o.id}</td><td>{o.title}</td><td>{o.station.name}</td><td>{WORK_ORDER_STATUS[o.status]}</td></tr>)}</tbody></table>{!orders.length && <div className="overview-empty">当前范围暂无可查看工单</div>}</article>}
      {visible.includes(sections[5]) && <article><div className="overview-card-heading"><h2>{sections[5]}</h2>{nav.includes("工单与审批") && <button onClick={() => onNavigate("工单与审批")}>查看全部 →</button>}</div>{approvals.map(a => <div className="overview-approval" key={a.id}><b>{a.station.name} · {a.title}</b><small>{a.submitter} 发起 · {a.submittedAt}</small></div>)}{!approvals.length && <div className="overview-empty">暂无可查看的待审批事项</div>}</article>}
    </div>
    {custom && <div className="overview-modal-backdrop"><section role="dialog" aria-modal="true" aria-label="自定义时间范围" className="overview-modal"><h2>自定义时间范围</h2><label>开始日期<input type="date" value={dateDraft.start} onChange={e => setDateDraft({ ...dateDraft, start: e.target.value })} /></label><label>结束日期<input type="date" value={dateDraft.end} onChange={e => setDateDraft({ ...dateDraft, end: e.target.value })} /></label>{error && <p role="alert">{error}</p>}<footer><Button onClick={() => { setCustom(false); setError("") }}>取消</Button><Button variant="primary" onClick={() => { if (!dateDraft.start || !dateDraft.end) { setError("请选择完整的开始和结束日期"); return } if (dateDraft.end < dateDraft.start) { setError("结束日期不能早于开始日期"); return } setRange(dateDraft); setPeriod("自定义"); setCustom(false); setError("") }}>应用时间范围</Button></footer></section></div>}
    {editing && <div className="overview-modal-backdrop"><section role="dialog" aria-modal="true" aria-label="页面定制" className="overview-modal"><h2>页面定制</h2><p>选择看板模块。布局仅保存到当前账号和站点范围的本机浏览器。</p>{sections.map(s => <label key={s} className="overview-checkbox"><input type="checkbox" checked={draft.includes(s)} onChange={e => setDraft(e.target.checked ? [...draft, s] : draft.filter(x => x !== s))} />{s}</label>)}{error && <p role="alert">{error}</p>}<footer><Button onClick={cancelEdit}>取消</Button><Button variant="primary" onClick={save}>保存页面布局</Button></footer></section></div>}
    {leave && <div className="overview-modal-backdrop"><section role="alertdialog" aria-modal="true" aria-label="放弃布局修改" className="overview-modal"><h2>放弃未保存的布局修改？</h2><p>离开后将保留上次保存的页面布局。</p><footer><Button onClick={() => finishLeave(false)}>继续编辑</Button><Button variant="primary" onClick={() => finishLeave(true)}>放弃修改</Button></footer></section></div>}
  </section>
}
