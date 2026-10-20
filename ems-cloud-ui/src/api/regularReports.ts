import {api,send} from './client'
export type RegularReportType='daily'|'monthly'|'yearly'|'total'
export type ReportTemplateDraft={name:string;type:RegularReportType;fields:string[];version?:number}
export type ReportTaskDraft={name:string;type:'daily'|'monthly';templateId:string;templateVersion:number;scope:'all'|'specific';stationIds:number[];range:number;frequency:number;time:string;version?:number}
export type RegularConfig<T>={id:string;category:'template'|'task';name:string;type:RegularReportType;payload:T;version:number}
export const REGULAR_REPORT_TYPES:Record<RegularReportType,string>={daily:'日级数据报表',monthly:'月级数据报表',yearly:'年级数据报表',total:'累计数据报表'}
export const reportConfigFields=()=>api<Record<RegularReportType,string[]>>('/regular-reports/fields')
export const reportConfigList=<T,>(category:'template'|'task')=>api<RegularConfig<T>[]>(`/regular-reports/${category}`)
export const reportConfigSave=<T,>(category:'template'|'task',draft:T,id?:string)=>send<RegularConfig<T>>(`/regular-reports/${category}${id?`/${encodeURIComponent(id)}`:''}`,id?'PUT':'POST',draft)
export const reportConfigDelete=(row:RegularConfig<unknown>)=>send<void>(`/regular-reports/${row.category}/${encodeURIComponent(row.id)}?version=${row.version}`,'DELETE')
