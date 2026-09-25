import { useEffect, useMemo, useRef, useState } from "react"
import { Download, X } from "lucide-react"
import type { Station } from "@/App"
import { DEMO_MODE } from "@/api/client"
import { ROLE_CONFIG, type UserRole } from "@/auth/roles"
import {
  dateRangeEndingAt,
  stationDataNow,
  stationsDataNow,
} from "@/data/dataClock"
import { operationsDate } from "@/data/operations"
import {
  demoTelemetry,
  localDateTime,
  normalizeTelemetry,
  SIGNALS,
  type SignalId,
} from "@/data/stationTelemetry"
import StationAnalysisPage from "./StationAnalysisPage"
import ApiAnalyticsPage from "./ApiAnalyticsPage"
import { Button, PageHeader, Select } from "./ui/Workspace"
import "./analytics-ai.css"

type AnalysisTab = "数据分析" | "数据下载" | "报告中心"
type ReportType = "运营报告" | "收益报告" | "设备健康报告"
type ReportRecord = {
  id: string
  name: ReportType
  station: string
  range: string
  generatedAt: string
  status: "已完成"
}
type DownloadStatus = "生成中" | "可下载" | "生成失败"
type DownloadRecord = {
  id: string
  filename: string
  station: string
  range: string
  rangeValue: string
  generatedAt: string
  status: DownloadStatus
  signalIds: SignalId[]
  format: "CSV"
  granularity: string
}

const reportTypes: ReportType[] = ["运营报告", "收益报告", "设备健康报告"]

