import { useEffect, useMemo, useState } from "react"
import type { Station } from "@/App"
import type { AuthUser, NavLabel } from "@/auth/roles"
import { DEMO_MODE } from "@/api/client"
import MapView from "./MapView"
import { MAP_REGIONS,inMapRegion } from '@/maps/regions'
import LeftPanel from "./LeftPanel"
import RightPanel from "./RightPanel"
import BottomBar from "./BottomBar"
import StationPopup from "./StationPopup"
import TickerBar from "./TickerBar"
import OverviewDashboard from "./OverviewDashboard"
import StylizedEnergyOverview from './StylizedEnergyOverview'
import {overviewCardNames,overviewPresentationRole} from './overviewCards'
import {useDisplayPreferences} from '@/preferences/PreferencesProvider'
import {useInterfaceTranslation} from '@/i18n/useInterfaceTranslation'

type Props = { stations: Station[]; user: AuthUser; nav: NavLabel[]; immersive: boolean; onExitImmersive: () => void; onOpenStation: (id: string, subNav?: string) => void; onNavigate: (nav: NavLabel) => void; registerLeaveGuard: (guard: null | (() => Promise<boolean>)) => void; requestLeave: () => Promise<boolean> }
export default function OverviewPage({ stations, user, nav, immersive, onExitImmersive, onOpenStation, onNavigate, registerLeaveGuard, requestLeave }: Props) {
  const [view, setView] = useState<"map" | "dashboard">("map")
  const [region, setRegion] = useState("global")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search,setSearch]=useState('')
  const {language}=useDisplayPreferences(),translate=useInterfaceTranslation(stations.map(s=>s.name),language)
  const availableCards=overviewCardNames(user),role=overviewPresentationRole(user)
  const cardKey=`enerlution-overview-cards-v2:${DEMO_MODE?'demo':'api'}:${user.id}:${stations.map(s=>s.id).sort().join(',')}`
  const [chosenCards,setChosenCards]=useState<string[]|null>(null)
  const cards=(chosenCards??availableCards).filter(c=>availableCards.includes(c))
  useEffect(()=>{try{const value=JSON.parse(localStorage.getItem(cardKey)||'null');setChosenCards(Array.isArray(value)&&value.every(c=>typeof c==='string')?value:null)}catch{setChosenCards(null)}},[cardKey])
  const updateCards=(value:string[])=>{localStorage.setItem(cardKey,JSON.stringify(value));setChosenCards(value)}
  const visibleStations = useMemo(() => stations.filter(s => inMapRegion(s,region)&&`${s.name} ${translate(s.name)} ${s.code} ${s.region}`.toLowerCase().includes(search.trim().toLowerCase())), [stations, region,search,translate])
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
    {!immersive && <div className="energy-overview-heading"><h1>能源总览</h1><p>站点运行与能源表现</p></div>}<header className="overview-header">{immersive ? <div className="overview-fullscreen-title"><strong>站点实时总览</strong><span>{visibleStations.length} 个授权站点</span></div> : <div className="overview-view-switch" role="group" aria-label="总览视图"><button aria-label="地图总览" aria-pressed={view === "map"} onClick={async () => { if (await requestLeave()) setView("map") }}>运行总览</button><button aria-pressed={view === "dashboard"} onClick={() => setView("dashboard")}>经营看板</button></div>}{mapToolbar}{immersive && <button className="overview-exit" onClick={onExitImmersive}>← 退出全屏</button>}</header>
    <div className="overview-content" key={view}>
    {view === "dashboard" ? <OverviewDashboard cards={cards} availableCards={availableCards} onUpdateCards={updateCards} region={region} stations={visibleStations} user={user} nav={nav} onNavigate={onNavigate} onOpenStation={onOpenStation} registerLeaveGuard={registerLeaveGuard} /> : !immersive ? <StylizedEnergyOverview role={role} onViewAll={allAlarms} onViewStations={nav.includes("资产与站点") ? () => onNavigate("资产与站点") : undefined} stations={visibleStations} cards={cards} region={region} selected={selected} onSelect={setSelectedId} onOpenStation={onOpenStation} /> : <div className="overview-map">
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
