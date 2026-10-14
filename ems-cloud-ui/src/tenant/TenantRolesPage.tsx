import { useEffect, useState } from "react"

import { send } from "@/api/client"

import { Button, PageHeader, Badge } from "@/components/ui/Workspace"

import { Field, QueryState, TenantDialog, useTenantQuery } from "./shared"

import PermissionTree from "./PermissionSelector"
import { usePermissionLabels } from './usePermissionLabels'

import type { Row, MenuRow, PermissionSelection } from "./types"

export default function TenantRolesPage() {
  const roles = useTenantQuery<Row[]>("/company/roles"),
    options = useTenantQuery<{ menus: MenuRow[] }>("/company/roles/options")

  const [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [edit, setEdit] = useState<Row | null>(null),
    [status, setStatus] = useState<Row | null>(null),
    [remove, setRemove] = useState<Row | null>(null)

  const rows = roles.data ?? []
  const { labelText } = usePermissionLabels([], rows.map(r => r.name))

  useEffect(() => {
    if (!rows.some((r) => `${r.source}:${r.id}` === selected))
      setSelected(rows[0] ? `${rows[0].source}:${rows[0].id}` : "")
  }, [roles.data])

  const role = rows.find((r) => `${r.source}:${r.id}` === selected)

  const reload = () => {
    roles.reload()

    options.reload()
  }

  return (
    <>
      <PageHeader
        title="角色管理"
        description="预制角色由平台维护并实时生效；企业可另建自定义角色。"
        actions={
          <Button
            variant="primary"
            onClick={() =>
              setEdit({ name: "", description: "", permissions: [] })
            }
          >
            新增自定义角色
          </Button>
        }
      />
      <QueryState
        loading={roles.loading || options.loading}
        error={roles.error || options.error}
      />
      <div className="tenant-split">
        <aside className="tenant-card tenant-role-list tenant-spaced-card">
          <Field label="搜索角色">
            <input
              aria-label="搜索角色"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="输入角色名称"
            />
          </Field>
          {rows
            .filter((r) => `${r.name} ${labelText(r.name)}`.toLowerCase().includes(query.toLowerCase()))
            .map((r) => (
              <Button
                key={`${r.source}:${r.id}`}
                variant={role === r ? "primary" : "default"}
                onClick={() => setSelected(`${r.source}:${r.id}`)}
              >
                {labelText(r.name)}
                <Badge>
                  {r.source === "system"
                    ? "系统身份"
                    : r.source === "template"
                      ? "预制"
                      : "自定义"}
                </Badge>
              </Button>
            ))}
        </aside>
        {role && (
          <section className="tenant-card tenant-spaced-card">
            <PageHeader
              title={labelText(role.name)}
              description={
                role.source === "system"
                  ? "受保护管理员自动覆盖本企业全部站点，不能通过普通角色授权修改。"
                  : role.source === "template"
                    ? "平台统一维护，企业只读。当前只展示套餐内权限。"
                    : `${role.member_count ?? 0} 个员工引用 · ${
                        role.enabled ? "启用" : "停用"
                      }`
              }
              actions={
                !role.readonly && (
                  <>
                    <Button onClick={() => setEdit({ ...role })}>编辑</Button>
                    <Button onClick={() => setStatus(role)}>
                      {role.enabled ? "停用" : "启用"}
                    </Button>
                    <Button
                      disabled={Number(role.member_count) > 0}
                      onClick={() => setRemove(role)}
                    >
                      删除
                    </Button>
                  </>
                )
              }
            />
            {Number(role.unavailablePermissionCount) > 0 && (
              <p className="tenant-notice">
                有 {role.unavailablePermissionCount}{" "}
                项权限因菜单或套餐调整暂不生效，原配置已保留。
              </p>
            )}
            {role.source === "system" ? (
              <p className="tenant-notice">
                系统身份权限动态跟随当前有效菜单和权限包。
              </p>
            ) : (
              <PermissionTree
                rows={options.data?.menus ?? []}
                value={role.permissions ?? []}
                onChange={() => {}}
                readonly
              />
            )}
          </section>
        )}
      </div>
      {edit && (
        <RoleEditor
          row={edit}
          menus={options.data?.menus ?? []}
          onClose={() => setEdit(null)}
          onSaved={reload}
        />
      )}{" "}
      {status && (
        <TenantDialog
          title="确认角色状态变更"
          onClose={() => setStatus(null)}
          onSave={async () => {
            await send(`/company/roles/${status.id}/status`, "PUT", {
              enabled: !status.enabled,

              confirmed: true,
            })

            reload()
          }}
        >
          <p>
            角色“{labelText(status.name)}”被 {status.member_count ?? 0}{" "}
            个员工引用。变更后权限立即重新计算。
          </p>
        </TenantDialog>
      )}
      {remove && (
        <TenantDialog
          title="删除自定义角色"
          onClose={() => setRemove(null)}
          onSave={async () => {
            await send(`/company/roles/${remove.id}`, "DELETE")

            reload()
          }}
        >
          <p>确认删除“{labelText(remove.name)}”？仍被员工引用的角色不可删除。</p>
        </TenantDialog>
      )}
    </>
  )
}

function RoleEditor({
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
    [description, setDescription] = useState(row.description ?? ""),
    [permissions, setPermissions] = useState<PermissionSelection[]>(
      row.permissions ?? [],
    )

  return (
    <TenantDialog
      title={row.id ? "编辑自定义角色" : "新增自定义角色"}
      wide
      onClose={onClose}
      onSave={async () => {
        await send(
          row.id ? `/company/roles/${row.id}` : "/company/roles",

          row.id ? "PUT" : "POST",

          { name, description, permissions },
        )

        onSaved()
      }}
    >
      <div className="tenant-form-grid">
        <Field label="角色名称 *">
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="说明">
          <input
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
      </div>
      <p className="tenant-muted">
        只可保存套餐内且自身可委派的权限。允许与预制角色同名，来源将分别显示。
      </p>
      <PermissionTree
        rows={menus}
        value={permissions}
        onChange={setPermissions}
      />
    </TenantDialog>
  )
}
