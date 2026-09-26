import { forwardRef, useImperativeHandle, useEffect, useMemo, useRef, useState } from "react"
import type { FormEvent } from "react"
import { ArrowLeft, ChevronDown, Plus, Search, Trash2, TriangleAlert, X } from "lucide-react"
import type { Station } from "@/App"
import "./organization-permissions.css"
import {useEditorLeaveGuard} from "./useEditorLeaveGuard"
import PlatformLeaveDialog from "./PlatformLeaveDialog"
import type {RolePermissionsHandle} from "./RolePermissionsPanel"

type View = "成员管理" | "组织管理" | "角色权限"
type Assignment = { id: string; roleId: string; sites: string[]; term: string }
type Member = {
  id: string
  name: string
  account: string
  email: string
  orgId: string
  status: "启用" | "停用"
  assignments: Assignment[]
}
type Organization = { id: string; name: string; parentId: string; leadId: string }
type Role = { id: string; name: string; description: string; permissions: string[] }
type Dialog = "member-create" | "member-edit" | "member-delete" | "org-create" | "org-edit" | "org-add-member" | "org-remove-member" | "role-create" | "role-delete" | "role-in-use" | "revoke" | null

const DEFAULT_SITES = ["海宁工商业储能站", "昆山园区储能站", "无锡光储充站"]
const GROUPS = [
  { name: "资产与站点", items: ["查看站点与设备", "新建站点", "编辑站点", "删除站点", "查看运营收益", "查看运行策略", "编辑运行策略", "下发运行策略"] },
  { name: "运营中心", items: ["查看运营总览", "查看收益核算", "查看计划调度", "制定调度计划", "查看响应邀约", "接受响应邀约"] },
  { name: "运维中心", items: ["查看告警", "查看设备健康", "处理告警", "转为运维工单", "上传目标固件", "执行固件升级"] },
  { name: "工单与审批", items: ["查看工单", "新建工单", "编辑工单", "处理工单", "查看审批", "审批申请"] },
  { name: "分析与报告", items: ["实时数据分析", "历史趋势分析", "生成报告", "下载数据"] },
  { name: "平台管理", items: ["查看客户", "管理客户", "查看组织与成员", "管理组织", "管理成员", "配置角色权限", "分配成员权限", "查看安全审计"] },
]
const READ = ["查看站点与设备", "查看运营收益", "查看运行策略", "查看运营总览", "查看收益核算", "查看告警", "查看设备健康", "查看工单", "查看审批", "实时数据分析", "历史趋势分析", "生成报告"]
const INITIAL_ROLES: Role[] = [
  { id: "owner", name: "项目业主 / 资产方", description: "查看资产、运营收益与分析报告", permissions: [...READ, "下载数据"] },
  { id: "pmo", name: "项目管理方 / 项目公司", description: "项目计划、站点管理与运营协作", permissions: [...READ, "编辑站点", "查看计划调度", "制定调度计划", "查看响应邀约", "接受响应邀约", "新建工单", "审批申请"] },
  { id: "ems", name: "EMS 运行管理方", description: "查看站点与收益、编辑运行方案、查询数据、生成报告", permissions: [...READ, "编辑运行策略"] },
  { id: "om", name: "运维服务方", description: "站点运维、设备健康、告警与工单处理", permissions: ["查看站点与设备", "查看运行策略", "查看告警", "查看设备健康", "处理告警", "转为运维工单", "上传目标固件", "执行固件升级", "查看工单", "新建工单", "编辑工单", "处理工单", "查看审批", "审批申请", "实时数据分析", "历史趋势分析", "生成报告", "下载数据", "查看组织与成员"] },
  { id: "epc", name: "EPC / 系统集成方", description: "站点建设与系统集成", permissions: ["查看站点与设备", "新建站点", "编辑站点", "查看运行策略", "查看设备健康", "查看工单", "新建工单", "编辑工单"] },
  { id: "vendor", name: "设备厂家", description: "设备诊断与固件服务", permissions: ["查看站点与设备", "查看告警", "查看设备健康", "上传目标固件", "执行固件升级", "查看工单"] },
  { id: "platform", name: "平台治理方", description: "客户、组织、权限与安全审计治理", permissions: GROUPS.flatMap((group) => group.items) },
  { id: "readonly", name: "只读观察员", description: "查看授权站点的数据，不执行修改和控制", permissions: READ },
]
const INITIAL_ORGS: Organization[] = [
  { id: "east", name: "华东运营中心", parentId: "", leadId: "wang" },
  { id: "ops", name: "运营部", parentId: "east", leadId: "wang" },
  { id: "maint", name: "运维部", parentId: "east", leadId: "chen" },
  { id: "service", name: "客户服务部", parentId: "", leadId: "liu" },
]
const INITIAL_MEMBERS: Member[] = [
  { id: "wang", name: "王凯", account: "wang.ops", email: "wang.kai@example.com", orgId: "ops", status: "启用", assignments: [{ id: "a-wang", roleId: "ems", sites: DEFAULT_SITES.slice(0, 2), term: "长期" }] },
  { id: "chen", name: "陈明", account: "chen.om", email: "chen.ming@example.com", orgId: "maint", status: "启用", assignments: [{ id: "a-chen", roleId: "om", sites: DEFAULT_SITES, term: "长期" }] },
  { id: "liu", name: "刘敏", account: "liu.audit", email: "liu.min@example.com", orgId: "service", status: "启用", assignments: [{ id: "a-liu", roleId: "readonly", sites: [DEFAULT_SITES[0]], term: "长期" }] },
  { id: "zhao", name: "赵宁", account: "zhao.ning", email: "zhao.ning@example.com", orgId: "", status: "启用", assignments: [] },
]
const newId = () => crypto.randomUUID()

