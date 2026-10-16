import { localized as __locale } from '@/preferences/date'
import { useCallback, useEffect, useRef, useState } from "react"
import type { Station } from "@/App"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import type { UserRole } from "@/auth/roles"
import { Button, Select } from "./ui/Workspace"
import { exactValueText, jobStatusText, loadAnalysisPreview, reportDateRange, reportBusinessDate, reportCapabilityAllowed, type AnalysisJob, type AnalysisPreview, type ReportKind } from "./apiAnalytics"
import ReportTemplatesPanel from './ReportTemplatesPanel'
import { loadReportTemplates, loadReportTemplateFields, reportPeriodDates, REPORT_TIME_LABELS, type ReportTemplate, type ReportTemplateCatalog, type ReportTimeType } from '@/api/reportTemplates'
import type { RegisterLeaveGuard } from './useEditorLeaveGuard'
import './report-templates.css'
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
type Props = { registerLeaveGuard?: RegisterLeaveGuard; stations: Station[]; allowedTabs: readonly Tab[]; allowedReportTypes: readonly ReportType[]; role: UserRole }
const dateText = (date: Date) => __locale(date, 'toLocaleDateString', "en-CA", { timeZone: "Asia/Shanghai" })
export default function ApiAnalyticsPage(props: Props) {
  const { user } = useAuth()
  return <ApiAnalyticsWorkspace {...props} accountKey={`${user?.id}|${user?.account}`} />
}
function ApiAnalyticsWorkspace({ stations, allowedTabs, allowedReportTypes, accountKey, registerLeaveGuard }: Props & { accountKey: string }) {
  const { user } = useAuth()
  const templateGuard = useRef<null | (() => Promise<boolean>)>(null)
  const registerTemplateGuard = useCallback((guard: null | (() => Promise<boolean>)) => { templateGuard.current = guard }, [])
  const requestTemplateLeave = () => templateGuard.current?.() ?? Promise.resolve(true)
  useEffect(() => { registerLeaveGuard?.(requestTemplateLeave); return () => registerLeaveGuard?.(null) }, [registerLeaveGuard])
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
    <div className="analytics-report-tabs" role="tablist" aria-label="分析与报告视图"><div>{tabs.map(item => <button type="button" key={item} role="tab" aria-selected={tab === item} onClick={async () => { if (await requestTemplateLeave()) setTab(item) }}>{item}</button>)}</div><span>服务器数据</span></div>
    {!tab ? <section className="analytics-empty-state"><h2>暂无授权站点</h2></section> : tab === "数据分析" && station ? <>
      <div className="analytics-analysis-switch"><button type="button" aria-pressed={!audit} onClick={() => setAudit(false)}>信号分析</button><button type="button" aria-pressed={audit} onClick={() => setAudit(true)}>事件审计</button></div>
      {audit ? <AnalyticsAudit stations={stations} key={`${accountKey}|${user?.permissions.includes("audit.read")}`} /> : <StationAnalysisPage key={`${scopeKey}|${station.id}`} station={station} analyticsFeatures stationSelector={<AnalyticsStationPicker stations={telemetryStations} value={station.id} onChange={setStationId} />} />}
    </> : tab === "数据下载" ? <AnalyticsDataDownload key={scopeKey} stations={telemetryStations} /> : <ReportCenter registerLeaveGuard={registerTemplateGuard} requestLeave={requestTemplateLeave} key={scopeKey} stations={reportStations} allowedReportTypes={allowedReportTypes} />}
  </main>
}

