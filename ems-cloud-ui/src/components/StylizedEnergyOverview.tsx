import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { Station } from '@/App'
import { DEMO_MODE } from '@/api/client'
import { buildStorageTrend, summarizeTrend } from '@/data/stationMetrics'
import MapView from './MapView'
import StationPopup from './StationPopup'
import LeftPanel from './LeftPanel'
import RightPanel from './RightPanel'
import BottomBar from './BottomBar'
import type {UserRole} from '@/auth/roles'
import {overviewCommunication} from './overviewCommunication'
import TickerBar from './TickerBar'

type Props = { role: UserRole; onViewAll: () => void; onViewStations?: () => void; stations: Station[]; cards: string[]; region: string; selected: Station | null; onSelect: (id: string | null) => void; onOpenStation: (id: string) => void }
export default function StylizedEnergyOverview({ stations, cards, region, selected, onSelect, onOpenStation, role, onViewAll, onViewStations }: Props) {
  const has = (name: string) => cards.includes(name)
  const communication=overviewCommunication(stations,DEMO_MODE)
  const primaryCards=['站点运营概况','在线运行容量','储能充放趋势','收益概览','社会与环境效益','异常与告警实时监控']
  const supplementaryCards=cards.filter(card=>!primaryCards.includes(card))
  const trend = DEMO_MODE ? buildStorageTrend(stations, 'today') : []
  const totals = summarizeTrend(trend)
  const total = (key: 'ratedPower' | 'storageCapacity' | 'pvOutput' | 'generator') => stations.length && stations.every(s => Number.isFinite(s[key])) ? stations.reduce((n, s) => n + s[key], 0) : null
  const number = (n: number | null, unit = '') => n === null ? '—' : `${n.toFixed(2)}${unit}`
  const events = stations.flatMap(station => station.alerts.map(alert => ({ ...alert, station }))).sort((a, b) => Number(b.level === 'critical') - Number(a.level === 'critical')).slice(0, 3)
  const revenue = stations.flatMap(s => s.revenueHistory ?? []).filter(p => typeof p.amount === 'number' && Number.isFinite(p.amount))
  return <div className="energy-overview" data-figma-node="3678:956">
    <div className="overview-ticker energy-overview-ticker"><TickerBar stations={stations} role={role} onSelectStation={station=>onSelect(station.id)}/></div>
    {has('站点运营概况') && <div className="energy-overview-metrics" data-overview-card="站点运营概况">
      <div><span>站点总数</span><strong>{stations.length}</strong><small>当前授权站点范围</small></div>
      <div><span>在线站点</span><strong>{communication.online}</strong><small>故障 {communication.fault} · 离线 {communication.offline} · 建设中 {communication.building} · 未知 {communication.unknown}</small></div>
      <div><span>放电总量</span><strong>{DEMO_MODE && trend.length ? totals.discharge.toFixed(2) : '—'}</strong><small>{DEMO_MODE && trend.length ? `MWh · 充电总量 ${totals.charge.toFixed(2)} MWh` : '暂无已连接的电量统计'}</small></div>
    </div>}
    <div className="energy-overview-main">
      <section className="energy-overview-map" aria-label="站点分布">
        <MapView compact stations={stations} selectedStation={selected} onSelectStation={s => onSelect(s.id)} region={region} />
        <span className="energy-overview-map-label">站点分布</span>
        <div className="energy-overview-map-legend">{[['在线','imgEllipse13'],['故障','imgEllipse12'],['离线','imgEllipse14'],['建设中','imgEllipse15']].map(([label,asset]) => <span key={label}><img src={`/figma/overview/map/${asset}.svg`} alt=""/>{label}</span>)}</div>
        {!stations.length && <p className="energy-overview-map-empty">当前范围暂无授权站点</p>}
        {selected && <StationPopup key={selected.id} station={selected} onClose={() => onSelect(null)} onOpenStation={onOpenStation} />}
      </section>
      {has('异常与告警实时监控') && <section className="energy-overview-alerts" data-overview-card="异常与告警实时监控"><h2>待关注告警</h2><p>异常与告警实时监控</p>{events.length ? events.map((e, i) => <button key={`${e.station.id}-${i}`} onClick={() => onSelect(e.station.id)}><span className={e.level}>{e.level === 'critical' ? '严重' : '警告'}</span><div><strong>{e.station.name}</strong><p>{e.msg}</p><time>{e.time}</time></div></button>) : <div className="energy-overview-empty">暂无活动告警</div>}</section>}
    </div>
    {has('储能充放趋势') && <section className="energy-overview-trend" data-overview-card="储能充放趋势"><header><h2>储能充放趋势 <small>24h</small></h2><span><i />充电 <i />放电</span></header>{trend.length ? <ResponsiveContainer width="100%" height={250}><BarChart data={trend}><CartesianGrid vertical={false} stroke="var(--ui-border)"/><XAxis dataKey="h" axisLine={false} tickLine={false} tick={{fill:'var(--ui-muted)',fontSize:12}}/><Tooltip/><Bar dataKey="charge" name="充电" fill="var(--ui-chart-secondary)" radius={[2,2,0,0]}/><Bar dataKey="discharge" name="放电" fill="var(--ui-primary)" radius={[2,2,0,0]}/></BarChart></ResponsiveContainer> : <div className="energy-overview-chart-empty">暂无已连接的充放电趋势数据</div>}</section>}
    <div className="energy-overview-bottom">
      {has('在线运行容量') && <section data-overview-card="在线运行容量"><h2>运行容量</h2>{[['额定功率', number(total('ratedPower'), ' kW')], ['光伏出力', number(total('pvOutput'), ' MW')], ['储能容量', number(total('storageCapacity'), ' MWh')]].map(([label,value]) => <div className="energy-overview-reading" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>}
      {has('收益概览') && <section data-overview-card="收益概览"><h2>收益与能源构成</h2><div className="energy-overview-reading"><span>已连接收益记录合计</span><strong>{revenue.length ? `¥${revenue.reduce((n,p) => n + p.amount!,0).toFixed(2)}` : '—'}</strong></div>{[['光伏出力', number(total('pvOutput'), ' MW')], ['发电机出力', number(total('generator'), ' MW')]].map(([label,value]) => <div className="energy-overview-reading" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>}
      {has('社会与环境效益') && <section data-overview-card="社会与环境效益"><h2>环境效益与运行效率</h2>{['CO₂ 减排', '标准煤折算', '等效植树', '储能充放效率'].map(label => <div className="energy-overview-reading" key={label}><span>{label}</span><strong>—</strong></div>)}</section>}
    </div>
    {supplementaryCards.length > 0 && <div className="energy-overview-role-cards"><LeftPanel stations={stations} role={role} visibleCards={supplementaryCards} onViewStations={onViewStations}/><RightPanel stations={stations} role={role} visibleCards={supplementaryCards}/><BottomBar stations={stations} role={role} visibleCards={supplementaryCards} onSelectStation={station=>onSelect(station.id)} onViewAll={onViewAll}/></div>}
  </div>
}
