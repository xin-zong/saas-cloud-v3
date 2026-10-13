import { useEffect, useRef, useState } from "react"

import type { MenuRow, PermissionSelection, Client } from "./types"

import { routeLabels } from "./types"

import { descendantPermissions, selectionState } from "./permissionTree"

import { Button } from "@/components/ui/Workspace"

export function menuLabel(row: MenuRow) {
  return (
    row.name ??
    (row.name_key && !/^(nav|page|action)\./.test(row.name_key) ? row.name_key : undefined) ??
    routeLabels[row.route_path] ??
    routeLabels[String(row.name_key ?? "").replace(/^(nav|page)\./, "")] ??
    row.permission_name ??
    row.permission_code ??
    row.name_key
  )
}

export default function PermissionTree({
  rows,

  value,

  onChange,

  readonly = false,
}: {
  rows: MenuRow[]

  value: PermissionSelection[]

  onChange: (v: PermissionSelection[]) => void

  readonly?: boolean
}) {
  const [client, setClient] = useState<Client>("web")

  function node(row: MenuRow) {
    const desired = descendantPermissions(rows, row.id, client),
      state = selectionState(value, desired)

    const children = rows.filter(
      (r) => r.parent_id === row.id && r.client === client,
    )

    const set = (checked: boolean) => {
      const remaining = value.filter(
        (p) => !desired.some((d) => d.code === p.code && d.client === p.client),
      )

      onChange(checked ? [...remaining, ...desired] : remaining)
    }

    return (
      <section key={row.id} className="tenant-permission">
        <label>
          <MixedCheckbox
            checked={state === "all"}
            mixed={state === "partial"}
            disabled={readonly || !desired.length || row.configurable === false}
            onChange={set}
          />
          <span>{menuLabel(row)}</span>
          {row.configurable === false && (
            <small className="tenant-muted">超出可委派范围</small>
          )}
        </label>
        {children.length > 0 && (
          <div className="tenant-permission-children">{children.map(node)}</div>
        )}
      </section>
    )
  }

  return (
    <>
      <nav className="tenant-tabs" aria-label="权限客户端">
        {(["web", "app"] as const).map((c) => (
          <Button
            key={c}
            aria-selected={client === c}
            onClick={() => setClient(c)}
          >
            {c === "web" ? "Web 网页" : "App 应用"}
          </Button>
        ))}
      </nav>
      {rows.filter((r) => r.parent_id == null && r.client === client).map(node)}
      {!rows.some((r) => r.client === client) && (
        <p className="tenant-empty">该客户端暂无可配置菜单</p>
      )}
    </>
  )
}

function MixedCheckbox({
  mixed,

  checked,

  disabled,

  onChange,
}: {
  mixed: boolean

  checked: boolean

  disabled: boolean

  onChange: (v: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed
  }, [mixed])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}
