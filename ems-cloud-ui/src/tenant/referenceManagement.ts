import type {AuthUser} from '@/auth/roles'
import {menuRoutes} from './permissionTree'
export const REFERENCE_MANAGEMENT_PAGES=['company','saas-account','saas-service','organization','roles','logs'] as const
export type ReferenceManagementPage=typeof REFERENCE_MANAGEMENT_PAGES[number]
type Rule={route:string;side:'enterprise'|'platform';permission:string}
export const REFERENCE_MANAGEMENT_ROUTES:Record<ReferenceManagementPage,readonly Rule[]>={
 company:[{route:'company.profile',side:'enterprise',permission:'company.profile.read'},{route:'platform.approvals',side:'platform',permission:'company.application.read'},{route:'platform.companies',side:'platform',permission:'company.read'}],
 'saas-account':[{route:'company.profile',side:'enterprise',permission:'company.profile.read'},{route:'platform.packages',side:'platform',permission:'package.manage'},{route:'platform.menus',side:'platform',permission:'menu.manage'},{route:'platform.templates',side:'platform',permission:'role.template.manage'}],
 'saas-service':[{route:'company.grants',side:'enterprise',permission:'company.grant.manage'}],
 organization:[{route:'company.people',side:'enterprise',permission:'company.people.read'},{route:'platform.people',side:'platform',permission:'company.people.read'}],
 roles:[{route:'company.roles',side:'enterprise',permission:'company.role.manage'},{route:'platform.roles',side:'platform',permission:'company.role.manage'}],
 logs:[{route:'platform.audit',side:'platform',permission:'audit.read'}],
}
export function isReferenceManagementPage(page:string):page is ReferenceManagementPage{return REFERENCE_MANAGEMENT_PAGES.some(value=>value===page)}
export function managementRoutes(page:string,user:Pick<AuthUser,'permissions'|'tenant'|'menus'>):string[]{
 if(!isReferenceManagementPage(page)||!user.tenant)return []
 const entitled=new Set(menuRoutes(user.menus??[]))
 return REFERENCE_MANAGEMENT_ROUTES[page].filter(rule=>rule.side===user.tenant!.kind&&entitled.has(rule.route)&&user.permissions.includes(rule.permission)).map(rule=>rule.route)
}
