type Identity = {
  id: string
  name: string
  role: string
  tenant?: { tenantId?: number }
  permissions: string[]
  stationPermissions?: Record<string, string[]>
}
type Site = {
  id: string
  name: string
}
export function acceptAgentMessage(
  event: Pick<MessageEvent, "origin" | "source" | "data">,
  target: {
    origin: string
    source: MessageEventSource | null
    channel: string
  },
) {
  return (
    event.origin === target.origin &&
    event.source === target.source &&
    !!event.data &&
    event.data.channel === target.channel &&
    ["ems-agent:ready", "ems-agent:close"].includes(event.data.type)
  )
}
export function agentContext(
  user: Identity,
  stations: Site[],
  activeNav: string,
  stationId: string | null,
  language: string,
) {
  const sites = stations
    .filter((site) =>
      user.stationPermissions?.[String(site.id)]?.includes("asset.read"),
    )
    .map((site) => ({
      site_id: String(site.id),
      stationId: String(site.id),
      stationName: site.name,
      display_name: site.name,
    }))
  const current = sites.some((site) => site.site_id === stationId)
    ? stationId
    : undefined
  return {
    user: {
      id: `${user.tenant?.tenantId ?? "local"}:${user.id}`,
      name: user.name,
      roles: [user.role],
      permissions: [...user.permissions],
      language,
    },
    sites,
    route: {
      path: "/workspace",
      name: activeNav,
      fullPath: "/workspace",
      query: current ? { stationId: current } : {},
    },
  }
}
