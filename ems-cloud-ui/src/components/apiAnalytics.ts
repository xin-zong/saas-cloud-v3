import { api, getToken, setToken, getSessionVersion, refreshAfterForbidden, ApiError } from "@/api/client"

export type MeasurementPoint = { id: string; name: string; unit: string; device_id: string }
export type HistoryBucket = { timestamp: number; value: number; samples: number }
export type ReportKind = "operations" | "revenue" | "health"

export async function loadPoints(stationId: string, signal?: AbortSignal): Promise<MeasurementPoint[]> {
  const rows = await api<Array<Record<string, unknown>>>(`/stations/${encodeURIComponent(stationId)}/points`, { signal })
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? row.code ?? row.id),
    unit: String(row.unit ?? ""),
    device_id: String(row.device_id ?? ""),
  }))
}

export async function loadHistory(pointId: string, from: Date, to: Date, minutes: number, signal?: AbortSignal): Promise<HistoryBucket[]> {
  if (![1, 5, 15, 30, 60].includes(minutes) || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from || to.getTime() - from.getTime() > 31 * 86400000) {
    throw new Error("请选择 31 天内有效时间段和采样粒度。")
  }
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), minutes: String(minutes), source: 'legacy', aggregation: 'avg' })
  const rows = await api<Array<Record<string, unknown>>>(`/points/${encodeURIComponent(pointId)}/history?${query}`, { signal })
  return rows.filter(row => row.timestamp !== null && row.timestamp !== "" && row.value !== null && row.value !== "" && row.samples !== null && row.samples !== "").map((row) => ({ timestamp: Number(row.timestamp), value: Number(row.value), samples: Number(row.samples) }))
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.value) && Number.isFinite(row.samples) && row.samples > 0)
}

export function historyCsv(point: MeasurementPoint, rows: HistoryBucket[]): string {
  const cell = (value: string) => {
    const safe = /^[=+@\t\r\n-]/.test(value) ? `'${value}` : value
    return `"${safe.replace(/"/g, '""')}"`
  }
  return "\uFEFF" + [
    ["timestamp", "point_id", "point_name", "unit", "average_value", "samples"],
    ...rows.map((row) => [new Date(row.timestamp).toISOString(), point.id, point.name, point.unit, String(row.value), String(row.samples)]),
  ].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
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
