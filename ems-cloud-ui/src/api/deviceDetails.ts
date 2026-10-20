import {api,send} from './client'
import type {DeviceConfiguration,DeviceDetail} from '@/data/stationDevices'
const path=(station:string,device:string)=>`/stations/${encodeURIComponent(station)}/devices/${encodeURIComponent(device)}`
export const loadDeviceDetail=(station:string,device:string,signal?:AbortSignal)=>api<DeviceDetail>(`${path(station,device)}/detail`,{signal})
export const loadDeviceRealtime=(station:string,device:string,signal?:AbortSignal)=>api<{items:Record<string,unknown>[]}>(`${path(station,device)}/realtime`,{signal})
export const loadDeviceCells=(device:string,signal?:AbortSignal)=>api<{known:boolean;unknownReason:string;values:Record<string,unknown>[]}>(`/devices/${encodeURIComponent(device)}/cells`,{signal})
export type DeviceAlarmQuery={view?:'all'|'live'|'recovered';limit?:number;query?:string;severity?:string;start?:string;end?:string;sort?:'asc'|'desc'}
export const loadDeviceAlarms=(station:string,device:string,offset=0,signal?:AbortSignal,query:DeviceAlarmQuery={})=>{const params=new URLSearchParams({stationId:station,deviceId:device,view:query.view??'all',limit:String(query.limit??20),offset:String(offset)});for(const key of ['query','severity','start','end','sort'] as const)if(query[key])params.set(key,query[key]!);return api<{items:Record<string,unknown>[];total:number}>(`/alarms/workspace?${params}`,{signal})}
export const saveDeviceConfiguration=(station:string,device:string,configuration:DeviceConfiguration)=>send<DeviceConfiguration>(`${path(station,device)}/configuration`,'PUT',configuration)
export const DEVICE_HISTORY_INTERVAL_MINUTES=15
// Always use saved EMS binding ownership; imported device ids have no legacy history authority.
export const loadDeviceHistory=(point:string,from:Date,to:Date,signal?:AbortSignal)=>{
 if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||to<=from||to.getTime()-from.getTime()>31*86400000)throw new Error('请选择31天内有效历史范围')
 return api<Record<string,unknown>[]>(`/points/${encodeURIComponent(point)}/history?${new URLSearchParams({from:from.toISOString(),to:to.toISOString(),minutes:String(DEVICE_HISTORY_INTERVAL_MINUTES),source:'ems',aggregation:'last'})}`,{signal})
}
// Pack ancestry and point membership are revalidated by this scoped route on every query.
export const loadBatteryPackHistory=(station:string,node:string,point:string,from:Date,to:Date,signal?:AbortSignal)=>{
 if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||to<=from||to.getTime()-from.getTime()>31*86400000)throw new Error('请选择31天内有效历史范围')
 return api<Record<string,unknown>[]>(`/stations/${encodeURIComponent(station)}/reference-connections/${encodeURIComponent(node)}/battery-pack/history?${new URLSearchParams({pointId:point,from:from.toISOString(),to:to.toISOString(),minutes:String(DEVICE_HISTORY_INTERVAL_MINUTES),aggregation:'last'})}`,{signal})
}
export type HistoryBatchItem={pointId:string;rows:Record<string,unknown>[]}
export type HistoryBatchLoader=(points:string[],from:Date,to:Date,signal:AbortSignal)=>Promise<HistoryBatchItem[]>
async function historyBatch(route:string,ids:string[],from:Date,to:Date,signal:AbortSignal):Promise<HistoryBatchItem[]>{
 if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||to<=from||to.getTime()-from.getTime()>31*86400000)throw new Error('请选择31天内有效历史范围')
 const unique=[...new Set(ids)],queue:string[][]=[];for(let i=0;i<unique.length;i+=128)queue.push(unique.slice(i,i+128))
 const group=new AbortController(),abort=()=>group.abort(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
 const result=new Map<string,HistoryBatchItem>();let failure:unknown
 async function chunk(points:string[]):Promise<void>{
  group.signal.throwIfAborted()
  try{const response=await api<{items:HistoryBatchItem[]}>(`${route}?${new URLSearchParams({pointIds:points.join(','),from:from.toISOString(),to:to.toISOString(),minutes:String(DEVICE_HISTORY_INTERVAL_MINUTES),aggregation:'last'})}`,{signal:group.signal});group.signal.throwIfAborted();
   if(response.items.length!==points.length||response.items.some((item,index)=>item.pointId!==points[index]||!Array.isArray(item.rows)))throw new Error('历史批量响应不完整')
   response.items.forEach(item=>result.set(item.pointId,item))
  }catch(error){if(!group.signal.aborted&&(error as {status?:number}).status===413&&points.length>1){const middle=Math.ceil(points.length/2);await chunk(points.slice(0,middle));await chunk(points.slice(middle));return}throw error}
 }
 try{await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{try{while(queue.length){group.signal.throwIfAborted();await chunk(queue.shift()!)}}catch(error){if(failure===undefined)failure=error;group.abort();throw error}}));signal.throwIfAborted();return unique.map(id=>result.get(id)!)}catch(error){throw failure??error}finally{signal.removeEventListener('abort',abort)}
}
export const loadDeviceHistoryBatch=(station:string,device:string,ids:string[],from:Date,to:Date,signal:AbortSignal)=>historyBatch(`${path(station,device)}/history-batch`,ids,from,to,signal)
export const loadBatteryPackHistoryBatch=(station:string,node:string,ids:string[],from:Date,to:Date,signal:AbortSignal)=>historyBatch(`/stations/${encodeURIComponent(station)}/reference-connections/${encodeURIComponent(node)}/battery-pack/history-batch`,ids,from,to,signal)
