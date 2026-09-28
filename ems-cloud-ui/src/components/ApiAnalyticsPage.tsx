import { useEffect, useRef, useState } from "react"
import type { Station } from "@/App"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import type { UserRole } from "@/auth/roles"
import { Button, Select } from "./ui/Workspace"
import { exactValueText, jobStatusText, loadAnalysisPreview, reportDateRange, reportBusinessDate, reportCapabilityAllowed, type AnalysisJob, type AnalysisPreview, type ReportKind } from "./apiAnalytics"
import { useAnalysisJobs } from "./useAnalysisJobs"
import StationAnalysisPage from "./StationAnalysisPage"
import AnalyticsStationPicker from "./AnalyticsStationPicker"
import AnalyticsDataDownload from "./AnalyticsDataDownload"
import AnalyticsAudit from "./AnalyticsAudit"
import "./analytics-ai.css"
import "./api-analytics.css"

type Tab = "数据分析" | "数据下载" | "报告中心"
type ReportType = "运营报告" | "收益报告" | "设备健康报告"
const REPORTS: Array<{ label: ReportType; kind: ReportKind }> = [
  { label: "运营报告", kind: "operations" },
  { label: "收益报告", kind: "revenue" },
  { label: "设备健康报告", kind: "health" },
]
type Props = { stations: Station[]; allowedTabs: readonly Tab[]; allowedReportTypes: readonly ReportType[]; role: UserRole }
const dateText = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" })
export default function ApiAnalyticsPage(props: Props) {
  const { user } = useAuth()
  return <ApiAnalyticsWorkspace {...props} accountKey={`${user?.id}|${user?.account}`} />
}
function ApiAnalyticsWorkspace({ stations, allowedTabs, allowedReportTypes, accountKey }: Props & { accountKey: string }) {
  const { user } = useAuth()
  const telemetryStations = stations.filter(station => hasStationPermission(user, station.id, "telemetry.read"))
  const reportStations = stations.filter(station => REPORTS.some(report => allowedReportTypes.includes(report.label) && reportCapabilityAllowed(report.kind, permission => hasStationPermission(user, station.id, permission))))
  const tabs = allowedTabs.filter(tab => tab === "报告中心" ? reportStations.length : telemetryStations.length)
  const [requestedTab, setTab] = useState<Tab>(tabs[0] ?? "数据分析")
  const tab = tabs.includes(requestedTab) ? requestedTab : tabs[0]
  const [stationId, setStationId] = useState(telemetryStations[0]?.id ?? "")
  const station = telemetryStations.find(item => item.id === stationId) ?? telemetryStations[0]
  const [audit, setAudit] = useState(false)
  const scopeKey = `${accountKey}|${JSON.stringify(user?.stationPermissions)}|${allowedTabs.join()}|${allowedReportTypes.join()}`
  return <main className="ui-page analytics-ai-page api-analytics-page" aria-label="分析与报告">
    <div className="analytics-report-tabs" role="tablist" aria-label="分析与报告视图"><div>{tabs.map(item => <button type="button" key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div><span>服务器数据</span></div>
    {!tab ? <section className="analytics-empty-state"><h2>暂无授权站点</h2></section> : tab === "数据分析" && station ? <>
      <div className="analytics-analysis-switch"><button type="button" aria-pressed={!audit} onClick={() => setAudit(false)}>信号分析</button><button type="button" aria-pressed={audit} onClick={() => setAudit(true)}>事件审计</button></div>
      {audit ? <AnalyticsAudit stations={stations} key={`${accountKey}|${user?.permissions.includes("audit.read")}`} /> : <StationAnalysisPage key={`${scopeKey}|${station.id}`} station={station} analyticsFeatures stationSelector={<AnalyticsStationPicker stations={telemetryStations} value={station.id} onChange={setStationId} />} />}
    </> : tab === "数据下载" ? <AnalyticsDataDownload key={scopeKey} stations={telemetryStations} /> : <ReportCenter key={scopeKey} stations={reportStations} allowedReportTypes={allowedReportTypes} />}
  </main>
}

function ReportCenter({ stations, allowedReportTypes }: { stations: Station[]; allowedReportTypes: readonly ReportType[] }) {
  const { user } = useAuth()
  const [stationId, setStationId] = useState(stations[0]?.id ?? "")
  const station = stations.find(item => item.id === stationId) ?? stations[0]
  const reports = REPORTS.filter(report => allowedReportTypes.includes(report.label) && reportCapabilityAllowed(report.kind, permission => hasStationPermission(user, station?.id, permission)))
  const [requestedKind, setReportKind] = useState<ReportKind>(reports[0]?.kind ?? "operations")
  const kind = reports.some(report => report.kind === requestedKind) ? requestedKind : reports[0]?.kind ?? "operations"
  const [from, setFrom] = useState(() => dateText(new Date(Date.now() - 7 * 86400000)))
  const [to, setTo] = useState(() => dateText(new Date()))
  const [preview, setPreview] = useState<AnalysisPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const previewRequest = useRef<AbortController | null>(null)
  const previewDialog = useRef<HTMLDialogElement>(null)
  const jobs = useAnalysisJobs(station?.id, kind)
  useEffect(() => {
    previewRequest.current?.abort(); setPreview(null); setPreviewBusy(false)
    return () => previewRequest.current?.abort()
  }, [station?.id, kind, from, to])
  useEffect(() => { if (preview) previewDialog.current?.showModal() }, [preview])
  useEffect(() => { jobs.cancel() }, [from, to])
  async function openPreview(job: AnalysisJob) {
    previewRequest.current?.abort()
    const request = new AbortController(); previewRequest.current = request
    setPreviewBusy(true); jobs.setError("")
    try {
      const body = await loadAnalysisPreview(job.id, request.signal)
      if (!request.signal.aborted && body.job.stationId === station?.id && body.job.kind === kind) setPreview(body)
    } catch (cause) { if (!request.signal.aborted) jobs.setError(cause instanceof Error ? cause.message : "报告正文读取失败") }
    finally { if (!request.signal.aborted) setPreviewBusy(false) }
  }
  async function generate() {
    try {
      const range = reportDateRange(from, to)
      const job = await jobs.generate({ kind, ...range })
      if (job?.status === "completed") await openPreview(job)
    } catch (cause) { jobs.setError(cause instanceof Error ? cause.message : "请选择有效报告日期范围") }
  }
  return <section className="analytics-ai-content analytics-report-center analytics-report-workspace" aria-label="报告中心">
    <div className="analytics-report-filters">
      <label className="analytics-report-field"><span>报告类型</span><Select aria-label="报告类型" value={kind} onChange={event => setReportKind(event.target.value as ReportKind)}>{reports.map(report => <option key={report.kind} value={report.kind}>{report.label}</option>)}</Select></label>
      <label className="analytics-report-field"><span>站点选择</span><Select aria-label="报告站点" value={station?.id ?? ""} onChange={event => setStationId(event.target.value)}>{stations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
      <div className="analytics-report-field"><span>日期范围</span><div className="analytics-date-pair"><input aria-label="报告开始日期" type="date" value={from} onChange={event => setFrom(event.target.value)} /><span>—</span><input aria-label="报告结束日期" type="date" value={to} onChange={event => setTo(event.target.value)} /></div></div>
      <Button variant="primary" disabled={jobs.busy || !reports.length} onClick={() => void generate()}>{jobs.busy ? "生成中…" : "生成报告"}</Button>
      {jobs.busy && <Button onClick={jobs.cancel}>取消等待</Button>}
    </div>
    {jobs.error && <div role="alert" className="analytics-report-notice">{jobs.error}</div>}{previewBusy && <div role="status" className="analytics-report-notice">正在读取报告正文…</div>}
    <div className="analytics-report-capability"><p className="api-analytics-hint">报告按所选站点与日期生成，正文和 CSV 使用同一份服务器数据。生成记录长期保存；缺少依据的指标显示为空。</p><Button disabled={jobs.loading} onClick={jobs.reload}>刷新记录</Button></div>
    <section className="analytics-report-records"><h2>生成记录</h2><div className="analytics-report-table-wrap"><table className="ui-table analytics-report-table"><thead><tr>{["报告名称", "站点", "统计时段", "生成时间", "状态", "操作"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{jobs.records.map(job => <tr key={job.id}><td>{REPORTS.find(report => report.kind === job.kind)?.label ?? job.kind}</td><td>{station?.name}</td><td>{reportBusinessDate(job.from)} — {reportBusinessDate(new Date(Date.parse(job.to) - 1).toISOString())}</td><td>{reportBusinessDate(job.createdAt, true)}</td><td><span>{jobStatusText(job.status)}</span>{job.error && <p role="alert">{job.error}</p>}</td><td>{job.status === "completed" ? <><button type="button" className="analytics-download-link" disabled={previewBusy || jobs.busy} onClick={() => void openPreview(job)}>预览</button><button type="button" className="analytics-download-link" disabled={jobs.busy} onClick={() => void jobs.download(job)}>下载 CSV</button></> : job.status === "failed" ? <Button disabled={jobs.busy} onClick={() => void jobs.retry(job)}>重试</Button> : "—"}</td></tr>)}{!jobs.records.length && <tr><td colSpan={6} className="api-analytics-table-empty">{jobs.loading ? "正在读取生成记录…" : "暂无生成记录，请选择日期后生成报告"}</td></tr>}</tbody></table></div><footer className="analytics-download-records-footer"><span>服务器持久记录 · 第 {Math.floor(jobs.offset / 20) + 1} 页</span><Button disabled={!jobs.offset || jobs.loading} onClick={() => jobs.setOffset(value => Math.max(0, value - 20))}>上一页</Button><Button disabled={jobs.records.length < 20 || jobs.loading} onClick={() => jobs.setOffset(value => value + 20)}>下一页</Button></footer></section>
    {preview && <dialog ref={previewDialog} className="ui-dialog analytics-report-preview-dialog" aria-label="报告正文预览" onCancel={() => setPreview(null)}><header className="analytics-report-preview-header"><h2>{REPORTS.find(report => report.kind === preview.job.kind)?.label} · 报告预览</h2><Button onClick={() => setPreview(null)}>关闭</Button></header><div className="analytics-report-preview-body"><dl className="analytics-report-preview-meta">{[["站点", station?.name], ["统计时段", `${reportBusinessDate(preview.job.from, true)} — ${reportBusinessDate(preview.job.to, true)}（结束时间不含）`], ["生成时间", reportBusinessDate(preview.job.createdAt, true)], ["输出格式", "CSV"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}{preview.summary.map((item, index) => <div key={`${item.label}-${index}`}><dt>{item.label}</dt><dd>{item.value == null ? "—" : `${item.value}${item.unit ? ` ${item.unit}` : ""}`}</dd></div>)}</dl>{preview.sections.map((section, index) => <section className="analytics-report-preview-section" key={`${section.title}-${index}`}><h3>{section.title}</h3><div className="analytics-report-table-wrap"><table className="ui-table analytics-report-table"><thead><tr>{section.columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{section.rows.map((row, rowIndex) => <tr key={rowIndex}>{section.columns.map(column => <td key={column.key}>{exactValueText(row[column.key])}</td>)}</tr>)}{!section.rows.length && <tr><td colSpan={Math.max(1, section.columns.length)} className="api-analytics-table-empty">此统计时段暂无数据</td></tr>}</tbody></table></div></section>)}{!preview.sections.length && <p className="api-analytics-hint">此统计时段暂无报告明细。</p>}</div><footer className="analytics-report-preview-footer"><Button disabled={jobs.busy} onClick={() => void jobs.download(preview.job)}>下载 CSV 报告</Button></footer></dialog>}
  </section>
}
