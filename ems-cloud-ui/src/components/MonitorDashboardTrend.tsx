import {useState} from 'react'
import {Bar,CartesianGrid,ComposedChart,Legend,Line,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import {metricText,type DashboardTrend,type DashboardSeries} from '@/api/monitorWorkspace'
import './monitor-dashboard-trend.css'

const seriesInfo:Record<DashboardSeries,[string,string,string]>={metric:['指标','','#6d8fbb'],chargeEnergy:['储能充电量','kWh','#43a287'],dischargeEnergy:['储能放电量','kWh','#dfb45f'],chargeHours:['平均充电时长','h','#43a287'],dischargeHours:['平均放电时长','h','#dfb45f'],plannedEnergy:['计划发电量','kWh','#96b3a6'],actualEnergy:['实际发电量','kWh','#43a287']}
// A categorical axis otherwise connects adjacent records across an omitted date.
// Missing dates get null placeholders; no measured value is manufactured.
function axisPoints(trend:DashboardTrend){
 const suffix=trend.granularity==='year'?'-01-01':trend.granularity==='month'?'-01':''
 const cursor=new Date(`${trend.start}${suffix}T00:00:00Z`),end=new Date(`${trend.end}${suffix}T00:00:00Z`),length=trend.granularity==='year'?4:trend.granularity==='month'?7:10
 const observed=new Map(trend.points.map(point=>[point.date,point.values])),points:{date:string;[key:string]:string|number|null}[]=[]
 while(cursor<=end&&points.length<366){
  const date=cursor.toISOString().slice(0,length),values=observed.get(date)
  points.push({date,...Object.fromEntries(trend.series.map(key=>[key,values?.[key]??null]))})
  if(trend.granularity==='year')cursor.setUTCFullYear(cursor.getUTCFullYear()+1)
  else if(trend.granularity==='month')cursor.setUTCMonth(cursor.getUTCMonth()+1)
  else cursor.setUTCDate(cursor.getUTCDate()+1)
 }
 return points
}
export default function MonitorDashboardTrend({trend,title,unit}:{trend?:DashboardTrend;title:string;unit:string}){
 const [table,setTable]=useState(false)
 if(!trend)return <div className="monitor-metric-trend"><p>该周期趋势尚未采集</p><small>不使用示例数据或周期值补曲线</small></div>
 const data=axisPoints(trend),hasValues=data.some(point=>trend.series.some(key=>typeof point[key]==='number'))
 const info=(key:DashboardSeries):[string,string,string]=>key==='metric'?[title,unit,seriesInfo.metric[2]]:seriesInfo[key]
 const secondary=trend.series.find(key=>key!=='metric')
 return <div className="monitor-captured-trend" aria-label={`${title}真实趋势`}>
  <div className="monitor-trend-heading"><small>{trend.start} — {trend.end}</small><button aria-expanded={table} onClick={()=>setTable(!table)}>{table?'收起明细':'查看数据明细'}</button></div>
  {hasValues?<div className="monitor-trend-chart"><ResponsiveContainer width="100%" height={225}><ComposedChart data={data} margin={{top:15,right:8,bottom:4,left:0}} accessibilityLayer>
   <CartesianGrid stroke="#e9efeb" vertical={false}/><XAxis dataKey="date" tick={{fontSize:10}} minTickGap={18} tickFormatter={v=>trend.granularity==='day'?String(v).slice(5):String(v)}/>
   <YAxis yAxisId="metric" width={48} tick={{fontSize:10}} unit={unit}/>{secondary&&<YAxis yAxisId="secondary" orientation="right" width={60} tick={{fontSize:10}} tickFormatter={v=>Number(v).toLocaleString('zh-CN',{notation:'compact'})} label={{value:info(secondary)[1],position:'insideTopRight',dy:-15,fontSize:10}}/>}
   <Tooltip filterNull={false} formatter={(v,name)=>[`${metricText(v==null?null:Number(v))} ${info(name as DashboardSeries)[1]}`,info(name as DashboardSeries)[0]]}/><Legend formatter={v=>info(v as DashboardSeries)[0]} wrapperStyle={{fontSize:11}}/>
   {trend.series.filter(key=>key!=='metric').map(key=><Bar key={key} name={key} dataKey={key} yAxisId="secondary" fill={info(key)[2]} maxBarSize={18} isAnimationActive={false}/>)}
   {trend.series.includes('metric')&&<Line name="metric" dataKey="metric" yAxisId="metric" type="linear" stroke={info('metric')[2]} strokeWidth={2} dot={{r:2}} connectNulls={false} isAnimationActive={false}/>}
  </ComposedChart></ResponsiveContainer></div>:<div className="monitor-trend-empty">来源该周期无有效趋势值</div>}
  <small className="monitor-note">来源页面显示精度 · {trend.series.some(key=>key.endsWith('Energy'))&&'电量统一换算为 kWh · '}缺值留空，未插值 · {new Date(trend.observedAt).toLocaleString('zh-CN',{hour12:false})}</small>
  {table&&<div className="monitor-trend-table"><table aria-label={`${title}趋势数据明细`}><thead><tr><th>日期</th>{trend.series.map(key=><th key={key}>{info(key)[0]}（{info(key)[1]}）</th>)}</tr></thead><tbody>{data.map(point=><tr key={point.date}><td>{point.date}</td>{trend.series.map(key=><td key={key}>{metricText(typeof point[key]==='number'?point[key] as number:null)}</td>)}</tr>)}</tbody></table></div>}
 </div>
}
