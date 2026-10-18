import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Station } from "@/App"
import type { AuthUser, NavLabel } from "@/auth/roles"
import MonitorTemplatesPanel from "./MonitorTemplatesPanel"
import { Button } from "./ui/Workspace"
import { loadMonitorTemplates, selectMonitorTemplate, type MonitorConfiguration } from "@/api/monitorTemplates"
import { DEMO_MODE } from "@/api/client"
import MapView from "./MapView"
import { MAP_REGIONS,inMapRegion } from '@/maps/regions'
import LeftPanel from "./LeftPanel"
import RightPanel from "./RightPanel"
import BottomBar from "./BottomBar"
import StationPopup from "./StationPopup"
import TickerBar from "./TickerBar"
import OverviewDashboard from "./OverviewDashboard"
import {overviewCardNames,overviewPresentationRole} from './overviewCards'
import {useDisplayPreferences} from '@/preferences/PreferencesProvider'
import {useInterfaceTranslation} from '@/i18n/useInterfaceTranslation'
import {loadMonitorStations,loadMonitorLayout,saveMonitorLayout,defaultMonitorLayout,type MonitorStation,type MonitorLayout,type MonitorWidget} from '@/api/monitor'

import MonitorOverviewPage from './MonitorOverviewPage'
import type {WorkspaceQuery} from '@/api/monitorWorkspace'

