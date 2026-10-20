import {historyValidDate,type HistoryCapture,type HistoryPeriod} from './stationDashboardHistory'
const object=(v:unknown):Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null
const positive=(v:unknown)=>{const n=number(v);return n!==null&&n>=0?n:null}
const text=(v:unknown)=>typeof v==='string'?v:''
function proportion(total:number|null,second:number|null){const first=total!==null&&second!==null&&second<=total?total-second:null,valid=first!==null&&total!==null&&total>0;return {total,first,second,firstPercent:valid?first!/total!*100:null,secondPercent:valid?second!/total!*100:null}}
export function compositionData(capture:HistoryCapture|undefined,period:HistoryPeriod='day',date=''){
 let summary:Record<string,unknown>={}
 if(capture?.available&&capture.period===period&&capture.date===date&&historyValidDate(date,period)&&['database-mock','reference-capture'].includes(capture.source)){
  const payload=object(capture.payload),keys={day:'stationStatisticDay',week:'stationStatisticWeekDto',month:'stationStatisticMonthDto',year:'stationStatisticYearDto',total:'stationStatisticTotalDto'},raw=object(payload[keys[period]])
  summary=['generationValue','useValue','gridValue','buyValue'].some(k=>k in raw)?raw:object(object(payload.dashboardSupplement).summary)
 }
 const kwh=(key:string)=>{const n=positive(summary[key]);return n===null?null:n/1000}
 return {solar:proportion(kwh('generationValue'),kwh('gridValue')),load:proportion(kwh('useValue'),kwh('buyValue'))}
}
export type GridPeriod='day'|'month'|'year'|'total'
export const gridDayFields=[{key:'powerFactor',name:'实时电网功率因数',unit:'',color:'#60b6ed'},{key:'activeKw',name:'电网有功功率',unit:'kW',color:'#38ad90'},{key:'reactiveKvar',name:'电网无功功率',unit:'kVar',color:'#e9a148'}] as const
export const gridEnergyFields=[{key:'powerFactor',name:'当日功率因数',unit:'',color:'#60b6ed'},{key:'buyKwh',name:'购电有功电能',unit:'kWh',color:'#38ad90'},{key:'exportKwh',name:'并网有功电能',unit:'kWh',color:'#d7ac41'},{key:'positiveReactiveKvarh',name:'正向无功电能',unit:'kVarh',color:'#a07bd5'},{key:'negativeReactiveKvarh',name:'反向无功电能',unit:'kVarh',color:'#e58089'}] as const
export type GridField=typeof gridDayFields[number]['key']|typeof gridEnergyFields[number]['key']
export function gridCatalog(period:GridPeriod):Array<{key:GridField;name:string;unit:string;color:string}>{return period==='day'?[...gridDayFields]:gridEnergyFields.map(f=>({...f,name:f.key==='powerFactor'?({month:'当日功率因数',year:'当月功率因数',total:'当年功率因数'}[period]):f.name}))}
const pf=(v:unknown)=>{const n=number(v);return n!==null&&Math.abs(n)<=1?n:null}
const values=(r:Record<string,unknown>)=>({powerFactor:pf(r.powerFactor),activeKw:number(r.activeKw),reactiveKvar:number(r.reactiveKvar),buyKwh:positive(r.buyKwh),exportKwh:positive(r.exportKwh),positiveReactiveKvarh:positive(r.positiveReactiveKvarh),negativeReactiveKvarh:positive(r.negativeReactiveKvarh)})
function grid(payload:unknown){const data=object(payload);return object(object(data.dashboardSupplement??data).grid)}
export function gridData(payload:unknown){const data=grid(payload),instant=object(data.instant),month=object(data.month);return {instant:{...values(instant),direction:text(instant.direction)},month:{...values(month),from:text(month.from)||text(month.fromDate),to:text(month.to)||text(month.toDate),updatedAt:text(month.updatedAt)}}}
export function gridRows(payload:unknown,period:GridPeriod,date:string){
 if(!historyValidDate(date,period))return []
 const history=object(grid(payload).history),direct=history[period],raw=object(payload),fallback=period==='day'?null:raw[period==='month'?'stationStatisticDayDtoList':period==='year'?'stationStatisticMonthDtoList':'stationStatisticYearDtoList']
 const aggregate=(Array.isArray(fallback)?fallback:[]).map(object).map(r=>{const y=String(r.year??date.slice(0,4)),m=String(r.month??'').padStart(2,'0'),d=String(r.day??'').padStart(2,'0'),accept=String(r.acceptDay??'');const label=period==='total'?y:period==='year'?`${y}-${m}`:/^\d{8}$/.test(accept)?`${accept.slice(0,4)}-${accept.slice(4,6)}-${accept.slice(6,8)}`:`${date}-${d}`;const wh=(v:unknown)=>{const n=positive(v);return n===null?null:n/1000};return {date:label,powerFactor:pf(r.powerFactor),buyKwh:wh(r.buyValue),exportKwh:wh(r.gridValue)}})
 const rows=Array.isArray(direct)&&direct.length?direct:aggregate,timezone=text(history.timezone)||text(object(object(payload).dashboardSupplement??payload).timezone)
 const localDate=(value:unknown)=>{const label=text(value);if(!/^\d{10}$/.test(label))return label;if(!timezone)return '';try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Number(label)*1000));const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`}catch{return ''}}
 return (Array.isArray(rows)?rows:[]).map(object).map(r=>({...r,date:localDate(r.date)})).filter(r=>{const label=text(r.date);const coordinate=period==='total'?label.slice(0,4):period==='year'?label.slice(0,7):label.slice(0,10);if(!historyValidDate(coordinate,period==='total'?'year':period==='year'?'month':'day'))return false;return period==='total'?/^\d{4}/.test(label)&&label.slice(0,4)>=date.split(':')[0]&&label.slice(0,4)<=date.split(':')[1]:label.startsWith(date)}).map(r=>({date:text(r.date),...values(r)})).sort((a,b)=>a.date.localeCompare(b.date))
}

export function gridExportRequest(period:GridPeriod,date:string,selected:string[]){const fields=[...new Set(selected)].filter(key=>gridCatalog(period).some(f=>f.key===key));return historyValidDate(date,period)&&fields.length?{period,date,scene:'grid',fields}:null}
export const gridDayTicks=[0,240,480,720,960,1200,1440]
export function gridDayMinute(localDate:string):number|null{const match=/^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(localDate);if(!match||+match[1]>23||+match[2]>59||+(match[3]??0)>59)return null;return +match[1]*60+ +match[2]+ +(match[3]??0)/60}
export function gridMinuteLabel(minute:number){const seconds=Math.round(minute*60),hh=String(Math.floor(seconds/3600)).padStart(2,'0'),mm=String(Math.floor(seconds%3600/60)).padStart(2,'0'),ss=seconds%60;return `${hh}:${mm}${ss?`:${String(ss).padStart(2,'0')}`:''}`}
export type DashboardDatasetTime={sourceTime:string|null;timezone:string|null;mocked:boolean}
export function dashboardDatasetTime(payload:unknown,view:{sourceTime?:string|null;timezone?:string|null;mocked?:boolean}|undefined,telemetry:boolean):DashboardDatasetTime{
 if(!telemetry)return {sourceTime:null,timezone:null,mocked:false}
 const supplement=object(object(payload).dashboardSupplement),updatedAt=text(supplement.updatedAt)
 if(updatedAt&&Number.isFinite(new Date(updatedAt).getTime()))return {sourceTime:updatedAt,timezone:text(supplement.timezone)||view?.timezone||null,mocked:true}
 return {sourceTime:view?.sourceTime??null,timezone:view?.timezone??null,mocked:view?.mocked===true}
}
