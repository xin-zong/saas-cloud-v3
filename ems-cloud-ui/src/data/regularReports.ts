/** Compute one consistent page for slicing, pagination labels, and navigation after mutations. */
export function reportTaskPage<T>(rows:T[],requested:number,size:number){
 const pageSize=Number.isFinite(size)&&size>0?Math.max(1,Math.trunc(size)):50
 const last=Math.max(0,Math.ceil(rows.length/pageSize)-1)
 const page=Math.min(last,Number.isFinite(requested)?Math.max(0,Math.trunc(requested)):0)
 return {page,items:rows.slice(page*pageSize,(page+1)*pageSize)}
}

const deviceFields=['Device SN','Device Name','Device Type','Logger SN','Actual Connected String Capacity','Ratio','Meter Location','Meter Data Classification','Meter Magnification (current ratio)']
const deviceData=(field:string)=>/^(Inverter |Meter |Module |Microinverter )/.test(field)&&!deviceFields.includes(field)
/** Normalize an editable copy; restore required parents without mutating saved fields. */
export function manualReportFieldSelection(allowed:string[],selected:string[]):string[]{
 const fields=new Set(selected.filter(field=>allowed.includes(field)))
 if(allowed.includes('Site Name'))fields.add('Site Name')
 if(allowed.includes('Device Info')&&allowed.includes('Device SN')&&(fields.has('Device Info')||[...fields].some(field=>deviceFields.includes(field)||deviceData(field)))){fields.add('Device Info');fields.add('Device SN')}
 else {fields.delete('Device Info');for(const field of fields)if(deviceFields.includes(field)||deviceData(field))fields.delete(field)}
 return allowed.filter(field=>fields.has(field))
}
export function toggleManualReportField(allowed:string[],selected:string[],field:string,checked:boolean):string[]{
 if(!allowed.includes(field))throw new Error('当前模板字段目录不支持此参数')
 let fields=checked?[...selected,field]:selected.filter(value=>value!==field)
 if(field==='Device Info'&&!checked)fields=fields.filter(value=>!deviceFields.includes(value)&&!deviceData(value))
 return manualReportFieldSelection(allowed,fields)
}


export function productionReportDates(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]))
 const today=new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`)
 return {min:new Date(today.getTime()-29*86400000).toISOString().slice(0,10),max:new Date(today.getTime()-86400000).toISOString().slice(0,10)}
}
export const REPORT_LANGUAGE_CODES:Record<string,string>={'简体中文':'zh',English:'en','繁體中文':'tc','Português':'pt','Español':'es','Français':'fr','Deutsch':'de','Italiano':'it'}
export const REPORT_JOB_STATUS:Record<string,string>={queued:'等待处理',running:'正在生成',completed:'已生成',failed:'生成失败'}
