/** Source sample times only: archive observation/configuration and receipt times are not measurement times. */
export function deviceSampleTime(points:Record<string,unknown>[],observations:Record<string,unknown>[]) {
 const ids=new Set(points.map(point=>String(point.id)))
 const samples=observations.filter(row=>ids.has(String(row.pointId))&&typeof row.sourceTime==='number'&&Number.isFinite(row.sourceTime)&&Number.isFinite(new Date(row.sourceTime).getTime()))
 const sourceTime=samples.length?Math.max(...samples.map(row=>row.sourceTime as number)):null
 return {sourceTime,unavailable:samples.some(row=>row.sourceTime===sourceTime&&(!!row.staleReason||row.quality==='invalid'||row.quality==='stale')),mixed:new Set(samples.map(row=>row.sourceTime)).size>1}
}
export function formatSampleTime(timestamp:number,timezone:string):string {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(timestamp).map(part=>[part.type,part.value]))
 const offset=parts.timeZoneName==='GMT'?'UTC+00:00':parts.timeZoneName.replace('GMT','UTC')
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${offset}`
}
