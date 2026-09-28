import { api, getToken, setToken, getSessionVersion, refreshAfterForbidden, ApiError } from "@/api/client"

export type MeasurementPoint = { id: string; name: string; unit: string; device_id: string; device_name?: string; source?: "ems" | "legacy"; sourceId?: string; namespace?: string; valueType?: string; aggregation?: string[] }
export type HistoryBucket = { timestamp: number; value: number | null; samples: number; exactValue?: unknown; valueType?: string; quality?: string; sourceTime?: number | null; receivedAt?: number | null; aggregation?: string; evidence?: Record<string, unknown>[]; staleReason?: unknown }
export type ReportKind = "operations" | "revenue" | "health"
export const REPORT_CAPABILITIES: Record<ReportKind, readonly string[]> = {
  operations: ["report.export", "strategy.read", "telemetry.read"],
  revenue: ["report.export", "revenue.read"],
  health: ["report.export", "asset.read", "alarm.read", "telemetry.read"],
}
export const reportCapabilityAllowed = (kind: ReportKind, check: (permission: string) => boolean) => REPORT_CAPABILITIES[kind].every(check)
export const reportBusinessDate = (value: string, includeTime = false) => includeTime
  ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
  : new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })

export async function loadPoints(stationId: string, signal?: AbortSignal): Promise<MeasurementPoint[]> {
  const rows = await api<Array<Record<string, unknown>>>(`/stations/${encodeURIComponent(stationId)}/points`, { signal })
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? row.code ?? row.id),
    unit: String(row.unit ?? ""),
    device_id: String(row.device_id ?? ""),
    ...(row.device_name == null ? {} : { device_name: String(row.device_name) }),
    ...(row.source == null ? {} : { source: row.source === "ems" ? "ems" as const : "legacy" as const }),
    ...(row.sourceId == null ? {} : { sourceId: String(row.sourceId) }),
    ...(row.namespace == null ? {} : { namespace: String(row.namespace) }),
    ...(row.valueType == null ? {} : { valueType: String(row.valueType) }),
    ...(row.supportedAggregations == null && row.aggregation == null ? {} : { aggregation: Array.isArray(row.supportedAggregations ?? row.aggregation) ? (row.supportedAggregations ?? row.aggregation) as string[] : [String(row.aggregation)] }),
  }))
}

export async function loadHistory(point: string | MeasurementPoint, from: Date, to: Date, minutes: number, signal?: AbortSignal, requestedAggregation?: string): Promise<HistoryBucket[]> {
  if (![1, 5, 15, 30, 60].includes(minutes) || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 31 * 86400000) {
    throw new Error("请选择 31 天内有效时间段和采样粒度。")
  }
  const pointId = typeof point === "string" ? point : point.id
  const source = typeof point !== "string" && point.source === "ems" ? "ems" : "legacy"
  const aggregation = requestedAggregation ?? (source === "ems" ? "last" : "avg")
  const allowed = typeof point !== "string" && point.aggregation?.length ? point.aggregation : source === "ems" ? ["last"] : ["avg", "min", "max", "last"]
  if (!allowed.includes(aggregation)) throw new Error("此测点不支持所选聚合方式。")
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), minutes: String(minutes), source, aggregation })
  const rows = await api<Array<Record<string, unknown>>>(`/points/${encodeURIComponent(pointId)}/history?${query}`, { signal })
  if (source === "ems") return rows.filter(row => row.timestamp !== null && row.timestamp !== "" && Number.isFinite(Number(row.timestamp))).map(row => adaptHistoryBucket(row))
  return rows.filter(row => row.timestamp !== null && row.timestamp !== "" && row.value !== null && row.value !== "" && row.samples !== null && row.samples !== "").map((row) => ({ timestamp: Number(row.timestamp), value: Number(row.value), samples: Number(row.samples) }))
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.value) && Number.isFinite(row.samples) && row.samples > 0)
}

