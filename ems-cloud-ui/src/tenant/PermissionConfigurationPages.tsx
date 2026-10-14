import { useEffect, useRef, useState } from "react"

import { send } from "@/api/client"

import { Button, PageHeader, Badge } from "@/components/ui/Workspace"

import {
  CheckList,
  Field,
  QueryState,
  TenantDialog,
  useTenantQuery,
  date,
} from "./shared"

import PermissionTree from "./PermissionSelector"
import { usePermissionLabels } from "./usePermissionLabels"
import { permissionNames } from "./permissionLabels"
import {menuAppliesTo} from './permissionTree'

import {
  companyTypes,
  type Row,
  type MenuRow,
  type PermissionSelection,
} from "./types"

export function PermissionPackagesPage() {
  const [query, setQuery] = useState(""),
    [type, setType] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [status, setStatus] = useState<Row | null>(null)

  const rows = useTenantQuery<Row[]>(
      `/platform/permission-packages?${new URLSearchParams({ query, type })}`,
    ),
    options = useTenantQuery<Row>("/platform/permission-options")

  const { labelText } = usePermissionLabels([], [...(rows.data ?? []).map(r => r.name), ...(options.data?.templates ?? []).map((r: Row) => r.name)])

  return (
    <>
      <PageHeader
        title="权限包"
        description="选择企业端一级菜单后，涵盖其启用后代；多个权限包按并集生效。"
        actions={
          <Button
            variant="primary"
            onClick={() =>
              setEdit({
                name: "",

                remarks: "",

                companyTypes: [],

                menuIds: [],

                templateIds: [],
              })
            }
          >
            新增权限包
          </Button>
        }
      />
      <div className="tenant-toolbar">
        <input
          placeholder="搜索权限包"
          aria-label="搜索权限包"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="权限包适用企业类型"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">全部类型</option>
          {companyTypes.map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
        <Button onClick={rows.reload}>刷新</Button>
      </div>
      <section className="tenant-card">
        <table className="tenant-table">
          <thead>
            <tr>
              {[
                "权限包",
                "适用企业类型",
                "企业预制角色",
                "关联企业",
                "状态",
                "更新时间",
                "操作",
              ].map(
                (s) => (
                  <th key={s}>{s}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.data?.map((r) => (
              <tr key={r.id}>
                <td>
                  {labelText(r.name)}
                  <small>{r.remarks}</small>
                </td>
                <td>
                  {r.companyTypes

                    ?.map(
                      (c: string) =>
                        companyTypes.find(([v]) => v === c)?.[1] ?? c,
                    )

                    .join("、")}
                </td>
                <td>
                  {(r.templateIds ?? [])
                    .map(
                      (id: number) =>
                        labelText(options.data?.templates.find((t: Row) => t.id === id)
                          ?.name ?? String(id)),
                    )
                    .join("、") || "—"}
                </td>
                <td>{r.company_count}</td>
                <td>
                  <Badge tone={r.enabled ? "success" : "neutral"}>
                    {r.enabled ? "启用" : "停用"}
                  </Badge>
                </td>
                <td>{date(r.updated_at)}</td>
                <td>
                  <Button onClick={() => setEdit(r)}>编辑</Button>
                  <Button onClick={() => setStatus(r)}>
                    {r.enabled ? "停用" : "启用"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <QueryState
          loading={rows.loading}
          error={rows.error}
          empty={!rows.data?.length}
        />
      </section>
      {edit && (
        <PackageEditor
          row={edit}
          options={options.data ?? {}}
          onClose={() => setEdit(null)}
          onSaved={rows.reload}
        />
      )}{" "}
      {status && (
        <ConfigurationStatus
          row={status}
          resource="permission-packages"
          title="权限包"
          onClose={() => setStatus(null)}
          onSaved={rows.reload}
        />
      )}
    </>
  )
}

function PackageEditor({
  row,

  options,

  onClose,

  onSaved,
}: {
  row: Row

  options: Row

  onClose: () => void

  onSaved: () => void
}) {
  const { menuLabel, clientLabel, labelText } = usePermissionLabels(options.allMenus ?? options.menus ?? [], (options.templates ?? []).map((t: Row) => t.name))
  const [form, setForm] = useState<Row>({
    ...row,

    companyTypes: row.companyTypes ?? [],

    menuIds: (row.menuIds ?? []).map(String),

    templateIds: (row.templateIds ?? []).map(String),
  })

  const set = (key: string, v: unknown) => setForm({ ...form, [key]: v })

  return (
    <TenantDialog
      title={row.id ? "编辑权限包" : "新增权限包"}
      wide
      onClose={onClose}
      onSave={async () => {
        await send(
          row.id
            ? `/platform/permission-packages/${row.id}`
            : "/platform/permission-packages",

          row.id ? "PUT" : "POST",

          {
            name: form.name,

            remarks: form.remarks,

            companyTypes: form.companyTypes,

            menuIds: form.menuIds.map(Number),

            templateIds: form.templateIds.map(Number),
          },
        )

        onSaved()
      }}
    >
      <div className="tenant-form-grid">
        <Field label="权限包名称 *">
          <input
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="备注">
          <input
            maxLength={2000}
            value={form.remarks ?? ""}
            onChange={(e) => set("remarks", e.target.value)}
          />
        </Field>
      </div>
      <CheckList
        label="适用企业类型 *"
        options={companyTypes}
        value={form.companyTypes}
        onChange={(v) => set("companyTypes", v)}
      />
      {(["web", "app"] as const).map((client) => (
        <CheckList
          key={client}
          label={`${clientLabel(client)} 一级菜单 *`}
          options={(options.allMenus ?? options.menus ?? [])

            .filter(
              (m: MenuRow) =>
                m.parent_id == null &&
                m.client === client &&
                ["enterprise", "both"].includes(m.applicable_side),
            )

            .map(
              (m: MenuRow) =>
                [
                  String(m.id),

                  `${menuLabel(m)}${m.enabled ? "" : "（已停用）"}`,
                ] as const,
            )}
          value={form.menuIds}
          onChange={(v) =>
            set("menuIds", [
              ...form.menuIds.filter(
                (id: string) =>
                  !(options.allMenus ?? options.menus ?? []).some(
                    (m: MenuRow) => String(m.id) === id && m.client === client,
                  ),
              ),

              ...v.filter((id) =>
                (options.allMenus ?? options.menus ?? []).some(
                  (m: MenuRow) => String(m.id) === id && m.client === client,
                ),
              ),
            ])
          }
        />
      ))}
      <CheckList
        label="可分配的预制角色"
        options={(options.templates ?? []).map(
          (t: Row) =>
            [
              String(t.id),

              `${labelText(t.name)}${t.enabled ? "" : "（已停用）"}`,
            ] as const,
        )}
        value={form.templateIds}
        onChange={(v) => set("templateIds", v)}
      />
      <p className="tenant-notice">
        修改已被企业引用的包会立即重新计算员工能力。停用一个包不会抵消其他有效包提供的权限。
      </p>
    </TenantDialog>
  )
}

export function RoleTemplatesPage() {
  const list = useTenantQuery<Row[]>("/platform/role-templates"),
    options = useTenantQuery<Row>("/platform/permission-options")

  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [edit, setEdit] = useState<Row | null>(null),
    [status, setStatus] = useState<Row | null>(null)

  const rows = list.data ?? []
  const { labelText } = usePermissionLabels([], rows.map(r => r.name))
  const role = rows.find((r) => r.id === selected) ?? rows[0]

  const menus: MenuRow[] = (
    options.data?.allMenus ??
    options.data?.menus ??
    []
  ).filter((m: MenuRow) => {
    let n = m
    while (n.parent_id != null) {
      const parent = (options.data?.allMenus ?? options.data?.menus ?? []).find(
        (p: MenuRow) => p.id === n.parent_id,
      )
      if (!parent) return false
      n = parent
    }
    return ["enterprise", "both"].includes(n.applicable_side)
  })

  return (
    <>
      <PageHeader
        title="企业预制角色"
        description="平台统一维护，企业只读；权限变更实时生效，员工仍受企业套餐与站点授权约束。"
      />
      <QueryState
        loading={list.loading || options.loading}
        error={list.error || options.error}
        empty={!rows.length}
      />
      <div className="tenant-split">
        <aside className="tenant-card tenant-role-list tenant-spaced-card">
          <Field label="搜索角色">
            <input
              aria-label="搜索预制角色"
              placeholder="输入角色名称"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Field>
          {rows
            .filter((r) => `${r.name} ${labelText(r.name)}`.toLowerCase().includes(query.toLowerCase()))
            .map((r) => (
              <Button
                key={r.id}
                variant={role?.id === r.id ? "primary" : "default"}
                onClick={() => setSelected(r.id)}
              >
                {labelText(r.name)}
              </Button>
            ))}
          <Button onClick={() => setEdit({ name: "", permissions: [] })}>
            ＋ 新增角色
          </Button>
        </aside>
        {role && (
          <section className="tenant-card tenant-spaced-card">
            <PageHeader
              title={labelText(role.name)}
              description={`修改时间：${date(role.updated_at)}`}
              actions={
                <>
                  <Badge>{role.enabled ? "启用" : "停用"}</Badge>
                  <Button onClick={() => setStatus(role)}>
                    {role.enabled ? "停用" : "启用"}
                  </Button>
                  <Button onClick={() => setEdit(role)}>编辑权限</Button>
                </>
              }
            />
            <PermissionTree
              rows={menus}
              value={role.permissions ?? []}
              onChange={() => {}}
              readonly
            />
          </section>
        )}
      </div>
      {edit && (
        <TemplateEditor
          row={edit}
          menus={menus}
          onClose={() => setEdit(null)}
          onSaved={list.reload}
        />
      )}
      {status && (
        <ConfigurationStatus
          row={status}
          resource="role-templates"
          title="预制角色"
          onClose={() => setStatus(null)}
          onSaved={list.reload}
        />
      )}
    </>
  )
}

function TemplateEditor({
  row,

  menus,

  onClose,

  onSaved,
}: {
  row: Row

  menus: MenuRow[]

  onClose: () => void

  onSaved: () => void
}) {
  const [name, setName] = useState(row.name),
    [permissions, setPermissions] = useState<PermissionSelection[]>(
      row.permissions,
    )

  function enterprise(m: MenuRow): boolean {
    let node = m

    while (node.parent_id != null) {
      const parent = menus.find((p) => p.id === node.parent_id)

      if (!parent) return false

      node = parent
    }

    return ["enterprise", "both"].includes(node.applicable_side ?? node.side)
  }

  return (
    <TenantDialog
      title="预制角色权限"
      wide
      onClose={onClose}
      onSave={async () => {
        await send(
          row.id
            ? `/platform/role-templates/${row.id}`
            : "/platform/role-templates",

          row.id ? "PUT" : "POST",

          { name, permissions },
        )

        onSaved()
      }}
    >
      <Field label="角色名称">
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <p className="tenant-notice">
        保存后所有引用企业即时更新。企业员工仍受本企业权限包、站点范围和授权有效期限制。
      </p>
      <PermissionTree
        rows={menus.filter(enterprise)}
        value={permissions}
        onChange={setPermissions}
      />
    </TenantDialog>
  )
}

export function MenuManagementPage() {
  const [side,setSide]=useState<''|'enterprise'|'platform'>('')
  const list = useTenantQuery<MenuRow[]>("/platform/menus"),
    options = useTenantQuery<Row>("/platform/permission-options")

  const [client, setClient] = useState<"web" | "app">("web"),
    [query, setQuery] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [status, setStatus] = useState<Row | null>(null),
    [remove, setRemove] = useState<MenuRow | null>(null),
    [collapsed, setCollapsed] = useState<Set<number>>(new Set()),
    [error, setError] = useState("")

  const rows = list.data ?? []
  const { menuLabel, clientLabel } = usePermissionLabels(rows)
  const initialized = useRef(false)
  useEffect(() => {
    if (!list.data || initialized.current) return
    initialized.current = true
    setCollapsed(new Set(list.data.filter(row => row.parent_id == null && row.name_key !== "nav.assets").map(row => row.id)))
  }, [list.data])


  const children = (parent: number | null) =>
    rows.filter((r) => r.client === client && r.parent_id === parent)

  const matches = (r: MenuRow): boolean =>
    !query ||
    `${menuLabel(r)} ${r.permission_code ?? ""}`
      .toLowerCase()
      .includes(query.toLowerCase()) ||
    children(r.id).some(matches)

  function add(parent: MenuRow | null) {
    setEdit({
      client,
      kind: parent ? "page" : "directory",
      name_key: "",
      parent_id: parent?.id ?? null,
      applicable_side: parent ? null : "enterprise",
      sort_order: children(parent?.id ?? null).length,
      remarks: "",
    })
  }

  async function move(row: MenuRow, delta: number) {
    const siblings = children(row.parent_id),
      index = siblings.findIndex((r) => r.id === row.id)

    if (!siblings[index + delta]) return
    ;[siblings[index], siblings[index + delta]] = [
      siblings[index + delta],
      siblings[index],
    ]

    try {
      await send("/platform/menus/order", "PUT", {
        ids: siblings.map((r) => r.id),
      })
      list.reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function branch(parent: number | null, depth = 0): React.ReactNode[] {
    return children(parent)
      .filter(r=>(!side||menuAppliesTo(rows,r,side))&&matches(r))
      .flatMap((r, index) => {
        const hasChildren = children(r.id).length > 0,
          open = !!query || !collapsed.has(r.id),
          siblings = children(parent)

        return [
          <tr key={r.id}>
            <td>
              <span
                className="tenant-menu-name"
                style={{ paddingLeft: depth * 20 }}
              >
                {hasChildren ? (
                  <button
                    className="tenant-tree-toggle"
                    aria-label={`${open ? "收起" : "展开"}${menuLabel(r)}`}
                    aria-expanded={open}
                    onClick={() =>
                      setCollapsed((prev) => {
                        const next = new Set(prev)
                        next.has(r.id) ? next.delete(r.id) : next.add(r.id)
                        return next
                      })
                    }
                  >
                    {open ? "⌄" : "›"}
                  </button>
                ) : (
                  <span style={{ width: 20 }} />
                )}
                {menuLabel(r)}
              </span>
            </td>
            <td>
              {
                ({
                  directory: "目录",
                  page: "页面",
                  action: "按钮",
                } as Record<string, string>)[r.kind]
              }
            </td>
            <td>
              <Button
                variant="ghost"
                role="switch"
                aria-checked={r.enabled}
                onClick={() => setStatus(r)}
              >
                {r.enabled ? "启用" : "停用"}
              </Button>
            </td>
            <td>{date(r.created_at)}</td>
            <td>{date(r.updated_at)}</td>
            <td>
              {r.remarks ||
                r.route_path ||
                r.permission_code ||
                ({
                  enterprise: "企业端",
                  platform: "平台端",
                  both: "两端",
                } as Record<string, string>)[r.applicable_side] ||
                "—"}
            </td>
            <td>
              <Button onClick={() => setEdit(r)}>编辑</Button>
              {r.kind !== "action" && depth < 3 && (
                <Button onClick={() => add(r)}>添加下级</Button>
              )}
              <Button
                disabled={!r.can_delete}
                title={
                  r.can_delete ? "删除菜单" : "存在子菜单、权限包或角色引用"
                }
                onClick={() => setRemove(r)}
              >
                删除
              </Button>
            </td>
            <td>
              <Button
                title="上移"
                disabled={siblings[0]?.id === r.id}
                onClick={() => move(r, -1)}
              >
                ↑
              </Button>
              <Button
                title="下移"
                disabled={siblings.at(-1)?.id === r.id}
                onClick={() => move(r, 1)}
              >
                ↓
              </Button>
            </td>
          </tr>,
          ...(open ? branch(r.id, depth + 1) : []),
        ]
      })
  }

  return (
    <>
      <PageHeader
        title="菜单管理"
        description="定义 EMS 平台菜单与操作权限。按钮只能作为叶子节点，最多四级。"
      />
      <div className="tenant-toolbar">
        <select aria-label="菜单适用端" value={side} onChange={e=>setSide(e.target.value as ''|'enterprise'|'platform')}><option value="">全部适用端</option><option value="enterprise">企业端</option><option value="platform">平台运维端</option></select>
        <nav className="tenant-tabs" style={{ margin: 0 }}>
          {(["web", "app"] as const).map((c) => (
            <Button
              key={c}
              aria-selected={client === c}
              onClick={() => setClient(c)}
            >
              <span translate="no">{clientLabel(c)}</span>
            </Button>
          ))}
        </nav>
        <input
          aria-label="搜索菜单"
          placeholder="搜索菜单名称 / 权限编码"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button variant="primary" onClick={() => add(null)}>
          新增一级菜单
        </Button>
      </div>
      <section className="tenant-card">
        {error && <p role="alert">{error}</p>}
        <table className="tenant-table tenant-menu-table">
          <thead>
            <tr>
              {[
                "菜单名称",
                "类型",
                "状态",
                "创建时间",
                "更新时间",
                "备注",
                "菜单操作",
                "排序",
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>{branch(null)}</tbody>
        </table>
        <QueryState
          loading={list.loading}
          error={list.error}
          empty={!rows.some((r) => r.client === client && matches(r))}
        />
      </section>
      <p className="tenant-muted">
        有子菜单或被权限包、角色引用时不可删除；可停用或先处理关联。排序仅调整同级菜单。
      </p>
      {edit && (
        <MenuEditor
          row={edit}
          menus={rows}
          options={options.data ?? {}}
          onClose={() => setEdit(null)}
          onSaved={list.reload}
        />
      )}
      {status && (
        <ConfigurationStatus
          row={status}
          resource="menus"
          title="菜单"
          onClose={() => setStatus(null)}
          onSaved={list.reload}
        />
      )}
      {remove && (
        <TenantDialog
          title="删除菜单"
          saveLabel="删除"
          onClose={() => setRemove(null)}
          onSave={async () => {
            await send(`/platform/menus/${remove.id}`, "DELETE")
            list.reload()
          }}
        >
          <p>
            确定删除“{menuLabel(remove)}”？删除后该菜单及其权限入口将被移除。
          </p>
        </TenantDialog>
      )}
    </>
  )
}

function MenuEditor({
  row,

  menus,

  options,

  onClose,

  onSaved,
}: {
  row: Row

  menus: MenuRow[]

  options: Row

  onClose: () => void

  onSaved: () => void
}) {
  const { menuLabel, permissionLabel } = usePermissionLabels(menus, (options.permissions ?? []).map((p: Row) => permissionNames[p.code]?.[0] ?? p.name))
  const [form, setForm] = useState({ ...row })

  const set = (key: string, v: unknown) => setForm({ ...form, [key]: v })

  return (
    <TenantDialog
      title={
        row.id ? "编辑菜单" : row.parent_id ? "添加下级菜单" : "新增一级菜单"
      }
      onClose={onClose}
      onSave={async () => {
        await send(
          row.id ? `/platform/menus/${row.id}` : "/platform/menus",

          row.id ? "PUT" : "POST",

          {
            parentId: form.parent_id,

            client: form.client,

            kind: form.kind,

            nameKey: form.name_key,

            routePath: form.kind === "page" ? form.route_path : null,

            permissionCode:
              form.kind === "directory" ? null : form.permission_code,

            applicableSide:
              form.parent_id == null ? form.applicable_side : null,

            sortOrder: Number(form.sort_order),

            remarks: form.remarks,
          },
        )

        onSaved()
      }}
    >
      <div className="tenant-form-grid">
        <Field label="菜单名称 *">
          <input
            required
            maxLength={120}
            value={form.name_key}
            onChange={(e) => set("name_key", e.target.value)}
          />
        </Field>
        <Field label="节点类型">
          <select
            value={form.kind}
            onChange={(e) => set("kind", e.target.value)}
          >
            <option value="directory">目录</option>
            <option value="page">页面</option>
            <option value="action">操作</option>
          </select>
        </Field>
        <Field label="父菜单">
          <select
            value={form.parent_id ?? ""}
            onChange={(e) =>
              set("parent_id", e.target.value ? Number(e.target.value) : null)
            }
          >
            <option value="">一级菜单</option>
            {menus

              .filter(
                (m) =>
                  m.client === form.client &&
                  m.id !== form.id &&
                  m.kind !== "action",
              )

              .map((m) => (
                <option key={m.id} value={m.id}>
                  {menuLabel(m)}
                </option>
              ))}
          </select>
        </Field>
        {form.parent_id == null && (
          <Field label="适用端">
            <select
              value={form.applicable_side ?? "enterprise"}
              onChange={(e) => set("applicable_side", e.target.value)}
            >
              <option value="enterprise">企业端</option>
              <option value="platform">平台端</option>
              <option value="both">两端</option>
            </select>
          </Field>
        )}
        {form.kind === "page" && (
          <Field label="已实现页面路由 *">
            <select
              required
              value={form.route_path ?? ""}
              onChange={(e) => set("route_path", e.target.value)}
            >
              <option value="">选择页面</option>
              {options.routes?.map((r: string) => (
                <option key={r} value={r}>
                  {menuLabel({ id: 0, parent_id: null, client: 'web', route_path: r, name_key: `page.${r}` })}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.kind !== "directory" && (
          <Field label="已实现操作权限 *">
            <select
              required
              value={form.permission_code ?? ""}
              onChange={(e) => set("permission_code", e.target.value)}
            >
              <option value="">选择权限</option>
              {options.permissions?.map((p: Row) => (
                <option key={p.code} value={p.code}>
                  {permissionLabel(p.code, p.name)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="同级排序">
          <input
            required
            type="number"
            min={0}
            value={form.sort_order}
            onChange={(e) => set("sort_order", e.target.value)}
          />
        </Field>
        <Field label="备注" wide>
          <textarea
            maxLength={2000}
            value={form.remarks ?? ""}
            onChange={(e) => set("remarks", e.target.value)}
          />
        </Field>
      </div>
    </TenantDialog>
  )
}

function ConfigurationStatus({
  row,

  resource,

  title,

  onClose,

  onSaved,
}: {
  row: Row

  resource: string

  title: string

  onClose: () => void

  onSaved: () => void
}) {
  const impact = useTenantQuery<Row>(`/platform/${resource}/${row.id}/impact`)

  return (
    <TenantDialog
      title={`确认${row.enabled ? "停用" : "启用"}${title}`}
      onClose={onClose}
      onSave={async () => {
        if (!impact.data) throw new Error("正在读取影响范围，请稍候")

        await send(`/platform/${resource}/${row.id}/status`, "PUT", {
          enabled: !row.enabled,

          confirmed: true,
        })

        onSaved()
      }}
    >
      <QueryState loading={impact.loading} error={impact.error} />
      <p>变更对象：{row.name ?? row.name_key}</p>
      {Object.entries(impact.data ?? {}).map(([key, n]) => (
        <p key={key}>
          {key === "referencingMembers" ? "引用员工数" : "关联企业数"}：
          {String(n)}
        </p>
      ))}
      <p className="tenant-notice">
        变更提交后立即生效；已有角色配置保留，资源查询、下载和实时订阅按新能力重新校验。
      </p>
    </TenantDialog>
  )
}
