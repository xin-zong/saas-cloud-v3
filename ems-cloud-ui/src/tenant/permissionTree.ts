import type { MenuRow, MenuNode, PermissionSelection, Client } from "./types"

export function menuRoutes(nodes: MenuNode[]): string[] {
  return nodes.flatMap((n) => [
    ...(n.path ? [n.path] : []),

    ...menuRoutes(n.children ?? []),
  ])
}

export function descendantPermissions(
  rows: MenuRow[],

  id: number,

  client: Client,
): PermissionSelection[] {
  const selected = new Map<string, PermissionSelection>()

  const visit = (id: number) => {
    const row = rows.find((r) => r.id === id && r.client === client)

    if (!row) return

    if (row.permission_code && row.configurable !== false)
      selected.set(row.permission_code, { code: row.permission_code, client })

    rows

      .filter((r) => r.parent_id === id && r.client === client)

      .forEach((r) => visit(r.id))
  }

  visit(id)

  return [...selected.values()]
}

export function selectionState(
  selected: PermissionSelection[],

  desired: PermissionSelection[],
) {
  const count = desired.filter((p) =>
    selected.some((s) => s.code === p.code && s.client === p.client),
  ).length

  return count === 0 ? "none" : count === desired.length ? "all" : "partial"
}
