import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import {
  Check,
  ChevronDown,
  Download,
  FileSearch,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react"
import type { Station } from "@/App"
import { dateRangeEndingAt, stationsDataNow } from "@/data/dataClock"
import { operationsDate } from "@/data/operations"
import OrganizationPermissions from "./OrganizationPermissions"
import ApiPlatformManagement from "./ApiPlatformManagement"
import { DEMO_MODE } from "@/api/client"
import "./platform-management.css"

type PlatformTab = "客户管理" | "组织权限" | "安全审计"
type CustomerStatus = "正常" | "配额预警" | "试用中" | "即将到期"
type StatusFilter = "全部" | CustomerStatus
type PermissionTab = "组织与成员" | "角色权限" | "临时授权" | "审批规则"
type DialogKind = "customer-create" | "customer-edit" | "entitlements-edit" | "org-create" | "org-edit" | "org-delete" | "member-create" | "member-edit" | "member-preview" | "role-create" | "role-edit" | "grant-create" | "grant-revoke" | "rule-create" | "rule-edit" | "policy-edit" | null
type PermissionValue = "允许" | "无" | "需审批"
type TemporaryGrantStatus = "生效中" | "待复核" | "已到期"
type GrantStatusFilter = "全部" | TemporaryGrantStatus
type ApprovalBusinessFilter = "全部" | "策略下发" | "工单验收" | "临时授权"
type AuditTab = "审计日志" | "安全策略"
type AuditDateRange = string
type AuditOperationType = "权限变更" | "报告导出" | "策略下发" | "账号安全"
type AuditOperationFilter = "全部" | AuditOperationType
type AuditResult = "成功" | "拒绝" | "失败"
type AuditResultFilter = "全部" | AuditResult

type Customer = {
  id: string
  name: string
  industry: string
  sites: number
  expiry: string
  status: CustomerStatus
  tenantId: string
  entity: string
  contact: string
  region: string
  contractId: string
  contractRange: string
  plan: string
  siteQuota: string
  accountQuota: string
  apiUsage: string
  sla: string
}

type OrgNode = {
  id: string
  name: string
  level: number
}

type OrgMember = {
  id: string
  name: string
  account: string
  source: string
  role: string
  scope: string
  status: "启用" | "停用"
  orgId: string
  orgPath: string
  temporaryAccess: string
}

type RolePermissionRow = {
  module: string
  view: PermissionValue
  edit: PermissionValue
  execute: PermissionValue
  approve: PermissionValue
}

type RolePermission = {
  id: string
  name: string
  members: number
  status: "启用" | "停用"
  rows: RolePermissionRow[]
  scopeStrategy: string
  scopeExample: string
  highRiskPolicy: string
}

type TemporaryGrant = {
  id: string
  grantee: string
  customer: string
  assetScope: string
  content: string
  validRange: string
  validUntil: string
  status: TemporaryGrantStatus
  allowedActions: string
  controlLimit: string
  authorizer: string
  reason: string
}

type ApprovalRule = {
  id: string
  name: string
  businessType: ApprovalBusinessFilter
  scope: string
  approver: string
  status: "启用" | "停用"
  flow: string[]
  approvalMethod: string
  samePersonRule: string
  rejectPolicy: string
}

type AuditLog = {
  id: string
  time: string
  operator: string
  role: string
  operationType: AuditOperationType
  content: string
  object: string
  tenant: string
  result: AuditResult
  source: string
  requestId: string
  detail: string
}

type PolicyCard = {
  id: string
  section: "登录与会话" | "审计与敏感操作"
  title: string
  rows: Array<[string, string]>
}

const TABS: PlatformTab[] = ["客户管理", "组织权限", "安全审计"]
const PERMISSION_TABS: PermissionTab[] = [
  "组织与成员",
  "角色权限",
  "临时授权",
  "审批规则",
]
const AUDIT_TABS: AuditTab[] = ["审计日志", "安全策略"]
const STATUS_OPTIONS: StatusFilter[] = [
  "全部",
  "正常",
  "配额预警",
  "试用中",
  "即将到期",
]
const GRANT_STATUS_OPTIONS: GrantStatusFilter[] = [
  "全部",
  "生效中",
  "待复核",
  "已到期",
]
const APPROVAL_BUSINESS_OPTIONS: ApprovalBusinessFilter[] = [
  "全部",
  "策略下发",
  "工单验收",
  "临时授权",
]
const AUDIT_OPERATION_OPTIONS: AuditOperationFilter[] = [
  "全部",
  "权限变更",
  "报告导出",
  "策略下发",
  "账号安全",
]
const AUDIT_RESULT_OPTIONS: AuditResultFilter[] = [
  "全部",
  "成功",
  "拒绝",
  "失败",
]
const PERMISSION_VALUES: PermissionValue[] = ["允许", "需审批", "无"]
const DEFAULT_PERMISSION_MODULES = [
  "资产与站点",
  "运行策略",
  "设备告警",
  "工单与审批",
  "平台管理",
]

const DEFAULT_ROLE_ROWS: RolePermissionRow[] = DEFAULT_PERMISSION_MODULES.map(
  (module) => ({
    module,
    view: "允许",
    edit: "无",
    execute: "无",
    approve: "无",
  }),
)

const MEMBER_ORG_OPTIONS = [
  { label: "华东运营中心 / 运营部", orgId: "east" },
  { label: "华东运营中心 / 运维部", orgId: "east" },
  { label: "客户服务部", orgId: "support" },
  { label: "外部服务商 / 华东协作", orgId: "vendor" },
]

const MEMBER_ROLE_OPTIONS = [
  "运营负责人",
  "运维工程师",
  "审计员",
  "客户成功",
  "外部服务商",
]

const ORG_NODES: OrgNode[] = [
  { id: "platform", name: "Enerlution 平台", level: 0 },
  { id: "east", name: "华东运营中心", level: 0 },
  { id: "operations", name: "运营部", level: 1 },
  { id: "maintenance", name: "运维部", level: 1 },
  { id: "support", name: "客户服务部", level: 0 },
  { id: "vendor", name: "外部服务商", level: 0 },
]

const ORG_MEMBERS: OrgMember[] = [
  {
    id: "user-wk",
    name: "王凯",
    account: "admin.wang",
    source: "本地账号",
    role: "运营负责人",
    scope: "华东站群",
    status: "启用",
    orgId: "east",
    orgPath: "华东运营中心 / 运营部",
    temporaryAccess: "无",
  },
  {
    id: "user-cm",
    name: "陈明",
    account: "chen.om",
    source: "企业 SSO",
    role: "运维工程师",
    scope: "交付包站点",
    status: "启用",
    orgId: "east",
    orgPath: "华东运营中心 / 运维部",
    temporaryAccess: "无",
  },
  {
    id: "user-lm",
    name: "刘敏",
    account: "admin.liu",
    source: "企业 SSO",
    role: "审计员",
    scope: "全租户",
    status: "启用",
    orgId: "east",
    orgPath: "华东运营中心",
    temporaryAccess: "至 2026-10-31",
  },
  {
    id: "user-vendor-07",
    name: "服务商07",
    account: "vendor.07",
    source: "临时授权",
    role: "外部服务商",
    scope: "海宁站",
    status: "启用",
    orgId: "east",
    orgPath: "外部服务商 / 华东协作",
    temporaryAccess: "交付包授权到期",
  },
  {
    id: "user-ls",
    name: "李珊",
    account: "support.li",
    source: "本地账号",
    role: "客户成功",
    scope: "华东客户",
    status: "启用",
    orgId: "support",
    orgPath: "客户服务部",
    temporaryAccess: "无",
  },
]

const ROLE_PERMISSIONS: RolePermission[] = [
  {
    id: "role-admin",
    name: "平台管理员",
    members: 3,
    status: "启用",
    scopeStrategy: "全平台授权",
    scopeExample: "Enerlution 平台 · 全租户 · 全部资产",
    highRiskPolicy: "高风险操作需二次身份验证",
    rows: [
      {
        module: "资产与站点",
        view: "允许",
        edit: "允许",
        execute: "允许",
        approve: "允许",
      },
      {
        module: "运行策略",
        view: "允许",
        edit: "允许",
        execute: "允许",
        approve: "允许",
      },
      {
        module: "运营收益",
        view: "允许",
        edit: "允许",
        execute: "允许",
        approve: "允许",
      },
      {
        module: "工单与审批",
        view: "允许",
        edit: "允许",
        execute: "允许",
        approve: "允许",
      },
      {
        module: "平台管理",
        view: "允许",
        edit: "允许",
        execute: "允许",
        approve: "允许",
      },
    ],
  },
  {
    id: "role-ops",
    name: "运营负责人",
    members: 12,
    status: "启用",
    scopeStrategy: "按成员分别授权",
    scopeExample: "王凯 · 交付包站群 · 当前站点",
    highRiskPolicy: "策略下发需独立授权及审批",
    rows: [
      {
        module: "资产与站点",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "运行策略",
        view: "允许",
        edit: "允许",
        execute: "需审批",
        approve: "无",
      },
      {
        module: "运营收益",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "工单与审批",
        view: "允许",
        edit: "允许",
        execute: "允许",
        approve: "允许",
      },
      {
        module: "平台管理",
        view: "无",
        edit: "无",
        execute: "无",
        approve: "无",
      },
    ],
  },
  {
    id: "role-maintenance",
    name: "运维工程师",
    members: 28,
    status: "启用",
    scopeStrategy: "按站点授权",
    scopeExample: "陈明 · 交付包站点 · 设备与告警",
    highRiskPolicy: "远程控制需要运营负责人复核",
    rows: [
      {
        module: "资产与站点",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "运行策略",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "设备告警",
        view: "允许",
        edit: "允许",
        execute: "允许",
        approve: "无",
      },
      {
        module: "工单与审批",
        view: "允许",
        edit: "允许",
        execute: "允许",
        approve: "无",
      },
      {
        module: "平台管理",
        view: "无",
        edit: "无",
        execute: "无",
        approve: "无",
      },
    ],
  },
  {
    id: "role-auditor",
    name: "审计员",
    members: 4,
    status: "启用",
    scopeStrategy: "只读全租户",
    scopeExample: "刘敏 · 全租户 · 日志与合同",
    highRiskPolicy: "不允许生产控制与权限变更",
    rows: [
      {
        module: "资产与站点",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "运营收益",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "工单与审批",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "安全审计",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "平台管理",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
    ],
  },
  {
    id: "role-vendor",
    name: "外部服务商",
    members: 8,
    status: "启用",
    scopeStrategy: "临时授权",
    scopeExample: "服务商07 · 海宁站 · PCS-02",
    highRiskPolicy: "不包含远程控制、策略下发及固件升级",
    rows: [
      {
        module: "资产与站点",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "设备告警",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "历史告警",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "工单与审批",
        view: "允许",
        edit: "无",
        execute: "无",
        approve: "无",
      },
      {
        module: "平台管理",
        view: "无",
        edit: "无",
        execute: "无",
        approve: "无",
      },
    ],
  },
]

const TEMPORARY_GRANTS: TemporaryGrant[] = [
  {
    id: "grant-vendor-07",
    grantee: "服务商07",
    customer: "海创工业",
    assetScope: "海宁站 · PCS-02",
    content: "查看设备与告警",
    validRange: "2026-09-10 09:00 — 2026-09-11 18:00",
    validUntil: "2026-09-11 18:00",
    status: "生效中",
    allowedActions: "设备数据查看、历史告警查看",
    controlLimit: "不包含远程控制、策略下发及固件升级",
    authorizer: "陈明",
    reason: "PCS故障远程排查",
  },
  {
    id: "grant-zhang",
    grantee: "张工",
    customer: "华东能源",
    assetScope: "华东站群",
    content: "查看运行数据",
    validRange: "2026-09-12 08:00 — 2026-09-12 18:00",
    validUntil: "2026-09-12 18:00",
    status: "生效中",
    allowedActions: "运行数据查看、工单协同",
    controlLimit: "不可导出客户报表，不可修改策略",
    authorizer: "王凯",
    reason: "现场巡检支持",
  },
  {
    id: "grant-vendor-03",
    grantee: "服务商03",
    customer: "南港园区",
    assetScope: "南港站 · BMS-01",
    content: "查看设备与告警",
    validRange: "2026-09-08 09:00 — 2026-09-09 18:00",
    validUntil: "2026-09-09 18:00",
    status: "已到期",
    allowedActions: "设备数据查看、历史告警查看",
    controlLimit: "到期自动回收",
    authorizer: "李珊",
    reason: "电池簇巡检复核",
  },
]

const APPROVAL_RULES: ApprovalRule[] = [
  {
    id: "rule-strategy",
    name: "运行策略下发审核",
    businessType: "策略下发",
    scope: "华东站群",
    approver: "运营负责人 → 安全负责人",
    status: "启用",
    flow: ["提交人", "运营负责人", "安全负责人", "审批通过"],
    approvalMethod: "逐级审批",
    samePersonRule: "提交人与审批人不可为同一人",
    rejectPolicy: "退回提交人，修改后重新提交",
  },
  {
    id: "rule-work-order",
    name: "工单验收审批",
    businessType: "工单验收",
    scope: "全站点",
    approver: "运维负责人",
    status: "启用",
    flow: ["提交人", "运维负责人", "审批通过"],
    approvalMethod: "单级审批",
    samePersonRule: "处理人与验收人不可为同一人",
    rejectPolicy: "退回处理人补充记录",
  },
  {
    id: "rule-temporary",
    name: "临时授权审批",
    businessType: "临时授权",
    scope: "全租户",
    approver: "资产负责人",
    status: "启用",
    flow: ["申请人", "资产负责人", "审批通过"],
    approvalMethod: "按资产负责人审批",
    samePersonRule: "申请人与审批人不可为同一人",
    rejectPolicy: "拒绝后保留申请记录",
  },
]

const AUDIT_LOGS: AuditLog[] = [
  {
    id: "audit-permission",
    time: "09-10 14:26:18",
    operator: "admin.wang",
    role: "平台管理员",
    operationType: "权限变更",
    content: "修改角色权限",
    object: "运营负责人",
    tenant: "华东能源",
    result: "成功",
    source: "10.28.4.12",
    requestId: "REQ-20260910-142618",
    detail: "角色新增工单审批查看权限",
  },
  {
    id: "audit-report",
    time: "09-10 14:20:03",
    operator: "svc-report",
    role: "系统服务",
    operationType: "报告导出",
    content: "导出报告",
    object: "海宁站运营报告",
    tenant: "华东能源",
    result: "成功",
    source: "10.28.2.31",
    requestId: "REQ-20260910-142003",
    detail: "导出月度运营报告 PDF",
  },
  {
    id: "audit-denied",
    time: "09-10 13:58:44",
    operator: "vendor.07",
    role: "外部服务商",
    operationType: "策略下发",
    content: "下发运行策略",
    object: "海宁站",
    tenant: "海创工业",
    result: "拒绝",
    source: "10.28.4.16",
    requestId: "REQ-20260910-135844",
    detail: "当前授权不包含策略下发权限",
  },
  {
    id: "audit-account",
    time: "09-10 13:46:10",
    operator: "admin.liu",
    role: "审计员",
    operationType: "账号安全",
    content: "新增账号",
    object: "chen.om",
    tenant: "华东能源",
    result: "成功",
    source: "10.28.1.19",
    requestId: "REQ-20260910-134610",
    detail: "创建运维工程师账号并绑定华东运营中心",
  },
  {
    id: "audit-secret",
    time: "09-10 13:32:06",
    operator: "admin.liu",
    role: "平台管理员",
    operationType: "账号安全",
    content: "轮换API密钥",
    object: "ERP-SAP",
    tenant: "华东能源",
    result: "成功",
    source: "10.28.1.19",
    requestId: "REQ-20260910-133206",
    detail: "API 密钥轮换完成并通知业务系统",
  },
]

const POLICY_CARDS: PolicyCard[] = [
  {
    id: "identity",
    section: "登录与会话",
    title: "身份验证",
    rows: [
      ["多因素认证", "管理员必须启用"],
      ["登录失败限制", "连续5次失败后锁定30分钟"],
      ["会话超时", "无操作30分钟后退出"],
      ["密码策略", "至少12位，包含字母与数字"],
    ],
  },
  {
    id: "access",
    section: "登录与会话",
    title: "访问限制",
    rows: [
      ["IP访问限制", "已启用"],
      ["允许网段", "10.28.0.0/16"],
      ["外部服务访问", "仅限授权资产范围"],
      ["账号会话管理", "支持管理员撤销会话"],
    ],
  },
  {
    id: "audit",
    section: "审计与敏感操作",
    title: "审计记录",
    rows: [
      ["审计保留期限", "36个月"],
      ["记录删除", "不允许"],
      ["导出权限", "仅审计员与授权管理员"],
    ],
  },
  {
    id: "sensitive",
    section: "审计与敏感操作",
    title: "敏感操作验证",
    rows: [
      ["API密钥轮换", "二次身份验证"],
      ["权限变更", "记录变更前后内容"],
      ["生产控制", "独立操作授权及审批"],
    ],
  },
]

const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: "tenant-hd",
    name: "华东能源",
    industry: "能源服务",
    sites: 18,
    expiry: "2027-06-30",
    status: "正常",
    tenantId: "tenant-hd",
    entity: "华东能源科技有限公司",
    contact: "周欣",
    region: "中国 · 华东",
    contractId: "HT-2026-018",
    contractRange: "2026-07-01 至 2027-06-30",
    plan: "企业版",
    siteQuota: "18 / 25",
    accountQuota: "126 / 200",
    apiUsage: "72万 / 100万次",
    sla: "99.9%",
  },
  {
    id: "tenant-hc",
    name: "海创工业",
    industry: "制造业",
    sites: 7,
    expiry: "2026-12-31",
    status: "配额预警",
    tenantId: "tenant-hc",
    entity: "海创工业能源管理有限公司",
    contact: "陈伟",
    region: "中国 · 华南",
    contractId: "HT-2026-041",
    contractRange: "2026-01-01 至 2026-12-31",
    plan: "企业版",
    siteQuota: "7 / 8",
    accountQuota: "86 / 100",
    apiUsage: "81万 / 90万次",
    sla: "99.5%",
  },
  {
    id: "tenant-xy",
    name: "新源科技",
    industry: "园区",
    sites: 3,
    expiry: "2026-10-31",
    status: "试用中",
    tenantId: "tenant-xy",
    entity: "新源科技园区服务有限公司",
    contact: "林澄",
    region: "中国 · 华东",
    contractId: "TR-2026-009",
    contractRange: "2026-08-01 至 2026-10-31",
    plan: "试用版",
    siteQuota: "3 / 5",
    accountQuota: "24 / 50",
    apiUsage: "12万 / 20万次",
    sla: "99.0%",
  },
  {
    id: "tenant-ng",
    name: "南港园区",
    industry: "园区",
    sites: 12,
    expiry: "2027-03-31",
    status: "正常",
    tenantId: "tenant-ng",
    entity: "南港园区综合能源有限公司",
    contact: "郑岚",
    region: "中国 · 华东",
    contractId: "HT-2026-026",
    contractRange: "2026-04-01 至 2027-03-31",
    plan: "企业版",
    siteQuota: "12 / 18",
    accountQuota: "94 / 150",
    apiUsage: "43万 / 80万次",
    sla: "99.9%",
  },
  {
    id: "tenant-xb",
    name: "西北储能",
    industry: "能源服务",
    sites: 6,
    expiry: "2026-09-30",
    status: "即将到期",
    tenantId: "tenant-xb",
    entity: "西北储能运营有限公司",
    contact: "许远",
    region: "中国 · 西北",
    contractId: "HT-2025-083",
    contractRange: "2025-10-01 至 2026-09-30",
    plan: "标准版",
    siteQuota: "6 / 10",
    accountQuota: "42 / 80",
    apiUsage: "35万 / 50万次",
    sla: "99.3%",
  },
]

