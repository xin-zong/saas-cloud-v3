import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import type { FormEvent } from "react"
import { api, send } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { ChevronDown, FolderTree, Plus, Search, X } from "lucide-react"
import MemberGrantsPanel from "./MemberGrantsPanel"
import type { RolePermissionsHandle } from "./RolePermissionsPanel"

type Member = {
  id: number
  account: string
  display_name: string
  enabled: boolean
  organization_id: number | null
  management_organization_id: number
  email?: string | null
}
type Organization = {
  id: number
  name: string
  parent_id: number | null
  lead_user_id?: number | null
  lead_name?: string | null
  lead_restricted?: boolean
  can_reparent?: boolean
}
type Dialog = "create" | "edit" | "membership" | "delete" | "org-create" | "org-edit" | "add" | "remove"
type DirectoryPurpose = "read" | "profiles" | "grants" | "organizations"
const emptyAccess = (): Record<DirectoryPurpose, Set<number>> => ({
  read: new Set(),
  profiles: new Set(),
  grants: new Set(),
  organizations: new Set(),
})
const message = (e: unknown) => (e instanceof Error ? e.message : "请求失败")

export default forwardRef<RolePermissionsHandle, {
  view: "成员管理" | "组织管理"
}>(function MemberOrganizationPanel({ view }, ref) {
  const { user } = useAuth()
  const has = (permission: string) => !!user?.permissions.includes(permission)
  const canProfile = has("member.manage.profile"),
    canOrganization = has("organization.manage"),
    canGrants = has("member.grant.manage"),
    canRead = has("organization.member.read")
  const [members, setMembers] = useState<Member[]>([]),
    [choices, setChoices] = useState<Member[]>([])
  const [memberAccess, setMemberAccess] = useState(emptyAccess)
  const [orgs, setOrgs] = useState<Organization[]>([]),
    [profileOrgs, setProfileOrgs] = useState<Organization[]>([]),
    [managedOrgs, setManagedOrgs] = useState<Organization[]>([])
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null),
    [grantMember, setGrantMember] = useState<Member | null>(null)
  const [target, setTarget] = useState<Member | null>(null),
    [dialog, setDialog] = useState<Dialog | null>(null)
  const [search, setSearch] = useState(""),
    [orgFilter, setOrgFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState("")
  const [pickerSearch, setPickerSearch] = useState(""),
    [createOrganization, setCreateOrganization] = useState("")
  const [created, setCreated] = useState<number | null>(null),
    [notice, setNotice] = useState("")
  const [error, setError] = useState(""),
    [formError, setFormError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false)
  const [leave, setLeave] = useState<null | {
    action: () => void
    resolve: (ok: boolean) => void
  }>(null)
  const pending = useRef(false),
    dirty = useRef(false),
    dialogRef = useRef<HTMLDivElement>(null),
    leaveRef = useRef<HTMLDivElement>(null),
    grantRef = useRef<RolePermissionsHandle>(null)
  const org = orgs.find((o) => o.id === selectedOrgId)
  const managedRoot =
    !!org &&
    (org.can_reparent === false ||
      !managedOrgs.some((o) => o.id === org.parent_id))
  const editableOrg = !!org && managedOrgs.some((o) => o.id === org.id)

  async function load(signal?: AbortSignal) {
    setLoading(true)
    setError("")
    const purposes: DirectoryPurpose[] = []
    if (canRead) purposes.push("read")
    if (view === "成员管理" && canProfile) purposes.push("profiles")
    if (view === "成员管理" && canGrants) purposes.push("grants")
    if (canOrganization) purposes.push("organizations")
    try {
      const directories = await Promise.all(
        purposes.map(async (purpose) => {
          const suffix = purpose === "read" ? "" : `?purpose=${purpose}`
          const [members, organizations] = await Promise.all([
            api<Member[]>(`/members${suffix}`, { signal }),
            api<Organization[]>(`/platform/organizations${suffix}`, { signal }),
          ])
          return { purpose, members, organizations }
        }),
      )
      if (signal?.aborted) return
      const mergedMembers = new Map<number, Member>(),
        mergedOrganizations = new Map<number, Organization>(),
        access = emptyAccess()
      for (const directory of directories) {
        for (const member of directory.members) {
          access[directory.purpose].add(member.id)
          const { email, ...context } = member
          const merged = { ...mergedMembers.get(member.id), ...context }
          // Minimal grant/membership contexts never supply or erase profile fields.
          if (
            (directory.purpose === "read" ||
              directory.purpose === "profiles") &&
            email !== undefined
          )
            merged.email = email
          mergedMembers.set(member.id, merged)
        }
        for (const organization of directory.organizations) {
          const previous = mergedOrganizations.get(organization.id)
          mergedOrganizations.set(
            organization.id,
            directory.purpose === "read" ||
              directory.purpose === "organizations"
              ? { ...previous, ...organization }
              : { ...organization, ...previous },
          )
        }
      }
      const o = [...mergedOrganizations.values()]
      setMembers([...mergedMembers.values()])
      setOrgs(o)
      setMemberAccess(access)
      setProfileOrgs(
        directories.find((d) => d.purpose === "profiles")?.organizations ?? [],
      )
      setManagedOrgs(
        directories.find((d) => d.purpose === "organizations")?.organizations ??
          [],
      )
      setChoices(
        directories.find((d) => d.purpose === "organizations")?.members ?? [],
      )
      setSelectedOrgId((current) =>
        o.some((x) => x.id === current) ? current : (o[0]?.id ?? null),
      )
    } catch (e) {
      if (!signal?.aborted) {
        setError(message(e))
        setMembers([])
        setMemberAccess(emptyAccess())
        setOrgs([])
        setProfileOrgs([])
        setManagedOrgs([])
        setChoices([])
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [view, canRead, canProfile, canGrants, canOrganization])
  function requestLeave(action: () => void = () => {}): Promise<boolean> {
    if (pending.current) return Promise.resolve(false)
    if (grantMember)
      return (grantRef.current?.requestLeave() ?? Promise.resolve(true)).then(
        (ok) => {
          if (ok) action()
          return ok
        },
      )
    if (!dirty.current) {
      action()
      return Promise.resolve(true)
    }
    return new Promise((resolve) => setLeave({ action, resolve }))
  }
  useImperativeHandle(ref, () => ({ requestLeave: () => requestLeave() }))
  function finishLeave(ok: boolean) {
    if (!leave || pending.current) return
    if (ok) {
      dirty.current = false
      leave.action()
    }
    leave.resolve(ok)
    setLeave(null)
  }
  function close() {
    void requestLeave(() => setDialog(null))
  }
  function open(kind: Dialog, member: Member | null = null) {
    if (pending.current) return
    dirty.current = false
    setFormError("")
    setPickerSearch("")
    setTarget(member)
    setCreateOrganization("")
    setDialog(kind)
  }
  useEffect(() => {
    if (!dialog) return
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const container = leave ? leaveRef.current : dialogRef.current
    const items = () =>
      Array.from(
        container?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
        ) ?? [],
      )
    ;(
      container?.querySelector<HTMLElement>("input:not([readonly])") ??
      items()[0]
    )?.focus()
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        if (leave) finishLeave(false)
        else close()
      }
      if (e.key !== "Tab") return
      const elements = items(),
        first = elements[0],
        last = elements[elements.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    container?.addEventListener("keydown", keyboard)
    return () => {
      container?.removeEventListener("keydown", keyboard)
      previous?.focus()
    }
  }, [dialog, leave])
  function orgPath(id: number | null, seen = new Set<number>()): string {
    if (id == null) return "未分配组织"
    if (seen.has(id)) return "组织层级异常"
    seen.add(id)
    const found = [...orgs, ...profileOrgs, ...managedOrgs].find(
      (o) => o.id === id,
    )
    if (!found) return "管理范围外组织"
    return found.parent_id && orgs.some((o) => o.id === found.parent_id)
      ? `${orgPath(found.parent_id, seen)} / ${found.name}`
      : found.name
  }
  function descendant(id: number | null, root: number): boolean {
    const seen = new Set<number>()
    while (id != null && !seen.has(id)) {
      if (id === root) return true
      seen.add(id)
      id = orgs.find((o) => o.id === id)?.parent_id ?? null
    }
    return false
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const form = new FormData(event.currentTarget),
      number = (name: string) =>
        form.get(name) ? Number(form.get(name)) : null
    pending.current = true
    setBusy(true)
    setFormError("")
    try {
      let result: { id: number } | undefined,
        done = ""
      if (dialog === "create") {
        const organizationId = number("organizationId")
        result = await send<{ id: number }>("/members", "POST", {
          account: String(form.get("account") ?? "").trim(),
          name: String(form.get("name") ?? "").trim(),
          password: String(form.get("password") ?? ""),
          email: String(form.get("email") ?? "").trim() || null,
          organizationId,
          ...(organizationId == null
            ? { managementOrganizationId: number("managementOrganizationId") }
            : {}),
        })
        done = "成员已创建，尚未分配权限"
      } else if (dialog === "edit" && target) {
        await send(`/members/${target.id}`, "PUT", {
          name: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim() || null,
          enabled: form.get("enabled") === "true",
        })
        done = "成员已更新"
      } else if ((dialog === "membership" || dialog === "remove") && target) {
        await send(`/members/${target.id}/organization`, "PUT", {
          organizationId: dialog === "remove" ? null : number("organizationId"),
        })
        done = dialog === "remove" ? "成员已移出组织" : "成员组织已更新"
      } else if (dialog === "add" && org) {
        await send(`/members/${number("memberId")}/organization`, "PUT", {
          organizationId: org.id,
        })
        done = "成员已添加到组织"
      } else if (dialog === "delete" && target) {
        await send(`/members/${target.id}`, "DELETE")
        done = "成员已删除"
      } else if ((dialog === "org-create" || dialog === "org-edit") && org) {
        await send(
          dialog === "org-create"
            ? "/platform/organizations"
            : `/platform/organizations/${org.id}`,
          dialog === "org-create" ? "POST" : "PUT",
          {
            name: String(form.get("name") ?? "").trim(),
            parentId:
              dialog === "org-edit" && managedRoot ? null : number("parentId"),
            ...(form.get("leadUserId") === "keep"
              ? {}
              : { leadUserId: number("leadUserId") }),
          },
        )
        done = dialog === "org-create" ? "组织已创建" : "组织已更新"
      }
      dirty.current = false
      await load()
      setDialog(null)
      setNotice(done)
      if (result) setCreated(result.id)
      if (leave) {
        leave.action()
        leave.resolve(true)
        setLeave(null)
      }
    } catch (e) {
      setFormError(message(e))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  const filtered = members.filter(
    (m) =>
      `${m.display_name} ${m.account}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!orgFilter ||
        (orgFilter === "unassigned"
          ? m.organization_id == null
          : m.organization_id === Number(orgFilter))) &&
      (!statusFilter || String(m.enabled) === statusFilter),
  )
  const eligible = choices.filter(
    (m) => m.organization_id !== org?.id && String(m.id) !== String(user?.id),
  )
  const leads = choices.filter(
    (m) => m.enabled && org && descendant(m.organization_id, org.id),
  )
  const keepLead =
    !!org &&
    (org.lead_restricted ||
      (org.lead_user_id != null &&
        !leads.some((m) => m.id === org.lead_user_id)))
  function table(rows: Member[], organization = false) {
    return (
      <div className="orgv2-table-scroll">
        <table className="orgv2-table orgv2-member-table">
          <thead>
            <tr>
              <th>姓名 / 账号</th>
              <th>所属组织</th>
              <th>已分配角色</th>
              <th>站点范围</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.display_name}</strong>
                  <span className="orgv2-subtext">{m.account}</span>
                </td>
                <td>{orgPath(m.organization_id)}</td>
                <td title="通过查看权限查看授权明细">
                  —<small className="orgv2-subtext">详情中查看</small>
                </td>
                <td>—</td>
                <td>
                  <span
                    className={`platform-status ${
                      m.enabled ? "is-normal" : "is-muted"
                    }`}
                  >
                    {m.enabled ? "启用" : "停用"}
                  </span>
                </td>
                <td>
                  <div className="orgv2-actions">
                    {!organization &&
                      (memberAccess.read.has(m.id) ||
                        memberAccess.grants.has(m.id)) && (
                        <button onClick={() => setGrantMember(m)}>
                          查看权限
                        </button>
                      )}
                    {!organization && memberAccess.profiles.has(m.id) && (
                      <>
                        <button onClick={() => open("edit", m)}>编辑</button>
                        <button
                          disabled={String(m.id) === String(user?.id)}
                          onClick={() => open("delete", m)}
                        >
                          删除
                        </button>
                      </>
                    )}
                    {memberAccess.organizations.has(m.id) && (
                      <button
                        disabled={String(m.id) === String(user?.id)}
                        onClick={() =>
                          open(organization ? "remove" : "membership", m)
                        }
                      >
                        {organization ? "移出组织" : "调整组织"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="platform-empty">没有符合条件的成员</p>}
      </div>
    )
  }
  const labels: Record<Dialog, string> = {
    create: "新增成员",
    edit: "编辑成员",
    membership: "调整成员组织",
    delete: "删除成员",
    "org-create": "新增子组织",
    "org-edit": "编辑组织",
    add: "添加已有成员",
    remove: "移出组织",
  }
  const submitLabel =
    dialog === "create"
      ? "创建"
      : dialog === "add"
        ? "添加"
        : dialog === "remove"
          ? "确认移出"
          : dialog === "delete"
            ? "确认删除"
            : "保存"
  return (
    <>
      {error && (
        <p role="alert" className="api-inline-error">
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="orgv2-panel">
          正在加载…
        </p>
      )}
      {!loading &&
        view === "成员管理" &&
        (grantMember ? (
          <MemberGrantsPanel
            ref={grantRef}
            member={grantMember}
            organizationName={orgPath(grantMember.organization_id)}
            canManage={memberAccess.grants.has(grantMember.id)}
            selfSelected={String(grantMember.id) === String(user?.id)}
            onClose={() => setGrantMember(null)}
          />
        ) : (
          <>
            <div className="orgv2-filters">
              <label className="orgv2-search">
                <Search size={16} />
                <input
                  aria-label="搜索姓名或账号"
                  placeholder="搜索姓名 / 账号"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className="orgv2-select">
                <span>所属组织：</span>
                <select
                  aria-label="筛选所属组织"
                  value={orgFilter}
                  onChange={(e) => setOrgFilter(e.target.value)}
                >
                  <option value="">全部组织</option>
                  <option value="unassigned">未分配组织</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {orgPath(o.id)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
              <label className="orgv2-select orgv2-select--status">
                <span>状态：</span>
                <select
                  aria-label="筛选成员状态"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">全部</option>
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </select>
                <ChevronDown size={14} />
              </label>
              {canProfile && (
                <button
                  className="orgv2-primary orgv2-add"
                  disabled={!profileOrgs.length}
                  onClick={() => open("create")}
                >
                  <Plus size={16} />
                  新增成员
                </button>
              )}
            </div>
            <section className="orgv2-panel orgv2-members">
              <div className="orgv2-heading">
                <h2>全部成员</h2>
                <span className="orgv2-subtext">
                  管理成员身份与业务访问范围
                </span>
              </div>
              {table(filtered)}
              <p className="orgv2-count">共 {filtered.length} 位成员</p>
            </section>
            {created && memberAccess.grants.has(created) && (
              <div className="api-context-note">
                <span>成员已创建，可单独分配权限。</span>
                <button
                  className="orgv2-outline"
                  onClick={() => {
                    const m = members.find((m) => m.id === created)
                    if (m) {
                      setGrantMember(m)
                      setCreated(null)
                    }
                  }}
                >
                  现在分配权限
                </button>
              </div>
            )}
          </>
        ))}
      {!loading && view === "组织管理" && (
        <div className="orgv2-split">
          <aside className="orgv2-panel orgv2-tree">
            <h2>组织结构</h2>
            <p className="orgv2-subtext">共 {orgs.length} 个组织</p>
            {orgs.map((o) => (
              <button
                key={o.id}
                className={o.id === selectedOrgId ? "is-active" : ""}
                title={orgPath(o.id)}
                aria-label={orgPath(o.id)}
                style={{
                  paddingLeft:
                    12 +
                    Math.min(orgPath(o.id).split(" / ").length - 1, 3) * 12,
                }}
                onClick={() => setSelectedOrgId(o.id)}
              >
                <FolderTree size={16} />
                <span>{o.name}</span>
              </button>
            ))}
            {!orgs.length && <p className="orgv2-empty">暂无组织</p>}
            {canOrganization && managedOrgs.length > 0 && (
              <button
                className="orgv2-outline member-workflow-add-org"
                onClick={() => open("org-create")}
              >
                <Plus size={15} />
                新增组织
              </button>
            )}
          </aside>
          <div className="orgv2-org-main">
            <section className="orgv2-panel orgv2-org-info">
              <div className="orgv2-heading">
                <h2>{org?.name ?? "组织信息"}</h2>
                {editableOrg && (
                  <div className="orgv2-actions">
                    <button
                      className="orgv2-outline"
                      onClick={() => open("org-create")}
                    >
                      <Plus size={15} />
                      新增子组织
                    </button>
                    <button
                      className="orgv2-outline"
                      onClick={() => open("org-edit")}
                    >
                      编辑组织
                    </button>
                  </div>
                )}
              </div>
              <dl className="api-detail-grid">
                <div>
                  <dt>上级组织</dt>
                  <dd>
                    {org?.parent_id && orgs.some((o) => o.id === org.parent_id)
                      ? orgPath(org.parent_id)
                      : "上级由管理员维护"}
                  </dd>
                </div>
                <div>
                  <dt>组织负责人</dt>
                  <dd>
                    {org?.lead_restricted
                      ? "负责人信息受限"
                      : (org?.lead_name ??
                        choices.find((m) => m.id === org?.lead_user_id)
                          ?.display_name ??
                        members.find((m) => m.id === org?.lead_user_id)
                          ?.display_name ??
                        "未配置")}
                  </dd>
                </div>
              </dl>
            </section>
            <section className="orgv2-panel">
              <div className="orgv2-heading">
                <h2>直属成员</h2>
                {editableOrg && (
                  <button className="orgv2-primary" onClick={() => open("add")}>
                    <Plus size={15} />
                    添加已有成员
                  </button>
                )}
              </div>
              {table(
                members.filter((m) => m.organization_id === org?.id),
                true,
              )}
            </section>
          </div>
        </div>
      )}
      {notice && (
        <div className="platform-notice" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {dialog && (
        <div
          className="orgv2-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close()
          }}
        >
          <div
            ref={dialogRef}
            className="orgv2-modal member-workflow-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="directory-dialog-title"
          >
            <button
              className="orgv2-close"
              aria-label="关闭对话框"
              disabled={busy}
              onClick={close}
            >
              <X size={18} />
            </button>
            <form
              onSubmit={(e) => void save(e)}
              onChange={() => {
                dirty.current = true
              }}
            >
              <header className="api-modal-heading">
                <h2 id="directory-dialog-title">{labels[dialog]}</h2>
              </header>
              <div className="api-modal-scroll">
                <fieldset disabled={busy} className="member-workflow-fields">
                  {(dialog === "create" || dialog === "edit") && (
                    <>
                      <div className="orgv2-form-body">
                        <label>
                          姓名 *
                          <input
                            name="name"
                            required
                            maxLength={120}
                            defaultValue={target?.display_name ?? ""}
                          />
                        </label>
                        <label>
                          账号{dialog === "create" && " *"}
                          <input
                            name="account"
                            required
                            maxLength={120}
                            readOnly={dialog === "edit"}
                            defaultValue={target?.account ?? ""}
                            autoComplete="off"
                          />
                        </label>
                        <label>
                          邮箱
                          <input
                            name="email"
                            type="email"
                            maxLength={254}
                            defaultValue={target?.email ?? ""}
                          />
                        </label>
                        {dialog === "create" ? (
                          <label>
                            所属组织
                            <select
                              name="organizationId"
                              value={createOrganization}
                              onChange={(e) =>
                                setCreateOrganization(e.target.value)
                              }
                            >
                              <option value="">未分配组织</option>
                              {profileOrgs.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {orgPath(o.id)}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <label>
                            所属组织
                            <input
                              value={orgPath(target?.organization_id ?? null)}
                              readOnly
                            />
                          </label>
                        )}
                        {dialog === "create" ? (
                          <>
                            <label>
                              初始密码 *
                              <input
                                name="password"
                                type="password"
                                required
                                minLength={12}
                                maxLength={72}
                                autoComplete="new-password"
                              />
                            </label>
                            {!createOrganization && (
                              <label>
                                管理组织 *
                                <select
                                  name="managementOrganizationId"
                                  required
                                  defaultValue=""
                                >
                                  <option value="" disabled>
                                    请选择管理组织
                                  </option>
                                  {profileOrgs.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {orgPath(o.id)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </>
                        ) : (
                          <label>
                            状态
                            <select
                              name="enabled"
                              defaultValue={target?.enabled ? "true" : "false"}
                            >
                              <option value="true">启用</option>
                              <option
                                value="false"
                                disabled={
                                  String(target?.id) === String(user?.id)
                                }
                              >
                                停用
                              </option>
                            </select>
                          </label>
                        )}
                      </div>
                      <p className="api-context-note">
                        {dialog === "create"
                          ? "先创建成员，再单独分配权限。移出所属组织后仍由所选管理组织管理。"
                          : "此处仅修改成员信息，所属组织请通过“调整组织”单独修改。"}
                      </p>
                    </>
                  )}
                  {(dialog === "org-create" || dialog === "org-edit") && (
                    <>
                      <div className="orgv2-form-body">
                        <label>
                          组织名称 *
                          <input
                            name="name"
                            required
                            maxLength={120}
                            defaultValue={
                              dialog === "org-edit" ? org?.name : ""
                            }
                          />
                        </label>
                        <label>
                          上级组织
                          <select
                            name="parentId"
                            disabled={dialog === "org-edit" && managedRoot}
                            defaultValue={
                              dialog === "org-create"
                                ? org?.id
                                : managedRoot
                                  ? ""
                                  : (org?.parent_id ?? "")
                            }
                          >
                            {dialog === "org-edit" && managedRoot && (
                              <option value="">
                                管理组织（上级由管理员维护）
                              </option>
                            )}
                            {managedOrgs
                              .filter(
                                (o) =>
                                  dialog === "org-create" ||
                                  !org ||
                                  !descendant(o.id, org.id),
                              )
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {orgPath(o.id)}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          组织负责人
                          <select
                            name="leadUserId"
                            defaultValue={
                              dialog === "org-edit"
                                ? keepLead
                                  ? "keep"
                                  : (org?.lead_user_id ?? "")
                                : ""
                            }
                          >
                            <option value="">未配置</option>
                            {dialog === "org-edit" && keepLead && (
                              <option value="keep">
                                保留现任负责人（范围外或停用）
                              </option>
                            )}
                            {dialog === "org-edit" &&
                              leads.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.display_name} / {m.account}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                      <p className="api-context-note">
                        组织负责人须属于本组织或下级组织。新组织可在添加成员后设置负责人；管理根不能移动。
                      </p>
                    </>
                  )}
                  {dialog === "add" && (
                    <>
                      <div className="orgv2-form-body">
                        <label className="member-workflow-wide">
                          搜索成员
                          <input
                            aria-label="搜索已有成员"
                            placeholder="搜索姓名 / 账号"
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                          />
                        </label>
                        <label className="member-workflow-wide">
                          已有成员 *
                          <select name="memberId" required defaultValue="">
                            <option value="" disabled>
                              请选择成员
                            </option>
                            {eligible
                              .filter((m) =>
                                `${m.display_name} ${m.account}`
                                  .toLowerCase()
                                  .includes(pickerSearch.toLowerCase()),
                              )
                              .map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.display_name} / {m.account} ·{" "}
                                  {orgPath(m.organization_id)}
                                </option>
                              ))}
                          </select>
                        </label>
                      </div>
                      <p className="api-context-note">
                        成员将加入 {org?.name}，已有授权将保留，管理组织不变。
                      </p>
                    </>
                  )}
                  {dialog === "membership" && (
                    <>
                      <div className="orgv2-form-body">
                        <label className="member-workflow-wide">
                          所属组织
                          <select
                            name="organizationId"
                            defaultValue={target?.organization_id ?? ""}
                          >
                            <option value="">未分配组织</option>
                            {managedOrgs.map((o) => (
                              <option key={o.id} value={o.id}>
                                {orgPath(o.id)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="api-context-note">
                        已有授权将保留。成员仍由{" "}
                        {orgPath(target?.management_organization_id ?? null)}{" "}
                        管理；不再合法的组织负责人关系会清除。
                      </p>
                    </>
                  )}
                  {dialog === "remove" && (
                    <p>
                      确认将 {target?.display_name} 移出 {org?.name}
                      ？已有授权将保留，管理组织不变；不再合法的负责人关系会清除。
                    </p>
                  )}
                  {dialog === "delete" && (
                    <p>
                      确认删除成员 {target?.display_name}
                      ？存在业务或授权历史时无法删除，请改为停用。
                    </p>
                  )}
                </fieldset>
                {formError && (
                  <p role="alert" className="api-inline-error">
                    {formError}
                  </p>
                )}
              </div>
              <footer className="orgv2-modal-footer">
                <button
                  type="button"
                  className="orgv2-outline"
                  disabled={busy}
                  onClick={close}
                >
                  取消
                </button>
                <button
                  className="orgv2-primary"
                  disabled={busy || (dialog === "add" && !eligible.length)}
                >
                  {busy ? "正在保存…" : submitLabel}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
      {leave && (
        <div className="orgv2-overlay member-workflow-leave">
          <div
            ref={leaveRef}
            className="orgv2-modal member-workflow-modal"
            role="dialog"
            aria-modal="true"
            aria-label="未保存的修改"
          >
            <header className="api-modal-heading">
              <h2>未保存的修改</h2>
            </header>
            <p className="api-modal-scroll">当前表单有未保存的修改。</p>
            <footer className="orgv2-modal-footer">
              <button
                className="orgv2-outline"
                disabled={busy}
                onClick={() => finishLeave(false)}
              >
                继续编辑
              </button>
              <button
                className="orgv2-outline"
                disabled={busy}
                onClick={() => finishLeave(true)}
              >
                放弃修改
              </button>
              <button
                className="orgv2-primary"
                disabled={busy}
                onClick={() =>
                  dialogRef.current?.querySelector("form")?.requestSubmit()
                }
              >
                保存并离开
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  )
})
