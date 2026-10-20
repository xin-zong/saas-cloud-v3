import LoadingState from './LoadingState'
import StationDashboardMetricPanel from './StationDashboardMetricPanel'
import type {RegisterLeaveGuard} from './useEditorLeaveGuard'
import StationLocationDetails from './StationLocationDetails'
import {Component,lazy,Suspense,useCallback,useEffect,useState,type ReactNode} from 'react'
import {ChevronRight} from 'lucide-react'
import type {Station} from '@/App'
import {loadStationDashboard,type StationDashboardView,type DashboardPanel} from '@/api/stationDashboard'
import {substationsApi} from '@/api/substations'
import {dashboardFlowMetrics,dashboardMetric,dashboardNumber,dashboardPanels,dashboardSceneNames,dashboardEquipmentNames,dashboardEquipmentTypes,dashboardEquipmentCell,dashboardDeviceCategory,type DashboardDeviceFilter} from '@/data/stationDashboard'
import type {DeviceType} from './EnergyFlow3D'
import {Empty,QueryState,useStationQuery} from './reference-station/shared'
import './station-dashboard-parity.css'
import StationDashboardHistory from './StationDashboardHistory'
import StationDashboardSolar,{SolarStatistics} from './StationDashboardSolar'
import StationDashboardGrid from './StationDashboardGrid'
import StationProfileImage from './StationProfileImage'
import StationDashboardComposition from './StationDashboardComposition'
import StationGenerationPlansPanel from './StationGenerationPlansPanel'
import {loadStationGenerationPlans} from '@/api/stationGenerationPlans'
import {api} from '@/api/client'
import {presentDashboard} from '@/data/stationDashboardPresentation'
import {readDashboardSupplement,savedSolarPlanRows} from '@/data/stationDashboardSolar'
import {dashboardDatasetTime,type DashboardDatasetTime} from '@/data/stationDashboardExtras'
import {historyDefaultDate,type HistoryCapture,type HistoryPeriod} from '@/data/stationDashboardHistory'
const StationDashboardFlow=lazy(()=>import('./StationDashboardFlow'))
class FlowBoundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true}};render(){return this.state.failed?<Empty text="3D 图暂不可用，采样值见下方"/>:this.props.children}}
export type {DashboardDeviceFilter} from '@/data/stationDashboard'
export type StationDashboardParityProps={station:Station;view?:StationDashboardView;loading?:boolean;error?:string;telemetry:boolean;onDevices:(filter?:DashboardDeviceFilter)=>void;onSources:()=>void;onAlarms:()=>void;canViewDevices?:boolean;canViewAlarms?:boolean;canViewSubstations?:boolean;canExport?:boolean;canEdit?:boolean;onDataTime?:(value:DashboardDatasetTime)=>void;registerLeaveGuard?:RegisterLeaveGuard;onDeviceDetails?:(id:string)=>void}
export default function StationDashboardParity({station,view,loading=false,error='',telemetry,onDevices,onSources,onAlarms,canViewDevices=false,canViewAlarms=false,canViewSubstations=false,canExport=false,canEdit=false,onDataTime,registerLeaveGuard,onDeviceDetails}:StationDashboardParityProps){
 const [chosenScene,setScene]=useState(''),[chosenPanel,setPanel]=useState(''),[scopeSelection,setScopeSelection]=useState({stationId:station.id,id:''})
 const scope=canViewSubstations&&scopeSelection.stationId===station.id?scopeSelection.id:''
 const setScope=(id:string)=>setScopeSelection({stationId:station.id,id})
 const allowed=telemetry&&view?.telemetryAvailable===true
 const initialDate=historyDefaultDate(view?.sourceTime,view?.timezone)
 const [planOpen,setPlanOpen]=useState(false),[planVersion,setPlanVersion]=useState(0)
 const [historyState,setHistoryState]=useState<{capture?:HistoryCapture;period:HistoryPeriod;date:string}>({period:'day',date:initialDate})
 const historyChanged=useCallback((capture:HistoryCapture|undefined,period:HistoryPeriod,date:string)=>setHistoryState({capture,period,date}),[])
 const supplementQuery=useStationQuery(`dashboard-supplement:${station.id}:${initialDate}:${allowed}`,signal=>allowed&&initialDate?api<HistoryCapture>(`/stations/${station.id}/dashboard-history?period=day&date=${initialDate}`,{signal}):Promise.resolve(undefined))
 const payload=supplementQuery.data?.payload as {dashboardSupplement?:Record<string,unknown>}|undefined
 const supplementRaw=allowed?payload?.dashboardSupplement:undefined
 const scenes=[...new Set([...(view?.scenes??[]),...(supplementRaw?.grid?['grid']:[])])],scene=scenes.includes(chosenScene)?chosenScene:scenes[0]??'storage'
 const solar=scene==='solar'
 const totalQuery=useStationQuery(`dashboard-total:${station.id}:${initialDate}:${allowed}`,signal=>allowed&&initialDate?api<HistoryCapture>(`/stations/${station.id}/dashboard-history?period=total&date=${initialDate.slice(0,4)}:${initialDate.slice(0,4)}`,{signal}):Promise.resolve(undefined))
 const yearQuery=useStationQuery(`dashboard-year:${station.id}:${initialDate}:${allowed}:${solar}`,signal=>allowed&&initialDate&&solar?api<HistoryCapture>(`/stations/${station.id}/dashboard-history?period=year&date=${initialDate.slice(0,4)}`,{signal}):Promise.resolve(undefined))
 const plansQuery=useStationQuery(`dashboard-plans:${station.id}:${planVersion}:${allowed}:${solar}`,()=>allowed&&solar?loadStationGenerationPlans(station.id):Promise.resolve([]))
 const supplement=readDashboardSupplement(supplementRaw)
 const datasetTime=dashboardDatasetTime(allowed?supplementQuery.data?.payload:null,view,allowed)
 useEffect(()=>{onDataTime?.(datasetTime)},[onDataTime,datasetTime.sourceTime,datasetTime.timezone,datasetTime.mocked])
 const plans=plansQuery.data??[],totalPayload=totalQuery.data?.payload as {stationStatisticMonthDtoList?:unknown;stationStatisticYearDtoList?:unknown;stationStatisticTotalDto?:unknown}|undefined
 const planRows=savedSolarPlanRows(plans,yearQuery.data)
 const yearlyRows=Array.isArray(totalPayload?.stationStatisticYearDtoList)?totalPayload!.stationStatisticYearDtoList as Record<string,unknown>[]:[]
 const totalPlanRows=plans.map(plan=>{const actual=yearlyRows.find(r=>Number(r.year)===plan.year),actualKwh=typeof actual?.generationValue==='number'?actual.generationValue/1000:null,plannedKwh=plan.months.reduce((n,m)=>n+Number(m.plannedKwh),0);return {date:String(plan.year),actualKwh,plannedKwh,excellentKwh:plan.months.every(m=>m.excellentKwh!==null)?plan.months.reduce((n,m)=>n+Number(m.excellentKwh),0):null,completionPercent:actualKwh===null||plannedKwh<=0?null:actualKwh/plannedKwh*100}})
 if(plans.length){const yearSummary=yearQuery.data?.available&&yearQuery.data.period==='year'?(yearQuery.data.payload as {stationStatisticYearDto?:{generationValue?:number}}|undefined)?.stationStatisticYearDto:undefined;const yearActual=typeof yearSummary?.generationValue==='number'&&Number.isFinite(yearSummary.generationValue)?yearSummary.generationValue/1000:null;supplement.generationPlan={...supplement.generationPlan,year:{rows:planRows,summaryYear:yearQuery.data?.available?yearQuery.data.date:undefined,actualKwh:yearActual,excellentKwh:null,plannedKwh:null},total:{rows:totalPlanRows,excellentKwh:totalPlanRows.every(r=>r.excellentKwh!==null)?totalPlanRows.reduce((sum,r)=>sum+r.excellentKwh!,0):null,actualKwh:totalPlanRows.every(r=>r.actualKwh!==null)?totalPlanRows.reduce((sum,r)=>sum+r.actualKwh!,0):null,plannedKwh:totalPlanRows.reduce((sum,r)=>sum+r.plannedKwh,0)}}}
 const displayedPanels=view?[...presentDashboard(view,supplementRaw,totalPayload)]:[]
 const pcs=supplementRaw?((supplementRaw.flow as {pcsKw?:number|null}|undefined)?.pcsKw??null):(view?.flow?.pcsKw??null),pcsValue=allowed&&typeof pcs==='number'&&Number.isFinite(pcs)?pcs:null
 const pcsMetric={key:'power',label:'PCS有功功率',value:pcsValue,unit:'kW',period:'instant',status:pcsValue===null?'missing' as const:'captured' as const},pcsIndex=displayedPanels.findIndex(p=>p.key==='pcs')
 if(pcsIndex<0)displayedPanels.push({key:'pcs',label:'PCS',metrics:[pcsMetric]});else displayedPanels[pcsIndex]={...displayedPanels[pcsIndex],metrics:[pcsMetric,...displayedPanels[pcsIndex].metrics.filter(m=>m.key!=='power')]}
 const flowPanelLabels:Record<string,string>={grid:'电网',load:'用电',pcs:'PCS',solar:'光伏',battery:'储能'}
 const panels:DashboardPanel[]=scene==='storage'?['grid','load','pcs','solar','battery'].map(key=>{const found=displayedPanels.find(p=>p.key===key)||displayedPanels.find(p=>key==='battery'&&p.key==='storage'||key==='solar'&&['pv','mppt'].includes(p.key));return found?{...found,key}:{key,label:flowPanelLabels[key],metrics:[]}}):dashboardPanels(displayedPanels,scene),panel=panels.find(p=>p.key===chosenPanel)??(scene==='storage'?panels.find(p=>p.key==='battery'):panels[0])
 const rawFlow=allowed?(supplementRaw?.flow as (NonNullable<StationDashboardView['flow']>&{convention?:string;solarKw?:number|null;batterySoc?:number|null})|undefined)??view?.flow:null
 const convention=supplementRaw&&rawFlow&&'convention' in rawFlow&&rawFlow.convention==='import-charge-positive'?'import-charge-positive':null
 const substations=useStationQuery(`dashboard-substations:${station.id}:${canViewSubstations}`,signal=>canViewSubstations?substationsApi.list(station.id,signal):Promise.resolve([]))
 const scoped=useStationQuery(`dashboard-equipment:${station.id}:${scope}:${canViewDevices}:${telemetry}`,signal=>scope&&canViewDevices?loadStationDashboard(station.id,signal,scope):Promise.resolve(undefined))
 const cachedEquipment=canViewDevices?(scope?scoped.data?.equipment:view?.equipment)??[]:[]
 const equipment=telemetry?cachedEquipment:cachedEquipment.map(item=>({...item,status:'unknown'}))
 const types=dashboardEquipmentTypes(equipment),statuses=['total','online','offline','alarm',...(equipment.some(e=>e.status==='unknown')?['unknown']:[])]
 const equipmentAlarms=canViewAlarms?(scope?scoped.data?.equipmentAlarms:view?.equipmentAlarms):undefined
 const statusNames:Record<string,string>={total:'合计',online:'在线',offline:'离线',unknown:'未知',fault:'故障',alarm:'报警',building:'建设中'}
 const flow=dashboardFlowMetrics(rawFlow,allowed)
 const selectedTypes:Record<string,DeviceType>={grid:'tower',load:'factory',pcs:'pcs',mppt:'solar',battery:'battery',solar:'solar'}
 const chooseDevice=(type:DeviceType)=>{const key=Object.entries(selectedTypes).find(([k,v])=>v===type&&panels.some(p=>p.key===k))?.[0];if(key)setPanel(key)}
 if(loading)return <LoadingState label="正在读取场站看板…"/>
 return <div className={`sdp-dashboard sdp-scene-${scene}`}>
  <div className="sdp-scene-row"><div className="sdp-scenes" role="tablist" aria-label="能源场景">{scenes.map(key=><button key={key} role="tab" aria-selected={scene===key} onClick={()=>{setScene(key);setPanel(key==='grid'?'grid':'battery')}}>{dashboardSceneNames[key]??key}</button>)}</div></div>
  <QueryState loading={false} error={error||supplementQuery.error||totalQuery.error}/>
  <QueryState loading={allowed&&(supplementQuery.loading||totalQuery.loading)} error="" loadingText="加载补充与累计统计…"/>
  {scene==='grid'?<StationDashboardGrid loading={supplementQuery.loading} payload={supplementQuery.data?.payload} telemetry={allowed} initialDate={initialDate} stationId={station.id} canExport={canExport}/>:<div className={`sdp-top ${scene==='solar'?'sdp-solar-top':''}`}>
   <article className="sdp-card sdp-profile"><StationProfileImage imageUrl={view?.imageUrl} name={view?.name??station.name}/><dl><dt>地址</dt><dd><StationLocationDetails name={view?.name??station.name} address={view?.address??station.address} longitude={station.lng} latitude={station.lat} region={station.region}/></dd><dt>投产时间</dt><dd>{view?.commissionedOn??'—'}</dd>{scene!=='storage'&&(scenes.includes('solar')||scenes.includes('pv')||view?.solarCapacityKw!=null)&&<><dt>光伏装机容量</dt><dd>{dashboardNumber(view?.solarCapacityKw)} kWp</dd></>}{scene!=='solar'&&(scenes.includes('storage')||view?.panels.some(p=>p.key==='battery')||(view?.ratedPowerKw??0)>0||(view?.capacityKwh??0)>0)&&<><dt>储能装机功率</dt><dd>{dashboardNumber(view?.ratedPowerKw)} kW</dd><dt>储能装机容量</dt><dd>{dashboardNumber(view?.capacityKwh)} kWh</dd></>}</dl></article>
   {scene==='solar'?<StationDashboardSolar supplement={supplement} telemetry={allowed} loading={supplementQuery.loading}/>:<><article className="sdp-card sdp-flow" aria-label="能量流图"><button className="sdp-source" onClick={onSources}>数据来源</button><div className="sdp-graph"><FlowBoundary key={`${station.id}:${scene}`}><Suspense fallback={<Empty text="加载能量流图…"/>}><StationDashboardFlow station={station} rawFlow={rawFlow} directionConvention={convention} metrics={flow} scene={scene} selectedType={selectedTypes[panel?.key??'']} onDeviceSelect={chooseDevice} fallback={<Empty text="3D 不可用，请切换 2D 能流图"/>}/></Suspense></FlowBoundary></div><small className="sdp-flow-timestamp">{typeof supplementRaw?.updatedAt==='string'?supplementRaw.updatedAt:view?.sourceTime??'暂无采样时间'}</small></article>   <article className="sdp-card sdp-metrics"><div className="sdp-panel-tabs" role="tablist" aria-label="设备指标">{panels.map(p=><button key={p.key} role="tab" aria-selected={panel?.key===p.key} onClick={()=>setPanel(p.key)}>{p.label}</button>)}</div>{!allowed?<Empty text={telemetry?'暂无指标数据':'无遥测查看权限'}/>:panel?<StationDashboardMetricPanel panel={panel} batteryState={convention===null?null:rawFlow?.batteryKw==null?view?.batteryState??null:rawFlow.batteryKw>0?'charging':rawFlow.batteryKw<0?'discharging':'idle'}/>:<Empty text="当前场景暂无指标数据"/>}</article></>}
  </div>}
  {scene==='overall'&&<div className="sdp-bottom">
   <article className="sdp-card sdp-equipment"><div className="sdp-card-heading"><h3>场站内设备</h3><button aria-label="查看场站设备" disabled={!canViewDevices} onClick={()=>onDevices(scope?{stationId:station.id,substationId:scope,deviceIds:equipment.flatMap(e=>e.deviceIds)}:undefined)}><ChevronRight size={22}/></button></div><div className="sdp-scope-tabs" role="tablist" aria-label="设备范围"><button role="tab" aria-selected={!scope} onClick={()=>setScope('')}>整站</button>{(substations.data??[]).map(s=><button key={s.id} role="tab" aria-selected={scope===s.id} onClick={()=>setScope(s.id)}>{s.name}</button>)}</div>{scope&&<QueryState {...scoped}/>}<div className="sdp-matrix-scroll">{!canViewDevices?<Empty text="无设备查看权限"/>:types.length?<table className="sdp-matrix"><thead><tr><th>状态</th>{types.map(t=><th key={t}>{dashboardEquipmentNames[t.toLowerCase()]??t}</th>)}</tr></thead><tbody>{statuses.map(s=><tr key={s}><th><i className={`sdp-status ${s}`}/>{statusNames[s]??s}</th>{types.map(t=>{const cell=dashboardEquipmentCell(equipment,t,s,equipmentAlarms),count=cell?.count;return <td key={t}><button disabled={!count||!dashboardDeviceCategory(t)} title={!dashboardDeviceCategory(t)?'此设备类型的列表尚未接入':undefined} onClick={()=>onDevices({stationId:station.id,type:t,status:s,deviceIds:cell?.deviceIds??[],...(scope?{substationId:scope}:{})})}>{count??'—'}</button></td>})}</tr>)}</tbody></table>:!scoped.loading&&<Empty text="暂无已登记设备"/>}</div></article>
   <article className="sdp-card sdp-alarms"><div className="sdp-card-heading"><h3>规则报警</h3><button aria-label="查看规则报警" disabled={!canViewAlarms} onClick={onAlarms}><ChevronRight size={22}/></button></div>{!canViewAlarms||view?.alarmsAvailable===false?<Empty text="无报警查看权限"/>:view?.alarms.length?<><ul>{view.alarms.map(alarm=><li key={alarm.id}><span className={`sdp-alarm-severity ${alarm.severity}`}/><div><strong>{alarm.title}</strong><span>{alarm.deviceName??'—'}</span></div><time>{alarm.occurredAt.replace('T',' ').slice(0,19)}</time></li>)}</ul>{view.alarmTotal!=null&&view.alarmTotal>view.alarms.length&&<button className="sdp-all-alarms" onClick={onAlarms}>查看全部 {view.alarmTotal} 条</button>}</>:<Empty text="暂无规则报警"/>}</article>
  </div>}
  {scene!=='grid'&&<StationDashboardHistory stationId={station.id} view={view} telemetry={allowed} scene={scene} canExport={canExport} canEdit={canEdit} onCaptureChange={historyChanged} initialQuery={{...supplementQuery,stationId:station.id,date:initialDate}}/>}
  {scene==='overall'&&<StationDashboardComposition capture={historyState.capture??(historyState.period==='day'&&historyState.date===initialDate?supplementQuery.data:undefined)} period={historyState.period} date={historyState.date} telemetry={allowed}/>}
  {scene==='solar'&&<SolarStatistics loading={supplementQuery.loading||plansQuery.loading||yearQuery.loading||totalQuery.loading} onDevice={canViewDevices?onDeviceDetails:undefined} supplement={supplement} telemetry={allowed} initialDate={initialDate} canEditPlan={canEdit} onPlan={()=>setPlanOpen(true)}/>}
  {planOpen&&<StationGenerationPlansPanel registerLeaveGuard={registerLeaveGuard} station={station} canEdit={canEdit} onClose={()=>{setPlanOpen(false);setPlanVersion(v=>v+1)}}/>}
 </div>
}
