import { api, send } from "@/api/client"

export type PermissionItem = {
  code: string
  name: string
  module: string
  scope: string
  origin: string
  available: boolean
  configurable: boolean
  reason: string | null
}

export type BusinessRole = {
  id: number
  code: string
  name: string
  description: string
  organizationId: number
  permissionCodes: string[]
  memberCount: number
  canEdit: boolean
  canDelete: boolean
  canAssign: boolean
  reason: string | null
}

export type MemberGrant = {
  id: number
  roleId: number | null
  roleName: string | null
  stationIds: number[]
  validFrom: string | null
  validUntil: string | null
  source: string | null
  status: string
  term: string | null
  canEdit: boolean
  canRevoke: boolean
  canExpand: boolean
  scopeRestricted: boolean
  periodChangeRequired: boolean
  reason: string | null
  permissionCodes: string[]
  rolePermissions: Omit<PermissionItem, "configurable">[]
  stations: { id: number; name: string }[]
}

export type PlatformOrganization = { id: number; name: string; parent_id: number | null }

const query = (params: Record<string, string | number>) => new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString()

export const platformApi = {
  roleOrganizations: (signal?: AbortSignal) => api<PlatformOrganization[]>("/platform/organizations?purpose=roles", { signal }),
  grantOrganizations: (signal?: AbortSignal) => api<PlatformOrganization[]>("/platform/organizations?purpose=grants", { signal }),
  permissions: (organizationId: number, signal?: AbortSignal) => api<PermissionItem[]>(`/platform/permissions?${query({ organizationId })}`, { signal }),
  roles: (organizationId: number, purpose: "manage" | "assign" = "manage", signal?: AbortSignal) => api<BusinessRole[]>(`/platform/roles?${query({ purpose, organizationId })}`, { signal }),
  createRole: (name: string, description: string, organizationId: number) => send<BusinessRole>("/platform/roles", "POST", { name, description, organizationId }),
  updateRole: (id: number, name: string, description: string) => send<BusinessRole>(`/platform/roles/${id}`, "PUT", { name, description }),
  saveRolePermissions: (id: number, permissionCodes: string[]) => send<BusinessRole>(`/platform/roles/${id}/permissions`, "PUT", { permissionCodes }),
  deleteRole: (id: number) => send<null>(`/platform/roles/${id}`, "DELETE"),
  memberGrants: (memberId: number, signal?: AbortSignal) => api<MemberGrant[]>(`/members/${memberId}/grants`, { signal }),
}
