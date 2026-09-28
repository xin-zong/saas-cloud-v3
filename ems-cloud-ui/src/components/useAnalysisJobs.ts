import { useCallback, useEffect, useRef, useState } from "react"
import { createAnalysisJob, downloadAnalysisJob, listAnalysisJobs, retryAnalysisJob, type AnalysisJob, type AnalysisJobKind, type AnalysisJobRequest } from "./apiAnalytics"

export const scopedAnalysisJobs = (rows: AnalysisJob[], stationId: string, kind: AnalysisJobKind) => rows.filter(row => row.stationId === stationId && row.kind === kind)

export function useAnalysisJobs(stationId: string | undefined, kind: AnalysisJobKind) {
  const [records, setRecords] = useState<AnalysisJob[]>([])
  const [offset, setOffset] = useState(0)
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const action = useRef<AbortController | null>(null)
  const reload = useCallback(() => setRefresh(value => value + 1), [])
  useEffect(() => {
    setRecords([]); setOffset(0); setError(""); setBusy(false)
    return () => action.current?.abort()
  }, [stationId, kind])
  useEffect(() => {
    if (!stationId) return
    const controller = new AbortController()
    setLoading(true)
    void listAnalysisJobs(stationId, kind, controller.signal, offset).then(rows => {
      if (!controller.signal.aborted) { setRecords(scopedAnalysisJobs(rows, stationId, kind)); setError("") }
    }).catch(cause => {
      if (!controller.signal.aborted) { setRecords([]); setError(cause instanceof Error ? cause.message : "任务记录读取失败") }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [stationId, kind, offset, refresh])
  useEffect(() => {
    if (!records.some(row => row.status === "pending" || row.status === "running")) return
    const timer = window.setInterval(reload, 5000)
    return () => window.clearInterval(timer)
  }, [records, reload])
  async function run(operation: (signal: AbortSignal) => Promise<AnalysisJob | void>): Promise<AnalysisJob | undefined> {
    action.current?.abort()
    const request = new AbortController(); action.current = request
    setBusy(true); setError("")
    try {
      const result = await operation(request.signal)
      if (request.signal.aborted) return
      if (result && result.stationId === stationId && result.kind === kind) {
        if (offset === 0) setRecords(rows => [result, ...rows.filter(row => row.id !== result.id)].slice(0, 20))
        else setOffset(0)
        if (result.status === "failed") setError(result.error ?? "任务生成失败，可在记录中重试。")
      }
      reload()
      return result ?? undefined
    } catch (cause) {
      if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : "任务操作失败，请重试")
    } finally { if (!request.signal.aborted) setBusy(false) }
  }
  return { records, offset, setOffset, loading, busy, error, setError, reload,
    generate: (request: AnalysisJobRequest) => stationId ? run(signal => createAnalysisJob(stationId, request, signal)) : Promise.resolve(undefined),
    retry: (row: AnalysisJob) => run(signal => retryAnalysisJob(row.id, signal)),
    download: (row: AnalysisJob) => run(signal => downloadAnalysisJob(row, signal)),
    cancel: () => { action.current?.abort(); setBusy(false); reload() },
  }
}
