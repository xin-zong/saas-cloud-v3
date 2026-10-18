import {useEffect,useState} from 'react'
import {getLifecycleDevice,getLifecycleOptions,saveLifecycleDevice,type LifecycleDevice,type LifecycleOptions} from '@/api/referenceLifecycle'
import {validateDeviceDraft,type DeviceDraft} from '@/data/referenceLifecycle'
import {DEVICE_CATEGORIES,type ReferenceDeviceCategory} from '@/data/referenceDevices'
import {LifecycleField,ReferenceLifecycleShell,lifecycleError} from './ReferenceLifecycleShell'
export interface ReferenceDeviceEditorProps{deviceId?:string;stationId?:string;category?:ReferenceDeviceCategory;onClose:()=>void;onSaved:(device:LifecycleDevice)=>void}
export default function ReferenceDeviceEditor({deviceId,stationId,category='inverter',onClose,onSaved}:ReferenceDeviceEditorProps){
 const [draft,setDraft]=useState<DeviceDraft>({name:'',serial:'',stationId:stationId??'',type:category}),[version,setVersion]=useState<number>(),[options,setOptions]=useState<LifecycleOptions>(),[loading,setLoading]=useState(true),[error,setError]=useState(''),[errors,setErrors]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[retry,setRetry]=useState(0)
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');Promise.all([getLifecycleOptions(abort.signal),deviceId?getLifecycleDevice(deviceId,abort.signal):Promise.resolve(null)]).then(([choices,row])=>{setOptions(choices);if(row){setDraft(row);setVersion(row.version)}setDirty(false)}).catch(e=>{if(!abort.signal.aborted)setError(lifecycleError(e))}).finally(()=>{if(!abort.signal.aborted)setLoading(false)});return()=>abort.abort()},[deviceId,retry])
 const change=(key:keyof DeviceDraft,value:string)=>{setDraft(d=>({...d,[key]:value}));setDirty(true)}
 const save=async()=>{const next=validateDeviceDraft(draft);setErrors(next);if(Object.keys(next).length)return;setBusy(true);setError('');let saved:LifecycleDevice;try{saved=await saveLifecycleDevice(draft,deviceId,version)}catch(e){setError(lifecycleError(e));setBusy(false);return}setBusy(false);setDirty(false);onSaved(saved)}
 return <ReferenceLifecycleShell title={deviceId?'编辑设备':'添加设备'} onClose={onClose} onSubmit={save} dirty={dirty} busy={busy} disabled={loading||!options||!!deviceId&&version===undefined}>
 {error&&<div className="ref-lifecycle-error" role="alert">{error}{options&&<button type="button" disabled={busy} onClick={save}>重试</button>}{!options&&<button type="button" onClick={()=>setRetry(n=>n+1)}>重新加载</button>}</div>}
 {loading?<div className="ref-lifecycle-loading">加载设备信息…</div>:<><LifecycleField label="设备类型" required error={errors.type}><select aria-label="设备类型" disabled={busy} value={draft.type} onChange={e=>change('type',e.target.value)}>{DEVICE_CATEGORIES.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></LifecycleField><LifecycleField label="所属场站" required error={errors.stationId}><select aria-label="所属场站" disabled={busy} value={draft.stationId} onChange={e=>change('stationId',e.target.value)}><option value="">请选择</option>{options?.stations.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></LifecycleField>
 {([['name','设备名称'],['serial','SN']] as const).map(([key,label])=><LifecycleField key={key} label={label} required error={errors[key]}><input aria-label={label} value={draft[key]??''} disabled={busy} onChange={e=>change(key,e.target.value)}/></LifecycleField>)}
 <p className="ref-lifecycle-note">新设备尚未接入采集时，实时数据展示为空。父设备关系及未核验的类型专有配置暂不提供编辑。</p></>}
 </ReferenceLifecycleShell>
}