function GroupCheckbox({ checked, partial, onChange, label }: { checked: boolean; partial: boolean; onChange: () => void; label: string }) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (input.current) input.current.indeterminate = partial }, [partial])
  return <label className="orgv2-group-toggle"><input ref={input} type="checkbox" checked={checked} onChange={onChange} aria-label={`${label}全部权限`} /><strong>{label}</strong></label>
}

export default forwardRef<RolePermissionsHandle, { stations?: Station[] }>(function OrganizationPermissions({ stations = [] }, ref) {
  const sites = stations.length
    ? stations.map((station) => station.name)
    : DEFAULT_SITES
  const [view, setView] = useState<View>("成员管理")
  const [members, setMembers] = useState(INITIAL_MEMBERS)
  const [orgs, setOrgs] = useState(INITIAL_ORGS)
  const [roles, setRoles] = useState(INITIAL_ROLES)
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [memberPage, setMemberPage] = useState<"list" | "detail" | "assign">("list")
  const [selectedOrgId, setSelectedOrgId] = useState("ops")
  const [selectedRoleId, setSelectedRoleId] = useState("owner")
  const [roleDraft, setRoleDraft] = useState<string[]>(INITIAL_ROLES[0].permissions)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [targetMemberId, setTargetMemberId] = useState("")
  const [targetAssignmentId, setTargetAssignmentId] = useState("")
  const [query, setQuery] = useState("")
  const [orgFilter, setOrgFilter] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [siteQuery, setSiteQuery] = useState("")
  const [assignRoleId, setAssignRoleId] = useState("ems")
  const [assignTerm, setAssignTerm] = useState("长期")
  const [assignSites, setAssignSites] = useState<string[]>([])
  const [editingAssignmentId, setEditingAssignmentId] = useState("")
  const [addMemberId, setAddMemberId] = useState("")
  const [notice, setNotice] = useState("")
  const dialogRef = useRef<HTMLDivElement>(null)

  const [modalDirty,setModalDirty]=useState(false),[leaveOpen,setLeaveOpen]=useState(false)
  const assignBaseline=useRef({role:"",term:"",sites:[] as string[]})
  const roleChanged=view==="角色权限" && JSON.stringify([...roleDraft].sort())!==JSON.stringify([...(roles.find(r=>r.id===selectedRoleId)?.permissions??[])].sort())
  const assignChanged=memberPage==="assign" && JSON.stringify({role:assignRoleId,term:assignTerm,sites:assignSites})!==JSON.stringify(assignBaseline.current)
  const dirty=roleChanged||assignChanged||!!(dialog&&modalDirty)
  const {requestLeave,settleLeave}=useEditorLeaveGuard({dirty,onConfirm:()=>setLeaveOpen(true),onCancel:()=>setLeaveOpen(false)})
  useImperativeHandle(ref,()=>({requestLeave}))
  useEffect(()=>{setModalDirty(false)},[dialog])
  useEffect(()=>{if(!dirty)return;const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=""};window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent)},[dirty])
  const closeDialog=async()=>{if(await requestLeave())setDialog(null)}
  const closeDialogRef=useRef(closeDialog)
  closeDialogRef.current=closeDialog
  const returnToMember=async()=>{if(await requestLeave())setMemberPage("detail")}
  const selectedMember = members.find((member) => member.id === selectedMemberId)
  const selectedOrg = orgs.find((org) => org.id === selectedOrgId)
  const selectedRole = roles.find((role) => role.id === selectedRoleId)
  const assignRole = roles.find((role) => role.id === assignRoleId)
  const targetMember = members.find((member) => member.id === targetMemberId)
  const targetAssignment = targetMember?.assignments.find((assignment) => assignment.id === targetAssignmentId)
  const orgPath = (id: string): string => {
    const org = orgs.find((item) => item.id === id)
    if (!org) return "未分配组织"
    return org.parentId ? `${orgPath(org.parentId)} / ${org.name}` : org.name
  }
  const filteredMembers = useMemo(() => members.filter((member) =>
    (!query.trim() || `${member.name} ${member.account}`.toLowerCase().includes(query.trim().toLowerCase())) &&
    (!orgFilter || member.orgId === orgFilter || (orgFilter === "unassigned" && !member.orgId)) &&
    (!statusFilter || member.status === statusFilter)
  ), [members, query, orgFilter, statusFilter])

  useEffect(() => {
    if (!dialog) return
    const first = dialogRef.current?.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, button")
    first?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") void closeDialogRef.current() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [dialog])

  const switchView = async (next: View) => {
    if(next===view||!(await requestLeave()))return
    setView(next)
    setDialog(null)
    if (next === "成员管理") setMemberPage("list")
  }
  const openAssign = (assignment?: Assignment) => {
    if (!selectedMember) return
    setEditingAssignmentId(assignment?.id ?? "")
    setAssignRoleId(assignment?.roleId ?? roles[0]?.id ?? "")
    setAssignTerm(assignment?.term ?? "长期")
    setAssignSites(assignment?.sites ?? [])
    assignBaseline.current={role:assignment?.roleId??roles[0]?.id??"",term:assignment?.term??"长期",sites:assignment?.sites??[]}
    setSiteQuery("")
    setMemberPage("assign")
  }
  const saveAssignment = () => {
    if (!selectedMember || !assignRoleId || !assignSites.length) return
    setMembers((previous) => previous.map((member) => {
      if (member.id !== selectedMember.id) return member
      const next: Assignment = { id: editingAssignmentId || newId(), roleId: assignRoleId, term: assignTerm, sites: assignSites }
      return { ...member, assignments: editingAssignmentId ? member.assignments.map((item) => item.id === editingAssignmentId ? next : item) : [...member.assignments, next] }
    }))
    setNotice("授权已保存")
    setMemberPage("detail")
  }
  const selectRole = (role: Role) => {
    setSelectedRoleId(role.id)
    setRoleDraft([...role.permissions])
  }
  const togglePermission = (permission: string) => setRoleDraft((previous) =>
    previous.includes(permission) ? previous.filter((item) => item !== permission) : [...previous, permission]
  )
  const saveRole = () => {
    setRoles((previous) => previous.map((role) => role.id === selectedRoleId ? { ...role, permissions: roleDraft } : role))
    setNotice("角色权限已保存")
  }
  const openRole = (roleId: string) => {
    const role = roles.find((item) => item.id === roleId)
    if (role) selectRole(role)
    setView("角色权限")
  }
  const submitMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    const account = String(form.get("account") ?? "").trim()
    const email = String(form.get("email") ?? "").trim()
    const orgId = String(form.get("orgId") ?? "")
    const status = String(form.get("status") ?? "启用") as Member["status"]
    if (members.some((member) => member.account.toLowerCase() === account.toLowerCase() && member.id !== targetMemberId)) {
      setNotice("账号已存在，请使用其他账号")
      return
    }
    if (dialog === "member-edit") {
      setMembers((previous) => previous.map((member) => member.id === targetMemberId ? { ...member, name, account, email, orgId, status } : member))
      setNotice("成员信息已更新")
    } else {
      setMembers((previous) => [...previous, { id: newId(), name, account, email, orgId, status, assignments: [] }])
      setNotice("成员已创建，可继续分配权限")
    }
    setDialog(null)
  }
  const submitOrg = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    const parentId = String(form.get("parentId") ?? "")
    const leadId = String(form.get("leadId") ?? "")
    if (dialog === "org-edit" && selectedOrg) {
      setOrgs((previous) => previous.map((org) => org.id === selectedOrg.id ? { ...org, name, parentId, leadId } : org))
      setNotice("组织信息已更新")
    } else {
      const id = newId()
      setOrgs((previous) => [...previous, { id, name, parentId, leadId }])
      setSelectedOrgId(id)
      setNotice("组织已创建")
    }
    setDialog(null)
  }
  const submitRole = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    if (roles.some((role) => role.name === name)) { setNotice("角色名称已存在"); return }
    const role = { id: newId(), name, description: String(form.get("description") ?? "").trim(), permissions: [] }
    setRoles((previous) => [...previous, role])
    selectRole(role)
    setDialog(null)
    setNotice("角色已创建，请配置并保存权限")
  }
  const startDeleteRole = () => {
    setDialog(members.some((member) => member.assignments.some((assignment) => assignment.roleId === selectedRoleId)) ? "role-in-use" : "role-delete")
  }
  const confirmDialog = () => {
    if (dialog === "member-delete") {
      setMembers((previous) => previous.filter((member) => member.id !== targetMemberId))
      if (selectedMemberId === targetMemberId) { setSelectedMemberId(""); setMemberPage("list") }
      setNotice("成员已删除")
    } else if (dialog === "org-remove-member") {
      setMembers((previous) => previous.map((member) => member.id === targetMemberId ? { ...member, orgId: "" } : member))
      setNotice("成员已移出组织")
    } else if (dialog === "revoke") {
      setMembers((previous) => previous.map((member) => member.id === targetMemberId ? { ...member, assignments: member.assignments.filter((assignment) => assignment.id !== targetAssignmentId) } : member))
      setNotice("授权已移除")
    } else if (dialog === "role-delete" && selectedRole) {
      setRoles((previous) => previous.filter((role) => role.id !== selectedRole.id))
      const next = roles.find((role) => role.id !== selectedRole.id)
      setSelectedRoleId(next?.id ?? "")
      setRoleDraft(next?.permissions ?? [])
      setNotice("角色已删除")
    }
    setDialog(null)
  }

  return <section className="orgv2" aria-label="组织权限" onChangeCapture={()=>{if(dialog)setModalDirty(true)}}>
    <nav className="orgv2-tabs" role="tablist" aria-label="组织权限功能">
      {(["成员管理", "组织管理", "角色权限"] as View[]).map((item) =>
        <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => switchView(item)}>{item}</button>
      )}
    </nav>

    {view === "成员管理" && memberPage === "list" && <>
      <div className="orgv2-filters">
        <label className="orgv2-search"><Search size={15} aria-hidden="true" /><input aria-label="搜索姓名或账号" placeholder="搜索姓名 / 账号" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="orgv2-select"><span>所属组织：</span><select aria-label="所属组织" value={orgFilter} onChange={(event) => setOrgFilter(event.target.value)}><option value="">全部</option><option value="unassigned">未分配组织</option>{orgs.map((org) => <option key={org.id} value={org.id}>{orgPath(org.id)}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label>
        <label className="orgv2-select orgv2-select--status"><span>状态：</span><select aria-label="成员状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">全部</option><option value="启用">启用</option><option value="停用">停用</option></select><ChevronDown size={14} aria-hidden="true" /></label>
        <button className="orgv2-primary orgv2-add" type="button" onClick={() => { setTargetMemberId(""); setDialog("member-create") }}><Plus size={16} aria-hidden="true" />新增成员</button>
      </div>
      <section className="orgv2-panel orgv2-members"><h2>全部成员</h2>
        <div className="orgv2-table-scroll"><table className="orgv2-table orgv2-member-table"><thead><tr><th>姓名 / 账号</th><th>所属组织</th><th>已分配角色</th><th>站点范围</th><th>状态</th><th>操作</th></tr></thead><tbody>
          {filteredMembers.map((member) => {
            const sites = new Set(member.assignments.flatMap((assignment) => assignment.sites))
            return <tr key={member.id}><td><strong>{member.name}</strong><span className="orgv2-subtext">{member.account}</span></td><td>{orgPath(member.orgId)}</td><td>{member.assignments.length ? member.assignments.map((assignment) => roles.find((role) => role.id === assignment.roleId)?.name).filter(Boolean).join("、") : "未授权"}</td><td>{sites.size ? `${sites.size} 个站点` : "—"}</td><td>{member.status}</td><td><div className="orgv2-actions"><button type="button" onClick={() => { setSelectedMemberId(member.id); setMemberPage("detail") }}>查看权限</button><button type="button" onClick={() => { setTargetMemberId(member.id); setDialog("member-edit") }}>编辑</button><button className="orgv2-danger-text" type="button" onClick={() => { setTargetMemberId(member.id); setDialog("member-delete") }}>删除</button></div></td></tr>
          })}
        </tbody></table></div>
        {filteredMembers.length === 0 && <p className="orgv2-empty">没有符合条件的成员</p>}
        <p className="orgv2-count">共 {filteredMembers.length} 位成员</p>
      </section>
    </>}

    {view === "成员管理" && memberPage === "detail" && selectedMember && <>
      <button className="orgv2-outline orgv2-back" type="button" onClick={() => setMemberPage("list")}><ArrowLeft size={15} aria-hidden="true" />返回成员列表</button>
      <section className="orgv2-panel orgv2-identity"><h2>{selectedMember.name}</h2><p>{selectedMember.account}<span>·</span>{orgPath(selectedMember.orgId)}<span>·</span>{selectedMember.status}</p></section>
      <section className="orgv2-panel orgv2-assigned"><div className="orgv2-heading"><h2>已分配权限</h2><button className="orgv2-primary" type="button" onClick={() => openAssign()}>分配权限</button></div>
        {selectedMember.assignments.length ? <div className="orgv2-table-scroll"><table className="orgv2-table orgv2-assignment-table"><thead><tr><th>角色</th><th>适用站点</th><th>授权来源</th><th>有效期</th><th>操作</th></tr></thead><tbody>{selectedMember.assignments.map((assignment) => <tr key={assignment.id}><td>{roles.find((role) => role.id === assignment.roleId)?.name ?? "已删除角色"}</td><td>{assignment.sites.map((site) => <span className="orgv2-site-line" key={site}>{site}</span>)}</td><td>直接授权</td><td>{assignment.term}</td><td><div className="orgv2-actions"><button className="orgv2-outline" type="button" onClick={() => openAssign(assignment)}>编辑</button><button className="orgv2-outline" type="button" onClick={() => { setTargetMemberId(selectedMember.id); setTargetAssignmentId(assignment.id); setDialog("revoke") }}>移除</button></div></td></tr>)}</tbody></table></div> : <div className="orgv2-unassigned"><p>暂无授权</p><button className="orgv2-primary" type="button" onClick={() => openAssign()}>分配角色</button></div>}
      </section>
      {selectedMember.assignments.map((assignment) => {
        const role = roles.find((item) => item.id === assignment.roleId)
        return role && <section className="orgv2-panel orgv2-preview" key={assignment.id}><div className="orgv2-heading"><h2>{role.name} · 可执行操作</h2><button className="orgv2-outline" type="button" onClick={() => openRole(role.id)}>查看角色权限</button></div>{GROUPS.map((group) => { const available = group.items.filter((item) => role.permissions.includes(item)); return available.length ? <p key={group.name}><strong>{group.name}</strong><span>{available.join("、")}</span></p> : null })}</section>
      })}
    </>}

    {view === "成员管理" && memberPage === "assign" && selectedMember && <>
      <button className="orgv2-outline orgv2-back" type="button" onClick={() => void returnToMember()}><ArrowLeft size={15} aria-hidden="true" />返回成员权限</button>
      <section className="orgv2-panel orgv2-assign"><h2>分配权限 · {selectedMember.name}</h2><div className="orgv2-assign-fields"><label>角色<select value={assignRoleId} onChange={(event) => setAssignRoleId(event.target.value)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label><label>有效期<select value={assignTerm} onChange={(event) => setAssignTerm(event.target.value)}><option>长期</option><option>30 天</option><option>90 天</option><option>1 年</option></select></label></div><div className="orgv2-role-summary"><p>{assignRole?.description || "请先选择角色"}</p><p>具体可执行操作由角色权限配置决定，请按实际工作范围选择站点。</p><button className="orgv2-outline" type="button" onClick={() => openRole(assignRoleId)}>查看完整权限</button></div></section>
      <section className="orgv2-panel orgv2-sites"><div className="orgv2-heading"><h2>站点范围 <small>已选 {assignSites.length} 个站点</small></h2><label className="orgv2-search"><Search size={15} aria-hidden="true" /><input aria-label="搜索站点" placeholder="搜索站点" value={siteQuery} onChange={(event) => setSiteQuery(event.target.value)} /></label></div>{sites.filter((site) => site.includes(siteQuery.trim())).map((site) => <label className="orgv2-site-option" key={site}><input type="checkbox" checked={assignSites.includes(site)} onChange={() => setAssignSites((previous) => previous.includes(site) ? previous.filter((item) => item !== site) : [...previous, site])} /><span>{site}<small>交付包站点</small></span></label>)}{sites.every((site) => !site.includes(siteQuery.trim())) && <p className="orgv2-empty">没有匹配的站点</p>}</section>
      <div className="orgv2-submit"><button className="orgv2-outline" type="button" onClick={() => void returnToMember()}>取消</button><button className="orgv2-primary" type="button" disabled={!assignSites.length} onClick={saveAssignment}>保存授权</button></div>
    </>}

    {view === "组织管理" && <div className="orgv2-split">
      <aside className="orgv2-panel orgv2-tree"><h2>组织结构</h2><button className="orgv2-outline orgv2-full" type="button" onClick={() => setDialog("org-create")}><Plus size={15} aria-hidden="true" />新增组织</button><button className={!selectedOrgId ? "is-active" : ""} type="button" onClick={() => setSelectedOrgId("")}>全部组织</button>{orgs.map((org) => <button key={org.id} type="button" className={selectedOrgId === org.id ? "is-active" : ""} style={{ paddingLeft: org.parentId ? 30 : 12 }} onClick={() => setSelectedOrgId(org.id)}>{org.name}</button>)}</aside>
      <div className="orgv2-org-main"><section className="orgv2-panel orgv2-org-info"><div className="orgv2-heading"><h2>{selectedOrg?.name ?? "全部组织"}</h2><div className="orgv2-actions"><button className="orgv2-outline" type="button" onClick={() => setDialog("org-create")}><Plus size={14} aria-hidden="true" />新增子组织</button><button className="orgv2-outline" type="button" disabled={!selectedOrg} onClick={() => setDialog("org-edit")}>编辑组织</button></div></div><p>上级组织　{selectedOrg?.parentId ? orgPath(selectedOrg.parentId) : "—"}</p><p>组织负责人　{members.find((member) => member.id === selectedOrg?.leadId)?.name ?? "未指定"}</p></section>
      <section className="orgv2-panel orgv2-org-members"><div className="orgv2-heading"><h2>直属成员 · {members.filter((member) => selectedOrg ? member.orgId === selectedOrg.id : !!member.orgId).length} 人</h2><button className="orgv2-primary" type="button" disabled={!selectedOrg} onClick={() => { setAddMemberId(""); setDialog("org-add-member") }}>添加已有成员</button></div><div className="orgv2-table-scroll"><table className="orgv2-table"><thead><tr><th>姓名 / 账号</th><th>所属组织</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>{members.filter((member) => selectedOrg ? member.orgId === selectedOrg.id : !!member.orgId).map((member) => <tr key={member.id}><td><strong>{member.name}</strong><span className="orgv2-subtext">{member.account}</span></td><td>{orgPath(member.orgId)}</td><td>{member.assignments.map((assignment) => roles.find((role) => role.id === assignment.roleId)?.name).filter(Boolean).join("、") || "未授权"}</td><td>{member.status}</td><td><button className="orgv2-text-button" type="button" onClick={() => { setTargetMemberId(member.id); setDialog("org-remove-member") }}>移出组织</button></td></tr>)}</tbody></table></div></section></div>
    </div>}

    {view === "角色权限" && <div className="orgv2-split"><aside className="orgv2-panel orgv2-role-list"><div className="orgv2-heading"><h2>业务角色</h2><div className="orgv2-icon-actions"><button type="button" aria-label="新增角色" title="新增角色" onClick={() => setDialog("role-create")}><Plus size={17} /></button><button type="button" aria-label="删除当前角色" title="删除当前角色" disabled={!selectedRole} onClick={startDeleteRole}><Trash2 size={16} /></button></div></div>{roles.map((role) => <button key={role.id} type="button" className={role.id === selectedRoleId ? "is-active" : ""} onClick={async () => {if(await requestLeave())selectRole(role)}}>{role.name}</button>)}</aside>
      <section className="orgv2-panel orgv2-role-matrix"><h2>{selectedRole?.name ?? "业务角色"}</h2>{GROUPS.map((group) => { const count = group.items.filter((item) => roleDraft.includes(item)).length; return <div className="orgv2-group" key={group.name}><GroupCheckbox label={group.name} checked={count === group.items.length} partial={count > 0 && count < group.items.length} onChange={() => setRoleDraft((previous) => count === group.items.length ? previous.filter((item) => !group.items.includes(item)) : [...new Set([...previous, ...group.items])])} /><div className="orgv2-check-grid">{group.items.map((item) => <label key={item}><input type="checkbox" checked={roleDraft.includes(item)} onChange={() => togglePermission(item)} />{item}</label>)}</div></div> })}
      <div className="orgv2-role-footer"><button className="orgv2-outline" type="button" onClick={() => setRoleDraft([...(selectedRole?.permissions ?? [])])}>取消修改</button><button className="orgv2-primary" type="button" onClick={saveRole}>保存修改</button></div></section>
    </div>}

    {notice && <div className="orgv2-notice" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {dialog && <div className="orgv2-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) void closeDialog() }}><div className="orgv2-modal" role="dialog" aria-modal="true" aria-labelledby="orgv2-dialog-title" ref={dialogRef}>
      <button className="orgv2-close" type="button" aria-label="关闭对话框" onClick={() => void closeDialog()}><X size={18} /></button>
      {(dialog === "member-create" || dialog === "member-edit") && <form onSubmit={submitMember}><h2 id="orgv2-dialog-title">{dialog === "member-create" ? "新增成员" : "编辑成员"}</h2><div className="orgv2-form-body"><label>姓名 *<input name="name" required placeholder="请输入姓名" defaultValue={dialog === "member-edit" ? targetMember?.name : ""} /></label><label>账号 *<input name="account" required placeholder="请输入账号" defaultValue={dialog === "member-edit" ? targetMember?.account : ""} /></label><label>邮箱 *<input name="email" type="email" required placeholder="请输入邮箱" defaultValue={dialog === "member-edit" ? targetMember?.email : ""} /></label><label>所属组织<select name="orgId" defaultValue={dialog === "member-edit" ? targetMember?.orgId : ""}><option value="">未分配组织</option>{orgs.map((org) => <option key={org.id} value={org.id}>{orgPath(org.id)}</option>)}</select></label>{dialog === "member-edit" && <label>状态<select name="status" defaultValue={targetMember?.status}><option>启用</option><option>停用</option></select></label>}</div><div className="orgv2-modal-footer"><button className="orgv2-outline" type="button" onClick={() => void closeDialog()}>取消</button><button className="orgv2-primary" type="submit">{dialog === "member-create" ? "创建成员" : "保存修改"}</button></div></form>}
      {(dialog === "org-create" || dialog === "org-edit") && <form onSubmit={submitOrg}><h2 id="orgv2-dialog-title">{dialog === "org-create" ? "新增子组织" : "编辑组织"}</h2><div className="orgv2-form-body"><label>组织名称 *<input name="name" required placeholder="请输入组织名称" defaultValue={dialog === "org-edit" ? selectedOrg?.name : ""} /></label><label>上级组织<select name="parentId" defaultValue={dialog === "org-edit" ? selectedOrg?.parentId : selectedOrgId}><option value="">无（顶级组织）</option>{orgs.filter((org) => dialog !== "org-edit" || (org.id !== selectedOrgId && !orgPath(org.id).includes(`${orgPath(selectedOrgId)} /`))).map((org) => <option key={org.id} value={org.id}>{orgPath(org.id)}</option>)}</select></label><label>组织负责人<select name="leadId" defaultValue={dialog === "org-edit" ? selectedOrg?.leadId : ""}><option value="">未指定</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label></div><div className="orgv2-modal-footer"><button className="orgv2-outline" type="button" onClick={() => void closeDialog()}>取消</button><button className="orgv2-primary" type="submit">{dialog === "org-create" ? "创建组织" : "保存修改"}</button></div></form>}
      {dialog === "org-add-member" && <div><h2 id="orgv2-dialog-title">添加成员到「{selectedOrg?.name}」</h2><div className="orgv2-form-body"><label>选择已有成员<select value={addMemberId} onChange={(event) => setAddMemberId(event.target.value)}><option value="">请选择成员</option>{members.filter((member) => member.orgId !== selectedOrgId).map((member) => <option key={member.id} value={member.id}>{member.name} / {member.account} · {orgPath(member.orgId)}</option>)}</select></label></div><div className="orgv2-modal-footer"><button className="orgv2-outline" type="button" onClick={() => void closeDialog()}>取消</button><button className="orgv2-primary" type="button" disabled={!addMemberId} onClick={() => { setMembers((previous) => previous.map((member) => member.id === addMemberId ? { ...member, orgId: selectedOrgId } : member)); setDialog(null); setNotice("成员已添加到组织") }}>添加 1 位成员</button></div></div>}
      {dialog === "role-create" && <form onSubmit={submitRole}><h2 id="orgv2-dialog-title">新增角色</h2><div className="orgv2-form-body"><label>角色名称 *<input name="name" required placeholder="请输入角色名称" /></label><label>角色说明<textarea name="description" rows={3} placeholder="说明该角色的工作范围" /></label></div><div className="orgv2-modal-footer"><button className="orgv2-outline" type="button" onClick={() => void closeDialog()}>取消</button><button className="orgv2-primary" type="submit">创建并配置权限</button></div></form>}
      {(["member-delete", "org-remove-member", "role-delete", "role-in-use", "revoke"] as Dialog[]).includes(dialog) && <div className="orgv2-confirm"><TriangleAlert size={24} aria-hidden="true" /><h2 id="orgv2-dialog-title">{dialog === "member-delete" ? `删除成员「${targetMember?.name}」？` : dialog === "org-remove-member" ? `移出成员「${targetMember?.name}」？` : dialog === "role-delete" ? "删除当前角色？" : dialog === "role-in-use" ? "该角色仍有成员使用" : "移除这条授权？"}</h2><p>{dialog === "member-delete" ? "删除后，该成员将无法登录，已有访问权限将被移除。历史操作记录保留。" : dialog === "org-remove-member" ? "成员将退出当前组织，已有角色授权保持不变。" : dialog === "role-delete" ? "确认删除后，该角色将不再出现在成员授权选项中。此操作不可恢复。" : dialog === "role-in-use" ? "请先为相关成员更换角色，再删除当前角色。不会自动移除成员已有权限。" : `${targetMember?.name}将失去「${roles.find((role) => role.id === targetAssignment?.roleId)?.name ?? ""}」授予的站点访问权限。`}</p><div className="orgv2-modal-footer"><button className="orgv2-outline" type="button" onClick={() => void closeDialog()}>取消</button>{dialog === "role-in-use" ? <button className="orgv2-primary" type="button" onClick={() => { setDialog(null); switchView("成员管理") }}>返回成员管理</button> : <button className={dialog === "member-delete" || dialog === "role-delete" ? "orgv2-danger" : "orgv2-primary"} type="button" onClick={confirmDialog}>{dialog === "member-delete" ? "删除成员" : dialog === "role-delete" ? "确认删除" : dialog === "org-remove-member" ? "移出组织" : "确认移除"}</button>}</div></div>}
    </div></div>}
    {leaveOpen&&<PlatformLeaveDialog onDecide={allow=>{if(allow){setRoleDraft([...(selectedRole?.permissions??[])]);setAssignRoleId(assignBaseline.current.role);setAssignTerm(assignBaseline.current.term);setAssignSites([...assignBaseline.current.sites]);setDialog(null);setModalDirty(false)}setLeaveOpen(false);settleLeave(allow)}}/>}
  </section>
})
