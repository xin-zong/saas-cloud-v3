import {BASE_URL,getToken,getSessionVersion,setToken,refreshAfterForbidden,ApiError} from './client'
import {historyExportDates} from '@/data/referenceHistoryExport'
export type DeviceHistoryExportRequest={date:string;days:1|5;timezone:string;scope:'selected'|'all';pointIds:number[]}
export async function downloadDeviceHistory(station:string,device:string,request:DeviceHistoryExportRequest){
 const range=historyExportDates(request.date,request.days),token=getToken(),session=getSessionVersion()
 const response=await fetch(`${BASE_URL}/stations/${encodeURIComponent(station)}/devices/${encodeURIComponent(device)}/history-export`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(request)})
 if(getToken()!==token||getSessionVersion()!==session)throw new ApiError('会话已变化，请重新操作。',401)
 if(!response.ok){if(response.status===401){setToken(null);window.dispatchEvent(new Event('enerlution:unauthorized'))}if(response.status===403)await refreshAfterForbidden();let message=`历史导出失败 (${response.status})`;try{message=(await response.json()).msg||message}catch{}throw new ApiError(message,response.status)}
 if(!response.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new Error('服务器未返回XLSX文件')
 const blob=await response.blob();if(getToken()!==token||getSessionVersion()!==session)throw new ApiError('会话已变化，请重新操作。',401)
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`设备历史-${device}-${range.start}~${range.end}.xlsx`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
