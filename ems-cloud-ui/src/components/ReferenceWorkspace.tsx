import {useEffect, useState, type ReactNode} from 'react'
import {BarChart3, Monitor, Plug, Settings, ChevronDown, ChevronRight, LayoutDashboard, Building2, Server, Bell, FileChartColumn, ChartNoAxesCombined, Grid2X2, LogOut, UserRound, CircleHelp, Globe} from 'lucide-react'
import type {AuthUser} from '@/auth/roles'
import {referenceSections, referencePages, canOpenReferencePage} from '@/navigation/referenceNavigation'
import './reference-workspace.css'

const sectionIcons = [BarChart3, Monitor, Plug, Settings]
const menuIcons = [LayoutDashboard,Building2,Server,Bell,FileChartColumn,ChartNoAxesCombined,Grid2X2]
export default function ReferenceWorkspace({user,page,onNavigate,onLogout,children}:{user:AuthUser;page:string;onNavigate:(id:string)=>Promise<boolean>;onLogout:()=>void;children:ReactNode}) {
  const [sectionId,setSectionId]=useState('monitor'),[expanded,setExpanded]=useState<string[]>([])
  const [account,setAccount]=useState(false),[busy,setBusy]=useState(false)
  const [utility,setUtility]=useState('')
  useEffect(()=>{const owner=referenceSections.find(s=>s.items.some(p=>p.id===page||p.children?.some(c=>c.id===page)));if(owner)setSectionId(owner.id)},[page])
  const section=referenceSections.find(s=>s.id===sectionId)!
  const selected=referencePages.find(p=>p.id===page)
  const navigate=async(id:string)=>{if(busy)return;setBusy(true);try{if(await onNavigate(id)){const owner=referenceSections.find(s=>s.items.some(p=>p.id===id||p.children?.some(c=>c.id===id)));if(owner)setSectionId(owner.id)}}finally{setBusy(false)}}
  return <div className="reference-shell">
    <aside className="reference-navigation">
      <div className="reference-brand" aria-label="Enerlution">ENERLUTION</div>
      <nav className="reference-rail" aria-label="主导航">
        <div>{referenceSections.map((s,i)=>{const Icon=sectionIcons[i];return <button key={s.id} title={s.label} aria-label={s.label} aria-pressed={sectionId===s.id} disabled={busy} onClick={()=>void navigate((s.items[0].children??[s.items[0]])[0].id)}><Icon size={22}/><span>{s.label}</span></button>})}</div>
        <div className="reference-account"><button title="通知" aria-label="通知" onClick={()=>setUtility('通知')}><Bell size={20}/></button><button title="帮助" aria-label="帮助" onClick={()=>setUtility('帮助')}><CircleHelp size={20}/></button><button title="语言" aria-label="语言" onClick={()=>setUtility('语言')}><Globe size={20}/></button><button title="账户" aria-label="账户" aria-expanded={account} onClick={()=>setAccount(!account)}><UserRound size={22}/></button>{account&&<div className="reference-account-popover"><strong>{user.name}</strong><span>{user.tenantName||user.organization}</span><button onClick={onLogout}><LogOut size={15}/>退出登录</button></div>}{utility&&<div className="reference-account-popover" role="dialog" aria-label={utility}><strong>{utility}</strong><p>{utility==='语言'?'当前展示中文；语言设置页面尚未复刻。':`${utility}入口已建立，内容尚未复刻。`}</p><button onClick={()=>setUtility('')}>关闭</button></div>}</div>
      </nav>
      <div className="reference-menu"><h2>{section.label}</h2>{section.id==='monitor'&&<div className="reference-company" title="当前登录企业">{user.tenantName||user.organization||'当前企业'}</div>}
        <nav aria-label={`${section.label}菜单`}>{section.items.map((item,i)=>{const Icon=menuIcons[i%menuIcons.length],open=expanded.includes(item.id);return <div key={item.id}>
          {item.children?<><button className="reference-menu-item" aria-expanded={open} onClick={()=>setExpanded(old=>open?old.filter(id=>id!==item.id):[...old,item.id])}><Icon size={19}/><span>{item.label}</span>{open?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button>{open&&<div className="reference-submenu">{item.children.map(child=><button key={child.id} disabled={busy||!canOpenReferencePage(child,user)} title={!canOpenReferencePage(child,user)?'当前账户未获此菜单或功能权限':child.label} aria-current={page===child.id?'page':undefined} onClick={()=>void navigate(child.id)}>{child.label}</button>)}</div>}</>:<button className="reference-menu-item" disabled={busy||!canOpenReferencePage(item,user)} title={!canOpenReferencePage(item,user)?'当前账户未获此菜单或功能权限':item.label} aria-current={page===item.id?'page':undefined} onClick={()=>void navigate(item.id)}><Icon size={19}/><span>{item.label}</span></button>}
        </div>})}</nav>
      </div>
    </aside>
    <main className="reference-main">{!['dashboard','sites','devices'].includes(page)&&<header className="reference-page-title"><h1>{selected?.label??'数据看板'}</h1><span>页面逐项复刻中</span></header>}<div className="reference-page-body">{children}</div></main>
  </div>
}
