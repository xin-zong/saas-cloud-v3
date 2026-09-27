import { useEffect, useRef, useState } from 'react'
import type { Station } from '@/App'
import { api, CAPABILITIES_CHANGED, type ApiRow } from '@/api/client'
import { emsAllowed, exactText, mutateEms, type Gateway } from '@/api/ems'
import { useAuth } from '@/auth/AuthContext'
import { Button, Select } from './ui/Workspace'
import { useEmsResource } from './useEmsResource'

export default function EmsManagement({station,gateway,onChange}:{station:Station;gateway?:Gateway;onChange:()=>void}) {
  const {user}=useAuth(),[uuid,setUuid]=useState(''),[device,setDevice]=useState(''),[binding,setBinding]=useState(''),[namespace,setNamespace]=useState('cabinet'),[source,setSource]=useState(''),[point,setPoint]=useState(''),[role,setRole]=useState('bms'),[scope,setScope]=useState('cabinet'),[cabinet,setCabinet]=useState('1'),[local,setLocal]=useState('1')
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('')
  const ctrl=useRef<AbortController|null>(null)
  const canManage=emsAllowed(user,station.id,'ems.manage')
  const canAssets=emsAllowed(user,station.id,'asset.read'),canPoints=emsAllowed(user,station.id,'telemetry.read')
  const key=`${user?.id}|${JSON.stringify(user?.stationPermissions)}|${station.id}|${gateway?.ems_uuid}`
  const options=useEmsResource(key,canManage,async signal=>{
    const [devices,points,catalog]=await Promise.all([
      canAssets?api<ApiRow[]>(`/stations/${station.id}/devices`,{signal}):[],
      canPoints?api<ApiRow[]>(`/stations/${station.id}/points`,{signal}):[],
      api<ApiRow>('/ems-point-definitions',{signal}),
    ]);return {devices,points,catalog}
  })
  useEffect(()=>{const cancel=()=>{ctrl.current?.abort();setBusy(false);setNotice('');setError('')};window.addEventListener(CAPABILITIES_CHANGED,cancel);return()=>{cancel();window.removeEventListener(CAPABILITIES_CHANGED,cancel)}},[key])
  async function save(path:string,body:ApiRow){if(!canManage||busy)return;ctrl.current?.abort();const request=new AbortController();ctrl.current=request;setBusy(true);setNotice('');setError('');try{const response=await mutateEms(path,body,request.signal);if(!request.signal.aborted){setNotice(`服务器已保存显式映射：${exactText(response)}（不是设备执行 ACK）`);onChange()}}catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'映射保存失败')}finally{if(!request.signal.aborted)setBusy(false)}}
  const devices=options.data?.devices??[],points=options.data?.points??[]
  const definitions=(options.data?.catalog.definitions??[]) as ApiRow[]
  return <details className="ems-evidence"><summary>显式 EMS 注册 / 设备 / 测点映射管理</summary><p>需 ems.manage；仅选择现有本站资产，保存从服务器当前时间生效。不会创建租户、客户或站点，不填写真实 EMS 身份前不会注册。</p>
    {options.error&&<p role="alert">{options.error}</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <div className="ems-management-fields"><label>真实 EMS UUIDv4<input aria-label="真实 EMS UUIDv4" value={uuid} onChange={e=>setUuid(e.target.value)} placeholder="输入设备提供的真实身份"/></label><label>本站现有物理设备<Select aria-label="EMS 映射物理设备" value={device} onChange={e=>setDevice(e.target.value)}><option value="">选择物理设备</option>{devices.map(d=><option key={String(d.id)} value={String(d.id)}>{String(d.name)} · {String(d.id)}</option>)}</Select></label><Button disabled={busy||!device||!uuid||!canManage} onClick={()=>void save(`/stations/${station.id}/ems-bindings`,{emsId:uuid,deviceId:device})}>注册真实 EMS</Button></div>
    {!canAssets&&<p>需要本站 asset.read 才能选择既有设备。</p>}
    {gateway&&<><div className="ems-management-fields"><label>设备作用域<Select aria-label="EMS 设备作用域" value={scope} onChange={e=>setScope(e.target.value)}>{['ems','cabinet','public'].map(s=><option key={s}>{s}</option>)}</Select></label><label>角色<Select aria-label="EMS 设备角色" value={role} onChange={e=>setRole(e.target.value)}>{['ems','emu','bms','bmu','pcs','dcdc','tms','meter'].map(r=><option key={r}>{r}</option>)}</Select></label><label>柜号<input aria-label="EMS 映射柜号" type="number" min={1} max={30} value={cabinet} onChange={e=>setCabinet(e.target.value)}/></label><label>精确本地位置<input aria-label="EMS 本地位置" value={local} onChange={e=>setLocal(e.target.value)}/></label><Button disabled={busy||!device||!local} onClick={()=>void save(`/ems/${gateway.ems_uuid}/device-bindings`,{scope,cabinetNo:scope==='cabinet'?Number(cabinet):null,role,localNo:local,deviceId:device})}>保存设备映射</Button></div>
    <div className="ems-management-fields"><label>现有设备绑定 ID<input aria-label="EMS 设备绑定 ID" value={binding} onChange={e=>setBinding(e.target.value)}/></label><label>测点命名空间<Select aria-label="EMS 测点命名空间" value={namespace} onChange={e=>{setNamespace(e.target.value);setSource('')}}>{['ems','cabinet','public'].map(n=><option key={n}>{n}</option>)}</Select></label><label>冻结目录源点<Select aria-label="EMS 目录源点" value={source} onChange={e=>setSource(e.target.value)}><option value="">选择批准目录源点</option>{definitions.filter(d=>d.namespace===namespace).map((d,i)=><option key={i} value={String(d.sourcePointId)}>{String(d.sourcePointId)} · {String(d.sourceName??d.subsystem??'')} · {String(d.wireType??'')}</option>)}</Select></label><label>本站现有测点<Select aria-label="EMS 映射测点" value={point} onChange={e=>setPoint(e.target.value)}><option value="">选择测点</option>{points.map(p=><option key={String(p.id)} value={String(p.id)}>{String(p.name)} · {String(p.unit??'单位未知')} · {String(p.id)}</option>)}</Select></label><Button disabled={busy||!binding||!source||!point} onClick={()=>void save(`/ems/${gateway.ems_uuid}/point-bindings`,{deviceBindingId:binding,namespace,sourceId:source,pointId:point})}>保存测点映射</Button></div><p>目录版本 {exactText(options.data?.catalog.catalogVersion)}；服务端验证物理归属、位置、类型与已确认单位。未批准聚合语义仅支持 last。</p></>}
  </details>
}
