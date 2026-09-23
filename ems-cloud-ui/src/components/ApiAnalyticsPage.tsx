import { hasStationPermission } from "@/auth/apiPermissions"
import { useEffect, useMemo, useRef, useState } from "react"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { Station } from "@/App"
import { useAuth } from "@/auth/AuthContext"
import { ROLE_CONFIG, type UserRole } from "@/auth/roles"
import { Button, PageHeader, Select } from "./ui/Workspace"
import { downloadServerReport, historyCsv, loadHistory, loadPoints, saveBlob, type HistoryBucket, type MeasurementPoint, type ReportKind } from "./apiAnalytics"
import "./analytics-ai.css"
import "./api-analytics.css"

type Tab = "数据分析" | "数据下载" | "报告中心"
type ReportType = "运营报告" | "收益报告" | "设备健康报告"
const REPORTS: Array<{ label: ReportType; kind: ReportKind; permission: string }> = [
  { label: "运营报告", kind: "operations", permission: "strategy.read" },
  { label: "收益报告", kind: "revenue", permission: "revenue.read" },
  { label: "设备健康报告", kind: "health", permission: "asset.read" },
]
const dateText = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
const localInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const errorText = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试。"

export default function ApiAnalyticsPage({ stations, allowedTabs, allowedReportTypes, role }: {
  stations: Station[]
  allowedTabs: readonly Tab[]
  allowedReportTypes: readonly ReportType[]
  role: UserRole
}) {
  const { user } = useAuth()
  const permissions = user?.permissions ?? []
  stations = stations.filter(station => hasStationPermission(user, station.id, "telemetry.read") || (hasStationPermission(user, station.id, "report.export") && REPORTS.some(report => hasStationPermission(user, station.id, report.permission))))
  const canTelemetry = permissions.includes("telemetry.read")
  const reports = REPORTS.filter((item) => permissions.includes("report.export") && permissions.includes(item.permission) && allowedReportTypes.includes(item.label))
  const tabs = allowedTabs.filter((tab) => tab === "报告中心" ? reports.length > 0 : canTelemetry)
  const [tab, setTab] = useState<Tab>(tabs[0] ?? "数据分析")
  const [stationId, setStationId] = useState(stations[0]?.id ?? "")
  const station = stations.find((item) => item.id === stationId) ?? stations[0]
  const canReadStationTelemetry = hasStationPermission(user, station?.id, "telemetry.read")
  const stationReports = reports.filter(report => hasStationPermission(user, station?.id, "report.export") && hasStationPermission(user, station?.id, report.permission))
  const [points, setPoints] = useState<MeasurementPoint[]>([])
  const [pointId, setPointId] = useState("")
  const point = points.find((item) => item.id === pointId) ?? points[0]
  const [from, setFrom] = useState(() => localInput(new Date(Date.now() - 86400000)))
  const [to, setTo] = useState(() => localInput(new Date()))
  const [minutes, setMinutes] = useState(15)
  const [rows, setRows] = useState<HistoryBucket[]>([])
  const [loadingPoints, setLoadingPoints] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [reportKind, setReportKind] = useState<ReportKind>(reports[0]?.kind ?? "operations")
  const [reportFrom, setReportFrom] = useState(() => dateText(new Date(Date.now() - 7 * 86400000)))
  const [reportTo, setReportTo] = useState(() => dateText(new Date()))
  const [downloading, setDownloading] = useState(false)
  const historyRequest = useRef<AbortController | null>(null)
  const chartRows = useMemo(() => rows.map((row) => ({
    ...row,
    time: new Date(row.timestamp).toLocaleString("zh-CN", { hour12: false }),
  })), [rows])

  useEffect(() => {
    if (!tabs.includes(tab)) setTab(tabs[0] ?? "数据分析")
  }, [tab, tabs.join("|")])
  useEffect(() => {
    if (station && station.id !== stationId) setStationId(station.id)
  }, [station, stationId])
  useEffect(() => {
    if (!station || !canReadStationTelemetry) { setLoadingPoints(false); setPoints([]); setPointId(""); setRows([]); return }
    const controller = new AbortController()
    setLoadingPoints(true); setPoints([]); setPointId(""); setRows([]); setError("")
    loadPoints(station.id, controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setPoints(result); setPointId(result[0]?.id ?? "") } })
      .catch((cause) => { if (!controller.signal.aborted) setError(errorText(cause)) })
      .finally(() => { if (!controller.signal.aborted) setLoadingPoints(false) })
    return () => controller.abort()
  }, [canReadStationTelemetry, station?.id])
  useEffect(() => {
    historyRequest.current?.abort()
    setLoadingHistory(false); setRows([]); setNotice("")
    return () => historyRequest.current?.abort()
  }, [canReadStationTelemetry, station?.id, pointId, from, to, minutes])
  useEffect(() => {
    if (!stationReports.some((item) => item.kind === reportKind)) setReportKind(stationReports[0]?.kind ?? "operations")
  }, [reportKind, stationReports.map((item) => item.kind).join("|")])

  async function query() {
    if (!canReadStationTelemetry || !point) return
    historyRequest.current?.abort()
    const controller = new AbortController()
    historyRequest.current = controller
    setLoadingHistory(true); setError(""); setNotice(""); setRows([])
    try {
      const result = await loadHistory(point.id, new Date(from), new Date(to), minutes, controller.signal)
      if (controller.signal.aborted) return
      setRows(result)
      setNotice(result.length ? `已读取 ${result.length} 个采样区间。` : "所选时间段没有采样数据。")
    } catch (cause) { if (!controller.signal.aborted) setError(errorText(cause)) }
    finally { if (!controller.signal.aborted) setLoadingHistory(false) }
  }
  function exportData() {
    if (!canReadStationTelemetry || !point || !rows.length) return
    saveBlob(new Blob([historyCsv(point, rows)], { type: "text/csv;charset=utf-8" }), `point-${point.id}-history.csv`)
    setNotice("已导出当前查询的真实采样数据。")
  }
  async function exportReport() {
    const report = reports.find(item => item.kind === reportKind)
    if (!station || !report || !hasStationPermission(user, station.id, "report.export") || !hasStationPermission(user, station.id, report.permission)) return
    setDownloading(true); setError(""); setNotice("")
    try {
      await downloadServerReport(station.id, reportKind, reportFrom, reportTo)
      setNotice("服务器报告已开始下载。")
    } catch (cause) { setError(errorText(cause)) }
    finally { setDownloading(false) }
  }
  return <main className="ui-page analytics-ai-page api-analytics-page">
    <PageHeader title="分析与报告" description={`${ROLE_CONFIG[role].shortLabel}范围 · 历史采样与服务器 CSV 报告。`} actions={<label>分析站点 <Select aria-label="分析站点" value={station?.id ?? ""} onChange={(event) => setStationId(event.target.value)} disabled={!stations.length}>{!stations.length && <option value="">暂无站点</option>}{stations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>} />
    <div className="analytics-report-tabs" role="tablist" aria-label="分析与报告视图"><div>{tabs.map((item) => <button type="button" key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div><span>服务器数据</span></div>
    {error && <div className="analytics-report-notice" role="alert">{error}</div>}
    {notice && <div className="analytics-report-notice" role="status">{notice}</div>}
    {!station ? <section className="analytics-empty-state"><h2>暂无授权站点</h2></section> : tab === "报告中心" ? <section className="analytics-ai-content analytics-report-center analytics-report-workspace" aria-label="报告中心">
      <div className="analytics-report-filters">
        <label className="analytics-report-field"><span>报告类型</span><Select aria-label="报告类型" value={reportKind} onChange={(event) => setReportKind(event.target.value as ReportKind)}>{stationReports.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}</Select></label>
        <label className="analytics-report-field"><span>开始日期</span><input aria-label="报告开始日期" type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} /></label>
        <label className="analytics-report-field"><span>结束日期</span><input aria-label="报告结束日期" type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} /></label>
        <Button variant="primary" disabled={downloading || !stationReports.length} onClick={() => void exportReport()}>{downloading ? "下载中…" : "下载 CSV 报告"}</Button>
      </div>
      <p className="api-analytics-hint">报告由服务器按所选站点和日期即时导出；无记录时 CSV 会注明“无记录”。</p>
      <section className="analytics-report-records"><h2>生成记录</h2><div className="analytics-report-table-wrap"><table className="ui-table analytics-report-table"><thead><tr>{["报告名称", "站点", "统计时段", "生成时间", "状态", "操作"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody><tr><td colSpan={6} className="api-analytics-table-empty">暂无可展示的生成记录</td></tr></tbody></table></div></section>
    </section> : <section className="analytics-ai-content analytics-analysis-host">
      <section className="analytics-download-config"><h2>{tab === "数据下载" ? "下载配置" : "分析配置"}</h2><div className="analytics-report-filters api-analytics-query-filters">
        <label className="analytics-report-field"><span>测点</span><Select aria-label="测点" value={point?.id ?? ""} disabled={!points.length} onChange={(event) => setPointId(event.target.value)}>{!points.length && <option value="">{loadingPoints ? "加载测点中…" : "暂无授权测点"}</option>}{points.map((item) => <option key={item.id} value={item.id}>{item.name}{item.unit ? ` (${item.unit})` : ""}</option>)}</Select></label>
        <label className="analytics-report-field"><span>开始时间</span><input aria-label="开始时间" type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label className="analytics-report-field"><span>结束时间</span><input aria-label="结束时间" type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        <label className="analytics-report-field"><span>粒度</span><Select aria-label="粒度" value={String(minutes)} onChange={(event) => setMinutes(Number(event.target.value))}>{[1, 5, 15, 30, 60].map((value) => <option key={value} value={value}>{value} 分钟</option>)}</Select></label>
        <Button variant="primary" disabled={!canReadStationTelemetry || !point || loadingHistory} onClick={() => void query()}>{loadingHistory ? "查询中…" : "查询历史"}</Button>
        {tab === "数据下载" && <Button disabled={!canReadStationTelemetry || !rows.length} onClick={exportData}>导出查询 CSV</Button>}
      </div></section>
      {tab === "数据分析" ? <section className="analytics-download-records"><h2>历史采样曲线</h2>{rows.length ? <><div className="analytics-ai-chart api-analytics-chart" aria-label="历史采样曲线"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows}><CartesianGrid stroke="#e6edf2" /><XAxis dataKey="time" minTickGap={35} /><YAxis domain={["auto", "auto"]} unit={point?.unit} /><Tooltip /><Line dataKey="value" name={point?.name} stroke="#2f7c6a" dot={false} connectNulls={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div><p className="api-analytics-hint">{rows.length} 个采样区间 · 数值为服务器返回的区间平均值。</p></> : <div className="api-analytics-chart-empty"><strong>{loadingHistory ? "正在查询历史数据" : loadingPoints ? "正在加载测点" : points.length ? "暂无采样数据" : "暂无授权测点"}</strong><p>选择站点、测点与时间范围后查询。缺失采样不会显示为零。</p></div>}</section> : <section className="analytics-download-records"><h2>采样数据</h2><div className="analytics-download-table-wrap"><table className="ui-table api-analytics-data-table"><thead><tr>{["采样时间", "测点", "区间平均值", "单位", "采样数"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{chartRows.length ? chartRows.map((row) => <tr key={row.timestamp}><td>{row.time}</td><td>{point?.name}</td><td>{row.value}</td><td>{point?.unit || "—"}</td><td>{row.samples}</td></tr>) : <tr><td colSpan={5} className="api-analytics-table-empty">{loadingHistory ? "正在查询历史数据…" : "暂无采样数据，请选择测点与时间范围后查询"}</td></tr>}</tbody></table></div><footer className="analytics-download-records-footer">共 {rows.length} 个采样区间</footer></section>}
    </section>}
  </main>
}
