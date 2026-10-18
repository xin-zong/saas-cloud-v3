import {useEffect,useMemo,useState} from 'react'
import {CartesianGrid,Line,LineChart,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import {loadMonitorHistory,monitorChartRows,type MonitorHistory} from '@/api/monitor'
import {Button} from './ui/Workspace'
import {formatDate} from '@/preferences/date'
type Props={stationIds:string[];names:Record<string,string>;from:string;to:string;onOpenStation:(id:string)=>void;canExport:boolean}
const colors=['#277e68','#3078ca','#c58019','#8060b7','#317c9d']
export default function MonitorAnalytics({stationIds,names,from,to,onOpenStation,canExport}:Props){
 const [metric,setMetric]=useState('storagePower'),[minutes,setMinutes]=useState(60),[data,setData]=useState<MonitorHistory|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[descending,setDescending]=useState(true),[more,setMore]=useState(false),[refresh,setRefresh]=useState(0),[exporting,setExporting]=useState(false)
 const idsKey=stationIds.join(',')
 useEffect(()=>{const controller=new AbortController();setData(null);setError('');if(!stationIds.length){setBusy(false);return()=>controller.abort()};setBusy(true)
  loadMonitorHistory(stationIds,metric,from,to,minutes,controller.signal).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)})
  return()=>controller.abort()
 },[idsKey,metric,from,to,minutes,refresh])
 const visibleIds=stationIds.slice(0,5), chart=useMemo(()=>monitorChartRows(data?.items??[],visibleIds,Date.parse(from),Math.min(Date.parse(to),Date.now()),minutes),[data,idsKey,from,to,minutes])
 const ranking=data?(descending?data.ranking:[...data.ranking].reverse()):[]
 const exportData=async()=>{setExporting(true);setError('');try{const current=await loadMonitorHistory(stationIds,metric,from,to,minutes,undefined,true);const cell=(v:unknown)=>`"${String(v??'').replace(/^[=+@\-\t\r\n]/,"'$&").replace(/"/g,'""')}"`;const rows=[['站点ID','站点','采样桶UTC时间',metric,'单位','样本数'],...current.items.map(r=>[r.stationId,names[r.stationId]??r.stationId,new Date(r.timestamp).toISOString(),r.value,'kW',r.samples])];const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`监控实测功率-${metric}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError((e as Error).message)}finally{setExporting(false)}}
 return <article className="overview-region-context" aria-label="实测功率监控">
  <div className="overview-dashboard-actions"><h2>实测功率趋势与排行</h2><select aria-label="监控指标" value={metric} onChange={e=>setMetric(e.target.value)}><option value="storagePower">储能功率 (kW)</option><option value="pvPower">光伏功率 (kW)</option></select><select aria-label="监控采样粒度" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[5,15,30,60].map(v=><option key={v} value={v}>{v}分钟</option>)}</select><Button onClick={()=>setRefresh(v=>v+1)} disabled={busy}>刷新趋势</Button><Button onClick={exportData} disabled={!canExport||busy||exporting||!data||!stationIds.length}>{exporting?'导出中…':'导出所选历史'}</Button></div>
  <p>按每桶末次实测值展示，无效值留空，排行为有效桶功率算术平均值。缺失时段不连线；此数据不代表电量。</p>
  {error&&<p role="alert">{error}</p>}{busy&&<p role="status">正在读取实测数据…</p>}
  {!busy&&!error&&!data?.items.some(r=>r.value!==null)&&<p role="status">当前范围暂无有效功率采样；缺失协议映射或多重映射保持空态。</p>}
  {!!data?.items.length&&<div style={{height:230}}><ResponsiveContainer><LineChart data={chart}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="timestamp" tickFormatter={v=>formatDate(Number(v),{month:'2-digit',day:'2-digit'})}/><YAxis unit="kW"/><Tooltip labelFormatter={v=>formatDate(Number(v),{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}/>{visibleIds.map((id,i)=><Line key={id} dataKey={id} name={names[id]??id} stroke={colors[i]} connectNulls={false} dot={{r:2}} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer></div>}
  {stationIds.length>5&&<p>曲线显示前5个站点；排行及导出包含当前选择范围。</p>}
  <div className="overview-dashboard-actions"><h3>平均实测功率排行 (kW)</h3><Button onClick={()=>setDescending(v=>!v)}>{descending?'降序':'升序'}</Button><Button onClick={()=>setMore(v=>!v)}>{more?'收起':'更多（最多100站）'}</Button></div>
  <ol>{ranking.slice(0,more?100:5).map(row=><li key={row.stationId}><button onClick={()=>onOpenStation(row.stationId)}>{names[row.stationId]??row.stationId} · {Number(row.value).toFixed(2)} kW · {row.samples} 桶</button></li>)}</ol>
  {!ranking.length&&<p>暂无可排行采样</p>}
  <p>此处仅展示实测功率；PR、满发小时、计划完成率、效率和利用率的导入值请查看站点数据快照。</p>
 </article>
}