const downloadSignalLabels: Record<SignalId, string> = {
  soc: "SOC",
  storage: "电池功率",
  temperature: "最高单体温度",
  pcs: "交流有功功率",
  dcVoltage: "直流母线电压",
  pv: "光伏功率",
  load: "负载功率",
  grid: "电网功率",
  gridVoltage: "并网电压",
  generator: "发电机功率",
}
const initialDownloadSignalIds: SignalId[] = ["pv", "load", "storage", "soc"]
const downloadGranularities = ["原始采样", "1 分钟", "5 分钟", "15 分钟"]
function formatSlashDate(date: Date) {
  return operationsDate(date).replace(/-/g, "/")
}
function reportRangeLabel(start: string, end: string) {
  return `${start.replace(/-/g, "/")} — ${end.replace(/-/g, "/")}`
}
function buildReportRanges(stations: Station[]) {
  const now = stationsDataNow(stations)
  const monthStart = `${operationsDate(now).slice(0, 7)}-01`
  const week = dateRangeEndingAt(now, 7)
  const previousMonth = new Date(now)
  previousMonth.setMonth(previousMonth.getMonth() - 1, 1)
  const previousMonthEnd = new Date(previousMonth)
  previousMonthEnd.setMonth(previousMonthEnd.getMonth() + 1, 0)
  return [
    reportRangeLabel(monthStart, operationsDate(now)),
    reportRangeLabel(week.start, week.end),
    `${formatSlashDate(previousMonth)} — ${formatSlashDate(previousMonthEnd)}`,
  ]
}
function downloadRangeLabel(start: Date, end: Date) {
  const format = (value: Date) =>
    `${operationsDate(value)} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
  return `${format(start)} — ${format(end)}`
}
function buildDownloadRangeOptions(stations: Station[]) {
  const end = stationsDataNow(stations)
  const todayStart = new Date(end)
  todayStart.setHours(0, 0, 0, 0)
  const previousDayEnd = new Date(todayStart)
  const previousDayStart = new Date(previousDayEnd)
  previousDayStart.setDate(previousDayStart.getDate() - 1)
  const twoDaysStart = new Date(previousDayStart)
  twoDaysStart.setDate(twoDaysStart.getDate() - 1)
  return [
    downloadRangeLabel(todayStart, end),
    downloadRangeLabel(previousDayStart, previousDayEnd),
    downloadRangeLabel(twoDaysStart, previousDayStart),
  ]
}
function buildInitialReportRecords(stations: Station[]): ReportRecord[] {
  if (!stations.length) return []
  const now = stationsDataNow(stations)
  const ranges = buildReportRanges(stations)
  return stations.slice(0, 3).flatMap((station, index) => [
    {
      id: `package-report-${station.id}-${index}`,
      name: reportTypes[index % reportTypes.length],
      station: station.name,
      range: ranges[index % ranges.length],
      generatedAt: formatGeneratedAt(now),
      status: "已完成" as const,
    },
  ])
}

function buildInitialDownloadRecords(stations: Station[]): DownloadRecord[] {
  if (!stations.length) return []
  const now = stationsDataNow(stations)
  const ranges = buildDownloadRangeOptions(stations)
  return stations.slice(0, 3).map((station, index) => ({
    id: `package-download-${station.id}-${index}`,
    filename: `${station.shortName || station.name}_运行数据_交付包.csv`,
    station: station.name,
    range: shortDownloadRange(ranges[index % ranges.length]),
    rangeValue: ranges[index % ranges.length],
    generatedAt: formatDownloadTime(now),
    status: index === 0 ? "生成中" : "可下载",
    signalIds: initialDownloadSignalIds,
    format: "CSV",
    granularity: "原始采样",
  }))
}

function formatGeneratedAt(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  const hours = String(value.getHours()).padStart(2, "0")
  const minutes = String(value.getMinutes()).padStart(2, "0")
  return `${year}/${month}/${day} ${hours}:${minutes}`
}

function formatDownloadTime(value: Date) {
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  const hours = String(value.getHours()).padStart(2, "0")
  const minutes = String(value.getMinutes()).padStart(2, "0")
  return `${month}-${day} ${hours}:${minutes}`
}

function shortDownloadRange(value: string) {
  return value.replace(/\d{4}-(\d{2}-\d{2})/g, "$1")
}

function safeDownloadFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "")
    .replace(/—+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function parseDownloadRange(value: string) {
  const matches = [...value.matchAll(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/g)]
  if (matches.length < 2) {
    const fallback = Date.now()
    return { start: fallback - 3600000, end: fallback }
  }
  const start = Date.parse(`${matches[0][1]}T${matches[0][2]}:00`)
  const end = Date.parse(`${matches[1][1]}T${matches[1][2]}:00`)
  return {
    start: Number.isFinite(start) ? start : Date.now() - 3600000,
    end: Number.isFinite(end) ? end : Date.now(),
  }
}

function buildDownloadCsv(record: DownloadRecord, station: Station) {
  const { start, end } = parseDownloadRange(record.rangeValue)
  const timestamps = [...new Set([start, Math.round((start + end) / 2), end])]
  const signals = SIGNALS.filter((signal) => record.signalIds.includes(signal.id))
  const connectedRows = station.telemetryHistory
    ? normalizeTelemetry(station.telemetryHistory)
    : []
  const sampleAt = (timestamp: number) => {
    const nearest = connectedRows
      .filter((row) => Math.abs(row.timestamp - timestamp) <= 24 * 60 * 60 * 1000)
      .sort(
        (left, right) =>
          Math.abs(left.timestamp - timestamp) -
          Math.abs(right.timestamp - timestamp),
      )[0]
    return nearest ?? demoTelemetry(station, timestamp)
  }
  const rows = [
    ["时间", ...signals.map((signal) => `${downloadSignalLabels[signal.id]} (${signal.unit})`)],
    ...timestamps.map((timestamp) => {
      const sample = sampleAt(timestamp)
      return [
        localDateTime(timestamp).replace("T", " "),
        ...signals.map((signal) => String(sample[signal.id] ?? "")),
      ]
    }),
  ]
  return rows
    .map((row) => row.map((value) => `"${value.replace(/"/g, '""')}"`).join(","))
    .join("\r\n")
}

