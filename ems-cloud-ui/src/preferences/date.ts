import { getPreferences } from './store'
type DateValue=Date|string|number
function parts(value:DateValue,zone=getPreferences().timezone){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return null
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]))
}
export function dateKey(value:DateValue){const p=parts(value);return p?`${p.year}-${p.month}-${p.day}`:''}
export function dateTimeInput(value:DateValue){const p=parts(value);return p?`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`:''}
/** Interpret a wall-clock input in the user's IANA timezone, never the browser timezone. */
export function parseDateTimeInput(value:string,zone=getPreferences().timezone):Date {
  if(/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value))return new Date(value)
  if(!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value))return new Date(NaN)
  const wall=value.length===10?value+'T00:00:00':value.length===16?value+':00':value
  const nominal=Date.parse(wall+'Z');if(!Number.isFinite(nominal))return new Date(NaN)
  let instant=nominal
  for(let i=0;i<4;i++){
    const p=parts(instant,zone);if(!p)return new Date(NaN)
    const shown=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`)
    const delta=nominal-shown;if(!delta)break;instant+=delta
  }
  const p=parts(instant,zone)
  return p&&`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`===wall?new Date(instant):new Date(NaN)
}
/** Calendar arithmetic is performed separately from timezone conversion. */
export function calendarBounds(value:string,range:string){
  const start=new Date(value+'T00:00:00Z')
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==value)return {start:new Date(NaN),end:new Date(NaN)}
  if(range==='W')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7)
  if(range==='M')start.setUTCDate(1)
  if(range==='Y'||range==='A')start.setUTCMonth(0,1)
  const end=new Date(start)
  if(range==='W')end.setUTCDate(end.getUTCDate()+7)
  else if(range==='M')end.setUTCMonth(end.getUTCMonth()+1,1)
  else if(range==='Y'||range==='A')end.setUTCFullYear(end.getUTCFullYear()+1,0,1)
  else end.setUTCDate(end.getUTCDate()+1)
  return {start:parseDateTimeInput(start.toISOString().slice(0,10)),end:new Date(parseDateTimeInput(end.toISOString().slice(0,10)).getTime()-1)}
}
export function nextCalendarBucket(timestamp:number,range:string){
  if(range==='D')return timestamp+3600000
  const date=new Date(dateKey(timestamp)+'T00:00:00Z')
  if(range==='Y'||range==='A')date.setUTCMonth(date.getUTCMonth()+1,1)
  else date.setUTCDate(date.getUTCDate()+1)
  return parseDateTimeInput(date.toISOString().slice(0,10)).getTime()
}
export function formatDate(value:DateValue,options:Intl.DateTimeFormatOptions={}){
  if(!Number.isFinite(new Date(value).getTime()))return '—'
  return new Intl.DateTimeFormat(getPreferences().language==='English'?'en-GB':'zh-CN',{...options,timeZone:getPreferences().timezone}).format(new Date(value))
}
/** Adapter for existing Date/Number locale calls; API ISO timestamps stay untouched. */
export function localized(value:Date|number,method:'toLocaleString'|'toLocaleTimeString'|'toLocaleDateString',locale?:Intl.LocalesArgument,options?:Intl.DateTimeFormatOptions&Intl.NumberFormatOptions):string {
  const preferences=getPreferences()
  if(value instanceof Date){
    if(method==='toLocaleDateString'&&locale==='en-CA'&&!options?.month)return dateKey(value)
    const explicit=options&&['year','month','day','weekday','hour','minute','second','dateStyle','timeStyle'].some(key=>options[key as keyof typeof options]!==undefined)
    const defaults=explicit?{}:method==='toLocaleTimeString'?{hour:'2-digit',minute:'2-digit',second:'2-digit'}:method==='toLocaleDateString'?{year:'numeric',month:'2-digit',day:'2-digit'}:{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}
    return formatDate(value,{...defaults,...options,hour12:options?.hour12??false} as Intl.DateTimeFormatOptions)
  }
  return value.toLocaleString(preferences.language==='English'?'en-GB':'zh-CN',options)
}
