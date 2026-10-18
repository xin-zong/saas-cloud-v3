import { ROLE_CONFIG, type AuthUser, type RoleConfig } from "./roles"
import {menuRoutes} from '@/tenant/permissionTree'

/** API actions always use the resource map, never the navigation union. */
export function hasStationPermission(user: AuthUser | null | undefined, stationId: string | number | undefined, permission: string): boolean {
  return !!user?.stationPermissions?.[String(stationId)]?.includes(permission)
}

export function stationRoleConfig(user: AuthUser, stationId: string): RoleConfig {
  return apiRoleConfig({...user, permissions: user.stationPermissions?.[stationId] ?? []})
}

/** Server permissions define the API workspace; role labels only describe the user. */
export function apiRoleConfig(user: AuthUser): RoleConfig {
  const has = (...permissions: string[]) =>
    permissions.some((p) => user.permissions.includes(p))
  const config: RoleConfig = {
    ...ROLE_CONFIG[user.role],
    defaultNav: "总览",
    nav: ["总览"],
    stationSubNavs: ["站点概览"],
    operationsTabs: [],
    maintenanceTabs: [],
    workOrderViews: [],
    analysisTabs: [],
    reportTypes: [],
    platformTabs: [],
    canEditAssets: has("asset.edit"),
    showAssetRevenue: has("revenue.read"),
    canCreateAlarmOrder: has("workorder.create"),
    showGlobalAi: false,
  }
  if (has("asset.read")) { config.nav.push("资产与站点"); config.stationSubNavs.push("场站数据", "子场站", "设备详情", "一次接线图") }
  if (has("alarm.read")) {
    config.stationSubNavs.push("告警信息")
    config.maintenanceTabs.push("运维总览", "告警事件")
  }
  if (has("asset.read", "inspection.manage"))
    config.maintenanceTabs.push("设备健康", "固件升级")
  if (has("telemetry.read")) {
    config.stationSubNavs.push("运行曲线")
    config.analysisTabs.push("数据分析", "数据下载")
  }
  if (has("strategy.read")) {
    config.stationSubNavs.push("运行策略")
    config.operationsTabs.push("策略执行")
  }
  if (has("tariff.manage")) {config.stationSubNavs.push("电价设置"); config.operationsTabs.push("电价设置")}
  if (has("market.read")) config.operationsTabs.push("市场服务")
  if (has("revenue.read")) {
    config.stationSubNavs.push("运营收益")
    config.operationsTabs.push("收益结算")
  }
  if (config.operationsTabs.length) {
    config.stationSubNavs.push('运营管理')
    config.operationsTabs.unshift("运营总览")
    config.nav.push("运营中心")
  }
  if (config.maintenanceTabs.length) {config.nav.push("运维中心");config.stationSubNavs.push('运维管理')}
  if (has("workorder.read", "workorder.create")) config.workOrderViews.push("工单中心")
  if (has("approval.read", "strategy.manage"))
    config.workOrderViews.push("审批中心")
  if (has("workorder.read", "inspection.manage") || (has("approval.read") && has("approval.review")))
    config.workOrderViews.push("我的待办")
  if (config.workOrderViews.length) config.nav.push("工单与审批")
  if (has("report.export")) {
    if (has("strategy.read") && has("telemetry.read")) config.reportTypes.push("运营报告")
    if (has("revenue.read")) config.reportTypes.push("收益报告")
    if (has("asset.read") && has("alarm.read") && has("telemetry.read")) config.reportTypes.push("设备健康报告")
    if (config.reportTypes.length) config.analysisTabs.push("报告中心")
  }
  if (config.analysisTabs.length) config.nav.push("分析与报告")
  config.nav.push("设置")
  if(user.tenant){
    const routes=menuRoutes(user.menus??[])
    const labels:Record<string,import('./roles').NavLabel>={overview:'总览',assets:'资产与站点',workorders:'工单与审批',analytics:'分析与报告'}
    config.nav=Object.entries(labels).filter(([key])=>routes.includes(key)).map(([,label])=>label)
    if(routes.some(r=>['assets','operations','maintenance'].includes(r))&&!config.nav.includes('资产与站点'))config.nav.push('资产与站点')
    if(routes.some(r=>(r.startsWith('company.')||r.startsWith('platform.'))&&!['platform.menus','platform.packages','platform.templates'].includes(r)))config.nav.push('企业管理')
    if(routes.some(r=>['platform.menus','platform.packages','platform.templates'].includes(r)))config.nav.push('套餐权限管理')
    config.nav.push('设置');config.defaultNav=config.nav[0];config.label=user.roleNames?.join('、')||'未分配角色';config.shortLabel=config.label
  }
  return config
}
