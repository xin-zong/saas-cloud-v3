import { useEffect, useMemo, useState, type ReactNode } from "react"
import { DEMO_MODE } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import { loadPoints, type MeasurementPoint } from "./apiAnalytics"
import { registeredChannels, queryRegisteredTelemetry, metricSignals, pointMatchesMetric, type AnalysisMetric, type AnalysisRow as TelemetryRow } from "./stationAnalysisData"
import {
  Brush,
  CartesianGrid,
  DefaultZIndexes,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ZIndexLayer,
  usePlotArea,
} from "recharts"

import {
  ChartNoAxesCombined,
  Circle,
  Download,
  Grid2X2,
  Layers,
  PanelsTopLeft,
  Pause,
  Play,
  RotateCcw,
  Search,
  Spline,
  ZoomIn,
} from "lucide-react"

import type { Station } from "@/App"

import { latestTelemetryTimestamp } from "@/data/dataClock"

import {
  SIGNALS as DEMO_SIGNALS,
  demoTelemetry,
  demoTelemetryRange,
  localDateTime,
  normalizeTelemetry,
  type SignalId,
} from "@/data/stationTelemetry"

const INITIAL_SIGNALS: SignalId[] = [
  "soc",
  "storage",
  "temperature",
  "pcs",
  "pv",
  "load",
  "gridVoltage",
]

const INITIAL_CURVES: SignalId[] = ["pv", "load", "storage", "soc"]

const historyQueryKey = (
  stationId: Station["id"],
  start: number,
  end: number,
  minutes: number,
  selected: string[],
) => JSON.stringify([stationId, start, end, minutes, [...selected].sort()])

const clockTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("zh-CN", { hour12: false })

const valueText = (value: number | null | undefined) =>
  typeof value === "number"
    ? value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })
    : "--"

function CursorCapture({
  rows,
  onSelect,
}: {
  rows: TelemetryRow[]
  onSelect: (timestamp: number) => void
}) {
  const area = usePlotArea()

  if (!area || !rows.length) return null

  return (
    <ZIndexLayer zIndex={DefaultZIndexes.activeDot + 1}>
      <rect
        x={area.x}
        y={area.y}
        width={area.width}
        height={area.height}
        fill="transparent"
        style={{ cursor: "crosshair" }}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect()

          const ratio = Math.max(
            0,
            Math.min(1, (event.clientX - bounds.left) / bounds.width),
          )

          const target =
            rows[0].timestamp +
            ratio * (rows[rows.length - 1].timestamp - rows[0].timestamp)

          const nearest = rows.reduce((best, row) =>
            Math.abs(row.timestamp - target) < Math.abs(best.timestamp - target)
              ? row
              : best,
          )

          onSelect(nearest.timestamp)
        }}
      />
    </ZIndexLayer>
  )
}

