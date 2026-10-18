import {useEffect,useState} from 'react'
import type {Station} from '@/App'
import {useAuth} from '@/auth/AuthContext'
import {hasStationPermission} from '@/auth/apiPermissions'
import {loadStationSnapshot,type StationSnapshot} from '@/api/stationRealtime'
import StationStoredOverview from './StationStoredOverview'
import MonitorAnalytics from './MonitorAnalytics'
import './station-modules.css'
export default function StationDataPage({station,allowedSubNavs,onNavigate}:{station:Station;allowedSubNavs:readonly string[];onNavigate:(tab:string)=>void}){
 const {user}=useAuth(),allowed=hasStationPermission(user,station.id,'telemetry.read'),canExport=hasStationPermission(user,station.id,'report.export')
 const [snapshot,setSnapshot]=useState<StationSnapshot|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [from,setFrom]=useState(()=>new Date(Date.now()-86400000).toISOString().slice(0,10)),[to,setTo]=useState(()=>new Date().toISOString().slice(0,10))
 useEffect(()=>{setSnapshot(null);setError('');const controller=new AbortController();if(allowed)loadStationSnapshot(station.id,controller.signal).then(r=>{if(!controller.signal.aborted)setSnapshot(r)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[station.id,allowed,user?.id,revision])
 const stored=snapshot?.items.some(i=>i.source==='stored_device'||i.sourceType==='stored_device')
 const latest=snapshot?.items.map(i=>i.sourceTime).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)).sort((a,b)=>b-a)[0]
 return <div aria-label="场站数据"><section className="station-module"><header><h2>{station.name} · 场站数据</h2>{allowed&&<button onClick={()=>setRevision(v=>v+1)}>刷新采样状态</button>}</header><p>资料和指标保留实际更新时间；实测功率按采样时间查询。</p>{!allowed?<p>无实时采样查看权限</p>:error?<p role="alert">采样状态读取失败：{error}</p>:!snapshot?<p role="status">正在读取采样状态…</p>:<><p>最近实际采样时间：{latest?new Date(latest).toLocaleString():'未采集'} · 可查看采样项：{snapshot.items.length}</p><p role="status">{stored?'连续采集未接通：当前为已入库设备采样。':!latest?'连续采集状态未知：当前无实际采样。':Date.now()-latest>300000?'当前采样已过期，连续采集状态待核实。':'已读取近期实际采样；持续采集状态仍以最新采样时间为准。'}</p></>}</section><StationStoredOverview stationId={station.id} allowedSubNavs={allowedSubNavs} onNavigate={onNavigate}/>{allowed&&<section className="station-module"><div className="module-actions"><label>采样开始日期（UTC）<input aria-label="采样开始日期" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>采样结束日期（UTC）<input aria-label="采样结束日期" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>{from&&to&&from<=to?<MonitorAnalytics key={station.id} stationIds={[station.id]} names={{[station.id]:station.name}} from={`${from}T00:00:00Z`} to={`${to}T23:59:59Z`} canExport={canExport} onOpenStation={()=>onNavigate('运行曲线')}/>:<p role="alert">请选择有效日期范围</p>}</section>}</div>
}