function downloadDataFile(record: DownloadRecord, station: Station) {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${buildDownloadCsv(record, station)}`], {
      type: "text/csv;charset=utf-8",
    }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = safeDownloadFilename(record.filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function DownloadParameterDialog({
  selectedSignalIds,
  onClose,
  onConfirm,
}: {
  selectedSignalIds: SignalId[]
  onClose: () => void
  onConfirm: (signalIds: SignalId[]) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draftSignalIds, setDraftSignalIds] =
    useState<SignalId[]>(selectedSignalIds)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (!element.open) element.showModal()
  }, [])

  function toggleSignal(signalId: SignalId) {
    setDraftSignalIds((current) =>
      current.includes(signalId)
        ? current.filter((id) => id !== signalId)
        : [...current, signalId],
    )
  }

  return (
    <dialog
      ref={dialog}
      className="ui-dialog analytics-download-parameters-dialog"
      aria-labelledby="analytics-download-parameters-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close()
        }
      }}
    >
      <header className="analytics-report-preview-header">
        <div>
          <h2 id="analytics-download-parameters-title">选择参数</h2>
          <p>选择需要导出的站点数据字段</p>
        </div>
        <Button
          iconOnly
          variant="ghost"
          title="关闭"
          aria-label="关闭参数选择"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </Button>
      </header>
      <div className="analytics-download-parameters-body">
        {["电池系统", "PCS", "其他设备"].map((group) => {
          const signals = SIGNALS.filter((signal) => signal.group === group)
          return (
            <section className="analytics-download-signal-group" key={group}>
              <h3>{group}</h3>
              <div>
                {signals.map((signal) => (
                  <label key={signal.id}>
                    <input
                      type="checkbox"
                      checked={draftSignalIds.includes(signal.id)}
                      onChange={() => toggleSignal(signal.id)}
                    />
                    <i style={{ background: signal.color }} />
                    <span>{downloadSignalLabels[signal.id]}</span>
                    <small>{signal.unit}</small>
                  </label>
                ))}
              </div>
            </section>
          )
        })}
      </div>
      <footer className="analytics-report-preview-footer">
        <Button onClick={() => dialog.current?.close()}>取消</Button>
        <Button
          variant="primary"
          disabled={!draftSignalIds.length}
          onClick={() => {
            onConfirm(draftSignalIds)
            dialog.current?.close()
          }}
        >
          确定
        </Button>
      </footer>
    </dialog>
  )
}

function DataDownloadWorkspace({ stations }: { stations: Station[] }) {
  const downloadRangeOptions = useMemo(
    () => buildDownloadRangeOptions(stations),
    [stations],
  )
  const [stationId, setStationId] = useState(stations[0]?.id ?? "")
  const [deviceId, setDeviceId] = useState("all")
  const format = "CSV" as const
  const [rangeValue, setRangeValue] = useState(() => downloadRangeOptions[0] ?? "")
  const [granularity, setGranularity] = useState(downloadGranularities[0])
  const [selectedSignalIds, setSelectedSignalIds] = useState<SignalId[]>(
    initialDownloadSignalIds,
  )
  const [records, setRecords] =
    useState<DownloadRecord[]>(() => buildInitialDownloadRecords(stations))
  const [parameterDialogOpen, setParameterDialogOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const generationTimers = useRef<number[]>([])

  const selectedStation =
    stations.find((station) => station.id === stationId) ?? stations[0]
  const devices = useMemo(
    () =>
      selectedStation?.deviceInventory?.length
        ? selectedStation.deviceInventory.map((device) => ({
            id: device.id,
            name: device.name,
          }))
        : [
            { id: "PCS-01", name: "PCS-01" },
            { id: "BMS-01", name: "BMS-01" },
            { id: "MTR-01", name: "并网电表" },
          ],
    [selectedStation],
  )

  useEffect(() => {
    if (!stations.length) {
      setStationId("")
      setDeviceId("all")
      return
    }
    if (!stations.some((station) => station.id === stationId)) {
      setStationId(stations[0].id)
    }
  }, [stationId, stations])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (deviceId !== "all" && !devices.some((device) => device.id === deviceId)) {
      setDeviceId("all")
    }
  }, [deviceId, devices])

  useEffect(() => {
    if (!downloadRangeOptions.includes(rangeValue)) {
      setRangeValue(downloadRangeOptions[0] ?? "")
    }
  }, [downloadRangeOptions, rangeValue])

  function updateRecord(id: string, status: DownloadStatus) {
    setRecords((current) =>
      current.map((record) => (record.id === id ? { ...record, status } : record)),
    )
  }

  function finishGeneration(id: string) {
    const timer = window.setTimeout(() => {
      updateRecord(id, "可下载")
      generationTimers.current = generationTimers.current.filter(
        (item) => item !== timer,
      )
    }, 900)
    generationTimers.current.push(timer)
  }

  useEffect(() => {
    return () => {
      generationTimers.current.forEach((timer) => window.clearTimeout(timer))
      generationTimers.current = []
    }
  }, [])

  useEffect(() => {
    records
      .filter((record) => record.status === "生成中")
      .forEach((record) => finishGeneration(record.id))
  }, [])

  function handleGenerateFile() {
    if (!selectedStation) {
      setNotice("暂无可用站点，无法生成文件")
      return
    }
    if (!selectedSignalIds.length) {
      setNotice("请至少选择一个数据参数")
      return
    }
    const now = selectedStation ? stationDataNow(selectedStation) : stationsDataNow(stations)
    const datePart = rangeValue.slice(0, 10).replace(/-/g, "")
    const nextRecord: DownloadRecord = {
      id: `download-${now.getTime()}-${Date.now()}`,
      filename: `${selectedStation.shortName || selectedStation.name}_运行数据_${datePart}.csv`,
      station: selectedStation.name,
      range: shortDownloadRange(rangeValue),
      rangeValue,
      generatedAt: formatDownloadTime(now),
      status: "生成中",
      signalIds: [...selectedSignalIds],
      format,
      granularity,
    }
    setRecords((current) => [nextRecord, ...current])
    setNotice("文件已加入生成队列，稍后可下载")
    finishGeneration(nextRecord.id)
  }

  function handleDownload(record: DownloadRecord) {
    if (record.status !== "可下载") return
    const recordStation =
      stations.find((station) => station.name === record.station) ??
      selectedStation
    if (!recordStation) {
      setNotice("暂无可用站点，无法下载文件")
      return
    }
    downloadDataFile(record, recordStation)
    setNotice(`${record.filename}已开始下载`)
  }

  function handleRetry(record: DownloadRecord) {
    updateRecord(record.id, "生成中")
    setNotice(`${record.filename}已重新加入生成队列`)
    finishGeneration(record.id)
  }

  const selectedSignalText = selectedSignalIds.length
    ? `已选 ${selectedSignalIds.length} 项：${selectedSignalIds
        .map((id) => downloadSignalLabels[id])
        .join("、")}`
    : "未选择数据参数，请点击选择参数"

  return (
    <div className="analytics-download-workspace">
      <section className="analytics-download-config" aria-label="数据下载">
        <h2>数据下载</h2>
        <div className="analytics-download-form">
          <label className="analytics-download-field">
            <span>站点</span>
            <Select
              aria-label="下载站点"
              value={selectedStation?.id ?? ""}
              disabled={!stations.length}
              onChange={(event) => setStationId(event.target.value)}
            >
              {!stations.length && <option value="">暂无站点</option>}
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="analytics-download-field">
            <span>设备</span>
            <Select
              aria-label="下载设备"
              value={deviceId}
              disabled={!selectedStation}
              onChange={(event) => setDeviceId(event.target.value)}
            >
              <option value="all">全部设备</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="analytics-download-field">
            <span>文件格式</span>
            <Select aria-label="文件格式" value={format} disabled>
              <option value="CSV">CSV</option>
            </Select>
          </label>
          <label className="analytics-download-field analytics-download-range-field">
            <span>时间范围</span>
            <Select
              aria-label="下载时间范围"
              value={rangeValue}
              onChange={(event) => setRangeValue(event.target.value)}
            >
              {downloadRangeOptions.map((range) => (
                <option key={range} value={range}>
                  {range}
                </option>
              ))}
            </Select>
          </label>
          <label className="analytics-download-field">
            <span>数据粒度</span>
            <Select
              aria-label="数据粒度"
              value={granularity}
              onChange={(event) => setGranularity(event.target.value)}
            >
              {downloadGranularities.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </label>
        </div>
        <div className="analytics-download-config-footer">
          <p className={selectedSignalIds.length ? "" : "is-warning"}>
            {selectedSignalText}
          </p>
          <div className="analytics-download-actions">
            <Button onClick={() => setParameterDialogOpen(true)}>
              选择参数
            </Button>
            <Button
              variant="primary"
              disabled={!stations.length || !selectedSignalIds.length}
              onClick={handleGenerateFile}
            >
              生成文件
            </Button>
          </div>
        </div>
        {notice && (
          <div
            className="analytics-download-notice"
            role="status"
            aria-live="polite"
          >
            {notice}
          </div>
        )}
      </section>

      <section className="analytics-download-records" aria-label="下载记录">
        <h2>下载记录</h2>
        <div className="analytics-download-table-wrap">
          <table className="ui-table analytics-download-table">
            <thead>
              <tr>
                <th scope="col">文件名称</th>
                <th scope="col">站点</th>
                <th scope="col">数据时间范围</th>
                <th scope="col">生成时间</th>
                <th scope="col">状态</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.filename}</td>
                  <td>{record.station}</td>
                  <td>{record.range}</td>
                  <td>{record.generatedAt}</td>
                  <td>
                    <span
                      className={`analytics-download-status analytics-download-status--${record.status}`}
                    >
                      {record.status}
                    </span>
                  </td>
                  <td>
                    {record.status === "可下载" ? (
                      <button
                        type="button"
                        className="analytics-download-link"
                        aria-label={`下载 ${record.filename}`}
                        onClick={() => handleDownload(record)}
                      >
                        下载
                      </button>
                    ) : record.status === "生成失败" ? (
                      <button
                        type="button"
                        className="analytics-download-link"
                        aria-label={`重试生成 ${record.filename}`}
                        onClick={() => handleRetry(record)}
                      >
                        重试
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="analytics-download-link analytics-download-link--disabled"
                        aria-label={`${record.filename} 正在生成`}
                        disabled
                      >
                        生成中
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="analytics-download-records-footer">
          共 {records.length} 条
        </footer>
      </section>

      {parameterDialogOpen && (
        <DownloadParameterDialog
          selectedSignalIds={selectedSignalIds}
          onClose={() => setParameterDialogOpen(false)}
          onConfirm={setSelectedSignalIds}
        />
      )}
    </div>
  )
}

function buildReportHighlights(record: ReportRecord) {
  if (record.name === "收益报告") {
    return [
      "收益数据已按统计时段汇总，可用于月度结算复核。",
      "需重点核对待结算金额、暂估金额和调差记录的一致性。",
      "下载文件为本地预览内容，未连接结算后台或归档服务。",
    ]
  }
  if (record.name === "设备健康报告") {
    return [
      "设备健康状态已按站点运行快照整理，适合运维例会快速复盘。",
      "建议结合告警信息和设备详情继续核对通信、温控和电池簇状态。",
      "下载文件为本地预览内容，未触发工单创建或外部派单。",
    ]
  }
  return [
    "运营指标已按统计时段汇总，覆盖站点、时间窗口和报告类型。",
    "建议结合数据分析页继续查看功率、SOC、温度和告警趋势。",
    "下载文件为本地预览内容，未写入正式报告库。",
  ]
}

function buildReportText(record: ReportRecord) {
  return [
    record.name,
    "",
    `报告编号：${record.id}`,
    `站点：${record.station}`,
    `统计时段：${record.range}`,
    `生成时间：${record.generatedAt}`,
    `状态：${record.status}`,
    `数据口径：V3.8`,
    "",
    "关键结论：",
    ...buildReportHighlights(record).map((item, index) => `${index + 1}. ${item}`),
  ].join("\n")
}

function toSafeFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "")
    .replace(/—+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function downloadReport(record: ReportRecord) {
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${buildReportText(record)}`], {
      type: "text/plain;charset=utf-8",
    }),
  )
  const link = document.createElement("a")
  link.href = url
  link.download = `${toSafeFilename(
    `${record.station}-${record.name}-${record.range}`,
  )}.txt`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ReportPreviewDialog({
  record,
  onClose,
  onDownload,
}: {
  record: ReportRecord
  onClose: () => void
  onDownload: (record: ReportRecord) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = `analytics-report-preview-${record.id}`
  const details = [
    ["报告名称", record.name],
    ["站点", record.station],
    ["统计时段", record.range],
    ["生成时间", record.generatedAt],
    ["状态", record.status],
    ["数据口径", "V3.8"],
  ]

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (!element.open) element.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      className="ui-dialog analytics-report-preview-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          event.currentTarget.close()
        }
      }}
    >
      <header className="analytics-report-preview-header">
        <div>
          <h2 id={titleId}>报告预览</h2>
          <p>{record.station}</p>
        </div>
        <Button
          iconOnly
          variant="ghost"
          title="关闭"
          aria-label="关闭报告预览"
          onClick={() => dialog.current?.close()}
        >
          <X />
        </Button>
      </header>
      <div className="analytics-report-preview-body">
        <section className="analytics-report-preview-section">
          <h3>报告信息</h3>
          <dl className="analytics-report-preview-meta">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="analytics-report-preview-section">
          <h3>关键结论</h3>
          <ul className="analytics-report-preview-list">
            {buildReportHighlights(record).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
      <footer className="analytics-report-preview-footer">
        <Button onClick={() => onDownload(record)}>
          <Download />
          下载报告
        </Button>
        <Button variant="primary" onClick={() => dialog.current?.close()}>
          关闭
        </Button>
      </footer>
    </dialog>
  )
}

