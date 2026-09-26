import { useState } from "react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { Station } from "@/App"
import { DEMO_MODE } from "@/api/client"
import { operationsDate, minuteLabel, sumKnown } from "@/data/operations"
import { stationsDataNow } from "@/data/dataClock"
import { marketStation, marketServices, marketTimeline, QUALIFICATION_NAMES, MARKET_KINDS } from "@/data/stationMarket"

export default function OperationsMarketResources({stations,onBack}:{stations:Station[];onBack:()=>void}) {
  const now=stationsDataNow(stations)
  const [date,setDate]=useState(operationsDate(now))
  // These resource observations are only available in the demo model; API service
  // records and qualifications remain in ApiMarketPage and are not invitations.
  const rows=DEMO_MODE?stations.map(s=>marketStation(s,date,now)):[]
  const services=marketServices(rows),timeline=marketTimeline(rows,services,date,now)
  const kw=(v:number|null)=>v===null?"--":`${v.toLocaleString()} kW`
  return <div className="market-page"><div className="market-toolbar"><button className="operations-button" onClick={onBack}>返回市场响应</button><label>服务日 <input aria-label="资源服务日" type="date" value={date} onChange={e=>setDate(e.target.value)} /></label></div>
    <p className="market-boundary">{DEMO_MODE?"演示资源快照，仅供本地查看。":"市场价格、实时可用能力及交付采样接口尚未接通。已有服务资格与内部草稿请返回市场响应后打开市场服务。"}</p>
    <section className="ops-current-kpis">{[["今日服务",rows.length?`${services.length} 项`:"--"],["已承诺能力",kw(sumKnown(services.map(s=>s.capacity)))],["当前可用能力",kw(sumKnown(rows.map(r=>r.capacity?.up??null)))],["预计今日收益","--"]].map(([title,value])=><div key={title}><span>{title}</span><strong>{value}</strong></div>)}</section>
    <section className="market-surface"><h2>今日价格、承诺与实际交付</h2>{([['price','市场价格（元 / MWh）'],['actual','实际交付 / 承诺（kW）']] as const).map(([key,title])=><div key={key}><p>{title}</p><div className="market-delivery-chart">{timeline.some(p=>p[key]!==null)?<ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={timeline}><CartesianGrid vertical={false} stroke="#e6eaec"/><XAxis dataKey="minute" tickFormatter={minuteLabel} tick={{fontSize:11}}/><YAxis tick={{fontSize:11}}/><Tooltip labelFormatter={v=>minuteLabel(Number(v))}/><Line dataKey={key} stroke={key==='price'?'#477fa5':'#19776d'} dot={false} isAnimationActive={false}/>{key==='actual'&&<Line dataKey="committed" stroke="#477fa5" strokeDasharray="4 4" dot={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer>:<div className="operations-empty">暂无{title}数据</div>}</div></div>)}</section>
    <section className="market-surface"><h2>可参与站点与资源资格</h2><div className="operations-table-scroll"><table><thead><tr>{["站点","资格","可上调","可下调","可持续时间","当前占用","限制原因"].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{stations.map(s=>{const row=rows.find(r=>r.station.id===s.id);return <tr key={s.id}><td>{s.name}</td><td>{row?.qualifications.map(q=>`${MARKET_KINDS[q.kind]} · ${QUALIFICATION_NAMES[q.status]}`).join(' / ')||"参见市场服务资格"}</td><td>{kw(row?.capacity?.up??null)}</td><td>{kw(row?.capacity?.down??null)}</td><td>{row?.capacity?.durationHours??"--"}</td><td>{kw(row?.capacity?.occupied??null)}</td><td>{row?.capacity?.constraint||"能力检测未接通"}</td></tr>})}</tbody></table></div>{!stations.length&&<div className="operations-empty">暂无授权站点</div>}</section>
  </div>
}