export default function StationAnalysisPage({
  station,
  initialView = "live",
  initialRange,
  initialMetric,
  analyticsFeatures = false,
  stationSelector,
}: {
  station: Station
  initialMetric?: AnalysisMetric
  initialView?: "live" | "history"
  initialRange?: { start: Date; end: Date }
  analyticsFeatures?: boolean
  stationSelector?: ReactNode
}) {
  const { user } = useAuth()
  const canRead =
    DEMO_MODE || hasStationPermission(user, station.id, "telemetry.read")
  const [queryError, setQueryError] = useState("")
  const [queryLoading, setQueryLoading] = useState(false)
  const [requestRange, setRequestRange] = useState(initialRange)
  const stationNow = () =>
    Math.floor(
      (DEMO_MODE
        ? (latestTelemetryTimestamp(station) ?? Date.now())
        : Date.now()) / 1000,
    ) * 1000
  const [view, setView] = useState<"live" | "history">(initialView)
  const [running, setRunning] = useState(true)

  const [now, setNow] = useState(stationNow)

  const [samples, setSamples] = useState<TelemetryRow[]>(() =>
    station.telemetryHistory !== undefined
      ? normalizeTelemetry(station.telemetryHistory)
      : DEMO_MODE
        ? demoTelemetryRange(station, now - 900000, now)
        : [],
  )
  const [sampleSource, setSampleSource] = useState(
    DEMO_MODE && station.telemetryHistory === undefined ? "demo" : "connected",
  )
  const [points, setPoints] = useState<MeasurementPoint[]>([])
  const [pointsReady, setPointsReady] = useState(false)
  const [pointRetry, setPointRetry] = useState(0)
  const SIGNALS = useMemo(() => DEMO_MODE ? [...DEMO_SIGNALS] : registeredChannels(points), [points])
  const [minutes, setMinutes] = useState(initialView === "live" ? 1 : 15)
  const [selected, setSelected] = useState<string[]>(DEMO_MODE ? initialMetric ? metricSignals(initialMetric) : INITIAL_SIGNALS : [])

  const [visible, setVisible] = useState<string[]>(DEMO_MODE ? initialMetric ? metricSignals(initialMetric) : INITIAL_CURVES : [])

  const [search, setSearch] = useState("")

  const [onlySelected, setOnlySelected] = useState(false)

  const [layout, setLayout] = useState("overlay")

  const [relative, setRelative] = useState(false)

  const [smooth, setSmooth] = useState(true)

  const [grid, setGrid] = useState(true)

  const [dots, setDots] = useState(false)

  const [zoom, setZoom] = useState(false)
  const [pan, setPan] = useState(false)
  const [zoomAxis, setZoomAxis] = useState<"X" | "Y" | "XY">("XY")

  const [windowMinutes, setWindowMinutes] = useState(15)

  const [zoomRange, setZoomRange] = useState<{
    start: number
    end: number
  } | null>(null)

  const [cursorMode, setCursorMode] = useState<"A" | "B" | null>("A")

  const [cursors, setCursors] = useState<{ A: number | null; B: number | null }>(
    { A: null, B: null },
  )

  const [range, setRange] = useState({
    start: localDateTime(initialRange?.start.getTime() ?? now - 900000),
    end: localDateTime(initialRange?.end.getTime() ?? now),
  })
  const [historyRange, setHistoryRange] = useState(range)
  const [historyQuery, setHistoryQuery] = useState<{
    key: string
    status: "loading" | "success" | "error"
  } | null>(() => DEMO_MODE ? {
    key: historyQueryKey(
      station.id, Date.parse(range.start), Date.parse(range.end), minutes, selected,
    ),
    status: "success",
  } : null)

  const [historySource, setHistorySource] = useState<TelemetryRow[]>(samples)

  const [historyIsDemo, setHistoryIsDemo] = useState(sampleSource === "demo")

  const [notice, setNotice] = useState("")
  const [poll, setPoll] = useState(0)
  useEffect(() => {
    if (DEMO_MODE || view !== "live" || !running || !canRead) return
    const timer = window.setInterval(() => setPoll((value) => value + 1), 10000)
    return () => window.clearInterval(timer)
  }, [view, running, canRead])

  useEffect(() => {
    if (DEMO_MODE) return
    const controller = new AbortController()
    setPoints([])
    setPointsReady(false)
    setSelected([])
    setVisible([])
    setQueryError("")
    setSamples([])
    setHistorySource([])
    setHistoryQuery(null)
    if (canRead) loadPoints(station.id, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setPoints(result)
      const ids = result.filter(point => !initialMetric || pointMatchesMetric(point, initialMetric)).map(point => `point:${point.id}`)
      setSelected(ids)
      setVisible(ids)
      setPointsReady(true)
    }).catch(error => {
      if (!controller.signal.aborted) setQueryError(error instanceof Error ? error.message : "测点读取失败")
    })
    return () => controller.abort()
  }, [station.id, canRead, initialMetric, pointRetry])

  useEffect(() => {
    if (DEMO_MODE) return
    if (!canRead) {
      setSamples([])
      setHistorySource([])
      setQueryLoading(false)
      return
    }
    if (!pointsReady) return
    const controller = new AbortController()
    const start =
      view === "history"
        ? (requestRange?.start ?? new Date(Date.now() - windowMinutes * 60000))
        : new Date(Date.now() - windowMinutes * 60000)
    const end =
      view === "history" ? (requestRange?.end ?? new Date()) : new Date()
    const key = historyQueryKey(station.id, start.getTime(), end.getTime(), minutes, selected)
    setHistoryQuery({ key, status: "loading" })
    setQueryLoading(true)
    setQueryError("")
    queryRegisteredTelemetry(points.filter(point => selected.includes(`point:${point.id}`)), start, end, minutes, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        const normalized = result
        setHistorySource(normalized)
        setSamples(normalized)
        setHistoryIsDemo(false)
        setSampleSource("connected")
        setHistoryQuery({ key, status: "success" })
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setHistorySource([])
          setSamples([])
          setQueryError(error instanceof Error ? error.message : "查询失败")
          setHistoryQuery({ key, status: "error" })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setQueryLoading(false)
      })
    return () => controller.abort()
  }, [station.id, requestRange, canRead, poll, view, windowMinutes, minutes, pointsReady, points, selected])

  useEffect(() => {
    if (!running || view !== "live") return

    const timer = window.setInterval(() => setNow(stationNow()), 1000)

    return () => window.clearInterval(timer)
  }, [running, view, station])

  useEffect(() => {
    if (!DEMO_MODE || !running || view !== "live") return
    if (station.telemetryHistory !== undefined) {
      setSamples(normalizeTelemetry(station.telemetryHistory))
      setSampleSource("connected")
    } else if (DEMO_MODE) {
      setSamples((current) =>
        sampleSource !== "demo" ||
        !current.length ||
        now - current[current.length - 1].timestamp > 3600000
          ? demoTelemetryRange(station, now - windowMinutes * 60000, now)
          : [
              ...current.filter(
                (sample) =>
                  sample.timestamp > now - 3600000 && sample.timestamp < now,
              ),
              demoTelemetry(station, now),
            ],
      )

      setSampleSource("demo")
    }
  }, [station, now, running, view, sampleSource, windowMinutes])

  const historyStart = Date.parse(historyRange.start)

  const historyEnd = Date.parse(historyRange.end)

  const rows = useMemo(() => {
    if (view === "history")
      return historySource.filter(
        (sample) =>
          sample.timestamp >= historyStart && sample.timestamp <= historyEnd,
      )

    return samples.filter(
      (sample) =>
        sample.timestamp >= now - windowMinutes * 60000 &&
        sample.timestamp <= now,
    )
  }, [
    view,
    historySource,
    historyStart,
    historyEnd,
    samples,
    now,
    windowMinutes,
  ])

  const displayedRows = useMemo(
    () =>
      zoomRange
        ? rows.filter(
            (row) =>
              row.timestamp >= zoomRange.start &&
              row.timestamp <= zoomRange.end,
          )
        : rows,
    [rows, zoomRange],
  )

  const plotRows = analyticsFeatures && zoom && zoomAxis === "Y" ? rows : displayedRows
  const chartRows = useMemo(() => {
    const step = Math.max(1, Math.ceil(plotRows.length / 450))

    // Preserve missing-data boundaries so downsampling cannot bridge invalid samples.

    return plotRows.filter(
      (row, index) =>
        index % step === 0 ||
        index === plotRows.length - 1 ||
        selected.some((id) => {
          if (!visible.includes(id)) return false

          const valid = typeof row[id] === "number"

          return (
            (index > 0 &&
              valid !== (typeof plotRows[index - 1][id] === "number")) ||
            (index + 1 < plotRows.length &&
              valid !== (typeof plotRows[index + 1][id] === "number"))
          )
        }),
    )
  }, [plotRows, selected, visible])

  const last = rows[rows.length - 1]

  const activeSignals = SIGNALS.filter((signal) => selected.includes(signal.id))

  const plottedSignals = SIGNALS.filter(
    (signal) => selected.includes(signal.id) && visible.includes(signal.id),
  )

  const validCount = rows.reduce(
    (sum, row) =>
      sum + selected.filter((id) => typeof row[id] === "number").length,
    0,
  )

  const quality =
    rows.length && selected.length
      ? `${((validCount / (rows.length * selected.length)) * 100).toFixed(1)}%`
      : "--"

  const isDemo = view === "live" ? sampleSource === "demo" : historyIsDemo

  const validRange = Boolean(
    range.start && range.end && Date.parse(range.end) > Date.parse(range.start),
  )

  const tickTime = (time: number) =>
    relative
      ? `${Math.round((time - (rows[0]?.timestamp ?? time)) / 1000)}s`
      : view === "history" && historyEnd - historyStart >= 86400000
        ? `${new Date(time).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })} ${clockTime(time)}`
        : clockTime(time)

  const cursorRow = (name: "A" | "B") =>
    cursors[name] === null ||
    !displayedRows.length ||
    cursors[name]! < displayedRows[0].timestamp ||
    cursors[name]! > displayedRows[displayedRows.length - 1].timestamp
      ? null
      : displayedRows.reduce((best, row) =>
          Math.abs(row.timestamp - cursors[name]!) <
          Math.abs(best.timestamp - cursors[name]!)
            ? row
            : best,
        )

  const rowA = cursorRow("A")

  const rowB = cursorRow("B")

  const sampleInterval =
    rows.length > 1
      ? (rows[rows.length - 1].timestamp - rows[0].timestamp) /
        (rows.length - 1) /
        1000
      : null

  const statsSignal = plottedSignals[0]

  const stats = useMemo(() => {
    const values = statsSignal
      ? displayedRows
          .map((row) => row[statsSignal.id])
          .filter((value): value is number => typeof value === "number")
      : []

    if (!values.length) return null

    return {
      min: values.reduce((a, b) => Math.min(a, b)),
      max: values.reduce((a, b) => Math.max(a, b)),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
    }
  }, [displayedRows, statsSignal])

  const currentHistoryKey = historyQueryKey(
    station.id, Date.parse(range.start), Date.parse(range.end), minutes, selected,
  )
  const matchingHistoryQuery = canRead && historyQuery?.key === currentHistoryKey
  const expectedSamples =
    Math.ceil((historyEnd - historyStart) / (minutes * 60000)) * activeSignals.length
  const availableSamples = rows.reduce(
    (count, row) => row.timestamp < historyEnd
      ? count + activeSignals.filter(signal => typeof row[signal.id] === "number").length
      : count,
    0,
  )
  const completeness = !matchingHistoryQuery
    ? "待查询"
    : historyQuery.status === "loading"
      ? "查询中…"
      : historyQuery.status === "error"
        ? "不可用"
        : expectedSamples > 0
          ? `${Math.min(100, availableSamples / expectedSamples * 100).toFixed(1)}%`
          : "—"
  const powerSignal = plottedSignals.find(signal => signal.unit === "kW")
  const powerValues = matchingHistoryQuery && historyQuery.status === "success" && powerSignal
    ? displayedRows
        .map(row => row[powerSignal.id])
        .filter((value): value is number => typeof value === "number")
    : []
  const trendSummary = [
    ["平均功率输出", powerValues.length ? `${valueText(powerValues.reduce((sum, value) => sum + value, 0) / powerValues.length)} kW` : "—"],
    ["数据完整度", completeness],
    ["异常标记统计", "未提供"],
    ["通信中断频率", "未提供"],
  ]

  function markDemoHistory(nextRange: typeof range) {
    setHistoryQuery({
      key: historyQueryKey(
        station.id, Date.parse(nextRange.start), Date.parse(nextRange.end), minutes, selected,
      ),
      status: "success",
    })
  }

  function toggleSignal(id: string) {
    const removing = selected.includes(id)

    setSelected((current) =>
      removing ? current.filter((value) => value !== id) : [...current, id],
    )

    setVisible((current) =>
      removing
        ? current.filter((value) => value !== id)
        : [...new Set([...current, id])],
    )
  }

  function switchView(next: "live" | "history") {
    setView(next)
    if (next === "live") setMinutes(1)
    setZoomRange(null)
    setCursors({ A: null, B: null })
    setNotice("")

    if (next === "history") {
      const end = last?.timestamp ?? now

      const initial = {
        start: localDateTime(end - windowMinutes * 60000),
        end: localDateTime(end),
      }

      setRange(initial)
      setHistoryRange(initial)
      if (!DEMO_MODE) {
        setRequestRange({ start: new Date(initial.start), end: new Date(initial.end) })
      } else markDemoHistory(initial)
      setHistorySource(samples)
      setHistoryIsDemo(sampleSource === "demo")
    } else setNow(stationNow())
  }

  function queryHistory() {
    if (!validRange) {
      setNotice("请选择有效范围，结束时间须晚于开始时间")
      return
    }

    setHistoryRange(range)
    if (DEMO_MODE) markDemoHistory(range)
    setZoomRange(null)
    setCursors({ A: null, B: null })
    if (!DEMO_MODE) {
      setRequestRange({
        start: new Date(range.start),
        end: new Date(range.end),
      })
      return
    }
    setHistoryIsDemo(station.telemetryHistory === undefined)

    setHistorySource(
      station.telemetryHistory === undefined
        ? demoTelemetryRange(
            station,
            Date.parse(range.start),
            Date.parse(range.end),
          )
        : normalizeTelemetry(station.telemetryHistory),
    )

    setNotice("历史数据已更新")
  }

  function exportCsv() {
    if (!canRead || !plotRows.length || !activeSignals.length) return
    const lines = [
      [
        "时间",
        ...activeSignals.map(
          (signal) => `${signal.group}/${signal.name} (${signal.unit})`,
        ),
      ],
      ...plotRows.map((row) => [
        localDateTime(row.timestamp),
        ...activeSignals.map((signal) =>
          typeof row[signal.id] === "number" ? String(row[signal.id]) : "",
        ),
      ]),
    ]

    const csv = lines
      .map((line) =>
        line.map((value) => `"${value.replace(/^[=+@\t\r\n-]/, "'$&").replace(/"/g, '""')}"`).join(","),
      )
      .join("\r\n")

    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    )

    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `${station.code}-${view}-telemetry.csv`
    anchor.click()

    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice(
      `已导出 ${plotRows.length} 个时间点、${selected.length} 个通道`,
    )
  }

  function renderChart(signals: typeof plottedSignals, chartKey: string) {
    const units = [...new Set(signals.map((signal) => signal.unit))].sort(
      (a, b) => (a === "kW" ? -1 : b === "kW" ? 1 : 0),
    )
    function domain(unit: string): [number | "auto", number | "auto"] {
      if (!analyticsFeatures || !zoom || !zoomRange) return unit === "%" ? [0, 100] : ["auto", "auto"]
      const rangeRows = zoomAxis === "X" ? rows : displayedRows
      const values = rangeRows.flatMap(row => signals.filter(s => s.unit === unit).map(s => row[s.id])).filter((v): v is number => typeof v === "number")
      if (!values.length) return ["auto", "auto"]
      const min = values.reduce((a, b) => Math.min(a, b)), max = values.reduce((a, b) => Math.max(a, b))
      const pad = Math.max((max - min) * 0.05, 1)
      return [min - pad, max + pad]
    }

    return (
      <div
        className={`analysis-chart ${
          layout !== "overlay" ? "analysis-chart--group" : ""
        }`}
        key={chartKey}
        data-analysis-chart={chartKey}
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={chartRows}
            syncId="station-analysis"
            syncMethod="value"
            margin={{ top: 20, right: 12, bottom: 4, left: 4 }}
          >
            {grid && <CartesianGrid stroke="#e6edf2" vertical />}
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={tickTime}
              tick={{ fontSize: 10, fill: "#647781" }}
              minTickGap={45}
              axisLine={false}
              tickLine={false}
            />
            {units.map((unit, index) => (
              <YAxis
                key={unit}
                yAxisId={unit}
                orientation={index % 2 === 0 ? "left" : "right"}
                width={45}
                domain={domain(unit)}
                allowDataOverflow={analyticsFeatures && zoom && zoomAxis !== "X"}
                tick={{ fontSize: 10, fill: "#647781" }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: unit,
                  position: "insideTopLeft",
                  dy: -18,
                  fontSize: 10,
                  fill: "#647781",
                }}
              />
            ))}
            <Tooltip
              labelFormatter={(value) =>
                localDateTime(Number(value)).replace("T", " ")
              }
              formatter={(value, name) => {
                const signal = signals.find((item) => item.id === name)
                return [
                  `${valueText(Number(value))} ${signal?.unit ?? ""}`,
                  signal?.name ?? name,
                ]
              }}
              contentStyle={{
                border: "1px solid #7ba4d4",
                borderRadius: 5,
                fontSize: 11,
              }}
            />
            {signals.map((signal) => (
              <Line
                key={signal.id}
                dataKey={signal.id}
                yAxisId={signal.unit}
                stroke={signal.color}
                strokeWidth={1.8}
                type={smooth ? "monotone" : "linear"}
                dot={dots ? { r: 2, strokeWidth: 0 } : false}
                activeDot={{ r: 3 }}
                strokeDasharray={signal.id === "soc" ? "5 3" : undefined}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
            {(["A", "B"] as const).map(
              (name) =>
                cursors[name] !== null && (
                  <ReferenceLine
                    key={name}
                    yAxisId={units[0]}
                    x={cursors[name]!}
                    stroke={name === "A" ? "#377ec4" : "#ad6540"}
                    strokeDasharray="4 3"
                    label={{ value: name, position: "insideTop", fontSize: 11 }}
                  />
                ),
            )}
            {cursorMode && (
              <CursorCapture
                rows={chartRows}
                onSelect={(timestamp) =>
                  setCursors((current) => ({
                    ...current,
                    [cursorMode]: timestamp,
                  }))
                }
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return (
    <div className="station-analysis-page">
      {(queryError || queryLoading) && (
        <div
          role={queryError ? "alert" : "status"}
          className="analysis-query-status"
        >
          {queryError || "正在查询历史采样…"}
          {queryError && <button type="button" className="analysis-button" onClick={() => pointsReady ? setPoll(value => value + 1) : setPointRetry(value => value + 1)}>重试读取</button>}
        </div>
      )}
      <header className="analysis-topbar">
        <div className="analysis-tabs" role="tablist" aria-label="分析视图">
          <button
            role="tab"
            aria-selected={view === "live"}
            onClick={() => switchView("live")}
          >
            实时分析
          </button>
          <button
            role="tab"
            aria-selected={view === "history"}
            onClick={() => switchView("history")}
          >
            历史趋势
          </button>
        </div>
        {!stationSelector && <span className="analysis-source">
          {station.name} · {isDemo ? "示例采样数据" : "已接入采样数据"}
        </span>}
        <div className="analysis-acquisition">
          <i className={running && view === "live" ? "is-running" : ""} />
          {view === "history" ? "历史快照" : running ? "采集中" : "已暂停"}
          <span>· 质量 {quality}</span>
        </div>
        {stationSelector}
        <button
          className="analysis-primary"
          disabled={view !== "live" || running}
          onClick={() => {
            setRunning(true)
            setNow(stationNow())
          }}
        >

          <Play size={12} />
          开启
        </button>
        <button
          className="analysis-button"
          disabled={view !== "live" || !running}
          onClick={() => setRunning(false)}
        >
          <Pause size={12} />
          暂停
        </button>
        <button
          className="analysis-icon"
          title="导出当前数据"
          aria-label="导出当前数据"
          disabled={!displayedRows.length || !selected.length}
          onClick={exportCsv}
        >
          <Download size={15} />
        </button>
      </header>
      {view === "history" && (
        <form
          className="analysis-history-range"
          onSubmit={(event) => {
            event.preventDefault()
            queryHistory()
          }}
        >
          {analyticsFeatures && <div className="analysis-quick-ranges">{["今日", "7天", "30天"].map((label, index) => <button type="button" className="analysis-button" key={label} onClick={() => {
            const end = new Date(stationNow()), start = new Date(end)
            if (index === 0) start.setHours(0, 0, 0, 0)
            else start.setDate(start.getDate() - (index === 1 ? 7 : 30))
            const next = { start: localDateTime(+start), end: localDateTime(+end) }
            setRange(next)
            setHistoryRange(next)
            setRequestRange({ start: new Date(next.start), end: new Date(next.end) })
            setZoomRange(null)
            if (DEMO_MODE) {
              setHistorySource(station.telemetryHistory === undefined
                ? demoTelemetryRange(station, Date.parse(next.start), Date.parse(next.end))
                : normalizeTelemetry(station.telemetryHistory))
              setHistoryIsDemo(station.telemetryHistory === undefined)
              markDemoHistory(next)
            }
          }}>{label}</button>)}<span>自定义</span></div>}
          <label>
            开始时间
            <input
              type="datetime-local"
              step="1"
              value={range.start}
              onChange={(event) =>
                setRange({ ...range, start: event.target.value })
              }
            />
          </label>
          <span>至</span>
          <label>
            结束时间
            <input
              type="datetime-local"
              step="1"
              value={range.end}
              onChange={(event) =>
                setRange({ ...range, end: event.target.value })
              }
            />
          </label>
          <button className="analysis-primary" type="submit">
            <Search size={13} />
            查询
          </button>
        </form>
      )}
      <div className="analysis-workspace">
        <aside className="analysis-signal-browser" aria-label="信号浏览器">
          <header>
            <h2>信号浏览器</h2>
            <span>{selected.length} 已选</span>
          </header>
          <label className="analysis-search">
            {analyticsFeatures ? <img src="/figma/analytics/search.svg" alt="" /> : <Search size={14} />}
            <input
              placeholder="搜索设备或信号"
              aria-label="搜索设备或信号"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="analysis-only-selected">
            仅显示已选信号
            <input
              type="checkbox"
              role="switch"
              checked={onlySelected}
              onChange={(event) => setOnlySelected(event.target.checked)}
            />
          </label>
          {[...new Set(SIGNALS.map(signal => signal.group))].map((group) => {
            const signals = SIGNALS.filter(
              (signal) =>
                signal.group === group &&
                (!onlySelected || selected.includes(signal.id)) &&
                `${signal.group}${signal.name}`
                  .toLowerCase()
                  .includes(search.toLowerCase().trim()),
            )

            return (
              signals.length > 0 && (
                <section className="analysis-signal-group" key={group}>
                  <h3>
                    {group}
                    <span>
                      {
                        SIGNALS.filter(
                          (signal) =>
                            signal.group === group &&
                            selected.includes(signal.id),
                        ).length
                      }{" "}
                      /{" "}
                      {
                        SIGNALS.filter((signal) => signal.group === group)
                          .length
                      }
                    </span>
                  </h3>
                  {signals.map((signal) => (
                    <label key={signal.id} className="analysis-signal">
                      <input
                        type="checkbox"
                        checked={selected.includes(signal.id)}
                        onChange={() => toggleSignal(signal.id)}
                        style={{ accentColor: signal.color }}
                      />
                      <i style={{ background: signal.color }} />
                      <span>{signal.name}</span>
                      <small>
                        {valueText(last?.[signal.id])} <em>{signal.unit}</em>
                      </small>
                    </label>
                  ))}
                </section>
              )
            )
          })}
          {!SIGNALS.some(
            (signal) =>
              (!onlySelected || selected.includes(signal.id)) &&
              `${signal.group}${signal.name}`
                .toLowerCase()
                .includes(search.toLowerCase().trim()),
          ) && <p className="analysis-empty-small">没有匹配的信号</p>}
        </aside>
        <section className="analysis-trends" aria-label="多信号趋势">
          <header className="analysis-trend-header">
            <h2>{analyticsFeatures && view === "history" ? "历史多信号趋势" : "多信号趋势"}</h2>
            <label className="analysis-window">
              滚动窗口
              <select
                aria-label="滚动窗口"
                value={windowMinutes}
                disabled={view === "history"}
                onChange={(event) => {
                  setWindowMinutes(Number(event.target.value))
                  setZoomRange(null)
                }}
              >
                <option value={5}>5 min</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
              </select>
            </label>
            <label className="analysis-window">
              采样粒度
              <select aria-label="采样粒度" value={minutes} onChange={event => { setMinutes(Number(event.target.value)); setZoomRange(null) }}>
                {[1, 5, 15, 30, 60].map(value => <option key={value} value={value}>{value} min</option>)}
              </select>
            </label>
            <span className="analysis-small">
              {analyticsFeatures && !DEMO_MODE ? `聚合 ${minutes} min` : `采样 ${sampleInterval ? `${sampleInterval.toFixed(1)} s` : "--"}`}
            </span>
            <div className="analysis-chart-tools">
              <div
                className="analysis-segmented"
                role="group"
                aria-label="图表布局"
              >
                <button
                  aria-pressed={layout === "overlay"}
                  onClick={() => setLayout("overlay")}
                >
                  <Layers size={12} />
                  叠加
                </button>
                <button
                  aria-pressed={layout === "group"}
                  onClick={() => setLayout("group")}
                >
                  <ChartNoAxesCombined size={12} />
                  {analyticsFeatures ? "分层" : "分组"}
                </button>
                <button
                  aria-pressed={layout === "split"}
                  onClick={() => setLayout("split")}
                >
                  <PanelsTopLeft size={12} />
                  {analyticsFeatures ? "分窗" : "分屏"}
                </button>
              </div>
              {(["A", "B"] as const).map((name) => (
                <button
                  className="analysis-button"
                  key={name}
                  aria-pressed={cursorMode === name}
                  onClick={() =>
                    setCursorMode(cursorMode === name ? null : name)
                  }
                >
                  游标 {name}
                </button>
              ))}
              {analyticsFeatures && <button type="button" className="analysis-button" aria-pressed={pan} disabled={rows.length < 2} onClick={() => { setPan(!pan); setZoom(true); setZoomAxis("X"); if (!zoomRange && rows.length > 1) setZoomRange({ start: rows[0].timestamp, end: rows[Math.floor((rows.length - 1) / 2)].timestamp }) }}>平移</button>}
              <button
                className="analysis-icon"
                title="平滑曲线"
                aria-label="平滑曲线"
                aria-pressed={smooth}
                onClick={() => setSmooth(!smooth)}
              >
                {analyticsFeatures ? "平滑" : <Spline size={14} />}
              </button>
              <button
                className="analysis-icon"
                title="缩放时间范围"
                aria-label="缩放时间范围"
                aria-pressed={zoom}
                onClick={() => { setZoom(!zoom); setPan(false) }}
              >
                {analyticsFeatures ? "缩放" : <ZoomIn size={14} />}
              </button>
              <button
                className="analysis-icon"
                title="还原视图"
                aria-label="还原视图"
                onClick={() => {
                  setZoomRange(null)
                  setCursors({ A: null, B: null })
                  setZoom(false)
                  setPan(false)
                }}
              >
                {analyticsFeatures ? "适配" : <RotateCcw size={14} />}
              </button>
              <button
                className="analysis-icon"
                title="显示网格"
                aria-label="显示网格"
                aria-pressed={grid}
                onClick={() => setGrid(!grid)}
              >
                {analyticsFeatures ? "网格" : <Grid2X2 size={14} />}
              </button>
              <button
                className="analysis-icon"
                title="显示采样点"
                aria-label="显示采样点"
                aria-pressed={dots}
                onClick={() => setDots(!dots)}
              >
                {analyticsFeatures ? "点" : <Circle size={13} />}
              </button>
            </div>
          </header>
          <div
            className="analysis-segmented analysis-time-mode"
            role="group"
            aria-label="时间坐标"
          >
            <button aria-pressed={relative} onClick={() => setRelative(true)}>
              相对
            </button>
            <button aria-pressed={!relative} onClick={() => setRelative(false)}>
              绝对
            </button>
            {analyticsFeatures && <label className="analysis-axis-mode">缩放坐标 <select aria-label="缩放坐标" value={zoomAxis} onChange={event => { setZoomAxis(event.target.value as "X" | "Y" | "XY"); setPan(false) }}>{["X", "Y", "XY"].map(axis => <option key={axis}>{axis}</option>)}</select></label>}
          </div>
          <div className="analysis-legend">
            {activeSignals.map((signal) => (
              <button
                key={signal.id}
                aria-pressed={visible.includes(signal.id)}
                onClick={() =>
                  setVisible((current) =>
                    current.includes(signal.id)
                      ? current.filter((id) => id !== signal.id)
                      : [...current, signal.id],
                  )
                }
              >
                <i style={{ background: signal.color }} />
                {signal.name}
                <span>
                  {valueText(last?.[signal.id])} {signal.unit}
                </span>
              </button>
            ))}
          </div>
          {!plottedSignals.length || !chartRows.length ? (
            <div className="analysis-empty">
              <ChartNoAxesCombined size={28} />
              <p>
                {!selected.length
                  ? "请选择需要分析的信号"
                  : !plottedSignals.length
                    ? "暂无显示的曲线"
                    : "当前时间范围暂无采样数据"}
              </p>
            </div>
          ) : layout === "overlay" ? (
            renderChart(plottedSignals, "overlay")
          ) : layout === "split" ? (
            <div className="analysis-split">
              {plottedSignals.map((signal) => (
                <section key={signal.id}>
                  <h3 style={{ color: signal.color }}>
                    {signal.name} / {signal.unit}
                  </h3>
                  {renderChart([signal], signal.id)}
                </section>
              ))}
            </div>
          ) : (
            [...new Set(plottedSignals.map((signal) => signal.unit))].map(
              (unit) =>
                renderChart(
                  plottedSignals.filter((signal) => signal.unit === unit),
                  unit,
                ),
            )
          )}
          {zoom && rows.length > 1 && (
            <div className="analysis-brush">
              {analyticsFeatures && <span className="analysis-small">{pan ? "拖动选区平移；拖动边缘调整范围" : "拖动边缘选择范围；Y 模式保留完整时间轴"}</span>}
              <ResponsiveContainer width="100%" height={40} minWidth={0}>
                <LineChart data={rows}>
                  <Brush
                    dataKey="timestamp"
                    height={24}
                    stroke="#80a9d4"
                    tickFormatter={clockTime}
                    startIndex={
                      zoomRange
                        ? Math.max(
                            0,
                            rows.findIndex(
                              (row) => row.timestamp >= zoomRange.start,
                            ),
                          )
                        : 0
                    }
                    endIndex={
                      zoomRange
                        ? Math.max(
                            0,
                            rows.findIndex(
                              (row) => row.timestamp >= zoomRange.end,
                            ),
                          )
                        : rows.length - 1
                    }
                    onChange={(value) => {
                      if (
                        value.startIndex !== undefined &&
                        value.endIndex !== undefined
                      )
                        setZoomRange({
                          start: rows[value.startIndex].timestamp,
                          end: rows[value.endIndex].timestamp,
                        })
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <footer className="analysis-chart-summary">
            <span>游标 A：{rowA ? clockTime(rowA.timestamp) : "--"}</span>
            <span>游标 B：{rowB ? clockTime(rowB.timestamp) : "--"}</span>
            <span>
              Δt{" "}
              {rowA && rowB
                ? `${Math.abs(rowB.timestamp - rowA.timestamp) / 1000} s`
                : "--"}
            </span>
            <span>{plotRows.length.toLocaleString()} {analyticsFeatures && !DEMO_MODE ? "时间点（含缺口）" : "samples"}</span>
            {stats && (
              <span>
                {statsSignal.name} · min {valueText(stats.min)} · max{" "}
                {valueText(stats.max)} · avg {valueText(stats.avg)}{" "}
                {statsSignal.unit}
              </span>
            )}
            {rowA &&
              plottedSignals.map((signal) => (
                <span key={signal.id} style={{ color: signal.color }}>
                  {signal.name} {valueText(rowA[signal.id])} {signal.unit}
                  {rowB &&
                  typeof rowB[signal.id] === "number" &&
                  typeof rowA[signal.id] === "number"
                    ? ` · Δ ${valueText(rowB[signal.id]! - rowA[signal.id]!)} ${signal.unit}`
                    : ""}
                </span>
              ))}
          </footer>
        </section>
      </div>
      {analyticsFeatures && view === "history" && (
        <section className="analytics-trend-summary" aria-label="趋势对照摘要">
          {trendSummary.map(([label, value]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong></div>
          ))}
          <p>功率均值对应当前视窗首个已显示 kW 测点；完整度统计完整查询区间，按查询粒度及所选通道计算，不随视图缩放变化。缺失区间不代表设备故障。</p>
        </section>
      )}
      <section className="analysis-channels" aria-label="监测通道">
        <header>
          <h2>监测通道</h2>
          <span>
            {selected.length} 个通道 ·{" "}
            {last
              ? selected.filter((id) => typeof last[id] === "number").length
              : 0}
            /{selected.length} 有效 · 最近更新{" "}
            {last ? clockTime(last.timestamp) : "--"}
          </span>
          <div className="analysis-export-range">
            {displayedRows.length
              ? `${clockTime(displayedRows[0].timestamp)} - ${clockTime(displayedRows[displayedRows.length - 1].timestamp)}`
              : "--"}
          </div>
          <button
            className="analysis-export"
            disabled={!displayedRows.length || !selected.length}
            onClick={exportCsv}
          >
            <Download size={13} />
            下载有效数据 CSV
          </button>
        </header>
        <div className="analysis-table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "信号",
                  "当前值",
                  "单位",
                  "质量",
                  "数据龄期",
                  "时间戳",
                  analyticsFeatures && !DEMO_MODE ? "有效时间点" : "样本数",
                  analyticsFeatures && !DEMO_MODE ? "聚合粒度" : "采样率",
                  "显示",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeSignals.map((signal) => {
                const validRows = rows.filter(
                  (row) => typeof row[signal.id] === "number",
                )

                const latestValid = validRows[validRows.length - 1]

                const good = typeof last?.[signal.id] === "number"

                return (
                  <tr key={signal.id}>
                    <td>
                      <i style={{ background: signal.color }} />
                      {signal.group} / {signal.name}
                    </td>
                    <td>{valueText(last?.[signal.id])}</td>
                    <td>{signal.unit}</td>
                    <td className={good ? "analysis-good" : "analysis-bad"}>
                      {good ? "有效" : "无效 / 缺失"}
                    </td>
                    <td>
                      {latestValid
                        ? `${Math.max(0, ((view === "live" ? now : historyEnd) - latestValid.timestamp) / 1000).toFixed(1)} s`
                        : "--"}
                    </td>
                    <td>{last ? clockTime(last.timestamp) : "--"}</td>
                    <td>{validRows.length.toLocaleString()}</td>
                    <td>
                      {analyticsFeatures && !DEMO_MODE ? `${minutes} min` : sampleInterval
                        ? `${(1 / sampleInterval).toFixed(2)} Hz`
                        : "--"}
                    </td>
                    <td>
                      <label className="analysis-curve-toggle">
                        <input
                          type="checkbox"
                          aria-label={`显示${signal.name}曲线`}
                          checked={visible.includes(signal.id)}
                          onChange={() =>
                            setVisible((current) =>
                              current.includes(signal.id)
                                ? current.filter((id) => id !== signal.id)
                                : [...current, signal.id],
                            )
                          }
                        />
                        曲线{" "}
                        {SIGNALS.findIndex((item) => item.id === signal.id) + 1}
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!selected.length && (
            <p className="analysis-empty-small">暂无选中通道</p>
          )}
        </div>
        <footer>
          <span>
            当前显示 {plottedSignals.length} / {selected.length} ·{" "}
            {isDemo ? "示例数据" : "接入数据"}
          </span>
          <span role="status">{notice}</span>
        </footer>
      </section>
    </div>
  )
}
