/** Meter boundaries must be explicit: never add multiple sources with the same semantic key. */
export function uniqueStationValue(rows:readonly {semanticKey?:unknown;value:unknown;valueType:string;quality:string;staleReason?:unknown}[],semantic:string):number|null{
 const matches=rows.filter(row=>row.semanticKey===semantic)
 if(matches.length!==1)return null
 const row=matches[0]
 if(row.staleReason||row.valueType!=='number'||row.quality!=='valid'||row.value===null||row.value===undefined||row.value==='')return null
 const value=Number(row.value)
 return Number.isFinite(value)?value:null
}
/** A child without an identity must never fall back to the station snapshot endpoint. */
export function childTelemetryPath(stationId:string,childId:string):string{
 if(!stationId.trim()||!childId.trim())throw new Error('缺少父场站或子场站标识')
 return `/stations/${encodeURIComponent(stationId)}/substations/${encodeURIComponent(childId)}/telemetry`
}
