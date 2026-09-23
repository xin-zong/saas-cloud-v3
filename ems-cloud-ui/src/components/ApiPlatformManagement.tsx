import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import type { Station } from "@/App"
import { api, allRows, send } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { Building2, Users, Search, ChevronDown, FolderTree, X } from "lucide-react"
import RolePermissionsPanel, { type RolePermissionsHandle } from "./RolePermissionsPanel"
import MemberOrganizationPanel from "./MemberOrganizationPanel"
import "./platform-management.css"
import "./organization-permissions.css"
import "./api-platform-management.css"

type Tab = "客户管理" | "组织权限" | "安全审计"
type Customer = { id: number; name: string; station_count: number; can_edit: boolean }
type Audit = { id: number; actor_id: number | null; action: string; occurred_at: string; detail: string }
type OrgView = "成员管理" | "组织管理" | "角色权限"
const errorText = (error: unknown) => error instanceof Error ? error.message : "请求失败"

export default function ApiPlatformManagement({ allowedTabs, registerLeaveGuard }: { stations: Station[]; allowedTabs: readonly Tab[]; registerLeaveGuard?: (guard: null | (() => Promise<boolean>)) => void }) {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>(allowedTabs[0] ?? "组织权限")
  const canMembers = !!user?.permissions.some(p => ["organization.member.read", "member.manage.profile", "member.grant.manage"].includes(p))
  const canOrganizations = !!user?.permissions.some(p => ["organization.member.read", "organization.manage"].includes(p))
  const canRoles = !!user?.permissions.includes("role.manage")
  const availableViews: OrgView[] = [canMembers && "成员管理", canOrganizations && "组织管理", canRoles && "角色权限"].filter((value): value is OrgView => !!value)
  const [view, setView] = useState<OrgView>(() => canMembers ? "成员管理" : canOrganizations ? "组织管理" : "角色权限")
  const rolePanelRef = useRef<RolePermissionsHandle>(null)
  const grantPanelRef = useRef<RolePermissionsHandle>(null)
  const requestPanelLeave = () => (view === "角色权限" ? rolePanelRef.current : grantPanelRef.current)?.requestLeave() ?? Promise.resolve(true)
  useEffect(() => {
    if (tab !== "组织权限" || !registerLeaveGuard) return
    registerLeaveGuard(requestPanelLeave)
    return () => registerLeaveGuard(null)
  }, [tab, view, registerLeaveGuard])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [audits, setAudits] = useState<Audit[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [customerFilter, setCustomerFilter] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [dialog, setDialog] = useState<"customer-edit" | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [formError, setFormError] = useState("")

  async function load(signal?: AbortSignal) {
    setLoading(true); setError("")
    try {
      if (tab === "组织权限") return
      else if (tab === "客户管理") {
        const rows = await api<Customer[]>("/platform/customers", { signal })
        if (signal?.aborted) return
        setCustomers(rows); setSelectedCustomerId(current => rows.some(x => x.id === current) ? current : rows[0]?.id ?? null)
      } else {
        const rows = await allRows<Audit>("/audit", signal)
        if (signal?.aborted) return
        setAudits(rows)
      }
    } catch (e) { if (!signal?.aborted) setError(errorText(e)) }
    finally { if (!signal?.aborted) setLoading(false) }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [tab, view])
  const customer = customers.find(x => x.id === selectedCustomerId)
  async function mutate(work: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setFormError(""); setNotice("")
    try { await work(); await load(); setNotice(message); setDialog(null) }
    catch (e) { setFormError(errorText(e)) }
    finally { setBusy(false) }
  }
  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!customer) return
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim()
    await mutate(() => send(`/platform/customers/${customer.id}`, "PUT", { name }), "客户已更新")
  }
  useEffect(() => {
    if (!allowedTabs.includes(tab) && allowedTabs[0]) setTab(allowedTabs[0])
  }, [allowedTabs, tab])
  useEffect(() => { setFormError("") }, [dialog])
  useEffect(() => {
    if (!dialog && !customerDetailOpen) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = dialogRef.current
    const focusable = () => Array.from(container?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])
    ;(container?.querySelector<HTMLElement>("input:not([readonly])") ?? focusable()[0])?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return
      const items = focusable()
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    container?.addEventListener("keydown", trap)
    return () => { container?.removeEventListener("keydown", trap); previous?.focus() }
  }, [dialog, customerDetailOpen])
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setDialog(null); setCustomerDetailOpen(false) } }
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [busy])
  const canManage = !!user?.permissions.includes("member.manage")
  const canEditCustomer = (c: Customer) => c.can_edit && canManage && !!user?.permissions.includes("asset.edit")
  const filteredCustomers = customers.filter(c => `${c.name} ${c.id}`.toLowerCase().includes(customerSearch.toLowerCase()) && (!customerFilter || (customerFilter === "editable" ? canEditCustomer(c) : !canEditCustomer(c))))
  const footer = <div className="orgv2-modal-footer"><button type="button" className="orgv2-outline" disabled={busy} onClick={() => setDialog(null)}>取消</button><button className="orgv2-primary" disabled={busy || !canManage}>{busy ? "正在保存…" : "保存"}</button></div>
  if (!allowedTabs.length) return <main className="platform-page api-platform"><p className="platform-empty">暂无可访问的平台管理功能</p></main>
  return <main className="platform-page api-platform"><h1 className="platform-sr-title">平台管理</h1>
    {allowedTabs.length > 1 && <nav className="platform-tabs" aria-label="平台管理二级导航">{allowedTabs.map(x => <button key={x} type="button" aria-current={tab === x ? "page" : undefined} onClick={() => { void (async () => { if (x === tab || !(await requestPanelLeave())) return; setTab(x); setError(""); setNotice(""); setFormError(""); setCustomerDetailOpen(false) })() }}>{x}</button>)}</nav>}
    <div className={`platform-content${tab === "组织权限" ? " platform-content--orgv2" : ""}`}>
      {error && <p role="alert" className="api-inline-error">{error}</p>}{loading && <p role="status" className="orgv2-panel">正在加载…</p>}
      {!loading && tab === "组织权限" && <section className="orgv2" aria-label="组织权限"><nav className="orgv2-tabs" role="tablist">{availableViews.map(x => <button key={x} role="tab" aria-selected={view === x} onClick={() => { void (async () => { if (x === view || !(await requestPanelLeave())) return; setView(x); setFormError("") })() }}>{x}</button>)}</nav>
        {view !== "角色权限" && <MemberOrganizationPanel key={view} ref={grantPanelRef} view={view} />}
        {view === "角色权限" && <RolePermissionsPanel ref={rolePanelRef} onOpenMembers={canMembers ? () => setView("成员管理") : undefined} />}
      </section>}
      {!loading && tab === "客户管理" && <><div className="api-stat-grid">{[{ label: "可见客户", value: customers.length, icon: Building2, suffix: "家" }, { label: "关联站点", value: customers.reduce((sum, c) => sum + c.station_count, 0), icon: FolderTree, suffix: "个" }, { label: "可维护客户", value: customers.filter(canEditCustomer).length, icon: Users, suffix: "家" }].map(s => <section className="api-stat-card" key={s.label}><div><span>{s.label}</span><strong>{s.value}<small>{s.suffix}</small></strong></div><s.icon size={23} /></section>)}</div><div className="platform-toolbar"><label className="platform-search"><Search size={16} /><input aria-label="搜索客户名称" placeholder="搜索客户名称 / 编号" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} /></label><label className="platform-select"><span>权限：</span><select aria-label="客户编辑权限" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}><option value="">全部客户</option><option value="editable">可编辑</option><option value="readonly">仅查看</option></select><ChevronDown size={15} /></label><span className="api-toolbar-note">当前授权站点关联的客户</span></div><section className="platform-table-card api-customer-table" aria-label="客户列表"><div className="api-card-heading"><h2>客户列表</h2><span>共 {filteredCustomers.length} 家客户</span></div><div className="platform-table-scroll"><table><thead><tr><th>客户 / 编号</th><th>行业</th><th>授权站点</th><th>服务到期</th><th>维护权限</th><th>操作</th></tr></thead><tbody>{filteredCustomers.map(c => <tr key={c.id}><td><strong>{c.name}</strong><small>客户编号 {c.id}</small></td><td>—</td><td>{c.station_count} 个</td><td>—</td><td><span className={`platform-status ${canEditCustomer(c) ? "is-normal" : "is-muted"}`}>{canEditCustomer(c) ? "可编辑" : "仅查看"}</span></td><td><div className="orgv2-actions"><button onClick={() => { setSelectedCustomerId(c.id); setCustomerDetailOpen(true) }}>查看</button><button aria-label="编辑客户" disabled={!canEditCustomer(c)} onClick={() => { setSelectedCustomerId(c.id); setDialog("customer-edit") }}>编辑</button></div></td></tr>)}</tbody></table></div>{!filteredCustomers.length && <p className="platform-empty">当前条件下暂无客户</p>}<div className="api-table-footer">共 {filteredCustomers.length} 条 · 行业和服务到期信息未配置时显示 —</div></section></>}
      {!loading && tab === "安全审计" && <section className="orgv2-panel orgv2-members"><div className="orgv2-heading"><h2>我的审计日志</h2><span className="orgv2-subtext">共 {audits.length} 条记录</span></div><div className="orgv2-table-scroll"><table className="orgv2-table"><thead><tr><th>时间</th><th>操作</th><th>详情</th></tr></thead><tbody>{audits.map(a => <tr key={a.id}><td>{new Date(a.occurred_at).toLocaleString("zh-CN")}</td><td>{a.action}</td><td title={a.detail}>{a.detail}</td></tr>)}</tbody></table></div>{!audits.length && <p className="orgv2-empty">暂无审计记录</p>}<p className="orgv2-subtext">仅显示当前账号的审计事件。</p></section>}
    </div>
    {customerDetailOpen && customer && <div className="api-drawer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setCustomerDetailOpen(false) }}><aside ref={dialogRef} className="api-customer-drawer" role="dialog" aria-modal="true" aria-label="客户详情"><header><div><span className="orgv2-subtext">客户详情</span><h2>{customer.name}</h2></div><button className="orgv2-close" aria-label="关闭客户详情" onClick={() => setCustomerDetailOpen(false)}><X size={20} /></button></header><div className="api-drawer-body"><section className="platform-detail-card"><h3>基本信息</h3><dl><div><dt>客户编号</dt><dd>{customer.id}</dd></div><div><dt>客户名称</dt><dd>{customer.name}</dd></div><div><dt>行业</dt><dd>—</dd></div><div><dt>服务联系人</dt><dd>未配置</dd></div><div><dt>数据区域</dt><dd>—</dd></div></dl></section><section className="platform-detail-card"><h3>站点与服务</h3><dl><div><dt>授权站点</dt><dd>{customer.station_count} 个</dd></div><div><dt>服务到期</dt><dd>—</dd></div><div><dt>维护权限</dt><dd>{canEditCustomer(customer) ? "可编辑" : "仅查看"}</dd></div></dl></section><p className="api-context-note">仅展示当前账号获授权站点关联的客户。编辑需覆盖该客户的全部站点。</p></div><footer><button className="orgv2-outline" onClick={() => setCustomerDetailOpen(false)}>关闭</button><button className="orgv2-primary" disabled={!canEditCustomer(customer)} onClick={() => { setCustomerDetailOpen(false); setDialog("customer-edit") }}>编辑客户</button></footer></aside></div>}
    {notice && <div className="platform-notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}>×</button></div>}
    {dialog && <div className="orgv2-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setDialog(null) }}><div ref={dialogRef} className="orgv2-modal" role="dialog" aria-modal="true" aria-labelledby="api-dialog-title"><button className="orgv2-close" aria-label="关闭对话框" disabled={busy} onClick={() => setDialog(null)}><X size={18} /></button>
      {dialog === "customer-edit" && <form onSubmit={e => void submitCustomer(e)}><header className="api-modal-heading"><h2 id="api-dialog-title">编辑客户</h2><p>更新客户名称，便于识别关联的站点与资产。</p></header><div className="api-modal-scroll"><h3 className="api-form-section-title">客户信息</h3><div className="orgv2-form-body"><label>客户名称 *<input name="name" autoFocus required maxLength={160} placeholder="请输入客户名称" defaultValue={customer?.name} /></label><label>客户编号<input value={customer?.id ?? ""} readOnly /></label></div><p className="api-context-note">当前可维护 {customer?.station_count ?? 0} 个授权站点关联的客户信息。</p>{formError && <p role="alert" className="api-inline-error">{formError}</p>}</div>{footer}</form>}
    </div></div>}
  </main>
}
