export type SolarPeriod = 'week' | 'month' | 'year'
type N = number | null
type Optional<T> = { [K in keyof T]?: T[K] | null }
export type SolarRow = {date:string;value:N;weather?:string|null}
export type SolarRanking = {deviceId:string;name:string;value:N}
export type SolarPlanRow = {date:string;actualKwh:N;plannedKwh:N;excellentKwh?:N;completionPercent:N}
export type DashboardSupplement = {
 weather?: Optional<{location:string;updatedAt:string;temperatureC:number;condition:string;sunrise:string;sunset:string;daylightHours:number;windSpeedMs:number;forecast:Array<Optional<{date:string;lowC:number;highC:number;condition:string}>>}> | null
 solar?: Optional<{normalizationPercent:number;powerKw:number;fullHoursDay:number;capacityKw:number;dailyKwh:number;totalKwh:number}> | null
 fullHours?: Partial<Record<SolarPeriod,Optional<{rows:SolarRow[];total:number;ranking:SolarRanking[]}>|null>> | null
 pr?: Partial<Record<SolarPeriod,Optional<{rows:SolarRow[];value:number}>|null>> | null
 generationPlan?: Partial<Record<'year'|'total',Optional<{rows:SolarPlanRow[];actualKwh:number;plannedKwh:number;excellentKwh:number;summaryYear:string}>|null>> | null
}
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
const number=(value:unknown):N=>typeof value==='number'&&Number.isFinite(value)?value:null
const targetNumber=(value:unknown):N=>{const n=number(value);return n!==null&&n>=0?n:null}
const text=(value:unknown)=>typeof value==='string'?value:''
const list=(value:unknown)=>Array.isArray(value)?value.map(object):[]
const periodRows=(value:unknown)=>list(value).filter(r=>text(r.date)).map(r=>({date:text(r.date),value:number(r.value),weather:text(r.weather)}))
function monthlyHours(rows:SolarRow[]){
 const groups=new Map<string,SolarRow[]>();for(const row of rows){const month=/^\d{4}-\d{2}(?:-\d{2})?$/.test(row.date)?row.date.slice(0,7):row.date;groups.set(month,[...(groups.get(month)??[]),row])}
 return [...groups].map(([date,items])=>({date,value:items.every(r=>r.value!==null)?items.reduce((sum,r)=>sum+r.value!,0):null,weather:''})).sort((a,b)=>a.date.localeCompare(b.date))
}
export function readDashboardSupplement(payload:unknown){
 const raw=object(payload),data=object('dashboardSupplement' in raw?raw.dashboardSupplement:raw),solar=object(data.solar),weather=object(data.weather),fullHours=object(data.fullHours),pr=object(data.pr),plan=object(data.generationPlan)
 const full=(period:SolarPeriod)=>{const p=object(fullHours[period]);return {rows:period==='year'?monthlyHours(periodRows(p.rows)):periodRows(p.rows),total:number(p.total),ranking:list(p.ranking).map(r=>({deviceId:text(r.deviceId),name:text(r.name),value:number(r.value)}))}}
 const performance=(period:SolarPeriod)=>{const p=object(pr[period]);return {rows:periodRows(p.rows),value:number(p.value)}}
 const generation=(period:'year'|'total')=>{const p=object(plan[period]);return {rows:list(p.rows).filter(r=>text(r.date)).map(r=>({date:text(r.date),actualKwh:number(r.actualKwh),plannedKwh:number(r.plannedKwh),excellentKwh:targetNumber(r.excellentKwh),completionPercent:number(r.completionPercent)})),actualKwh:number(p.actualKwh),plannedKwh:number(p.plannedKwh),excellentKwh:targetNumber(p.excellentKwh),...(text(p.summaryYear)?{summaryYear:text(p.summaryYear)}:{})}}
 return {solar:{normalizationPercent:number(solar.normalizationPercent),powerKw:number(solar.powerKw),fullHoursDay:number(solar.fullHoursDay),capacityKw:number(solar.capacityKw),dailyKwh:number(solar.dailyKwh),totalKwh:number(solar.totalKwh)},weather:{location:text(weather.location),updatedAt:text(weather.updatedAt),temperatureC:number(weather.temperatureC),condition:text(weather.condition),sunrise:text(weather.sunrise),sunset:text(weather.sunset),daylightHours:number(weather.daylightHours),windSpeedMs:number(weather.windSpeedMs),forecast:list(weather.forecast).filter(r=>text(r.date)).slice(0,7).map(r=>({date:text(r.date),lowC:number(r.lowC),highC:number(r.highC),condition:text(r.condition)}))},fullHours:{week:full('week'),month:full('month'),year:full('year')},pr:{week:performance('week'),month:performance('month'),year:performance('year')},generationPlan:{year:generation('year'),total:generation('total')}}
}
export function solarRanking(rows:SolarRanking[],order:'first'|'last'){return rows.filter(r=>r.value!==null&&Number.isFinite(r.value)).slice().sort((a,b)=>order==='first'?b.value!-a.value!:a.value!-b.value!).slice(0,5)}
export function solarPercent(actual:N,planned:N):N{return actual===null||planned===null||planned<=0?null:actual/planned*100}

