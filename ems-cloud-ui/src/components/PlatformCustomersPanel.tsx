import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import { api, send } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"

import { useEditorLeaveGuard } from "./useEditorLeaveGuard"

import PlatformLeaveDialog from "./PlatformLeaveDialog"

import type { RolePermissionsHandle } from "./RolePermissionsPanel"

type CustomerProfile = { entity: string; contact: string }

type Entitlements = Record<string, string>

const entitlementFields = [
  "合同编号",
  "服务开始日期",
  "服务结束日期",
  "服务套餐",
  "站点配额",
  "账号配额",
  "API调用配额",
  "SLA（%）",
]

const readEntitlements = (key: string): Entitlements => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "{}")
    return Object.fromEntries(
      entitlementFields.map((k) => [k, typeof v[k] === "string" ? v[k] : ""]),
    )
  } catch {
    return {}
  }
}

const emptyProfile = (): CustomerProfile => ({ entity: "", contact: "" })

type Customer = {
  id: number
  name: string
  organization_id: number
  organization_name: string
  entity: string | null
  contact: string | null
  station_count: number
  can_edit: boolean
  stations: { id: number; name: string; code: string }[]
}

export default forwardRef<RolePermissionsHandle>(
  function PlatformCustomersPanel(_, ref) {
    const { user } = useAuth()
    const canManage = !!user?.permissions.includes("customer.manage"),
      canRead = !!user?.permissions.includes("customer.read")

    const [rows, setRows] = useState<Customer[]>([]),
      [selected, setSelected] = useState<number | null>(null),
      [search, setSearch] = useState(""),
      [filter, setFilter] = useState(""),
      [editing, setEditing] =
        useState<false | "profile" | "entitlements" | "create">(false),
      [entitlements, setEntitlements] = useState<Entitlements>({}),
      [savedEntitlements, setSavedEntitlements] = useState<Entitlements>({}),
      [name, setName] = useState(""),
      [error, setError] = useState(""),
      [formError, setFormError] = useState(""),
      [busy, setBusy] = useState(false),
      [loading, setLoading] = useState(true),
      [leave, setLeave] = useState(false),
      [notice, setNotice] = useState(""),
      [profile, setProfile] = useState<CustomerProfile>(emptyProfile),
      [savedProfile, setSavedProfile] = useState<CustomerProfile>(emptyProfile)

    const [organizations, setOrganizations] = useState<{
        id: number
        name: string
      }[]>([]),
      [organizationId, setOrganizationId] = useState(""),
      [optionsError, setOptionsError] = useState(""),
      [optionsLoading, setOptionsLoading] = useState(false),
      [initialOrganizationId, setInitialOrganizationId] = useState("")

    const accessVersion = useRef(0)
    const optionsRequest = useRef(0)

    async function loadCreateOptions() {
      const request = ++optionsRequest.current
      setOptionsLoading(true)
      setOptionsError("")
      try {
        const data = await api<{
          organizations: { id: number; name: string }[]
        }>("/platform/customers/create-options")
        if (request !== optionsRequest.current) return
        setOrganizations(data.organizations)
        setOrganizationId(
          data.organizations.length === 1
            ? String(data.organizations[0].id)
            : "",
        )
        setInitialOrganizationId(
          data.organizations.length === 1
            ? String(data.organizations[0].id)
            : "",
        )
      } catch (e) {
        if (request !== optionsRequest.current) return
        setOrganizations([])
        setOptionsError(e instanceof Error ? e.message : "组织加载失败")
      } finally {
        if (request === optionsRequest.current) setOptionsLoading(false)
      }
    }

    const modal = useRef<HTMLDivElement>(null),
      pending = useRef(false)
    const customer = rows.find((c) => c.id === selected)
    const canEdit = !!customer?.can_edit && canManage
    const profileKey = `enerlution:platform-customer:api:${user?.id}:${selected}`
    const entitlementKey = profileKey + ":entitlements"
    const dirty =
      !!editing &&
      (editing === "entitlements"
        ? JSON.stringify(entitlements) !== JSON.stringify(savedEntitlements)
        : name !== (customer?.name ?? "") ||
          JSON.stringify(profile) !== JSON.stringify(savedProfile) ||
          (editing === "create" && organizationId !== initialOrganizationId))

    const { requestLeave, settleLeave } = useEditorLeaveGuard({
      dirty,
      enabled: canEdit || editing === "create",
      onConfirm: () => setLeave(true),
      onCancel: () => setLeave(false),
    })

    useImperativeHandle(ref, () => ({
      requestLeave: () =>
        pending.current ? Promise.resolve(false) : requestLeave(),
    }))

    useEffect(() => {
      accessVersion.current++
      optionsRequest.current++
      const controller = new AbortController()
      setRows([])
      setEditing(false)
      setSelected(null)
      setError("")
      setNotice("")
      setLeave(false)
      settleLeave(false)
      setLoading(true)
      if (!canRead) {
        setLoading(false)
        return
      }
      api<Customer[]>("/platform/customers", { signal: controller.signal })
        .then((data) => {
          if (!controller.signal.aborted) setRows(data)
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
      return () => controller.abort()
    }, [
      user?.id,
      canRead,
      canManage,
      JSON.stringify(user?.stationPermissions),
      JSON.stringify(user?.organizationPermissions),
      settleLeave,
    ])

    useEffect(() => {
      if (!dirty) return
      const prevent = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = ""
      }
      window.addEventListener("beforeunload", prevent)
      return () => window.removeEventListener("beforeunload", prevent)
    }, [dirty])

    async function close() {
      if (pending.current || !(await requestLeave())) return
      optionsRequest.current++
      setEditing(false)
      setName(customer?.name ?? "")
      setProfile(savedProfile)
      setEntitlements(savedEntitlements)
      setFormError("")
    }

    const modalState = useRef({ leave, close })

    modalState.current = { leave, close }

    useEffect(() => {
      if (!editing) return

      const previous = document.activeElement as HTMLElement | null

      modal.current?.querySelector<HTMLElement>("input")?.focus()

      const onKey = (event: KeyboardEvent) => {
        // The confirmation dialog owns keyboard focus while it is open.

        if (modalState.current.leave) return

        if (event.key === "Escape") {
          event.preventDefault()

          void modalState.current.close()
        }

        if (event.key === "Tab") {
          const nodes = Array.from(
            modal.current?.querySelectorAll<HTMLElement>(
              "input:not(:disabled),select:not(:disabled),button:not(:disabled)",
            ) ?? [],
          )

          if (event.shiftKey && document.activeElement === nodes[0]) {
            event.preventDefault()

            nodes.at(-1)?.focus()
          } else if (
            !event.shiftKey &&
            document.activeElement === nodes.at(-1)
          ) {
            event.preventDefault()

            nodes[0]?.focus()
          }
        }
      }

      document.addEventListener("keydown", onKey)

      return () => {
        document.removeEventListener("keydown", onKey)

        if (previous?.isConnected) previous.focus()
      }
    }, [editing])

    async function save() {
      if (
        pending.current ||
        !(editing === "create" ? canManage && canRead : customer && canEdit)
      )
        return
      if (editing === "entitlements") {
        if (
          entitlements["服务开始日期"] &&
          entitlements["服务结束日期"] &&
          entitlements["服务开始日期"] > entitlements["服务结束日期"]
        ) {
          setFormError("服务结束日期不能早于开始日期")
          return
        }
        try {
          localStorage.setItem(entitlementKey, JSON.stringify(entitlements))
          setSavedEntitlements({ ...entitlements })
          setEditing(false)
          setNotice("合同与权益仅保存为本地草稿，尚未提交，线上配额未更改。")
        } catch {
          setFormError("本地草稿保存失败，输入已保留")
        }
        return
      }
      if (!name.trim()) {
        setFormError("请输入客户名称")
        return
      }
      if (
        editing === "create" &&
        (!organizationId || optionsError || optionsLoading)
      ) {
        setFormError("请选择可用的所属组织")
        return
      }
      const saveVersion = accessVersion.current
      pending.current = true
      setBusy(true)
      setFormError("")
      try {
        const creating = editing === "create"
        const persisted = await send<Customer>(
          creating
            ? "/platform/customers"
            : `/platform/customers/${customer!.id}`,
          creating ? "POST" : "PUT",
          {
            name: name.trim(),
            entity: profile.entity.trim() || null,
            contact: profile.contact.trim() || null,
            ...(creating ? { organizationId: Number(organizationId) } : {}),
          },
        )
        if (saveVersion !== accessVersion.current) return
        if (creating) {
          const created = {
            ...persisted,
            organization_name:
              organizations.find((o) => o.id === persisted.organization_id)
                ?.name || "",
            station_count: 0,
            stations: [],
            can_edit: true,
          }
          setRows((current) => [...current, created])
          setSelected(persisted.id)
        } else
          setRows((current) =>
            current.map((c) =>
              c.id === customer!.id ? { ...c, ...persisted } : c,
            ),
          )
        setSavedProfile({
          entity: persisted.entity ?? "",
          contact: persisted.contact ?? "",
        })
        setEditing(false)
        setNotice(creating ? "客户已创建，可关联站点。" : "客户资料已保存。")
      } catch (e) {
        if (saveVersion === accessVersion.current) setFormError(e instanceof Error ? e.message : "保存失败，输入已保留")
      } finally {
        pending.current = false
        setBusy(false)
      }
    }

    const visible = rows.filter(
      (c) =>
        `${c.name} ${c.id}`.toLowerCase().includes(search.toLowerCase()) &&
        (!filter ||
          (filter === "editable"
            ? c.can_edit && canManage
            : !c.can_edit || !canManage)),
    )

    return (
      <section
        className="platform-customers"
        data-design-node={selected ? "1673:6001" : "1673:5775"}
      >
        {!canRead && <p role="status">当前账户没有客户查看权限</p>}
        {loading && <p role="status">正在加载客户…</p>}
        {error && (
          <p role="alert" className="api-inline-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="api-context-note">
            {notice}
          </p>
        )}
        {customer ? (
          <>
            <button className="orgv2-outline" onClick={() => setSelected(null)}>
              返回客户列表
            </button>
            <div className="orgv2-heading">
              <h2>{customer.name}</h2>
              <button
                className="orgv2-primary"
                disabled={!canEdit}
                onClick={() => {
                  setName(customer.name)
                  const local = {
                    entity: customer.entity ?? "",
                    contact: customer.contact ?? "",
                  }
                  setProfile(local)
                  setSavedProfile(local)
                  setFormError("")
                  setEditing("profile")
                }}
              >
                编辑客户资料
              </button>
            </div>
            <div className="platform-record-grid">
              <section className="platform-detail-card">
                <h3>客户资料</h3>
                <dl>
                  {[
                    ["客户名称", customer.name],
                    ["客户编号", String(customer.id)],
                    ["客户主体", customer.entity || "未配置"],
                    ["租户标识", "未配置"],
                    ["行业", "未配置"],
                    ["服务联系人", customer.contact || "未配置"],
                    ["数据区域", "未配置"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="platform-detail-card">
                <h3>合同与权益</h3>
                <dl>
                  {[
                    ["合同编号", "未配置"],
                    ["服务期限", "未配置"],
                    ["服务套餐", "未配置"],
                    ["授权站点", String(customer.station_count)],
                    ["站点配额", "未配置"],
                    ["账号配额", "未配置"],
                    ["API用量", "未提供"],
                    ["SLA", "未提供"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  className="orgv2-outline"
                  disabled={!canEdit}
                  onClick={() => {
                    const local = readEntitlements(entitlementKey)
                    setEntitlements(local)
                    setSavedEntitlements(local)
                    setFormError("")
                    setEditing("entitlements")
                  }}
                >
                  编辑权益
                </button>
              </section>
            </div>
            <section className="platform-detail-card">
              <h3>授权站点</h3>
              {!customer.stations.length && (
                <p className="platform-empty">暂无已授权的关联站点</p>
              )}
              {customer.stations.map((s) => (
                <p key={s.id}>
                  {s.name} · {s.code || "—"}
                </p>
              ))}
            </section>
            <p className="orgv2-subtext">
              客户信息按所属组织与授权范围显示。站点数仅包含当前可查看站点；编辑需覆盖客户全部关联站点。
            </p>
          </>
        ) : (
          <>
            <div className="platform-toolbar">
              <input
                aria-label="搜索客户名称"
                placeholder="搜索客户名称 / 编号"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="客户编辑权限"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">权限：全部客户</option>
                <option value="editable">可编辑</option>
                <option value="readonly">仅查看</option>
              </select>
              <span className="api-toolbar-note">当前授权范围内的客户</span>
              {canManage && canRead && (
                <button
                  className="orgv2-primary"
                  onClick={() => {
                    setName("")
                    setProfile(emptyProfile())
                    setSavedProfile(emptyProfile())
                    setFormError("")
                    setOrganizationId("")
                    setInitialOrganizationId("")
                    setEditing("create")
                    void loadCreateOptions()
                  }}
                >
                  新增客户
                </button>
              )}
            </div>
            <section className="platform-table-card">
              <table>
                <thead>
                  <tr>
                    {[
                      "客户名称",
                      "行业",
                      "站点数",
                      "服务到期",
                      "服务套餐",
                      "维护权限",
                      "操作",
                    ].map((t) => (
                      <th key={t}>{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>—</td>
                      <td>{c.station_count}</td>
                      <td>—</td>
                      <td>—</td>
                      <td>{c.can_edit && canManage ? "可编辑" : "仅查看"}</td>
                      <td>
                        <button
                          className="platform-text-button"
                          onClick={() => setSelected(c.id)}
                        >
                          查看详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !visible.length && (
                <p className="platform-empty">当前条件下暂无客户</p>
              )}
            </section>
          </>
        )}
        {editing && (customer || editing === "create") && (
          <div
            className="orgv2-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) void close()
            }}
          >
            <div
              ref={modal}
              className="orgv2-modal platform-customer-modal"
              role="dialog"
              aria-modal="true"
              aria-label={
                editing === "create"
                  ? "新增客户"
                  : editing === "profile"
                    ? "编辑客户资料"
                    : "编辑合同与权益（本地草稿）"
              }
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void save()
                }}
              >
                <header className="api-modal-heading">
                  <h2>
                    {editing === "create"
                      ? "新增客户"
                      : `${
                          editing === "profile"
                            ? "编辑客户资料"
                            : "编辑合同与权益"
                        } · ${customer?.name}`}
                  </h2>
                  <button
                    type="button"
                    className="orgv2-close"
                    aria-label="关闭编辑客户"
                    onClick={() => void close()}
                  >
                    ×
                  </button>
                </header>
                <div className="api-modal-scroll">
                  <div className="orgv2-form-body">
                    {editing === "entitlements" ? (
                      entitlementFields.map((field) => (
                        <label key={field}>
                          {field}
                          <input
                            aria-label={field}
                            type={
                              field.includes("日期")
                                ? "date"
                                : field.includes("配额") ||
                                    field.includes("SLA")
                                  ? "number"
                                  : "text"
                            }
                            min={
                              field.includes("配额") || field.includes("SLA")
                                ? 0
                                : undefined
                            }
                            max={field.includes("SLA") ? 100 : undefined}
                            step={field.includes("SLA") ? 0.01 : undefined}
                            value={entitlements[field] || ""}
                            onChange={(e) =>
                              setEntitlements({
                                ...entitlements,
                                [field]: e.target.value,
                              })
                            }
                          />
                        </label>
                      ))
                    ) : (
                      <>
                        {editing === "create" && (
                          <label>
                            所属组织 *
                            <select
                              aria-label="所属组织 *"
                              value={organizationId}
                              disabled={busy || optionsLoading}
                              onChange={(e) => {
                                setOrganizationId(e.target.value)
                                setFormError("")
                              }}
                            >
                              <option value="">
                                {optionsLoading
                                  ? "正在加载组织…"
                                  : "请选择组织"}
                              </option>
                              {organizations.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                            </select>
                            {optionsError && (
                              <>
                                <p role="alert" className="api-inline-error">
                                  {optionsError}
                                </p>
                                <button
                                  type="button"
                                  className="orgv2-outline"
                                  onClick={() => void loadCreateOptions()}
                                >
                                  重试加载组织
                                </button>
                              </>
                            )}
                          </label>
                        )}
                        <label>
                          客户名称 *
                          <input
                            name="name"
                            required
                            maxLength={160}
                            value={name}
                            onChange={(e) => {
                              setName(e.target.value)
                              setFormError("")
                            }}
                            disabled={busy}
                          />
                        </label>
                        <label>
                          客户主体
                          <input
                            value={profile.entity}
                            maxLength={160}
                            disabled={busy}
                            onChange={(e) => {
                              setProfile({ ...profile, entity: e.target.value })
                              setFormError("")
                            }}
                          />
                        </label>
                        <label>
                          服务联系人
                          <input
                            value={profile.contact}
                            maxLength={254}
                            disabled={busy}
                            onChange={(e) => {
                              setProfile({
                                ...profile,
                                contact: e.target.value,
                              })
                              setFormError("")
                            }}
                          />
                        </label>
                      </>
                    )}
                  </div>
                  <p className="api-context-note">
                    {editing !== "entitlements"
                      ? "客户名称、主体与服务联系人保存为线上客户资料。"
                      : "合同与权益服务未接通。仅保存当前账号、当前客户的本地草稿，不会激活套餐、修改线上配额或提交合同。"}
                  </p>
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
                    onClick={() => void close()}
                  >
                    取消
                  </button>
                  <button
                    className="orgv2-primary"
                    disabled={
                      busy ||
                      (editing === "create"
                        ? !canManage ||
                          !canRead ||
                          optionsLoading ||
                          !!optionsError ||
                          !organizationId
                        : !canEdit)
                    }
                  >
                    {busy
                      ? "正在保存…"
                      : editing === "entitlements"
                        ? "保存本地草稿"
                        : "保存"}
                  </button>
                </footer>
              </form>
            </div>
          </div>
        )}
        {leave && (
          <PlatformLeaveDialog
            onDecide={(allow) => {
              if (allow) {
                setName(customer?.name ?? "")
                setProfile(savedProfile)
                setEntitlements(savedEntitlements)
              }
              setLeave(false)
              settleLeave(allow)
            }}
          />
        )}
      </section>
    )
  },
)
