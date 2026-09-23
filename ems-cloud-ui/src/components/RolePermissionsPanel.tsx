import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { FormEvent } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { platformApi, type BusinessRole, type PermissionItem, type PlatformOrganization } from "./platform/platformApi"
import "./role-permissions-panel.css"

const GROUPS = [
  ["asset", "资产与站点"],
  ["operations", "运营中心"],
  ["maintenance", "运维中心"],
  ["workorder", "工单与审批"],
  ["analytics", "分析与报告"],
  ["platform", "平台管理"],
] as const

export type RolePermissionsHandle = { requestLeave: () => Promise<boolean> }

function GroupCheckbox({ label, checked, partial, disabled, onChange }: { label: string; checked: boolean; partial: boolean; disabled: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = partial }, [partial])
  return <label className="orgv2-group-toggle"><input ref={ref} type="checkbox" aria-label={`${label}全部权限`} checked={checked} disabled={disabled} onChange={onChange} /><strong>{label}</strong></label>
}

/** Shared with member grants: server descriptors remain the only source of permission names and availability. */
export function PermissionMatrix({ catalog, selectedCodes, readOnly = false, onChange }: { catalog: PermissionItem[]; selectedCodes: string[]; readOnly?: boolean; onChange?: (next: string[]) => void }) {
  const selected = new Set(selectedCodes)
  const known = new Set(catalog.map(item => item.code))
  const groups: { code: string; label: string; items: PermissionItem[] }[] = GROUPS.map(([code, label]) => ({ code, label, items: catalog.filter(item => item.module === code) }))
  for (const module of [...new Set(catalog.map(item => item.module))]) if (!GROUPS.some(([code]) => code === module)) groups.push({ code: module, label: module, items: catalog.filter(item => item.module === module) })
  return <div className="orgv2-role-groups">
    {groups.map(group => {
      const selectedCount = group.items.filter(item => selected.has(item.code)).length
      const editable = group.items.filter(item => selected.has(item.code) || (item.available && item.configurable))
      const allChecked = editable.length > 0 && editable.every(item => selected.has(item.code))
      return <section className="orgv2-group" key={group.code} aria-label={group.label}>
        {readOnly ? <h3>{group.label}</h3> : <GroupCheckbox label={group.label} checked={allChecked} partial={selectedCount > 0 && !allChecked} disabled={!editable.length} onChange={() => onChange?.(allChecked ? selectedCodes.filter(code => !group.items.some(item => item.code === code)) : [...new Set([...selectedCodes, ...editable.filter(item => item.available && item.configurable).map(item => item.code)])])} />}
        <div className="orgv2-check-grid">{group.items.map(item => {
          const checked = selected.has(item.code)
          const disabled = readOnly || (!checked && (!item.available || !item.configurable))
          const explanation = !item.available ? item.reason || "暂不可用" : !item.configurable ? (checked ? "可移除，当前不可新增" : item.reason || "当前不可新增") : ""
          return <label key={item.code} className={disabled ? "role-permission-disabled" : ""} title={explanation || undefined}><input type="checkbox" aria-label={item.name} checked={checked} disabled={disabled} onChange={() => onChange?.(checked ? selectedCodes.filter(code => code !== item.code) : [...selectedCodes, item.code])} /><span>{item.name}{explanation && <small>{explanation}</small>}</span></label>
        })}</div>
      </section>
    })}
    {selectedCodes.filter(code => !known.has(code)).length > 0 && <section className="orgv2-group"><h3>保留的历史权限</h3><div className="orgv2-check-grid">{selectedCodes.filter(code => !known.has(code)).map(code => <label key={code}><input type="checkbox" checked disabled={readOnly} aria-label={code} onChange={() => onChange?.(selectedCodes.filter(value => value !== code))} /><span>{code}<small>目录中已无此项；可移除</small></span></label>)}</div></section>}
  </div>
}

const errorText = (error: unknown) => error instanceof Error ? error.message : "请求失败"
const equalCodes = (a: string[], b: string[]) => a.length === b.length && a.every(code => b.includes(code))

