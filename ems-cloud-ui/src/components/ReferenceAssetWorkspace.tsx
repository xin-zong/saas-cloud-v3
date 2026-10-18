import {useEffect,useState} from 'react'
import type {AuthUser} from '@/auth/roles'
import {hasStationPermission} from '@/auth/apiPermissions'
import {CAPABILITIES_CHANGED} from '@/api/client'
import type {WorkspaceQuery} from '@/api/monitorWorkspace'
import type {ReferenceDeviceCategory} from '@/data/referenceDevices'
import MonitorSitesPage from './MonitorSitesPage'
import {ReferenceDevicesPage} from './ReferenceDevicesPage'
import ReferenceStationDetail from './ReferenceStationDetail'
import {resolveStationModule} from './reference-station/navigation'
import {ReferenceStationDeviceDetail} from './ReferenceStationDeviceDetail'
import ReferenceStationSettings from './ReferenceStationSettings'
import ReferenceStationEditor from './ReferenceStationEditor'
import ReferenceDeviceEditor from './ReferenceDeviceEditor'
import ReferenceAssetActionDialog from './ReferenceAssetActions'
import type {RegisterLeaveGuard} from './useEditorLeaveGuard'
import './reference-station/station-workspace-theme.css'
type Action={kind:'station'|'device';action:'assign'|'archive';id:string;name:string}
type Props={user:AuthUser;mode:'sites'|'devices'|'detail';stationId?:string;initialDeviceId?:string;initialTab?:string;initialFilter?:WorkspaceQuery;onOpenStation:(id:string,tab?:string,deviceId?:string)=>void;onBack:()=>void;registerLeaveGuard?:RegisterLeaveGuard;onChanged?:()=>void}
export default function ReferenceAssetWorkspace({user,mode,stationId,initialDeviceId,initialTab,initialFilter,onOpenStation,onBack,registerLeaveGuard,onChanged}:Props){
 const moduleEntry=JSON.stringify([stationId,initialTab,initialDeviceId])
 const [selectedModule,setSelectedModule]=useState<{entry:string;tab:string}|null>(null)
 useEffect(()=>setSelectedModule(null),[moduleEntry])
 const moduleTab=selectedModule?.entry===moduleEntry?selectedModule.tab:resolveStationModule(initialTab,initialDeviceId)
 const [revision,setRevision]=useState(0),[stationEditor,setStationEditor]=useState<string|null>(null),[deviceEditor,setDeviceEditor]=useState<{id?:string;stationId?:string;category?:ReferenceDeviceCategory}|null>(null),[actions,setActions]=useState<Action[]>([]),[deviceId,setDeviceId]=useState(initialDeviceId),[notice,setNotice]=useState('')
 useEffect(()=>setDeviceId(initialDeviceId),[stationId,initialDeviceId]);const identity=JSON.stringify([user.id,user.tenant?.tenantId]);useEffect(()=>{setStationEditor(null);setDeviceEditor(null);setActions([])},[identity])
 const changed=()=>{setRevision(r=>r+1);onChanged?.();window.dispatchEvent(new CustomEvent(CAPABILITIES_CHANGED,{detail:{silent:true}}))}
 const onArchive=(kind:Action['kind'],id:string,name:string)=>setActions([{kind,id,name,action:'archive'}]);const onAssign=(kind:Action['kind'],id:string,name:string)=>setActions([{kind,id,name,action:'assign'}])
 const devices=(scope:string|undefined,guard: RegisterLeaveGuard|undefined)=>deviceId&&scope?<ReferenceStationDeviceDetail key={deviceId+revision} user={user} stationId={scope} deviceId={deviceId} onClose={()=>setDeviceId(undefined)} onEdit={()=>setDeviceEditor({id:deviceId,stationId:scope})} onDelete={name=>onArchive('device',deviceId,name)}/>:<ReferenceDevicesPage key={`devices:${scope??''}:${revision}`} user={user} stationScope={scope} registerLeaveGuard={guard} onOpenStation={onOpenStation} onOpenDevice={(s,id)=>scope?setDeviceId(id):onOpenStation(s,'设备详情',id)} onCreate={user.permissions.includes('asset.edit')?category=>setDeviceEditor({stationId:scope,category}):undefined} onEdit={id=>setDeviceEditor({id,stationId:scope})} onDelete={(id,name)=>onArchive('device',id,name)} onAssign={(id,name)=>onAssign('device',id,name)}/>
 return <div className="station-workspace-theme">{notice&&<p role="status" className="rs-message">{notice}<button onClick={()=>setNotice('')}>关闭</button></p>}{mode==='detail'&&stationId?<ReferenceStationDetail key={`${moduleEntry}:${revision}`} user={user} stationId={stationId} initialDeviceId={initialDeviceId} initialTab={moduleTab} onTabChange={tab=>setSelectedModule({entry:moduleEntry,tab})} onBack={onBack} registerLeaveGuard={registerLeaveGuard} onEditStation={s=>setStationEditor(s.id)} onDeleteStation={s=>onArchive('station',s.id,s.name)} renderDevices={(id,_initial,guard)=>devices(id,guard)} renderSettings={(s,_updated,guard,initialSection)=><ReferenceStationSettings initialTab={initialSection} station={s} user={user} registerLeaveGuard={guard} onEdit={()=>setStationEditor(s.id)} onDelete={()=>onArchive('station',s.id,s.name)} onAssign={()=>onAssign('station',s.id,s.name)}/>}/>:mode==='devices'?devices(undefined,registerLeaveGuard):<MonitorSitesPage key={`sites:${revision}`} user={user} initialFilter={initialFilter} onOpenStation={onOpenStation} onEdit={setStationEditor} onCreate={user.tenant?.administrator&&user.tenant.kind==='enterprise'?()=>setStationEditor(''):undefined} canEditStation={id=>hasStationPermission(user,id,'asset.edit')} onTags={()=>{}} onDelete={(id,name)=>onArchive('station',id,name)} onAssign={user.tenant?.administrator?rows=>setActions(rows.map(r=>({...r,kind:'station',action:'assign'}))):undefined} registerLeaveGuard={registerLeaveGuard}/>}
 {stationEditor!==null&&<ReferenceStationEditor key={`station:${stationEditor}:${identity}`} stationId={stationEditor||undefined} onClose={()=>setStationEditor(null)} onSaved={()=>{setStationEditor(null);setNotice('场站资料已保存，可在列表和场站信息中查看');changed()}}/>}
 {deviceEditor&&<ReferenceDeviceEditor key={`device:${deviceEditor.id??'new'}:${identity}`} deviceId={deviceEditor.id} stationId={deviceEditor.stationId} category={deviceEditor.category} onClose={()=>setDeviceEditor(null)} onSaved={()=>{setDeviceEditor(null);setNotice('设备资料已保存');changed()}}/>}
 {actions[0]&&<ReferenceAssetActionDialog key={`${actions[0].kind}:${actions[0].id}:${actions[0].action}`} {...actions[0]} onClose={()=>setActions([])} onSaved={()=>{const action=actions[0];setActions(a=>a.slice(1));if(action.action==='archive'){setDeviceId(undefined);if(action.kind==='station'&&mode==='detail')onBack()}setNotice(action.action==='archive'?'已删除，历史数据保留':'分配已保存');changed()}}/>}
 </div>
}
