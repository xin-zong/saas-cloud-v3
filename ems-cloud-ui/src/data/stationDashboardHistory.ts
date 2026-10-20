export type HistoryPeriod='day'|'week'|'month'|'year'|'total'
export type HistoryCapture={available:boolean;period:HistoryPeriod;date:string;timezone:string|null;source:string;capturedAt:string|null;payload:unknown}
export const historyFields=['batteryPower','wirePower','batteryDcPower','generationPower','mpptGenerationPower','usePower','batterySoc','batterySoh','temperature','radiation','price'] as const
export type HistoryField=typeof historyFields[number]
export type HistoryRow={dateTime:number;weather:string|null}&Record<HistoryField,number|null>
export function historyDefaultDate(sourceTime:string|null|undefined,timezone:string|null|undefined){
 if(!sourceTime||!timezone||!/(Z|[+-]\d\d:\d\d)$/.test(sourceTime))return ''
 const date=new Date(sourceTime);if(!Number.isFinite(date.getTime()))return ''
 try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(type=>parts.find(p=>p.type===type)?.value).join('-')}catch{return ''}
}
export function historyValidDate(value:string,period:HistoryPeriod){
 if(period==='week')return historyValidDate(value,'day')
 if(period==='total'){const match=/^(\d{4}):(\d{4})$/.exec(value);return !!match&&+match[1]>=1000&&+match[2]>=+match[1]}
 const format=period==='day'?/^\d{4}-\d{2}-\d{2}$/:period==='month'?/^\d{4}-\d{2}$/:/^\d{4}$/
 if(!format.test(value)||+value.slice(0,4)<1000)return false
 const date=new Date(`${value}${period==='year'?'-01-01':period==='month'?'-01':''}T00:00:00Z`)
 return Number.isFinite(date.getTime())&&date.toISOString().startsWith(value)
}
export function historyShiftDate(value:string,period:HistoryPeriod,delta:number){
 if(period==='week')return historyShiftDate(value,'day',delta*7)
 if(!historyValidDate(value,period))return ''
 if(period==='total')return value.split(':').map(y=>+y+delta).join(':')
 const date=new Date(`${value}${period==='year'?'-01-01':period==='month'?'-01':''}T00:00:00Z`)
 if(period==='day')date.setUTCDate(date.getUTCDate()+delta);else if(period==='month')date.setUTCMonth(date.getUTCMonth()+delta);else date.setUTCFullYear(date.getUTCFullYear()+delta)
 return date.toISOString().slice(0,period==='day'?10:period==='month'?7:4)
}
export type StoragePeriod='week'|'month'|'year'
export function storageStatistics(payload:unknown,period:StoragePeriod){
 const data=record(payload)?payload:{},list=data[period==='year'?'stationStatisticMonthDtoList':'stationStatisticDayDtoList']
 const raw=data[{week:'stationStatisticWeekDto',month:'stationStatisticMonthDto',year:'stationStatisticYearDto'}[period]],summary=record(raw)?raw:{}
 const value=(row:Record<string,unknown>,key:string,factor=1)=>typeof row[key]==='number'&&Number.isFinite(row[key])?Number(((row[key] as number)*factor).toPrecision(14)):null
 return {rows:(Array.isArray(list)?list:[]).filter(record).map(row=>({label:period==='week'?String(row.acceptDay??'').replace(/^(\d{4})(\d{2})(\d{2})$/,'$2/$3'):String(row[period==='year'?'month':'day']??''),efficiency:value(row,'chargeDischargeEfficiency',100),charge:value(row,'chargeValue',.001),discharge:value(row,'dischargeValue',.001),chargeHours:value(row,'chargeDuration',1/3600000),dischargeHours:value(row,'dischargeDuration',1/3600000),utilization:value(row,'chargeDischargeUtilizationRatio',100)})),summary:{charge:value(summary,'chargeValue',.001),discharge:value(summary,'dischargeValue',.001),efficiency:value(summary,'chargeDischargeEfficiency',100),utilization:value(summary,'chargeDischargeUtilizationRatio',100)}}
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function historyRows(capture:HistoryCapture|undefined,period:HistoryPeriod,date:string):HistoryRow[]{
 // Only the day response's time coordinate and parameter fields have been verified.
 if(!capture?.available||!['reference-capture','database-mock'].includes(capture.source)||capture.period!==period||capture.date!==date||period!=='day'||!historyDefaultDate(capture.capturedAt,capture.timezone)||!record(capture.payload))return []
 const rows=capture.payload.stationStatisticPowerList
 if(!Array.isArray(rows))return []
 return rows.filter(record).filter(row=>typeof row.dateTime==='number'&&Number.isFinite(row.dateTime)&&row.dateTime>0&&row.dateTime<1e11).map(row=>Object.fromEntries([['dateTime',row.dateTime],['weather',typeof row.weather==='string'&&row.weather.trim()?row.weather:null],...historyFields.map(key=>{const n=row[key];return [key,typeof n==='number'&&Number.isFinite(n)&&(!['batterySoc','batterySoh'].includes(key)||n>=0&&n<=100)?n:null]})]) as HistoryRow).sort((a,b)=>a.dateTime-b.dateTime)
}

export type HistoryParameter={key:string;name:string;unit:string;group:string;color:string}
const parameter=(key:string,name:string,unit:string,group:string,color:string):HistoryParameter=>({key,name,unit,group,color})
const dayParameters=[parameter('weather','天气','','天气','#687f98'),parameter('mpptGenerationPower','MPPT发电功率','kW','光伏','#ffd457'),parameter('batteryDcPower','电池直流功率','kW','储能','#698bd3'),parameter('batteryPower','储能充放电功率','kW','储能','#71b5ff'),parameter('wirePower','电网功率','kW','电网','#ff535b'),parameter('generationPower','光伏发电功率','kW','光伏','#eaa834'),parameter('usePower','用电功率','kW','用电','#23b399'),parameter('batterySoc','电池剩余容量SOC','%','储能','#35bf3e'),parameter('batterySoh','电池健康度SOH','%','储能','#9664cf'),parameter('price','购电电价','元/kWh','电价','#bc648a'),parameter('temperature','当地温度','℃','天气','#f07741'),parameter('radiation','辐照强度','W/m²','天气','#c6a824')]
export const historyEnergyParameters=[parameter('mpptGenerationValue','MPPT发电量','kWh','光伏','#ffd457'),parameter('generationValue','光伏发电量','kWh','光伏','#eaa834'),parameter('useValue','用电量','kWh','用电','#23b399'),parameter('chargeValue','储能充电量','kWh','储能','#71b5ff'),parameter('dischargeValue','储能放电量','kWh','储能','#9664cf'),parameter('buyValue','购电量','kWh','电网','#ff535b'),parameter('gridValue','并网电量','kWh','电网','#39a6bf')]
export function historyCatalog(scene:string,period:HistoryPeriod,options:HistoryCapabilities={}):HistoryParameter[]{
 const keys=period==='day'?(scene==='solar'?['weather','generationPower','temperature','radiation']:scene==='storage'?['batteryPower','batterySoc','batterySoh','wirePower','usePower','price']:scene==='grid'?['wirePower','usePower']:['weather','batteryPower','wirePower','generationPower','usePower','batterySoc','price']):(scene==='solar'?['generationValue','gridValue']:scene==='storage'?['chargeValue','dischargeValue','buyValue','gridValue']:scene==='grid'?['buyValue','gridValue']:historyEnergyParameters.map(p=>p.key))
 if(period==='day'&&scene!=='grid'){if(options.mppt)keys.push('mpptGenerationPower');if(options.batteryDc&&scene!=='solar')keys.push('batteryDcPower');if(options.mpptOnly){const i=keys.indexOf('generationPower');if(i>=0)keys.splice(i,1)}}
 if(period!=='day'&&options.mpptEnergy&&scene!=='grid')keys.push('mpptGenerationValue')
 if(period!=='day'&&options.mpptOnly){const i=keys.indexOf('generationValue');if(i>=0)keys.splice(i,1)}
 return (period==='day'?dayParameters:historyEnergyParameters).filter(p=>keys.includes(p.key)&&(p.key!=='mpptGenerationValue'||options.mpptEnergy))
}
export function historyDefaultFields(scene:string,period:HistoryPeriod,options:HistoryCapabilities={}){return historyCatalog(scene,period,options).filter(p=>period!=='day'||['weather','batteryPower','wirePower','generationPower','mpptGenerationPower','batteryDcPower','usePower','batterySoc'].includes(p.key)).map(p=>p.key)}
function validCapture(c:HistoryCapture|undefined,period:HistoryPeriod,date:string){return !!c?.available&&['database-mock','reference-capture'].includes(c.source)&&c.period===period&&c.date===date&&!!historyDefaultDate(c.capturedAt,c.timezone)&&record(c.payload)}
const energyValues=(row:Record<string,unknown>)=>Object.fromEntries(historyEnergyParameters.map(p=>[p.key,typeof row[p.key]==='number'&&Number.isFinite(row[p.key])?Number(((row[p.key] as number)/1000).toPrecision(14)):null])) as Record<string,number|null>
export function historyEnergyRows(c:HistoryCapture|undefined,period:HistoryPeriod,date:string):({label:string}&Record<string,number|string|null>)[]{
 if(!validCapture(c,period,date)||period==='day')return []
 const payload=c!.payload as Record<string,unknown>,list=payload[period==='total'?'stationStatisticYearDtoList':period==='year'?'stationStatisticMonthDtoList':'stationStatisticDayDtoList']
 return (Array.isArray(list)?list:[]).filter(record).map(row=>({label:String(row[period==='total'?'year':period==='year'?'month':'day']??row.acceptDay??''),...energyValues(row)}))
}
export function historySummary(c:HistoryCapture|undefined,period:HistoryPeriod,date:string):Record<string,number|null>{
 if(!validCapture(c,period,date))return energyValues({})
 const payload=c!.payload as Record<string,unknown>,summary=payload[period==='day'?'stationStatisticDay':period==='month'?'stationStatisticMonthDto':period==='year'?'stationStatisticYearDto':'stationStatisticTotalDto']
 const supplemental=record(payload.dashboardSupplement)?payload.dashboardSupplement.summary:undefined
 return energyValues(period==='day'&&(!record(summary)||!historyEnergyParameters.some(p=>p.key in summary))&&record(supplemental)?supplemental:record(summary)?summary:{})
}


export type HistoryCapabilities={mppt?:boolean;mpptOnly?:boolean;batteryDc?:boolean;mpptEnergy?:boolean}
export function historyCapabilities(capture:HistoryCapture|undefined,period:HistoryPeriod,date:string):HistoryCapabilities{
 const rows=historyRows(capture,period,date),has=(key:HistoryField)=>rows.some(r=>r[key]!==null)
 const mppt=has('mpptGenerationPower'),energy=historyEnergyRows(capture,period,date)
 return {mppt,mpptOnly:mppt&&!has('generationPower'),batteryDc:has('batteryDcPower'),mpptEnergy:energy.some(r=>r.mpptGenerationValue!==null)||historySummary(capture,period,date).mpptGenerationValue!==null}
}


/** Verified station chart drill is local to this card: total -> year -> month -> day. */
export function historyDrillDate(period:HistoryPeriod,date:string,label:unknown):{period:HistoryPeriod;date:string}|null{
 if(!historyValidDate(date,period)||(typeof label!=='string'&&typeof label!=='number'))return null
 const value=String(label).trim();if(!value)return null
 if(period==='total'){if(!/^\d{4}$/.test(value)||value<date.split(':')[0]||value>date.split(':')[1]||!historyValidDate(value,'year'))return null;return {period:'year',date:value}}
 if(period==='year'){if(!/^\d{1,2}$/.test(value))return null;const next=`${date}-${value.padStart(2,'0')}`;return historyValidDate(next,'month')?{period:'month',date:next}:null}
 if(period==='month'){const next=/^\d{1,2}$/.test(value)?`${date}-${value.padStart(2,'0')}`:/^\d{8}$/.test(value)?`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`:value;return next.startsWith(date+'-')&&historyValidDate(next,'day')?{period:'day',date:next}:null}
 return null
}
