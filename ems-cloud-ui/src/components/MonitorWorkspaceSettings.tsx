import {useState} from 'react'
import {metricDefinitions,solarColumns,storageColumns,type WorkspacePreference,type WorkspaceSettings} from '@/api/monitorWorkspace'
import {Modal} from './station-provision/Common'
import {Button} from './ui/Workspace'
import {useConfigurationLeaveGuard} from './useConfigurationLeaveGuard'
import type {RegisterLeaveGuard} from './useEditorLeaveGuard'

type Props={preference:WorkspacePreference;onSave:(p:WorkspacePreference)=>Promise<WorkspacePreference>;reload:()=>Promise<WorkspacePreference>;onClose:()=>void;registerLeaveGuard?:RegisterLeaveGuard}
export default function MonitorWorkspaceSettings({preference,onSave,reload,onClose,registerLeaveGuard}:Props){
 const [draft,setDraft]=useState<WorkspaceSettings>({...preference.settings}),[version,setVersion]=useState(preference.version),[watched,setWatched]=useState(preference.watchedStationIds),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const dirty=JSON.stringify(draft)!==JSON.stringify(preference.settings)
 const leave=useConfigurationLeaveGuard({dirty,busy,registerLeaveGuard,onClose,onDiscard:()=>setDraft({...preference.settings})})
 const selected=(kind:'solar'|'storage')=>draft[`${kind}Columns`]??(kind==='solar'?solarColumns:storageColumns)
 async function save(){setBusy(true);setError('');try{await onSave({settings:draft,watchedStationIds:watched,version});onClose()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <><Modal title="监控显示设置" onClose={()=>{void leave.close()}} actions={<><Button disabled={busy} onClick={()=>void leave.close()}>取消</Button><Button disabled={busy} onClick={()=>void(async()=>{setBusy(true);try{const p=await reload();setVersion(p.version);setWatched(p.watchedStationIds);setError('已刷新版本，显示草稿保留；请核对后保存')}catch(e){setError((e as Error).message)}finally{setBusy(false)}})()}>刷新版本，保留草稿</Button><Button variant="primary" disabled={busy} onClick={()=>void save()}>保存显示设置</Button></>}>
  <div className="monitor-settings"><label>默认数据来源<select aria-label="默认数据来源" value={draft.sourceMode??'capture'} onChange={e=>setDraft({...draft,sourceMode:e.target.value as 'capture'|'current'})}><option value="capture">已导入快照</option><option value="current">当前运行数据</option></select></label><label>自动刷新<select aria-label="保存自动刷新周期" value={draft.refreshMinutes??0} onChange={e=>setDraft({...draft,refreshMinutes:Number(e.target.value)})}>{[0,1,3,5,10,30].map(n=><option key={n} value={n}>{n?`${n}分钟`:'关闭'}</option>)}</select></label>
  {(['solar','storage'] as const).map(kind=><fieldset key={kind}><legend>{kind==='solar'?'光伏':'储能'}列表显示列</legend>{(kind==='solar'?solarColumns:storageColumns).map(key=><label key={key}><input type="checkbox" checked={selected(kind).includes(key)} onChange={e=>setDraft({...draft,[`${kind}Columns`]:e.target.checked?[...selected(kind),key]:selected(kind).filter(k=>k!==key)})}/>{metricDefinitions[key][0]}</label>)}</fieldset>)}<p>仅影响当前账户。快照保留采集时间；更改显示设置不会改变站点、设备或计量数据。</p>{error&&<p role="alert">{error}</p>}</div>
 </Modal>{leave.confirmation}</>
}
