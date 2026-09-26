import { useEffect, useState } from "react"
import { allRows, DEMO_MODE } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { Button, Select } from "./ui/Workspace"
import { saveBlob } from "./apiAnalytics"
import type { Station } from "@/App"

type Audit = { id: number; actor_id: number | null; action: string; occurred_at: string; detail: string }
const initialFilters = { date: "", type: "", station: "", actor: "", result: "", search: "" }
const recordedStation = (row: Audit) => /(?:^|[,;\s])station=(\d+)(?=[,;\s]|$)/.exec(row.detail)?.[1]
export default function AnalyticsAudit({ stations = [] }: { stations?: Station[] }) {
  const { user } = useAuth()
  const canRead = !DEMO_MODE && !!user?.permissions.includes("audit.read")
  const [rows, setRows] = useState<Audit[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filters, setFilters] = useState(initialFilters)
  const [notice, setNotice] = useState("")
  const [page, setPage] = useState(1)
  useEffect(() => {
    const controller = new AbortController()
    setRows([]); setExpanded(null); setError(""); setNotice("")
    if (!canRead) return
    setLoading(true)
    allRows<Audit>("/audit", controller.signal).then(data => { if (!controller.signal.aborted) setRows(data) }).catch(e => { if (!controller.signal.aborted) setError(e.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [canRead, user?.id, retry])
  const visible = canRead ? rows.filter(row => (!filters.date || new Date(row.occurred_at).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) === filters.date) && (!filters.type || row.action === filters.type) && (!filters.actor || String(row.actor_id) === filters.actor) && (!filters.station || recordedStation(row) === filters.station) && !filters.result && `${row.id} ${row.action} ${row.detail}`.toLowerCase().includes(filters.search.trim().toLowerCase())) : []
  const pages = Math.max(1, Math.ceil(visible.length / 10))
  const currentPage = Math.min(page, pages)
  const pageRows = visible.slice((currentPage - 1) * 10, currentPage * 10)
  const change = (field: keyof typeof filters, value: string) => { setFilters({ ...filters, [field]: value }); setExpanded(null); setPage(1) }
  return <section className="analytics-audit" aria-label="事件审计">
    <p className="api-analytics-hint">{DEMO_MODE ? "演示模式 · 审计服务未接通。" : canRead ? "仅显示当前账户可见的操作日志；设备事件协议、执行结果和状态快照尚未接通。" : "当前账户没有 audit.read 权限，无法读取审计记录。"}</p>
    <div className="analytics-audit-filters">
      <label>时间范围<input type="date" aria-label="审计日期" value={filters.date} onChange={e => change("date", e.target.value)} /></label>
      <label>事件类型<Select aria-label="事件类型" value={filters.type} onChange={e => change("type", e.target.value)}><option value="">全部</option>{[...new Set(rows.map(r => r.action))].map(type => <option key={type}>{type}</option>)}{["运行模式切换", "控制指令", "告警触发", "策略发布", "用户操作", "调度计划"].map(type => <option key={type}>{type}</option>)}</Select></label>
      <label>站点范围<Select aria-label="审计站点范围" value={filters.station} onChange={e => change("station", e.target.value)}><option value="">当前账户可见记录</option>{stations.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</Select></label>
      <label>操作人<Select aria-label="审计操作人" value={filters.actor} onChange={e => change("actor", e.target.value)}><option value="">全部可见操作人</option><option value={user?.id}>{user?.name ?? "当前账户"}</option></Select></label>
      <label>结果状态<Select aria-label="审计结果状态" value={filters.result} onChange={e => change("result", e.target.value)}><option value="">全部（结果未提供）</option>{["成功", "失败", "超时"].map(v => <option key={v}>{v}</option>)}</Select></label>
      <input aria-label="搜索日志编号、操作内容" placeholder="搜索日志编号、操作内容" value={filters.search} onChange={e => change("search", e.target.value)} />
      <Button onClick={() => { setFilters(initialFilters); setExpanded(null); setPage(1) }}>重置</Button>
    </div>
    {error && <div role="alert">{error} <Button onClick={() => setRetry(r => r + 1)}>重试审计读取</Button></div>}
    {notice && <p role="status">{notice}</p>}
    <div className="analytics-audit-table"><table className="ui-table"><thead><tr>{["事件编号", "时间", "事件类型", "操作人", "站点/设备", "操作内容与指令", "结果状态", "关联告警", "关联工单"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{pageRows.map(row => <AuditRows key={row.id} row={row} expanded={expanded === row.id} actor={user?.name ?? String(row.actor_id)} onToggle={() => setExpanded(expanded === row.id ? null : row.id)} onCopy={async () => { try { await navigator.clipboard.writeText(JSON.stringify(row, null, 2)); setNotice("已复制真实操作日志 JSON") } catch { setNotice("复制失败，请选择下方 JSON 手动复制") } }} />)}{!visible.length && <tr><td colSpan={9} className="api-analytics-table-empty">{loading && canRead ? "读取审计记录中…" : "没有符合筛选条件的审计记录"}</td></tr>}</tbody></table></div>
    <footer><Button disabled={!visible.length} onClick={() => { const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""').replace(/^([=+@-])/, "'$1")}"`; const csv = [["事件编号", "时间", "事件类型", "操作人ID", "操作详情"], ...visible.map(r => [r.id, r.occurred_at, r.action, r.actor_id, r.detail])].map(row => row.map(escape).join(",")).join("\r\n"); saveBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), "my-audit-events.csv") }}>导出审计日志 CSV</Button><span>共 {visible.length} 条当前账户记录 · CSV 可由 Excel 打开</span><div className="analytics-audit-pagination"><Button aria-label="审计上一页" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setExpanded(null) }}>上一页</Button><span>{currentPage} / {pages}</span><Button aria-label="审计下一页" disabled={currentPage === pages} onClick={() => { setPage(currentPage + 1); setExpanded(null) }}>下一页</Button></div></footer>
  </section>
}
function AuditRows({ row, expanded, actor, onToggle, onCopy }: { row: Audit; expanded: boolean; actor: string; onToggle: () => void; onCopy: () => void }) {
  return <><tr><td><button type="button" className="analytics-report-link" aria-label={`查看事件 ${row.id}`} aria-expanded={expanded} onClick={onToggle}>{row.id}</button></td><td>{new Date(row.occurred_at).toLocaleString("zh-CN")}</td><td>{row.action}</td><td>{actor}</td><td>未提供</td><td>{row.detail}</td><td>未提供</td><td>未提供</td><td>未提供</td></tr>{expanded && <tr><td colSpan={9}><div className="analytics-audit-detail"><section><h3>操作状态快照</h3><div className="analytics-audit-snapshots"><p>操作前状态 Pre-state<br />未提供</p><p>操作后状态 Post-state<br />未提供</p></div><h4>设备回执反馈 Receipt</h4><p>设备回执接口未接通</p></section><section><header><h3>完整 JSON 数据协议</h3><Button onClick={onCopy}>COPY JSON</Button></header><pre>{JSON.stringify(row, null, 2)}</pre></section></div></td></tr>}</>
}