function buildCustomersFromStations(stations: Station[]): Customer[] {
  if (!stations.length) return INITIAL_CUSTOMERS

  const groups = new Map<string, Station[]>()
  stations.forEach((station) => {
    const key = station.project || station.region || station.name
    groups.set(key, [...(groups.get(key) ?? []), station])
  })

  return [...groups.entries()].map(([project, projectStations], index) => {
    const primary = projectStations[0]
    const totalDevices = projectStations.reduce(
      (total, station) =>
        total +
        station.devices.online +
        station.devices.fault +
        station.devices.offline +
        station.devices.building,
      0,
    )
    const faultDevices = projectStations.reduce(
      (total, station) => total + station.devices.fault,
      0,
    )
    const connectedSites = projectStations.filter(
      (station) => station.dataStatus === "connected",
    ).length
    const normalizedCode = (primary.code || primary.id)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    const tenantName =
      project
        .replace(/储能示范项目|示范项目|项目$/g, "")
        .trim() ||
      primary.shortName ||
      primary.name
    const regions = [...new Set(projectStations.map((station) => station.region))]
      .filter(Boolean)
      .join("、")
    const managers = [
      ...new Set(
        projectStations.map((station) => station.manager).filter(Boolean),
      ),
    ]
    const status: CustomerStatus =
      faultDevices > 0
        ? "配额预警"
        : connectedSites === projectStations.length
          ? "正常"
          : "试用中"

    return {
      id: `tenant-${normalizedCode || index + 1}`,
      name: tenantName,
      industry: "储能运营",
      sites: projectStations.length,
      expiry: "2027-09-18",
      status,
      tenantId: `tenant-${normalizedCode || index + 1}`,
      entity: `${tenantName}能源管理演示租户`,
      contact: managers.join("、") || "站点负责人未配置",
      region: regions ? `交付包区域 · ${regions}` : "交付包区域未标注",
      contractId: `PKG-${primary.code || primary.id}-2026`,
      contractRange: "2026-09-01 至 2027-09-18",
      plan: "交付包演示版",
      siteQuota: `${projectStations.length} / ${Math.max(5, projectStations.length + 3)}`,
      accountQuota: `${Math.max(6, projectStations.length * 4)} / ${Math.max(20, projectStations.length * 10)}`,
      apiUsage: `${Math.max(1, Math.round(totalDevices * 2.4))}万 / ${Math.max(20, totalDevices * 4)}万次`,
      sla: faultDevices > 0 ? "99.5%" : "99.9%",
    }
  })
}

function getStatusClass(status: string) {
  if (["正常", "启用", "生效中", "成功"].includes(status)) return "is-normal"
  if (["配额预警", "待复核", "拒绝"].includes(status)) return "is-warning"
  if (status === "试用中") return "is-trial"
  if (["即将到期", "已到期", "停用"].includes(status)) return "is-expiring"
  if (status === "失败") return "is-danger"
  return "is-muted"
}

function getCustomerMatchText(customer: Customer) {
  return [
    customer.name,
    customer.industry,
    customer.status,
    customer.tenantId,
    customer.entity,
    customer.contact,
    customer.region,
  ]
    .join(" ")
    .toLowerCase()
}

function getRoleMatchText(role: RolePermission) {
  return [role.name, role.members, role.status, role.scopeExample]
    .join(" ")
    .toLowerCase()
}

function getGrantMatchText(grant: TemporaryGrant) {
  return [
    grant.grantee,
    grant.customer,
    grant.assetScope,
    grant.content,
    grant.status,
    grant.reason,
  ]
    .join(" ")
    .toLowerCase()
}

function getRuleMatchText(rule: ApprovalRule) {
  return [rule.name, rule.businessType, rule.scope, rule.approver, rule.status]
    .join(" ")
    .toLowerCase()
}

function getAuditMatchText(audit: AuditLog) {
  return [
    audit.operator,
    audit.role,
    audit.operationType,
    audit.content,
    audit.object,
    audit.tenant,
    audit.result,
    audit.requestId,
  ]
    .join(" ")
    .toLowerCase()
}

