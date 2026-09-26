import { useEffect, useRef, useState } from "react"
import type { Station } from "@/App"
import { Button, Select } from "./ui/Workspace"
import { loadPoints, loadHistory, historyCsv, saveBlob, type MeasurementPoint, type HistoryBucket } from "./apiAnalytics"
import { localDateTime } from "@/data/stationTelemetry"

type DownloadRecord = { id: number; filename: string; station: string; from: string; to: string; minutes: number; points: MeasurementPoint[]; created: string; status: "生成中" | "可下载" | "生成失败" | "无采样数据"; csv?: string; error?: string }
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
  const [error, setError] = useState("")
  const [from, setFrom] = useState(() => localDateTime(Date.now() - 86400000).slice(0, 16))
  const [to, setTo] = useState(() => localDateTime(Date.now()).slice(0, 16))
  const [minutes, setMinutes] = useState(15)
  const [records, setRecords] = useState<DownloadRecord[]>([])
  const [draft, setDraft] = useState<string[] | null>(null)
  const controller = useRef<AbortController | null>(null)
  const modal = useRef<HTMLDialogElement>(null)
  const available = points.filter(p => !device || p.device_id === device)
  const chosen = available.filter(p => selected.includes(p.id))
  useEffect(() => {
    const request = new AbortController()
    if (!station) return
    setLoading(true); setError("")
    loadPoints(station.id, request.signal).then(data => { if (!request.signal.aborted) { setPoints(data); setSelected(data.map(p => p.id)) } }).catch(e => { if (!request.signal.aborted) setError(e.message) }).finally(() => { if (!request.signal.aborted) setLoading(false) })
    return () => { request.abort(); controller.current?.abort() }
  }, [station?.id, retry])
  useEffect(() => { if (draft) modal.current?.showModal() }, [draft !== null])
  function closeParameters() { setDraft(null) }
  async function generate(previous?: DownloadRecord) {
    const selection = previous?.points ?? chosen
    const start = previous?.from ?? from, end = previous?.to ?? to, granularity = previous?.minutes ?? minutes
    if (!station || !selection.length) { setError("请至少选择一个当前设备的授权测点。"); return }
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start) || Date.parse(end) - Date.parse(start) > 366 * 86400000) { setError("请选择一年内有效时间范围，结束时间须晚于开始时间。"); return }
    controller.current?.abort()
    const request = new AbortController(); controller.current = request
    const record: DownloadRecord = { id: previous?.id ?? Date.now(), filename: `${station.code || station.id}_运行数据_${start.slice(0, 10)}.csv`, station: station.name, from: start, to: end, minutes: granularity, points: selection, created: new Date().toLocaleString("zh-CN"), status: "生成中" }
    setError(""); setRecords(old => [record, ...old.filter(r => r.id !== record.id)])
    try {
      const result = await Promise.all(selection.map(async point => {
        const buckets = new Map<number, HistoryBucket>()
        for (let cursor = Date.parse(start); cursor < Date.parse(end);) {
          if (request.signal.aborted) return { point, rows: [] }
          const next = Math.min(Date.parse(end), cursor + 31 * 86400000)
          for (const row of await loadHistory(point.id, new Date(cursor), new Date(next), granularity, request.signal)) buckets.set(row.timestamp, row)
          cursor = next
        }
        return { point, rows: [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp) }
      }))
      if (request.signal.aborted) return
      const count = result.reduce((n, item) => n + item.rows.length, 0)
      const csv = result.map((item, index) => { const content = historyCsv(item.point, item.rows); return index ? content.slice(content.indexOf("\r\n") + 2) : content }).join("")
      setRecords(old => old.map(r => r.id === record.id ? { ...r, status: count ? "可下载" : "无采样数据", csv: count ? csv : undefined } : r))
    } catch (e) {
      if (!request.signal.aborted) setRecords(old => old.map(r => r.id === record.id ? { ...r, status: "生成失败", error: e instanceof Error ? e.message : "查询失败" } : r))
    }
  }
  const busy = records.some(r => r.status === "生成中")
  return <div className="analytics-download-workspace">
    <section className="analytics-download-config"><h2>数据下载</h2><div className="analytics-download-form">
      <label className="analytics-download-field">站点<Select aria-label="下载站点" value={station?.id ?? ""} disabled={!stations.length || busy} onChange={e => onStation(e.target.value)}>{!stations.length && <option value="">暂无授权站点</option>}{stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></label>
      <label className="analytics-download-field">设备<Select aria-label="下载设备" value={device} onChange={e => { setDevice(e.target.value); setSelected(points.filter(p => !e.target.value || p.device_id === e.target.value).map(p => p.id)) }}><option value="">全部设备</option>{[...new Set(points.map(p => p.device_id))].map(id => <option key={id} value={id}>设备 {id || "未关联"}</option>)}</Select></label>
      <label className="analytics-download-field">文件格式<Select aria-label="文件格式" value="CSV" onChange={() => {}}><option>CSV</option></Select></label>
      <div className="analytics-download-field analytics-download-range-field"><span>时间范围</span><div className="analytics-date-pair"><input aria-label="下载开始时间" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} /><span>—</span><input aria-label="下载结束时间" type="datetime-local" value={to} onChange={e => setTo(e.target.value)} /></div></div>
      <label className="analytics-download-field">数据粒度<Select aria-label="数据粒度" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[1, 5, 15, 30, 60].map(n => <option key={n} value={n}>{n} 分钟</option>)}</Select></label>
    </div><footer className="analytics-download-config-footer"><p>已选 {chosen.length} 项：{chosen.map(p => p.name).join("、") || (loading ? "加载测点中…" : "请选择参数")}</p><div className="analytics-download-actions"><Button onClick={() => setDraft([...selected])} disabled={!available.length}>选择参数</Button><Button variant="primary" disabled={!station || loading || busy} onClick={() => void generate()}>生成文件</Button></div></footer><p className="api-analytics-hint">按服务器区间平均值导出；原始采样接口未接通。下载记录仅保留在当前页面。</p>
      {error && <div role="alert" className="analytics-report-notice">{error}{!points.length && <Button onClick={() => setRetry(v => v + 1)}>重试测点读取</Button>}</div>}
    </section>
    <section className="analytics-download-records"><h2>下载记录</h2><div className="analytics-download-table-wrap"><table className="ui-table analytics-download-table"><thead><tr>{["文件名称", "站点", "数据时间范围", "生成时间", "状态", "操作"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{records.map(r => <tr key={r.id}><td>{r.filename}</td><td>{r.station}</td><td>{r.from.replace("T", " ")} — {r.to.replace("T", " ")}</td><td>{r.created}</td><td>{r.status}{r.error && <p role="alert">{r.error}</p>}</td><td>{r.csv ? <button type="button" className="analytics-download-link" aria-label="下载 CSV" onClick={() => saveBlob(new Blob([r.csv!], { type: "text/csv;charset=utf-8" }), r.filename)}>下载</button> : r.status === "生成失败" ? <Button disabled={busy} onClick={() => void generate(r)}>重试</Button> : "—"}</td></tr>)}{!records.length && <tr><td colSpan={6} className="api-analytics-table-empty">暂无下载记录，请选择参数后生成文件</td></tr>}</tbody></table></div><footer className="analytics-download-records-footer">共 {records.length} 条 · 当前页面本地记录</footer></section>
    {draft && <dialog ref={modal} className="ui-dialog analytics-download-parameters-dialog" aria-label="选择下载参数" onCancel={closeParameters}><header className="analytics-report-preview-header"><h2>选择参数</h2><Button onClick={closeParameters}>取消</Button></header><div className="analytics-download-parameters-body">{available.map(p => <label className="analytics-parameter" key={p.id}><input type="checkbox" checked={draft.includes(p.id)} onChange={e => setDraft(e.target.checked ? [...draft, p.id] : draft.filter(id => id !== p.id))} />{p.name} · {p.id} ({p.unit || "无单位"})</label>)}</div><footer className="analytics-report-preview-footer"><Button onClick={() => setDraft(available.map(p => p.id))}>全选</Button><Button onClick={() => setDraft([])}>清空</Button><Button variant="primary" onClick={() => { setSelected(draft); closeParameters() }}>应用参数</Button></footer></dialog>}
  </div>
}
