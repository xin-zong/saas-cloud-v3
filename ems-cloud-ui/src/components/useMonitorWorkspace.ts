import {useCallback,useEffect,useRef,useState} from 'react'
import {loadWorkspace,loadWorkspacePreferences,saveWorkspacePreferences,type WorkspaceData,type WorkspacePreference,type WorkspaceQuery} from '@/api/monitorWorkspace'

export function useMonitorPreferences(userKey:string){
 const [preference,setPreference]=useState<WorkspacePreference>({settings:{},watchedStationIds:[],version:0}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const generation=useRef(0),saving=useRef(false),current=useRef(preference);current.current=preference
 useEffect(()=>{const controller=new AbortController();generation.current++;setLoading(true);setPreference({settings:{},watchedStationIds:[],version:0});setError('');loadWorkspacePreferences(controller.signal).then(value=>{if(!value||typeof value.version!=='number'||!value.settings||!Array.isArray(value.watchedStationIds))throw new Error('监控偏好服务未返回有效配置');if(!controller.signal.aborted)setPreference(value)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>{generation.current++;controller.abort()}},[userKey])
 const reload=useCallback(async()=>{const epoch=generation.current;try{const value=await loadWorkspacePreferences();if(epoch===generation.current){setPreference(value);setError('')}return value}catch(e){if(epoch===generation.current)setError((e as Error).message);throw e}},[])
 const save=useCallback(async(value:WorkspacePreference)=>{if(saving.current)throw new Error('配置正在保存，请等待完成');const epoch=generation.current;saving.current=true;setBusy(true);setError('');try{const result=await saveWorkspacePreferences(value);if(epoch!==generation.current)throw new Error('页面已变化，请重新读取配置');setPreference(result);return result}catch(e){if(epoch===generation.current)setError((e as Error).message);throw e}finally{saving.current=false;if(epoch===generation.current)setBusy(false)}},[])
 return {preference,loading,busy,error,save,reload}
}
export function useMonitorWorkspace(userKey:string,query:WorkspaceQuery,enabled:boolean,refreshMinutes:number){
 const [data,setData]=useState<WorkspaceData|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const key=JSON.stringify(query)
 useEffect(()=>{if(!enabled)return;const controller=new AbortController();setData(null);setBusy(true);setError('');loadWorkspace(JSON.parse(key),controller.signal).then(value=>{if(!value||!Array.isArray(value.items)||!value.summary||!value.rules)throw new Error('监控服务未返回有效数据');if(!controller.signal.aborted)setData(value)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setBusy(false)});return()=>controller.abort()},[userKey,key,enabled,revision])
 useEffect(()=>{if(!enabled||!refreshMinutes)return;const timer=window.setInterval(()=>setRevision(n=>n+1),refreshMinutes*60000);return()=>window.clearInterval(timer)},[enabled,refreshMinutes])
 return {data,busy,error,refresh:()=>setRevision(n=>n+1)}
}
