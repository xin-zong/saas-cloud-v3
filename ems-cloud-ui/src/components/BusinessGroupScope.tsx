import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {ChevronDown,ChevronRight} from 'lucide-react'
import type {AuthUser} from '@/auth/roles'
import {api} from '@/api/client'
import LoadingState from './LoadingState'
import './business-group-scope.css'
export type BusinessGroupNode={id:string;type:'enterprise'|'group'|'project'|'unassigned'|'station';name:string;parentId:string|null;stationIds:string[];children:BusinessGroupNode[]}
type Tree={tenantId:string;nodes:BusinessGroupNode[]}
type Scope={businessGroupId:string;node:BusinessGroupNode|null;nodes:BusinessGroupNode[];loading:boolean;error:string;select:(node:BusinessGroupNode)=>void;reload:()=>void}
const empty:Scope={businessGroupId:'',node:null,nodes:[],loading:false,error:'',select:()=>{},reload:()=>{}}
const Context=createContext<Scope>(empty)
export const useBusinessGroupScope=()=>useContext(Context)
export function BusinessGroupProvider({user,children}:{user:AuthUser;children:ReactNode}){
 const key=JSON.stringify([user.id,user.tenant,user.permissions,user.stationPermissions])
 return <BusinessGroupState key={key} user={user}>{children}</BusinessGroupState>
}
function BusinessGroupState({user,children}:{user:AuthUser;children:ReactNode}){
 const [nodes,setNodes]=useState<BusinessGroupNode[]>([]),[node,setNode]=useState<BusinessGroupNode|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');api<Tree>('/station-business-groups/tree',{signal:controller.signal}).then(tree=>{if(!controller.signal.aborted){setNodes(tree.nodes);setNode(null)}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'读取业务组失败')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[revision])
 return <Context.Provider value={{businessGroupId:node&&node.type!=='enterprise'?node.id:'',node,nodes,loading,error,select:setNode,reload:()=>setRevision(n=>n+1)}}>{children}</Context.Provider>
}
export function BusinessGroupPicker({beforeSelect}:{beforeSelect?:()=>Promise<boolean>}){
 const scope=useBusinessGroupScope(),[open,setOpen]=useState(false),[collapsed,setCollapsed]=useState<string[]>([]),[busy,setBusy]=useState(false),host=useRef<HTMLDivElement>(null)
 useEffect(()=>{if(!open)return;const dismiss=(e:PointerEvent)=>{if(!host.current?.contains(e.target as Node))setOpen(false)},key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false)};document.addEventListener('pointerdown',dismiss);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',key)}},[open])
 const choose=async(node:BusinessGroupNode)=>{if(busy)return;setBusy(true);try{if(!beforeSelect||await beforeSelect()){scope.select(node);setOpen(false)}}finally{setBusy(false)}}
 const render=(node:BusinessGroupNode,depth:number):ReactNode=>{const expanded=!collapsed.includes(node.id),children=node.children.length>0;return <div role="treeitem" aria-label={node.type==='enterprise'?'全部场站':node.name} aria-expanded={children?expanded:undefined} aria-selected={scope.node?.id===node.id||!scope.node&&node.type==='enterprise'} key={node.id}><div className="business-group-row" style={{paddingLeft:depth*18+6}}>{children?<button type="button" className="business-group-toggle" aria-label={`${expanded?'收起':'展开'}${node.name}`} onClick={()=>setCollapsed(items=>expanded?[...items,node.id]:items.filter(id=>id!==node.id))}>{expanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>:<span className="business-group-spacer"/>}<button type="button" className="business-group-name" disabled={busy} title={node.name} onClick={()=>void choose(node)}>{node.type==='enterprise'?'全部场站':node.name}</button></div>{children&&expanded&&<div role="group">{node.children.map(child=>render(child,depth+1))}</div>}</div>}
 return <div className="business-group-picker" ref={host}><button className="business-group-trigger" type="button" aria-label="选择业务组范围" aria-expanded={open} onClick={()=>setOpen(!open)}><span>{scope.node&&scope.node.type!=='enterprise'?scope.node.name:'全部场站'}</span>{scope.loading?<LoadingState compact label="读取业务组"/>:<ChevronDown size={16}/>}</button>{open&&<div className="business-group-popup" role="dialog" aria-label="业务组范围">{scope.loading?<LoadingState label="读取业务组…"/>:scope.error?<div role="alert">{scope.error}<button onClick={scope.reload}>重试读取业务组</button></div>:<div role="tree" aria-label="场站业务组树">{scope.nodes.map(node=>render(node,0))}</div>}<small>按业务组筛选场站</small></div>}</div>
}
