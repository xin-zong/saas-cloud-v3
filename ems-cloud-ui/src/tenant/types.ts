export type TenantContext = {
  actorId: number

  tenantId: number

  kind: "platform" | "enterprise"

  administrator: boolean
}

export type Client = "web" | "app"

export type MenuNode = {
  id: number

  client: Client

  kind: "directory" | "page" | "action"

  nameKey: string

  path: string | null

  permissionCode: string | null

  children: MenuNode[]
}

export type PermissionSelection = { code: string ;client: Client }

export type Row = Record<string, any>

export type PageRows = { items: Row[] ;total: number }

export type MenuRow = {
  id: number

  parent_id: number | null

  client: Client

  permission_code?: string

  configurable?: boolean

  [key: string]: any
}

export const companyTypes = [
  ["installer", "安装商"],

  ["distributor", "经销商"],

  ["service_provider", "服务商"],

  ["operator", "运营商"],
] as const

export const businessScopes = [
  ["balcony", "阳台储能"],

  ["residential", "户用储能"],

  ["commercial", "工商业储能"],

  ["utility", "大型储能"],
] as const

export const routeLabels: Record<string, string> = {
  overview: "总览",

  assets: "资产与站点",

  operations: "运营中心",

  maintenance: "运维中心",

  workorders: "工单与审批",

  analytics: "分析与报告",

  "company.profile": "企业资料",

  "company.people": "员工管理",

  "company.roles": "角色管理",

  "company.grants": "站点授权",

  "platform.approvals": "企业审批",

  "platform.companies": "企业管理",

  "platform.menus": "菜单管理",

  "platform.packages": "权限包管理",

  "platform.templates": "企业预制角色",

  "platform.people": "平台员工",

  "platform.roles": "平台角色",

  "platform.audit": "安全审计",
}
