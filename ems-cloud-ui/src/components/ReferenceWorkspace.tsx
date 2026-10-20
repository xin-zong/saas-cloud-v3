import {BusinessGroupProvider,BusinessGroupPicker} from './BusinessGroupScope'
import {useEffect, useState, type ReactNode} from 'react'
import {BarChart3, Monitor, Plug, Settings, ChevronDown, ChevronRight, LayoutDashboard, Building2, Server, Bell, FileChartColumn, ChartNoAxesCombined, Grid2X2, LogOut, UserRound, CircleHelp, Globe} from 'lucide-react'
import type {AuthUser} from '@/auth/roles'
import {referenceSections, referencePages, canOpenReferencePage} from '@/navigation/referenceNavigation'
import './reference-workspace.css'
import AccountLanguageMenu from './AccountLanguageMenu'
import SettingsDialog from './SettingsDialog'

const sectionIcons = [BarChart3, Monitor, Plug, Settings]
const menuIcons = [LayoutDashboard,Building2,Server,Bell,FileChartColumn,ChartNoAxesCombined,Grid2X2]
type WorkspaceProps={user:AuthUser;page:string;onNavigate:(id:string)=>Promise<boolean>;onLogout:()=>void;children:ReactNode}
export default function ReferenceWorkspace(props:WorkspaceProps){return <BusinessGroupProvider user={props.user}><WorkspaceShell {...props}/></BusinessGroupProvider>}
function WorkspaceShell({user,page,onNavigate,onLogout,children}:WorkspaceProps) {
  const [sectionId,setSectionId]=useState('monitor'),[expanded,setExpanded]=useState<string[]>([])
  const [account,setAccount]=useState(false),[busy,setBusy]=useState(false)
  const [utility,setUtility]=useState('')
  useEffect(()=>{const owner=referenceSections.find(s=>s.items.some(p=>p.id===page||p.children?.some(c=>c.id===page)));if(owner)setSectionId(owner.id)},[page])
  const section=referenceSections.find(s=>s.id===sectionId)!
  const selected=referencePages.find(p=>p.id===page)
  const personalTitle:Record<string,string>={'settings-personal':'个人中心','settings-notifications':'通知设置','settings-display':'语言与显示','settings-security':'账户安全','messages':'消息列表'}
  const navigate=async(id:string)=>{if(busy)return;setBusy(true);try{if(await onNavigate(id)){const owner=referenceSections.find(s=>s.items.some(p=>p.id===id||p.children?.some(c=>c.id===id)));if(owner)setSectionId(owner.id)}}finally{setBusy(false)}}
  return <div className="reference-shell">
    <aside className="reference-navigation">
      <div className="reference-brand" aria-label="Enerlution">ENERLUTION</div>
      <nav className="reference-rail" aria-label="主导航">
        <div>{referenceSections.map((s,i)=>{const Icon=sectionIcons[i];return <button key={s.id} title={s.label} aria-label={s.label} aria-pressed={sectionId===s.id} disabled={busy} onClick={()=>void navigate((s.items[0].children??[s.items[0]])[0].id)}><Icon size={22}/><span>{s.label}</span></button>})}</div>
        <div className="reference-account"><button title="通知" aria-label="通知" onClick={()=>void navigate('messages')}><Bell size={20}/></button><button title="帮助" aria-label="帮助" onClick={()=>setUtility('帮助')}><CircleHelp size={20}/></button><button title="语言" aria-label="语言" onClick={()=>setUtility('语言')}><Globe size={20}/></button><button title="账户" aria-label="账户" aria-expanded={account} onClick={()=>setAccount(!account)}><UserRound size={22}/></button>{account&&<div className="reference-account-popover"><strong>{user.name}</strong><span>{user.tenantName||user.organization}</span><button onClick={()=>{setAccount(false);void navigate('settings-personal')}}><UserRound size={15}/>个人中心</button><button onClick={()=>{setAccount(false);void navigate('settings-display')}}><Globe size={15}/>语言与显示</button><button onClick={onLogout}><LogOut size={15}/>退出登录</button></div>}{utility&&<SettingsDialog title={utility} onClose={()=>setUtility('')}>{utility==='语言'?<AccountLanguageMenu userId={user.id} onClose={()=>setUtility('')}/>:<p>如需帮助，请联系平台管理员。</p>}</SettingsDialog>}</div>
      </nav>
      <div className="reference-menu"><h2>{section.label}</h2>{section.id==='monitor'&&<BusinessGroupPicker beforeSelect={()=>onNavigate(page==='devices'?'devices':page==='dashboard'?'dashboard':'sites')}/>}
        <nav aria-label={`${section.label}菜单`}>{section.items.map((item,i)=>{const Icon=menuIcons[i%menuIcons.length],open=expanded.includes(item.id);return <div key={item.id}>
          {item.children?<><button className="reference-menu-item" aria-expanded={open} onClick={()=>setExpanded(old=>open?old.filter(id=>id!==item.id):[...old,item.id])}><Icon size={19}/><span>{item.label}</span>{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>{open&&<div className="reference-submenu">{item.children.map(child=><button key={child.id} disabled={busy||!canOpenReferencePage(child,user)} title={!canOpenReferencePage(child,user)?'当前账户未获此菜单或功能权限':child.label} aria-current={page===child.id?'page':undefined} onClick={()=>void navigate(child.id)}>{child.label}</button>)}</div>}</>:<button className="reference-menu-item" disabled={busy||!canOpenReferencePage(item,user)} title={!canOpenReferencePage(item,user)?'当前账户未获此菜单或功能权限':item.label} aria-current={page===item.id?'page':undefined} onClick={()=>void navigate(item.id)}><Icon size={19}/><span>{item.label}</span></button>}
        </div>})}</nav>
      </div>
    </aside>
    <main className="reference-main">{!['dashboard','sites','devices','tags','tariffs'].includes(page)&&!page.startsWith('alarm-')&&<header className={`reference-page-title${page.startsWith('report-')?' reference-report-title':''}`}><h1>{selected?.label??personalTitle[page]??'数据看板'}</h1></header>}<div className="reference-page-body">{children}</div></main>
  </div>
}
