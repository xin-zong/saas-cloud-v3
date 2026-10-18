import {api,send} from './client'
export type MetricSource={metricKey:string;label:string;unit:string;energy:boolean;lastValue:string|null;sourceTime:number|null;quality:string|null;mode:'DYNAMIC'|'STATIC';pointId:string|null;resolvedPointId:string|null;version:number;status:'resolved'|'missing'|'ambiguous'|'none'|'unsupported';candidates:{pointId:string;deviceId:string;name:string;unit:string;semanticKey:string}[]}
export type EnergyOffset={metricKey:string;kind:'DAILY'|'TOTAL';date:string;value:string;reason:string;version:number;active:boolean}
export type EnergyResult={metricKey:string;period:'DAY'|'MONTH'|'YEAR';periodStart:string;rawValue:string|null;dailyOffset:string;correctedValue:string|null;totalOffset:string;calibratedTotal:string|null;completeDays:number;expectedDays:number;status:'complete'|'missing';missingReason:string|null;sourceVersion:number;jobId:string|null}
export type RecalculationJob={id:string;from:string;to:string;status:string;createdAt:string;missingDays:number}
export type EnergyResults={days:EnergyResult[];months:EnergyResult[];years:EnergyResult[];jobs:RecalculationJob[];calculationPolicy:string}
const base=(id:string)=>`/stations/${encodeURIComponent(id)}/metrics`
export const loadMetricSources=(id:string)=>api<{items:MetricSource[];calculationPolicy:string}>(`${base(id)}/sources`)
export const saveMetricSource=(id:string,key:string,body:{mode:MetricSource['mode'];pointId:string|null;expectedVersion:number})=>send(`${base(id)}/sources/${encodeURIComponent(key)}`,'PUT',body)
export const loadEnergyOffsets=(id:string,key:string)=>api<{items:EnergyOffset[]}>(`${base(id)}/offsets?metricKey=${encodeURIComponent(key)}`)
export const writeEnergyOffset=(id:string,row:Pick<EnergyOffset,'metricKey'|'kind'|'date'>,body:{value?:string;reason:string;expectedVersion:number},revoke=false)=>send(`${base(id)}/offsets/${encodeURIComponent(row.metricKey)}/${row.kind}/${encodeURIComponent(row.date)}`,revoke?'DELETE':'PUT',body)
export const loadEnergyResults=(id:string,from:string,to:string)=>api<EnergyResults>(`${base(id)}/results?${new URLSearchParams({from,to})}`)
export const recalculateEnergy=(id:string,from:string,to:string)=>send<RecalculationJob>(`${base(id)}/recalculations`,'POST',{from,to})
