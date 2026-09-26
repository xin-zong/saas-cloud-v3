import { useState } from "react"
import type { Station } from "@/App"
import { DEMO_MODE } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import { buildOperationsStation, finite, operationsDate, sumKnown } from "@/data/operations"
import { stationsDataNow } from "@/data/dataClock"
import { dispatchStation } from "@/data/stationDispatch"

const completeTotal = (values: (number | null)[]) => values.length && values.every(finite) ? sumKnown(values) : null
const money = (value: number | null) => value === null ? "--" : `¥ ${Math.round(value).toLocaleString("zh-CN")}`
const energy = (value: number | null) => value === null ? "--" : `${value.toFixed(1)} MWh`

export default function OperationsOverviewPage({ stations, onOpenStation, onSchedule, onMarket, onSettlement, onHistory }: {
  stations: Station[]
  onOpenStation: (id: string, tab?: string) => void
  onSchedule?: () => void
  onMarket?: () => void
  onSettlement?: () => void
  onHistory: () => void
}) {
  const { user } = useAuth()
  const [scope, setScope] = useState("")
  const [query, setQuery] = useState("")
  const now = stationsDataNow(stations)
  const today = operationsDate(now)
  const scoped = stations.filter(s => !scope || s.id === scope)
  const allowed = (id: string, permission: string) => DEMO_MODE || hasStationPermission(user, id, permission)
  const rows = scoped.map(station => {
    const row = buildOperationsStation(station, today, now)
    const samples = row.power.filter(p => p.minute <= now.getHours() * 60 + now.getMinutes())
    // Never turn an absent or incomplete interval into measured daily energy.
    const measured = samples.length > 1 && samples.every(p => finite(p.storage))
    const total = (direction: number) => measured ? samples.slice(1).reduce((sum, p, i) =>
      sum + (Math.max(0, direction * samples[i].storage!) + Math.max(0, direction * p.storage!)) / 2 * (p.minute - samples[i].minute) / 60 / 1000, 0) : null
    const state = station.status === "offline" ? "离线" : row.storage === null ? "未知" : row.storage < 0 ? "充电" : row.storage > 0 ? "放电" : "待机"
    const dispatch = allowed(station.id, "strategy.read") ? dispatchStation(station, today, now) : null
    return { ...row, state, charge: total(-1), discharge: total(1), dispatch }
  })
  const states = ["充电", "放电", "待机", "离线", "未知"].map(label => ({label, count: rows.filter(row => row.state === label).length}))
  const attention = rows.filter(row => row.dispatch && !["正常", "待执行", "建设中"].includes(row.dispatch.status))
  const revenue = rows.filter(row => allowed(row.station.id, "revenue.read"))
  return <div className="ops-overview ops-current-overview">
    <section className="ops-current-toolbar" aria-label="运营范围与时间">
      <select aria-label="运营站点范围" value={scope} onChange={e=>setScope(e.target.value)}>
        <option value="">全部站点 · {stations.length}</option>
        {stations.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}
      </select>
      <span>今日 · {today}</span>
      {onSettlement && <button className="operations-button" onClick={onSettlement}>收益核算 →</button>}
    </section>
    <section className="ops-current-kpis" aria-label="运营指标">
      {[["今日收益",money(completeTotal(revenue.map(row=>row.day.total)))],["本月收益",money(completeTotal(revenue.map(row=>row.month.total)))],["今日充电量",energy(completeTotal(rows.map(row=>row.charge)))],["今日放电量",energy(completeTotal(rows.map(row=>row.discharge)))]].map(([label,value],i)=><div key={label}><span>{label}</span><strong data-testid={i===0?"operations-day-revenue":undefined}>{value}</strong></div>)}
    </section>
    <div className="ops-current-middle">
      <section className="ops-panel"><h2>站点运行分布</h2><div className="ops-state-bar" aria-hidden="true">{states.map((s,i)=><i key={s.label} style={{flex:s.count,background:["#4a88a4","#19776d","#9baeb4","#c7ced1","#edf0f2"][i]}} />)}</div><div className="ops-state-counts">{states.filter(s=>s.label!=="未知"||s.count).map(s=><div key={s.label}><span>{s.label}</span><strong>{s.count} 站</strong></div>)}</div></section>
      <section className="ops-panel ops-action-panel"><h2>需处理事项 · {attention.length}</h2>
        {attention.length ? attention.slice(0,3).map(row=><div className="ops-action-row" key={row.station.id}><div><strong>{row.station.name} · {row.dispatch!.status}</strong><small>以已接入计划和采样为准</small></div>{onSchedule && <button className="operations-button" onClick={onSchedule}>查看策略 →</button>}</div>) : <p className="ops-quiet-empty">暂无已接入的待处理事项</p>}
        {onMarket && <button className="operations-link" onClick={onMarket}>市场响应 →</button>}
      </section>
    </div>
    <section className="ops-panel ops-detail" aria-label="站点运营表现"><div className="ops-panel-heading"><h2>站点运营表现</h2><span>{rows.length} 个站点</span><input type="search" aria-label="搜索经营站点" placeholder="搜索站点" value={query} onChange={e=>setQuery(e.target.value)} /></div>
      <div className="operations-table-scroll"><table><thead><tr>{["站点","当前模式","运行状态","今日充电量","今日放电量","今日收益","策略 / 响应事项"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.filter(row=>row.station.name.includes(query.trim())).map(row=><tr key={row.station.id}><td>{allowed(row.station.id,"asset.read")?<button className="operations-link ops-station-name" onClick={()=>onOpenStation(row.station.id)}>{row.station.name}</button>:row.station.name}</td><td>{row.station.mode || "--"}</td><td>{row.state}</td><td>{energy(row.charge)}</td><td>{energy(row.discharge)}</td><td>{allowed(row.station.id,"revenue.read")?money(row.day.total):"--"}</td><td>{row.dispatch&&onSchedule?<button className="operations-link" onClick={onSchedule}>{row.dispatch.status} →</button>:"—"}</td></tr>)}</tbody></table></div>
      {!rows.length && <div className="operations-empty">暂无授权站点</div>}
    </section>
    <div className="ops-history-actions"><button className="operations-link" onClick={onHistory}>收益趋势与经营明细 →</button><span>缺少采样、执行回执或收益账目时显示未知。</span></div>
  </div>
}
