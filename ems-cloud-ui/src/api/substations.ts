import {api,send} from './client'
import type {Substation,SubstationDraft,Candidate,Capabilities} from '@/data/substations'
const base=(stationId:string)=>`/stations/${encodeURIComponent(stationId)}`
export const substationsApi={
 list:(station:string,signal?:AbortSignal)=>api<Substation[]>(`${base(station)}/substations`,{signal}),
 detail:(station:string,id:string,signal?:AbortSignal)=>api<Substation>(`${base(station)}/substations/${encodeURIComponent(id)}`,{signal}),
 capabilities:(station:string,signal?:AbortSignal)=>api<Capabilities>(`${base(station)}/substation-capabilities`,{signal}),
 devices:(station:string,signal?:AbortSignal)=>api<Candidate[]>(`${base(station)}/substation-devices`,{signal}),
 save:(station:string,draft:SubstationDraft,existing?:Substation)=>send<Substation>(`${base(station)}/substations${existing?`/${encodeURIComponent(existing.id)}`:''}`,existing?'PUT':'POST',{...draft,...(existing?{expectedVersion:existing.version}:{})}),
 archive:(station:string,row:Substation)=>send<null>(`${base(station)}/substations/${encodeURIComponent(row.id)}`,'DELETE',{expectedVersion:row.version}),
 bind:(station:string,row:Substation,deviceIds:string[])=>send<Substation>(`${base(station)}/substations/${encodeURIComponent(row.id)}/devices`,'PUT',{deviceIds,expectedVersion:row.version}),
}
