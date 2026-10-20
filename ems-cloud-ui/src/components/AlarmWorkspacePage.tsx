import {Download, RefreshCw, FileSearch} from "lucide-react"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"

import type { Station } from "@/App"

import { useAuth } from "@/auth/AuthContext"

import { hasStationPermission } from "@/auth/apiPermissions"

import {
  alarmDetail,
  alarmSummary,
  exportAlarmRows,
  exportAlarmTrend,
  handleAlarm,
  markAlarmsRead,
  queryAlarms,
  type AlarmRow,
} from "@/api/alarmWorkspace"

import { send } from "@/api/client"

import {getPreferences,subscribePreferences} from "@/preferences/store"
import { dateKey, formatDate } from "@/preferences/date"

import {
  alarmColumns,
  alarmExportValues,
  alarmDuration,
  alarmTimeRange,
  alarmRealtimeExportRange,
  alarmTrendData,
  alarmNameDistribution,
  alarmCsv,
} from "@/data/alarmPresentation"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts"
import type { RegisterLeaveGuard } from "./useEditorLeaveGuard"
import AlarmRulesPage from "./AlarmRulesPage"

import "./alarm-workspace.css"

const levels = {
  critical: "紧急",
  warning: "重要",
  minor: "次要",
  info: "提示",
}

const lifecycle = { active: "未恢复", recovered: "已恢复", closed: "人工关闭" }