export default function AnalyticsAiPage({
  stations,
  allowedTabs = ["数据分析", "数据下载", "报告中心"],
  allowedReportTypes = reportTypes,
  role = "owner",
}: {
  stations: Station[]
  onOpenStation: (id: string, subNav?: string) => void
  allowedTabs?: readonly AnalysisTab[]
  allowedReportTypes?: readonly ReportType[]
  role?: UserRole
}) {
  if (!DEMO_MODE) return <ApiAnalyticsPage stations={stations} allowedTabs={allowedTabs} allowedReportTypes={allowedReportTypes} role={role} />
  return <DemoAnalyticsAiPage stations={stations} allowedTabs={allowedTabs} allowedReportTypes={allowedReportTypes} role={role} />
}

function DemoAnalyticsAiPage({
  stations,
  allowedTabs = ["数据分析", "数据下载", "报告中心"],
  allowedReportTypes = reportTypes,
  role = "owner",
}: {
  stations: Station[]
  allowedTabs?: readonly AnalysisTab[]
  allowedReportTypes?: readonly ReportType[]
  role?: UserRole
}) {
  const visibleTabs = (["数据分析", "数据下载", "报告中心"] as AnalysisTab[])
    .filter((tab) => allowedTabs.includes(tab))
  const visibleReportTypes = reportTypes.filter((type) =>
    allowedReportTypes.includes(type),
  )
  const availableStations = useMemo(
    () => stations.filter((station) => station.status !== "building"),
    [stations],
  )
  const [activeTab, setActiveTab] = useState<AnalysisTab>(
    visibleTabs[0] ?? "数据分析",
  )
  const [stationId, setStationId] = useState(availableStations[0]?.id ?? "")
  const reportRanges = useMemo(
    () => buildReportRanges(availableStations),
    [availableStations],
  )
  const [reportType, setReportType] = useState<ReportType>(
    visibleReportTypes[0] ?? "运营报告",
  )
  const [reportStationId, setReportStationId] = useState(
    availableStations[0]?.id ?? "",
  )
  const [reportRange, setReportRange] = useState(() => reportRanges[0] ?? "")
  const [reportRecords, setReportRecords] = useState<ReportRecord[]>(() =>
    buildInitialReportRecords(availableStations).filter((record) =>
      visibleReportTypes.includes(record.name),
    ),
  )
  const [previewRecord, setPreviewRecord] = useState<ReportRecord | null>(null)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (!availableStations.length) {
      setStationId("")
      setReportStationId("")
      return
    }
    if (!availableStations.some((station) => station.id === stationId)) {
      setStationId(availableStations[0].id)
    }
    if (!availableStations.some((station) => station.id === reportStationId)) {
      setReportStationId(availableStations[0].id)
    }
    if (!reportRanges.includes(reportRange)) {
      setReportRange(reportRanges[0] ?? "")
    }
  }, [availableStations, stationId, reportStationId, reportRange, reportRanges])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(""), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const focusedStation =
    availableStations.find((station) => station.id === stationId) ??
    availableStations[0]
  const selectedReportStation =
    availableStations.find((station) => station.id === reportStationId) ??
    availableStations[0]
  const alarmCount = availableStations.reduce(
    (sum, station) => sum + station.alerts.length,
    0,
  )
  const chartLabel = `多信号趋势：${focusedStation?.name ?? "暂无站点"} ${
    focusedStation?.alerts.length ?? 0
  } 条告警，7 个默认通道`

  function handleGenerateReport() {
    if (!selectedReportStation) return
    const now = stationDataNow(selectedReportStation)
    const nextRecord: ReportRecord = {
      id: `generated-${now.getTime()}-${Date.now()}`,
      name: reportType,
      station: selectedReportStation.name,
      range: reportRange,
      generatedAt: formatGeneratedAt(now),
      status: "已完成",
    }
    setReportRecords((current) => [nextRecord, ...current])
    setNotice(`${nextRecord.name}已生成，可在生成记录中预览或下载。`)
  }

  function handlePreviewReport(record: ReportRecord) {
    setPreviewRecord(record)
  }

  function handleDownloadReport(record: ReportRecord) {
    downloadReport(record)
    setNotice(`${record.name}已开始下载。`)
  }

  return (
    <main className="ui-page analytics-ai-page">
      <PageHeader
        title="分析与报告"
        description={`${ROLE_CONFIG[role].shortLabel}范围 · 实时信号、历史趋势和周期报告。`}
        actions={
          <div className="analytics-page-actions">
            <label>
              分析站点
              <Select
                aria-label="分析站点"
                value={focusedStation?.id ?? ""}
                disabled={!availableStations.length}
                onChange={(event) => setStationId(event.target.value)}
              >
                {!availableStations.length && <option value="">暂无站点</option>}
                {availableStations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        }
      />

      <div
        className="analytics-report-tabs"
        role="tablist"
        aria-label="分析与报告视图"
      >
        <div>
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              aria-current={activeTab === tab ? "page" : undefined}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <span>
          数据口径 V3.8 · 更新 {formatDownloadTime(stationsDataNow(availableStations))}
        </span>
      </div>

      {activeTab === "数据分析" ? (
        <div className="analytics-ai-content analytics-analysis-host">
          {focusedStation ? (
            <div
              className="analytics-ai-chart analytics-analysis-chart-proxy"
              aria-label={chartLabel}
            >
              <StationAnalysisPage key={focusedStation.id} station={focusedStation} />
            </div>
          ) : (
            <section className="analytics-empty-state">
              <h2>暂无站点数据</h2>
              <p>接入站点后可查看实时分析、历史趋势和监测通道。</p>
            </section>
          )}
        </div>
      ) : activeTab === "数据下载" ? (
        <div className="analytics-ai-content analytics-download-center">
          <DataDownloadWorkspace stations={availableStations} />
        </div>
      ) : (
        <div className="analytics-ai-content analytics-report-center">
          <section className="analytics-report-workspace" aria-label="报告中心">
            <div
              className="analytics-report-filters"
              aria-label="报告生成条件"
            >
              <label className="analytics-report-field">
                <span>报告类型</span>
                <Select
                  aria-label="报告类型"
                  value={reportType}
                  onChange={(event) =>
                    setReportType(event.target.value as ReportType)
                  }
                >
                  {visibleReportTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </Select>
              </label>
              <label className="analytics-report-field">
                <span>站点选择</span>
                <Select
                  aria-label="报告站点"
                  value={selectedReportStation?.id ?? ""}
                  disabled={!availableStations.length}
                  onChange={(event) => setReportStationId(event.target.value)}
                >
                  {!availableStations.length && <option value="">暂无站点</option>}
                  {availableStations.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="analytics-report-field">
                <span>日期范围</span>
                <Select
                  aria-label="报告日期范围"
                  value={reportRange}
                  onChange={(event) => setReportRange(event.target.value)}
                >
                  {reportRanges.map((range) => (
                    <option key={range}>{range}</option>
                  ))}
                </Select>
              </label>
              <Button
                className="analytics-report-generate"
                variant="primary"
                disabled={!availableStations.length}
                onClick={handleGenerateReport}
              >
                生成报告
              </Button>
            </div>
            {notice && (
              <div
                className="analytics-report-notice"
                role="status"
                aria-live="polite"
              >
                {notice}
              </div>
            )}
            <section className="analytics-report-records">
              <h2>生成记录</h2>
              <div className="analytics-report-table-wrap">
                <table className="ui-table analytics-report-table">
                  <thead>
                    <tr>
                      <th scope="col">报告名称</th>
                      <th scope="col">站点</th>
                      <th scope="col">统计时段</th>
                      <th scope="col">生成时间</th>
                      <th scope="col">状态</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportRecords.map((record) => (
                      <tr key={record.id}>
                        <td>{record.name}</td>
                        <td>{record.station}</td>
                        <td>{record.range}</td>
                        <td>{record.generatedAt}</td>
                        <td>
                          <span className="analytics-report-status">
                            {record.status}
                          </span>
                        </td>
                        <td>
                          <div className="analytics-report-actions">
                            <button
                              type="button"
                              className="analytics-report-link"
                              aria-label={`预览 ${record.station} ${record.name}`}
                              onClick={() => handlePreviewReport(record)}
                            >
                              预览
                            </button>
                            <button
                              type="button"
                              className="analytics-report-link"
                              aria-label={`下载 ${record.station} ${record.name}`}
                              onClick={() => handleDownloadReport(record)}
                            >
                              下载
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
          {previewRecord && (
            <ReportPreviewDialog
              record={previewRecord}
              onClose={() => setPreviewRecord(null)}
              onDownload={handleDownloadReport}
            />
          )}
        </div>
      )}
    </main>
  )
}
