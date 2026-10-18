import {useCallback,useRef,useState,type ReactNode} from 'react'
import {Home,RefreshCw,Radio,X} from 'lucide-react'
import type {Station} from '@/App'
import type {AuthUser} from '@/auth/roles'
import {hasStationPermission} from '@/auth/apiPermissions'
import {api,type ApiRow} from '@/api/client'
import {adaptStation} from '@/api/adapters'
import type {RegisterLeaveGuard} from './useEditorLeaveGuard'
import {ReferenceStationDashboard,ReferenceStationAnalysis} from './reference-station/Dashboard'
import {ReferenceStationWiring} from './reference-station/Wiring'
import {ReferenceStationEnergy} from './reference-station/Energy'
import {ReferenceStationAlarms,ReferenceStationLogs} from './reference-station/Tables'
import {ReferenceStationLayout} from './reference-station/TelemetryViews'
import {ReferenceSubstations} from './reference-station/Substations'
import {base,Empty,QueryState,useStationQuery} from './reference-station/shared'
import './reference-station/reference-station.css'
export type ReferenceStationDetailProps={user:AuthUser;stationId:string;station?:Station;onBack:()=>void;initialDeviceId?:string;initialTab?:string;registerLeaveGuard?:RegisterLeaveGuard;renderSettings?:(station:Station,onUpdated:()=>void,registerLeaveGuard:RegisterLeaveGuard)=>ReactNode;renderDevices?:(stationId:string,initialDeviceId:string|undefined,registerLeaveGuard:RegisterLeaveGuard)=>ReactNode;onEditStation?:(station:Station)=>void;onDeleteStation?:(station:Station)=>void;onCreateDevice?:()=>void}
const tabs=['数据看板','子场站','设备','报警','能量管理','智能分析','系统布局','一次接线图','操作日志','设置'] as const
export default function ReferenceStationDetail(props:ReferenceStationDetailProps){const key=JSON.stringify([props.stationId,props.user.id,props.user.tenant,props.user.stationPermissions,props.user.permissions]);return <StationContent key={key} {...props}/>}
function StationContent({user,stationId,onBack,initialDeviceId,initialTab,registerLeaveGuard,renderSettings,renderDevices,onEditStation,onDeleteStation}:ReferenceStationDetailProps){
 const [tab,setTab]=useState<string>(initialDeviceId?'设备':initialTab==='告警信息'?'报警':'数据看板'),[revision,setRevision]=useState(0)
 const can=(p:string)=>hasStationPermission(user,stationId,p),read=can('asset.read')
 const query=useStationQuery(`identity:${stationId}:${revision}:${read}`,signal=>read?api<ApiRow>(base(stationId),{signal}).then(adaptStation):Promise.resolve(null))
 const guard=useRef<null|(()=>Promise<boolean>)>(null)
 const register=useCallback<RegisterLeaveGuard>(fn=>{guard.current=fn;registerLeaveGuard?.(fn)},[registerLeaveGuard])
 const leave=async(action:()=>void)=>{if(!guard.current||await guard.current())action()}
 if(!read)return <section className="rs-page"><Empty text="无此场站的资产查看权限"/><button onClick={onBack}>返回场站</button></section>
 const station=query.data
 if(!station)return <section className="rs-page"><QueryState {...query}/><button onClick={onBack}>返回场站</button></section>
 const allowed=tab==='报警'?can('alarm.read'):tab==='操作日志'?user.permissions.includes('audit.read'):tab==='能量管理'?can('strategy.read'):true
 return <section className="rs-page"><div className="rs-workspace-tabs"><button aria-label="返回场站" onClick={()=>void leave(onBack)}><Home size={16}/></button><span>{station.name}<button aria-label="关闭场站" onClick={()=>void leave(onBack)}><X size={14}/></button></span></div>
 <header className="rs-header"><strong>{station.name}</strong><Radio size={16} className="rs-muted"/><span className="rs-tag">{station.remark||station.code}</span><div className="rs-header-actions">{can('asset.edit')&&onEditStation&&<button onClick={()=>void leave(()=>onEditStation(station))}>编辑场站</button>}{can('asset.edit')&&onDeleteStation&&<button onClick={()=>void leave(()=>onDeleteStation(station))}>删除</button>}<button aria-label="刷新场站" onClick={()=>void leave(()=>setRevision(v=>v+1))}><RefreshCw size={15}/></button></div></header>
 <nav className="rs-tabs" role="tablist" aria-label="场站模块">{tabs.map(name=><button key={name} role="tab" aria-selected={tab===name} onClick={()=>void leave(()=>setTab(name))}>{name}</button>)}</nav>
 <main className="rs-body" key={`${tab}:${revision}`} role="tabpanel" aria-label={tab}>{!allowed?<Empty text="无此模块的查看权限"/>:tab==='数据看板'?<ReferenceStationDashboard station={station} telemetry={can('telemetry.read')} onDevices={()=>setTab('设备')} onSources={()=>setTab('设置')}/>:tab==='子场站'?<ReferenceSubstations stationId={stationId} telemetry={can('telemetry.read')} editable={can('asset.edit')} registerLeaveGuard={register}/>:tab==='设备'?renderDevices?.(stationId,initialDeviceId,register)??<Empty text="设备列表尚未接入"/>:tab==='报警'?<ReferenceStationAlarms stationId={stationId}/>:tab==='能量管理'?<ReferenceStationEnergy stationId={stationId}/>:tab==='智能分析'?<ReferenceStationAnalysis stationId={stationId}/>:tab==='系统布局'?<ReferenceStationLayout stationId={stationId} telemetry={can('telemetry.read')}/>:tab==='一次接线图'?<ReferenceStationWiring stationId={stationId} editable={can('asset.edit')} registerLeaveGuard={register}/>:tab==='操作日志'?<ReferenceStationLogs stationId={stationId} stationName={station.name}/>:tab==='设置'?renderSettings?.(station,()=>setRevision(v=>v+1),register)??<Empty text="设置尚未接入"/>:<div className="rs-panel"><Empty text={tab==='系统布局'?'系统布局服务尚未接入':'能量管理控制服务尚未接入'}/><p className="rs-note">{tab==='系统布局'?'暂无可用的场站布局。':'暂无可核验的可执行控制方案。'}</p></div>}</main></section>
}
