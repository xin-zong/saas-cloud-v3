import {useState} from 'react'
import {Bar,BarChart,ResponsiveContainer,Tooltip,XAxis} from 'recharts'
import {metricText} from '@/api/monitorWorkspace'
import {storageSeries,sumMetric} from '@/data/overviewLive'
import {useOverviewData} from './OverviewDataContext'

export type StoragePeriod={kind:'day'|'week'|'month'|'custom';start?:string;end?:string}
export default function OverviewLiveStorage({selection}:{selection?:StoragePeriod}){
 const {items,capture,loading,error,source}=useOverviewData(),[localPeriod,setPeriod]=useState<'day'|'month'>('month'),[details,setDetails]=useState(false)
 const period=selection?.kind??localPeriod
 const card=period==='day'?undefined:capture?.cards[period==='week'?'storageEfficiency7':'storageEfficiencyMonth']
 const available=storageSeries(card?.trend),customFits=period!=='custom'||!!(selection?.start&&selection?.end&&card?.trend&&selection.start>=card.trend.start&&selection.end<=card.trend.end)
 const rows=customFits?available.filter(r=>period!=='custom'||r.date>=selection!.start!&&r.date<=selection!.end!):[],hasValues=rows.some(r=>r.charge!==null||r.discharge!==null)
 const detailSum=(key:'charge'|'discharge')=>{const values=rows.map(r=>r[key]).filter((v):v is number=>v!==null);return values.length?values.reduce((a,b)=>a+b,0)*1000:null}
 const charge=sumMetric(items,period==='day'?'storageDailyCharged':'storageMonthlyCharged'),discharge=sumMetric(items,period==='day'?'storageDailyDischarged':'storageMonthlyDischarged')
 const charged=period==='custom'?detailSum('charge'):card?card.chargeEnergy:period==='week'?null:charge.value,discharged=period==='custom'?detailSum('discharge'):card?card.dischargeEnergy:period==='week'?null:discharge.value
 const unit=(v:number|null|undefined)=>metricText(typeof v==='number'?v/1000:null)
 return <>
  <div className="flex items-center justify-between mb-3"><strong style={{fontSize:14}}>储能充放趋势</strong><div className="flex gap-3">{!selection&&(['day','month'] as const).map(p=><button key={p} aria-pressed={period===p} onClick={()=>setPeriod(p)} style={{fontSize:10,color:period===p?'#1f7a68':'#76857f'}}>{source==='capture'?(p==='day'?'采集日':'采集月'):(p==='day'?'今日':'本月')}</button>)}</div></div>
  {capture?.completeScope===false&&<p style={{fontSize:11,color:'#76857f'}}>周期数据覆盖 {capture.coveredStationIds?.length} / {items.length} 个站点</p>}
  <div className="flex gap-4 mb-3" style={{fontSize:11}}><div>充电量<strong data-metric="charge-total" style={{display:'block',color:'#1f7a68'}}>{unit(charged)} MWh</strong></div><div>放电量<strong data-metric="discharge-total" style={{display:'block',color:'#1f7a68'}}>{unit(discharged)} MWh</strong></div></div>
  <div data-chart="storage-trend" style={{height:120}}>{hasValues?<ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{top:8,right:0,bottom:0,left:0}}><XAxis dataKey="date" tickFormatter={s=>s.slice(5)} tick={{fontSize:9}} minTickGap={20}/><Tooltip filterNull={false} formatter={(v,n)=>[`${metricText(v==null?null:Number(v))} MWh`,n==='charge'?'充电量':'放电量']}/><Bar dataKey="charge" fill="#2f875a" isAnimationActive={false}/><Bar dataKey="discharge" fill="#8faab6" isAnimationActive={false}/></BarChart></ResponsiveContainer>:<div role="status" style={{fontSize:11,color:'#76857f',paddingTop:20}}>{loading?'正在读取新库数据':error?'数据读取失败，请刷新重试':period==='day'?'未采集小时曲线；上方为已采集日合计':period==='custom'?'所选日期未采集完整范围曲线':period==='week'?'当前范围未采集周曲线':'当前范围未采集月曲线，未使用其他站点数据补齐'}</div>}</div>
  <p style={{fontSize:10,color:'#76857f',margin:'4px 0'}}>{period==='custom'?`${selection?.start}—${selection?.end} · 已采集明细合计，不含缺值`:card?.trend?`来源看板 ${card.trend.start}—${card.trend.end} · 采集 ${new Date(card.trend.observedAt).toLocaleString('zh-CN',{hour12:false})}`:`${source==='capture'?'各站采集日/月合计（更新时间可能不同）':'当前采样合计'} · 充电 ${charge.covered}/${charge.total} 站、放电 ${discharge.covered}/${discharge.total} 站有值`}</p>
  {rows.length>0&&<><button style={{fontSize:11,color:'#1f7a68'}} aria-expanded={details} onClick={()=>setDetails(!details)}>{details?'收起充放电明细':'查看充放电明细'}</button>{details&&<div style={{maxHeight:140,overflow:'auto'}}><table aria-label="总览充放电数据明细" style={{width:'100%',fontSize:10}}><thead><tr><th>日期</th><th>充电 kWh</th><th>放电 kWh</th></tr></thead><tbody>{rows.map(r=><tr key={r.date}><td>{r.date}</td><td>{metricText(r.charge===null?null:r.charge*1000)}</td><td>{metricText(r.discharge===null?null:r.discharge*1000)}</td></tr>)}</tbody></table></div>}</>}
 </>
}
