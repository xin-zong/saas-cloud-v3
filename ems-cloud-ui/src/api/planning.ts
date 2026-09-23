import type { ApiRow } from './client'
export type PlanPeriod = {id: string; start: string; end: string; mode: 'charge'|'discharge'|'standby'; power: number}
export function minuteOf(value: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)) throw new Error('时间必须为 HH:mm')
  return Number(value.slice(0,2))*60 + Number(value.slice(3))
}
export const minuteText = (value: unknown) => `${String(Math.floor(Number(value)/60)).padStart(2,'0')}:${String(Number(value)%60).padStart(2,'0')}`
export function planPeriods(rows: ApiRow[]): PlanPeriod[] {
  return rows.map(row => ({id:String(row.id), start:minuteText(row.start_minute), end:minuteText(row.end_minute), mode:row.mode as PlanPeriod['mode'], power:Number(row.power_kw)}))
}
export function validatePlan(periods: PlanPeriod[], ratedPower: number) {
  if (!periods.length) throw new Error('至少配置一个计划时段')
  let end = 0
  return [...periods].sort((a,b) => minuteOf(a.start)-minuteOf(b.start)).map(period => {
    const startMinute = minuteOf(period.start), endMinute = minuteOf(period.end)
    if (startMinute < end) throw new Error('计划时段不能重叠')
    if (endMinute <= startMinute) throw new Error('结束时间应晚于开始时间')
    if (!Number.isFinite(period.power) || period.power < 0 || period.power > ratedPower) throw new Error('计划功率应为非负数且不超过额定功率')
    end = endMinute
    return {startMinute,endMinute,mode:period.mode,powerKw:period.power}
  })
}
