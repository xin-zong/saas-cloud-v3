import { useMemo, useState } from "react"
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, Bar, Cell } from "recharts"
import { DEMO_MODE } from "@/api/client"
import type { Station } from "@/App"
import { executionQuality } from "@/data/operationsExecution"
import { operationsDate } from "@/data/operations"

const number = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "--" : value.toLocaleString("zh-CN",{maximumFractionDigits:2})
export default function OperationsExecutionQuality({stations, date, now, onBack, onTools}: {
  stations:Station[]; date:string; now:Date; onBack:()=>void; onTools:(id:string)=>void
}) {
  const [start,setStart] = useState(date), [end,setEnd] = useState(date)
  const result = useMemo(() => {
    try { return {model:executionQuality(stations,start,end,now),error:""} }
    catch (error) { return {model:null,error:(error as Error).message} }
  },[stations,start,end,now])
  const model = result.model
  function range(days:number) { const from=new Date(`${end}T12:00:00`);from.setDate(from.getDate()-days+1);if(Number.isFinite(from.getTime()))setStart(operationsDate(from)) }
  return <div className="dispatch-page ops-execution-quality">
    <div className="dispatch-toolbar"><button className="operations-button" onClick={onBack}>返回策略执行</button><label>开始 <input aria-label="执行开始日期" type="date" value={start} onChange={e=>setStart(e.target.value)} /></label><label>结束 <input aria-label="执行结束日期" type="date" value={end} onChange={e=>setEnd(e.target.value)} /></label>{[1,7,30].map(days=><button key={days} className="operations-button" onClick={()=>range(days)}>{days===1?"24H":`${days}D`}</button>)}</div>
    {result.error && <p role="alert">{result.error}</p>}
    {model && <><div className="ops-execution-grid">
      <section className="dispatch-surface"><h2>组合计划与实际执行</h2><p className="market-boundary">{DEMO_MODE?"演示数据 · ":"已接入数据 · "}全部所选站点 · 15 分钟采样 · 左轴 kW / 右轴 kWh；缺少任一站点数据时保留缺口</p>
        <div className="ops-execution-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={model.points}><CartesianGrid vertical={false} stroke="#e6eaec"/><XAxis dataKey="label" minTickGap={55}/><YAxis width={60}/><YAxis yAxisId="energy" orientation="right" width={60}/><Tooltip/><Legend/><Line isAnimationActive={false} dataKey="planned" name="计划功率" stroke="#216a57" dot={false}/><Line isAnimationActive={false} dataKey="actual" name="实际功率" stroke="#315f89" dot={false}/><Bar isAnimationActive={false} dataKey="delta" name="功率偏差" fill="#b98053">{model.points.map((point,index)=><Cell key={index} fill={(point.delta??0)>=0?"#216a57":"#a84246"}/>)}</Bar><Line isAnimationActive={false} yAxisId="energy" dataKey="cumulative" name="已匹配累计偏差" stroke="#9876a8" dot={false}/></ComposedChart></ResponsiveContainer></div>
        <div className="ops-execution-metrics"><div data-testid="execution-mae">MAE<strong>{number(model.mae)} kW</strong></div><div>RMSE<strong>{number(model.rmse)} kW</strong></div><div>已匹配累计偏差<strong>{number(model.energy)} kWh</strong></div><div>采样覆盖率<strong>{number(model.coverage)}%</strong></div></div>
      </section>
      <section className="dispatch-surface"><h2>当前调度状态</h2><div className="ops-state-counts"><div data-testid="execution-coverage"><span>期间有计划站点</span><strong>{model.plannedStations} / {stations.length}</strong></div><div><span>期末需关注站点</span><strong>{model.rows.filter(row=>!["正常","待执行"].includes(row.status)).length}</strong></div></div><div className="ops-execution-attention"><strong>最大已观测组合偏差</strong><p>{model.worst?`${model.worst.label} · ${number(model.worst.delta)} kW`:"暂无完整组合观测"}</p><p>设备降额、限电和人工操作的归因证据尚未接入，不能推断原因。</p></div><p className="market-boundary">覆盖率按已到时段计算；累计值仅覆盖匹配采样，不代表完整周期结算。</p></section>
    </div><section className="dispatch-surface"><h2>跨站执行明细</h2><p className="market-boundary">{end} 期末观测；未来日期仅展示计划，实际值未知</p><div className="operations-table-scroll"><table><thead><tr>{["站点 / 版本","目标 kW","实际 kW","偏差 kW / %","状态","操作"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{model.rows.map(row=><tr key={row.station.id}><td>{row.station.name}<small className="ops-execution-version">{row.version}</small></td><td>{number(row.current.planned)}</td><td>{number(row.current.actual)}</td><td>{number(row.current.delta)} / {number(row.percent)}%</td><td>{row.status}</td><td><button className="operations-link" onClick={()=>onTools(row.station.id)}>偏差与交接</button></td></tr>)}</tbody></table></div>{!stations.length&&<div className="operations-empty">暂无授权站点</div>}</section></>}
  </div>
}
