export type WiringElement = { id: string; kind: 'device'|'text'|'junction'|'breaker'; x:number; y:number; width:number; height:number; rotation:number; text:string; color:string; fontSize:number; align:'left'|'center'|'right'; deviceId:string|null; pointId:string|null }
export type WiringEdge = {id:string;source:string;target:string}
export type WiringGraph = {elements:WiringElement[];edges:WiringEdge[]}
export type WiringBinding = {deviceId:string;deviceName:string;pointId:string|null;pointName:string|null;unit:string|null}
export type WiringDiagram = {stationId:string;version:number;graph:WiringGraph|null}
export type WiringValue = {pointId?:string;value?:unknown;unit?:string;sourceTime?:number;receivedAt?:number;staleReason?:string|null;quality?:string}
export function fromTopology(bindings:WiringBinding[],links:Record<string,unknown>[]):WiringGraph {
 const devices=[...new Map(bindings.map(row=>[row.deviceId,row])).values()].slice(0,500)
 const elements=devices.map((d,i):WiringElement=>({id:`device_${d.deviceId}`,kind:'device',x:40+i%5*180,y:40+Math.floor(i/5)*100,width:150,height:70,rotation:0,text:d.deviceName.slice(0,200),color:'#166534',fontSize:14,align:'center',deviceId:d.deviceId,pointId:null}))
 const ids=new Set(devices.map(d=>d.deviceId))
 const edges=links.filter(l=>ids.has(String(l.source_device_id))&&ids.has(String(l.target_device_id))&&String(l.source_device_id)!==String(l.target_device_id)).slice(0,1000).map((l,i)=>({id:`link_${i}`,source:`device_${l.source_device_id}`,target:`device_${l.target_device_id}`}))
 return {elements,edges}
}
export function removeElement(graph:WiringGraph,id:string):WiringGraph {return {elements:graph.elements.filter(e=>e.id!==id),edges:graph.edges.filter(e=>e.source!==id&&e.target!==id)}}
export function valueLabel(value:WiringValue|undefined):string {
 if(!value)return '暂无遥测'
 const display=value.value===null||value.value===undefined?'暂无值':typeof value.value==='object'?'数组值请查看设备':String(value.value)
 return `${display}${value.unit?' '+value.unit:''} · ${value.staleReason?'最后采样 · 已过期或无效':'质量 '+({valid:'有效',invalid:'无效'}[value.quality??'']??'未知')} · 源时间 ${value.sourceTime?new Date(value.sourceTime).toLocaleString():'未知'} · 接收时间 ${value.receivedAt?new Date(value.receivedAt).toLocaleString():'未知'}`
}
