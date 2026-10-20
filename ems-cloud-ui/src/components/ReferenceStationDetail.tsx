import {RetainedReadTab,useDetailEpoch} from './DetailReadTabs'
import {useCallback,useRef,useState,type ReactNode} from 'react'
import {Home,X} from 'lucide-react'
import ReferenceStationHeader from './ReferenceStationHeader'
import {configuredStationModules,visibleStationModule,resolveStationModule} from './reference-station/navigation'
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
import {base,Empty,LoadingState,QueryState,useStationQuery} from './reference-station/shared'
import './reference-station/reference-station.css'
import StationDashboardParity from './StationDashboardParity'
import type {DashboardDeviceFilter} from '@/data/stationDashboard'
import {loadStationDashboard} from '@/api/stationDashboard'
import './reference-station/station-shell-parity.css'
import {dashboardTimestamp} from '@/data/stationDashboardPresentation'
import {dashboardDatasetTime,type DashboardDatasetTime} from '@/data/stationDashboardExtras'
export type ReferenceStationDetailProps={user:AuthUser;stationId:string;station?:Station;onBack:()=>void;initialDeviceId?:string;initialTab?:string;onTabChange?:(tab:string)=>void;registerLeaveGuard?:RegisterLeaveGuard;renderSettings?:(station:Station,onUpdated:()=>void,registerLeaveGuard:RegisterLeaveGuard,initialSection?:string)=>ReactNode;renderDevices?:(stationId:string,initialDeviceId:string|undefined,registerLeaveGuard:RegisterLeaveGuard,dashboardFilter?:DashboardDeviceFilter,onClearDashboardFilter?:()=>void)=>ReactNode;onEditStation?:(station:Station)=>void;onDeleteStation?:(station:Station)=>void;onCreateDevice?:()=>void;onOpenDevice?:(id:string)=>void}

