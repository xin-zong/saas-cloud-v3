import { useAuth } from "@/auth/AuthContext"
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { ArrowLeft, Plus, Search, X } from "lucide-react"
import { PermissionMatrix, type RolePermissionsHandle } from "./RolePermissionsPanel"
import { platformApi, type BusinessRole, type GrantOptions, type GrantTerm, type MemberGrant, type PermissionItem, type PlatformOrganization } from "./platform/platformApi"
import "./member-grants-panel.css"

type Member = { id: number; display_name: string; account: string; organization_id: number | null; management_organization_id?: number; enabled: boolean }
type Draft = { grant: MemberGrant | null; organizationId: number | null; roleId: number | null; term: string; stationIds: number[] }
type Preview = { name: string; codes: string[]; catalog: PermissionItem[] }
const errorText = (e: unknown) => e instanceof Error ? e.message : "请求失败"
const supportedTerm = (term: string): term is GrantTerm => ["permanent", "30d", "90d", "1y"].includes(term)
const time = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "永久有效"
const stationText = (grant: MemberGrant) => grant.stations.map(station => station.name).join("、") || "组织管理范围"
const statusText: Record<string, string> = { active: "有效", expired: "已过期", scheduled: "未生效", disabled: "成员已停用" }

const MemberGrantsPanel = forwardRef<RolePermissionsHandle, { member: Member; organizationName: string; canManage: boolean; selfSelected: boolean; onClose: () => void }>(function MemberGrantsPanel({ member, organizationName, canManage, selfSelected, onClose }, ref) {
  const {user} = useAuth()
  const currentCapabilityScope = JSON.stringify([user?.stationPermissions, user?.organizationPermissions])
  const [capabilityScope, setCapabilityScope] = useState(currentCapabilityScope)
  const loadedScope = useRef(currentCapabilityScope)
  const [grants, setGrants] = useState<MemberGrant[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [grantsReady, setGrantsReady] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [draft, setDraft] = useState<Draft | null>(null)
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([])
  const [roles, setRoles] = useState<BusinessRole[]>([])
  const [catalog, setCatalog] = useState<PermissionItem[]>([])
  const [directoryReady, setDirectoryReady] = useState(false)
  const [options, setOptions] = useState<GrantOptions | null>(null)
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [revoke, setRevoke] = useState<MemberGrant | null>(null)
  const [confirmTerm, setConfirmTerm] = useState(false)
  const [leave, setLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (!busy) setCapabilityScope(currentCapabilityScope) }, [busy, currentCapabilityScope])
  const panelRef = useRef<HTMLElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const modalKind = confirmTerm ? "term" : leave ? "leave" : revoke ? "revoke" : preview ? "preview" : null
  const pending = useRef(false)
  useEffect(() => {
    if (!modalKind) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const container = modalRef.current
    if (!container) return
    const items = () => Array.from(container.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0)
    ;(items()[0] ?? container).focus()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        if (pending.current) return
        if (modalKind === "preview") setPreview(null)
        else if (modalKind === "term") setConfirmTerm(false)
        else if (modalKind === "leave") finishLeave(false)
        else setRevoke(null)
      }
      if (event.key !== "Tab") return
      const elements = items(), first = elements[0], last = elements[elements.length - 1]
      if (!first) { event.preventDefault(); container.focus() }
      else if (!container.contains(document.activeElement) || document.activeElement === container) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", keyboard, true)
    return () => {
      document.removeEventListener("keydown", keyboard, true)
      if (previous?.isConnected) previous.focus()
      else panelRef.current?.querySelector<HTMLElement>(".member-grants-back")?.focus()
    }
  }, [modalKind])
  useEffect(() => { if (busy && modalKind) modalRef.current?.focus() }, [busy, modalKind])
  const leaveResolve = useRef<((allow: boolean) => void) | null>(null)
  const leaveAction = useRef<(() => void) | null>(null)
  const selected = grants.find(grant => grant.id === selectedId)
  const role = roles.find(role => role.id === draft?.roleId)
  const original = draft?.grant
  const dirty = !!draft && (original ? draft.roleId !== original.roleId || draft.term !== original.term || draft.stationIds.length !== original.stationIds.length || draft.stationIds.some(id => !original.stationIds.includes(id)) : draft.roleId !== null || draft.stationIds.length > 0 || draft.term !== "permanent")
  const changedTerm = !!original && draft?.term !== original.term
  const canWrite = grantsReady && canManage && !selfSelected
  const optionsMatch = !!options && options.roleId === draft?.roleId && options.term === draft?.term && options.grantId === (original?.id ?? null)
  const validSelection = !!draft && !!options && (options.stationSelectionRequired ? draft.stationIds.length > 0 : draft.stationIds.length > 0 || options.canSaveWithoutStations) && draft.stationIds.every(id => options.stations.some(station => station.id === id && station.selectable))
  const canSave = grantsReady && canWrite && !!draft && !!draft.roleId && supportedTerm(draft.term) && directoryReady && optionsMatch && validSelection && !optionsLoading

  useEffect(() => {
    const controller = new AbortController()
    setGrants([]); setSelectedId(null); setDraft(null); setOptions(null); setRoles([]); setCatalog([]); setLoading(true); setGrantsReady(false); setError("")
    platformApi.memberGrants(member.id, controller.signal).then(rows => { if (!controller.signal.aborted) { setGrants(rows); setGrantsReady(true); setSelectedId(rows.find(row => !row.scopeRestricted)?.id ?? null) } }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [member.id])

  useEffect(() => {
    if (loadedScope.current === capabilityScope) return
    loadedScope.current = capabilityScope
    const controller = new AbortController()
    setGrantsReady(false); setOptions(null)
    platformApi.memberGrants(member.id, controller.signal).then(rows => {
      if (controller.signal.aborted) return
      setGrants(rows); setGrantsReady(true)
      setDraft(current => {
        if (!current?.grant) return current
        const fresh = rows.find(row => row.id === current.grant?.id)
        if (fresh?.canEdit && !fresh.scopeRestricted) return {...current, grant: fresh}
        setNotice("权限范围已变化，当前授权已不可编辑。")
        return null
      })
    }).catch(e => {if (!controller.signal.aborted) {setError(errorText(e)); setGrants([]); setDraft(null)}})
    return () => controller.abort()
  }, [member.id, capabilityScope])

  const editing = draft !== null
  useEffect(() => {
    if (!editing) return
    const controller = new AbortController()
    setOrganizations([])
    platformApi.grantOrganizations(controller.signal).then(rows => {
      if (controller.signal.aborted) return
      setOrganizations(rows)
      setDraft(current => current ? { ...current, organizationId: rows.some(row => row.id === current.organizationId) ? current.organizationId : rows[0]?.id ?? null } : null)
    }).catch(e => { if (!controller.signal.aborted) { setError(errorText(e)); setDraft(current => current ? { ...current, organizationId: null } : null) } })
    return () => controller.abort()
  }, [editing, member.id, capabilityScope])

  const organizationId = draft?.organizationId
  useEffect(() => {
    setRoles([]); setCatalog([]); setOptions(null); setDirectoryReady(false)
    if (!editing || organizationId == null) return
    const controller = new AbortController()
    setError("")
    Promise.all([platformApi.roles(organizationId, "assign", controller.signal), platformApi.permissions(organizationId, controller.signal)]).then(([rows, items]) => {
      if (controller.signal.aborted) return
      setRoles(rows); setCatalog(items); setDirectoryReady(true)
    }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)) })
    return () => controller.abort()
  }, [organizationId, editing, capabilityScope])

  useEffect(() => {
    setOptions(null)
    if (!draft?.roleId || !supportedTerm(draft.term) || !directoryReady) { setOptionsLoading(false); return }
    const controller = new AbortController()
    setOptionsLoading(true); setError("")
    platformApi.grantOptions(member.id, draft.roleId, draft.term, draft.grant?.id, controller.signal).then(result => { if (!controller.signal.aborted) setOptions(result) }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)) }).finally(() => { if (!controller.signal.aborted) setOptionsLoading(false) })
    return () => controller.abort()
  }, [member.id, draft?.roleId, draft?.term, draft?.grant?.id, directoryReady, organizationId])

  useEffect(() => {
    if (!dirty && !busy) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", guard)
    return () => window.removeEventListener("beforeunload", guard)
  }, [dirty, busy])
  useEffect(() => () => { leaveResolve.current?.(false) }, [])
  function requestLeave(action: () => void = () => {}): Promise<boolean> {
    if (pending.current) return Promise.resolve(false)
    if (!dirty) { action(); return Promise.resolve(true) }
    if (leaveResolve.current) return Promise.resolve(false)
    setLeave(true); leaveAction.current = action
    return new Promise(resolve => { leaveResolve.current = resolve })
  }
  useImperativeHandle(ref, () => ({ requestLeave: () => requestLeave() }))
  function finishLeave(allow: boolean) {
    if (pending.current) return
    setLeave(false)
    if (allow) { setDraft(null); leaveAction.current?.() }
    leaveAction.current = null; leaveResolve.current?.(allow); leaveResolve.current = null
  }
  function start(grant: MemberGrant | null) {
    if (!canWrite || !grantsReady || pending.current || (grant && (!grant.canEdit || grant.scopeRestricted))) return
    setError(""); setNotice(""); setSearch(""); setOptions(null); setDirectoryReady(false)
    setDraft({ grant, organizationId: member.organization_id ?? member.management_organization_id ?? null, roleId: grant?.roleId ?? null, term: grant?.term ?? "permanent", stationIds: [...(grant?.stationIds ?? [])] })
  }
  function showGrant(grant: MemberGrant) {
    setSelectedId(grant.id)
    setPreview({ name: grant.roleName || "角色权限", codes: grant.permissionCodes, catalog: grant.rolePermissions.map(item => ({ ...item, configurable: false })) })
  }
  async function save(): Promise<boolean> {
    if (pending.current || !canSave || !draft || !draft.roleId || !supportedTerm(draft.term)) return false
    pending.current = true; setBusy(true); setError("")
    try {
      const body = { roleId: draft.roleId, stationIds: draft.stationIds, term: draft.term }
      const saved = draft.grant ? await platformApi.updateGrant(member.id, draft.grant.id, body) : await platformApi.createGrant(member.id, body)
      setGrants(rows => rows.some(row => row.id === saved.id) ? rows.map(row => row.id === saved.id ? saved : row) : [...rows, saved]); setSelectedId(saved.id); setDraft(null); setConfirmTerm(false); setNotice("授权已保存")
      return true
    } catch (e) { setError(errorText(e)); return false }
    finally { pending.current = false; setBusy(false) }
  }
  function requestSave() {
    if (!canSave || pending.current) return
    if (changedTerm) setConfirmTerm(true)
    else void save().then(ok => { if (ok && leaveResolve.current) finishLeave(true) })
  }
  async function remove() {
    if (!revoke || pending.current || !canWrite || !grants.find(grant => grant.id === revoke.id)?.canRevoke || revoke.scopeRestricted) return
    pending.current = true; setBusy(true); setError("")
    try { await platformApi.revokeGrant(member.id, revoke.id); setGrants(rows => rows.filter(row => row.id !== revoke.id)); setSelectedId(null); setRevoke(null); setNotice("授权已撤销") }
    catch (e) { setError(errorText(e)) }
    finally { pending.current = false; setBusy(false) }
  }

  return <section ref={panelRef} className="member-grants-panel" aria-label="成员权限详情">
    <div className="member-grants-heading"><button className="member-grants-back" disabled={busy} onClick={() => { void requestLeave(draft ? () => setDraft(null) : onClose) }}><ArrowLeft size={16} />{draft ? "返回成员权限" : "返回成员列表"}</button></div>
    {error && <p role="alert" className="api-inline-error">{error}</p>}
    {notice && <p role="status" className="orgv2-notice">{notice}</p>}
    {loading ? <p role="status" className="orgv2-panel">正在加载成员授权…</p> : draft ? <>
      <section className="orgv2-panel member-grant-form"><div className="member-grant-title"><h2>{original ? "编辑权限" : "分配权限"} · {member.display_name}</h2><label className="member-grant-organization">角色所属组织<select aria-label="角色所属组织" disabled={busy} value={draft.organizationId ?? ""} onChange={e => { setOptions(null); setDirectoryReady(false); setRoles([]); setCatalog([]); setDraft({ ...draft, organizationId: Number(e.target.value), roleId: null, stationIds: [] }) }}><option value="" disabled>请选择组织</option>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label></div>
        <fieldset disabled={busy}><div className="member-grant-fields">

          <label>业务角色<select aria-label="业务角色" value={draft.roleId ?? ""} disabled={!directoryReady} onChange={e => { setOptions(null); setDraft({ ...draft, roleId: Number(e.target.value), stationIds: [] }) }}><option value="">请选择角色</option>{original && directoryReady && !roles.some(row => row.id === original.roleId) && draft.roleId === original.roleId && <option value={original.roleId!}>{original.roleName}（原授权角色）</option>}{roles.map(row => <option key={row.id} value={row.id} disabled={!row.canAssign && row.id !== original?.roleId}>{row.name}{!row.canAssign ? "（不可新增授权）" : ""}</option>)}</select></label>
          <label>授权期限<select aria-label="授权期限" value={draft.term} onChange={e => { setOptions(null); setDraft({ ...draft, term: e.target.value }) }}>{draft.term === "custom" && <option value="custom">历史自定义期限（请选择新期限）</option>}<option value="permanent">永久有效</option><option value="30d">30 天</option><option value="90d">90 天</option><option value="1y">1 年</option></select></label>
        </div></fieldset>
        {directoryReady && !roles.some(row => row.canAssign) && <p className="orgv2-empty">暂无可授予角色{original ? "，可按原授权范围调整" : ""}</p>}
        {draft.roleId && <div className="member-grant-description"><div><strong>{role?.name ?? original?.roleName}</strong><p>{role?.description || "角色操作权限以完整权限清单为准。"}</p>{role?.reason && <small>{role.reason}</small>}</div><button className="orgv2-outline" disabled={!directoryReady} onClick={() => setPreview({ name: role?.name ?? original?.roleName ?? "角色权限", codes: role?.permissionCodes ?? original?.permissionCodes ?? [], catalog: [...catalog, ...(original?.rolePermissions.filter(item => !catalog.some(known => known.code === item.code)).map(item => ({ ...item, configurable: false })) ?? [])] })}>查看完整权限</button></div>}
        {original?.periodChangeRequired && <p className="api-context-note">历史自定义期限必须选择新期限后重新起算，不会自动续期。</p>}
        {optionsMatch && options && <p className="member-grant-expiry">截止时间（北京时间）：<strong>{time(options.validUntil)}</strong><span>{original ? changedTerm ? "重新起算 · 从保存时开始，最终时间以服务器保存结果为准" : "原截止时间保持不变" : "最终截止时间以服务器保存结果为准"}</span></p>}
      </section>
      <section className="orgv2-panel member-grant-stations"><div className="orgv2-heading"><div><h2>站点范围 <small>已选 {draft.stationIds.length} 个站点</small></h2></div><label className="orgv2-search"><Search size={16} /><input aria-label="搜索授权站点" placeholder="搜索站点名称" value={search} onChange={e => setSearch(e.target.value)} disabled={busy} /></label></div>
        {optionsLoading ? <p role="status" className="orgv2-empty">正在加载可授权站点…</p> : optionsMatch && options ? <>
          {!options.stationSelectionRequired && <p className="api-context-note">按角色所属组织及下级组织生效，不授予任何站点权限</p>}
          {options.reason && <p className="api-context-note">{options.reason}</p>}
          {(options.stationSelectionRequired || draft.stationIds.length > 0) && <div className="member-grant-station-list">{options.stations.filter(station => station.name.toLowerCase().includes(search.toLowerCase())).map(station => <label className="orgv2-site-option" key={station.id}><input type="checkbox" aria-label={station.name} checked={draft.stationIds.includes(station.id)} disabled={busy || (!station.selectable && !draft.stationIds.includes(station.id))} onChange={() => setDraft({ ...draft, stationIds: draft.stationIds.includes(station.id) ? draft.stationIds.filter(id => id !== station.id) : [...draft.stationIds, station.id] })} /><span>{station.name}{station.reason && <small>{station.reason}</small>}</span></label>)}{draft.stationIds.filter(id => !options.stations.some(station => station.id === id)).map(id => <p className="api-inline-error" key={id}>原已选站点当前不在可授权范围内，请重新加载后处理。</p>)}</div>}
          {options.stationSelectionRequired && !options.stations.some(station => station.selectable) && <p className="orgv2-empty">暂无可授权站点</p>}
          {options.stationSelectionRequired && search && !options.stations.some(station => station.name.toLowerCase().includes(search.toLowerCase())) && <p className="orgv2-empty">没有匹配的站点</p>}
        </> : <p className="orgv2-empty">请选择可用角色与期限，加载站点授权范围。</p>}
      </section><div className="member-grant-actions"><button className="orgv2-outline" disabled={busy} onClick={() => { setDraft(null); setError("") }}>取消</button><button className="orgv2-primary" disabled={busy || !canSave} onClick={requestSave}>{busy ? "正在保存…" : "保存授权"}</button></div>
    </> : <>
      <section className="orgv2-panel orgv2-identity"><h2>{member.display_name}</h2><p>{member.account}<span>·</span>{organizationName}<span>·</span>{member.enabled ? "启用" : "停用"}</p></section>
      {selfSelected && canManage && <p className="api-context-note">不能修改自己的授权，请联系其他授权管理员。</p>}
      <section className="orgv2-panel"><div className="orgv2-heading"><h2>已分配权限 {grantsReady && <small className="orgv2-subtext">共 {grants.length} 条授权</small>}</h2>{canWrite && <button className="orgv2-primary" disabled={!grantsReady} onClick={() => start(null)}><Plus size={16} />分配权限</button>}</div><div className="orgv2-table-scroll"><table className="orgv2-table member-grants-table"><thead><tr><th>角色</th><th>站点范围</th><th>授权来源</th><th>有效期</th><th>操作</th></tr></thead><tbody>{grants.map(grant => <tr key={grant.id} data-grant-id={grant.id}>{grant.scopeRestricted ? <td colSpan={5}><strong>受限授权</strong><p className="orgv2-subtext">{grant.reason || "包含当前管理范围外的内容，无法查看、编辑或撤销"}</p></td> : <><td><strong>{grant.roleName}</strong><span className="orgv2-subtext">{statusText[grant.status] ?? grant.status}</span></td><td>{stationText(grant)}{!grant.stationIds.length && <small className="orgv2-subtext">不授予任何站点权限</small>}</td><td>{grant.source || "—"}</td><td>{time(grant.validUntil)}{grant.term === "custom" && <small className="orgv2-subtext">历史自定义期限</small>}</td><td><div className="orgv2-actions"><button onClick={() => showGrant(grant)}>查看角色权限</button>{canWrite && <><button disabled={busy || !grant.canEdit} title={grant.reason ?? undefined} onClick={() => start(grant)}>编辑</button><button disabled={busy || !grant.canRevoke} title={grant.reason ?? undefined} onClick={() => { setError(""); setRevoke(grant) }}>撤销</button></>}</div>{grant.reason && <small className="orgv2-subtext">{grant.reason}</small>}</td></>}</tr>)}</tbody></table></div>{grantsReady && !grants.length && <p className="orgv2-empty">暂无授权，可按成员职责分配权限。</p>}{!grantsReady && <p className="orgv2-empty">无法加载授权，请稍后重新进入。</p>}</section>
      {selected && !selected.scopeRestricted && <section className="orgv2-panel member-grant-summary"><div className="orgv2-heading"><h2>{selected.roleName} · 操作权限</h2><button className="orgv2-outline" onClick={() => showGrant(selected)}>查看角色权限</button></div><p>{selected.rolePermissions.map(item => item.name).join("、") || (selected.permissionCodes.length ? "包含历史权限，请查看完整清单。" : "该角色暂无操作权限")}</p></section>}
    </>}
    {preview && <div className="orgv2-overlay"><div ref={modalRef} tabIndex={-1} className="orgv2-modal member-grant-preview" role="dialog" aria-modal="true" aria-label="角色权限详情"><div className="orgv2-heading"><h2>{preview.name} · 完整权限</h2><button className="orgv2-outline" aria-label="关闭权限详情" onClick={() => setPreview(null)}><X size={18} />关闭</button></div><PermissionMatrix catalog={preview.catalog} selectedCodes={preview.codes} readOnly /></div></div>}
    {(revoke || leave || confirmTerm) && <div className="orgv2-overlay"><div ref={modalRef} tabIndex={-1} className="orgv2-modal member-grant-confirm" role="dialog" aria-modal="true" aria-labelledby="grant-confirm-title">
      <h2 id="grant-confirm-title">{confirmTerm ? "确认重新起算授权期限" : leave ? "未保存的修改" : "撤销这条授权？"}</h2>
      {confirmTerm ? <p>期限将从保存时重新起算。预计截止时间：{time(options?.validUntil ?? null)}（北京时间），最终时间以服务器保存结果为准。</p> : leave ? <p>当前成员授权有未保存的修改。</p> : <><p>{revoke?.roleName}</p><p>{revoke && stationText(revoke)}</p><p>仅撤销这条授权，其他授权保持不变。</p></>}
      {error && <p role="alert" className="api-inline-error">{error}</p>}
      <div className="orgv2-modal-footer">{confirmTerm ? <><button className="orgv2-outline" disabled={busy} onClick={() => setConfirmTerm(false)}>继续编辑</button><button className="orgv2-primary" disabled={busy || !canSave} onClick={() => { void save().then(ok => { if (ok && leaveResolve.current) finishLeave(true) }) }}>确认并保存</button></> : leave ? <><button className="orgv2-outline" disabled={busy} onClick={() => finishLeave(false)}>继续编辑</button><button className="orgv2-outline" disabled={busy} onClick={() => finishLeave(true)}>放弃修改</button><button className="orgv2-primary" disabled={busy || !canSave} onClick={requestSave}>保存并离开</button></> : <><button className="orgv2-outline" disabled={busy} onClick={() => setRevoke(null)}>取消</button><button className="orgv2-danger" disabled={busy} onClick={() => { void remove() }}>确认撤销</button></>}</div>
    </div></div>}
  </section>
})
export default MemberGrantsPanel
