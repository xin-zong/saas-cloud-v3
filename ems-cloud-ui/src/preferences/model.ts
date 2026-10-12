export type DisplayPreferences = {
  language: '简体中文' | 'English'; timezone: string; units: string;
  theme: '浅色' | '跟随系统'; density: '舒适' | '紧凑';
  chartAnimation: '开启' | '简化' | '关闭'; highContrast: boolean;
}
export const DEFAULT_PREFERENCES: DisplayPreferences = {
  language:'简体中文',timezone:'Asia/Shanghai',units:'公制 · kW / kWh',
  theme:'浅色',density:'舒适',chartAnimation:'开启',highContrast:false,
}
export function normalizePreferences(values: Record<string, unknown> = {}): DisplayPreferences {
  const next={...DEFAULT_PREFERENCES}
  for(const key of ['language','theme','density','chartAnimation','units'] as const) {
    const allowed={language:['简体中文','English'],theme:['浅色','跟随系统'],density:['舒适','紧凑'],chartAnimation:['开启','简化','关闭'],units:['公制 · kW / kWh','英制 · kW / kWh']}
    if(allowed[key].includes(String(values[key]))) Object.assign(next,{[key]:values[key]})
  }
  const zone=String(values.timezone??'').replace(/\s*\(.*\)\s*$/,'').replace(/\s*\/\s*/g,'/').trim()
  try{if(zone){new Intl.DateTimeFormat('en',{timeZone:zone});next.timezone=zone}}catch{/* Invalid saved values cannot break rendering. */}
  next.highContrast=values.highContrast===true||values.highContrast==='true'
  return next
}
