import {useEffect,useState} from 'react'
import {api} from '@/api/client'
import {useAuth} from '@/auth/AuthContext'
import {hasStationPermission} from '@/auth/apiPermissions'
import {ResponsiveContainer,ScatterChart,Scatter,XAxis,YAxis,CartesianGrid,Tooltip} from 'recharts'

type Sample={source_at:string;captured_at:string;value:string|null;raw_value:string;quality:string}
type Point=Sample&{id:number;name:string;unit:string}
const time=(s:string)=>s?new Date(s).toLocaleString('zh-CN',{hour12:false}):'未采集'
const shown=(p:Sample)=>p.quality==='missing'?'未采集':p.value??p.raw_value??'未采集'

/** Source-page observations are historical evidence, never live EMS telemetry. */
export function ReferenceDeviceSamples({station,device,history=false,battery=false,onCount}:{station:string;device:string;history?:boolean;battery?:boolean;onCount?:(count:number)=>void}){
 const {user}=useAuth(), allowed=hasStationPermission(user,station,'asset.read')&&hasStationPermission(user,station,'telemetry.read')
 const [points,setPoints]=useState<Point[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(true)
 const [search,setSearch]=useState(''),[page,setPage]=useState(0),[selected,setSelected]=useState('')
 const [from,setFrom]=useState(''),[to,setTo]=useState(''),[rows,setRows]=useState<Sample[]>([])
 const [historyError,setHistoryError]=useState(''),[query,setQuery]=useState(0),[historyBusy,setHistoryBusy]=useState(false)
 const [revision,setRevision]=useState(0)
 const base=`/stations/${encodeURIComponent(station)}/devices/${encodeURIComponent(device)}/reference-samples`
 useEffect(()=>{
  const c=new AbortController();setPoints([]);setRows([]);setSelected('');setPage(0);setError('');setBusy(true)
  if(!allowed){setBusy(false);return ()=>c.abort()}
  api<{items:Point[]}>(base,{signal:c.signal}).then(result=>{if(c.signal.aborted)return
   const values=Array.isArray(result.items)?result.items:[];setPoints(values);onCount?.(values.length)
   const p=values.find(p=>p.quality==='observed')??values[0]
   if(p){setSelected(String(p.id));const end=Date.parse(p.source_at)+1000;setFrom(new Date(end-86400000).toISOString().slice(0,16));setTo(new Date(end+60000).toISOString().slice(0,16))}
  }).catch(e=>{if(!c.signal.aborted)setError(e.message)}).finally(()=>{if(!c.signal.aborted)setBusy(false)})
  return ()=>c.abort()
 },[base,user,allowed,revision])
 useEffect(()=>{
  const c=new AbortController();setRows([]);setHistoryError('');setHistoryBusy(false)
  if(!allowed||!history||!selected||!from||!to)return ()=>c.abort()
  const start=new Date(from+'Z'),end=new Date(to+'Z')
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start||+end-+start>366*86400000){setHistoryError('请选择366天以内的有效时间范围');return ()=>c.abort()}
  setHistoryBusy(true)
  api<{items:Sample[]}>(`${base}/history?${new URLSearchParams({pointId:selected,from:start.toISOString(),to:end.toISOString()})}`,{signal:c.signal})
   .then(v=>{if(!c.signal.aborted)setRows(v.items)}).catch(e=>{if(!c.signal.aborted)setHistoryError(e.message)})
   .finally(()=>{if(!c.signal.aborted)setHistoryBusy(false)})
  return ()=>c.abort()
 },[base,user,allowed,history,selected,from,to,query])
 if(!allowed||(!busy&&!error&&!points.length))return null
 const filtered=points.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())),numeric=rows.filter(p=>p.quality==='observed'&&p.value!==null&&Number.isFinite(Number(p.value)))
 const point=points.find(p=>String(p.id)===selected)
 return <section className="device-info-band" aria-label={history?'设备历史采样':'设备参数'}>
  <div className="flex flex-wrap justify-between gap-2"><h3>{history?'设备历史采样':'设备参数'}</h3><button className="device-action" onClick={()=>setRevision(v=>v+1)}>刷新参数</button></div>
  <p className="device-sync">按最新采样时间显示设备参数；未采集的参数不补零。时间按浏览器时区显示。</p>
  {busy?<p role="status">正在读取已落库采样…</p>:error?<p role="alert">{error}</p>:!points.length?<div className="device-empty">尚未取得该设备的测点采样；已有档案不代表已接入遥测。</div>:history?<>
   <label className="block my-3">采样参数 <select aria-label="历史参数" className="border rounded p-2 max-w-full" value={selected} onChange={e=>{setSelected(e.target.value);const p=points.find(p=>String(p.id)===e.target.value);if(p?.source_at){const end=Date.parse(p.source_at);setFrom(new Date(end-86400000).toISOString().slice(0,16));setTo(new Date(end+60000).toISOString().slice(0,16))}}}>{points.map(p=><option key={p.id} value={p.id}>{p.name} {p.unit&&`(${p.unit})`}</option>)}</select></label>
   <div className="flex flex-wrap gap-3 my-3"><label>起始 (UTC)<input aria-label="采样起始 UTC" type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>结束 (UTC)<input aria-label="采样结束 UTC" type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="device-action" onClick={()=>setQuery(v=>v+1)}>查询采样</button></div>
   <p className="device-sync">仅显示实际采样点；缺失时段留空。</p>
   {historyBusy?<p role="status">查询中…</p>:historyError?<p role="alert">{historyError}</p>:<>
    {!!numeric.length&&<div style={{height:240,minWidth:0}} aria-label="已采集数值点图"><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="x" type="number" domain={['dataMin','dataMax']} tickFormatter={v=>new Date(v).toLocaleTimeString('zh-CN')}/><YAxis dataKey="y" type="number" unit={point?.unit}/><Tooltip content={({active,payload})=>active&&payload?.[0]?<div className="bg-white border rounded p-2">{time(payload[0].payload.source_at)}<br/>{payload[0].payload.exact} {point?.unit}</div>:null}/><Scatter fill="#267d68" isAnimationActive={false} data={numeric.map(p=>({x:Date.parse(p.source_at),y:Number(p.value),exact:p.value,source_at:p.source_at}))}/></ScatterChart></ResponsiveContainer></div>}
    <p>{rows.length} 条实际采样，{numeric.length} 条数值采样</p>{rows.length?<div className="device-table-scroll"><table className="device-record-table"><thead><tr><th>采样时间</th><th>值 ({point?.unit||'无单位'})</th><th>原始值</th><th>接收时间</th></tr></thead><tbody>{rows.map(r=><tr key={r.source_at}><td>{time(r.source_at)}</td><td>{shown(r)}</td><td>{r.raw_value||'—'}</td><td>{time(r.captured_at)}</td></tr>)}</tbody></table></div>:<div className="device-empty">该时段未取得采样，无法绘制曲线。</div>}
   </>}
  </>:<>
   <p>共 {points.length} 项 · 数值 {points.filter(p=>p.quality==='observed').length} 项 · 未采集 {points.filter(p=>p.quality==='missing').length} 项</p>
   <label className="block my-3">筛选参数、电池包或单体编号 <input aria-label="筛选设备参数" className="border rounded p-2" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="例如 电压、Package、#23"/></label>
   {battery&&!points.some(p=>p.name.startsWith('电池包 '))&&<p className="device-sync">未取得该设备的逐包单体明细。</p>}
   <div className="device-table-scroll"><table className="device-record-table"><thead><tr><th>参数 / 单体编号</th><th>最新值</th><th>单位</th><th>采样时间</th><th>接收时间</th></tr></thead><tbody>{filtered.slice(page*40,(page+1)*40).map(p=><tr key={p.id} data-reference-point={p.id}><td>{p.name}</td><td>{shown(p)}</td><td>{p.unit||'—'}</td><td>{time(p.source_at)}</td><td>{time(p.captured_at)}</td></tr>)}</tbody></table></div>
   {!filtered.length&&<p>没有匹配参数</p>}<div className="flex gap-3 my-3"><button className="device-action" disabled={!page} onClick={()=>setPage(v=>v-1)}>上一页参数</button><span>{page+1} / {Math.max(1,Math.ceil(filtered.length/40))} 页 · {filtered.length} 项</span><button className="device-action" disabled={(page+1)*40>=filtered.length} onClick={()=>setPage(v=>v+1)}>下一页参数</button></div>
  </>}
 </section>
}