const RolePermissionsPanel = forwardRef<RolePermissionsHandle, { onOpenMembers?: () => void }>(function RolePermissionsPanel({ onOpenMembers }, ref) {
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>([])
  const [organizationId, setOrganizationId] = useState<number | null>(null)
  const [catalog, setCatalog] = useState<PermissionItem[]>([])
  const [roles, setRoles] = useState<BusinessRole[]>([])
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [dialog, setDialog] = useState<"create" | "delete" | "in-use" | "leave" | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const pendingAction = useRef<(() => void) | null>(null)
  const pendingResolve = useRef<((allow: boolean) => void) | null>(null)
  const selectedRole = roles.find(role => role.id === selectedRoleId)
  const dirty = !!selectedRole && !equalCodes(draft, selectedRole.permissionCodes)

  useEffect(() => {
    const controller = new AbortController()
    platformApi.roleOrganizations(controller.signal).then(rows => {
      if (!controller.signal.aborted) { setOrganizations(rows); setOrganizationId(current => current && rows.some(row => row.id === current) ? current : rows[0]?.id ?? null) }
    }).catch(e => { if (!controller.signal.aborted) { setError(errorText(e)); setLoading(false) } })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (organizationId == null) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true); setError("")
    Promise.all([platformApi.permissions(organizationId, controller.signal), platformApi.roles(organizationId, "manage", controller.signal)]).then(([items, rows]) => {
      if (controller.signal.aborted) return
      setCatalog(items); setRoles(rows)
      const next = rows.find(role => role.id === selectedRoleId) ?? rows[0]
      setSelectedRoleId(next?.id ?? null); setDraft([...(next?.permissionCodes ?? [])])
    }).catch(e => { if (!controller.signal.aborted) setError(errorText(e)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [organizationId])

  useEffect(() => {
    if (!dirty) return
    const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [dirty])

  function askLeave(action: () => void): Promise<boolean> {
    if (!dirty) { action(); return Promise.resolve(true) }
    setDialog("leave")
    pendingAction.current = action
    return new Promise(resolve => { pendingResolve.current = resolve })
  }
  useImperativeHandle(ref, () => ({ requestLeave: () => askLeave(() => {}) }))
  function finishLeave(allow: boolean) {
    setDialog(null)
    if (allow) { setDraft([...(selectedRole?.permissionCodes ?? [])]); pendingAction.current?.() }
    pendingAction.current = null
    pendingResolve.current?.(allow)
    pendingResolve.current = null
  }
  async function save(): Promise<boolean> {
    if (!selectedRole || !dirty || busy) return !dirty
    setBusy(true); setError(""); setNotice("")
    try {
      const saved = await platformApi.saveRolePermissions(selectedRole.id, draft)
      setRoles(previous => previous.map(role => role.id === saved.id ? saved : role))
      setDraft([...saved.permissionCodes]); setNotice("角色权限已保存")
      return true
    } catch (e) { setError(errorText(e)); return false }
    finally { setBusy(false) }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (organizationId == null || busy) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    const description = String(form.get("description") ?? "").trim()
    if (!name) { setError("请输入角色名称"); return }
    setBusy(true); setError("")
    try {
      const role = await platformApi.createRole(name, description, organizationId)
      setRoles(previous => [...previous, role]); setSelectedRoleId(role.id); setDraft([]); setDialog(null); setNotice("角色已创建，请配置权限")
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  async function remove() {
    if (!selectedRole || busy) return
    setBusy(true); setError("")
    try {
      await platformApi.deleteRole(selectedRole.id)
      const next = roles.filter(role => role.id !== selectedRole.id)
      setRoles(next); setSelectedRoleId(next[0]?.id ?? null); setDraft([...(next[0]?.permissionCodes ?? [])]); setDialog(null); setNotice("角色已删除")
    } catch (e) { setError(errorText(e)); setDialog("in-use") } finally { setBusy(false) }
  }
  if (loading) return <p className="orgv2-panel" role="status">正在加载角色权限…</p>
  return <div className="role-permissions-panel">
    {organizations.length > 1 && <label className="role-organization-picker">管理组织 <select value={organizationId ?? ""} onChange={event => { const next = Number(event.target.value); void askLeave(() => setOrganizationId(next)) }}>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>}
    {error && <p role="alert" className="api-inline-error">{error}</p>}
    <div className="orgv2-split"><aside className="orgv2-panel orgv2-role-list"><div className="orgv2-heading"><h2>业务角色</h2><div className="orgv2-icon-actions"><button type="button" aria-label="新增角色" title="新增角色" onClick={() => { void askLeave(() => { setError(""); setDialog("create") }) }}><Plus size={17} /></button><button type="button" aria-label="删除当前角色" title="删除当前角色" disabled={!selectedRole} onClick={() => { if (!selectedRole) return; void askLeave(() => { setError(""); setDialog(selectedRole.canDelete ? "delete" : "in-use") }) }}><Trash2 size={16} /></button></div></div><p className="orgv2-subtext">共 {roles.length} 个角色</p>{roles.map(role => <button key={role.id} type="button" className={role.id === selectedRoleId ? "is-active" : ""} onClick={() => { void askLeave(() => { setSelectedRoleId(role.id); setDraft([...role.permissionCodes]); setError("") }) }}>{role.name}<small>{role.memberCount} 位成员</small></button>)}{!roles.length && <p className="orgv2-empty">暂无业务角色</p>}</aside>
      <section className="orgv2-panel orgv2-role-matrix"><div className="orgv2-heading"><div><h2>{selectedRole?.name ?? "业务角色"}</h2>{selectedRole?.description && <p className="orgv2-subtext">{selectedRole.description}</p>}</div>{selectedRole && <span className="platform-status is-normal">{draft.length} 项权限</span>}</div>{selectedRole ? <><PermissionMatrix catalog={catalog} selectedCodes={draft} onChange={setDraft} readOnly={!selectedRole.canEdit || busy} />{!selectedRole.canEdit && <p className="api-context-note">{selectedRole.reason || "当前角色不可编辑"}</p>}<div className="orgv2-role-footer"><button type="button" className="orgv2-outline" disabled={!dirty || busy} onClick={() => { setDraft([...selectedRole.permissionCodes]); setError("") }}>取消修改</button><button type="button" className="orgv2-primary" disabled={!dirty || busy || !selectedRole.canEdit} onClick={() => { void save() }}>{busy ? "正在保存…" : "保存修改"}</button></div></> : <p className="orgv2-empty">选择或新建角色后配置权限</p>}</section>
    </div>
    {notice && <div role="status" className="orgv2-notice">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {dialog && <div className="orgv2-overlay"><div className="orgv2-modal" role="dialog" aria-modal="true" aria-labelledby="role-dialog-title"><button type="button" className="orgv2-close" aria-label="关闭对话框" disabled={busy} onClick={() => dialog === "leave" ? finishLeave(false) : setDialog(null)}><X size={18} /></button>
      {dialog === "create" && <form onSubmit={event => { void create(event) }}><h2 id="role-dialog-title">新增角色</h2><div className="orgv2-form-body"><label>角色名称 *<input name="name" required maxLength={120} autoFocus placeholder="请输入角色名称" /></label><label>角色说明<textarea name="description" rows={3} placeholder="说明该角色的工作范围" /></label></div>{error && <p role="alert" className="api-inline-error">{error}</p>}<div className="orgv2-modal-footer"><button type="button" className="orgv2-outline" onClick={() => setDialog(null)}>取消</button><button type="submit" className="orgv2-primary" disabled={busy}>创建并配置权限</button></div></form>}
      {dialog === "delete" && <div className="orgv2-confirm"><h2 id="role-dialog-title">删除当前角色？</h2><p>删除后无法恢复。请确认不再需要这个角色。</p><div className="orgv2-modal-footer"><button type="button" className="orgv2-outline" onClick={() => setDialog(null)}>取消</button><button type="button" className="orgv2-danger" disabled={busy} onClick={() => { void remove() }}>确认删除</button></div></div>}
      {dialog === "in-use" && <div className="orgv2-confirm"><h2 id="role-dialog-title">{selectedRole?.memberCount || error.includes("成员") ? "该角色仍有成员使用" : "当前角色不可删除"}</h2><p>{error || selectedRole?.reason || "请先为相关成员更换角色，再删除当前角色。"}{selectedRole?.memberCount ? ` 当前可见 ${selectedRole.memberCount} 位成员。` : ""}</p><div className="orgv2-modal-footer"><button type="button" className="orgv2-outline" onClick={() => setDialog(null)}>关闭</button>{onOpenMembers && <button type="button" className="orgv2-primary" onClick={() => { setDialog(null); onOpenMembers() }}>返回成员管理</button>}</div></div>}
      {dialog === "leave" && <div className="orgv2-confirm"><h2 id="role-dialog-title">未保存的修改</h2><p>当前角色权限有未保存的修改。</p><div className="orgv2-modal-footer"><button type="button" className="orgv2-outline" onClick={() => finishLeave(false)}>继续编辑</button><button type="button" className="orgv2-outline" onClick={() => finishLeave(true)}>放弃修改</button><button type="button" className="orgv2-primary" disabled={busy} onClick={() => { void save().then(ok => { if (ok) finishLeave(true) }) }}>保存并离开</button></div></div>}
    </div></div>}
  </div>
})

export default RolePermissionsPanel
