import {BASE_URL,getToken,getSessionVersion,setToken,refreshAfterForbidden,ApiError} from './client'
import type {HistoryPeriod} from '@/data/stationDashboardHistory'
export async function downloadStationHistory(station:string,request:{period:HistoryPeriod;date:string;scene:string;fields:string[]}){
 const token=getToken(),session=getSessionVersion(),params=new URLSearchParams({period:request.period,date:request.date,scene:request.scene,fields:request.fields.join(',')})
 const response=await fetch(`${BASE_URL}/stations/${encodeURIComponent(station)}/dashboard-history/workbook?${params}`,{headers:token?{Authorization:`Bearer ${token}`}:{}})
 if(getToken()!==token||getSessionVersion()!==session)throw new ApiError('会话已变化，请重新操作。',401)
 if(!response.ok){if(response.status===401){setToken(null);window.dispatchEvent(new Event('enerlution:unauthorized'))}if(response.status===403)await refreshAfterForbidden();let message=`历史导出失败 (${response.status})`;try{message=(await response.json()).msg||message}catch{}throw new ApiError(message,response.status)}
 if(!response.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new Error('服务器未返回XLSX文件')
 const blob=await response.blob();if(getToken()!==token||getSessionVersion()!==session)throw new ApiError('会话已变化，请重新操作。',401)
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`场站历史-${station}-${request.date.replace(':','~')}.xlsx`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
