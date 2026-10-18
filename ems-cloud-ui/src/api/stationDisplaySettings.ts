import {api,send} from './client'
export type StationDisplaySettings={powerFactorVisible:boolean|null;revenueVisible:boolean|null;version:number}
export const loadStationDisplaySettings=(id:string,signal?:AbortSignal)=>api<StationDisplaySettings>(`/stations/${encodeURIComponent(id)}/display-settings`,{signal})
export const saveStationDisplaySettings=(id:string,v:StationDisplaySettings)=>send<StationDisplaySettings>(`/stations/${encodeURIComponent(id)}/display-settings`,'PUT',{powerFactorVisible:v.powerFactorVisible,revenueVisible:v.revenueVisible,expectedVersion:v.version})
