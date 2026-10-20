import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {MessageCircle,X} from 'lucide-react'
import type {Station} from '@/App'
import type {AuthUser} from '@/auth/roles'
import {useDisplayPreferences} from '@/preferences/PreferencesProvider'
import {getSessionVersion,refreshAfterForbidden,setToken} from '@/api/client'
import './ems-agent-host.css'

const SOURCE='enerlution-ems-agent'
export default function EmsAgent({user,stations,activeNav,activeStationId}:{user:AuthUser;stations:Station[];activeNav:string;activeStationId?:string|null}){
 const preferences=useDisplayPreferences()
 const [systemDark,setSystemDark]=useState(()=>window.matchMedia('(prefers-color-scheme:dark)').matches)
 useEffect(()=>{const media=window.matchMedia('(prefers-color-scheme:dark)'),update=()=>setSystemDark(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[])
 const [open,setOpen]=useState(false),[mounted,setMounted]=useState(false),[initialized,setInitialized]=useState(false),[width,setWidth]=useState(480),[fullscreen,setFullscreen]=useState(false)
 const frame=useRef<HTMLIFrameElement>(null),trigger=useRef<HTMLButtonElement>(null)
 const context=useMemo(()=>({user:{id:user.id,tenantId:user.tenant?.tenantId??'demo',name:user.name,roles:user.roleNames??[user.role],permissions:user.permissions,stationPermissions:user.stationPermissions},language:preferences.language==='English'?'en':'zh-CN',theme:preferences.theme==='跟随系统'&&systemDark?'dark':'light',timezone:preferences.timezone,stations:stations.map(s=>({id:s.id,name:s.name,code:s.code})),activeNav,activeStationId,visible:open}),[user,stations,activeNav,activeStationId,preferences,systemDark,open])
 const contextRef=useRef(context);contextRef.current=context
 const postContext=useCallback(()=>frame.current?.contentWindow?.postMessage({source:SOURCE,type:'context',context:{...contextRef.current,sessionVersion:getSessionVersion(),viewportWidth:window.innerWidth,viewportHeight:window.innerHeight}},window.location.origin),[])
 const close=useCallback(()=>{setOpen(false);setFullscreen(false);requestAnimationFrame(()=>trigger.current?.focus())},[])
 useEffect(()=>{postContext()},[context,postContext])
 useEffect(()=>{
  if(!mounted)return
  const onMessage=(event:MessageEvent)=>{
   if(event.origin!==location.origin||event.source!==frame.current?.contentWindow||event.data?.source!==SOURCE)return
   if(event.data.type==='ready')postContext()
   if(event.data.type==='close')close()
   if(event.data.type==='unauthorized'){setToken(null);window.dispatchEvent(new Event('enerlution:unauthorized'));close()}
   if(event.data.type==='forbidden')void refreshAfterForbidden()
   if(event.data.type==='layout'){
    setInitialized(true)
    const next=Number(event.data.width)
    if(Number.isFinite(next))setWidth(Math.min(620,Math.max(320,next)))
    setFullscreen(event.data.fullscreen===true)
   }
  }
  const onKey=(event:KeyboardEvent)=>{if(open&&event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();close()}}
  window.addEventListener('message',onMessage);window.addEventListener('resize',postContext);document.addEventListener('keydown',onKey)
  return()=>{window.removeEventListener('message',onMessage);window.removeEventListener('resize',postContext);document.removeEventListener('keydown',onKey)}
 },[mounted,open,postContext,close])
 return createPortal(<div className="ems-agent-host">
  {!open&&<button className="ems-agent-rail" ref={trigger} aria-label="打开 EMSAgent 小助手" onClick={()=>{setMounted(true);setOpen(true)}}><MessageCircle size={18}/><span>EMS3.0 Agent</span></button>}
  {mounted&&<section hidden={!open} className={`ems-agent-frame${fullscreen?' is-fullscreen':''}`} style={{display:open?undefined:'none',width:fullscreen?'100vw':`min(${width}px, 100vw)`}} aria-label="EMSAgent 小助手面板">
   {!initialized&&<button className="ems-agent-close" aria-label="关闭 EMSAgent 小助手" onClick={close}><X size={16}/></button>}
   <iframe ref={frame} title="EMSAgent 小助手" src={`${import.meta.env.BASE_URL}ems-agent.html`} onLoad={postContext}/>
  </section>}
 </div>,document.body)
}
