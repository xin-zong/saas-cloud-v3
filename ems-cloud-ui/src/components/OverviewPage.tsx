import { useEffect, useMemo, useState } from "react"
import type { Station } from "@/App"
import type { AuthUser, NavLabel } from "@/auth/roles"
import { DEMO_MODE } from "@/api/client"
import MapView from "./MapView"
import LeftPanel from "./LeftPanel"
import RightPanel from "./RightPanel"
import BottomBar from "./BottomBar"
import StationPopup from "./StationPopup"
import TickerBar from "./TickerBar"
import OverviewDashboard from "./OverviewDashboard"

type Props = { stations: Station[]; user: AuthUser; nav: NavLabel[]; immersive: boolean; onExitImmersive: () => void; onOpenStation: (id: string, subNav?: string) => void; onNavigate: (nav: NavLabel) => void; registerLeaveGuard: (guard: null | (() => Promise<boolean>)) => void; requestLeave: () => Promise<boolean> }
export default function OverviewPage({ stations, user, nav, immersive, onExitImmersive, onOpenStation, onNavigate, registerLeaveGuard, requestLeave }: Props) {
  const [view, setView] = useState<"map" | "dashboard">("map")
  const [region, setRegion] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const visibleStations = useMemo(() => stations.filter(s => !region || s.region === region), [stations, region])
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
  const mapToolbar = <div className="overview-map-toolbar"><select aria-label="总览区域" value={region} onChange={e => { setRegion(e.target.value); setSelectedId(null) }}><option value="">全部区域</option>{[...new Set(stations.map(s => s.region).filter(Boolean))].map(r => <option key={r}>{r}</option>)}</select><select aria-label="选择总览站点" value={selected?.id ?? ""} onChange={e => setSelectedId(e.target.value || null)}><option value="">选择站点</option>{visibleStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
  return <section className="overview-workspace" data-overview-view={view} data-immersive={immersive}>
    <header className="overview-header">{immersive ? <div className="overview-fullscreen-title"><strong>站点实时总览</strong><span>{visibleStations.length} 个授权站点</span></div> : <div className="overview-view-switch" role="group" aria-label="总览视图"><button aria-pressed={view === "map"} onClick={async () => { if (await requestLeave()) setView("map") }}>地图总览</button><button aria-pressed={view === "dashboard"} onClick={() => setView("dashboard")}>经营看板</button></div>}{view === "map" && mapToolbar}{immersive && <button className="overview-exit" onClick={onExitImmersive}>← 退出全屏</button>}</header>
    <div className="overview-content" key={view}>
    {view === "dashboard" ? <OverviewDashboard stations={stations} user={user} nav={nav} onNavigate={onNavigate} onOpenStation={onOpenStation} registerLeaveGuard={registerLeaveGuard} /> : <div className="overview-map">
      <MapView stations={visibleStations} selectedStation={selected} onSelectStation={s => setSelectedId(s.id)} region={region} />
      <div className="overview-ticker"><TickerBar stations={visibleStations} onSelectStation={s => setSelectedId(s.id)} role={user.role} /></div>
      <div className="overview-left"><LeftPanel stations={visibleStations} role={user.role} onViewStations={nav.includes("资产与站点") ? () => { onExitImmersive(); onNavigate("资产与站点") } : undefined} />{immersive && livePanel}</div>
      <div className="overview-right"><RightPanel stations={visibleStations} role={user.role} />{immersive && eventsPanel}</div>
      {selected && <StationPopup key={selected.id} station={selected} onClose={() => setSelectedId(null)} onOpenStation={id => { onExitImmersive(); onOpenStation(id) }} />}
      {!visibleStations.length && <div className="overview-map-empty" role="status">当前范围暂无授权站点</div>}
      <div className="overview-bottom"><BottomBar stations={visibleStations} role={user.role} onSelectStation={s => setSelectedId(s.id)} onViewAll={allAlarms} /></div>

    </div>}
    </div>
  </section>
}
