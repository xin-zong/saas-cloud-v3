import {useState} from 'react'
import {Bar,CartesianGrid,ComposedChart,Legend,Line,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'
import {metricText,type DashboardTrend,type DashboardSeries} from '@/api/monitorWorkspace'
import {dashboardAxisPoints} from './reference-dashboard-model'
import './monitor-dashboard-trend.css'

const seriesInfo:Record<DashboardSeries,[string,string,string]>={metric:['指标','','#8355ca'],chargeEnergy:['当日储能充电量','kWh','#39bc31'],dischargeEnergy:['当日储能放电量','kWh','#ffd236'],chargeHours:['当日平均充电时长','h','#39bc31'],dischargeHours:['当日平均放电时长','h','#ffd236'],plannedEnergy:['当月计划发电量','kWh','#ed5e62'],actualEnergy:['当月光伏发电量','kWh','#77b7f5']}
export default function MonitorDashboardTrend({trend,title,unit}:{trend?:DashboardTrend;title:string;unit:string}){
 const [table,setTable]=useState(false)
 const data=trend?dashboardAxisPoints(trend):[],series=trend?.series??['metric'],secondary=series.find(key=>key!=='metric')
 const metricLabel=title==='计划发电量完成率'?'完成率':title==='储能利用率'?'利用率':title==='满发小时'?'日满发小时':title==='PR'?'日PR':title
 const info=(key:DashboardSeries):[string,string,string]=>key==='metric'?[metricLabel,unit,title==='PR'?'#ed5e62':title==='计划发电量完成率'?'#f99a36':title==='满发小时'?'#77b7f5':seriesInfo.metric[2]]:seriesInfo[key]
 return <div className="rd-trend" aria-label={`${title}趋势`}>
  <div className="rd-trend-chart"><ResponsiveContainer width="100%" height={275}><ComposedChart data={data} margin={{top:28,right:12,bottom:5,left:0}} accessibilityLayer>
   <CartesianGrid stroke="#e9e9ed"/><XAxis dataKey="date" tick={{fontSize:11}} minTickGap={12} axisLine={{stroke:'#ededf0'}} tickLine={false} tickFormatter={v=>trend?.granularity==='day'?String(v).slice(5).replace('-','/'):trend?.granularity==='month'?String(Number(String(v).slice(5))):String(v)}/>
   <YAxis yAxisId="metric" width={42} tick={{fontSize:11}} axisLine={false} tickLine={false} label={{value:unit,position:'insideTopLeft',dy:-24,fontSize:11}}/>{secondary&&<YAxis yAxisId="secondary" orientation="right" width={60} tick={{fontSize:11}} axisLine={false} tickLine={false} tickFormatter={v=>Number(v).toLocaleString('zh-CN')} label={{value:info(secondary)[1],position:'insideTopRight',dy:-24,fontSize:11}}/>}
   <Tooltip filterNull={false} formatter={(v,name)=>[`${metricText(v==null?null:Number(v))} ${info(name as DashboardSeries)[1]}`,info(name as DashboardSeries)[0]]}/><Legend formatter={v=>info(v as DashboardSeries)[0]} wrapperStyle={{fontSize:11}} iconSize={9}/>
   {series.filter(key=>key!=='metric').map(key=><Bar key={key} name={key} dataKey={key} yAxisId="secondary" stackId={title==='储能利用率'?'hours':undefined} fill={info(key)[2]} maxBarSize={11} isAnimationActive={false}/>)}
   {series.includes('metric')&&(title==='满发小时'?<Bar name="metric" dataKey="metric" yAxisId="metric" fill={info('metric')[2]} maxBarSize={11} isAnimationActive={false}/>:<Line name="metric" dataKey="metric" yAxisId="metric" type="linear" stroke={info('metric')[2]} strokeWidth={2} dot={{r:2}} connectNulls={false} isAnimationActive={false}/>)}
  </ComposedChart></ResponsiveContainer>{!data.length&&<span className="rd-chart-empty">暂无数据</span>}</div>
  {trend&&<details className="rd-trend-details" onToggle={e=>setTable(e.currentTarget.open)}><summary>数据明细 <span>{trend.start} — {trend.end}</span></summary>{table&&<div className="monitor-trend-table"><table aria-label={`${title}趋势数据明细`}><thead><tr><th>日期</th>{series.map(key=><th key={key}>{info(key)[0]}（{info(key)[1]}）</th>)}</tr></thead><tbody>{data.map(point=><tr key={point.date}><td>{point.date}</td>{series.map(key=><td key={key}>{metricText(typeof point[key]==='number'?point[key] as number:null)}</td>)}</tr>)}</tbody></table><small>数据时间：{new Date(trend.observedAt).toLocaleString('zh-CN',{hour12:false,timeZoneName:'short'})} · 缺值留空</small></div>}</details>}
 </div>
}
