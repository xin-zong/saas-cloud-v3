import {isReferenceManagementPage,managementRoutes} from '@/tenant/referenceManagement'
import type { AuthUser } from '@/auth/roles'

export type ReferencePage = { id: string; label: string; permissions?: string[]; entitlements?: string[]; children?: ReferencePage[] }
export type ReferenceSection = { id: string; label: string; items: ReferencePage[] }
// Chinese labels and order from the read-only, verified QUDEOX menu captures.
export const referenceSections: ReferenceSection[] = [
  { id: 'monitor', label: '监控', items: [
    { id: 'dashboard', label: '数据看板', entitlements: ['overview'] },
    { id: 'sites', label: '场站', permissions: ['asset.read'], entitlements: ['assets'] },
    { id: 'devices', label: '设备', permissions: ['asset.read'], entitlements: ['assets'] },
    { id: 'alarm', label: '报警', children: [
      { id: 'alarm-live', label: '实时报警', permissions: ['alarm.read'], entitlements: ['maintenance','assets'] },
      { id: 'alarm-history', label: '报警历史', permissions: ['alarm.read'], entitlements: ['maintenance','assets'] },
      { id: 'alarm-rules', label: '报警规则', permissions: ['alarm.read'], entitlements: ['maintenance','assets'] },
    ] },
    { id: 'report', label: '报表', children: [
      { id: 'report-common', label: '常规报表', permissions: ['report.export'], entitlements: ['analytics'] },
      { id: 'report-operation', label: '生产运行报表', permissions: ['report.export'], entitlements: ['analytics'] },
    ] },
    { id: 'analysis', label: 'AI智能分析', children: [
      { id: 'comparison', label: '对比', permissions: ['telemetry.read'], entitlements: ['analytics'] },
    ] },
    { id: 'application', label: '服务应用', children: [
      { id: 'tags', label: '场站标签', permissions: ['asset.read'], entitlements: ['assets'] },
      { id: 'tariffs', label: '电价费率', permissions: ['tariff.manage'], entitlements: ['operations','assets'] },
    ] },
  ] },
  { id: 'screen', label: '大屏', items: [{ id: 'screen-default', label: '系统默认大屏', entitlements: ['overview'] }] },
  { id: 'openapi', label: 'OpenAPI', items: [{ id: 'openapi-init', label: '初始化开通', entitlements: ['overview'] }] },
  { id: 'system', label: '管理', items: [
    { id: 'company', label: '企业信息管理', entitlements: ['company.profile','platform.approvals','platform.companies'] },
    { id: 'saas', label: 'SaaS管理', children: [
      { id: 'saas-account', label: '账户中心', entitlements: ['company.profile','platform.packages','platform.menus','platform.templates'] },
      { id: 'saas-service', label: '场站服务管理', entitlements: ['company.grants'] },
    ] },
    { id: 'organization', label: '内部组织管理', entitlements: ['company.people','platform.people'] },
    { id: 'roles', label: '角色管理', entitlements: ['company.roles','platform.roles'] },
    { id: 'logs', label: '平台日志', permissions: ['audit.read'], entitlements: ['platform.audit'] },
  ] },
]
export const referencePages = referenceSections.flatMap(s => s.items.flatMap(p => p.children ?? [p]))
export function canOpenReferencePage(page: ReferencePage, user: Pick<AuthUser,'permissions'|'tenant'|'menus'>): boolean {
  if(isReferenceManagementPage(page.id))return managementRoutes(page.id,user).length>0
  if (page.permissions?.some(p => !user.permissions.includes(p))) return false
  if (!user.tenant) return !['company','organization','roles','saas-account','saas-service'].includes(page.id)
  const paths = (nodes: NonNullable<AuthUser['menus']>): string[] => nodes.flatMap(n => [...(n.path ? [n.path] : []), ...paths(n.children ?? [])])
  return !page.entitlements?.length || page.entitlements.some(p => paths(user.menus ?? []).includes(p))
}
