export type TariffPeriod = {
  start: string
  end: string
  band: 'peak' | 'flat' | 'valley' | 'superPeak'
  price: string
}
export type TariffTemplate = {
  id: string
  name: string
  mode: 'fixed' | 'tou' | 'dynamic'
  currency: string
  buy: TariffPeriod[]
  sell: TariffPeriod[]
  source: {
    name: string
    url: string
    method: string
    auth: string
    frequency: string
    timeField: string
    buyField: string
    sellField: string
    unit: string
    timezone: string
    fallback: boolean
  }
}
export type TariffWorkspace = {
  templates: TariffTemplate[]
  assignments: Record<string, string>
}
export const bands = { valley: '谷', flat: '平', peak: '峰', superPeak: '尖峰' }
export const modeNames = { fixed: '固定', tou: '分时', dynamic: '动态' }
export function minute(value: string) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(value)
    ? Number(value.slice(0,2)) * 60 + Number(value.slice(3)) : NaN
}
export function validatePeriods(periods: TariffPeriod[]) {
  if (!periods.length) return '请至少添加一个电价时段'
  let end = 0
  for (const row of periods) {
    const start = minute(row.start), next = minute(row.end)
    if (!Number.isFinite(start) || !Number.isFinite(next) || next <= start) return '请填写有效的开始和结束时间'
    if (start !== end) return '时段必须首尾衔接，不得重叠或留空'
    if (!row.price.trim() || !Number.isFinite(Number(row.price))) return '请填写有效电价（支持负电价）'
    if (!(row.band in bands)) return '请选择时段类型'
    end = next
  }
  return end === 1440 ? '' : '时段必须覆盖全天 00:00—24:00'
}
export function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`
}
export function calendarDays(year: number, month: number) {
  const first = new Date(year,month,1)
  const start = new Date(year,month,1-(first.getDay()+6)%7)
  const count = Math.ceil(((first.getDay()+6)%7+new Date(year,month+1,0).getDate())/7)*7
  return Array.from({length:count},(_,i)=> {
    const value = new Date(start.getFullYear(),start.getMonth(),start.getDate()+i)
    return {date:dateKey(value),day:value.getDate(),current:value.getMonth()===month}
  })
}
export function newTemplate(): TariffTemplate {
  const period: TariffPeriod = {start:'00:00',end:'24:00',band:'flat',price:''}
  return {
    id:crypto.randomUUID(),name:'',mode:'fixed',currency:'CNY',buy:[{...period}],sell:[{...period}],
    source:{name:'',url:'',method:'GET',auth:'Bearer Token',frequency:'15',timeField:'timestamp',buyField:'buy_price',sellField:'sell_price',unit:'元 / kWh',timezone:'Asia/Shanghai',fallback:true},
  }
}
export function validateTemplate(template: TariffTemplate) {
  if (!template.name.trim()) return '请填写模板名称'
  if (template.mode === 'dynamic') {
    try {
      const url = new URL(template.source.url)
      if (!['https:','http:'].includes(url.protocol) || url.username || url.password) return '请填写不含账号密码的 HTTP(S) 请求地址'
    } catch { return '请填写有效请求地址' }
    return template.source.timeField.trim() && template.source.buyField.trim() && template.source.sellField.trim() ? '' : '请填写时间、购电及售电字段映射'
  }
  const buyProblem = validatePeriods(template.buy)
  if (buyProblem) return buyProblem
  // Independent selling tariffs are not supported by the current API.
  // An unknown selling price remains an explicit unfinished local rule.
  return template.sell.every(row=>!row.price.trim()) ? '' : validatePeriods(template.sell)
}
