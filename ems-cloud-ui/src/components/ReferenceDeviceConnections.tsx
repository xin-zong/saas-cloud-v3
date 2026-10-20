import {useState} from 'react'
import {ChevronDown,ChevronRight} from 'lucide-react'
import {api} from '@/api/client'
import {connectionBatteryPackId,connectionRows,connectionTypeLabel,connectionDeviceId,connectionSelected,connectionObservation,type ConnectionNode,type ConnectionEdge} from '@/data/deviceConnections'
import {formatDate} from '@/preferences/date'
import {Empty,QueryState,useStationQuery} from './reference-station/shared'
export function ReferenceDeviceConnections({stationId,deviceId,onOpenDevice,onOpenBatteryPack}:{stationId:string;deviceId:string;onOpenDevice?:(id:string)=>void;onOpenBatteryPack?:(id:string)=>void}){
 const [collapsed,setCollapsed]=useState<string[]>([])
 const query=useStationQuery(`device-connections:${stationId}:${deviceId}`,signal=>api<{nodes:ConnectionNode[];edges:ConnectionEdge[]}>(`/stations/${encodeURIComponent(stationId)}/devices/${encodeURIComponent(deviceId)}/connections`,{signal}))
 const rows=connectionRows(query.data?.nodes??[],query.data?.edges??[],collapsed)
 return <article className="rs-panel rd-connections"><QueryState {...query}/><table><thead><tr><th>类型/SN</th><th>状态</th><th>数据更新时间</th></tr></thead><tbody>{rows.map(row=>{
  const id=String(row.node.id),closed=collapsed.includes(id),selected=connectionSelected(row.node,deviceId),packId=connectionBatteryPackId(row.node),linkedId=connectionDeviceId(row.node),observation=connectionObservation(row.node)
  const label=<>{connectionTypeLabel(row.node)}<br/>{row.node.serial||'--'}</>
  return <tr key={row.key} className={selected?'selected':''}><td><div style={{paddingLeft:row.depth*20}}>{row.hasChildren?<button className="rd-connection-toggle" aria-label={`${closed?'展开':'折叠'}${row.node.serial??row.node.name??id}`} aria-expanded={!closed} onClick={()=>setCollapsed(ids=>ids.includes(id)?ids.filter(value=>value!==id):[...ids,id])}>{closed?<ChevronRight size={14}/>:<ChevronDown size={14}/>}</button>:<span className="rd-connection-indent"/>}{packId&&onOpenBatteryPack?<button className="rd-connection-device" onClick={()=>onOpenBatteryPack(packId)}>{label}</button>:linkedId&&onOpenDevice&&!selected?<button className="rd-connection-device" onClick={()=>onOpenDevice(linkedId)}>{label}</button>:<span>{label}</span>}</div></td><td><span className={`rd-connection-state rd-connection-${observation.status}`}><i aria-hidden="true"/>{({online:'在线',offline:'离线',unknown:'未知'} as Record<string,string>)[observation.status]}</span></td><td>{observation.time?formatDate(observation.time,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'--'}{observation.source&&<small className="rd-connection-source">来源记录 · 非实时</small>}</td></tr>
 })}</tbody></table>{!query.loading&&!rows.length&&<Empty/>}</article>
}