export function adaptHistoryBucket(row: Record<string, unknown>): HistoryBucket {
  const evidence = Array.isArray(row.evidence) ? row.evidence as Record<string, unknown>[] : []
  const selected = Object.prototype.hasOwnProperty.call(row, "selectedSourceTimeKind") ? evidence.filter(item => item.sourceTimeKind === row.selectedSourceTimeKind) : evidence
  const ordered = [...selected].sort((a, b) => Number(a.sourceTime) - Number(b.sourceTime) || Number(a.receivedAt) - Number(b.receivedAt))
  const last = ordered[ordered.length - 1]
  const valueType = String(last?.valueType ?? row.valueType ?? "unknown")
  const quality = String(row.quality ?? "unknown")
  const numeric = row.aggregation === "last" ? valueType === "number" : selected.some(item => item.quality === "valid") && selected.filter(item => item.quality === "valid" && item.valueType !== "null").every(item => item.valueType === "number")
  const value = quality === "valid" && numeric && !row.conflict && !row.resetUnknown && row.value !== null && row.value !== "" ? Number(row.value) : NaN
  return { timestamp: Number(row.timestamp), value: Number.isFinite(value) ? value : null, samples: Number(row.samples ?? 0), exactValue: row.value ?? null,
    valueType, quality, sourceTime: typeof last?.sourceTime === "number" ? last.sourceTime : null, receivedAt: typeof last?.receivedAt === "number" ? last.receivedAt : null,
    aggregation: String(row.aggregation ?? "last"), evidence }
}

export function historyCsv(point: MeasurementPoint, rows: HistoryBucket[]): string {
  const cell = (value: string) => {
    const safe = /^[=+@\t\r\n-]/.test(value) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
  }
  return "\uFEFF" + [
    ["timestamp", "point_id", "point_name", "device", "source", "source_id", "namespace", "unit", "exact_value", "value_type", "quality", "stale_reason", "source_time", "received_at", "aggregation", "samples"],
    ...rows.map((row) => [new Date(row.timestamp).toISOString(), point.id, point.name, point.device_name ?? point.device_id, point.source ?? "legacy", point.sourceId ?? "", point.namespace ?? "", point.unit, exactValueText(row.exactValue ?? row.value), row.valueType ?? "number", row.quality ?? "valid", row.staleReason == null ? "" : String(row.staleReason), row.sourceTime == null ? "" : new Date(row.sourceTime).toISOString(), row.receivedAt == null ? "" : new Date(row.receivedAt).toISOString(), row.aggregation ?? "avg", String(row.samples)]),
  ].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
}

export const exactValueText = (value: unknown): string => value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value)
export type AnalysisJobKind = ReportKind | "telemetry"
export type AnalysisJobRequest = { kind: AnalysisJobKind; from: string; to: string; minutes?: number; pointIds?: string[] }
export type AnalysisJob = { id: string; stationId: string; kind: AnalysisJobKind; from: string; to: string; minutes: number | null; status: "pending" | "running" | "completed" | "failed"; createdAt: string; completedAt: string | null; error: string | null; pointIds: string[] }
export type AnalysisPreview = { job: AnalysisJob; summary: { label: string; value: string | null; unit?: string }[]; sections: { title: string; columns: { key: string; label: string }[]; rows: Record<string, unknown>[] }[] }
export const jobStatusText = (status: AnalysisJob["status"]) => ({ pending: "等待生成", running: "生成中", completed: "可下载", failed: "生成失败" })[status]

export function reportDateRange(from: string, to: string): { from: string; to: string } {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!valid(from) || !valid(to) || to < from) throw new Error("请选择有效报告日期范围。")
  const start = Date.parse(`${from}T00:00:00+08:00`), end = Date.parse(`${to}T00:00:00+08:00`) + 86400000
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
}

export async function createAnalysisJob(stationId: string, request: AnalysisJobRequest, signal?: AbortSignal): Promise<AnalysisJob> {
  if (![request.from, request.to].every(value => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)))) throw new Error("任务时间必须包含有效时区。")
  const duration = Date.parse(request.to) - Date.parse(request.from), maxDays = request.kind === "telemetry" ? 31 : 366
  if (duration <= 0 || duration > maxDays * 86400000) throw new Error(`请选择 ${maxDays} 天内有效时间范围。`)
  if (request.kind === "telemetry" && (![0, 1, 5, 15, 30, 60].includes(request.minutes ?? 0) || !request.pointIds?.length)) throw new Error("请选择测点和有效数据粒度。")
  if ((request.pointIds?.length ?? 0) > 200 || request.pointIds?.some(id => !/^[1-9]\d*$/.test(id))) throw new Error("最多选择 200 个有效测点。")
  return api<AnalysisJob>(`/stations/${encodeURIComponent(stationId)}/analysis-jobs`, { method: "POST", body: JSON.stringify(request), signal })
}
export function listAnalysisJobs(stationId: string, kind: AnalysisJobKind, signal?: AbortSignal, offset = 0): Promise<AnalysisJob[]> {
  const query = new URLSearchParams({ kind, limit: "20", offset: String(offset) })
  return api<AnalysisJob[]>(`/stations/${encodeURIComponent(stationId)}/analysis-jobs?${query}`, { signal })
}
export const loadAnalysisPreview = (id: string, signal?: AbortSignal) => api<AnalysisPreview>(`/analysis-jobs/${encodeURIComponent(id)}`, { signal })
export const retryAnalysisJob = (id: string, signal?: AbortSignal) => api<AnalysisJob>(`/analysis-jobs/${encodeURIComponent(id)}/retry`, { method: "POST", signal })