function getAuditDate(audit: AuditLog) {
  return `2026-${audit.time.slice(0, 5)}`
}

function buildAuditDateOptions(now: Date): {
  value: AuditDateRange
  label: string
  range: { start: string; end: string }
}[] {
  const currentWeek = dateRangeEndingAt(now, 7)
  const previousWeekEnd = new Date(now)
  previousWeekEnd.setDate(previousWeekEnd.getDate() - 7)
  const previousWeek = dateRangeEndingAt(previousWeekEnd, 7)
  const today = operationsDate(now)
  return [
    {
      value: currentWeek.start,
      label: `${currentWeek.start} — ${currentWeek.end}`,
      range: currentWeek,
    },
    {
      value: previousWeek.start,
      label: `${previousWeek.start} — ${previousWeek.end}`,
      range: previousWeek,
    },
    {
      value: today,
      label: "今日",
      range: { start: today, end: today },
    },
  ]
}

function isAuditInDateRange(audit: AuditLog, range: { start: string; end: string }) {
  const auditDate = getAuditDate(audit)
  return auditDate >= range.start && auditDate <= range.end
}

function getMemberScope(role: string, orgPath: string) {
  if (role === "审计员") return "全租户"
  if (role === "外部服务商") return "指定资产"
  if (role === "客户成功") return "华东客户"
  return orgPath.includes("/") ? orgPath.split("/")[0].trim() : orgPath
}

function getFormText(form: FormData, key: string, fallback = "") {
  const value = String(form.get(key) ?? "").trim()
  return value || fallback
}

function getFormNumber(form: FormData, key: string, fallback = 0) {
  const value = Number(form.get(key))
  return Number.isFinite(value) ? value : fallback
}

