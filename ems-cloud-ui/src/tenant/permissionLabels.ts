import type { MenuRow } from './types'

type Name = readonly [chinese: string, english: string]
export const permissionNames: Record<string, Name> = {
  'alarm.handle': ['处理告警', 'Handle alarms'],
  'alarm.read': ['查看告警', 'View alarms'],
  'approval.read': ['查看审批', 'View approvals'],
  'approval.review': ['审批申请', 'Review applications'],
  'asset.create': ['创建站点', 'Create sites'],
  'asset.edit': ['编辑站点', 'Edit sites'],
  'asset.read': ['查看站点与设备', 'View sites and devices'],
  'audit.read': ['查看安全审计', 'View security audit'],
  'company.application.read': ['查看企业申请', 'View enterprise applications'],
  'company.application.review': ['审批企业申请', 'Review enterprise applications'],
  'company.grant.manage': ['管理角色站点授权', 'Manage role and site grants'],
  'company.manage': ['管理企业', 'Manage enterprises'],
  'company.people.manage': ['管理员工', 'Manage employees'],
  'company.people.read': ['查看员工', 'View employees'],
  'company.profile.manage': ['编辑本企业资料', 'Edit enterprise profile'],
  'company.profile.read': ['查看本企业资料', 'View enterprise profile'],
  'company.read': ['查看企业', 'View enterprises'],
  'company.role.manage': ['管理租户角色', 'Manage tenant roles'],
  'ems.manage': ['管理能量管理系统绑定', 'Manage EMS bindings'],
  'ems.query': ['查询能量管理系统状态', 'Query EMS status'],
  'ems.read': ['查看能量管理系统接入', 'View EMS integration'],
  'inspection.manage': ['巡检管理', 'Manage inspections'],
  'market.manage': ['管理内部市场草稿', 'Manage internal market drafts'],
  'market.read': ['查看市场服务与资质', 'View market services and qualifications'],
  'menu.manage': ['管理菜单', 'Manage menus'],
  'overview.read': ['查看总览', 'View overview'],
  'package.manage': ['管理权限包', 'Manage permission packages'],
  'report.export': ['下载数据', 'Download data'],
  'revenue.read': ['查看运营收益', 'View operating revenue'],
  'revenue.review': ['复核收益结算', 'Review revenue settlement'],
  'role.template.manage': ['管理预制角色', 'Manage predefined roles'],
  'strategy.manage': ['编辑运行策略', 'Edit operating strategies'],
  'strategy.read': ['查看运行策略', 'View operating strategies'],
  'tariff.manage': ['电价管理', 'Manage tariffs'],
  'telemetry.read': ['查看遥测点与历史', 'View telemetry points and history'],
  'tenant.data.read': ['跨租户读取数据', 'Read cross-tenant data'],
  'tenant.data.write': ['跨租户控制数据', 'Control cross-tenant data'],
  'workorder.create': ['新建工单', 'Create work orders'],
  'workorder.edit': ['编辑工单', 'Edit work orders'],
  'workorder.handle': ['处理工单', 'Handle work orders'],
  'workorder.read': ['查看工单', 'View work orders'],
}
export const menuNames: Record<string, Name> = {
  overview: ['总览', 'Overview'], assets: ['资产与站点', 'Assets & sites'],
  operations: ['运营中心', 'Operations'], maintenance: ['运维中心', 'Maintenance'],
  workorders: ['工单与审批', 'Work orders & approvals'], analytics: ['分析与报告', 'Analysis & reports'],
  platform: ['平台管理', 'Platform management'], settings: ['设置', 'Settings'],
  'company.enterprise': ['企业管理', 'Enterprise management'],
  'platform.company': ['平台企业管理', 'Platform enterprise management'],
  'platform.permission': ['套餐权限管理', 'Packages & permissions'],
  'platform.approval': ['企业申请审批', 'Enterprise application approvals'],
  'company.profile': ['企业资料', 'Enterprise profile'],
  'company.people': ['员工管理', 'Employee management'],
  'company.roles': ['角色管理', 'Role management'],
  'company.grants': ['站点授权', 'Site grants'],
  'platform.approvals': ['企业审批', 'Enterprise approvals'],
  'platform.companies': ['企业管理', 'Enterprise management'],
  'platform.menus': ['菜单管理', 'Menu management'],
  'platform.packages': ['权限包管理', 'Permission packages'],
  'platform.templates': ['企业预制角色', 'Enterprise predefined roles'],
  'platform.people': ['平台员工', 'Platform employees'],
  'platform.roles': ['平台角色', 'Platform roles'],
  'platform.audit': ['安全审计', 'Security audit'],
}
const roleNames: Name[] = [
  ['管理员', 'Admin'], ['工程师', 'Engineer'],
  ['超级管理员', 'Super Admin'], ['平台管理员', 'Platform Admin'],
  ['企业管理员', 'Enterprise Admin'], ['审批管理员', 'Approval Manager'],
  ['平台运维人员', 'Support Agent'], ['安装服务商', 'Installer'],
  ['业主', 'Owner'], ['运维人员', 'Operator'], ['只读用户', 'Viewer'],
]
const allNames = [...Object.values(menuNames), ...Object.values(permissionNames), ...roleNames]
export const clientLabel = (client: string, language: string) =>
  language === 'English' ? (client === 'web' ? 'Web' : 'Mobile app') : (client === 'web' ? '网页端' : '移动端')
export function knownName(text: string, language: string): string | undefined {
  const pair = allNames.find(p => p.includes(text))
  return pair?.[language === 'English' ? 1 : 0]
}
export function menuSourceLabel(row: MenuRow): string {
  const key = String(row.name_key ?? '')
  if (row.name?.trim()) return row.name.trim()
  if (key && !/^(?:(?:nav|page|action)\.|platform\.action\.)/.test(key)) return key
  const route = row.route_path || key.replace(/^(nav|page)\./, '')
  if (menuNames[route]) return menuNames[route][0]
  const code = row.permission_code || key.replace(/^(?:platform\.)?action\./, '')
  return permissionNames[code]?.[0] || row.permission_name || ''
}
export function sameLanguage(text: string, language: string): boolean {
  return language === 'English' ? !/[\u3400-\u9fff]/.test(text) : !/[A-Za-z]/.test(text)
}
export function localizedName(text: string, language: string, fallback: string, translated?: string): string {
  return knownName(text, language) ?? (sameLanguage(text, language) && text ? text :
    translated && sameLanguage(translated, language) ? translated : fallback)
}
export function menuLabel(row: MenuRow, language = '简体中文', translated?: string): string {
  const fallback = language === 'English' ? `Custom menu (${row.id})` : `自定义菜单（编号 ${row.id}）`
  return localizedName(menuSourceLabel(row), language, fallback, translated)
}
export function permissionLabel(code: string, name: string, language: string, translated?: string): string {
  return permissionNames[code]?.[language === 'English' ? 1 : 0] ??
    localizedName(name, language, language === 'English' ? 'Custom permission' : '自定义权限', translated)
}