type Props = { stations: Station[]; user: AuthUser; nav: NavLabel[]; immersive: boolean; onExitImmersive: () => void; onOpenStation: (id: string, subNav?: string) => void; onOpenSites?: (filters:WorkspaceQuery)=>void; onNavigate: (nav: NavLabel) => void; registerLeaveGuard: (guard: null | (() => Promise<boolean>)) => void; requestLeave: () => Promise<boolean> }
export default function OverviewPage({ stations, user, nav, immersive, onExitImmersive, onOpenStation, onOpenSites, onNavigate, registerLeaveGuard, requestLeave }: Props) {
  const layoutGuard = useRef<null | (() => Promise<boolean>)>(null), templateGuard = useRef<null | (() => Promise<boolean>)>(null)
  const registerLayoutGuard = useCallback((guard: null | (() => Promise<boolean>)) => { layoutGuard.current = guard }, [])
  const registerTemplateGuard = useCallback((guard: null | (() => Promise<boolean>)) => { templateGuard.current = guard }, [])
  useEffect(() => { registerLeaveGuard(() => templateGuard.current?.() ?? layoutGuard.current?.() ?? Promise.resolve(true)); return () => registerLeaveGuard(null) }, [registerLeaveGuard])
  const [view, setView] = useState<"map" | "dashboard" | "monitor">(DEMO_MODE?"map":"monitor")
  const [region, setRegion] = useState("global")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search,setSearch]=useState('')
  const [scene,setScene]=useState('all'),[communication,setCommunication]=useState('all'),[monitorStations,setMonitorStations]=useState<MonitorStation[]>([]),[monitorError,setMonitorError]=useState(''),[monitorLoading,setMonitorLoading]=useState(false)
  const [layout,setLayout]=useState<MonitorLayout>({widgets:[],version:0}),[layoutLoaded,setLayoutLoaded]=useState(false)
  const {language}=useDisplayPreferences(),translate=useInterfaceTranslation(stations.map(s=>s.name),language)
  const availableCards=overviewCardNames(user),role=overviewPresentationRole(user)
  const cardKey=`enerlution-overview-cards-v2:${DEMO_MODE?'demo':'api'}:${user.id}:${stations.map(s=>s.id).sort().join(',')}`
  const [chosenCards,setChosenCards]=useState<string[]|null>(null)
  const [configuration,setConfiguration]=useState<MonitorConfiguration>({items:[],selectedId:null})
  const [templatesOpen,setTemplatesOpen]=useState(false),[configurationError,setConfigurationError]=useState(''),[configurationBusy,setConfigurationBusy]=useState(false),[configurationLoaded,setConfigurationLoaded]=useState(false)
  const activeTemplate=configuration.items.find(t=>t.id===configuration.selectedId)
  const cards=(DEMO_MODE ? chosenCards??availableCards : layoutLoaded&&layout.widgets?.length?layout.widgets.map(w=>w.card):activeTemplate?.cards??availableCards).filter(c=>availableCards.includes(c))
  useEffect(()=>{if(DEMO_MODE)return;const controller=new AbortController();setMonitorStations([]);setMonitorLoading(true);setMonitorError('');loadMonitorStations(scene,communication,search,controller.signal).then(value=>{if(!controller.signal.aborted)setMonitorStations(value)}).catch(e=>{if(!controller.signal.aborted)setMonitorError(e.message)}).finally(()=>{if(!controller.signal.aborted)setMonitorLoading(false)});return()=>controller.abort()},[scene,communication,search,user.id])
  useEffect(()=>{if(DEMO_MODE)return;const controller=new AbortController();setLayoutLoaded(false);setLayout({widgets:[],version:0});if(!configurationLoaded)return;loadMonitorLayout(activeTemplate?.id??null,controller.signal).then(value=>{if(!value||!Array.isArray(value.widgets)||typeof value.version!=='number')throw new Error('布局服务未返回有效配置');if(!controller.signal.aborted){setLayout(value);setLayoutLoaded(true)}}).catch(e=>{if(!controller.signal.aborted)setConfigurationError(e.message)});return()=>controller.abort()},[activeTemplate?.id,configurationLoaded,user.id])
  const reloadConfiguration=async()=>{const data=await loadMonitorTemplates();setConfiguration(data);setConfigurationLoaded(true);return data}
  useEffect(()=>{let current=true;setConfiguration({items:[],selectedId:null});setConfigurationLoaded(false);setConfigurationError('');
    if(DEMO_MODE){try{const value=JSON.parse(localStorage.getItem(cardKey)||'null');setChosenCards(Array.isArray(value)&&value.every(c=>typeof c==='string')?value:null)}catch{setChosenCards(null)};return}
    loadMonitorTemplates().then(data=>{if(current){setConfiguration(data);setConfigurationLoaded(true)}}).catch(e=>{if(current)setConfigurationError(e.message)})
    return()=>{current=false}
  },[user.id,cardKey])
  const chooseTemplate=async(id:string|null)=>{await selectMonitorTemplate(id);await reloadConfiguration()}
  const updateCards=async(value:string[],targetId:string|null,widgets?:MonitorWidget[])=>{
    const permitted=value.filter(c=>availableCards.includes(c))
    if(DEMO_MODE){localStorage.setItem(cardKey,JSON.stringify(permitted));setChosenCards(permitted);return}
    if(!configurationLoaded)throw new Error('模板尚未读取，请刷新后重试')
    if(targetId!==configuration.selectedId)throw new Error('当前选中模板已变化，未保存任何卡片。草稿已保留，请取消后重新选择原模板再编辑')
    if(!layoutLoaded)throw new Error('页面布局尚未读取，请刷新后重试')
    const updated=await saveMonitorLayout(targetId,{widgets:widgets??defaultMonitorLayout(permitted),version:layout.version})
    setLayout(updated)
  }
  const visibleStations = useMemo(() => stations.filter(s => (DEMO_MODE||monitorStations.some(r=>r.id===s.id))&&inMapRegion(s,region)&&`${s.name} ${translate(s.name)} ${s.code} ${s.region}`.toLowerCase().includes(search.trim().toLowerCase())), [stations, region,search,translate,monitorStations])
  const selected = visibleStations.find(s => s.id === selectedId) ?? null
  const events = visibleStations.flatMap(s => s.alerts.map(alert => ({ ...alert, station: s }))).slice(0, 5)
  useEffect(() => {
    if (!immersive) return
    setView("map")
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onExitImmersive() }
    window.addEventListener("keydown", escape)
    return () => window.removeEventListener("keydown", escape)
  }, [immersive, onExitImmersive])
  const allAlarms = () => {
    onExitImmersive()
    if (nav.includes("运维中心")) onNavigate("运维中心")
    else { const target = visibleStations.find(s => s.alerts.length) ?? visibleStations[0]; if (target) onOpenStation(target.id, "告警信息") }
  }
  const eventsPanel = <section className="overview-events"><h2>实时事件日志 <small>{events.length} 条</small></h2>{!DEMO_MODE && <p>当前告警快照 · 实时事件流未接通</p>}{events.length ? events.map((e, i) => <button key={i} onClick={() => setSelectedId(e.station.id)}><i className={e.level} /><span>{e.station.name} · {e.msg}</span><time>{e.time}</time></button>) : <p>暂无活动事件</p>}</section>
  const livePanel = <div className="overview-live-data"><div><span>电网频率</span><b>—</b></div><div><span>总有功功率</span><b>{visibleStations.length && visibleStations.every(s => Number.isFinite(s.activePower)) ? visibleStations.reduce((n, s) => n + s.activePower, 0).toFixed(1) + " kW" : "—"}</b></div><div><span>碳减排速率</span><b>—</b></div></div>
  const mapToolbar = <div className="overview-map-toolbar"><input type="search" aria-label="模糊搜索总览电站" placeholder="搜索电站名称 / 编码" value={search} onChange={e=>{setSearch(e.target.value);setSelectedId(null)}}/><select aria-label="总览区域" value={region} onChange={e => { setRegion(e.target.value); setSelectedId(null) }}>{MAP_REGIONS.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}{[...new Set(stations.map(s => s.region).filter(Boolean))].map(r => <option key={r}>{r}</option>)}</select><select aria-label="选择总览站点" value={selected?.id ?? ""} onChange={e => setSelectedId(e.target.value || null)}><option value="">选择站点</option>{visibleStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
  return <section className="overview-workspace" data-overview-view={view} data-immersive={immersive}>
    <header className="overview-header">{immersive ? <div className="overview-fullscreen-title"><strong>站点实时总览</strong><span>{visibleStations.length} 个授权站点</span></div> : <div className="overview-view-switch" role="group" aria-label="总览视图">{!DEMO_MODE&&<button aria-pressed={view==='monitor'} onClick={async()=>{if(await requestLeave())setView('monitor')}}>数据看板</button>}<button aria-pressed={view === "map"} onClick={async () => { if (await requestLeave()) setView("map") }}>地图总览</button><button aria-pressed={view === "dashboard"} onClick={async()=>{if(await requestLeave())setView("dashboard")}}>经营看板</button></div>}{view!=='monitor'&&mapToolbar}{immersive && <button className="overview-exit" onClick={onExitImmersive}>← 退出全屏</button>}</header>
    {!DEMO_MODE && !immersive && view!=='monitor' && <div className="configuration-toolbar">
      <label>业务场景 <select aria-label="监控业务场景" value={scene} onChange={e=>setScene(e.target.value)}><option value="all">全部场景</option><option value="PV">光伏</option><option value="BESS">储能</option><option value="Hybrid">光储混合</option><option value="Wind">风电</option><option value="Diesel">柴油发电</option></select></label>
      <label>通信状态 <select aria-label="监控通信状态" value={communication} onChange={e=>setCommunication(e.target.value)}><option value="all">全部通信状态</option><option value="online">在线</option><option value="offline">离线</option><option value="unknown">未取得心跳</option></select></label>
      {monitorLoading&&<p role="status">正在读取授权监控范围…</p>}{monitorError&&<p role="alert">{monitorError}</p>}
      <label>看板模板 <select aria-label="看板模板" disabled={configurationBusy || !configurationLoaded} value={configuration.selectedId??''} onChange={async e=>{const id=e.target.value||null;if(!await requestLeave())return;setConfigurationBusy(true);setConfigurationError('');try{await chooseTemplate(id)}catch(error){setConfigurationError((error as Error).message)}finally{setConfigurationBusy(false)}}}><option value="">默认卡片</option>{configuration.items.map(t=><option key={t.id} value={t.id}>{t.pinned?'★ ':''}{t.name}</option>)}</select></label>
      <Button disabled={configurationBusy || !configurationLoaded} onClick={async()=>{if(await requestLeave())setTemplatesOpen(true)}}>私人看板模板</Button>
      <Button disabled={configurationBusy} onClick={async()=>{if(!await requestLeave())return;setConfigurationBusy(true);try{await reloadConfiguration();setConfigurationError('')}catch(e){setConfigurationError((e as Error).message)}finally{setConfigurationBusy(false)}}}>刷新看板模板</Button>
      {configurationError&&<p role="alert">{configurationError}</p>}
    </div>}
    {templatesOpen && <MonitorTemplatesPanel registerLeaveGuard={registerTemplateGuard} configuration={configuration} cards={cards} reload={reloadConfiguration} select={chooseTemplate} onClose={()=>setTemplatesOpen(false)}/>}
    <div className={'overview-content'+(view==='monitor'?' monitor-overview-entry':'')} key={view}>
    {view==='monitor'?<MonitorOverviewPage user={user} onOpenStation={onOpenStation} onOpenSites={filters=>{if(onOpenSites)onOpenSites(filters);else onNavigate('资产与站点')}} registerLeaveGuard={registerLayoutGuard}/>:view === "dashboard" ? <OverviewDashboard widgets={layout.widgets} monitorStations={monitorStations.filter(r=>visibleStations.some(s=>s.id===r.id))} layoutTargetId={activeTemplate?.id??null} onRefreshTemplates={async()=>{await reloadConfiguration();const value=await loadMonitorLayout(activeTemplate?.id??null);setLayout(value);setLayoutLoaded(true)}} cards={cards} availableCards={availableCards} onUpdateCards={updateCards} region={region} stations={visibleStations} user={user} nav={nav} onNavigate={onNavigate} onOpenStation={onOpenStation} registerLeaveGuard={registerLayoutGuard} /> : <div className="overview-map">
      <MapView stations={visibleStations} selectedStation={selected} onSelectStation={s => setSelectedId(s.id)} region={region} />
      <div className="overview-ticker"><TickerBar stations={visibleStations} onSelectStation={s => setSelectedId(s.id)} role={role} /></div>
      <div className="overview-left"><LeftPanel visibleCards={cards} stations={visibleStations} role={role} onViewStations={nav.includes("资产与站点") ? () => { onExitImmersive(); onNavigate("资产与站点") } : undefined} />{immersive && livePanel}</div>
      <div className="overview-right"><RightPanel visibleCards={cards} stations={visibleStations} role={role} />{immersive && eventsPanel}</div>
      {selected && <StationPopup key={selected.id} station={selected} onClose={() => setSelectedId(null)} onOpenStation={id => { onExitImmersive(); onOpenStation(id) }} />}
      {!visibleStations.length && <div className="overview-map-empty" role="status">当前范围暂无授权站点</div>}
      <div className="overview-bottom"><BottomBar visibleCards={cards} stations={visibleStations} role={role} onSelectStation={s => setSelectedId(s.id)} onViewAll={allAlarms} /></div>

    </div>}
    </div>
  </section>
}
