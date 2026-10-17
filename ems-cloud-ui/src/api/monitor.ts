import {api,send} from './client'
export type MonitorWidget={card:string;x:number;y:number;w:number;h:number}
export type MonitorLayout={widgets:MonitorWidget[];version:number}
export type MonitorStation={id:string;name:string;code:string;scene:string;region:string;communication:'online'|'offline'|'unknown';rated_power_kw:number;capacity_kwh:number;solar_capacity_kw:number|null;device_count:number}
export type MonitorSample={stationId:string;timestamp:number;value:number|null;unit?:string;samples?:number}
export type MonitorHistory={metric:string;unit:string;from:string;to:string;minutes:number;items:MonitorSample[];ranking:{stationId:string;value:number;samples:number}[];stationResults:{stationId:string;value:number|null;reason:string|null}[];unavailable:string[]}
const layoutPath=(id:string|null)=>'/monitor/layout'+(id?`?templateId=${encodeURIComponent(id)}`:'')
export const loadMonitorLayout=(id:string|null,signal?:AbortSignal)=>api<MonitorLayout>(layoutPath(id),{signal})
export const saveMonitorLayout=(id:string|null,layout:MonitorLayout)=>send<MonitorLayout>(layoutPath(id),'PUT',{widgets:layout.widgets,expectedVersion:layout.version})
export const loadMonitorStations=(scene:string,communication:string,search:string,signal?:AbortSignal)=>api<MonitorStation[]>('/monitor/stations?'+new URLSearchParams({scene,communication,search}),{signal})
export const loadMonitorHistory=(stationIds:string[],metric:string,from:string,to:string,minutes:number,signal?:AbortSignal,exporting=false)=>api<MonitorHistory>('/monitor/history?'+new URLSearchParams({stationIds:stationIds.join(','),metric,from,to,minutes:String(minutes),export:String(exporting)}),{signal})
export const defaultMonitorLayout=(cards:string[]):MonitorWidget[]=>cards.map((card,i)=>({card,x:(i%2)*6,y:Math.floor(i/2)*3,w:6,h:3}))
/** Explicit null buckets prevent chart interpolation across unmeasured intervals. */
export function monitorChartRows(samples:MonitorSample[],ids:string[],from:number,to:number,minutes:number){
 const step=minutes*60000,rows=new Map<number,Record<string,number|null>>();
 for(let timestamp=Math.floor(from/step)*step;timestamp<to;timestamp+=step){const row:Record<string,number|null>={timestamp};ids.forEach(id=>row[id]=null);rows.set(timestamp,row)}
 for(const sample of samples){const row=rows.get(Number(sample.timestamp));if(row&&ids.includes(sample.stationId))row[sample.stationId]=sample.value===null?null:Number.isFinite(Number(sample.value))?Number(sample.value):null}
 return [...rows.values()]
}