function ReportCenter({ stations, allowedReportTypes, registerLeaveGuard, requestLeave }: { stations: Station[]; allowedReportTypes: readonly ReportType[]; registerLeaveGuard: RegisterLeaveGuard; requestLeave: () => Promise<boolean> }) {
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
  const [timeType, setTimeType] = useState<ReportTimeType>('range')
  const [day, setDay] = useState(() => dateText(new Date())), [month, setMonth] = useState(() => dateText(new Date()).slice(0, 7)), [year, setYear] = useState(() => dateText(new Date()).slice(0, 4))
  const [templateRows, setTemplateRows] = useState<ReportTemplate[]>([]), [templateCatalog, setTemplateCatalog] = useState<ReportTemplateCatalog | null>(null)
  const [templateId, setTemplateId] = useState(''), [templateError, setTemplateError] = useState(''), [templateBusy, setTemplateBusy] = useState(false), [templateLoaded, setTemplateLoaded] = useState(false), [templatesOpen, setTemplatesOpen] = useState(false)
  const templateSequence = useRef(0), templateAlive = useRef(true)
  const selectedTemplate = templateRows.find(template => template.id === templateId && template.kind === kind && template.timeType === timeType)
  const canManage = !!station && hasStationPermission(user, station.id, 'report.export')
  async function refreshTemplates() {
    const request = ++templateSequence.current
    setTemplateBusy(true); setTemplateError('')
    try {
      const [rows, catalog] = await Promise.all([loadReportTemplates(kind), loadReportTemplateFields(kind)])
      if (!templateAlive.current || request !== templateSequence.current) return
      if (!Array.isArray(rows) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.fields) || !Array.isArray(catalog.timeTypes)) throw new Error('报表模板服务尚未返回有效目录，仍可使用默认报告配置。')
      setTemplateRows(rows); setTemplateCatalog(catalog); setTemplateLoaded(true)
    } catch (cause) { if (templateAlive.current && request === templateSequence.current) setTemplateError(cause instanceof Error ? cause.message : '模板读取失败') }
    finally { if (templateAlive.current && request === templateSequence.current) setTemplateBusy(false) }
  }
  useEffect(() => { templateAlive.current = true; return () => { templateAlive.current = false; templateSequence.current++ } }, [])
  useEffect(() => { setTemplateRows([]); setTemplateCatalog(null); setTemplateLoaded(false); setTemplateId(''); void refreshTemplates(); return () => { templateSequence.current++ } }, [kind])
  async function contextChange(action: () => void) { if (await requestLeave()) { setTemplatesOpen(false); action() } }
  function templatesChanged(rows: ReportTemplate[]) { templateSequence.current++; setTemplateRows(rows.filter(template => template.kind === kind)); setTemplateLoaded(true); setTemplateBusy(false) }
  useEffect(() => {
    previewRequest.current?.abort(); setPreview(null); setPreviewBusy(false)
    return () => previewRequest.current?.abort()
  }, [station?.id, kind, from, to, timeType, day, month, year, templateId])
  useEffect(() => { if (preview) previewDialog.current?.showModal() }, [preview])
  useEffect(() => { jobs.cancel() }, [from, to, timeType, day, month, year, templateId])
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
      if (templateId && (!templateLoaded || !selectedTemplate)) throw new Error('所选模板已变化或删除，请刷新并重新选择模板。')
      const dates = reportPeriodDates(timeType, { day, month, year, from, to })
      const range = reportDateRange(dates.from, dates.to)
      const job = await jobs.generate({ kind, ...range, ...(selectedTemplate ? { templateId: selectedTemplate.id, expectedTemplateVersion: selectedTemplate.version } : {}) })
      if (job?.status === "completed") await openPreview(job)
    } catch (cause) { jobs.setError(cause instanceof Error ? cause.message : "请选择有效报告日期范围") }
  }
  return <section className="analytics-ai-content analytics-report-center analytics-report-workspace" aria-label="报告中心" data-design-node="1093:1039">
    <div className="analytics-report-filters">
      <label className="analytics-report-field"><span>报告类型</span><Select aria-label="报告类型" value={kind} onChange={event => { const next = event.target.value as ReportKind; void contextChange(() => setReportKind(next)) }}>{reports.map(report => <option key={report.kind} value={report.kind}>{report.label}</option>)}</Select></label>
      <label className="analytics-report-field"><span>站点选择</span><Select aria-label="报告站点" value={station?.id ?? ""} onChange={event => { const next = event.target.value; void contextChange(() => setStationId(next)) }}>{stations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
      <div className="analytics-report-field"><span>{REPORT_TIME_LABELS[timeType]}</span><div className="analytics-date-pair">{timeType === 'day' ? <input aria-label="报告日期" type="date" value={day} onChange={event => setDay(event.target.value)} /> : timeType === 'month' ? <input aria-label="报告月份" type="month" value={month} onChange={event => setMonth(event.target.value)} /> : timeType === 'year' ? <input aria-label="报告年份" type="number" min="1" max="9999" value={year} onChange={event => setYear(event.target.value)} /> : <><input aria-label="报告开始日期" type="date" value={from} onChange={event => setFrom(event.target.value)} /><span>—</span><input aria-label="报告结束日期" type="date" value={to} onChange={event => setTo(event.target.value)} /></>}</div></div>
      <Button variant="primary" disabled={jobs.busy || !reports.length} onClick={() => void generate()}>{jobs.busy ? "生成中…" : "生成报告"}</Button>
      {jobs.busy && <Button onClick={jobs.cancel}>取消等待</Button>}
    </div>
    <div className="report-template-filter-row">
      <label>周期选择<select aria-label="报告周期选择" value={timeType} onChange={event => { const next = event.target.value as ReportTimeType; void contextChange(() => { setTimeType(next); setTemplateId('') }) }}>{(templateCatalog?.timeTypes ?? Object.entries(REPORT_TIME_LABELS).map(([code, label]) => ({ code, label }))).map(type => <option key={type.code} value={type.code}>{type.label}</option>)}</select></label>
      <label>报表模板<select aria-label="生成报表模板" disabled={templateBusy || !templateLoaded || jobs.busy} value={templateId} onChange={event => { const next = event.target.value; void contextChange(() => setTemplateId(next)) }}><option value="">默认报告配置（不使用模板）</option>{templateId && !selectedTemplate && <option value={templateId} disabled>所选模板不可用，请重新选择</option>}{templateRows.filter(template => template.kind === kind && template.timeType === timeType).map(template => <option key={template.id} value={template.id}>{template.name}{template.origin === 'system' ? '（系统）' : '（私人）'}</option>)}</select></label>
      <Button disabled={!canManage || templateBusy || !templateLoaded || jobs.busy} onClick={async () => { if (await requestLeave()) setTemplatesOpen(true) }}>报表模板管理</Button>
      <Button disabled={templateBusy || jobs.busy} onClick={async () => { if (await requestLeave()) await refreshTemplates() }}>刷新报表模板</Button>
    </div>
    {templatesOpen && <ReportTemplatesPanel kind={kind} canEdit={canManage} registerLeaveGuard={registerLeaveGuard} onChanged={templatesChanged} onClose={() => setTemplatesOpen(false)} />}
    {templateError && <p role="alert" className="analytics-report-notice">{templateError}</p>}
    {jobs.error && <div role="alert" className="analytics-report-notice">{jobs.error}</div>}{previewBusy && <div role="status" className="analytics-report-notice">正在读取报告正文…</div>}
    <div className="analytics-report-capability"><p className="api-analytics-hint">报告按所选站点与日期生成，正文和 CSV 使用同一份服务器数据。生成记录长期保存；缺少依据的指标显示为空。</p><Button disabled={jobs.loading} onClick={jobs.reload}>刷新记录</Button></div>
    <section className="analytics-report-records"><h2>生成记录</h2><div className="analytics-report-table-wrap"><table className="ui-table analytics-report-table"><thead><tr>{["报告名称", "站点", "统计时段", "生成时间", "状态", "操作"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{jobs.records.map(job => <tr key={job.id}><td>{REPORTS.find(report => report.kind === job.kind)?.label ?? job.kind}{job.templateSnapshot && <small className="report-template-snapshot">模板：{job.templateSnapshot.name}</small>}</td><td>{station?.name}</td><td>{reportBusinessDate(job.from)} — {reportBusinessDate(new Date(Date.parse(job.to) - 1).toISOString())}</td><td>{reportBusinessDate(job.createdAt, true)}</td><td><span>{jobStatusText(job.status)}</span>{job.error && <p role="alert">{job.error}</p>}</td><td>{job.status === "completed" ? <><button type="button" className="analytics-download-link" disabled={previewBusy || jobs.busy} onClick={() => void openPreview(job)}>预览</button><button type="button" className="analytics-download-link" disabled={jobs.busy} onClick={() => void jobs.download(job)}>下载 CSV</button></> : job.status === "failed" ? <Button disabled={jobs.busy} onClick={() => void jobs.retry(job)}>重试</Button> : "—"}</td></tr>)}{!jobs.records.length && <tr><td colSpan={6} className="api-analytics-table-empty">{jobs.loading ? "正在读取生成记录…" : "暂无生成记录，请选择日期后生成报告"}</td></tr>}</tbody></table></div><footer className="analytics-download-records-footer"><span>服务器持久记录 · 第 {Math.floor(jobs.offset / 20) + 1} 页</span><Button disabled={!jobs.offset || jobs.loading} onClick={() => jobs.setOffset(value => Math.max(0, value - 20))}>上一页</Button><Button disabled={jobs.records.length < 20 || jobs.loading} onClick={() => jobs.setOffset(value => value + 20)}>下一页</Button></footer></section>
    {preview && <dialog ref={previewDialog} className="ui-dialog analytics-report-preview-dialog" aria-label="报告正文预览" onCancel={() => setPreview(null)}><header className="analytics-report-preview-header"><h2>{REPORTS.find(report => report.kind === preview.job.kind)?.label} · 报告预览</h2><Button onClick={() => setPreview(null)}>关闭</Button></header><div className="analytics-report-preview-body"><dl className="analytics-report-preview-meta">{[["站点", station?.name], ...(preview.job.templateSnapshot ? [["模板", preview.job.templateSnapshot.name], ["模板版本", String(preview.job.templateSnapshot.version)]] : []), ["统计时段", `${reportBusinessDate(preview.job.from, true)} — ${reportBusinessDate(preview.job.to, true)}（结束时间不含）`], ["生成时间", reportBusinessDate(preview.job.createdAt, true)], ["输出格式", "CSV"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}{preview.summary.map((item, index) => <div key={`${item.label}-${index}`}><dt>{item.label}</dt><dd>{item.value == null ? "—" : `${item.value}${item.unit ? ` ${item.unit}` : ""}`}</dd></div>)}</dl>{preview.sections.map((section, index) => <section className="analytics-report-preview-section" key={`${section.title}-${index}`}><h3>{section.title}</h3><div className="analytics-report-table-wrap"><table className="ui-table analytics-report-table"><thead><tr>{section.columns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{section.rows.map((row, rowIndex) => <tr key={rowIndex}>{section.columns.map(column => <td key={column.key}>{exactValueText(row[column.key])}</td>)}</tr>)}{!section.rows.length && <tr><td colSpan={Math.max(1, section.columns.length)} className="api-analytics-table-empty">此统计时段暂无数据</td></tr>}</tbody></table></div></section>)}{!preview.sections.length && <p className="api-analytics-hint">此统计时段暂无报告明细。</p>}</div><footer className="analytics-report-preview-footer"><Button disabled={jobs.busy} onClick={() => void jobs.download(preview.job)}>下载 CSV 报告</Button></footer></dialog>}
  </section>
}
