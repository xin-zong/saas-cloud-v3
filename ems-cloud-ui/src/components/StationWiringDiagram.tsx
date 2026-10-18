import {useEffect,useRef,useState} from 'react'
import {api,ApiError,DEMO_MODE} from '@/api/client'
import {loadWiring,saveWiring,wiringBindings,wiringValues} from '@/api/stationWiring'
import {fromTopology,removeElement,valueLabel,type WiringBinding,type WiringDiagram,type WiringElement,type WiringGraph,type WiringValue} from '@/data/stationWiring'
import {useConfigurationLeaveGuard} from './useConfigurationLeaveGuard'
import type {RegisterLeaveGuard} from './useEditorLeaveGuard'
import './station-wiring.css'

type Props={station:{id:string;name:string};canEdit:boolean;canReadTelemetry:boolean;onOpenDevices:(id?:string)=>void;registerLeaveGuard?:RegisterLeaveGuard}
export default function StationWiringDiagram(props:Props){return <Editor key={props.station.id} {...props}/>}
function Editor({station,canEdit,canReadTelemetry,onOpenDevices,registerLeaveGuard}:Props){
 const [saved,setSaved]=useState<WiringDiagram|null>(null),[draft,setDraft]=useState<WiringGraph|null>(null)
 const [bindings,setBindings]=useState<WiringBinding[]>([]),[values,setValues]=useState<WiringValue[]>([]),[selected,setSelected]=useState('')
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[valueError,setValueError]=useState(''),[busy,setBusy]=useState(false),[conflict,setConflict]=useState(false),[revoked,setRevoked]=useState(false)
 const [edgeSource,setEdgeSource]=useState(''),[edgeTarget,setEdgeTarget]=useState(''),[zoom,setZoom]=useState(1)
 const alive=useRef(true),lock=useRef(false),drag=useRef<{id:string;x:number;y:number;startX:number;startY:number}|null>(null)
 const graph=draft??saved?.graph,editing=!!draft,canWrite=canEdit&&!revoked&&!DEMO_MODE
 const dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(saved?.graph)
 const reset=()=>{setDraft(null);setSelected('');setConflict(false)}
 const leave=useConfigurationLeaveGuard({dirty,busy,registerLeaveGuard,onClose:reset,onDiscard:reset})
 function fail(e:unknown){setError(e instanceof Error?e.message:'接线图操作失败');if(e instanceof ApiError&&e.status===409)setConflict(true);if(e instanceof ApiError&&e.status===403){setRevoked(true);setValues([]);setSaved(null);setDraft(null);setSelected('')}}
 async function refresh(){
  if(lock.current||DEMO_MODE)return;lock.current=true;setBusy(true);setError('')
  try{const result=await loadWiring(station.id);if(alive.current){setSaved(result);reset();setNotice('已读取服务器版本')}}catch(e){if(alive.current)fail(e)}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false}},[])
 useEffect(()=>{
  setValues([]);setValueError('');if(!canReadTelemetry||!saved?.graph||editing||DEMO_MODE)return
  const controller=new AbortController()
  wiringValues(station.id,controller.signal).then(r=>{if(!controller.signal.aborted)setValues(r.items)}).catch(e=>{if(!controller.signal.aborted)setValueError(e.message)})
  return()=>controller.abort()
 },[station.id,saved,canReadTelemetry,editing])
 useEffect(()=>{if(!dirty&&!busy)return;const handler=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)},[dirty,busy])
 async function edit(){
  if(!saved||!canWrite||lock.current)return;lock.current=true;setBusy(true);setError('')
  try{const options=await wiringBindings(station.id);if(alive.current){setBindings(options);setDraft(structuredClone(saved.graph??{elements:[],edges:[]}));setNotice('全部修改仅在草稿中，点击保存才写入服务器')}}catch(e){if(alive.current)fail(e)}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 async function importTopology(){
  if(!draft||draft.elements.length||lock.current)return;lock.current=true;setBusy(true)
  try{const links=await api<Record<string,unknown>[]>(`/stations/${encodeURIComponent(station.id)}/topology`);if(alive.current){setDraft(fromTopology(bindings,links));setNotice('仅导入登记设备与真实连接；没有连接的设备保持独立。导入尚未保存。')}}catch(e){if(alive.current)fail(e)}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 async function save(){
  if(!draft||!saved||!canWrite||lock.current||conflict)return;lock.current=true;setBusy(true);setError('')
  try{await saveWiring(station.id,saved.version,draft);const latest=await loadWiring(station.id);if(alive.current){setSaved(latest);reset();setNotice(`已保存并重读版本 ${latest.version}`)}}catch(e){if(alive.current)fail(e)}finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 const chosen=graph?.elements.find(e=>e.id===selected)
 function update(patch:Partial<WiringElement>){setDraft(g=>g?{...g,elements:g.elements.map(e=>e.id===selected?{...e,...patch}:e)}:g)}
 function add(kind:WiringElement['kind']){if(!draft||draft.elements.length>=500)return;const id=crypto.randomUUID();setDraft({...draft,elements:[...draft.elements,{id,kind,x:40,y:40,width:150,height:70,rotation:0,text:kind==='text'?'文字':kind==='breaker'?'断路器':kind==='junction'?'连接点':'设备',color:'#166534',fontSize:14,align:'center',deviceId:null,pointId:null}]});setSelected(id)}
 const devices=[...new Map(bindings.map(b=>[b.deviceId,b])).values()]
 const points=bindings.filter(b=>b.deviceId===chosen?.deviceId&&b.pointId)
 return <section className="station-wiring" aria-label="持久化接线图">
  <header><h2>{station.name} · 接线图</h2><span>版本 {saved?.version??'—'}</span><div className="wiring-actions">
   {!editing&&<><button disabled={busy} onClick={()=>void refresh()}>重新读取</button>{canWrite&&<button disabled={!saved||busy} onClick={()=>void edit()}>{saved?.graph?'编辑':'创建接线图'}</button>}</>}
   {editing&&<><button disabled={busy||!canWrite||conflict} onClick={()=>void save()}>保存</button><button disabled={busy} onClick={()=>void leave.close()}>取消编辑</button></>}
  </div></header>
  <p>画布用于展示和说明，保存不会修改已登记拓扑或向设备下发命令。</p>
  {DEMO_MODE&&<p>演示模式不提供持久化画布。</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {conflict&&<p>服务器版本已变化。草稿仍保留，请取消编辑后重新读取最新版本再修改。</p>}
  {editing&&<div className="wiring-actions">{(['device','text','junction','breaker'] as const).map((kind,i)=><button key={kind} disabled={busy||!canWrite||draft.elements.length>=500} onClick={()=>add(kind)}>添加{['设备','文字','连接点','断路器'][i]}</button>)}<button disabled={busy||!canWrite||!!draft.elements.length} onClick={()=>void importTopology()}>从已登记拓扑建立草稿</button></div>}
  {!graph&&!busy&&<p className="wiring-empty">尚未保存接线图。已登记拓扑请使用“已登记拓扑”入口查看。</p>}
  {graph&&<><div className="wiring-actions"><button onClick={()=>setZoom(Math.max(.25,zoom-.25))}>缩小</button><button onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button onClick={()=>setZoom(Math.min(2,zoom+.25))}>放大</button><span>{graph.elements.length} 个元件 · {graph.edges.length} 条连线</span></div>
   <div className="wiring-layout"><div className="wiring-scroll"><svg width={Math.max(1000,...graph.elements.map(e=>e.x+e.width+100))*zoom} height={Math.max(600,...graph.elements.map(e=>e.y+e.height+100))*zoom} role="img" aria-label="接线图画布" onPointerMove={event=>{const d=drag.current;if(!d||!draft||busy||!canWrite)return;const rect=event.currentTarget.getBoundingClientRect();const dx=(event.clientX-rect.left)/zoom-d.startX,dy=(event.clientY-rect.top)/zoom-d.startY;setDraft(g=>g?{...g,elements:g.elements.map(e=>e.id===d.id?{...e,x:Math.max(0,Math.min(10000-e.width,Math.round(d.x+dx))),y:Math.max(0,Math.min(10000-e.height,Math.round(d.y+dy)))}:e)}:g)}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
    <g transform={`scale(${zoom})`}>{graph.edges.map(edge=>{const a=graph.elements.find(e=>e.id===edge.source),b=graph.elements.find(e=>e.id===edge.target);return a&&b?<line key={edge.id} x1={a.x+a.width/2} y1={a.y+a.height/2} x2={b.x+b.width/2} y2={b.y+b.height/2} stroke="#64748b" strokeWidth={2}/>:null})}
    {graph.elements.map(e=><g key={e.id} role="button" tabIndex={0} aria-label={`选择元件 ${e.text}`} onKeyDown={ev=>{if(ev.key==='Enter'||ev.key===' ')setSelected(e.id)}} onPointerDown={ev=>{setSelected(e.id);if(!editing||busy||!canWrite)return;const svg=ev.currentTarget.ownerSVGElement!;const rect=svg.getBoundingClientRect();svg.setPointerCapture(ev.pointerId);drag.current={id:e.id,x:e.x,y:e.y,startX:(ev.clientX-rect.left)/zoom,startY:(ev.clientY-rect.top)/zoom}}} transform={`translate(${e.x} ${e.y}) rotate(${e.rotation} ${e.width/2} ${e.height/2})`}>
      <rect width={e.width} height={e.height} rx={e.kind==='junction'?Math.min(e.width,e.height)/2:6} fill={e.kind==='text'?'#ffffff':'#f0fdf4'} stroke={selected===e.id?'#16a34a':'#cbd5e1'} strokeWidth={selected===e.id?3:1}/>
      {e.kind==='breaker'&&<path d={`M 10 ${e.height-12} L ${e.width/2} ${e.height-12} L ${e.width-10} ${e.height-24}`} stroke={e.color} fill="none"/>}
      <text x={e.align==='left'?6:e.align==='right'?e.width-6:e.width/2} y={e.height/2} textAnchor={e.align==='left'?'start':e.align==='right'?'end':'middle'} fontSize={e.fontSize} fill={e.color}>{e.text}</text>
      <title>{e.pointId?(canReadTelemetry&&!editing?valueLabel(values.find(v=>v.pointId===e.pointId)):'动态值请在保存后查看'):e.text}</title>
     </g>)}</g></svg></div>
    <aside aria-label="接线图元件属性">{!chosen?<p>选择画布元件查看或编辑属性</p>:<><h3>{chosen.text}</h3>
     {editing?<fieldset disabled={busy||!canWrite}>
      <label>文字<input maxLength={200} value={chosen.text} onChange={e=>update({text:e.target.value})}/></label>
      {(['x','y','width','height','rotation','fontSize'] as const).map((key,i)=><label key={key}>{['X 坐标','Y 坐标','宽度','高度','旋转角度','字号'][i]}<input type="number" min={key==='rotation'?-360:key==='fontSize'?12:key==='width'||key==='height'?20:0} max={key==='rotation'?360:key==='fontSize'?99:key==='width'||key==='height'?1000:10000} value={chosen[key]} onChange={e=>update({[key]:Number(e.target.value)})}/></label>)}
      <label>颜色<input type="color" value={chosen.color} onChange={e=>update({color:e.target.value})}/></label>
      <label>对齐<select value={chosen.align} onChange={e=>update({align:e.target.value as WiringElement['align']})}><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></label>
      <label>绑定设备<select value={chosen.deviceId??''} onChange={e=>update({deviceId:e.target.value||null,pointId:null})}><option value="">不绑定</option>{devices.map(d=><option key={d.deviceId} value={d.deviceId}>{d.deviceName}</option>)}</select></label>
      <label>绑定测点<select value={chosen.pointId??''} onChange={e=>update({pointId:e.target.value||null})}><option value="">不绑定</option>{points.map(p=><option key={p.pointId} value={p.pointId!}>{p.pointName} ({p.unit??'—'}) · #{p.pointId}</option>)}</select></label>
      <button onClick={()=>{setDraft(removeElement(draft,chosen.id));setSelected('')}}>移除元件及关联连线</button>
     </fieldset>:<><p>{chosen.deviceId?`设备 ${chosen.deviceId}`:'未绑定设备'}</p>{chosen.pointId&&<p>{canReadTelemetry?valueLabel(values.find(v=>v.pointId===chosen.pointId)):'无遥测查看权限'}</p>}{chosen.deviceId&&<button onClick={()=>onOpenDevices(chosen.deviceId!)}>查看设备详情</button>}</>}
    </>}
    {editing&&<fieldset disabled={busy||!canWrite}><legend>连线</legend><label>起点<select value={edgeSource} onChange={e=>setEdgeSource(e.target.value)}><option value="">选择元件</option>{graph.elements.map(e=><option key={e.id} value={e.id}>{e.text}</option>)}</select></label><label>终点<select value={edgeTarget} onChange={e=>setEdgeTarget(e.target.value)}><option value="">选择元件</option>{graph.elements.map(e=><option key={e.id} value={e.id}>{e.text}</option>)}</select></label><button disabled={!edgeSource||!edgeTarget||edgeSource===edgeTarget||!graph.elements.some(e=>e.id===edgeSource)||!graph.elements.some(e=>e.id===edgeTarget)||graph.edges.length>=1000} onClick={()=>setDraft({...draft,edges:[...draft.edges,{id:crypto.randomUUID(),source:edgeSource,target:edgeTarget}]})}>添加草稿连线</button>{graph.edges.map(e=><div key={e.id}>{graph.elements.find(n=>n.id===e.source)?.text} → {graph.elements.find(n=>n.id===e.target)?.text}<button aria-label={`移除连线 ${e.id}`} onClick={()=>setDraft({...draft,edges:draft.edges.filter(edge=>edge.id!==e.id)})}>移除</button></div>)}</fieldset>}
    {valueError&&<p role="alert">遥测读取失败：{valueError}</p>}
    </aside></div>
    {!editing&&graph.elements.some(e=>e.pointId)&&<section aria-label="绑定测点当前值"><h3>绑定测点</h3>{graph.elements.filter(e=>e.pointId).map(e=><p key={e.id}><strong>{e.text}：</strong>{canReadTelemetry?valueLabel(values.find(v=>v.pointId===e.pointId)):'无遥测查看权限'}</p>)}</section>}
   </>}{leave.confirmation}
 </section>
}
