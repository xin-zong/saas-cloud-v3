import { useEffect, useRef, useState } from "react"
import type { Station } from "@/App"
import { Button, Select } from "./ui/Workspace"
import { loadPoints, jobStatusText, type MeasurementPoint } from "./apiAnalytics"
import { defaultAnalysisPoints } from "./stationAnalysisData"
import { useAnalysisJobs } from "./useAnalysisJobs"
import { localDateTime } from "@/data/stationTelemetry"

export default function AnalyticsDataDownload({ stations }: { stations: Station[] }) {
  const [stationId, setStationId] = useState(stations[0]?.id ?? "")
  const station = stations.find(s => s.id === stationId) ?? stations[0]
  return <section className="analytics-ai-content analytics-download-center"><DownloadStation key={station?.id ?? "empty"} station={station} stations={stations} onStation={setStationId} /></section>
}
function DownloadStation({ station, stations, onStation }: { station?: Station; stations: Station[]; onStation: (id: string) => void }) {
  const [points, setPoints] = useState<MeasurementPoint[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [device, setDevice] = useState("")
  const [loading, setLoading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [pointError, setPointError] = useState("")
  const [from, setFrom] = useState(() => localDateTime(Date.now() - 86400000).slice(0, 16))
  const [to, setTo] = useState(() => localDateTime(Date.now()).slice(0, 16))
  const [minutes, setMinutes] = useState(0)
  const [draft, setDraft] = useState<string[] | null>(null)
  const modal = useRef<HTMLDialogElement>(null)
  const jobs = useAnalysisJobs(station?.id, "telemetry")
  const available = points.filter(point => !device || point.device_id === device)
  const chosen = available.filter(point => selected.includes(point.id))
  useEffect(() => {
    const request = new AbortController()
    if (!station) return
    setLoading(true); setPointError("")
    void loadPoints(station.id, request.signal).then(data => {
      if (!request.signal.aborted) { setPoints(data); setSelected(defaultAnalysisPoints(data).map(point => point.id)) }
    }).catch(cause => { if (!request.signal.aborted) setPointError(cause instanceof Error ? cause.message : "测点读取失败") })
      .finally(() => { if (!request.signal.aborted) setLoading(false) })
    return () => request.abort()
  }, [station?.id, retry])
  useEffect(() => { if (draft !== null) modal.current?.showModal() }, [draft !== null])
  async function generate() {
    if (!chosen.length) { jobs.setError("请至少选择一个当前设备的授权测点。"); return }
    if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) { jobs.setError("请选择有效时间范围。"); return }
    await jobs.generate({ kind: "telemetry", from: new Date(from).toISOString(), to: new Date(to).toISOString(), minutes, pointIds: chosen.map(point => point.id) })
  }
  const error = pointError || jobs.error
  return <div className="analytics-download-workspace">
    <section className="analytics-download-config"><h2>数据下载</h2><div className="analytics-download-form">
      <label className="analytics-download-field">站点<Select aria-label="下载站点" value={station?.id ?? ""} disabled={!stations.length} onChange={event => onStation(event.target.value)}>{!stations.length && <option value="">暂无授权站点</option>}{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>
      <label className="analytics-download-field">设备<Select aria-label="下载设备" value={device} onChange={event => { setDevice(event.target.value); setSelected(defaultAnalysisPoints(points.filter(point => !event.target.value || point.device_id === event.target.value)).map(point => point.id)) }}><option value="">全部设备</option>{[...new Set(points.map(point => point.device_id))].map(id => <option key={id} value={id}>{points.find(point => point.device_id === id)?.device_name || `设备 ${id || "未关联"}`}</option>)}</Select></label>
      <label className="analytics-download-field">文件格式<Select aria-label="文件格式" value="CSV" onChange={() => {}}><option>CSV</option></Select></label>
      <div className="analytics-download-field analytics-download-range-field"><span>时间范围</span><div className="analytics-date-pair"><input aria-label="下载开始时间" type="datetime-local" value={from} onChange={event => setFrom(event.target.value)} /><span>—</span><input aria-label="下载结束时间" type="datetime-local" value={to} onChange={event => setTo(event.target.value)} /></div></div>
      <label className="analytics-download-field">数据粒度<Select aria-label="数据粒度" value={minutes} onChange={event => setMinutes(Number(event.target.value))}><option value={0}>原始采样</option>{[1, 5, 15, 30, 60].map(value => <option key={value} value={value}>{value} 分钟 · 末值</option>)}</Select></label>
    </div><footer className="analytics-download-config-footer"><p>已选 {chosen.length} 项：{chosen.map(point => point.name).join("、") || (loading ? "加载测点中…" : "请选择参数")}</p><div className="analytics-download-actions"><Button onClick={() => setDraft([...selected])} disabled={!available.length}>选择参数</Button>{jobs.busy && <Button onClick={jobs.cancel}>取消等待</Button>}<Button variant="primary" disabled={!station || loading || jobs.busy} onClick={() => void generate()}>{jobs.busy ? "生成中…" : "生成文件"}</Button></div></footer><p className="api-analytics-hint">原始采样保留精确值、类型、质量及源时间；聚合使用各区间末值。最多 200 个测点、31 天，记录由服务器保存。取消等待后可刷新查看服务器任务。</p>
      {error && <div role="alert" className="analytics-report-notice">{error}{pointError && <Button onClick={() => setRetry(value => value + 1)}>重试测点读取</Button>}</div>}
    </section>
    <section className="analytics-download-records"><h2>下载记录 <Button disabled={jobs.loading} onClick={jobs.reload}>刷新</Button></h2><div className="analytics-download-table-wrap"><table className="ui-table analytics-download-table"><thead><tr>{["文件名称", "站点", "数据时间范围", "生成时间", "状态", "操作"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{jobs.records.map(row => <tr key={row.id}><td>{`${station?.code || row.stationId}_运行数据_${row.from.slice(0, 10)}.csv`}<small> · {row.minutes === 0 ? "原始" : `${row.minutes} 分钟末值`} · {row.pointIds.length} 个测点</small></td><td>{station?.name}</td><td>{new Date(row.from).toLocaleString("zh-CN")} — {new Date(row.to).toLocaleString("zh-CN")}</td><td>{new Date(row.createdAt).toLocaleString("zh-CN")}</td><td><span>{jobStatusText(row.status)}</span>{row.error && <p role="alert">{row.error}</p>}</td><td>{row.status === "completed" ? <button type="button" className="analytics-download-link" disabled={jobs.busy} aria-label="下载 CSV" onClick={() => void jobs.download(row)}>下载</button> : row.status === "failed" ? <Button disabled={jobs.busy} onClick={() => void jobs.retry(row)}>重试</Button> : "—"}</td></tr>)}{!jobs.records.length && <tr><td colSpan={6} className="api-analytics-table-empty">{jobs.loading ? "正在读取下载记录…" : "暂无下载记录，请选择参数后生成文件"}</td></tr>}</tbody></table></div><footer className="analytics-download-records-footer"><span>服务器持久记录 · 第 {Math.floor(jobs.offset / 20) + 1} 页</span><Button disabled={!jobs.offset || jobs.loading} onClick={() => jobs.setOffset(value => Math.max(0, value - 20))}>上一页</Button><Button disabled={jobs.records.length < 20 || jobs.loading} onClick={() => jobs.setOffset(value => value + 20)}>下一页</Button></footer></section>
    {draft !== null && <dialog ref={modal} className="ui-dialog analytics-download-parameters-dialog" aria-label="选择下载参数" onCancel={() => setDraft(null)}><header className="analytics-report-preview-header"><h2>选择参数 · {draft.length}/200</h2><Button onClick={() => setDraft(null)}>取消</Button></header><div className="analytics-download-parameters-body">{available.map(point => <label className="analytics-parameter" key={point.id}><input type="checkbox" checked={draft.includes(point.id)} disabled={!draft.includes(point.id) && draft.length >= 200} onChange={event => setDraft(event.target.checked ? [...draft, point.id] : draft.filter(id => id !== point.id))} />{point.device_name || `设备 ${point.device_id}`} / {point.name} · {point.id} ({point.unit || "无单位"}) · {point.source === "ems" ? "EMS" : "历史来源"} · {point.valueType || "未知类型"}</label>)}</div><footer className="analytics-report-preview-footer"><Button onClick={() => setDraft(available.slice(0, 200).map(point => point.id))}>选择前 200 项</Button><Button onClick={() => setDraft([])}>清空</Button><Button variant="primary" onClick={() => { setSelected(draft); setDraft(null) }}>应用参数</Button></footer></dialog>}
  </div>
}