export default function ReferenceStationDetail(props:ReferenceStationDetailProps){const epoch=useDetailEpoch(),key=JSON.stringify([epoch,props.stationId,props.user.id,props.user.tenant,props.user.stationPermissions,props.user.permissions]);return <StationContent key={key} {...props}/>}
function StationContent({user,stationId,onBack,initialDeviceId,initialTab,onTabChange,registerLeaveGuard,renderSettings,renderDevices,onEditStation,onDeleteStation,onOpenDevice}:ReferenceStationDetailProps){
 const [requestedTab,setCurrentTab]=useState<string>(()=>resolveStationModule(initialTab,initialDeviceId)),[revision,setRevision]=useState(0),[settingsSection,setSettingsSection]=useState<string>(),[dashboardFilter,setDashboardFilter]=useState<DashboardDeviceFilter>()
 const setTab=(next:string)=>{setCurrentTab(next);onTabChange?.(next)}
 const can=(p:string)=>hasStationPermission(user,stationId,p),read=can('asset.read')
 const query=useStationQuery(`identity:${stationId}:${revision}:${read}`,signal=>read?api<ApiRow>(base(stationId),{signal}).then(adaptStation):Promise.resolve(null))
 const dashboard=useStationQuery(`dashboard-view:${stationId}:${revision}:${read}:${can('telemetry.read')}`,signal=>read?loadStationDashboard(stationId,signal):Promise.resolve(null))
 const [dataTime,setDataTime]=useState<(DashboardDatasetTime&{anchor:string})|null>(null)
 const dataTimeAnchor=`${stationId}:${dashboard.data?.sourceTime??''}`
 const onDataTime=useCallback((value:DashboardDatasetTime)=>setDataTime(previous=>previous?.anchor===dataTimeAnchor&&previous.sourceTime===value.sourceTime&&previous.timezone===value.timezone&&previous.mocked===value.mocked?previous:{...value,anchor:dataTimeAnchor}),[dataTimeAnchor])
 const modules=configuredStationModules(dashboard.data?.modules),tab=visibleStationModule(requestedTab,modules)
 const guard=useRef<null|(()=>Promise<boolean>)>(null),headerGuard=useRef<null|(()=>Promise<boolean>)>(null)
 const canLeave=useCallback(async()=>{if(headerGuard.current&&!await headerGuard.current())return false;return !guard.current||await guard.current()},[])
 const register=useCallback<RegisterLeaveGuard>(fn=>{guard.current=fn;registerLeaveGuard?.(fn||headerGuard.current?canLeave:null)},[registerLeaveGuard,canLeave])
 const registerHeader=useCallback<RegisterLeaveGuard>(fn=>{headerGuard.current=fn;registerLeaveGuard?.(fn||guard.current?canLeave:null)},[registerLeaveGuard,canLeave])
 const leave=async(action:()=>void)=>{if(await canLeave())action()}
 if(!read)return <section className="rs-page"><Empty text="无此场站的资产查看权限"/><button onClick={onBack}>返回场站</button></section>
 const station=query.data
 if(!station)return <section className="rs-page"><QueryState {...query}/><button onClick={onBack}>返回场站</button></section>
 const headerTelemetry=can('telemetry.read')&&dashboard.data?.telemetryAvailable===true
 const currentTime=headerTelemetry&&tab==='数据看板'&&dataTime?.anchor===dataTimeAnchor?dataTime:dashboardDatasetTime(null,dashboard.data??undefined,headerTelemetry)
 const allowed=tab==='报警'?can('alarm.read'):tab==='操作日志'?user.permissions.includes('audit.read'):tab==='能量管理'?can('strategy.read'):true
 return <section className="rs-page station-shell-parity"><div className="rs-workspace-tabs"><button aria-label="返回场站" onClick={()=>void leave(onBack)}><Home size={16}/></button><span>{station.name}<button aria-label="关闭场站" onClick={()=>void leave(onBack)}><X size={14}/></button></span></div>
 <ReferenceStationHeader station={station} communicationState={dashboard.data?.communicationState} alarmState={dashboard.data?.alarmState} identity={JSON.stringify([user.id,user.tenant,user.permissions,user.stationPermissions])} editable={can('asset.edit')} registerLeaveGuard={registerHeader} beforeOpen={action=>void leave(action)} onRefresh={()=>void leave(()=>setRevision(v=>v+1))} onAutoRefresh={()=>{if(!guard.current&&!headerGuard.current)setRevision(v=>v+1)}}/>
 <div className="rs-module-row"><nav className="rs-tabs" role="tablist" aria-label="场站模块">{modules.map(name=><button key={name} role="tab" aria-selected={tab===name} onClick={()=>void leave(()=>{if(name==='设置')setSettingsSection(undefined);if(name==='设备')setDashboardFilter(undefined);setTab(name)})}>{name}</button>)}</nav><span className="rs-source-time">更新时间: {dashboardTimestamp(currentTime.sourceTime,currentTime.timezone)}</span></div>
 <main className="rs-body" key={revision} role="tabpanel" aria-label={tab} aria-busy={tab==='数据看板'&&dashboard.loading}><RetainedReadTab active={tab==='智能分析'}><ReferenceStationAnalysis stationId={stationId}/></RetainedReadTab>{user.permissions.includes('audit.read')&&<RetainedReadTab active={tab==='操作日志'}><ReferenceStationLogs stationId={stationId} stationName={station.name}/></RetainedReadTab>}{!allowed?<Empty text="无此模块的查看权限"/>:tab==='数据看板'?(dashboard.loading?<LoadingState label="加载场站数据看板…"/>:dashboard.data?.configured===false?<ReferenceStationDashboard station={station} telemetry={can('telemetry.read')} onDevices={()=>setTab('设备')} onSources={()=>void leave(()=>{setSettingsSection('数据源');setTab('设置')})}/>:<StationDashboardParity registerLeaveGuard={register} onDeviceDetails={id=>{onOpenDevice?.(id);setTab('设备')}} onDataTime={onDataTime} canEdit={can('asset.edit')} canExport={can('report.export')} station={station} view={dashboard.data??undefined} loading={dashboard.loading} error={dashboard.error} telemetry={can('telemetry.read')} canViewAlarms={can('alarm.read')} canViewDevices={can('asset.read')} canViewSubstations={can('asset.read')} onAlarms={()=>setTab('报警')} onDevices={filter=>{setDashboardFilter(filter);setTab('设备')}} onSources={()=>void leave(()=>{setSettingsSection('数据源');setTab('设置')})}/>):tab==='子场站'?<ReferenceSubstations stationId={stationId} telemetry={can('telemetry.read')} editable={can('asset.edit')} registerLeaveGuard={register}/>:tab==='设备'?renderDevices?.(stationId,dashboardFilter?undefined:initialDeviceId,register,dashboardFilter,()=>setDashboardFilter(undefined))??<Empty text="设备列表尚未接入"/>:tab==='报警'?<ReferenceStationAlarms stationId={stationId}/>:tab==='能量管理'?<ReferenceStationEnergy stationId={stationId}/>:tab==='智能分析'?null:tab==='系统布局'?<ReferenceStationLayout stationId={stationId} telemetry={can('telemetry.read')}/>:tab==='一次接线图'?<ReferenceStationWiring stationId={stationId} editable={can('asset.edit')} registerLeaveGuard={register}/>:tab==='操作日志'?null:tab==='设置'?renderSettings?.(station,()=>setRevision(v=>v+1),register,settingsSection)??<Empty text="设置尚未接入"/>:<div className="rs-panel"><Empty text={tab==='系统布局'?'系统布局服务尚未接入':'能量管理控制服务尚未接入'}/><p className="rs-note">{tab==='系统布局'?'暂无可用的场站布局。':'暂无可核验的可执行控制方案。'}</p></div>}</main></section>
}
