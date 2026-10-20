import {parseDateTimeInput} from '@/preferences/date'
import {context} from './context.js'
export function wallClock(value,zone=context.timezone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]))
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}
export function wallClockToIso(value,zone=context.timezone){if(!value)return null;const date=parseDateTimeInput(value,zone);return Number.isFinite(date.getTime())?date.toISOString():null}
export function presetTimeRange(preset,now=new Date(),zone=context.timezone){
 if(preset==='clear')return{start:'',end:''}
 const end=wallClock(now,zone),calendar=new Date(end+':00Z')
 if(preset==='today')calendar.setUTCHours(0,0,0,0)
 else if(preset==='last7')calendar.setUTCDate(calendar.getUTCDate()-7)
 else if(preset==='last30')calendar.setUTCDate(calendar.getUTCDate()-30)
 else return null
 return{start:calendar.toISOString().slice(0,16),end}
}
export function formatAgentDate(value,options={}){return new Intl.DateTimeFormat(context.language.startsWith('zh')?'zh-CN':'en-GB',{...options,timeZone:context.timezone}).format(new Date(value))}
