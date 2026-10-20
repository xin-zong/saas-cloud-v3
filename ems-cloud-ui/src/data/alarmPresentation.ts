import {parseDateTimeInput} from "@/preferences/date"
import {getPreferences} from "@/preferences/store"
export function alarmColumns(source: string, view: string = "live") {
  return [
    "报警名称",
    ...(view === "live" ? ["等级"] : []),
    ...(source === "rule" ? ["触发指标"] : []),
    view === "history" ? "报警状态" : "状态",
    ...(view === "history" ? ["等级"] : []),
    "报警对象",
    "所属场站",
    "报警开始时间",
    "恢复时间",
    ...(view === "live" ? ["持续时长"] : []),
    "操作",
  ]
}
export function alarmExportValues(
  row: {title: string; trigger_indicator?: string | null; object_type?: string | null; device_name?: string | null; station_name: string; occurred_at: string; effective_recovered_at?: string | null; closed_at?: string | null},
  source: string, view: string, severityLabel: string, lifecycleLabel: string,
) {
  return [row.title,
    ...(view === "live" ? [severityLabel] : []),
    ...(source === "rule" ? [row.trigger_indicator || ""] : []),
    lifecycleLabel,
    ...(view === "history" ? [severityLabel] : []),
    row.object_type === "STATION" ? "场站" : row.device_name,
    row.station_name, row.occurred_at, row.effective_recovered_at ?? "",
    ...(view === "live" ? [alarmDuration(row)] : []),
  ]
}
export function alarmDuration(
  row: {
    occurred_at: string
    effective_recovered_at?: string | null
    closed_at?: string | null
  },
  now = new Date(),
) {
  const from = new Date(row.occurred_at).getTime()
  const until = new Date(
    row.effective_recovered_at || row.closed_at || now,
  ).getTime()
  if (!Number.isFinite(from) || !Number.isFinite(until) || until < from)
    return "—"
  const minutes = Math.floor((until - from) / 60000)
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`
    : `${minutes}分钟`
}
export function alarmMonthRange(month: string, timezone = getPreferences().timezone) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("请选择有效月份")
  const next = new Date(`${month}-01T00:00:00Z`)
  next.setUTCMonth(next.getUTCMonth()+1)
  return {start:parseDateTimeInput(`${month}-01`,timezone).toISOString(),end:parseDateTimeInput(next.toISOString().slice(0,10),timezone).toISOString()}
}
export function alarmTimeRange(
  month: string | undefined,
  start: string,
  end: string,
  timezone = getPreferences().timezone,
  granularity: "DAY"|"MONTH" = "DAY",
) {
  const bounds = month ? granularity === "MONTH" ? alarmYearRange(month,timezone) : alarmMonthRange(month, timezone) : undefined
  const from = start
    ? parseDateTimeInput(start,timezone).getTime()
    : bounds
      ? Date.parse(bounds.start)
      : undefined
  const until = end
    ? parseDateTimeInput(end,timezone).getTime()
    : bounds
      ? Date.parse(bounds.end)
      : undefined
  const lower =
    from === undefined
      ? undefined
      : bounds
        ? Math.max(from, Date.parse(bounds.start))
        : from
  const upper =
    until === undefined
      ? undefined
      : bounds
        ? Math.min(until, Date.parse(bounds.end))
        : until
  if (
    (lower !== undefined && !Number.isFinite(lower)) ||
    (upper !== undefined && !Number.isFinite(upper)) ||
    (lower !== undefined && upper !== undefined && lower >= upper)
  )
    throw new Error("筛选时间须与当前月份相交且结束晚于开始")
  return {
    start: lower === undefined ? undefined : new Date(lower).toISOString(),
    end: upper === undefined ? undefined : new Date(upper).toISOString(),
  }
}
export function alarmYearRange(year: string, timezone=getPreferences().timezone) {
 if(!/^\d{4}$/.test(year)||Number(year)<1||Number(year)>9998)throw new Error('请选择有效年份')
 return {start:parseDateTimeInput(`${year}-01-01`,timezone).toISOString(),end:parseDateTimeInput(`${String(Number(year)+1).padStart(4,'0')}-01-01`,timezone).toISOString()}
}
export function alarmRealtimeExportRange(now=new Date(),timezone=getPreferences().timezone) {
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]))
 const end=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`),start=new Date(end);start.setUTCDate(start.getUTCDate()-29);end.setUTCDate(end.getUTCDate()+1)
 return {start:parseDateTimeInput(start.toISOString().slice(0,10),timezone).toISOString(),end:parseDateTimeInput(end.toISOString().slice(0,10),timezone).toISOString()}
}
export function alarmTrendData(summary:{day:string;severity:string;count:number}[],period:string,granularity:'DAY'|'MONTH',severity='') {
 const length=granularity==='MONTH'?12:new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5)),0)).getUTCDate()
 return Array.from({length},(_,i)=>{const key=`${period}-${String(i+1).padStart(2,'0')}`;return {period:key,day:i+1,count:summary.filter(row=>row.day===key&&(!severity||row.severity===severity)).reduce((count,row)=>count+Number(row.count),0)}})
}
export function alarmCsv(headers:string[],rows:unknown[][]) {
 const escape=(value:unknown)=>'"'+String(value??'').replace(/^[=+@\-\t\r\n]/,"'$&").replace(/"/g,'""')+'"'
 return '\ufeff'+[headers,...rows].map(row=>row.map(escape).join(',')).join('\r\n')
}

export function alarmNameDistribution(summary: {name:string;severity:string;count:number}[], severity='') {
 const groups=new Map<string,number>()
 for(const row of summary) if(!severity||row.severity===severity) groups.set(row.name,(groups.get(row.name)??0)+Number(row.count))
 const total=[...groups.values()].reduce((sum,count)=>sum+count,0)
 return [...groups].map(([name,count])=>({name,count,percent:total?Math.round(count/total*10000)/100:0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))
}
