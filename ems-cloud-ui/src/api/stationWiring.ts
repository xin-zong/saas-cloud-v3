import {api,send} from './client'
import type {WiringBinding,WiringDiagram,WiringGraph,WiringValue} from '@/data/stationWiring'
const base=(station:string)=>`/stations/${encodeURIComponent(station)}/wiring-diagram`
export const loadWiring=(station:string,signal?:AbortSignal)=>api<WiringDiagram>(base(station),{signal})
export const wiringBindings=(station:string,signal?:AbortSignal)=>api<WiringBinding[]>(`${base(station)}/bindings`,{signal})
export const wiringValues=(station:string,signal?:AbortSignal)=>api<{items:WiringValue[]}>(`${base(station)}/values`,{signal})
export const saveWiring=(station:string,expectedVersion:number,graph:WiringGraph)=>send<WiringDiagram>(base(station),'PUT',{expectedVersion,graph})
