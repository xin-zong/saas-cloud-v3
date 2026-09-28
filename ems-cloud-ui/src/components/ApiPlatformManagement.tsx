import { useEffect, useRef, useState } from "react"
import type { Station } from "@/App"
import { allRows } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import RolePermissionsPanel, { type RolePermissionsHandle } from "./RolePermissionsPanel"
import MemberOrganizationPanel from "./MemberOrganizationPanel"
import PlatformCustomersPanel from "./PlatformCustomersPanel"
import PlatformAuditPanel, {type PlatformAuditRow} from "./PlatformAuditPanel"
import PlatformConfigurationPanel from "./PlatformConfigurationPanel"
import PlatformTemporaryGrants from "./PlatformTemporaryGrants"
import "./platform-management.css"
import "./organization-permissions.css"
import "./api-platform-management.css"
import "./platform-figma.css"
type Tab = "客户管理" | "组织权限" | "安全审计"
type OrgView = "成员管理" | "组织管理" | "角色权限" | "临时授权"
export default function ApiPlatformManagement({stations,allowedTabs,registerLeaveGuard}:{stations:Station[];allowedTabs:readonly Tab[];registerLeaveGuard?:(guard:null|(()=>Promise<boolean>))=>void}){
 const {user}=useAuth();const [tab,setTab]=useState<Tab>(allowedTabs[0]??"组织权限"),[config,setConfig]=useState(false)
 const has=(p:string)=>!!user?.permissions.includes(p),canMembers=["organization.member.read","member.manage.profile","member.grant.manage"].some(has),canOrganizations=["organization.member.read","organization.manage"].some(has),canRoles=has("role.manage"),canConfigure=canRoles||has("organization.manage")
 const views:OrgView[]=[canMembers&&"成员管理",canOrganizations&&"组织管理",canRoles&&"角色权限",(has("organization.member.read")||has("member.grant.manage"))&&"临时授权"].filter((v):v is OrgView=>!!v)
 const [view,setView]=useState<OrgView>(canMembers?"成员管理":canOrganizations?"组织管理":"角色权限")
 const panel=useRef<RolePermissionsHandle>(null);const requestLeave=()=>panel.current?.requestLeave()??Promise.resolve(true)
 useEffect(()=>{registerLeaveGuard?.(requestLeave);return()=>registerLeaveGuard?.(null)},[registerLeaveGuard])
 const [audits,setAudits]=useState<PlatformAuditRow[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false)
 useEffect(()=>{const controller=new AbortController();setAudits([]);setError("");if(tab!=="安全审计"||config||!has("audit.read"))return;setLoading(true);allRows<PlatformAuditRow>("/audit",controller.signal).then(rows=>{if(!controller.signal.aborted)setAudits(rows)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[tab,config,user?.id,has("audit.read")])
 useEffect(()=>{if(!allowedTabs.includes(tab)&&allowedTabs[0])setTab(allowedTabs[0]);if(!views.includes(view)&&views[0])setView(views[0]);if(!canConfigure)setConfig(false)},[allowedTabs.join("|"),views.join("|"),canConfigure,tab,view])
 async function changeTab(next:Tab){if(next===tab&&!config)return;if(!(await requestLeave()))return;setConfig(false);setTab(next)}
 if(!allowedTabs.length)return <main className="platform-page api-platform"><p role="status">暂无可访问的平台管理页面</p></main>
 return <main className="platform-page api-platform platform-figma"><h1 className="platform-sr-title">平台管理</h1><nav className="platform-tabs" aria-label="平台管理二级导航">{allowedTabs.map(t=><button key={t} aria-current={!config&&tab===t?"page":undefined} onClick={()=>void changeTab(t)}>{t}</button>)}{canConfigure&&<button className="platform-config-entry" aria-current={config?"page":undefined} onClick={async()=>{if(await requestLeave())setConfig(true)}}>配置中心</button>}</nav><div className="platform-content platform-content--orgv2">
 {config?<PlatformConfigurationPanel key={`${user?.id}:config`} ref={panel} onTemporaryGrants={views.includes("临时授权")?()=>{setConfig(false);setTab("组织权限");setView("临时授权")}:undefined}/>:tab==="客户管理"?<PlatformCustomersPanel ref={panel}/>:tab==="组织权限"?<section className="orgv2" aria-label="组织权限"><nav className="orgv2-tabs" role="tablist">{views.map(v=><button key={v} role="tab" aria-selected={view===v} onClick={async()=>{if(v!==view&&await requestLeave())setView(v)}}>{v}</button>)}</nav>{view==="角色权限"?<RolePermissionsPanel ref={panel} onOpenMembers={canMembers?()=>setView("成员管理"):undefined}/>:view==="临时授权"?<PlatformTemporaryGrants ref={panel}/>:<MemberOrganizationPanel key={view} ref={panel} view={view}/>}</section>:<>{loading&&<p role="status">正在读取审计…</p>}{error&&<p className="api-inline-error" role="alert">{error}</p>}<PlatformAuditPanel rows={audits}/></>}
 </div></main>
}
