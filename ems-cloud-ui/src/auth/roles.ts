export type UserRole = "owner" | "operator" | "integrator"

export type NavLabel =
  | "总览"
  | "资产与站点"
  | "运营中心"
  | "运维中心"
  | "工单与审批"
  | "分析与报告"
  | "平台管理"
  | "设置"

export type StationSubNav =
  | "站点概览"
  | "运营收益"
  | "运行策略"
  | "告警信息"
  | "运行曲线"
  | "一次接线图"
  | "设备详情"
  | "电价设置"

export type RoleConfig = {
  label: string
  shortLabel: string
  description: string
  defaultNav: NavLabel
  nav: NavLabel[]
  stationSubNavs: StationSubNav[]
  operationsTabs: Array<"运营总览" | "策略执行" | "市场服务" | "收益结算">
  maintenanceTabs: Array<"运维总览" | "告警事件" | "设备健康" | "固件升级">
  workOrderViews: Array<"工单中心" | "审批中心" | "我的待办">
  analysisTabs: Array<"数据分析" | "数据下载" | "报告中心">
  reportTypes: Array<"运营报告" | "收益报告" | "设备健康报告">
  platformTabs: Array<"客户管理" | "组织权限" | "安全审计">
  canEditAssets: boolean
  showAssetRevenue: boolean
  canCreateAlarmOrder: boolean
  showGlobalAi: boolean
}

export const ROLE_CONFIG: Record<UserRole, RoleConfig> = {
  owner: {
    label: "电站业主 / 能源投资商",
    shortLabel: "电站业主",
    description: "查看资产运营、收益表现与安全状态",
    defaultNav: "总览",
    nav: ["总览", "资产与站点", "运营中心", "分析与报告", "设置"],
    stationSubNavs: ["站点概览", "运营收益", "告警信息", "运行曲线", "一次接线图", "设备详情"],
    operationsTabs: ["运营总览", "收益结算"],
    maintenanceTabs: [],
    workOrderViews: [],
    analysisTabs: ["数据分析", "数据下载", "报告中心"],
    reportTypes: ["运营报告", "收益报告"],
    platformTabs: [],
    canEditAssets: false,
    showAssetRevenue: true,
    canCreateAlarmOrder: false,
    showGlobalAi: true,
  },
  operator: {
    label: "运维人员 / 运维操作员",
    shortLabel: "运维人员",
    description: "处理告警、设备异常、巡检任务与运维工单",
    defaultNav: "运维中心",
    nav: ["总览", "资产与站点", "运维中心", "工单与审批", "分析与报告", "设置"],
    stationSubNavs: ["站点概览", "运行策略", "告警信息", "运行曲线", "一次接线图", "设备详情"],
    operationsTabs: [],
    maintenanceTabs: ["运维总览", "告警事件", "设备健康", "固件升级"],
    workOrderViews: ["工单中心", "我的待办"],
    analysisTabs: ["数据分析", "数据下载", "报告中心"],
    reportTypes: ["设备健康报告"],
    platformTabs: [],
    canEditAssets: false,
    showAssetRevenue: false,
    canCreateAlarmOrder: true,
    showGlobalAi: true,
  },
  integrator: {
    label: "安装商 / 服务商 / 系统集成商",
    shortLabel: "安装服务商",
    description: "负责建站、设备接入、调试、升级与账号交付",
    defaultNav: "资产与站点",
    nav: ["总览", "资产与站点", "运维中心", "工单与审批", "平台管理", "设置"],
    stationSubNavs: ["站点概览", "运行策略", "告警信息", "运行曲线", "一次接线图", "设备详情", "电价设置"],
    operationsTabs: [],
    maintenanceTabs: ["告警事件", "设备健康", "固件升级"],
    workOrderViews: ["工单中心", "我的待办"],
    analysisTabs: [],
    reportTypes: [],
    platformTabs: ["组织权限"],
    canEditAssets: true,
    showAssetRevenue: false,
    canCreateAlarmOrder: true,
    showGlobalAi: false,
  },
}

export type AuthUser = {
  id: string
  name: string
  account: string
  role: UserRole
  organization: string
  stationIds: string[]
  permissions: string[]
}

export const DEMO_USERS: Array<AuthUser & { password: string; requiresMfa: boolean }> = [
  {
    id: "user-owner-demo",
    name: "周新岸",
    account: "owner@enerlution.cn",
    password: "Demo@2026",
    role: "owner",
    organization: "华东资产管理中心",
    stationIds: ["1", "2"],
    permissions: ["asset.read", "revenue.read", "report.export"],
    requiresMfa: false,
  },
  {
    id: "user-operator-demo",
    name: "陈明",
    account: "operator@enerlution.cn",
    password: "Demo@2026",
    role: "operator",
    organization: "华东运维中心",
    stationIds: ["1", "2"],
    permissions: ["alarm.handle", "workorder.manage", "strategy.execute", "firmware.upgrade"],
    requiresMfa: true,
  },
  {
    id: "user-integrator-demo",
    name: "林启明",
    account: "integrator@enerlution.cn",
    password: "Demo@2026",
    role: "integrator",
    organization: "系统集成交付组",
    stationIds: ["*"],
    permissions: ["station.manage", "device.configure", "firmware.upgrade", "member.manage"],
    requiresMfa: true,
  },
]

export function canAccessStation(user: AuthUser, stationId: string) {
  return user.stationIds.includes("*") || user.stationIds.includes(stationId)
}
