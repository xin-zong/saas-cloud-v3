import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import type { Station } from "@/App"
import { api, allRows, send } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { Building2, Users, Search, Plus, ChevronDown, FolderTree, X } from "lucide-react"
import RolePermissionsPanel, { type RolePermissionsHandle } from "./RolePermissionsPanel"
import MemberGrantsPanel from "./MemberGrantsPanel"
import "./platform-management.css"
import "./organization-permissions.css"
import "./api-platform-management.css"

type Tab = "客户管理" | "组织权限" | "安全审计"
type Member = { id: number; account: string; display_name: string; enabled: boolean; organization_id: number | null; management_organization_id?: number }
type Organization = { id: number; name: string; parent_id: number | null }
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
  const [members, setMembers] = useState<Member[]>([])
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [audits, setAudits] = useState<Audit[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const [orgFilter, setOrgFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [customerFilter, setCustomerFilter] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [dialog, setDialog] = useState<"member-create" | "member-edit" | "org-create" | "org-edit" | "customer-edit" | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [formError, setFormError] = useState("")

  async function load(signal?: AbortSignal) {
    setLoading(true); setError("")
    try {
      if (tab === "组织权限") {
        if (view === "角色权限") return
        setMembers([]); setOrgs([]); setSelectedMemberId(null)
        const canReadMembers = !!user?.permissions.includes("organization.member.read")
        const canManageGrants = !!user?.permissions.includes("member.grant.manage")
        const memberPath = view === "成员管理" && (canReadMembers ? "/members" : canManageGrants ? "/members?purpose=grants" : null)
        const organizationPath = canReadMembers ? "/platform/organizations" : canManageGrants ? "/platform/organizations?purpose=grants" : canRoles ? "/platform/organizations?purpose=roles" : null
        const [m, o] = await Promise.all([
          memberPath ? api<Member[]>(memberPath, { signal }) : Promise.resolve([]),
          organizationPath ? api<Organization[]>(organizationPath, { signal }) : Promise.resolve([]),
        ])
        if (signal?.aborted) return
        setMembers(m); setOrgs(o)
        setSelectedOrgId(current => o.some(x => x.id === current) ? current : o[0]?.id ?? null)
      } else if (tab === "客户管理") {
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
  const member = members.find(x => x.id === selectedMemberId)
  const org = orgs.find(x => x.id === selectedOrgId)
  const isManagedRoot = !!org && !orgs.some(x => x.id === org.parent_id)
  const customer = customers.find(x => x.id === selectedCustomerId)
  function orgPath(id: number | null, seen = new Set<number>()): string {
    if (id == null) return "未分配组织"
    if (seen.has(id)) return "组织层级异常"
    seen.add(id)
    const found = orgs.find(x => x.id === id)
    if (!found) return "未知组织"
    return found.parent_id && orgs.some(x => x.id === found.parent_id) ? `${orgPath(found.parent_id, seen)} / ${found.name}` : found.name
  }
  async function openMember(id: number) {
    if (!(await requestPanelLeave())) return
    setSelectedMemberId(id); setFormError("")
  }
  async function mutate(work: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setFormError(""); setNotice("")
    try { await work(); await load(); setNotice(message); setDialog(null) }
    catch (e) { setFormError(errorText(e)) }
    finally { setBusy(false) }
  }
  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    if (dialog === "member-create") {
      await mutate(() => send("/members", "POST", { account: String(form.get("account") ?? "").trim(), name, password: String(form.get("password") ?? ""), organizationId: Number(form.get("organizationId")) }), "成员已创建")
    } else if (member) await mutate(() => send(`/members/${member.id}`, "PUT", { name, enabled: form.get("enabled") === "true", organizationId: Number(form.get("organizationId")) }), "成员已更新")
  }
  async function submitOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const body = { name: String(form.get("name") ?? "").trim(), parentId: dialog === "org-edit" && isManagedRoot ? org!.id : Number(form.get("parentId")) }
    if (dialog === "org-create") await mutate(() => send("/platform/organizations", "POST", body), "组织已创建")
    else if (org) await mutate(() => send(`/platform/organizations/${org.id}`, "PUT", body), "组织已更新")
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
  const filteredMembers = members.filter(x => `${x.display_name} ${x.account}`.toLowerCase().includes(search.toLowerCase()) && (!orgFilter || x.organization_id === Number(orgFilter)) && (!statusFilter || String(x.enabled) === statusFilter))
  const filteredCustomers = customers.filter(c => `${c.name} ${c.id}`.toLowerCase().includes(customerSearch.toLowerCase()) && (!customerFilter || (customerFilter === "editable" ? canEditCustomer(c) : !canEditCustomer(c))))
  const directMembers = members.filter(m => m.organization_id === org?.id)
  function isDescendant(id: number, parent: number): boolean {
    const seen = new Set<number>()
    let current = orgs.find(o => o.id === id)
    while (current && !seen.has(current.id)) {
      if (current.id === parent) return true
      seen.add(current.id)
      current = orgs.find(o => o.id === current?.parent_id)
    }
    return false
  }
  function memberTable(rows: Member[], showActions = true) {
    return <div className="orgv2-table-scroll"><table className="orgv2-table orgv2-member-table"><thead><tr><th>姓名 / 账号</th><th>所属组织</th><th>已分配角色</th><th>站点范围</th><th>状态</th>{showActions && <th>操作</th>}</tr></thead><tbody>{rows.map(x => { return <tr key={x.id}><td><strong>{x.display_name}</strong><span className="orgv2-subtext">{x.account}</span></td><td title={orgPath(x.organization_id)}>{orgPath(x.organization_id)}</td><td title="通过查看权限查看授权明细">—<small className="orgv2-subtext">详情中查看</small></td><td title="通过查看权限查看授权明细">—</td><td><span className={`platform-status ${x.enabled ? "is-normal" : "is-muted"}`}>{x.enabled ? "启用" : "停用"}</span></td>{showActions && <td><div className="orgv2-actions"><button onClick={() => openMember(x.id)}>查看权限</button><button disabled={!canManage} onClick={() => { openMember(x.id); setDialog("member-edit") }}>编辑</button></div></td>}</tr> })}</tbody></table>{!rows.length && <p className="platform-empty">没有符合条件的成员</p>}</div>
  }
  const footer = <div className="orgv2-modal-footer"><button type="button" className="orgv2-outline" disabled={busy} onClick={() => setDialog(null)}>取消</button><button className="orgv2-primary" disabled={busy || !canManage || (dialog === "member-create" && !orgs.length)}>{busy ? "正在保存…" : "保存"}</button></div>
  if (!allowedTabs.length) return <main className="platform-page api-platform"><p className="platform-empty">暂无可访问的平台管理功能</p></main>
  return <main className="platform-page api-platform"><h1 className="platform-sr-title">平台管理</h1>
    {allowedTabs.length > 1 && <nav className="platform-tabs" aria-label="平台管理二级导航">{allowedTabs.map(x => <button key={x} type="button" aria-current={tab === x ? "page" : undefined} onClick={() => { void (async () => { if (x === tab || !(await requestPanelLeave())) return; setTab(x); setError(""); setNotice(""); setFormError(""); setSelectedMemberId(null); setCustomerDetailOpen(false) })() }}>{x}</button>)}</nav>}
    <div className={`platform-content${tab === "组织权限" ? " platform-content--orgv2" : ""}`}>
      {error && <p role="alert" className="api-inline-error">{error}</p>}{loading && <p role="status" className="orgv2-panel">正在加载…</p>}
      {!loading && tab === "组织权限" && <section className="orgv2" aria-label="组织权限"><nav className="orgv2-tabs" role="tablist">{availableViews.map(x => <button key={x} role="tab" aria-selected={view === x} onClick={() => { void (async () => { if (x === view || !(await requestPanelLeave())) return; setView(x); setSelectedMemberId(null); setFormError("") })() }}>{x}</button>)}</nav>
        {view === "成员管理" && <>{!member && <><div className="orgv2-filters"><label className="orgv2-search"><Search size={16} /><input aria-label="搜索姓名或账号" placeholder="搜索姓名 / 账号" value={search} onChange={e => setSearch(e.target.value)} /></label><label className="orgv2-select"><span>所属组织：</span><select aria-label="筛选所属组织" value={orgFilter} onChange={e => setOrgFilter(e.target.value)}><option value="">全部组织</option>{orgs.map(o => <option key={o.id} value={o.id}>{orgPath(o.id)}</option>)}</select><ChevronDown size={14} /></label><label className="orgv2-select orgv2-select--status"><span>状态：</span><select aria-label="筛选成员状态" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">全部</option><option value="true">启用</option><option value="false">停用</option></select><ChevronDown size={14} /></label><button className="orgv2-primary orgv2-add" disabled={!canManage} onClick={() => { setDialog("member-create") }}><Plus size={16} />新增成员</button></div><section className="orgv2-panel orgv2-members"><div className="orgv2-heading"><h2>全部成员</h2><span className="orgv2-subtext">管理成员身份与业务访问范围</span></div>{memberTable(filteredMembers)}<p className="orgv2-count">共 {filteredMembers.length} 位成员</p></section></>}
          {member && <MemberGrantsPanel key={member.id} ref={grantPanelRef} member={member} organizationName={orgPath(member.organization_id)} canManage={!!user?.permissions.includes("member.grant.manage")} selfSelected={String(member.id) === String(user?.id)} onClose={() => setSelectedMemberId(null)} />}
        </>}
        {view === "组织管理" && <div className="orgv2-split"><aside className="orgv2-panel orgv2-tree"><h2>组织结构</h2><p className="orgv2-subtext">共 {orgs.length} 个组织</p>{orgs.map(o => <button key={o.id} className={o.id === selectedOrgId ? "is-active" : ""} title={orgPath(o.id)} aria-label={orgPath(o.id)} style={{ paddingLeft: 12 + Math.min(orgPath(o.id).split(" / ").length - 1, 3) * 12 }} onClick={() => setSelectedOrgId(o.id)}><FolderTree size={16} /><span>{o.name}</span></button>)}{!orgs.length && <p className="orgv2-empty">暂无组织</p>}</aside><div className="orgv2-org-main"><section className="orgv2-panel orgv2-org-info"><div className="orgv2-heading"><h2>{org?.name ?? "组织信息"}</h2><div className="orgv2-actions"><button className="orgv2-outline" disabled={!org || !canManage} onClick={() => setDialog("org-create")}><Plus size={15} />新增子组织</button><button className="orgv2-outline" disabled={!org || !canManage} onClick={() => setDialog("org-edit")}>编辑组织</button></div></div><dl className="api-detail-grid"><div><dt>上级组织</dt><dd>{isManagedRoot ? "上级由管理员维护" : org?.parent_id ? orgPath(org.parent_id) : "—"}</dd></div><div><dt>组织负责人</dt><dd>未配置</dd></div><div><dt>组织编号</dt><dd>{org?.id ?? "—"}</dd></div><div><dt>直属子组织</dt><dd>{org ? orgs.filter(o => o.parent_id === org.id).length : "—"}</dd></div></dl></section><section className="orgv2-panel"><div className="orgv2-heading"><h2>直属成员</h2><span className="orgv2-subtext">在成员管理中调整成员所属组织</span></div>{memberTable(directMembers, false)}<p className="orgv2-count">共 {directMembers.length} 位成员</p></section></div></div>}
        {view === "角色权限" && <RolePermissionsPanel ref={rolePanelRef} onOpenMembers={canMembers ? () => setView("成员管理") : undefined} />}
      </section>}
      {!loading && tab === "客户管理" && <><div className="api-stat-grid">{[{ label: "可见客户", value: customers.length, icon: Building2, suffix: "家" }, { label: "关联站点", value: customers.reduce((sum, c) => sum + c.station_count, 0), icon: FolderTree, suffix: "个" }, { label: "可维护客户", value: customers.filter(canEditCustomer).length, icon: Users, suffix: "家" }].map(s => <section className="api-stat-card" key={s.label}><div><span>{s.label}</span><strong>{s.value}<small>{s.suffix}</small></strong></div><s.icon size={23} /></section>)}</div><div className="platform-toolbar"><label className="platform-search"><Search size={16} /><input aria-label="搜索客户名称" placeholder="搜索客户名称 / 编号" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} /></label><label className="platform-select"><span>权限：</span><select aria-label="客户编辑权限" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}><option value="">全部客户</option><option value="editable">可编辑</option><option value="readonly">仅查看</option></select><ChevronDown size={15} /></label><span className="api-toolbar-note">当前授权站点关联的客户</span></div><section className="platform-table-card api-customer-table" aria-label="客户列表"><div className="api-card-heading"><h2>客户列表</h2><span>共 {filteredCustomers.length} 家客户</span></div><div className="platform-table-scroll"><table><thead><tr><th>客户 / 编号</th><th>行业</th><th>授权站点</th><th>服务到期</th><th>维护权限</th><th>操作</th></tr></thead><tbody>{filteredCustomers.map(c => <tr key={c.id}><td><strong>{c.name}</strong><small>客户编号 {c.id}</small></td><td>—</td><td>{c.station_count} 个</td><td>—</td><td><span className={`platform-status ${canEditCustomer(c) ? "is-normal" : "is-muted"}`}>{canEditCustomer(c) ? "可编辑" : "仅查看"}</span></td><td><div className="orgv2-actions"><button onClick={() => { setSelectedCustomerId(c.id); setCustomerDetailOpen(true) }}>查看</button><button aria-label="编辑客户" disabled={!canEditCustomer(c)} onClick={() => { setSelectedCustomerId(c.id); setDialog("customer-edit") }}>编辑</button></div></td></tr>)}</tbody></table></div>{!filteredCustomers.length && <p className="platform-empty">当前条件下暂无客户</p>}<div className="api-table-footer">共 {filteredCustomers.length} 条 · 行业和服务到期信息未配置时显示 —</div></section></>}
      {!loading && tab === "安全审计" && <section className="orgv2-panel orgv2-members"><div className="orgv2-heading"><h2>我的审计日志</h2><span className="orgv2-subtext">共 {audits.length} 条记录</span></div><div className="orgv2-table-scroll"><table className="orgv2-table"><thead><tr><th>时间</th><th>操作</th><th>详情</th></tr></thead><tbody>{audits.map(a => <tr key={a.id}><td>{new Date(a.occurred_at).toLocaleString("zh-CN")}</td><td>{a.action}</td><td title={a.detail}>{a.detail}</td></tr>)}</tbody></table></div>{!audits.length && <p className="orgv2-empty">暂无审计记录</p>}<p className="orgv2-subtext">仅显示当前账号的审计事件。</p></section>}
    </div>
    {customerDetailOpen && customer && <div className="api-drawer-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setCustomerDetailOpen(false) }}><aside ref={dialogRef} className="api-customer-drawer" role="dialog" aria-modal="true" aria-label="客户详情"><header><div><span className="orgv2-subtext">客户详情</span><h2>{customer.name}</h2></div><button className="orgv2-close" aria-label="关闭客户详情" onClick={() => setCustomerDetailOpen(false)}><X size={20} /></button></header><div className="api-drawer-body"><section className="platform-detail-card"><h3>基本信息</h3><dl><div><dt>客户编号</dt><dd>{customer.id}</dd></div><div><dt>客户名称</dt><dd>{customer.name}</dd></div><div><dt>行业</dt><dd>—</dd></div><div><dt>服务联系人</dt><dd>未配置</dd></div><div><dt>数据区域</dt><dd>—</dd></div></dl></section><section className="platform-detail-card"><h3>站点与服务</h3><dl><div><dt>授权站点</dt><dd>{customer.station_count} 个</dd></div><div><dt>服务到期</dt><dd>—</dd></div><div><dt>维护权限</dt><dd>{canEditCustomer(customer) ? "可编辑" : "仅查看"}</dd></div></dl></section><p className="api-context-note">仅展示当前账号获授权站点关联的客户。编辑需覆盖该客户的全部站点。</p></div><footer><button className="orgv2-outline" onClick={() => setCustomerDetailOpen(false)}>关闭</button><button className="orgv2-primary" disabled={!canEditCustomer(customer)} onClick={() => { setCustomerDetailOpen(false); setDialog("customer-edit") }}>编辑客户</button></footer></aside></div>}
    {notice && <div className="platform-notice" role="status">{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}>×</button></div>}
    {dialog && <div className="orgv2-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !busy) setDialog(null) }}><div ref={dialogRef} className="orgv2-modal" role="dialog" aria-modal="true" aria-labelledby="api-dialog-title"><button className="orgv2-close" aria-label="关闭对话框" disabled={busy} onClick={() => setDialog(null)}><X size={18} /></button>
      {(dialog === "member-create" || dialog === "member-edit") && <form onSubmit={e => void submitMember(e)}><header className="api-modal-heading"><h2 id="api-dialog-title">{dialog === "member-create" ? "新增成员" : "编辑成员"}</h2><p>填写成员信息，按实际职责配置访问范围。</p></header><div className="api-modal-scroll"><h3 className="api-form-section-title">基本信息</h3><div className="orgv2-form-body"><label>姓名 *<input name="name" autoFocus required maxLength={120} placeholder="请输入成员姓名" defaultValue={dialog === "member-edit" ? member?.display_name : ""} /></label><label>所属组织 *<select name="organizationId" required defaultValue={dialog === "member-edit" ? member?.organization_id ?? orgs[0]?.id : orgs[0]?.id}>{!orgs.length && <option value="">暂无可选组织</option>}{orgs.map(o => <option key={o.id} value={o.id}>{orgPath(o.id)}</option>)}</select></label>{dialog === "member-create" ? <><label>账号 *<input name="account" required maxLength={120} autoComplete="off" placeholder="请输入登录账号" /></label><label>初始密码 *<input name="password" type="password" minLength={12} maxLength={72} required autoComplete="new-password" placeholder="12–72 位密码" /></label></> : <><label>账号<input value={member?.account ?? ""} readOnly /></label><label>状态<select name="enabled" defaultValue={member?.enabled ? "true" : "false"}><option value="true">启用</option><option value="false">停用</option></select></label></>}</div>{formError && <p role="alert" className="api-inline-error">{formError}</p>}</div>{footer}</form>}
      {(dialog === "org-create" || dialog === "org-edit") && <form onSubmit={e => void submitOrg(e)}><header className="api-modal-heading"><h2 id="api-dialog-title">{dialog === "org-create" ? "新增子组织" : "编辑组织"}</h2><p>维护组织名称与层级，成员归属在成员管理中调整。</p></header><div className="api-modal-scroll"><h3 className="api-form-section-title">组织信息</h3><div className="orgv2-form-body"><label>组织名称 *<input name="name" autoFocus required maxLength={120} placeholder="请输入组织名称" defaultValue={dialog === "org-edit" ? org?.name : ""} /></label><label>上级组织<select name="parentId" disabled={dialog === "org-edit" && isManagedRoot} defaultValue={dialog === "org-edit" ? isManagedRoot ? org?.id : org?.parent_id ?? org?.id : org?.id}>{orgs.filter(o => dialog === "org-create" || !org || !isDescendant(o.id, org.id)).map(o => <option key={o.id} value={o.id}>{orgPath(o.id)}</option>)}{dialog === "org-edit" && org && isManagedRoot && <option value={org.id}>管理组织（上级由管理员维护）</option>}</select></label></div><p className="api-context-note">组织不能移动到自身或下级组织中。管理组织的层级由平台维护。</p>{formError && <p role="alert" className="api-inline-error">{formError}</p>}</div>{footer}</form>}
      {dialog === "customer-edit" && <form onSubmit={e => void submitCustomer(e)}><header className="api-modal-heading"><h2 id="api-dialog-title">编辑客户</h2><p>更新客户名称，便于识别关联的站点与资产。</p></header><div className="api-modal-scroll"><h3 className="api-form-section-title">客户信息</h3><div className="orgv2-form-body"><label>客户名称 *<input name="name" autoFocus required maxLength={160} placeholder="请输入客户名称" defaultValue={customer?.name} /></label><label>客户编号<input value={customer?.id ?? ""} readOnly /></label></div><p className="api-context-note">当前可维护 {customer?.station_count ?? 0} 个授权站点关联的客户信息。</p>{formError && <p role="alert" className="api-inline-error">{formError}</p>}</div>{footer}</form>}
    </div></div>}
  </main>
}
