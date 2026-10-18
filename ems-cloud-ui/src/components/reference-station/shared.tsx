import {useEffect,useState} from 'react'
import {ClipboardList} from 'lucide-react'
export function useStationQuery<T>(key:string,load:(signal:AbortSignal)=>Promise<T>){
 const [state,setState]=useState<{key:string;data?:T;error:string;loading:boolean}>({key,error:'',loading:true})
 useEffect(()=>{const c=new AbortController();setState({key,error:'',loading:true});load(c.signal).then(data=>{if(!c.signal.aborted)setState({key,data,error:'',loading:false})}).catch(e=>{if(!c.signal.aborted)setState({key,error:e.message,loading:false})});return()=>c.abort()},[key])
 return state.key===key?state:{key,error:'',loading:true}
}
export function Empty({text='暂无数据'}:{text?:string}){return <div className="rs-empty"><ClipboardList size={58} strokeWidth={1}/><span>{text}</span></div>}
export function QueryState({loading,error}:{loading:boolean;error:string}){return loading?<Empty text="加载中…"/>:error?<p className="rs-error" role="alert">{error}</p>:null}
export const display=(v:unknown)=>v===null||v===undefined||v===''?'—':typeof v==='object'?JSON.stringify(v):String(v)
export const base=(id:string)=>`/stations/${encodeURIComponent(id)}`
