import {useCallback,useEffect,useRef,useState} from 'react'
import {Radio,RefreshCw,Star} from 'lucide-react'
import type {Station} from '@/App'
import {loadStationTags} from '@/api/stationTags'
import {useMonitorPreferences} from './useMonitorWorkspace'
import StationTagsPanel from './StationTagsPanel'
import type {RegisterLeaveGuard} from './useEditorLeaveGuard'
import {useStationQuery} from './reference-station/shared'
import './reference-station-header.css'

type Props={station:Station;identity:string;editable:boolean;onRefresh:()=>void;onAutoRefresh:()=>void;beforeOpen:(action:()=>void)=>void;registerLeaveGuard:RegisterLeaveGuard}
/** Header controls observed in audit-site-info.png; tag assignment uses the existing local editor. */
export default function ReferenceStationHeader({station,identity,editable,onRefresh,onAutoRefresh,beforeOpen,registerLeaveGuard}:Props){
 const preference=useMonitorPreferences(identity)
 const [editing,setEditing]=useState(false),[tagRevision,setTagRevision]=useState(0)
 const registerTags=useCallback<RegisterLeaveGuard>(guard=>registerLeaveGuard(guard?async()=>{const allowed=await guard();if(allowed){setEditing(false);setTagRevision(v=>v+1)}return allowed}:null),[registerLeaveGuard])
 const tags=useStationQuery(`header-tags:${station.id}:${tagRevision}`,()=>loadStationTags(station.id))
 const refresh=useRef(onAutoRefresh);refresh.current=onAutoRefresh
 const minutes=preference.preference.settings.refreshMinutes??0
 const unavailable=preference.loading||preference.busy||!!preference.error
 const watched=preference.preference.watchedStationIds.includes(station.id)
 useEffect(()=>{if(!minutes||unavailable||editing)return;const timer=window.setInterval(()=>refresh.current(),minutes*60000);return()=>window.clearInterval(timer)},[minutes,unavailable,editing])
 const closeTags=()=>{setEditing(false);setTagRevision(v=>v+1)}
 return <><header className="rs-header rs-station-header"><strong>{station.name}</strong><Radio size={16} className="rs-muted"/><div className="rs-header-tags">{tags.data?.map(tag=><span className="rs-tag" key={tag.id}>{tag.name}</span>)}{editable&&<button disabled={tags.loading||!!tags.error} className="rs-tag-edit" onClick={()=>beforeOpen(()=>setEditing(true))}>编辑所属标签</button>}</div><div className="rs-header-actions"><button aria-label={watched?'取消关注场站':'关注场站'} aria-pressed={watched} disabled={unavailable} onClick={()=>void preference.save({...preference.preference,watchedStationIds:watched?preference.preference.watchedStationIds.filter(id=>id!==station.id):[...preference.preference.watchedStationIds,station.id]}).catch(()=>{})}><Star size={17} fill={watched?'currentColor':'none'}/></button><div className="rs-refresh-controls"><button aria-label="刷新场站" onClick={onRefresh}><RefreshCw size={15}/></button><select aria-label="自动刷新场站详情" disabled={unavailable} value={minutes} onChange={e=>void preference.save({...preference.preference,settings:{...preference.preference.settings,refreshMinutes:Number(e.target.value)}}).catch(()=>{})}>{[0,1,3,5,10,30].map(value=><option key={value} value={value}>{value?`${value}分钟`:'关闭'}</option>)}</select></div></div></header>{preference.error&&<p role="alert" className="rs-error">{preference.error}<button onClick={()=>void preference.reload().catch(()=>{})}>重新读取偏好</button></p>}{tags.error&&<p role="alert" className="rs-error">标签读取失败：{tags.error}<button onClick={()=>setTagRevision(v=>v+1)}>重试</button></p>}{editing&&<StationTagsPanel station={station} canEdit={editable} onClose={closeTags} registerLeaveGuard={registerTags}/>}</>
}
