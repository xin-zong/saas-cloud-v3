import {useCallback,useRef,useState} from 'react'
import type {Station} from '@/App'
import {useAuth} from '@/auth/AuthContext'
import {hasStationPermission} from '@/auth/apiPermissions'
import {DEMO_MODE} from '@/api/client'
import {FIRMWARE_STATUS} from '@/data/stationMaintenance'
import type {RegisterLeaveGuard} from '../useEditorLeaveGuard'
import {DataTable,DraftRecords,Surface,useMaintenanceDraft} from './MaintenanceDraft'
import './maintenance-workbench.css'

export default function MaintenanceFirmware({stations,registerLeaveGuard}:{stations:Station[],registerLeaveGuard?:RegisterLeaveGuard}){
 const {user}=useAuth(),[stationId,setStationId]=useState(stations[0]?.id||''),[query,setQuery]=useState('')
 const guard=useRef<null|(()=>Promise<boolean>)>(null)
 const register=useCallback<RegisterLeaveGuard>(g=>{guard.current=g;registerLeaveGuard?.(g)},[registerLeaveGuard])
 const permitted=stations.filter(s=>DEMO_MODE||hasStationPermission(user,s.id,'asset.read'))
 const station=permitted.find(s=>s.id===stationId)
 return <div className="maintenance-firmware-layout"><aside className="maintenance-reference-panel maintenance-firmware-sidebar"><h2>选择站点</h2><input aria-label="搜索升级站点" placeholder="搜索站点" value={query} onChange={e=>setQuery(e.target.value)}/><div className="maintenance-firmware-stations">{permitted.filter(s=>`${s.name} ${s.code}`.includes(query)).map(s=><button className="operations-button" key={s.id} aria-pressed={s.id===stationId} onClick={()=>{void(async()=>{if(await(guard.current?.()??Promise.resolve(true)))setStationId(s.id)})()}}>{s.name}</button>)}</div></aside>{station?<FirmwareStation key={`${DEMO_MODE}:${user?.id}:${station.id}`} station={station} registerLeaveGuard={register}/>:<div className="operations-empty">当前站点权限已撤销或无设备读取权限，请选择授权站点。</div>}</div>
}
function FirmwareStation({station,registerLeaveGuard}:{station:Station,registerLeaveGuard?:RegisterLeaveGuard}){
 const [category,setCategory]=useState('PCS'),[query,setQuery]=useState(''),[deviceId,setDeviceId]=useState(''),[file,setFile]=useState<File|null>(null),[version,setVersion]=useState(''),[note,setNote]=useState('')
 const d=useMaintenanceDraft(station.id,`firmware:${deviceId||'unselected'}`,true,registerLeaveGuard)
 const devices=(station.deviceInventory||[]).filter(x=>(!category||`${x.group} ${x.code}`.toUpperCase().includes(category))&&`${x.name} ${x.code} ${x.model}`.toLowerCase().includes(query.toLowerCase()))
 const device=(station.deviceInventory||[]).find(x=>x.id===deviceId),task=station.maintenance?.firmware?.find(t=>t.device===device?.id)
 const changeDevice=(id:string)=>d.leave(()=>{setDeviceId(id);setFile(null);setVersion('');setNote('');d.setDirty(false);d.setError('');d.setNotice('')})
 function chooseFile(selected:File|undefined){
  d.setNotice('');setFile(null);d.setDirty(true)
  if(!selected)return
  if(!/\.bin$/i.test(selected.name)||selected.size===0||selected.size>100*1024*1024){d.setError('请选择非空 .bin 固件文件，大小不得超过 100 MB。');return}
  setFile(selected);d.setError('')
 }
 function save(){
  if(!device||device.status!=='online'){d.setError('请选择通信在线的已注册设备。');return}
  if(!file||!version.trim()||!note.trim()){d.setError('请选择有效固件文件并填写目标版本和升级说明。');return}
  if(version.length>100||note.length>2000){d.setError('目标版本或说明过长。');return}
  d.save({station:station.id,device:device.id,deviceCode:device.code,model:device.model,fileName:file.name,size:String(file.size),version:version.trim(),note:note.trim()},'升级草稿已保存，未上传固件、未下发升级；重新进入时须重新选择文件。')
 }
 return <div className="maintenance-firmware-main"><Surface title={station.name}><div className="maintenance-tools-filter"><label>设备类型<select aria-label="升级设备类型" value={category} onChange={e=>{const value=e.target.value;d.leave(()=>{setCategory(value);setDeviceId('');setFile(null);setVersion('');setNote('');d.setDirty(false)})}}><option value="">全部</option><option>PCS</option><option>BMS</option><option>EMS</option></select></label><input aria-label="搜索升级设备" placeholder="搜索设备名称 / 编号" value={query} onChange={e=>setQuery(e.target.value)}/></div><DataTable headers={['选择','设备','型号','连接状态','升级条件']} rows={devices.map(x=>[<input type="radio" aria-label={`选择 ${x.name}`} checked={deviceId===x.id} onChange={()=>changeDevice(x.id)}/>,`${x.name} · ${x.code}`,x.model,x.status==='online'?'在线':x.status==='offline'?'离线':'未知',x.status!=='online'?'设备不满足在线条件':deviceId===x.id?'已选择 · 执行服务未接通':'未选择'])} empty="暂无符合筛选条件的已注册设备"/></Surface>
 <Surface title="目标固件"><div className="maintenance-draft-form"><label>选择固件文件<input aria-label="选择固件文件" type="file" accept=".bin" disabled={!device} onChange={e=>chooseFile(e.target.files?.[0])}/></label><p>{file?`${file.name} · ${file.size.toLocaleString()} bytes`:'未选择固件文件'}</p><label>目标版本<input value={version} onChange={e=>{setVersion(e.target.value);d.setDirty(true)}} maxLength={100}/></label><label>升级说明<textarea value={note} onChange={e=>{setNote(e.target.value);d.setDirty(true)}} maxLength={2000}/></label><div className="operations-actions"><button className="operations-button is-active" onClick={save}>保存升级草稿</button><button className="operations-button" disabled title="远程升级执行接口尚未接通">开始升级</button></div><p className="maintenance-boundary">仅校验文件格式与大小，兼容性、签名及升级条件需服务端核验。升级执行接口未接通，文件不会上传。</p>{d.error&&<p role="alert">{d.error}</p>}{d.notice&&<p role="status">{d.notice}</p>}</div></Surface>
 <section className="maintenance-reference-panel maintenance-upgrade-progress"><h2>升级进度</h2><div><span aria-label="无已接入进度"/><b>—</b><strong>{task?FIRMWARE_STATUS[task.status]:'暂无升级任务'}</strong><button className="operations-button" disabled title="停止升级接口尚未接通">停止</button></div><p className="maintenance-boundary">{task?`服务器任务 ${task.id} · ${task.currentVersion} → ${task.targetVersion||'—'} · ${task.updatedAt||'未提供时间'}`:'读取服务器固件任务；未接入字节传输或百分比进度。'}</p></section><DraftRecords records={d.records.filter(r=>r.device===deviceId)}/>{d.dialog}</div>
}
