import {api,BASE_URL,getToken,getSessionVersion,setToken,refreshAfterForbidden,ApiError} from './client'
export type RegularReportJob={id:string;category:'regular'|'production';name:string;type:'daily'|'monthly'|'yearly'|'total'|'production-day';templateId:string|null;templateName:string;createType:'M'|'A';stationIds:number[];from:string;to:string;language:string;status:'queued'|'running'|'completed'|'failed';progress:number;errorCode:string|null;errorMessage:string|null;createdAt:string;completedAt:string|null;columns:string[];rows:string[][];notes:string[];version:number}
export type ReportJobRequest={category:'regular'|'production';type:RegularReportJob['type'];templateId?:string;templateVersion?:number;name:string;scope:'all'|'specific';stationIds:number[];from:string;to:string;language:string;fields:string[]}
export type ReportJobFilters={template?:string;type?:string;from?:string;to?:string;createType?:string}
export type ReportJobCapabilities={currentMetadataFields:string[];languages:string[];productionAvailable:boolean}
export const reportJobCapabilities=()=>api<ReportJobCapabilities>('/regular-report-jobs/capabilities')
export const createRegularReportJob=(body:ReportJobRequest,signal?:AbortSignal)=>api<RegularReportJob>('/regular-report-jobs',{method:'POST',body:JSON.stringify(body),signal})
export function listRegularReportJobs(category:'regular'|'production',filters:ReportJobFilters,limit:number,offset:number,signal?:AbortSignal){const query=new URLSearchParams({category,limit:String(limit),offset:String(offset)});Object.entries(filters).forEach(([key,value])=>{if(value)query.set(key,value)});return api<{items:RegularReportJob[];total:number}>(`/regular-report-jobs?${query}`,{signal})}
export const queryRegularReportJob=(id:string,signal?:AbortSignal)=>api<RegularReportJob>(`/regular-report-jobs/${encodeURIComponent(id)}`,{signal})
export const deleteRegularReportJob=(job:RegularReportJob,signal?:AbortSignal)=>api<void>(`/regular-report-jobs/${encodeURIComponent(job.id)}?version=${job.version}`,{method:'DELETE',signal})
export async function downloadRegularReportJob(job:RegularReportJob,signal?:AbortSignal){
 const token=getToken(),session=getSessionVersion();const response=await fetch(`${BASE_URL}/regular-report-jobs/${encodeURIComponent(job.id)}/download`,{headers:token?{Authorization:`Bearer ${token}`}:{},signal})
 if(getToken()!==token||getSessionVersion()!==session)throw new ApiError('会话已变化，请重新操作。',401)
 if(!response.ok){if(response.status===401){setToken(null);window.dispatchEvent(new Event('enerlution:unauthorized'))}if(response.status===403)await refreshAfterForbidden();let message=`报告下载失败 (${response.status})`;try{message=(await response.json()).msg||message}catch{}throw new ApiError(message,response.status)}
 if(!response.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new Error('服务器未返回XLSX文件')
 const blob=await response.blob();if(signal?.aborted)throw new DOMException('下载已取消','AbortError');if(getToken()!==token||getSessionVersion()!==session)throw new ApiError('会话已变化，请重新操作。',401)
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=job.name.replace(/[\x00-\x1f\\/:*?"<>|]/g,'_')+'.xlsx';document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
