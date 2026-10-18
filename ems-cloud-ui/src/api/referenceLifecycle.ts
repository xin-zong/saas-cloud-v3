import {api,send} from './client'
import {lifecyclePayload,type StationDraft,type DeviceDraft} from '@/data/referenceLifecycle'
export type LifecycleStation=StationDraft&{id:string;version:number}
export type LifecycleDevice=DeviceDraft&{id:string;version:number}
export type LifecycleOptions={canCreate:boolean;stations:{id:string;name:string}[];members:{id:string;name:string}[];roles:{id:string;name:string;source:string}[]}
const base='/reference-lifecycle'
export const getLifecycleOptions=(signal?:AbortSignal)=>api<LifecycleOptions>(`${base}/options`,{signal})
export const getLifecycleStation=(id:string,signal?:AbortSignal)=>api<LifecycleStation>(`${base}/stations/${encodeURIComponent(id)}`,{signal})
export const getLifecycleDevice=(id:string,signal?:AbortSignal)=>api<LifecycleDevice>(`${base}/devices/${encodeURIComponent(id)}`,{signal})
export const saveLifecycleStation=(draft:StationDraft,id?:string,expectedVersion?:number)=>send<LifecycleStation>(`${base}/stations${id?`/${encodeURIComponent(id)}`:''}`,id?'PUT':'POST',{...lifecyclePayload(draft),...(id?{expectedVersion}:{})})
export const saveLifecycleDevice=(draft:DeviceDraft,id?:string,expectedVersion?:number)=>send<LifecycleDevice>(`${base}/devices${id?`/${encodeURIComponent(id)}`:''}`,id?'PUT':'POST',{...lifecyclePayload(draft),...(id?{expectedVersion}:{})})
export const archiveLifecycleAsset=(kind:'station'|'device',id:string,expectedVersion:number)=>send(`${base}/${kind}s/${encodeURIComponent(id)}/archive`,'POST',{expectedVersion})
export const assignLifecycleAsset=(kind:'station'|'device',id:string,expectedVersion:number,assignment:{userId?:string;roleId?:string;templateId?:string;stationId?:string})=>send(`${base}/${kind}s/${encodeURIComponent(id)}/assign`,'POST',{expectedVersion,...assignment})