function formatDateTimeLabel(value: Date) {
  return `${operationsDate(value)} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
}

function formatNowLabel(now = new Date()) {
  return now.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function parseFlow(value: string) {
  const steps = value
    .split(/[>→,，\n]/)
    .map((step) => step.trim())
    .filter(Boolean)
  return steps.length >= 2 ? steps : ["提交人", "审批通过"]
}

function DemoPlatformManagementPage({
  stations = [],
  allowedTabs = TABS,
}: {
  stations?: Station[]
  allowedTabs?: readonly PlatformTab[]
}) {
  const visibleTabs = TABS.filter((tab) => allowedTabs.includes(tab))
  const dataNow = useMemo(() => stationsDataNow(stations), [stations])
  const stationScopeText = `${stations.length}个站点`
  const stationGroupName = stations.length ? "交付包站群" : "站点范围"
  const grantUntil = new Date(dataNow)
  grantUntil.setHours(18, 0, 0, 0)
  const grantUntilText = formatDateTimeLabel(grantUntil)
  const auditDateOptions = useMemo(() => buildAuditDateOptions(dataNow), [dataNow])
  const auditDateRanges = useMemo(
    () => Object.fromEntries(auditDateOptions.map((option) => [option.value, option.range])),
    [auditDateOptions],
  )
  const generatedCustomers = useMemo(
    () => buildCustomersFromStations(stations),
    [stations],
  )
  const initialMembers = useMemo(
    () =>
      ORG_MEMBERS.map((member) =>
        member.id === "user-wk"
          ? { ...member, scope: stationGroupName }
          : member.id === "user-cm"
            ? { ...member, scope: stationScopeText }
            : member.id === "user-vendor-07"
              ? {
                  ...member,
                  scope: stations[0]?.shortName ?? stations[0]?.name ?? member.scope,
                  temporaryAccess: `${grantUntilText} 到期`,
                }
              : member,
      ),
    [grantUntilText, stationGroupName, stationScopeText, stations],
  )
  const initialRoles = useMemo(
    () =>
      ROLE_PERMISSIONS.map((role) =>
        role.id === "role-ops"
          ? {
              ...role,
              scopeExample: `王凯 · ${stationGroupName} · ${stationScopeText}`,
            }
          : role.id === "role-maintenance"
            ? {
                ...role,
                scopeExample: `陈明 · ${stationScopeText} · 设备与告警`,
              }
            : role,
      ),
    [stationGroupName, stationScopeText],
  )
  const initialGrants = useMemo(
    () =>
      TEMPORARY_GRANTS.map((grant) =>
        grant.id === "grant-vendor-07"
          ? {
              ...grant,
              assetScope: stations[0]?.shortName ?? stations[0]?.name ?? grant.assetScope,
              validRange: `${formatNowLabel(dataNow)} — ${grantUntilText}`,
              validUntil: grantUntilText,
            }
          : grant,
      ),
    [dataNow, grantUntilText, stations],
  )
  const [activeTab, setActiveTab] = useState<PlatformTab>(
    visibleTabs[0] ?? "组织权限",
  )
  const [customers, setCustomers] = useState(() => generatedCustomers)
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    () => generatedCustomers[0]?.id ?? "",
  )
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("全部")
  const [permissionTab, setPermissionTab] =
    useState<PermissionTab>("组织与成员")
  const [orgNodes, setOrgNodes] = useState(ORG_NODES)
  const [selectedOrgId, setSelectedOrgId] = useState("east")
  const [permissionSearch, setPermissionSearch] = useState("")
  const [members, setMembers] = useState(initialMembers)
  const [selectedMemberId, setSelectedMemberId] = useState("user-wk")
  const [roleSearch, setRoleSearch] = useState("")
  const [roles, setRoles] = useState(initialRoles)
  const [selectedRoleId, setSelectedRoleId] = useState("role-ops")
  const [grantSearch, setGrantSearch] = useState("")
  const [grants, setGrants] = useState(initialGrants)
  const [grantStatusFilter, setGrantStatusFilter] =
    useState<GrantStatusFilter>("全部")
  const [selectedGrantId, setSelectedGrantId] = useState("grant-vendor-07")
  const [ruleSearch, setRuleSearch] = useState("")
  const [rules, setRules] = useState(APPROVAL_RULES)
  const [ruleBusinessFilter, setRuleBusinessFilter] =
    useState<ApprovalBusinessFilter>("全部")
  const [selectedRuleId, setSelectedRuleId] = useState("rule-strategy")
  const [auditTab, setAuditTab] = useState<AuditTab>("审计日志")
  const [auditDateRange, setAuditDateRange] =
    useState<AuditDateRange>(() => auditDateOptions[0]?.value ?? "")
  const [auditSearch, setAuditSearch] = useState("")
  const [auditOperationFilter, setAuditOperationFilter] =
    useState<AuditOperationFilter>("全部")
  const [auditResultFilter, setAuditResultFilter] =
    useState<AuditResultFilter>("全部")
  const [selectedAuditId, setSelectedAuditId] = useState("audit-denied")
  const [policyCards, setPolicyCards] = useState(POLICY_CARDS)
  const [selectedPolicyId, setSelectedPolicyId] = useState("identity")
  const [auditQueryTime, setAuditQueryTime] = useState("未查询")
  const [policySavedAt, setPolicySavedAt] = useState("未保存")
  const [dialogKind, setDialogKind] = useState<DialogKind>(null)
  const [notice, setNotice] = useState("")

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return customers.filter((customer) => {
      const matchesSearch =
        !keyword || getCustomerMatchText(customer).includes(keyword)
      const matchesStatus =
        statusFilter === "全部" || customer.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [customers, search, statusFilter])

  const selectedCustomer =
    filteredCustomers.find((customer) => customer.id === selectedCustomerId) ??
    filteredCustomers[0] ??
    null

  const selectedOrg =
    orgNodes.find((org) => org.id === selectedOrgId) ?? orgNodes[0]

  const memberOrgOptions = useMemo(() => {
    const options = [...MEMBER_ORG_OPTIONS]
    orgNodes
      .filter((org) => org.id !== "platform")
      .forEach((org) => {
        if (!options.some((option) => option.orgId === org.id)) {
          options.push({ label: org.name, orgId: org.id })
        }
      })
    return options
  }, [orgNodes])

  const memberRoleOptions = useMemo(
    () =>
      Array.from(
        new Set([...MEMBER_ROLE_OPTIONS, ...roles.map((role) => role.name)]),
      ),
    [roles],
  )

  const filteredMembers = useMemo(() => {
    const keyword = permissionSearch.trim().toLowerCase()
    return members.filter((member) => {
      const inSelectedOrg =
        selectedOrgId === "platform" ||
        member.orgId === selectedOrgId ||
        member.orgPath.includes(selectedOrg.name)
      const matchesKeyword =
        !keyword ||
        [
          member.name,
          member.account,
          member.source,
          member.role,
          member.scope,
          member.orgPath,
          member.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      return inSelectedOrg && matchesKeyword
    })
  }, [members, permissionSearch, selectedOrg.name, selectedOrgId])

  const selectedMember =
    filteredMembers.find((member) => member.id === selectedMemberId) ??
    filteredMembers[0] ??
    null

  const filteredRoles = useMemo(() => {
    const keyword = roleSearch.trim().toLowerCase()
    return roles.filter(
      (role) => !keyword || getRoleMatchText(role).includes(keyword),
    )
  }, [roleSearch, roles])

  const selectedRole =
    filteredRoles.find((role) => role.id === selectedRoleId) ??
    filteredRoles[0] ??
    null

  const filteredGrants = useMemo(() => {
    const keyword = grantSearch.trim().toLowerCase()
    return grants.filter((grant) => {
      const matchesSearch =
        !keyword || getGrantMatchText(grant).includes(keyword)
      const matchesStatus =
        grantStatusFilter === "全部" || grant.status === grantStatusFilter
      return matchesSearch && matchesStatus
    })
  }, [grantSearch, grantStatusFilter, grants])

  const selectedGrant =
    filteredGrants.find((grant) => grant.id === selectedGrantId) ??
    filteredGrants[0] ??
    null

  const filteredRules = useMemo(() => {
    const keyword = ruleSearch.trim().toLowerCase()
    return rules.filter((rule) => {
      const matchesSearch = !keyword || getRuleMatchText(rule).includes(keyword)
      const matchesBusiness =
        ruleBusinessFilter === "全部" ||
        rule.businessType === ruleBusinessFilter
      return matchesSearch && matchesBusiness
    })
  }, [ruleBusinessFilter, ruleSearch, rules])

  const selectedRule =
    filteredRules.find((rule) => rule.id === selectedRuleId) ??
    filteredRules[0] ??
    null

  const currentAuditRange =
    auditDateRanges[auditDateRange] ?? auditDateOptions[0]?.range
  const filteredAuditLogs = useMemo(() => {
    const keyword = auditSearch.trim().toLowerCase()
    return AUDIT_LOGS.filter((audit) => {
      const matchesDateRange = currentAuditRange
        ? isAuditInDateRange(audit, currentAuditRange)
        : true
      const matchesSearch =
        !keyword || getAuditMatchText(audit).includes(keyword)
      const matchesOperation =
        auditOperationFilter === "全部" ||
        audit.operationType === auditOperationFilter
      const matchesResult =
        auditResultFilter === "全部" || audit.result === auditResultFilter
      return (
        matchesDateRange && matchesSearch && matchesOperation && matchesResult
      )
    })
  }, [auditOperationFilter, auditResultFilter, auditSearch, currentAuditRange])

  const selectedAudit =
    filteredAuditLogs.find((audit) => audit.id === selectedAuditId) ??
    filteredAuditLogs[0] ??
    null

  const selectedPolicy =
    policyCards.find((policy) => policy.id === selectedPolicyId) ??
    policyCards[0] ??
    null

  function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = getFormText(form, "name", "新建客户")
    const industry = getFormText(form, "industry", "能源服务")
    const sites = getFormNumber(form, "sites", 0)
    const expiry = getFormText(form, "expiry", "2027-12-31")
    const status = getFormText(form, "status", "试用中") as CustomerStatus
    const id = `tenant-${Date.now()}`
    const nextCustomer: Customer = {
      id,
      name,
      industry,
      sites,
      expiry,
      status,
      tenantId: id,
      entity: getFormText(form, "entity", `${name}有限公司`),
      contact: getFormText(form, "contact", "待分配"),
      region: getFormText(form, "region", "中国 · 华东"),
      contractId: "待生成",
      contractRange: `今日 至 ${expiry}`,
      plan: status === "试用中" ? "试用版" : "标准版",
      siteQuota: `${sites} / 10`,
      accountQuota: "0 / 50",
      apiUsage: "0 / 20万次",
      sla: "99.0%",
    }

    setCustomers((current) => [nextCustomer, ...current])
    setSelectedCustomerId(id)
    setDialogKind(null)
    setNotice(`${name} 已加入客户列表`)
  }

  function saveCustomerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCustomer) return

    const form = new FormData(event.currentTarget)
    const nextName = getFormText(form, "name", selectedCustomer.name)
    const nextStatus = getFormText(
      form,
      "status",
      selectedCustomer.status,
    ) as CustomerStatus

    setCustomers((current) =>
      current.map((customer) =>
        customer.id === selectedCustomer.id
          ? {
              ...customer,
              name: nextName,
              industry: getFormText(form, "industry", customer.industry),
              sites: getFormNumber(form, "sites", customer.sites),
              expiry: getFormText(form, "expiry", customer.expiry),
              status: nextStatus,
              entity: getFormText(form, "entity", customer.entity),
              contact: getFormText(form, "contact", customer.contact),
              region: getFormText(form, "region", customer.region),
            }
          : customer,
      ),
    )
    setSelectedCustomerId(selectedCustomer.id)
    setDialogKind(null)
    setNotice(`${nextName} 的客户档案已更新`)
  }

  function saveCustomerEntitlements(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCustomer) return

    const form = new FormData(event.currentTarget)
    setCustomers((current) =>
      current.map((customer) =>
        customer.id === selectedCustomer.id
          ? {
              ...customer,
              contractId: getFormText(form, "contractId", customer.contractId),
              contractRange: getFormText(
                form,
                "contractRange",
                customer.contractRange,
              ),
              plan: getFormText(form, "plan", customer.plan),
              siteQuota: getFormText(form, "siteQuota", customer.siteQuota),
              accountQuota: getFormText(
                form,
                "accountQuota",
                customer.accountQuota,
              ),
              apiUsage: getFormText(form, "apiUsage", customer.apiUsage),
              sla: getFormText(form, "sla", customer.sla),
            }
          : customer,
      ),
    )
    setDialogKind(null)
    setNotice(`${selectedCustomer.name} 的合同与权益已更新`)
  }

  function addOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = getFormText(form, "name", "新建组织")
    const level = getFormNumber(form, "level", selectedOrg?.level ?? 0)
    const id = `org-${Date.now()}`
    const nextOrg: OrgNode = { id, name, level }

    setOrgNodes((current) => {
      const selectedIndex = current.findIndex((org) => org.id === selectedOrgId)
      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : current.length
      const next = [...current]
      next.splice(insertAt, 0, nextOrg)
      return next
    })
    setSelectedOrgId(id)
    setSelectedMemberId("")
    setDialogKind(null)
    setNotice(`${name} 已加入组织结构`)
  }

  function saveOrg(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedOrg || selectedOrg.id === "platform") return

    const form = new FormData(event.currentTarget)
    const previousName = selectedOrg.name
    const nextName = getFormText(form, "name", previousName)
    const nextLevel = getFormNumber(form, "level", selectedOrg.level)

    setOrgNodes((current) =>
      current.map((org) =>
        org.id === selectedOrg.id
          ? { ...org, name: nextName, level: nextLevel }
          : org,
      ),
    )
    setMembers((current) =>
      current.map((member) =>
        member.orgId === selectedOrg.id || member.orgPath.includes(previousName)
          ? {
              ...member,
              orgPath: member.orgPath.replace(previousName, nextName),
            }
          : member,
      ),
    )
    setDialogKind(null)
    setNotice(`${nextName} 的组织信息已更新`)
  }

  function deleteSelectedOrg() {
    if (!selectedOrg || selectedOrg.id === "platform") return

    const deletedOrg = selectedOrg
    setOrgNodes((current) => current.filter((org) => org.id !== deletedOrg.id))
    setMembers((current) =>
      current.map((member) =>
        member.orgId === deletedOrg.id
          ? {
              ...member,
              orgId: "platform",
              orgPath: `Enerlution 平台 / ${member.orgPath}`,
            }
          : member,
      ),
    )
    setSelectedOrgId("platform")
    setSelectedMemberId("")
    setDialogKind(null)
    setNotice(`${deletedOrg.name} 已删除，原成员已移至平台根组织`)
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = getFormText(form, "name", "新成员")
    const account = getFormText(form, "account", `user-${Date.now()}`)
    const orgPath = getFormText(form, "org", "华东运营中心 / 运营部")
    const role = getFormText(form, "role", "运维工程师")
    const orgOption =
      memberOrgOptions.find((option) => option.label === orgPath) ??
      memberOrgOptions.find((option) => option.orgId === selectedOrgId) ??
      memberOrgOptions[0]
    const id = `user-${Date.now()}`
    const nextMember: OrgMember = {
      id,
      name,
      account,
      source: getFormText(form, "source", "本地账号"),
      role,
      scope: getMemberScope(role, orgPath),
      status: getFormText(form, "status", "启用") as OrgMember["status"],
      orgId: orgOption.orgId,
      orgPath,
      temporaryAccess: getFormText(form, "temporaryAccess", "无"),
    }

    setMembers((current) => [nextMember, ...current])
    setSelectedOrgId(orgOption.orgId)
    setSelectedMemberId(id)
    setPermissionTab("组织与成员")
    setDialogKind(null)
    setNotice(`${name} 已创建成员账号`)
  }

  function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedMember) return

    const form = new FormData(event.currentTarget)
    const orgPath = getFormText(form, "org", selectedMember.orgPath)
    const role = getFormText(form, "role", selectedMember.role)
    const orgOption = memberOrgOptions.find(
      (option) => option.label === orgPath,
    ) ?? { label: orgPath, orgId: selectedMember.orgId }
    const nextName = getFormText(form, "name", selectedMember.name)

    setMembers((current) =>
      current.map((member) =>
        member.id === selectedMember.id
          ? {
              ...member,
              name: nextName,
              account: getFormText(form, "account", member.account),
              source: getFormText(form, "source", member.source),
              role,
              scope: getMemberScope(role, orgPath),
              status: getFormText(
                form,
                "status",
                member.status,
              ) as OrgMember["status"],
              orgId: orgOption.orgId,
              orgPath,
              temporaryAccess: getFormText(
                form,
                "temporaryAccess",
                member.temporaryAccess,
              ),
            }
          : member,
      ),
    )
    setSelectedOrgId(orgOption.orgId)
    setSelectedMemberId(selectedMember.id)
    setDialogKind(null)
    setNotice(`${nextName} 的成员权限已更新`)
  }

  function readRoleRows(form: FormData, baseRows: RolePermissionRow[]) {
    return baseRows.map((row) => ({
      module: row.module,
      view: getFormText(
        form,
        `${row.module}-view`,
        row.view,
      ) as PermissionValue,
      edit: getFormText(
        form,
        `${row.module}-edit`,
        row.edit,
      ) as PermissionValue,
      execute: getFormText(
        form,
        `${row.module}-execute`,
        row.execute,
      ) as PermissionValue,
      approve: getFormText(
        form,
        `${row.module}-approve`,
        row.approve,
      ) as PermissionValue,
    }))
  }

  function addRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = getFormText(form, "name", "新建角色")
    const id = `role-${Date.now()}`
    const nextRole: RolePermission = {
      id,
      name,
      members: getFormNumber(form, "members", 0),
      status: getFormText(form, "status", "启用") as RolePermission["status"],
      scopeStrategy: getFormText(form, "scopeStrategy", "按成员分别授权"),
      scopeExample: getFormText(form, "scopeExample", "待配置"),
      highRiskPolicy: getFormText(form, "highRiskPolicy", "高风险操作需审批"),
      rows: readRoleRows(form, DEFAULT_ROLE_ROWS),
    }

    setRoles((current) => [nextRole, ...current])
    setRoleSearch("")
    setSelectedRoleId(id)
    setPermissionTab("角色权限")
    setDialogKind(null)
    setNotice(`${name} 已创建角色`)
  }

  function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedRole) return

    const form = new FormData(event.currentTarget)
    const nextName = getFormText(form, "name", selectedRole.name)

    setRoles((current) =>
      current.map((role) =>
        role.id === selectedRole.id
          ? {
              ...role,
              name: nextName,
              members: getFormNumber(form, "members", role.members),
              status: getFormText(
                form,
                "status",
                role.status,
              ) as RolePermission["status"],
              scopeStrategy: getFormText(
                form,
                "scopeStrategy",
                role.scopeStrategy,
              ),
              scopeExample: getFormText(
                form,
                "scopeExample",
                role.scopeExample,
              ),
              highRiskPolicy: getFormText(
                form,
                "highRiskPolicy",
                role.highRiskPolicy,
              ),
              rows: readRoleRows(form, role.rows),
            }
          : role,
      ),
    )
    setDialogKind(null)
    setNotice(`${nextName} 的权限矩阵已更新`)
  }

  function addGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const grantee = getFormText(form, "grantee", "新授权对象")
    const validUntil = getFormText(form, "validUntil", grantUntilText)
    const id = `grant-${Date.now()}`
    const nextGrant: TemporaryGrant = {
      id,
      grantee,
      customer: getFormText(
        form,
        "customer",
        selectedCustomer?.name ?? "华东能源",
      ),
      assetScope: getFormText(form, "assetScope", "华东站群"),
      content: getFormText(form, "content", "查看运行数据"),
      validRange: getFormText(
        form,
        "validRange",
        `${formatNowLabel(dataNow)} — ${validUntil}`,
      ),
      validUntil,
      status: getFormText(form, "status", "生效中") as TemporaryGrantStatus,
      allowedActions: getFormText(form, "allowedActions", "运行数据查看"),
      controlLimit: getFormText(form, "controlLimit", "不可修改策略"),
      authorizer: getFormText(form, "authorizer", "王凯"),
      reason: getFormText(form, "reason", "临时协同处理"),
    }

    setGrants((current) => [nextGrant, ...current])
    setGrantStatusFilter("全部")
    setGrantSearch("")
    setSelectedGrantId(id)
    setPermissionTab("临时授权")
    setDialogKind(null)
    setNotice(`${grantee} 的临时授权已创建`)
  }

  function revokeSelectedGrant() {
    if (!selectedGrant) return
    const revokedAt = formatNowLabel()

    setGrants((current) =>
      current.map((grant) =>
        grant.id === selectedGrant.id
          ? {
              ...grant,
              validUntil: `${revokedAt} 已撤销`,
              validRange: `${grant.validRange}（${revokedAt} 手动撤销）`,
              status: "已到期",
              controlLimit: `${grant.controlLimit}；已手动撤销`,
            }
          : grant,
      ),
    )
    setGrantStatusFilter("全部")
    setSelectedGrantId(selectedGrant.id)
    setDialogKind(null)
    setNotice(`${selectedGrant.grantee} 的临时授权已撤销`)
  }

  function addRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = getFormText(form, "name", "新建审批规则")
    const approver = getFormText(form, "approver", "运营负责人")
    const id = `rule-${Date.now()}`
    const nextRule: ApprovalRule = {
      id,
      name,
      businessType: getFormText(
        form,
        "businessType",
        "策略下发",
      ) as ApprovalBusinessFilter,
      scope: getFormText(form, "scope", "全站点"),
      approver,
      status: getFormText(form, "status", "启用") as ApprovalRule["status"],
      flow: parseFlow(
        getFormText(form, "flow", `提交人 → ${approver} → 审批通过`),
      ),
      approvalMethod: getFormText(form, "approvalMethod", "逐级审批"),
      samePersonRule: getFormText(
        form,
        "samePersonRule",
        "提交人与审批人不可为同一人",
      ),
      rejectPolicy: getFormText(
        form,
        "rejectPolicy",
        "退回提交人，修改后重新提交",
      ),
    }

    setRules((current) => [nextRule, ...current])
    setRuleBusinessFilter("全部")
    setRuleSearch("")
    setSelectedRuleId(id)
    setPermissionTab("审批规则")
    setDialogKind(null)
    setNotice(`${name} 已创建审批规则`)
  }

  function saveRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedRule) return

    const form = new FormData(event.currentTarget)
    const nextName = getFormText(form, "name", selectedRule.name)
    const approver = getFormText(form, "approver", selectedRule.approver)

    setRules((current) =>
      current.map((rule) =>
        rule.id === selectedRule.id
          ? {
              ...rule,
              name: nextName,
              businessType: getFormText(
                form,
                "businessType",
                rule.businessType,
              ) as ApprovalBusinessFilter,
              scope: getFormText(form, "scope", rule.scope),
              approver,
              status: getFormText(
                form,
                "status",
                rule.status,
              ) as ApprovalRule["status"],
              flow: parseFlow(getFormText(form, "flow", rule.flow.join(" → "))),
              approvalMethod: getFormText(
                form,
                "approvalMethod",
                rule.approvalMethod,
              ),
              samePersonRule: getFormText(
                form,
                "samePersonRule",
                rule.samePersonRule,
              ),
              rejectPolicy: getFormText(
                form,
                "rejectPolicy",
                rule.rejectPolicy,
              ),
            }
          : rule,
      ),
    )
    setDialogKind(null)
    setNotice(`${nextName} 的审批规则已更新`)
  }

  function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPolicy) return

    const form = new FormData(event.currentTarget)
    setPolicyCards((current) =>
      current.map((policy) =>
        policy.id === selectedPolicy.id
          ? {
              ...policy,
              rows: policy.rows.map(([label, value], index) => [
                label,
                getFormText(form, `row-${index}`, value),
              ]),
            }
          : policy,
      ),
    )
    setDialogKind(null)
    setNotice(`${selectedPolicy.title} 策略已更新，记得保存修改`)
  }

  function saveAllPolicies() {
    const savedAt = formatNowLabel()
    setPolicySavedAt(savedAt)
    setNotice(`安全策略已保存 · ${savedAt}`)
  }

  function queryAuditRecords() {
    const queriedAt = formatNowLabel()
    setAuditQueryTime(queriedAt)
    setSelectedAuditId(filteredAuditLogs[0]?.id ?? "")
    setNotice(`已刷新审计日志，匹配 ${filteredAuditLogs.length} 条记录`)
  }

  function exportAuditRecords() {
    if (filteredAuditLogs.length === 0) {
      setNotice("当前筛选条件下没有可导出的审计记录")
      return
    }

    const escapeCsv = (value: string | number) =>
      `"${String(value).replace(/"/g, '""')}"`
    const header = [
      "操作时间",
      "操作人",
      "角色",
      "操作类型",
      "操作内容",
      "操作对象",
      "客户/租户",
      "结果",
      "来源",
      "请求ID",
      "详情",
    ]
    const rows = filteredAuditLogs.map((audit) =>
      [
        audit.time,
        audit.operator,
        audit.role,
        audit.operationType,
        audit.content,
        audit.object,
        audit.tenant,
        audit.result,
        audit.source,
        audit.requestId,
        audit.detail,
      ]
        .map(escapeCsv)
        .join(","),
    )
    const csv = [`\uFEFF${header.map(escapeCsv).join(",")}`, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `audit-records-${auditDateRange}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setNotice(`已导出 ${filteredAuditLogs.length} 条审计记录`)
  }

  function renderCustomerManagement() {
    return (
      <>
        <div className="platform-toolbar">
          <label className="platform-search">
            <input
              aria-label="搜索客户名称"
              placeholder="搜索客户名称"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Search size={16} aria-hidden="true" />
          </label>

          <label className="platform-select">
            <span className="platform-select-label">状态：</span>
            <select
              aria-label="客户状态"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>

          <button
            type="button"
            className="platform-primary-button"
            onClick={() => setDialogKind("customer-create")}
          >
            <Plus size={15} aria-hidden="true" />
            新建客户
          </button>
        </div>

        <div className="platform-grid">
          <section className="platform-table-card" aria-label="客户列表">
            <div className="platform-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>客户 / 租户</th>
                    <th>行业</th>
                    <th>站点</th>
                    <th>服务到期</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((customer) => {
                    const isSelected = selectedCustomer?.id === customer.id
                    return (
                      <tr
                        key={customer.id}
                        className={isSelected ? "is-selected" : ""}
                      >
                        <td>
                          <strong>{customer.name}</strong>
                        </td>
                        <td>{customer.industry}</td>
                        <td className="is-number">{customer.sites}</td>
                        <td className="is-number">{customer.expiry}</td>
                        <td>
                          <span
                            className={`platform-status ${getStatusClass(customer.status)}`}
                          >
                            {customer.status}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="platform-text-button"
                            onClick={() => setSelectedCustomerId(customer.id)}
                          >
                            查看
                          </button>
                          <span className="platform-action-separator">·</span>
                          <button
                            type="button"
                            className="platform-text-button"
                            onClick={() => {
                              setSelectedCustomerId(customer.id)
                              setDialogKind("customer-edit")
                            }}
                          >
                            编辑
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {filteredCustomers.length === 0 && (
              <div className="platform-empty">暂无符合条件的客户</div>
            )}
          </section>

          <aside className="platform-detail-stack" aria-label="客户详情">
            {selectedCustomer ? (
              <>
                <section className="platform-detail-card">
                  <header>
                    <h2>{selectedCustomer.name}</h2>
                    <button
                      type="button"
                      className="platform-outline-button"
                      onClick={() => setDialogKind("customer-edit")}
                    >
                      编辑客户
                    </button>
                  </header>
                  <dl>
                    <div>
                      <dt>租户标识</dt>
                      <dd>{selectedCustomer.tenantId}</dd>
                    </div>
                    <div>
                      <dt>客户主体</dt>
                      <dd>{selectedCustomer.entity}</dd>
                    </div>
                    <div>
                      <dt>服务联系人</dt>
                      <dd>{selectedCustomer.contact}</dd>
                    </div>
                    <div>
                      <dt>数据区域</dt>
                      <dd>{selectedCustomer.region}</dd>
                    </div>
                  </dl>
                </section>

                <section className="platform-detail-card">
                  <header>
                    <h2>合同与权益</h2>
                    <button
                      type="button"
                      className="platform-outline-button"
                      onClick={() => setDialogKind("entitlements-edit")}
                    >
                      编辑权益
                    </button>
                  </header>
                  <dl>
                    <div>
                      <dt>合同编号</dt>
                      <dd>{selectedCustomer.contractId}</dd>
                    </div>
                    <div>
                      <dt>服务期限</dt>
                      <dd>{selectedCustomer.contractRange}</dd>
                    </div>
                    <div>
                      <dt>服务套餐</dt>
                      <dd>{selectedCustomer.plan}</dd>
                    </div>
                    <div>
                      <dt>站点配额</dt>
                      <dd>{selectedCustomer.siteQuota}</dd>
                    </div>
                    <div>
                      <dt>账号配额</dt>
                      <dd>{selectedCustomer.accountQuota}</dd>
                    </div>
                    <div>
                      <dt>API用量</dt>
                      <dd>{selectedCustomer.apiUsage}</dd>
                    </div>
                    <div>
                      <dt>SLA</dt>
                      <dd>{selectedCustomer.sla}</dd>
                    </div>
                  </dl>
                </section>
              </>
            ) : (
              <section className="platform-detail-card platform-empty-detail">
                <h2>未选择客户</h2>
                <p>调整搜索或状态筛选后，选择客户查看租户与合同权益。</p>
              </section>
            )}
          </aside>
        </div>
      </>
    )
  }

  function renderOrganizationMembers() {
    return (
      <div className="platform-permission-shell">
        <aside className="platform-org-card" aria-label="组织结构">
          <h2>组织结构</h2>
          <button
            type="button"
            className="platform-org-add"
            onClick={() => setDialogKind("org-create")}
          >
            <span>新增组织</span>
            <Plus size={15} aria-hidden="true" />
          </button>
          <div className="platform-org-list">
            {orgNodes.map((org) => (
              <button
                key={org.id}
                type="button"
                className={selectedOrgId === org.id ? "is-active" : ""}
                style={{ paddingLeft: 12 + org.level * 18 }}
                onClick={() => {
                  setSelectedOrgId(org.id)
                  setSelectedMemberId("")
                }}
              >
                {org.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="platform-permission-main">
          <div className="platform-permission-toolbar">
            <label className="platform-search platform-permission-search">
              <input
                aria-label="搜索姓名或账号"
                placeholder="搜索姓名 / 账号"
                value={permissionSearch}
                onChange={(event) => setPermissionSearch(event.target.value)}
              />
              <Search size={16} aria-hidden="true" />
            </label>

            <button
              type="button"
              className="platform-primary-button"
              onClick={() => setDialogKind("member-create")}
            >
              <Plus size={15} aria-hidden="true" />
              新增账号
            </button>
          </div>

          <div className="platform-member-heading">
            <h2>
              {selectedOrg.id === "platform" ? "全部成员" : selectedOrg.name}
            </h2>
            <div>
              <button
                type="button"
                className="platform-outline-button"
                disabled={selectedOrg.id === "platform"}
                onClick={() => setDialogKind("org-edit")}
              >
                编辑组织
                <Pencil size={13} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="platform-outline-button platform-muted-action"
                disabled={selectedOrg.id === "platform"}
                onClick={() => setDialogKind("org-delete")}
              >
                删除组织
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          </div>

          <section className="platform-member-table" aria-label="组织成员">
            <div className="platform-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>姓名 / 账号</th>
                    <th>身份来源</th>
                    <th>角色</th>
                    <th>数据范围</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className={
                        selectedMember?.id === member.id ? "is-selected" : ""
                      }
                    >
                      <td>
                        <strong>{member.name}</strong>
                        <span className="platform-cell-subtitle">
                          {member.account}
                        </span>
                      </td>
                      <td>{member.source}</td>
                      <td>{member.role}</td>
                      <td>{member.scope}</td>
                      <td>
                        <span
                          className={`platform-status ${getStatusClass(member.status)}`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="platform-text-button"
                          onClick={() => setSelectedMemberId(member.id)}
                        >
                          查看详情
                        </button>
                        <span className="platform-action-separator">·</span>
                        <button
                          type="button"
                          className="platform-text-button"
                          onClick={() => {
                            setSelectedMemberId(member.id)
                            setDialogKind("member-edit")
                          }}
                        >
                          编辑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredMembers.length === 0 && (
              <div className="platform-empty">暂无符合条件的成员</div>
            )}
          </section>

          <section className="platform-member-detail">
            {selectedMember ? (
              <>
                <header>
                  <h2>成员权限 · {selectedMember.name}</h2>
                  <button
                    type="button"
                    className="platform-outline-button"
                    onClick={() => setDialogKind("member-preview")}
                  >
                    权限预览
                  </button>
                </header>
                <dl>
                  <div>
                    <dt>所属组织</dt>
                    <dd>{selectedMember.orgPath}</dd>
                  </div>
                  <div>
                    <dt>角色</dt>
                    <dd>{selectedMember.role}</dd>
                  </div>
                  <div>
                    <dt>资产范围</dt>
                    <dd>
                      {selectedMember.scope}
                      {selectedMember.scope === stationGroupName
                        ? ` · ${stationScopeText}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>临时授权</dt>
                    <dd>{selectedMember.temporaryAccess}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <div className="platform-empty platform-empty-detail">
                <h2>未选择成员</h2>
                <p>选择成员后查看所属组织、角色、资产范围和临时授权。</p>
              </div>
            )}
          </section>
        </section>
      </div>
    )
  }

  function renderRolePermissions() {
    return (
      <>
        <div className="platform-toolbar">
          <label className="platform-search">
            <input
              aria-label="搜索角色名称"
              placeholder="搜索角色名称"
              value={roleSearch}
              onChange={(event) => setRoleSearch(event.target.value)}
            />
            <Search size={16} aria-hidden="true" />
          </label>
          <button
            type="button"
            className="platform-primary-button"
            onClick={() => setDialogKind("role-create")}
          >
            <Plus size={15} aria-hidden="true" />
            新建角色
          </button>
        </div>

        <div className="platform-role-permission-shell">
          <section className="platform-role-list-card" aria-label="角色列表">
            <div className="platform-role-list-head">
              <span>角色</span>
              <span>成员</span>
            </div>
            {filteredRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={selectedRole?.id === role.id ? "is-active" : ""}
                onClick={() => setSelectedRoleId(role.id)}
              >
                <span>{role.name}</span>
                <strong>{role.members}</strong>
              </button>
            ))}
          </section>

          <section className="platform-role-main">
            {selectedRole ? (
              <>
                <div className="platform-card-heading">
                  <h2>{selectedRole.name} · 功能权限</h2>
                  <button
                    type="button"
                    className="platform-primary-button"
                    onClick={() => setDialogKind("role-edit")}
                  >
                    <Pencil size={14} aria-hidden="true" />
                    编辑权限
                  </button>
                </div>

                <section className="platform-matrix-card" aria-label="功能权限">
                  <div className="platform-table-scroll">
                    <table className="platform-permission-matrix">
                      <thead>
                        <tr>
                          <th>功能模块</th>
                          <th>查看</th>
                          <th>编辑</th>
                          <th>执行</th>
                          <th>审批</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRole.rows.map((row) => (
                          <tr key={row.module}>
                            <td>
                              <strong>{row.module}</strong>
                            </td>
                            <td>{row.view}</td>
                            <td>{row.edit}</td>
                            <td>{row.execute}</td>
                            <td>{row.approve}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="platform-info-panel">
                  <h2>资产范围</h2>
                  <dl>
                    <div>
                      <dt>范围策略</dt>
                      <dd>{selectedRole.scopeStrategy}</dd>
                    </div>
                    <div>
                      <dt>当前示例</dt>
                      <dd>{selectedRole.scopeExample}</dd>
                    </div>
                    <div>
                      <dt>高风险操作</dt>
                      <dd>{selectedRole.highRiskPolicy}</dd>
                    </div>
                  </dl>
                </section>
              </>
            ) : (
              <section className="platform-info-panel platform-empty-detail">
                <h2>未选择角色</h2>
                <p>调整搜索后选择角色查看功能权限和资产范围。</p>
              </section>
            )}
          </section>
        </div>
      </>
    )
  }

  function renderTemporaryGrants() {
    return (
      <>
        <div className="platform-toolbar platform-wide-toolbar">
          <label className="platform-search">
            <input
              aria-label="搜索被授权人或站点"
              placeholder="搜索被授权人 / 站点"
              value={grantSearch}
              onChange={(event) => setGrantSearch(event.target.value)}
            />
            <Search size={16} aria-hidden="true" />
          </label>

          <label className="platform-select platform-select-wide">
            <span className="platform-select-label">授权状态：</span>
            <select
              aria-label="授权状态"
              value={grantStatusFilter}
              onChange={(event) =>
                setGrantStatusFilter(event.target.value as GrantStatusFilter)
              }
            >
              {GRANT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>

          <button
            type="button"
            className="platform-primary-button"
            onClick={() => setDialogKind("grant-create")}
          >
            <Plus size={15} aria-hidden="true" />
            新增授权
          </button>
        </div>

        <section className="platform-secondary-card">
          <div className="platform-table-scroll">
            <table className="platform-grant-table">
              <thead>
                <tr>
                  <th>被授权人</th>
                  <th>所属客户</th>
                  <th>资产范围</th>
                  <th>授权内容</th>
                  <th>有效期至</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredGrants.map((grant) => (
                  <tr
                    key={grant.id}
                    className={
                      selectedGrant?.id === grant.id ? "is-selected" : ""
                    }
                  >
                    <td>
                      <strong>{grant.grantee}</strong>
                    </td>
                    <td>{grant.customer}</td>
                    <td>{grant.assetScope}</td>
                    <td>{grant.content}</td>
                    <td className="is-number">{grant.validUntil}</td>
                    <td>
                      <span
                        className={`platform-status ${getStatusClass(grant.status)}`}
                      >
                        {grant.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="platform-text-button"
                        onClick={() => setSelectedGrantId(grant.id)}
                      >
                        查看
                      </button>
                      {grant.status !== "已到期" && (
                        <>
                          <span className="platform-action-separator">·</span>
                          <button
                            type="button"
                            className="platform-text-button"
                            onClick={() => {
                              setSelectedGrantId(grant.id)
                              setDialogKind("grant-revoke")
                            }}
                          >
                            撤销
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredGrants.length === 0 && (
            <div className="platform-empty">暂无符合条件的临时授权</div>
          )}
        </section>

        <section className="platform-info-panel">
          {selectedGrant ? (
            <>
              <h2>{selectedGrant.grantee} · 授权详情</h2>
              <dl>
                <div>
                  <dt>有效期限</dt>
                  <dd>{selectedGrant.validRange}</dd>
                </div>
                <div>
                  <dt>授权对象</dt>
                  <dd>
                    {selectedGrant.customer} / {selectedGrant.assetScope}
                  </dd>
                </div>
                <div>
                  <dt>允许操作</dt>
                  <dd>{selectedGrant.allowedActions}</dd>
                </div>
                <div>
                  <dt>控制权限</dt>
                  <dd>{selectedGrant.controlLimit}</dd>
                </div>
                <div>
                  <dt>授权人</dt>
                  <dd>{selectedGrant.authorizer}</dd>
                </div>
                <div>
                  <dt>授权原因</dt>
                  <dd>{selectedGrant.reason}</dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="platform-empty platform-empty-detail">
              <h2>未选择授权</h2>
              <p>选择临时授权后查看期限、对象、操作和控制边界。</p>
            </div>
          )}
        </section>
      </>
    )
  }

  function renderApprovalRules() {
    return (
      <>
        <div className="platform-toolbar platform-wide-toolbar">
          <label className="platform-search">
            <input
              aria-label="搜索规则名称"
              placeholder="搜索规则名称"
              value={ruleSearch}
              onChange={(event) => setRuleSearch(event.target.value)}
            />
            <Search size={16} aria-hidden="true" />
          </label>

          <label className="platform-select platform-select-wide">
            <span className="platform-select-label">业务类型：</span>
            <select
              aria-label="业务类型"
              value={ruleBusinessFilter}
              onChange={(event) =>
                setRuleBusinessFilter(
                  event.target.value as ApprovalBusinessFilter,
                )
              }
            >
              {APPROVAL_BUSINESS_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>

          <button
            type="button"
            className="platform-primary-button"
            onClick={() => setDialogKind("rule-create")}
          >
            <Plus size={15} aria-hidden="true" />
            新建规则
          </button>
        </div>

        <section className="platform-secondary-card">
          <div className="platform-table-scroll">
            <table className="platform-rule-table">
              <thead>
                <tr>
                  <th>规则名称</th>
                  <th>业务类型</th>
                  <th>适用范围</th>
                  <th>审批人</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredRules.map((rule) => (
                  <tr
                    key={rule.id}
                    className={
                      selectedRule?.id === rule.id ? "is-selected" : ""
                    }
                  >
                    <td>
                      <strong>{rule.name}</strong>
                    </td>
                    <td>{rule.businessType}</td>
                    <td>{rule.scope}</td>
                    <td>{rule.approver}</td>
                    <td>
                      <span
                        className={`platform-status ${getStatusClass(rule.status)}`}
                      >
                        {rule.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="platform-text-button"
                        onClick={() => setSelectedRuleId(rule.id)}
                      >
                        查看
                      </button>
                      <span className="platform-action-separator">·</span>
                      <button
                        type="button"
                        className="platform-text-button"
                        onClick={() => {
                          setSelectedRuleId(rule.id)
                          setDialogKind("rule-edit")
                        }}
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredRules.length === 0 && (
            <div className="platform-empty">暂无符合条件的审批规则</div>
          )}
        </section>

        {selectedRule ? (
          <>
            <section className="platform-flow-section">
              <h2>{selectedRule.name} · 审批顺序</h2>
              <div className="platform-flow-card">
                {selectedRule.flow.map((step, index) => (
                  <span key={step}>
                    <strong>{step}</strong>
                    {index < selectedRule.flow.length - 1 && <i>→</i>}
                  </span>
                ))}
              </div>
            </section>

            <section className="platform-info-panel">
              <h2>规则设置</h2>
              <dl>
                <div>
                  <dt>审批方式</dt>
                  <dd>{selectedRule.approvalMethod}</dd>
                </div>
                <div>
                  <dt>同人处理</dt>
                  <dd>{selectedRule.samePersonRule}</dd>
                </div>
                <div>
                  <dt>驳回处理</dt>
                  <dd>{selectedRule.rejectPolicy}</dd>
                </div>
              </dl>
            </section>
          </>
        ) : (
          <section className="platform-info-panel platform-empty-detail">
            <h2>未选择规则</h2>
            <p>选择审批规则后查看流程顺序和规则设置。</p>
          </section>
        )}
      </>
    )
  }

  function renderOrganizationPermissions() {
    return (
      <>
        <nav
          className="platform-permission-tabs"
          role="tablist"
          aria-label="组织权限功能"
        >
          {PERMISSION_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={permissionTab === tab}
              onClick={() => setPermissionTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        {permissionTab === "组织与成员" && renderOrganizationMembers()}
        {permissionTab === "角色权限" && renderRolePermissions()}
        {permissionTab === "临时授权" && renderTemporaryGrants()}
        {permissionTab === "审批规则" && renderApprovalRules()}
      </>
    )
  }

  function renderAuditLogs() {
    return (
      <>
        <div className="platform-toolbar platform-audit-toolbar">
          <label className="platform-select platform-date-select">
            <select
              aria-label="审计日志日期范围"
              value={auditDateRange}
              onChange={(event) =>
                setAuditDateRange(event.target.value as AuditDateRange)
              }
            >
              {auditDateOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>

          <label className="platform-search">
            <input
              aria-label="搜索账号或操作对象"
              placeholder="搜索账号 / 操作对象"
              value={auditSearch}
              onChange={(event) => setAuditSearch(event.target.value)}
            />
            <Search size={16} aria-hidden="true" />
          </label>

          <label className="platform-select platform-select-wide">
            <span className="platform-select-label">操作类型：</span>
            <select
              aria-label="操作类型"
              value={auditOperationFilter}
              onChange={(event) =>
                setAuditOperationFilter(
                  event.target.value as AuditOperationFilter,
                )
              }
            >
              {AUDIT_OPERATION_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>

          <label className="platform-select platform-select-wide">
            <span className="platform-select-label">结果：</span>
            <select
              aria-label="结果"
              value={auditResultFilter}
              onChange={(event) =>
                setAuditResultFilter(event.target.value as AuditResultFilter)
              }
            >
              {AUDIT_RESULT_OPTIONS.map((result) => (
                <option key={result} value={result}>
                  {result}
                </option>
              ))}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>

          <button
            type="button"
            className="platform-outline-button"
            onClick={exportAuditRecords}
          >
            <Download size={14} aria-hidden="true" />
            导出记录
          </button>

          <button
            type="button"
            className="platform-primary-button"
            onClick={queryAuditRecords}
          >
            <FileSearch size={14} aria-hidden="true" />
            查询
          </button>

          <span className="platform-action-meta">
            最近查询：{auditQueryTime}
          </span>
        </div>

        <section className="platform-secondary-card">
          <div className="platform-table-scroll">
            <table className="platform-audit-table">
              <thead>
                <tr>
                  <th>操作时间</th>
                  <th>操作人</th>
                  <th>操作内容</th>
                  <th>操作对象</th>
                  <th>客户 / 租户</th>
                  <th>结果</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditLogs.map((audit) => (
                  <tr
                    key={audit.id}
                    className={
                      selectedAudit?.id === audit.id ? "is-selected" : ""
                    }
                  >
                    <td className="is-number">{audit.time}</td>
                    <td>
                      <strong>{audit.operator}</strong>
                    </td>
                    <td>{audit.content}</td>
                    <td>{audit.object}</td>
                    <td>{audit.tenant}</td>
                    <td>
                      <span
                        className={`platform-status ${getStatusClass(audit.result)}`}
                      >
                        {audit.result}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="platform-text-button"
                        onClick={() => setSelectedAuditId(audit.id)}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredAuditLogs.length === 0 && (
            <div className="platform-empty">暂无符合条件的审计日志</div>
          )}
        </section>

        <section className="platform-info-panel">
          {selectedAudit ? (
            <>
              <h2>审计详情 · {selectedAudit.content}</h2>
              <dl>
                <div>
                  <dt>操作人</dt>
                  <dd>
                    {selectedAudit.operator} · {selectedAudit.role}
                  </dd>
                </div>
                <div>
                  <dt>操作对象</dt>
                  <dd>
                    {selectedAudit.tenant} / {selectedAudit.object}
                  </dd>
                </div>
                <div>
                  <dt>执行结果</dt>
                  <dd>
                    {selectedAudit.result} · {selectedAudit.detail}
                  </dd>
                </div>
                <div>
                  <dt>来源 / 请求ID</dt>
                  <dd>
                    {selectedAudit.source} / {selectedAudit.requestId}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="platform-empty platform-empty-detail">
              <h2>未选择日志</h2>
              <p>选择审计日志后查看操作者、执行结果和请求来源。</p>
            </div>
          )}
        </section>
      </>
    )
  }

  function renderSecurityPolicies() {
    const sections: PolicyCard["section"][] = ["登录与会话", "审计与敏感操作"]

    return (
      <>
        <div className="platform-page-action">
          <span className="platform-action-meta">
            最近保存：{policySavedAt}
          </span>
          <button
            type="button"
            className="platform-primary-button"
            onClick={saveAllPolicies}
          >
            <Save size={14} aria-hidden="true" />
            保存修改
          </button>
        </div>

        {sections.map((section) => (
          <section className="platform-policy-section" key={section}>
            <h2>{section}</h2>
            <div className="platform-policy-grid">
              {policyCards
                .filter((card) => card.section === section)
                .map((card) => (
                  <article className="platform-policy-card" key={card.id}>
                    <header>
                      <h3>{card.title}</h3>
                      <button
                        type="button"
                        className="platform-outline-button"
                        onClick={() => {
                          setSelectedPolicyId(card.id)
                          setDialogKind("policy-edit")
                        }}
                      >
                        编辑
                      </button>
                    </header>
                    <dl>
                      {card.rows.map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </>
    )
  }

  function renderSecurityAudit() {
    return (
      <>
        <nav
          className="platform-permission-tabs platform-audit-tabs"
          role="tablist"
          aria-label="安全审计功能"
        >
          {AUDIT_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={auditTab === tab}
              onClick={() => setAuditTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
        {auditTab === "审计日志" ? renderAuditLogs() : renderSecurityPolicies()}
      </>
    )
  }

  function renderCustomerDialog() {
    const isEditing = dialogKind === "customer-edit"
    const customer = isEditing ? selectedCustomer : null
    const title = isEditing ? "编辑客户" : "新建客户"

    return (
      <div className="platform-dialog-backdrop">
        <form
          className="platform-dialog platform-dialog--wide"
          onSubmit={isEditing ? saveCustomerProfile : addCustomer}
        >
          <header>
            <h2>{title}</h2>
            <button
              type="button"
              aria-label={`关闭${title}`}
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body platform-dialog-grid">
            <label>
              客户名称
              <input
                name="name"
                required
                defaultValue={customer?.name ?? ""}
                placeholder="请输入客户名称"
              />
            </label>
            <label>
              行业
              <select
                name="industry"
                defaultValue={customer?.industry ?? "能源服务"}
              >
                <option>能源服务</option>
                <option>制造业</option>
                <option>园区</option>
              </select>
            </label>
            <label>
              站点数量
              <input
                name="sites"
                type="number"
                min="0"
                defaultValue={customer?.sites ?? 1}
                required
              />
            </label>
            <label>
              服务到期
              <input
                name="expiry"
                type="date"
                defaultValue={customer?.expiry ?? "2027-12-31"}
              />
            </label>
            <label>
              状态
              <select name="status" defaultValue={customer?.status ?? "试用中"}>
                <option>正常</option>
                <option>配额预警</option>
                <option>试用中</option>
                <option>即将到期</option>
              </select>
            </label>
            <label>
              客户主体
              <input
                name="entity"
                defaultValue={customer?.entity ?? ""}
                placeholder="请输入客户主体"
              />
            </label>
            <label>
              服务联系人
              <input
                name="contact"
                defaultValue={customer?.contact ?? ""}
                placeholder="请输入联系人"
              />
            </label>
            <label>
              数据区域
              <input
                name="region"
                defaultValue={customer?.region ?? "中国 · 华东"}
                placeholder="请输入数据区域"
              />
            </label>
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button type="submit" className="platform-primary-button">
              <Check size={15} aria-hidden="true" />
              {isEditing ? "保存客户" : "确认新建"}
            </button>
          </footer>
        </form>
      </div>
    )
  }

  function renderEntitlementsDialog() {
    if (!selectedCustomer) return null

    return (
      <div className="platform-dialog-backdrop">
        <form
          className="platform-dialog platform-dialog--wide"
          onSubmit={saveCustomerEntitlements}
        >
          <header>
            <h2>编辑权益 · {selectedCustomer.name}</h2>
            <button
              type="button"
              aria-label="关闭编辑权益"
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body platform-dialog-grid">
            <label>
              合同编号
              <input
                name="contractId"
                defaultValue={selectedCustomer.contractId}
              />
            </label>
            <label>
              服务期限
              <input
                name="contractRange"
                defaultValue={selectedCustomer.contractRange}
              />
            </label>
            <label>
              服务套餐
              <input name="plan" defaultValue={selectedCustomer.plan} />
            </label>
            <label>
              站点配额
              <input
                name="siteQuota"
                defaultValue={selectedCustomer.siteQuota}
              />
            </label>
            <label>
              账号配额
              <input
                name="accountQuota"
                defaultValue={selectedCustomer.accountQuota}
              />
            </label>
            <label>
              API用量
              <input name="apiUsage" defaultValue={selectedCustomer.apiUsage} />
            </label>
            <label>
              SLA
              <input name="sla" defaultValue={selectedCustomer.sla} />
            </label>
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button type="submit" className="platform-primary-button">
              <Check size={15} aria-hidden="true" />
              保存权益
            </button>
          </footer>
        </form>
      </div>
    )
  }

  function renderOrgDialog() {
    const isEditing = dialogKind === "org-edit"
    const title = isEditing ? "编辑组织" : "新增组织"
    const defaultLevel = isEditing
      ? selectedOrg.level
      : selectedOrg.id === "platform"
        ? 0
        : Math.min(selectedOrg.level + 1, 1)

    return (
      <div className="platform-dialog-backdrop">
        <form
          className="platform-dialog"
          onSubmit={isEditing ? saveOrg : addOrg}
        >
          <header>
            <h2>{title}</h2>
            <button
              type="button"
              aria-label={`关闭${title}`}
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body">
            <label>
              组织名称
              <input
                name="name"
                required
                defaultValue={isEditing ? selectedOrg.name : ""}
                placeholder="请输入组织名称"
              />
            </label>
            <label>
              层级
              <select name="level" defaultValue={String(defaultLevel)}>
                <option value="0">一级组织</option>
                <option value="1">二级组织</option>
              </select>
            </label>
            {!isEditing && (
              <p className="platform-dialog-help">
                新组织会插入到当前选中组织之后，确认后自动切换到该组织。
              </p>
            )}
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button type="submit" className="platform-primary-button">
              <Check size={15} aria-hidden="true" />
              {isEditing ? "保存组织" : "确认新增"}
            </button>
          </footer>
        </form>
      </div>
    )
  }

  function renderDeleteOrgDialog() {
    if (!selectedOrg) return null

    return (
      <div className="platform-dialog-backdrop">
        <section className="platform-dialog" role="dialog" aria-modal="true">
          <header>
            <h2>删除组织</h2>
            <button
              type="button"
              aria-label="关闭删除组织"
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body">
            <p className="platform-dialog-help">
              确认删除「{selectedOrg.name}
              」？该组织下成员会移至平台根组织，页面数据会即时更新。
            </p>
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="platform-danger-button"
              onClick={deleteSelectedOrg}
            >
              <Trash2 size={15} aria-hidden="true" />
              确认删除
            </button>
          </footer>
        </section>
      </div>
    )
  }

  function renderMemberDialog() {
    const isEditing = dialogKind === "member-edit"
    const member = isEditing ? selectedMember : null
    const defaultOrg =
      member?.orgPath ??
      memberOrgOptions.find((option) => option.orgId === selectedOrgId)
        ?.label ??
      memberOrgOptions[0].label
    const orgOptions = memberOrgOptions.some(
      (option) => option.label === defaultOrg,
    )
      ? memberOrgOptions
      : [
          { label: defaultOrg, orgId: member?.orgId ?? selectedOrgId },
          ...memberOrgOptions,
        ]
    const title = isEditing ? "编辑成员" : "新增成员"

    return (
      <div className="platform-dialog-backdrop">
        <form
          className="platform-dialog platform-member-dialog platform-dialog--wide"
          onSubmit={isEditing ? saveMember : addMember}
        >
          <header>
            <h2>{title}</h2>
            <button
              type="button"
              aria-label={`关闭${title}`}
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body platform-dialog-grid">
            <label>
              姓名
              <input
                name="name"
                required
                defaultValue={member?.name ?? ""}
                placeholder="请输入姓名"
              />
            </label>
            <label>
              账号
              <input
                name="account"
                required
                defaultValue={member?.account ?? ""}
                placeholder="请输入手机号或邮箱"
              />
            </label>
            <label>
              所属组织
              <select name="org" defaultValue={defaultOrg}>
                {orgOptions.map((option) => (
                  <option key={option.label} value={option.label}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              角色
              <select name="role" defaultValue={member?.role ?? ""} required>
                <option value="" disabled>
                  请选择角色
                </option>
                {memberRoleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              身份来源
              <select name="source" defaultValue={member?.source ?? "本地账号"}>
                <option>本地账号</option>
                <option>企业 SSO</option>
                <option>临时授权</option>
              </select>
            </label>
            <label>
              状态
              <select name="status" defaultValue={member?.status ?? "启用"}>
                <option>启用</option>
                <option>停用</option>
              </select>
            </label>
            <label className="platform-dialog-row">
              临时授权
              <input
                name="temporaryAccess"
                defaultValue={member?.temporaryAccess ?? "无"}
              />
            </label>
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button type="submit" className="platform-primary-button">
              <Check size={15} aria-hidden="true" />
              {isEditing ? "保存成员" : "创建成员"}
            </button>
          </footer>
        </form>
      </div>
    )
  }

  function renderMemberPreviewDialog() {
    if (!selectedMember) return null

    const previewRole = roles.find((role) => role.name === selectedMember.role)

    return (
      <div className="platform-dialog-backdrop">
        <section
          className="platform-dialog platform-dialog--wide"
          role="dialog"
          aria-modal="true"
        >
          <header>
            <h2>权限预览 · {selectedMember.name}</h2>
            <button
              type="button"
              aria-label="关闭权限预览"
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body">
            <div className="platform-preview-panel">
              <dl>
                <div>
                  <dt>账号</dt>
                  <dd>{selectedMember.account}</dd>
                </div>
                <div>
                  <dt>组织</dt>
                  <dd>{selectedMember.orgPath}</dd>
                </div>
                <div>
                  <dt>角色</dt>
                  <dd>{selectedMember.role}</dd>
                </div>
                <div>
                  <dt>资产范围</dt>
                  <dd>{selectedMember.scope}</dd>
                </div>
              </dl>
            </div>
            {previewRole ? (
              <div className="platform-form-table">
                <table>
                  <thead>
                    <tr>
                      <th>功能模块</th>
                      <th>查看</th>
                      <th>编辑</th>
                      <th>执行</th>
                      <th>审批</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRole.rows.map((row) => (
                      <tr key={row.module}>
                        <td>{row.module}</td>
                        <td>{row.view}</td>
                        <td>{row.edit}</td>
                        <td>{row.execute}</td>
                        <td>{row.approve}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="platform-dialog-help">
                当前角色未配置权限矩阵，可先到角色权限中创建同名角色。
              </p>
            )}
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              关闭
            </button>
            <button
              type="button"
              className="platform-primary-button"
              disabled={!previewRole}
              onClick={() => {
                if (!previewRole) return
                setSelectedRoleId(previewRole.id)
                setPermissionTab("角色权限")
                setDialogKind(null)
              }}
            >
              查看角色权限
            </button>
          </footer>
        </section>
      </div>
    )
  }

  function renderRoleDialog() {
    const isEditing = dialogKind === "role-edit"
    const role = isEditing ? selectedRole : null
    const rows = role?.rows ?? DEFAULT_ROLE_ROWS
    const title = isEditing ? "编辑权限" : "新建角色"

    return (
      <div className="platform-dialog-backdrop">
        <form
          className="platform-dialog platform-dialog--wide"
          onSubmit={isEditing ? saveRole : addRole}
        >
          <header>
            <h2>{title}</h2>
            <button
              type="button"
              aria-label={`关闭${title}`}
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body">
            <div className="platform-dialog-grid">
              <label>
                角色名称
                <input
                  name="name"
                  required
                  defaultValue={role?.name ?? ""}
                  placeholder="请输入角色名称"
                />
              </label>
              <label>
                成员数量
                <input
                  name="members"
                  type="number"
                  min="0"
                  defaultValue={role?.members ?? 0}
                />
              </label>
              <label>
                状态
                <select name="status" defaultValue={role?.status ?? "启用"}>
                  <option>启用</option>
                  <option>停用</option>
                </select>
              </label>
              <label>
                范围策略
                <input
                  name="scopeStrategy"
                  defaultValue={role?.scopeStrategy ?? "按成员分别授权"}
                />
              </label>
              <label className="platform-dialog-row">
                当前示例
                <input
                  name="scopeExample"
                  defaultValue={role?.scopeExample ?? "待配置"}
                />
              </label>
              <label className="platform-dialog-row">
                高风险操作
                <input
                  name="highRiskPolicy"
                  defaultValue={role?.highRiskPolicy ?? "高风险操作需审批"}
                />
              </label>
            </div>
            <div className="platform-form-table">
              <table>
                <thead>
                  <tr>
                    <th>功能模块</th>
                    <th>查看</th>
                    <th>编辑</th>
                    <th>执行</th>
                    <th>审批</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.module}>
                      <td>{row.module}</td>
                      {(["view", "edit", "execute", "approve"] as const).map(
                        (field) => (
                          <td key={field}>
                            <select
                              name={`${row.module}-${field}`}
                              defaultValue={row[field]}
                              aria-label={`${row.module}${field}`}
                            >
                              {PERMISSION_VALUES.map((value) => (
                                <option key={value} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button type="submit" className="platform-primary-button">
              <Check size={15} aria-hidden="true" />
              {isEditing ? "保存权限" : "创建角色"}
            </button>
          </footer>
        </form>
      </div>
    )
  }

  function renderGrantDialog() {
    return (
      <div className="platform-dialog-backdrop">
        <form
          className="platform-dialog platform-dialog--wide"
          onSubmit={addGrant}
        >
          <header>
            <h2>新增授权</h2>
            <button
              type="button"
              aria-label="关闭新增授权"
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body platform-dialog-grid">
            <label>
              被授权人
              <input name="grantee" required placeholder="请输入姓名或账号" />
            </label>
            <label>
              所属客户
              <input
                name="customer"
                defaultValue={selectedCustomer?.name ?? "华东能源"}
              />
            </label>
            <label>
              资产范围
              <input name="assetScope" defaultValue={stationGroupName} />
            </label>
            <label>
              授权内容
              <input name="content" defaultValue="查看运行数据" />
            </label>
            <label>
              有效期限
              <input
                name="validRange"
                defaultValue={`${formatNowLabel(dataNow)} — ${grantUntilText}`}
              />
            </label>
            <label>
              有效期至
              <input name="validUntil" defaultValue={grantUntilText} />
            </label>
            <label>
              状态
              <select name="status" defaultValue="生效中">
                <option>生效中</option>
                <option>待复核</option>
                <option>已到期</option>
              </select>
            </label>
            <label>
              授权人
              <input name="authorizer" defaultValue="王凯" />
            </label>
            <label className="platform-dialog-row">
              允许操作
              <input
                name="allowedActions"
                defaultValue="运行数据查看、工单协同"
              />
            </label>
            <label className="platform-dialog-row">
              控制权限
              <input
                name="controlLimit"
                defaultValue="不可修改策略，不可导出报表"
              />
            </label>
            <label className="platform-dialog-row">
              授权原因
              <textarea name="reason" defaultValue="现场巡检支持" />
            </label>
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button type="submit" className="platform-primary-button">
              <Check size={15} aria-hidden="true" />
              创建授权
            </button>
          </footer>
        </form>
      </div>
    )
  }

  function renderRevokeGrantDialog() {
    if (!selectedGrant) return null

    return (
      <div className="platform-dialog-backdrop">
        <section className="platform-dialog" role="dialog" aria-modal="true">
          <header>
            <h2>撤销临时授权</h2>
            <button
              type="button"
              aria-label="关闭撤销临时授权"
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body">
            <p className="platform-dialog-help">
              确认撤销「{selectedGrant.grantee}」对 {selectedGrant.assetScope}{" "}
              的临时授权？撤销后状态会变为已到期。
            </p>
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="platform-danger-button"
              onClick={revokeSelectedGrant}
            >
              <Trash2 size={15} aria-hidden="true" />
              确认撤销
            </button>
          </footer>
        </section>
      </div>
    )
  }

  function renderRuleDialog() {
    const isEditing = dialogKind === "rule-edit"
    const rule = isEditing ? selectedRule : null
    const title = isEditing ? "编辑审批规则" : "新建审批规则"

    return (
      <div className="platform-dialog-backdrop">
        <form
          className="platform-dialog platform-dialog--wide"
          onSubmit={isEditing ? saveRule : addRule}
        >
          <header>
            <h2>{title}</h2>
            <button
              type="button"
              aria-label={`关闭${title}`}
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body platform-dialog-grid">
            <label>
              规则名称
              <input
                name="name"
                required
                defaultValue={rule?.name ?? ""}
                placeholder="请输入规则名称"
              />
            </label>
            <label>
              业务类型
              <select
                name="businessType"
                defaultValue={rule?.businessType ?? "策略下发"}
              >
                {APPROVAL_BUSINESS_OPTIONS.filter(
                  (type) => type !== "全部",
                ).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              适用范围
              <input name="scope" defaultValue={rule?.scope ?? "全站点"} />
            </label>
            <label>
              审批人
              <input
                name="approver"
                defaultValue={rule?.approver ?? "运营负责人"}
              />
            </label>
            <label>
              状态
              <select name="status" defaultValue={rule?.status ?? "启用"}>
                <option>启用</option>
                <option>停用</option>
              </select>
            </label>
            <label>
              审批方式
              <input
                name="approvalMethod"
                defaultValue={rule?.approvalMethod ?? "逐级审批"}
              />
            </label>
            <label className="platform-dialog-row">
              审批顺序
              <input
                name="flow"
                defaultValue={
                  rule?.flow.join(" → ") ?? "提交人 → 运营负责人 → 审批通过"
                }
              />
            </label>
            <label className="platform-dialog-row">
              同人处理
              <input
                name="samePersonRule"
                defaultValue={
                  rule?.samePersonRule ?? "提交人与审批人不可为同一人"
                }
              />
            </label>
            <label className="platform-dialog-row">
              驳回处理
              <textarea
                name="rejectPolicy"
                defaultValue={
                  rule?.rejectPolicy ?? "退回提交人，修改后重新提交"
                }
              />
            </label>
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button type="submit" className="platform-primary-button">
              <Check size={15} aria-hidden="true" />
              {isEditing ? "保存规则" : "创建规则"}
            </button>
          </footer>
        </form>
      </div>
    )
  }

  function renderPolicyDialog() {
    if (!selectedPolicy) return null

    return (
      <div className="platform-dialog-backdrop">
        <form
          className="platform-dialog platform-dialog--wide"
          onSubmit={savePolicy}
        >
          <header>
            <h2>编辑策略 · {selectedPolicy.title}</h2>
            <button
              type="button"
              aria-label="关闭编辑策略"
              onClick={() => setDialogKind(null)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="platform-dialog-body">
            {selectedPolicy.rows.map(([label, value], index) => (
              <label key={label}>
                {label}
                <input name={`row-${index}`} defaultValue={value} />
              </label>
            ))}
          </div>
          <footer>
            <button
              type="button"
              className="platform-outline-button"
              onClick={() => setDialogKind(null)}
            >
              取消
            </button>
            <button type="submit" className="platform-primary-button">
              <Check size={15} aria-hidden="true" />
              保存策略
            </button>
          </footer>
        </form>
      </div>
    )
  }

  return (
    <main className="platform-page">
      <h1 className="platform-sr-title">平台管理</h1>
      {visibleTabs.length > 1 && (
        <nav className="platform-tabs" aria-label="平台管理二级导航">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              aria-current={activeTab === tab ? "page" : undefined}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      )}

      <div className={`platform-content${activeTab === "组织权限" ? " platform-content--orgv2" : ""}`}>
        {activeTab === "客户管理"
          ? renderCustomerManagement()
          : activeTab === "组织权限"
            ? <OrganizationPermissions stations={stations} />
            : renderSecurityAudit()}
      </div>

      {notice && (
        <div className="platform-notice" role="status">
          {notice}
          <button
            type="button"
            aria-label="关闭提示"
            onClick={() => setNotice("")}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}

      {(dialogKind === "customer-create" || dialogKind === "customer-edit") &&
        renderCustomerDialog()}
      {dialogKind === "entitlements-edit" && renderEntitlementsDialog()}
      {(dialogKind === "org-create" || dialogKind === "org-edit") &&
        renderOrgDialog()}
      {dialogKind === "org-delete" && renderDeleteOrgDialog()}
      {(dialogKind === "member-create" || dialogKind === "member-edit") &&
        renderMemberDialog()}
      {dialogKind === "member-preview" && renderMemberPreviewDialog()}
      {(dialogKind === "role-create" || dialogKind === "role-edit") &&
        renderRoleDialog()}
      {dialogKind === "grant-create" && renderGrantDialog()}
      {dialogKind === "grant-revoke" && renderRevokeGrantDialog()}
      {(dialogKind === "rule-create" || dialogKind === "rule-edit") &&
        renderRuleDialog()}
      {dialogKind === "policy-edit" && renderPolicyDialog()}
    </main>
  )
}

export default function PlatformManagementPage(props: { stations?: Station[]; allowedTabs?: readonly PlatformTab[]; registerLeaveGuard?: (guard: null | (() => Promise<boolean>)) => void }) {
  if (!DEMO_MODE) return <ApiPlatformManagement stations={props.stations ?? []} allowedTabs={props.allowedTabs ?? TABS} registerLeaveGuard={props.registerLeaveGuard} />
  return <DemoPlatformManagementPage {...props} />
}