export function solarPlanView(plan:{rows:SolarPlanRow[];actualKwh:N;plannedKwh:N;excellentKwh?:N},mode:'base'|'advanced',rows:SolarPlanRow[]=plan.rows,useSummary=true){
 const target=mode==='advanced'?'excellentKwh':'plannedKwh'
 const sum=(key:'actualKwh'|'plannedKwh'|'excellentKwh'):N=>rows.length&&rows.every(r=>typeof r[key]==='number'&&Number.isFinite(r[key])&&r[key]!>=0)?rows.reduce((total,r)=>total+r[key]!,0):null
 const summary=(key:'actualKwh'|'plannedKwh'|'excellentKwh'):N=>useSummary&&typeof plan[key]==='number'&&Number.isFinite(plan[key])&&plan[key]!>=0?plan[key]!:sum(key)
 const actualKwh=summary('actualKwh'),targetKwh=summary(target)
 return {actualKwh,targetKwh,completionPercent:solarPercent(actualKwh,targetKwh),rows:rows.map(row=>{const targetKwh=targetNumber(row[target]);return {...row,targetKwh,completionPercent:solarPercent(row.actualKwh,targetKwh)}})}
}
export function solarWeatherCondition(condition:string|null|undefined):{label:string;icon:'sun'|'cloud'|'rain'|null}{
 const raw=condition?.trim()??'',code=raw.toLowerCase().replace(/[ _]/g,'-')
 const known:Record<string,{label:string;icon:'sun'|'cloud'|'rain'}>={clear:{label:'晴',icon:'sun'},sunny:{label:'晴',icon:'sun'},fair:{label:'晴',icon:'sun'},'晴':{label:'晴',icon:'sun'},cloudy:{label:'多云',icon:'cloud'},'partly-cloudy':{label:'局部多云',icon:'cloud'},'mostly-cloudy':{label:'大部多云',icon:'cloud'},overcast:{label:'阴',icon:'cloud'},'多云':{label:'多云',icon:'cloud'},'阴':{label:'阴',icon:'cloud'},rain:{label:'雨',icon:'rain'},rainy:{label:'雨',icon:'rain'},'light-rain':{label:'小雨',icon:'rain'},'heavy-rain':{label:'大雨',icon:'rain'},showers:{label:'阵雨',icon:'rain'},'雨':{label:'雨',icon:'rain'},'小雨':{label:'小雨',icon:'rain'},'大雨':{label:'大雨',icon:'rain'},'阵雨':{label:'阵雨',icon:'rain'}}
 return known[code]??{label:raw||'—',icon:null}
}
export function savedSolarPlanRows(plans:Array<{year:number;months:Array<{month:number;plannedKwh:string;excellentKwh:string|null}>}>,history?:{available:boolean;period:string;date:string;payload:unknown}){
 const amount=(value:string|null)=>typeof value==='string'&&value.trim()?targetNumber(Number(value)):null
 return plans.flatMap(plan=>{const matches=history?.available&&history.period==='year'&&history.date===String(plan.year),raw=matches?object(history.payload):{},actuals=list(raw.stationStatisticMonthDtoList);return plan.months.map(month=>{const actual=actuals.find(row=>Number(row.month)===month.month&&(row.year===undefined||Number(row.year)===plan.year)),wh=targetNumber(actual?.generationValue),actualKwh=wh===null?null:wh/1000,plannedKwh=amount(month.plannedKwh),excellentKwh=amount(month.excellentKwh);return {date:`${plan.year}-${String(month.month).padStart(2,'0')}`,actualKwh,plannedKwh,excellentKwh,completionPercent:solarPercent(actualKwh,plannedKwh)}})})
}
