import {useState} from 'react'
import {ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid} from 'recharts'
import {Battery,Sun,UtilityPole,Factory} from 'lucide-react'
import type {Station} from '@/App'
import {api,type ApiRow} from '@/api/client'
import {loadDeviceObservations,type Observation,historyChartNumber} from '@/api/ems'
import {loadDeviceHistory} from '@/api/deviceDetails'
import {uniqueStationValue} from './model'
import {loadStationDisplaySettings} from '@/api/stationDisplaySettings'
import {loadStationProfile} from '@/api/stationProfile'

import {base,display,Empty,QueryState,useStationQuery} from './shared'
export function ReferenceStationDashboard({station,telemetry,onDevices,onSources}:{station:Station;telemetry:boolean;onDevices:()=>void;onSources:()=>void}){
 const [field,setField]=useState('整体')
 const visibility=useStationQuery('display:'+station.id,signal=>loadStationDisplaySettings(station.id,signal))
 const q=useStationQuery(`dashboard:${station.id}:${telemetry}`,async signal=>{const [profile,devices,observations]=await Promise.all([loadStationProfile(station.id,signal),api<ApiRow[]>(base(station.id)+'/devices',{signal}),telemetry?loadDeviceObservations(station.id,signal):Promise.resolve([])]);return {profile,devices,observations}})
 const rows=q.data?.observations??[]
 // Multiple physical sources cannot be silently added: their metering boundaries may overlap.
 const metric=(semantic:string)=>uniqueStationValue(rows,semantic)
 return <><div className="rs-toolbar">{['整体','光伏','储能','电网'].map(v=><button className={field===v?'active':''} key={v} onClick={()=>setField(v)}>{v}</button>)}<span className="rs-spacer"/><span className="rs-muted">{telemetry?'当前已接入测点':'无遥测查看权限'}</span></div><QueryState {...q}/>{q.data&&<>
 <div className="rs-overview"><article className="rs-panel rs-address"><h3>场站信息</h3><label>地址</label><p>{station.address||'—'}</p><label>光伏装机容量</label><strong>{display(q.data.profile?.solarCapacityKw)} kWp</strong><label>储能装机功率</label><strong>{Number.isFinite(station.ratedPower)?station.ratedPower:'—'} kW</strong><label>储能装机容量</label><strong>{Number.isFinite(station.storageCapacity)?station.storageCapacity:'—'} kWh</strong></article>
 <article className="rs-panel"><div className="rs-toolbar"><h3>能量流</h3><span className="rs-spacer"/><button onClick={onSources}>数据来源</button></div><div className="rs-flow">{[['电网','gridPower',UtilityPole],['用电','loadPower',Factory],['储能','storagePower',Battery],['光伏','pvPower',Sun]].filter(([name])=>field==='整体'||field===name||field==='电网'&&name==='用电').map(([name,key,Icon])=>{const Glyph=Icon as typeof Sun;return <div key={String(key)}><Glyph size={32}/><span>{String(name)}</span><strong>{display(metric(String(key)))} kW</strong></div>})}</div><p className="rs-note">仅显示唯一且有效的计量测点；多来源未确定汇总口径时保持未知。</p></article></div>
 <article className="rs-panel"><div className="rs-toolbar"><h3>场站设备</h3><span className="rs-spacer"/><button onClick={onDevices}>查看设备</button></div><div className="rs-stat-grid">{Object.entries(q.data.devices.reduce<Record<string,number>>((a,d)=>{const k=String(d.category||'设备');a[k]=(a[k]||0)+1;return a},{})).map(([name,count])=><div key={name}><span>{name}</span><strong>{count}</strong></div>)}</div>{!q.data.devices.length&&<Empty/>}</article>
 <article className="rs-panel"><QueryState {...visibility}/>{visibility.data&&<div className="rs-stat-grid">{visibility.data.powerFactorVisible!==false&&<div><span>功率因数{visibility.data.powerFactorVisible===null?'（显示尚未配置）':''}</span><strong>{display(metric('powerFactor'))}</strong></div>}{visibility.data.revenueVisible!==false&&<div><span>收益{visibility.data.revenueVisible===null?'（显示尚未配置）':''}</span><strong>—</strong><small>暂无已核算收益</small></div>}</div>}</article>{telemetry&&<StationTrend stationId={station.id} rows={rows}/>}</>}</>
}
export function StationTrend({stationId,rows}:{stationId:string;rows:Observation[]}){
 const candidates=rows.filter(r=>r.pointId&&r.valueType==='number'),[selected,setSelected]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10))
 const pointId=selected||candidates[0]?.pointId||''
 const q=useStationQuery(`trend:${stationId}:${pointId}:${date}`,signal=>pointId?loadDeviceHistory(pointId,new Date(date+'T00:00:00Z'),new Date(date+'T23:59:59Z'),signal):Promise.resolve([]))
 const chart=(q.data??[]).map(r=>({time:String(r.timestamp??r.time??r.sourceTime??''),value:historyChartNumber(r)}))
 return <article className="rs-panel"><div className="rs-toolbar"><h3>功率曲线</h3><select aria-label="曲线测点" value={pointId} onChange={e=>setSelected(e.target.value)}>{candidates.map(r=><option key={r.pointId} value={r.pointId!}>{String(r.name??r.semanticKey??r.pointId)}</option>)}</select><input aria-label="曲线日期（UTC）" type="date" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/><small>UTC</small></div><QueryState {...q}/>{!q.loading&&!q.error&&(chart.some(p=>p.value!==null)?<ResponsiveContainer width="100%" height={260}><LineChart data={chart}><CartesianGrid stroke="#eee"/><XAxis dataKey="time" hide/><YAxis/><Tooltip/><Line dataKey="value" name="测点值" stroke="#18aaa5" dot={false} connectNulls={false}/></LineChart></ResponsiveContainer>:<Empty text="所选时段暂无有效历史数据"/>)}</article>
}
export function ReferenceStationAnalysis({stationId}:{stationId:string}){
 const q=useStationQuery('health:'+stationId,signal=>api<ApiRow[]>(base(stationId)+'/devices',{signal}))
 const rows=q.data??[],known=rows.filter(r=>r.health_score!=null)
 return <div className="rs-split rs-panel"><aside><button className="active">电池健康问题</button></aside><section><div className="rs-toolbar"><h3>健康问题状态统计</h3><span className="rs-spacer"/><span className="rs-muted">未知：{q.data?rows.length-known.length:'—'}</span></div><QueryState {...q}/>{!q.loading&&!q.error&&(known.length?<><p className="rs-note">以下为设备上报健康分数，未配置健康问题判定规则。</p><table><thead><tr><th>设备</th><th>健康分数</th><th>更新时间</th></tr></thead><tbody>{known.map(r=><tr key={String(r.id)}><td>{display(r.name)}</td><td>{display(r.health_score)}</td><td>{display(r.observed_at)}</td></tr>)}</tbody></table></>:<Empty text="暂无健康评估数据"/>)}</section></div>
}
