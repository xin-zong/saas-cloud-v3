import {useState} from 'react'
import {api,type ApiRow} from '@/api/client'
import {adaptObservation,loadDeviceObservations} from '@/api/ems'
import type {Substation} from '@/data/substations'
import {StationTrend} from './Dashboard'
import {uniqueStationValue,childTelemetryPath} from './model'
import {base,display,Empty,QueryState,useStationQuery} from './shared'
/** This API returns only points bound to this child, unlike an empty station point filter. */
export function ReferenceSubstationTelemetry({stationId,child,onClose}:{stationId:string;child:Substation;onClose:()=>void}){
 const [revision,setRevision]=useState(0)
 const q=useStationQuery(`child-telemetry:${stationId}:${child.id}:${revision}`,async signal=>{const snapshot=await api<{items:ApiRow[];serverTime:number}>(childTelemetryPath(stationId,child.id),{signal});return {...snapshot,items:snapshot.items.map(adaptObservation)}})
 const rows=q.data?.items??[]
 return <section className="rs-panel"><div className="rs-toolbar"><h3>{child.name}</h3><span className="rs-spacer"/><button onClick={()=>setRevision(v=>v+1)}>刷新</button><button onClick={onClose}>返回子场站</button></div><QueryState {...q}/>{q.data&&<><div className="rs-stat-grid">{[['pvPower','光伏发电功率','kW'],['storagePower','储能功率','kW'],['soc','SOC','%']].map(([key,label,unit])=><div key={key}><span>{label}</span><strong>{display(uniqueStationValue(rows,key))} {unit}</strong></div>)}</div><p className="rs-note">仅显示本子场站绑定设备的有效测点；多个同类来源未明确计量边界时不汇总。</p><StationTrend stationId={stationId+':child:'+child.id} rows={rows}/>{!rows.length&&<Empty text="子场站暂无绑定测点数据"/>}</>}</section>
}
export function ReferenceStationLayout({stationId,telemetry}:{stationId:string;telemetry:boolean}){
 const [revision,setRevision]=useState(0)
 const q=useStationQuery(`layout:${stationId}:${revision}:${telemetry}`,signal=>telemetry?loadDeviceObservations(stationId,signal):Promise.resolve([]))
 const solar=(q.data??[]).filter(row=>row.semanticKey==='pvPower')
 return <><div className="rs-toolbar"><h3>系统布局</h3><span className="rs-spacer"/><button onClick={()=>setRevision(v=>v+1)}>刷新</button><button className="primary" disabled title="布局编辑器及设备位置数据接口尚未接入">创建布局</button></div><article className="rs-panel"><div className="rs-toolbar"><select aria-label="布局类型" value="physical" disabled><option value="physical">物理布局</option></select><span>发电功率</span></div><QueryState {...q}/>{telemetry&&!q.loading&&!q.error&&<StationTrend stationId={stationId+':layout'} rows={solar}/>}<Empty text="无系统布局数据"/><p className="rs-note">布局需要组件位置与绑定信息；当前仅有楼宇空间层级数据，不能替代物理组件布局。尚未接入布局编辑数据接口。</p></article></>
}
