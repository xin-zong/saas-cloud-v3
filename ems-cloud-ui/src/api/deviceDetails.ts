import {api,send} from './client'
import type {DeviceConfiguration,DeviceDetail} from '@/data/stationDevices'
const path=(station:string,device:string)=>`/stations/${encodeURIComponent(station)}/devices/${encodeURIComponent(device)}`
export const loadDeviceDetail=(station:string,device:string,signal?:AbortSignal)=>api<DeviceDetail>(`${path(station,device)}/detail`,{signal})
export const loadDeviceRealtime=(station:string,device:string,signal?:AbortSignal)=>api<{items:Record<string,unknown>[]}>(`${path(station,device)}/realtime`,{signal})
export const loadDeviceCells=(device:string,signal?:AbortSignal)=>api<{known:boolean;unknownReason:string;values:Record<string,unknown>[]}>(`/devices/${encodeURIComponent(device)}/cells`,{signal})
export const loadDeviceAlarms=(station:string,device:string,offset=0,signal?:AbortSignal)=>api<{items:Record<string,unknown>[];total:number}>(`/alarms/workspace?${new URLSearchParams({stationId:station,deviceId:device,view:'all',limit:'20',offset:String(offset)})}`,{signal})
export const saveDeviceConfiguration=(station:string,device:string,configuration:DeviceConfiguration)=>send<DeviceConfiguration>(`${path(station,device)}/configuration`,'PUT',configuration)
// Always use saved EMS binding ownership; imported device ids have no legacy history authority.
export const loadDeviceHistory=(point:string,from:Date,to:Date,signal?:AbortSignal)=>{
 if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||to<=from||to.getTime()-from.getTime()>31*86400000)throw new Error('请选择31天内有效历史范围')
 return api<Record<string,unknown>[]>(`/points/${encodeURIComponent(point)}/history?${new URLSearchParams({from:from.toISOString(),to:to.toISOString(),minutes:'15',source:'ems',aggregation:'last'})}`,{signal})
}
