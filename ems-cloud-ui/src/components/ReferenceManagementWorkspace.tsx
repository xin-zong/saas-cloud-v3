import {useAuth} from '@/auth/AuthContext'
import TenantAdministration from '@/tenant/TenantAdministration'
import {managementRoutes} from '@/tenant/referenceManagement'
import {useTenantQuery,QueryState} from '@/tenant/shared'
import type {Row} from '@/tenant/types'
import {PageHeader,Badge} from '@/components/ui/Workspace'

/** Reuses main's tenant pages and server authorization; this menu adds no grants. */
export default function ReferenceManagementWorkspace({page}:{page:string}){
 const {user}=useAuth()
 const routes=user?managementRoutes(page,user):[]
 if(!routes.length)return <section className="tenant-card" role="status"><h2>当前账户无访问权限</h2><p>请联系管理员分配菜单和业务权限。</p></section>
 if(page==='saas-account'&&user?.tenant?.kind==='enterprise')return <main className="tenant-page"><CompanyAccountPage/></main>
 return <TenantAdministration key={`${page}:${user?.id}:${routes.join('|')}`} routeScope={routes}/>
}
function CompanyAccountPage(){
 const profile=useTenantQuery<Row>('/company/profile')
 return <><PageHeader title="账户中心" description="当前企业账户与已分配权限包。"/><QueryState loading={profile.loading} error={profile.error}/>{profile.data&&<>
  <section className="tenant-card"><h2>企业账户</h2><dl className="tenant-detail-grid"><div><dt>企业名称</dt><dd>{profile.data.name||'—'}</dd></div><div><dt>管理员登录邮箱</dt><dd>{profile.data.email||'—'}</dd></div><div><dt>企业状态</dt><dd>{typeof profile.data.enabled==='boolean'?(profile.data.enabled?'启用':'停用'):'—'}</dd></div></dl></section>
  <section className="tenant-card"><h2>已分配权限包</h2>{Array.isArray(profile.data.packages)&&profile.data.packages.length?<table className="tenant-table"><thead><tr><th>权限包</th><th>状态</th></tr></thead><tbody>{profile.data.packages.map((pack:Row)=><tr key={pack.id}><td>{pack.name}</td><td><Badge>{pack.enabled?'启用':'停用'}</Badge></td></tr>)}</tbody></table>:<p>暂无已分配权限包</p>}</section>
 </>}</>
}
