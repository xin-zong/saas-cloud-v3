export const referenceStorageColumns=['storagePower','storageCapacity','storageActivePower','chargeStatus','storageSoc','storageSoh','storageDailyCharged','storageDailyDischarged','storageTotalCharged','storageTotalDischarged','storageEfficiency7','storageEfficiencyMonth','storageEfficiencyYear','storageUtilization7','storageUtilizationMonth','storageUtilizationYear']
export const referenceLabels:Record<string,string>={storagePower:'储能额定功率',storageCapacity:'储能额定容量',storageSoc:'整站SOC',pvCompletionMonthBasic:'计划发电量完成率（当月）（基础）',pvCompletionMonthSuperior:'计划发电量完成率（当月）（卓越）',pvCompletionYearBasic:'计划发电量完成率（当年）（基础）',pvCompletionYearSuperior:'计划发电量完成率（当年）（卓越）'}
export function siteColumns(saved:string[]|undefined,allowed:string[]){return saved===undefined?allowed:[...new Set(saved.filter(k=>allowed.includes(k)))]}
export function validCapacityRange(min:string,max:string){return (!min||(Number.isFinite(Number(min))&&Number(min)>=0))&&(!max||(Number.isFinite(Number(max))&&Number(max)>=0))&&(!min||!max||Number(min)<=Number(max))}
export function siteMetricText(row:{metrics:Record<string,number|null>;telemetryAllowed:boolean},key:string,unit:string){if(!row.telemetryAllowed&&!['pvCapacity','storagePower','storageCapacity'].includes(key))return '无查看权限';const value=row.metrics[key];return typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:2})+unit:'--'}
export function siteTimestamp(value:string|null,timezone:string|null){
 if(!value||!Number.isFinite(Date.parse(value)))return '未提供采样时间'
 const options:Intl.DateTimeFormatOptions={timeZone:timezone||'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}
 let format:Intl.DateTimeFormat;try{format=new Intl.DateTimeFormat('en-GB',options)}catch{format=new Intl.DateTimeFormat('en-GB',{...options,timeZone:'UTC'})}
 const parts=Object.fromEntries(format.formatToParts(new Date(value)).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName==='GMT'?'UTC+00:00':parts.timeZoneName.replace('GMT','UTC')}`
}
