import { api, ApiError, getToken, getSessionVersion, setToken, refreshAfterForbidden } from './client'
import { adaptObservation, mergeDeviceObservations, type Observation } from './ems'
import { mergePresence, type Presence } from './presence'
import type { Station } from '../App'

export type StationSnapshot={items:Observation[];serverTime:number;presence:Presence|null}
type Callbacks={onSnapshot:(snapshot:StationSnapshot)=>void;onStatus?:(status:'connecting'|'connected'|'reconnecting'|'closed')=>void;onError?:(error:Error)=>void}
export function readSseFrames(buffer:string):{events:{event:string;data:string}[];rest:string}{
  const normalized=buffer.replace(/\r\n/g,'\n'),blocks=normalized.split('\n\n'),rest=blocks.pop()??''
  return {rest,events:blocks.map(block=>{let event='message';const data:string[]=[];for(const line of block.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''))}return{event,data:data.join('\n')}}).filter(frame=>frame.data!=='')}
}
export async function loadStationSnapshot(stationId:string,signal:AbortSignal):Promise<StationSnapshot>{
  const result=await api<StationSnapshot>(`/stations/${encodeURIComponent(stationId)}/telemetry/snapshot`,{signal})
  return {...result,items:result.items.map(adaptObservation)}
}
export async function subscribeStationTelemetry(stationId:string,pointIds:string[],callbacks:Callbacks,signal:AbortSignal):Promise<void>{
  const base=(import.meta.env.VITE_API_BASE_URL||'http://127.0.0.1:18090/api').replace(/\/$/,'')
  const token=getToken(),version=getSessionVersion();let retries=0
  const current=()=>!signal.aborted&&getToken()===token&&getSessionVersion()===version
  const sleep=(ms:number)=>new Promise<void>(resolve=>{const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve()};const timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});if(signal.aborted)finish()})
  try {
    while(current()) {
      callbacks.onStatus?.(retries?'reconnecting':'connecting')
      let reader:ReadableStreamDefaultReader<Uint8Array>|undefined
      try {
        const params=new URLSearchParams();if(pointIds.length)params.set('pointIds',pointIds.join(','))
        const response=await fetch(`${base}/stations/${encodeURIComponent(stationId)}/telemetry/stream?${params}`,{headers:{Accept:'text/event-stream',...(token?{Authorization:`Bearer ${token}`}:{})},signal})
        if(!response.ok)throw new ApiError(`实时订阅失败 (${response.status})`,response.status)
        if(!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw new Error('服务器未返回实时数据流')
        reader=response.body.getReader();const decoder=new TextDecoder();let buffer=''
        callbacks.onStatus?.('connected');retries=0
        while(current()) {
          const chunk=await reader.read();if(chunk.done)break
          buffer+=decoder.decode(chunk.value,{stream:true});if(buffer.length>4*1024*1024)throw new Error('实时快照过大')
          const parsed=readSseFrames(buffer);buffer=parsed.rest
          for(const frame of parsed.events) {
            if(!current())break
            if(frame.event==='stream-error'){const error=JSON.parse(frame.data);throw new ApiError(error.msg||'实时服务暂不可用',error.code||503)}
            if(frame.event==='snapshot'){const snapshot=JSON.parse(frame.data) as StationSnapshot;callbacks.onSnapshot({...snapshot,items:snapshot.items.map(adaptObservation)})}
          }
        }
      } catch(error) {
        if(!current())break
        const failure=error instanceof Error?error:new Error('实时服务暂不可用');callbacks.onError?.(failure)
        if(failure instanceof ApiError&&(failure.status===401||failure.status===403)){
          if(failure.status===401&&getToken()===token){setToken(null);window.dispatchEvent(new Event('enerlution:unauthorized'))}
          else if(failure.status===403)await refreshAfterForbidden()
          break
        }
      } finally {await reader?.cancel().catch(()=>{});reader?.releaseLock()}
      if(current()){retries++;callbacks.onStatus?.('reconnecting');await sleep(Math.min(15000,1000*2**Math.min(retries-1,4)))}
    }
  } finally {callbacks.onStatus?.('closed')}
}

/** Protocol IDs, not translated labels, identify a physical measurement's meaning. */
const metrics:Record<number,string>={20018:'soc',20019:'soh',20021:'dcVoltage',20023:'dcCurrent',20024:'power',20029:'temperature',20107:'power',20197:'power',20248:'power'}
export function mergeStationSnapshot(station:Station,snapshot:StationSnapshot):Station{
  const fresh=snapshot.items.filter(row=>!row.staleReason&&row.quality==='valid'&&row.valueType==='number'&&Number.isFinite(Number(row.value))&&row.value!==null)
  const rows=new Map(snapshot.items.map(row=>[row.pointId,row]))
  const cleared=(station.deviceInventory??[]).map(device=>({...device,points:device.points.map(point=>({...point,value:null,exactValue:undefined,quality:'bad' as const}))}))
  const deviceInventory=mergeDeviceObservations(cleared,snapshot.items).map(device=>({...device,points:device.points.map(point=>{
    const row=rows.get(point.id);return row?{...point,sourceId:Number(row.sourceId),metric:row.namespace==='cabinet'?metrics[Number(row.sourceId)]:undefined}:point
  })}))
  const socs=fresh.filter(row=>row.namespace==='cabinet'&&Number(row.sourceId)===20018)
  // Device capacity is not currently configured; mean is explicitly indicated, not invented weighting.
  const soc=socs.length?socs.reduce((total,row)=>total+Number(row.value),0)/socs.length:NaN
  const sum=(sourceId:number)=>{const selected=fresh.filter(row=>row.namespace==='cabinet'&&Number(row.sourceId)===sourceId);return selected.length?selected.reduce((total,row)=>total+Number(row.value),0):NaN}
  const activePower=sum(20197),pvOutput=sum(20107)/1000
  const next={...station,deviceInventory,soc,activePower,pvOutput,loadRate:Number.isFinite(activePower)&&station.ratedPower>0?Math.abs(activePower)/station.ratedPower*100:NaN,updateTime:new Date(snapshot.serverTime).toLocaleTimeString('zh-CN'),updateSub:socs.length>1?'已采集设备；SOC 简单平均':'已采集设备实时数据'}
  return snapshot.presence?mergePresence([next],[snapshot.presence])[0]:next
}
