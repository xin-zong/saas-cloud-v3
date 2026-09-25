import { DEMO_MODE } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import StationStrategyPage from "./StationStrategyPage"
import type { RegisterLeaveGuard } from "./useEditorLeaveGuard"
import { useMemo, useState } from "react"
import { ArrowRight } from "lucide-react"
import type { Station } from "@/App"
import {
  minuteLabel,
  operationsDate,
  PERIOD_NAMES,
  timeMinute,
} from "@/data/operations"
import { stationsDataNow } from "@/data/dataClock"
import { dispatchStation } from "@/data/stationDispatch"
import "./operations-schedule.css"

const number = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? "--" : Math.round(value).toLocaleString("zh-CN")

export default function OperationsSchedulePage({
  stations,
  onOpenStation,
  registerLeaveGuard,
  requestLeave,
}: {
  stations: Station[]
  onOpenStation: (id: string, subNav?: string) => void
  registerLeaveGuard?: RegisterLeaveGuard
  requestLeave?: () => Promise<boolean>
}) {
  const {user} = useAuth()
  const [strategyId, setStrategyId] = useState("")
  const strategyStation = stations.find(station => station.id === strategyId)
  function openStrategy(id: string) {
    if (DEMO_MODE || hasStationPermission(user, id, "asset.read")) onOpenStation(id, "运行策略")
    else setStrategyId(id)
  }
  const [now] = useState(() => stationsDataNow(stations))
  const today = operationsDate(now)
  const [date, setDate] = useState(today)
  const [scope, setScope] = useState("")
  const [status, setStatus] = useState("")
  const rows = useMemo(
    () => stations.map((station) => dispatchStation(station, date, now)),
    [stations, date, now],
  )
  const visible = rows.filter(
    (row) =>
      (!scope || row.station.id === scope) &&
      (!status ||
        (status === "attention"
          ? !["正常", "待执行", "建设中"].includes(row.status)
          : status === "executing"
            ? row.hasPlan && date === today
            : status === "ready"
              ? row.hasPlan && date > today
              : row.hasPlan && date < today)),
  )
  const currentMinute = now.getHours() * 60 + now.getMinutes()

  if (strategyStation) return <div className="dispatch-page"><button className="operations-button" onClick={() => { void (async () => {
    if (requestLeave && !(await requestLeave())) return
    setStrategyId("")
  })() }}>返回策略执行</button><StationStrategyPage station={strategyStation} registerLeaveGuard={registerLeaveGuard} /></div>
  return (
    <div className="dispatch-page">
      <section className="dispatch-toolbar" aria-label="策略执行筛选">
        <input
          aria-label="调度日期"
          type="date"
          value={date}
          onChange={(event) => event.target.value && setDate(event.target.value)}
        />
        <select aria-label="调度站点范围" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="">全部站点</option>
          {stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
        </select>
        <select aria-label="调度状态" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">下发结果 · 全部</option>
          <option value="executing">执行中</option>
          <option value="ready">待执行</option>
          <option value="completed">已结束</option>
          <option value="attention">需关注</option>
        </select>
        <button className="operations-button dispatch-reset" onClick={() => { setDate(today); setScope(""); setStatus("") }}>
          重置
        </button>
      </section>

      <section className="dispatch-surface" aria-label="当天时段安排">
        <div className="dispatch-heading">
          <h2>当天时段安排</h2>
          <span>{date === today ? `当前时间 ${minuteLabel(currentMinute)}` : date}</span>
        </div>
        <div className="dispatch-timeline-scroll">
          <div className="dispatch-timeline" data-testid="dispatch-chart">
            <div className="dispatch-axis">
              <span />
              <div>
                {[0, 240, 480, 720, 960, 1200, 1440].map((minute) => (
                  <span key={minute}>{minuteLabel(minute)}</span>
                ))}
              </div>
            </div>
            <div className="dispatch-timeline-body">
              {date === today && (
                <div className="dispatch-now" style={{ left: `calc(160px + (100% - 160px) * ${currentMinute / 1440})` }} aria-hidden="true" />
              )}
              {visible.map((row) => (
                <div className="dispatch-timeline-row" key={row.station.id}>
                  <strong>{row.station.name}</strong>
                  <div className="dispatch-track" aria-label={`${row.station.name}运行计划`}>
                    {row.plan.overlap ? (
                      <span className="dispatch-track-message">计划时段冲突</span>
                    ) : row.plan.periods.length ? (
                      row.plan.periods.map((period) => {
                        const from = timeMinute(period.start)
                        const length = timeMinute(period.end) - from
                        return (
                          <button
                            key={period.id}
                            className={`dispatch-block dispatch-block--${period.mode}`}
                            style={{ left: `${(from / 1440) * 100}%`, width: `${(length / 1440) * 100}%` }}
                            aria-label={`${row.station.name} ${period.start}至${period.end} ${PERIOD_NAMES[period.mode]} ${number(period.power)}千瓦`}
                            title={`${period.start}–${period.end} ${PERIOD_NAMES[period.mode]} · ${number(period.power)} kW`}
                            onClick={() => openStrategy(row.station.id)}
                          >
                            {length >= 90 ? PERIOD_NAMES[period.mode] : ""}
                          </button>
                        )
                      })
                    ) : (
                      <span className="dispatch-track-message">暂无计划</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {!visible.length && <div className="operations-empty">没有符合条件的站点</div>}
      </section>

      <section className="dispatch-surface dispatch-detail" aria-label="策略执行明细">
        <h2>策略执行明细</h2>
        <div className="operations-table-scroll">
          <table>
            <thead>
              <tr>
                {["站点", "当前生效方案", "当前模式", "当前动作", "下一次切换", "最近下发结果", "操作"].map((label) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const period = date === today
                  ? row.plan.periods.find((item) => timeMinute(item.start) <= currentMinute && timeMinute(item.end) > currentMinute)
                  : row.plan.periods[0]
                const next = date === today
                  ? row.next
                  : row.plan.periods.find((item) => timeMinute(item.start) > timeMinute(period?.start ?? "24:00"))
                return (
                  <tr key={row.station.id} data-testid={`dispatch-row-${row.station.id}`}>
                    <td><strong>{row.station.name}</strong></td>
                    <td>{row.hasPlan ? row.station.mode : "--"}</td>
                    <td>{row.hasPlan ? "自动应用" : "--"}</td>
                    <td>{period ? PERIOD_NAMES[period.mode] : "--"}</td>
                    <td>{next ? `${next.start} · ${PERIOD_NAMES[next.mode]}` : "--"}</td>
                    <td>
                      <span className={["需关注", "计划冲突", "数据缺失"].includes(row.status) ? "dispatch-result is-attention" : "dispatch-result"}>
                        {row.status}
                      </span>
                      {row.current.actual !== null && <small> · {number(row.current.actual)} kW</small>}
                    </td>
                    <td>
                      <button className="operations-link" onClick={() => openStrategy(row.station.id)}>
                        查看策略 <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!visible.length && <div className="operations-empty">没有符合条件的执行记录</div>}
      </section>
    </div>
  )
}
