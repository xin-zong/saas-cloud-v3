import {useMemo,useState} from 'react'
import {Download,ChevronLeft,ChevronRight} from 'lucide-react'
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts'
import {loadDeviceHistory,loadDeviceHistoryBatch} from '@/api/deviceDetails'
import {historyChartNumber} from '@/api/ems'
import type {BatteryCellPack} from '@/data/stationDevices'
import {cellHistoryRows,cellHistorySamples,loadCellSeries} from '@/data/referenceCellHistory'
import {historyCsv,historyIsolatedPoint} from '@/data/referenceDeviceHistory'
import {dateKey,calendarBounds,formatDate} from '@/preferences/date'
import {getPreferences} from '@/preferences/store'
import {Empty,QueryState,useStationQuery} from './reference-station/shared'
import './reference-cell-history.css'
type Kind='voltage'|'temperature'
type Props={stationId?:string;deviceId:string;packs:Record<Kind,BatteryCellPack[]>;initialKind:Kind;initialPoint:string;initialDate?:string;telemetry:boolean;canExport:boolean}
const colors=['#51a7e6','#10aaa3','#e5a92f','#b783d9','#ee7d7d','#6f9b56','#658fbc','#ab8975']
export function ReferenceCellHistory({stationId,deviceId,packs,initialKind,initialPoint,initialDate,telemetry,canExport}:Props){
 const [kind,setKind]=useState<Kind>(initialKind),[packName,setPackName]=useState(()=>packs[initialKind].find(p=>p.cells.some(c=>c.pointId===initialPoint))?.name??packs[initialKind][0]?.name??''),[selected,setSelected]=useState<string[]>([initialPoint]),[average,setAverage]=useState(true),[date,setDate]=useState(initialDate||dateKey(new Date()))
 const available=telemetry?packs[kind]:[],pack=available.find(p=>p.name===packName)??available[0],cells=pack?.cells??[],ids=cells.flatMap(c=>c.pointId?[c.pointId]:[]),chosen=selected.filter(id=>ids.includes(id)),timezone=getPreferences().timezone,unit=kind==='voltage'?'V':'℃',averageLabel=kind==='voltage'?'平均电压':'平均温度'
 // Missing registry positions cannot stand in for a complete pack average.
 const complete=cells.length>0&&cells.every((cell,index)=>cell.index===index+1&&!!cell.pointId)&&new Set(ids).size===cells.length
 const bounds=calendarBounds(date,'D'),from=bounds.start.getTime(),to=bounds.end.getTime()
 const requested=average?ids:chosen
 const query=useStationQuery(`cell-history:${deviceId}:${pack?.name??''}:${kind}:${requested.join(',')}:${average}:${date}:${timezone}:${telemetry}`,async signal=>{
  if(!telemetry||!requested.length)return [] as Record<string,unknown>[]
  if(!Number.isFinite(from)||!Number.isFinite(to))throw new Error('请选择有效日期')
  const series=pack?.source==='stored'&&stationId?(await loadDeviceHistoryBatch(stationId,deviceId,requested,bounds.start,new Date(to+1),signal)).map(item=>({id:item.pointId,rows:cellHistorySamples(item.rows,item.pointId,from,to,historyChartNumber)})):await loadCellSeries(requested,signal,async(id,groupSignal)=>{const rows=await loadDeviceHistory(id,bounds.start,new Date(to+1),groupSignal);return cellHistorySamples(rows,id,from,to,historyChartNumber)})
  return cellHistoryRows(series,requested,average&&complete)
 })
 const rows=useMemo<(Record<string,unknown>&{timestamp:number})[]>(()=>(query.data??[]).map(row=>({...row,timestamp:Date.parse(String(row.time))})),[query.data]),hasData=rows.some(row=>chosen.some(id=>row[id]!==null&&row[id]!==undefined)||average&&row.average!==null&&row.average!==undefined)
 function changePack(name:string,nextKind:Kind=kind){setPackName(name);setSelected(packs[nextKind].find(p=>p.name===name)?.cells.flatMap(c=>c.pointId?[c.pointId]:[]).slice(0,1)??[])}
 function changeKind(next:Kind){setKind(next);changePack(packs[next].some(p=>p.name===packName)?packName:packs[next][0]?.name??'',next)}
 function move(days:number){const next=new Date(date+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+days);setDate(next.toISOString().slice(0,10))}
 function download(){if(!telemetry||!canExport||!hasData||query.loading)return;const columns=[...(average?[{id:'average',name:`${averageLabel}（已登记整包算术均值）`,unit}]:[]),...cells.filter(c=>c.pointId&&chosen.includes(c.pointId)).map(c=>({id:c.pointId!,name:`${pack?.name} #${c.index}`,unit}))],url=URL.createObjectURL(new Blob([historyCsv(columns,rows)],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=`单体历史-${pack?.name??deviceId}-${kind}-${date}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 if(!telemetry)return <Empty text="无遥测查看权限"/>
 return <section className="rch-analysis">
  <div className="rch-toolbar"><div className="rch-selectors"><select aria-label="电池包选择" value={pack?.name??''} onChange={e=>changePack(e.target.value)}>{available.map(p=><option key={p.name} value={p.name}>{p.slot?`#${p.slot}电池包`:p.name}</option>)}</select><select aria-label="单体类型" value={kind} onChange={e=>changeKind(e.target.value as Kind)}><option value="voltage">电压</option><option value="temperature">温度</option></select></div>
   <div className="rch-legends"><label className="rch-all"><input type="checkbox" aria-label="全选" checked={ids.length>0&&chosen.length===ids.length} onChange={e=>setSelected(e.target.checked?ids:[])}/>全选</label><div className="rch-series"><button className={`rch-average ${average?'active':''}`} aria-pressed={average} onClick={()=>setAverage(v=>!v)} title={`同包全部已登记${kind==='voltage'?'电压':'温度'}单体在同一采样时刻均有有效值时计算算术均值；编号缺口或缺测留空。`}><i/>{averageLabel}</button>{cells.map((cell,index)=><button key={cell.index} disabled={!cell.pointId} aria-label={`单体 #${cell.index}`} aria-pressed={!!cell.pointId&&chosen.includes(cell.pointId)} className={cell.pointId&&chosen.includes(cell.pointId)?'active':''} onClick={()=>cell.pointId&&setSelected(ids=>ids.includes(cell.pointId!)?ids.filter(id=>id!==cell.pointId):[...ids,cell.pointId!])}><i style={cell.pointId&&chosen.includes(cell.pointId)?{background:colors[index%colors.length]}:undefined}/>#{cell.index}</button>)}</div></div>
   <div className="rch-date-group"><div className="rch-date"><button aria-label="下载单体历史" title="下载单体历史" disabled={!canExport||!hasData||query.loading} onClick={download}><Download size={15}/></button><button aria-label="单体历史前一天" onClick={()=>move(-1)}><ChevronLeft size={14}/></button><input type="date" aria-label="单体历史日期" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/><button aria-label="单体历史后一天" onClick={()=>move(1)}><ChevronRight size={14}/></button></div><small className="rch-date-zone">用户时区：{timezone}</small></div>
  </div>
  <QueryState {...query}/><div className="rch-chart" aria-label={`${averageLabel}和单体历史曲线`}>
   <ResponsiveContainer width="100%" height={380}><LineChart data={rows} margin={{top:18,right:25,left:2,bottom:10}}><CartesianGrid stroke="#ededf0" strokeDasharray="3 3"/><XAxis dataKey="timestamp" type="number" domain={[from,to]} ticks={Array.from({length:7},(_,i)=>from+(to-from)*i/6)} allowDataOverflow tickFormatter={value=>Number(value)===to?'24:00':formatDate(Number(value),{hour:'2-digit',minute:'2-digit'})} tick={{fontSize:11}}/><YAxis width={48} domain={[(minimum:number)=>Math.min(0,minimum),'auto']} label={{value:unit,position:'insideTopLeft',offset:-10}} tick={{fontSize:11}}/><Tooltip labelFormatter={value=>formatDate(Number(value),{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}/>{average&&<Line dataKey="average" name={`${averageLabel}（已登记整包算术均值）`} stroke="#10aaa3" strokeDasharray="5 3" connectNulls={false} isAnimationActive={false} dot={props=>historyIsolatedPoint(props.points,props.index)?<circle key={String(props.payload?.time)} cx={props.cx} cy={props.cy} r={3} fill="#10aaa3"/>:<g key={String(props.payload?.time)}/>}/>}{cells.filter(c=>c.pointId&&chosen.includes(c.pointId)).map(cell=><Line key={cell.pointId} dataKey={cell.pointId!} name={`#${cell.index}`} stroke={colors[cells.indexOf(cell)%colors.length]} connectNulls={false} isAnimationActive={false} dot={props=>historyIsolatedPoint(props.points,props.index)?<circle key={String(props.payload?.time)} cx={props.cx} cy={props.cy} r={3} fill={colors[cells.indexOf(cell)%colors.length]}/>:<g key={String(props.payload?.time)}/>}/>)}</LineChart></ResponsiveContainer>
   {!query.loading&&!hasData&&<div className="rch-chart-empty"><Empty text={chosen.length||average?'所选日期暂无有效单体历史数据':'请选择单体或平均曲线'}/></div>}
  </div><footer className="rch-source">{timezone} · {pack?.source==="stored"?"原始历史采样（保留来源时刻）":"历史采样 · 15分钟 last"}{!complete&&average?' · 单体编号或绑定不完整，平均曲线留空':''}</footer>
 </section>
}