const stamp = (value: string | null | undefined) =>
  value
    ? formatDate(new Date(value), {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

export default function AlarmWorkspacePage({
  stationId,
  stations = [],
  onRefresh,
  view,
  registerLeaveGuard,
}: {
  stationId?: string
  stations?: Station[]
  view?: "live" | "history" | "rules"
  registerLeaveGuard?: RegisterLeaveGuard
  onRefresh?: () => void
}) {
  const { user } = useAuth()
  const {timezone}=useSyncExternalStore(subscribePreferences,getPreferences,getPreferences)
  const rulesLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const registerRulesLeaveGuard = useCallback<RegisterLeaveGuard>(
    (guard) => {
      rulesLeaveGuard.current = guard
      registerLeaveGuard?.(guard)
    },
    [registerLeaveGuard],
  )
  const [localTab, setTab] = useState("live")
  const tab = view ?? localTab
  const [advanced, setAdvanced] = useState(false)
  const [sort, setSort] = useState<"asc" | "desc">("desc")
  const [pageSize, setPageSize] = useState(50)
  const [month, setMonth] = useState(() => dateKey(new Date()).slice(0,7))
  const [historyMode,setHistoryMode]=useState<"month"|"year">("month")
  const [year,setYear]=useState(()=>dateKey(new Date()).slice(0,4))
  const historyPeriod=historyMode==="month"?month:year
  const granularity=historyMode==="month"?"DAY":"MONTH"
  const [exporting,setExporting]=useState(false)
  const exportController=useRef<AbortController|null>(null)
  const [summary, setSummary] = useState<{
    name: string
    severity: string
    day: string
    count: number
  }[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState("")
  const [scope, setScope] = useState(stationId ?? "")
  const [source, setSource] = useState("rule")
  const [severity, setSeverity] = useState("")
  const [readFlag, setReadFlag] = useState("")
  const [device, setDevice] = useState("")
  const [query, setQuery] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<AlarmRow[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [detail, setDetail] = useState<AlarmRow | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [orderDraft, setOrderDraft] = useState<{
    title: string
    description: string
  } | null>(null)
  const revision = useRef(0)
  const detailRequest = useRef(0)
  const mutationContext = useRef(0)

  const canExport=scope?hasStationPermission(user,scope,"report.export"):stations.some(station=>hasStationPermission(user,station.id,"alarm.read")&&hasStationPermission(user,station.id,"report.export"))
  useEffect(()=>{exportController.current?.abort();setExporting(false);return()=>exportController.current?.abort()},[scope,tab,source,severity,device,readFlag,query,start,end,page,pageSize,sort,historyPeriod,granularity,timezone,user])
  async function exportFile(trend=false){
    if(!canExport||exporting)return
    const controller=new AbortController();exportController.current?.abort();exportController.current=controller;setExporting(true);setError("")
    try{
      const range=tab==="live"?alarmRealtimeExportRange(new Date(),timezone):alarmTimeRange(historyPeriod,start,end,timezone,granularity)
      const params={stationId:scope||undefined,view:tab,source,severity,deviceId:device,readFlag,query,...range,limit:pageSize,offset:page*pageSize,sort}
      let csv:string
      if(trend){const data=await exportAlarmTrend({...params,timezone,granularity},controller.signal);csv=alarmCsv([granularity==="DAY"?"日期":"月份","报警数量"],alarmTrendData(data,historyPeriod,granularity,severity).map(row=>[row.period,row.count]))}
      else{const result=await exportAlarmRows(params,controller.signal);csv=alarmCsv(alarmColumns(source,tab).slice(0,-1),result.items.map(row=>alarmExportValues(row,source,tab,levels[row.severity],lifecycle[row.lifecycle])))}
      if(controller.signal.aborted)return
      const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=url;link.download=trend?`报警趋势-${historyPeriod}-${granularity}.csv`:`报警列表-${tab}-第${page+1}页.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
    }catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"报警导出失败")}
    finally{if(!controller.signal.aborted)setExporting(false)}
  }
  const canHandle =
    !!detail && hasStationPermission(user, detail.station_id, "alarm.handle")

  const load = useCallback(async () => {
    const seq = ++revision.current
    setLoading(true)
    setError("")
    try {
      const result = await queryAlarms({
        stationId: scope || undefined,
        view: tab === "rules" ? "all" : tab,
        source,
        severity,
        sort,
        deviceId: device,
        readFlag,
        query,
        ...alarmTimeRange(tab === "history" ? historyPeriod : undefined, start, end, timezone,granularity),
        limit: pageSize,
        offset: page * pageSize,
      })
      if (seq === revision.current) {
        setItems(result.items)
        setTotal(result.total)
        setSelected([])
      }
    } catch (e) {
      if (seq === revision.current) {
        setError((e as Error).message)
        setItems([])
        setTotal(0)
      }
    } finally {
      if (seq === revision.current) setLoading(false)
    }
  }, [
    scope,
    tab,
    source,
    severity,
    sort,
    device,
    readFlag,
    query,
    start,
    end,
    page,
    pageSize,
    month,
    historyPeriod,
    granularity,
    timezone,
    user,
  ])

  useEffect(() => {
    let current = true
    setSummary([])
    setSummaryError("")
    setSummaryLoading(true)
    if (tab !== "rules") {
      Promise.resolve()
        .then(() =>
          alarmSummary({
            stationId: scope || undefined,
            view: tab,
            source,
            deviceId: device,
            readFlag,
            query,
            ...alarmTimeRange(
              tab === "history" ? historyPeriod : undefined,
              start,
              end,
              timezone,
              granularity,
            ),
            timezone,
            granularity,
          }),
        )
        .then((rows) => {
          if (current) setSummary(rows)
        })
        .catch((e) => {
          if (current) setSummaryError(e.message)
        })
        .finally(() => {
          if (current) setSummaryLoading(false)
        })
    } else setSummaryLoading(false)
    return () => {
      current = false
    }
  }, [
    tab,
    scope,
    source,
    month,
    historyPeriod,
    granularity,
    timezone,
    user,
    start,
    end,
    device,
    readFlag,
    query,
    items,
  ])

  useEffect(() => {
    setScope(stationId ?? "")
    setPage(0)
    setDetail(null)
  }, [stationId])

  useEffect(() => {
    if (tab !== "rules") void load()
    return () => {
      revision.current++
    }
  }, [load, tab])

  useEffect(() => {
    detailRequest.current++
    mutationContext.current++
    setBusy(false)
    setDetail(null)
    setPending(null)
    setNote("")
    setOrderDraft(null)
    return () => {
      detailRequest.current++
      mutationContext.current++
    }
  }, [stationId, scope, tab, user])

  async function open(id: number) {
    const seq = ++detailRequest.current
    setError("")
    try {
      let row = await alarmDetail(id)
      if (seq !== detailRequest.current) return
      if (!row.read_flag) {
        await markAlarmsRead([id])
        if (seq !== detailRequest.current) return
        row = await alarmDetail(id)
        if (seq !== detailRequest.current) return
        await load()
      }
      if (seq === detailRequest.current) {
        setDetail(row)
        setPending(null)
        setNote("")
        setOrderDraft(null)
      }
    } catch (e) {
      if (seq === detailRequest.current) setError((e as Error).message)
    }
  }

  async function read(ids: number[]) {
    const context = mutationContext.current
    setBusy(true)
    setError("")
    try {
      await markAlarmsRead(ids)
      if (context !== mutationContext.current) return
      await load()
      if (context !== mutationContext.current) return
      if (detail && ids.includes(detail.id)) await open(detail.id)
    } catch (e) {
      if (context === mutationContext.current) setError((e as Error).message)
    } finally {
      if (context === mutationContext.current) setBusy(false)
    }
  }

  async function act() {
    if (!detail || !pending) return
    const context = mutationContext.current
    setBusy(true)
    setError("")
    try {
      const id = detail.id
      await handleAlarm(detail, pending, note)
      if (context !== mutationContext.current) return
      setPending(null)
      setNote("")
      await load()
      if (context !== mutationContext.current) return
      onRefresh?.()
      if (pending === "delete") setDetail(null)
      else await open(id)
    } catch (e) {
      if (context === mutationContext.current) setError((e as Error).message)
    } finally {
      if (context === mutationContext.current) setBusy(false)
    }
  }

  const filter = (change: () => void) => {
    change()
    setPage(0)
  }

  return (
    <section className="alarm-business-workspace" data-alarm-view={tab}>
      {!view && (
        <div className="alarm-business-workspace-tabs">
          {[
            ["live", "实时报警"],
            ["history", "报警历史"],
            ["rules", "报警规则"],
          ].map(([key, label]) => (
            <button
              key={key}
              aria-pressed={tab === key}
              onClick={async () => {
                if (
                  rulesLeaveGuard.current &&
                  !(await rulesLeaveGuard.current())
                )
                  return
                filter(() => {
                  setTab(key)
                  setPage(0)
                  setDetail(null)
                })
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {tab === "rules" ? (
        <AlarmRulesPage
          stationId={stationId}
          stations={stations}
          registerLeaveGuard={registerRulesLeaveGuard}
        />
      ) : (
        <>
          <div className="alarm-page-heading">
            <strong>{tab === "history" ? "报警历史" : "实时报警"}</strong>
            {tab === "history" && (<div className="alarm-business-workspace-tabs alarm-source-tabs">
            {[
              ["rule", "规则报警"],
              ["device", "设备报警"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={source === key}
                onClick={() => filter(() => setSource(key))}
              >
                {label}
              </button>
            ))}
          </div>)}
            <div className="alarm-heading-controls">
            {tab === "live" && <>            <input
              aria-label="搜索报警名称"
              placeholder="请输入报警名称"
              value={query}
              onChange={(e) => filter(() => setQuery(e.target.value))}
            />
 <button className="alarm-icon-button" aria-label="导出报警列表" disabled={!canExport||busy||loading||exporting} title="导出当前筛选/排序/分页；实时最近30个自然日，历史所选周期；本系统CSV格式" onClick={()=>void exportFile()}><Download size={15}/></button><button className="alarm-icon-button" aria-label="刷新报警" title="刷新报警" disabled={busy||loading} onClick={()=>void load()}><RefreshCw size={15}/></button><span className="alarm-refresh-selector" title="自动刷新间隔选项尚未核验，当前关闭；可使用左侧手动刷新"><select aria-label="自动刷新间隔" value="off" disabled><option value="off">关闭</option></select></span></>}

          {tab === "history" && <><select aria-label="报警历史统计范围" value={historyMode} onChange={e=>filter(()=>{setHistoryMode(e.target.value as "month"|"year");setStart("");setEnd("")})}><option value="month">月</option><option value="year">年</option></select>{historyMode==="month"?<input aria-label="历史报警月份" type="month" value={month} onChange={e=>{if(e.target.value)filter(()=>{setMonth(e.target.value);setStart("");setEnd("")})}}/>:<input aria-label="历史报警年份" type="number" min="2000" max="2100" value={year} onChange={e=>{if(/^\d{0,4}$/.test(e.target.value))filter(()=>{setYear(e.target.value);setStart("");setEnd("")})}}/>}</>}
            </div>
          </div>
          {tab === "history" &&
            (summaryLoading ? (
              <p>正在读取报警统计…</p>
            ) : summaryError ? (
              <p role="alert">{summaryError}</p>
            ) : (
              <div className="alarm-history-charts">
                <div>
                  <h3>报警分布</h3>
                  {summaryError ? (
                    <p role="alert">{summaryError}</p>
                  ) : summary.length ? (
                    <ResponsiveContainer width="100%" height={205}>
                      <PieChart>
                        <Pie
                          data={alarmNameDistribution(summary)}
                          dataKey="count"
                          innerRadius={44}
                          outerRadius={62}
                        >
                          {alarmNameDistribution(summary).map((group,index) => <Cell key={group.name} fill={["#2c9a7e", "#569acb", "#e9c652", "#de9a3b", "#9b83c8", "#9ba7ab"][index%6]} />)}
                        </Pie>
                        {summary.length > 0 && <Tooltip />}
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <div className="alarm-empty-donut" role="img" aria-label="暂无报警，0条"/>}
                  <ul aria-label="按报警名称分布">{alarmNameDistribution(summary).map(group=><li key={group.name}>{group.name || "—"}：{group.count} 条（{group.percent}%）</li>)}</ul>
                  <span>
                    {summary.reduce((a, b) => a + Number(b.count), 0)}
                  </span>
                </div>
                <div>
                  <h3>报警趋势 <button className="alarm-icon-button" aria-label="导出趋势CSV" title="按所选周期汇总，导出本系统CSV格式" disabled={!canExport||summaryLoading||exporting} onClick={()=>void exportFile(true)}><Download size={15}/></button></h3>
                  <ResponsiveContainer width="100%" height={225}>
                    <LineChart
                      data={alarmTrendData(summary,historyPeriod,granularity,severity)}
                    >
                      <CartesianGrid stroke="#edf0ef" />
                      <XAxis dataKey="day" interval={granularity==="DAY"?1:0} tickLine={false} axisLine={false} />
                      <YAxis width={32} tickLine={false} axisLine={false} domain={[0,(maximum:number)=>Math.max(1,maximum)]} tickCount={6}/>
                      <Tooltip />
                      <Line
                        dataKey="count"
                        name={granularity==="DAY"?"当日报警总数":"当月报警总数"}
                        stroke="#2c9a7e"
                        dot={false}
                        strokeOpacity={summary.length ? 1 : 0}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="alarm-trend-legend"><i/>{granularity==="DAY"?"当日报警总数":"当月报警总数"}</div>
                </div>
              </div>
            ))}
          <div className="alarm-list-card">
          {tab === "live" && (<div className="alarm-business-workspace-tabs alarm-source-tabs">
            {[
              ["rule", "规则报警"],
              ["device", "设备报警"],
            ].map(([key, label]) => (
              <button
                key={key}
                aria-pressed={source === key}
                onClick={() => filter(() => setSource(key))}
              >
                {label}
              </button>
            ))}
          </div>)}
          <div className="alarm-business-workspace-filters">
            <button
              aria-pressed={!severity}
              onClick={() => filter(() => setSeverity(""))}
            >
              全部(
              {summaryError || summaryLoading
                ? "—"
                : summary.reduce((a, b) => a + Number(b.count), 0)}
              )
            </button>
            {Object.entries(levels).map(([key, label]) => (
              <button
                key={key}
                aria-pressed={severity === key}
                onClick={() => filter(() => setSeverity(key))}
              >
                {label}(
                {summaryError || summaryLoading
                  ? "—"
                  : summary
                      .filter((row) => row.severity === key)
                      .reduce((a, b) => a + Number(b.count), 0)}
                )
              </button>
            ))}
            <button
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              高级筛选
            </button>
            {tab === "history" && <div className="alarm-list-tools">            <input
              aria-label="搜索报警名称"
              placeholder="请输入报警名称"
              value={query}
              onChange={(e) => filter(() => setQuery(e.target.value))}
            />
 <button className="alarm-icon-button" aria-label="导出报警列表" disabled={!canExport||busy||loading||exporting} title="导出当前筛选/排序/分页；实时最近30个自然日，历史所选周期；本系统CSV格式" onClick={()=>void exportFile()}><Download size={15}/></button></div>}
          </div>
          {summaryError && tab === "live" && <p role="alert">{summaryError}</p>}
          {advanced && (
            <div className="alarm-business-workspace-filters">
              {!stationId && (
                <select
                  aria-label="告警站点"
                  value={scope}
                  onChange={(e) => filter(() => setScope(e.target.value))}
                >
                  <option value="">全部授权站点</option>
                  {stations
                    .filter((s) =>
                      hasStationPermission(user, s.id, "alarm.read"),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              )}
              <select
                aria-label="告警来源"
                value={source}
                onChange={(e) => filter(() => setSource(e.target.value))}
              >
                <option value="device">设备告警</option>
                <option value="rule">规则告警</option>
              </select>
              <select
                aria-label="告警等级"
                value={severity}
                onChange={(e) => filter(() => setSeverity(e.target.value))}
              >
                <option value="">全部等级</option>
                {Object.entries(levels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="个人阅读状态"
                value={readFlag}
                onChange={(e) => filter(() => setReadFlag(e.target.value))}
              >
                <option value="">全部阅读状态</option>
                <option value="unread">未读</option>
                <option value="read">已读</option>
              </select>
              <input
                aria-label="设备ID筛选"
                inputMode="numeric"
                type="number"
                min="1"
                placeholder="设备ID"
                value={device}
                onChange={(e) => filter(() => setDevice(e.target.value))}
              />
              <input
                aria-label="告警起始时间"
                type="datetime-local"
                value={start}
                onChange={(e) => filter(() => setStart(e.target.value))}
              />
              <span>至</span>
              <input
                aria-label="告警结束时间（不含）"
                type="datetime-local"
                value={end}
                onChange={(e) => filter(() => setEnd(e.target.value))}
              />
              <input
                aria-label="搜索告警"
                placeholder="名称 / 代码 / 设备"
                value={query}
                onChange={(e) => filter(() => setQuery(e.target.value))}
              />
              <button disabled={busy || loading} onClick={() => void load()}>
                刷新
              </button>
              <button
                onClick={() =>
                  filter(() => {
                    setSource("rule")
                    setSeverity("")
                    setReadFlag("")
                    setDevice("")
                    setQuery("")
                    setStart("")
                    setEnd("")
                    setScope(stationId ?? "")
                  })
                }
              >
                重置
              </button>
            </div>
          )}
          {tab === "live" && advanced && <div className="alarm-business-workspace-heading">
            <span>共 {total} 条报警</span>
            <button
              disabled={busy || !selected.length}
              onClick={() => void read(selected)}
            >
              批量标为已读（{selected.length}）
            </button>
          </div>}
          {error && (
            <p role="alert" className="alarm-business-workspace-error">
              {error}
            </p>
          )}
          <div className="alarm-business-workspace-table">
            <table>
              <thead>
                <tr>
                  {tab === "live" && advanced && <th>
                    <input
                      type="checkbox"
                      aria-label="选择本页告警"
                      checked={
                        items.length > 0 && selected.length === items.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? items.map((a) => a.id) : [],
                        )
                      }
                    />
                  </th>}
                  {alarmColumns(source, tab).map((x) => (
                    <th
                      key={x}
                      aria-sort={
                        x === "报警开始时间"
                          ? sort === "desc"
                            ? "descending"
                            : "ascending"
                          : undefined
                      }
                    >
                      {x === "报警开始时间" ? (
                        <button
                          onClick={() =>
                            filter(() =>
                              setSort(sort === "desc" ? "asc" : "desc"),
                            )
                          }
                        >
                          {x} {sort === "desc" ? "↓" : "↑"}
                        </button>
                      ) : (
                        x
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    {tab === "live" && advanced && <td>
                      <input
                        type="checkbox"
                        aria-label={`选择告警${a.id}`}
                        checked={selected.includes(a.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, a.id]
                              : selected.filter((id) => id !== a.id),
                          )
                        }
                      />
                    </td>}
                    <td>
                      {a.title}
                      <small>{a.code}</small>
                    </td>
                    {tab === "live" && (<td>
                      <span
                        className={`alarm-business-workspace-level ${a.severity}`}
                      >
                        {levels[a.severity]}
                      </span>
                    </td>)}
                    {source === "rule" && <td>{a.trigger_indicator || "—"}</td>}
                    <td>{lifecycle[a.lifecycle]}</td>
                    {tab === "history" && (<td>
                      <span
                        className={`alarm-business-workspace-level ${a.severity}`}
                      >
                        {levels[a.severity]}
                      </span>
                    </td>)}
                    <td>
                      {a.object_type === "STATION"
                        ? "场站"
                        : a.device_name || "—"}
                    </td>
                    <td>{a.station_name}</td>
                    <td>{stamp(a.occurred_at)}</td>
                    <td>{stamp(a.effective_recovered_at)}</td>
                    {tab === "live" && <td>{alarmDuration(a)}</td>}
                    <td>
                      <button onClick={() => void open(a.id)}>
                        事件详情 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && (
              <div className="alarm-business-workspace-empty"><FileSearch aria-hidden="true" className="alarm-empty-icon" size={66} strokeWidth={1}/>{loading ? "正在读取告警…" : "暂无数据"}</div>
            )}
          </div>
          {tab === "live" && (
            <p className="alarm-business-workspace-muted">
              展示当前发生中的报警，已恢复报警请在历史报警中查看
            </p>
          )}
          <div className="alarm-business-workspace-pagination">
            <button
              disabled={!page || loading}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>
              共{total}条 · 第 {page + 1} 页
            </span>
            <select
              aria-label="报警每页条数"
              value={pageSize}
              onChange={(e) =>
                filter(() => setPageSize(Number(e.target.value)))
              }
            >
              {[20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n} 条/页
                </option>
              ))}
            </select>
            <button
              disabled={(page + 1) * pageSize >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
          </div>
          {detail && (
            <div
              className="alarm-business-workspace-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="告警详情"
            >
              <div className="alarm-business-workspace-dialog-head">
                <h2>{detail.title}</h2>
                <button
                  disabled={busy}
                  onClick={() => {
                    detailRequest.current++
                    setDetail(null)
                    setPending(null)
                  }}
                >
                  关闭详情
                </button>
              </div>
              <p>
                {detail.station_name} / {detail.device_name} ·{" "}
                {levels[detail.severity]} · {lifecycle[detail.lifecycle]}
              </p>
              <p>
                发生：{stamp(detail.occurred_at)}　自动恢复：
                {stamp(detail.effective_recovered_at)}　人工关闭：
                {stamp(detail.closed_at)}
              </p>
              <p>
                业务确认：{stamp(detail.acknowledged_at)}　个人阅读：
                {detail.read_flag ? "已读" : "未读"}
              </p>
              <p className="alarm-business-workspace-muted">
                {detail.sampleStatus}
                。打开详情会记录当前账号已读，业务确认独立执行。
              </p>
              <div className="alarm-business-workspace-actions">
                <button
                  disabled={busy || detail.read_flag}
                  onClick={() => void read([detail.id])}
                >
                  标为已读
                </button>
                {canHandle &&
                  [
                    ["acknowledge", "确认告警"],
                    ["note", "添加备注"],
                    ["close", "人工关闭"],
                    ["delete", "软删除"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      disabled={
                        busy ||
                        (key === "delete"
                          ? detail.lifecycle === "active"
                          : key !== "note" && detail.lifecycle !== "active") ||
                        (key === "acknowledge" && !!detail.acknowledged_at)
                      }
                      onClick={() => {
                        setPending(key)
                        setNote("")
                      }}
                    >
                      {label}
                    </button>
                  ))}
              </div>
              {pending && (
                <div className="alarm-business-workspace-confirm">
                  <p>
                    {pending === "close"
                      ? "人工关闭将进入历史，不改写设备自动恢复时间。"
                      : pending === "delete"
                        ? "删除后从业务列表隐藏，审计和关联工单保留。"
                        : "请填写处理说明。"}
                  </p>
                  <textarea
                    aria-label="告警处理说明"
                    maxLength={4000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    disabled={busy || !note.trim()}
                    onClick={() => void act()}
                  >
                    确认提交
                  </button>
                  <button disabled={busy} onClick={() => setPending(null)}>
                    取消
                  </button>
                </div>
              )}
              {error && (
                <p role="alert" className="alarm-business-workspace-error">
                  {error}
                </p>
              )}
              {hasStationPermission(
                user,
                detail.station_id,
                "workorder.create",
              ) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    setOrderDraft({
                      title: detail.title,
                      description: `关联告警 ${detail.code}：${detail.title}`,
                    })
                  }
                >
                  创建工单
                </button>
              )}
              {orderDraft && (
                <form
                  className="alarm-business-workspace-confirm"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const context = mutationContext.current
                    setBusy(true)
                    send("/work-orders", "POST", {
                      stationId: detail.station_id,
                      title: orderDraft.title,
                      description: orderDraft.description,
                      alarmId: detail.id,
                      ...(hasStationPermission(
                        user,
                        detail.station_id,
                        "workorder.handle",
                      )
                        ? { assignedTo: Number(user?.id) }
                        : {}),
                    })
                      .then(() => {
                        if (context !== mutationContext.current) return
                        setOrderDraft(null)
                        setError("工单已创建，可到工单中心查看")
                        onRefresh?.()
                      })
                      .catch((e) => {
                        if (context === mutationContext.current)
                          setError(e.message)
                      })
                      .finally(() => {
                        if (context === mutationContext.current) setBusy(false)
                      })
                  }}
                >
                  <label>
                    工单标题
                    <input
                      required
                      maxLength={200}
                      value={orderDraft.title}
                      onChange={(e) =>
                        setOrderDraft({ ...orderDraft, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    问题描述
                    <textarea
                      required
                      maxLength={4000}
                      value={orderDraft.description}
                      onChange={(e) =>
                        setOrderDraft({
                          ...orderDraft,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <button disabled={busy} type="submit">
                    保存工单
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOrderDraft(null)}
                  >
                    取消
                  </button>
                </form>
              )}
              <h3>处理记录</h3>
              {detail.events?.length ? (
                detail.events.map((e) => (
                  <p key={e.id}>
                    {stamp(e.occurred_at)} · {e.actor_name} · {e.action}：
                    {e.note}
                  </p>
                ))
              ) : (
                <p>暂无处置审计记录</p>
              )}
              <h3>备注</h3>
              {detail.notes?.length ? (
                detail.notes.map((n) => (
                  <p key={n.id}>
                    {stamp(n.created_at)} · {n.author_name}：{n.body}
                  </p>
                ))
              ) : (
                <p>暂无备注</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
