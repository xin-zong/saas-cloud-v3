import { useEffect, useRef, useState } from "react"
import EmsPanel from "./EmsPanel"
import type { Station } from "@/App"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import type { UserRole } from "@/auth/roles"
import { Button, Select } from "./ui/Workspace"
import { downloadServerReport, type ReportKind } from "./apiAnalytics"
import StationAnalysisPage from "./StationAnalysisPage"
import AnalyticsStationPicker from "./AnalyticsStationPicker"
import AnalyticsDataDownload from "./AnalyticsDataDownload"
import AnalyticsAudit from "./AnalyticsAudit"
import "./analytics-ai.css"
import "./api-analytics.css"

type Tab = "数据分析" | "数据下载" | "报告中心"
type ReportType = "运营报告" | "收益报告" | "设备健康报告"
const REPORTS: Array<{ label: ReportType; kind: ReportKind; permission: string }> = [
  { label: "运营报告", kind: "operations", permission: "strategy.read" },
  { label: "收益报告", kind: "revenue", permission: "revenue.read" },
  { label: "设备健康报告", kind: "health", permission: "asset.read" },
]
type Props = { stations: Station[]; allowedTabs: readonly Tab[]; allowedReportTypes: readonly ReportType[]; role: UserRole }
const dateText = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
export default function ApiAnalyticsPage(props: Props) {
  const { user } = useAuth()
  return <ApiAnalyticsWorkspace {...props} accountKey={`${user?.id}|${user?.account}`} />
}
function ApiAnalyticsWorkspace({ stations, allowedTabs, allowedReportTypes, accountKey }: Props & { accountKey: string }) {
  const { user } = useAuth()
  const telemetryStations = stations.filter(s => hasStationPermission(user, s.id, "telemetry.read"))
  const reportsFor = (id?: string) => REPORTS.filter(r => allowedReportTypes.includes(r.label) && hasStationPermission(user, id, "report.export") && hasStationPermission(user, id, r.permission))
  const reportStations = stations.filter(s => reportsFor(s.id).length)
  const tabs = allowedTabs.filter(t => t === "报告中心" ? reportStations.length : telemetryStations.length)
  const [requestedTab, setTab] = useState<Tab>(tabs[0] ?? "数据分析")
  const tab = tabs.includes(requestedTab) ? requestedTab : tabs[0]
  const [stationId, setStationId] = useState(telemetryStations[0]?.id ?? "")
  const station = telemetryStations.find(s => s.id === stationId) ?? telemetryStations[0]
  const [audit, setAudit] = useState(false)
  const [reportStationId, setReportStationId] = useState(reportStations[0]?.id ?? "")
  const reportStation = reportStations.find(s => s.id === reportStationId) ?? reportStations[0]
  const reports = reportsFor(reportStation?.id)
  const [requestedKind, setReportKind] = useState<ReportKind>(reports[0]?.kind ?? "operations")
  const reportKind = reports.some(r => r.kind === requestedKind) ? requestedKind : reports[0]?.kind ?? "operations"
  const [from, setFrom] = useState(() => dateText(new Date(Date.now() - 7 * 86400000)))
  const [to, setTo] = useState(() => dateText(new Date()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [preview, setPreview] = useState(false)
  const reportRequest = useRef<AbortController | null>(null)
  const previewDialog = useRef<HTMLDialogElement>(null)
  const scopeKey = `${accountKey}|${JSON.stringify(user?.stationPermissions)}|${allowedTabs.join()}|${allowedReportTypes.join()}`
  useEffect(() => { reportRequest.current?.abort(); setBusy(false); setError(""); setNotice(""); setPreview(false); return () => reportRequest.current?.abort() }, [scopeKey, reportStation?.id, reportKind, from, to])
  useEffect(() => { if (preview) previewDialog.current?.showModal() }, [preview])
  async function exportReport() {
    if (!reportStation || !reports.some(r => r.kind === reportKind)) return
    reportRequest.current?.abort()
    const request = new AbortController(); reportRequest.current = request
    setBusy(true); setError(""); setNotice("")
    try {
      await downloadServerReport(reportStation.id, reportKind, from, to, request.signal)
      if (!request.signal.aborted) setNotice("服务器报告已开始下载。")
    } catch (cause) { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "报告下载失败，请重试") }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  return <main className="ui-page analytics-ai-page api-analytics-page" aria-label="分析与报告">
    <EmsPanel stations={station ? [station] : telemetryStations} module="analysis" />
    <div className="analytics-report-tabs" role="tablist" aria-label="分析与报告视图"><div>{tabs.map(t => <button type="button" key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setError(""); setNotice("") }}>{t}</button>)}</div><span>服务器数据</span></div>
    {!tab ? <section className="analytics-empty-state"><h2>暂无授权站点</h2></section> : tab === "数据分析" && station ? <>
      <div className="analytics-analysis-switch"><button type="button" aria-pressed={!audit} onClick={() => setAudit(false)}>信号分析</button><button type="button" aria-pressed={audit} onClick={() => setAudit(true)}>事件审计</button></div>
      {audit ? <AnalyticsAudit stations={stations} key={`${accountKey}|${user?.permissions.includes("audit.read")}`} /> : <StationAnalysisPage key={`${scopeKey}|${station.id}`} station={station} analyticsFeatures stationSelector={<AnalyticsStationPicker stations={telemetryStations} value={station.id} onChange={setStationId} />} />}
    </> : tab === "数据下载" ? <AnalyticsDataDownload key={scopeKey} stations={telemetryStations} /> : <section className="analytics-ai-content analytics-report-center analytics-report-workspace" aria-label="报告中心">
      <div className="analytics-report-filters">
        <label className="analytics-report-field"><span>报告类型</span><Select aria-label="报告类型" value={reportKind} onChange={e => setReportKind(e.target.value as ReportKind)}>{reports.map(r => <option key={r.kind} value={r.kind}>{r.label}</option>)}</Select></label>
        <label className="analytics-report-field"><span>站点选择</span><Select aria-label="报告站点" value={reportStation?.id ?? ""} onChange={e => setReportStationId(e.target.value)}>{reportStations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>
        <div className="analytics-report-field"><span>日期范围</span><div className="analytics-date-pair"><input aria-label="报告开始日期" type="date" value={from} onChange={e => setFrom(e.target.value)} /><span>—</span><input aria-label="报告结束日期" type="date" value={to} onChange={e => setTo(e.target.value)} /></div></div>
        <Button variant="primary" disabled={busy || !reports.length} onClick={() => void exportReport()}>{busy ? "下载中…" : "下载 CSV 报告"}</Button>
      </div>
      {error && <div role="alert" className="analytics-report-notice">{error}</div>}{notice && <div role="status" className="analytics-report-notice">{notice}</div>}
      <div className="analytics-report-capability"><p className="api-analytics-hint">运营、收益和设备健康 CSV 报告已接通，按所选站点与日期即时下载。服务器生成任务、历史记录及排版报告服务尚未接通。</p><Button disabled={!reports.length} onClick={() => setPreview(true)}>预览报告范围</Button></div>
      <section className="analytics-report-records"><h2>生成记录</h2><div className="analytics-report-table-wrap"><table className="ui-table analytics-report-table"><thead><tr>{["报告名称", "站点", "统计时段", "生成时间", "状态", "操作"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody><tr><td colSpan={6} className="api-analytics-table-empty">暂无可展示的生成记录 · 服务器历史服务未接通</td></tr></tbody></table></div></section>
      {preview && <dialog ref={previewDialog} className="ui-dialog analytics-report-preview-dialog" aria-label="报告范围预览" onCancel={() => setPreview(false)}><header className="analytics-report-preview-header"><h2>报告范围预览</h2><Button onClick={() => setPreview(false)}>关闭</Button></header><div className="analytics-report-preview-body"><dl className="analytics-report-preview-meta">{[["报告类型", reports.find(r => r.kind === reportKind)?.label], ["站点", reportStation?.name], ["统计时段", `${from} — ${to}`], ["输出格式", "服务器 CSV"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="api-analytics-hint">此处仅预览查询范围，报告正文由服务器下载返回；不预填结论或收益。</p></div><footer className="analytics-report-preview-footer"><Button disabled={busy} onClick={() => void exportReport()}>下载报告</Button></footer></dialog>}
    </section>}
  </main>
}
