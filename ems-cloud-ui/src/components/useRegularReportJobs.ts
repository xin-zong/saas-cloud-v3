import {useEffect,useRef,useState} from 'react'
import {createRegularReportJob,listRegularReportJobs,queryRegularReportJob,deleteRegularReportJob,downloadRegularReportJob,type RegularReportJob,type ReportJobRequest,type ReportJobFilters} from '@/api/regularReportJobs'
export function useRegularReportJobs(category:'regular'|'production',filters:ReportJobFilters){
 const [records,setRecords]=useState<RegularReportJob[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(0),[size,setSize]=useState(50),[version,setVersion]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[active,setActive]=useState<RegularReportJob|null>(null)
 const alive=useRef(true),action=useRef<AbortController|null>(null),filterKey=JSON.stringify(filters)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;action.current?.abort()}},[])
 useEffect(()=>{setPage(0)},[filterKey,category])
 useEffect(()=>{const request=new AbortController();setLoading(true);setError('');void listRegularReportJobs(category,filters,size,page*size,request.signal).then(result=>{if(request.signal.aborted)return;setTotal(result.total);if(page>0&&page*size>=result.total){setPage(Math.max(0,Math.ceil(result.total/size)-1));return}setRecords(result.items)}).catch(cause=>{if(!request.signal.aborted){setRecords([]);setError(cause instanceof Error?cause.message:'报告记录读取失败')}}).finally(()=>{if(!request.signal.aborted)setLoading(false)});return()=>request.abort()},[category,filterKey,page,size,version])
 const refresh=()=>setVersion(v=>v+1)
 useEffect(()=>{if(!records.some(row=>row.status==='queued'||row.status==='running')&&!active?.status.match(/^(queued|running)$/))return;const request=new AbortController();let pending=false;const timer=window.setInterval(()=>{refresh();if(active&&!pending){pending=true;void queryRegularReportJob(active.id,request.signal).then(row=>{if(alive.current&&!request.signal.aborted)setActive(current=>current?.id===row.id?row:current)}).catch(cause=>{if(!request.signal.aborted){window.clearInterval(timer);setError(cause instanceof Error?cause.message:'报告状态读取失败')}}).finally(()=>{pending=false})}},3000);return()=>{request.abort();window.clearInterval(timer)}},[records,active?.id,active?.status])
 async function run<T,>(operation:(signal:AbortSignal)=>Promise<T>):Promise<T|undefined>{if(action.current)return;const request=new AbortController();action.current=request;setBusy(true);setError('');try{const result=await operation(request.signal);if(request.signal.aborted)return;refresh();return result}catch(cause){if(!request.signal.aborted)setError(cause instanceof Error?cause.message:'报告操作失败')}finally{if(action.current===request){action.current=null;if(alive.current)setBusy(false)}}}
 return {records,total,page,size,setPage,setSize,loading,busy,error,active,setActive,refresh,
  create:async(request:ReportJobRequest)=>{const job=await run(signal=>createRegularReportJob(request,signal));if(job&&alive.current){setPage(0);setActive(job)}return job},
  query:async(job:RegularReportJob)=>{const result=await run(signal=>queryRegularReportJob(job.id,signal));if(result&&alive.current)setActive(result)},
  download:(job:RegularReportJob)=>run(signal=>downloadRegularReportJob(job,signal)),
  remove:async(job:RegularReportJob)=>{const result=await run(async signal=>{await deleteRegularReportJob(job,signal);return true});if(result&&alive.current&&active?.id===job.id)setActive(null);return result},
 }
}
