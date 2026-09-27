import { useEffect, useRef, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { ApiRow } from '@/api/client'
import { CAPABILITIES_CHANGED } from '@/api/client'
import { historyChartNumber, readEms, createLatestRequest, exactText, loadEmsHistory, type Gateway } from '@/api/ems'
import { useEmsResource } from './useEmsResource'
import { Button, Select } from './ui/Workspace'

const dateInput=(date:Date)=>new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)
export default function EmsHistory({points,gateways,scope}:{points:ApiRow[];gateways:Gateway[];scope:string}) {
  const [selected,setSelected]=useState(''),[aggregation,setAggregation]=useState('last'),[minutes,setMinutes]=useState(15)
  const [from,setFrom]=useState(()=>dateInput(new Date(Date.now()-86400000))),[to,setTo]=useState(()=>dateInput(new Date()))
  const [rows,setRows]=useState<ApiRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[queried,setQueried]=useState(false)
  const channels=points
  const point=channels.find(p=>String(p.id)===selected)??channels[0]
  const mappings=useEmsResource(`${scope}|${gateways.map(g=>g.ems_uuid).join(",")}`,true,async signal=>(await Promise.all(gateways.map(g=>readEms<ApiRow>(g.ems_uuid,'structure',signal)))).flatMap(r=>Array.isArray(r.pointMappings)?r.pointMappings as ApiRow[]:[]))
  const definitions=(mappings.data??[]).filter(r=>String(r.measurement_point_id)===String(point?.id))
  const supported=definitions.length?['last','avg','min','max','delta'].filter(a=>definitions.every(r=>Array.isArray(r.supportedAggregations)&&r.supportedAggregations.includes(a))):['last']
  const operation=supported.includes(aggregation)?aggregation:'last'
  const gate=useRef(createLatestRequest<ApiRow[]>(data=>{setRows(data);setBusy(false);setQueried(true)},e=>{setError(e instanceof Error?e.message:'历史查询失败');setBusy(false)}))
  useEffect(()=>{const clear=()=>{gate.current.cancel();setRows([]);setBusy(false);setQueried(false)};clear();const visibility=()=>{if(document.visibilityState==='hidden')clear()};window.addEventListener(CAPABILITIES_CHANGED,clear);document.addEventListener('visibilitychange',visibility);return()=>{clear();window.removeEventListener(CAPABILITIES_CHANGED,clear);document.removeEventListener('visibilitychange',visibility)}},[scope,point?.id,operation,from,to,minutes])
  const plot=rows.map(r=>({timestamp:r.timestamp,value:historyChartNumber(r)}))
  function query(){if(!point||document.visibilityState==='hidden')return;setBusy(true);setError('');void gate.current.run(signal=>loadEmsHistory(String(point.id),new Date(from),new Date(to),operation,minutes,signal))}
  return <details className="ems-evidence" open><summary>实际遥测历史 / 服务端统计</summary><p>source=ems · 聚合仅使用服务端批准定义。当前计划不是实际执行；收入、价格与结算不能由此推算。</p>
    <div className="ems-history-controls"><Select aria-label="EMS 历史测点" value={String(point?.id??'')} onChange={e=>setSelected(e.target.value)}>{channels.map(p=><option key={String(p.id)} value={String(p.id)}>{String(p.name)} · {String(p.unit??'单位未确认')}</option>)}</Select><label>开始<input aria-label="EMS 历史开始" type="datetime-local" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>结束<input aria-label="EMS 历史结束" type="datetime-local" value={to} onChange={e=>setTo(e.target.value)}/></label><Select aria-label="EMS 聚合" value={operation} onChange={e=>setAggregation(e.target.value)}>{supported.map(a=><option key={a}>{a}</option>)}</Select><Select aria-label="EMS 聚合粒度" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[1,5,15,30,60].map(m=><option key={m} value={m}>{m} min</option>)}</Select><Button disabled={!point||busy} onClick={query}>{busy?'查询中…':'查询 EMS 历史'}</Button></div>
    {!channels.length&&<p>暂无已映射 EMS 测点观测。历史曲线保持真实空态。</p>}{error&&<p role="alert">{error}</p>}
    {rows.length>0&&<><p>曲线只作有限精度展示；下表保留精确值、质量与原始证据。</p><div className="ems-chart"><ResponsiveContainer width="100%" height={180}><LineChart data={plot}><CartesianGrid stroke="#e9eeee"/><XAxis dataKey="timestamp" tickFormatter={v=>new Date(Number(v)).toLocaleTimeString()}/><YAxis/><Tooltip/><Line dataKey="value" stroke="#176e5b" connectNulls={false} dot={false}/></LineChart></ResponsiveContainer></div><div className="ems-table-wrap"><table className="ui-table"><thead><tr>{['时间桶','精确值','质量 / 来源','样本数','冲突 / 重置未知','原始证据'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i}><td>{new Date(Number(r.timestamp)).toLocaleString()}</td><td className="ems-exact">{exactText(r.value)}</td><td>{exactText(r.quality)} / {exactText(r.source)}<small>{exactText(r.precision)} · {exactText(r.aggregation)}</small></td><td>{exactText(r.samples)}</td><td>{exactText(r.conflict)} / {exactText(r.resetUnknown)}</td><td><details><summary>查看源证据</summary><pre className="ems-json">{exactText(r.evidence)}</pre></details></td></tr>)}</tbody></table></div></>}
    {queried&&!rows.length&&<p role="status">所选时段无已授权 EMS 历史，未生成插值或示例曲线。</p>}
  </details>
}