export async function downloadAnalysisJob(job: AnalysisJob, signal?: AbortSignal): Promise<void> {
  const token = getToken(), version = getSessionVersion()
  const base = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:18090/api").replace(/\/$/, "")
  let response: Response
  try { response = await fetch(`${base}/analysis-jobs/${encodeURIComponent(job.id)}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal }) }
  catch (error) { if (signal?.aborted) throw error; throw new ApiError("无法连接服务，请检查网络。", 0) }
  if (signal?.aborted) throw new DOMException("下载已取消", "AbortError")
  if (getToken() !== token || getSessionVersion() !== version) throw new ApiError("会话已变化，请重新操作。", 401)
  if (!response.ok) {
    if (response.status === 401) { setToken(null); window.dispatchEvent(new Event("enerlution:unauthorized")) }
    let message = `文件下载失败 (${response.status})`
    try { const body = await response.json(); message = body.msg || message } catch { /* CSV failures may be plain text */ }
    if (response.status === 403) await refreshAfterForbidden()
    throw new ApiError(message, response.status)
  }
  if (!response.headers.get("content-type")?.includes("text/csv")) throw new ApiError("服务器未返回 CSV 文件。", response.status)
  const blob = await response.blob()
  if (signal?.aborted) throw new DOMException("下载已取消", "AbortError")
  if (getToken() !== token || getSessionVersion() !== version) throw new ApiError("会话已变化，请重新操作。", 401)
  saveBlob(blob, `${job.kind}-${job.stationId}-${job.id}.csv`)
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadServerReport(stationId: string, kind: ReportKind, from: string, to: string, signal?: AbortSignal): Promise<void> {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!validDate(from) || !validDate(to) || to < from || Date.parse(to) - Date.parse(from) > 365 * 86400000) throw new Error("请选择一年内有效的报告日期范围。")
  const token = getToken()
  const version = getSessionVersion()
  const base = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:18090/api").replace(/\/$/, "")
  const query = new URLSearchParams({ from, to })
  let response: Response
  try {
    response = await fetch(`${base}/stations/${encodeURIComponent(stationId)}/reports/${kind}?${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
    })
  } catch {
    throw new ApiError("无法连接服务，请检查网络或服务地址。", 0)
  }
  if (signal?.aborted) throw new DOMException("已取消报告下载", "AbortError")
  if (getToken() !== token || getSessionVersion() !== version) throw new ApiError("会话已变化，请重新操作。", 401)
  if (response.status === 401 && getToken() === token) {
    setToken(null)
    window.dispatchEvent(new Event("enerlution:unauthorized"))
  }
  if (!response.ok) {
    let message = `报告下载失败 (${response.status})`
    try {
      const body = await response.json() as { msg?: string }
      if (body.msg) message = body.msg
    } catch { /* response can be plain text */ }
    if (response.status === 403) {await refreshAfterForbidden(); message = `权限已变化，已刷新当前权限。${message}`}
    throw new ApiError(message, response.status)
  }
  const blob = await response.blob()
  if (signal?.aborted) throw new DOMException("已取消报告下载", "AbortError")
  if (!response.headers.get("content-type")?.includes("text/csv")) throw new ApiError("服务器未返回 CSV 报告。", response.status)
  if (getToken() !== token || getSessionVersion() !== version) throw new ApiError("会话已变化，请重新操作。", 401)
  saveBlob(blob, `report-${stationId}-${kind}-${from}-${to}.csv`)
}
