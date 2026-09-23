import { hasStationPermission } from "@/auth/apiPermissions"
import { DEMO_MODE } from "@/api/client"
import "./station-api-overview.css"
import { useAuth } from "@/auth/AuthContext"
import { useState, useRef, useEffect, useMemo, useCallback } from "react"

import { X } from "lucide-react"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts"

import type { Station } from "@/App"

import {
  buildStationPowerData,
  buildStationRevenueModel,
  buildStationSocData,
  getDefaultRevenueDateRange,
  type RevenueDateRange,
} from "@/data/stationMetrics"

import EnergyFlow3D, {
  type DeviceConfig,
  type EdgeConfig,
  INIT_DEVICES,
  INIT_EDGES,
} from "./EnergyFlow3D"

import EnergyFlowDiagram from "./EnergyFlowDiagram"

import StationRevenuePage from "./StationRevenuePage"

import StationStrategyPage from "./StationStrategyPage"

import StationSingleLinePage from "./StationSingleLinePage"

import StationAlarmsPage from "./StationAlarmsPage"

import StationRunCurvePage from "./StationRunCurvePage"

import StationPriceSettingsPage from "./StationPriceSettingsPage"

import StationDevicesPage from "./StationDevicesPage"

import { stationDataNow } from "@/data/dataClock"

import { pointValue } from "@/data/stationDevices"

import type { StationSubNav, UserRole } from "@/auth/roles"

// ── Shared styles ─────────────────────────────────────────────────────────────

const mono = { fontFamily: "'JetBrains Mono',monospace" } as const

const card = {
  background: "#fff",

  border: "1px solid #dbe6df",

  borderRadius: 8,

  boxShadow: "0 4px 10px rgb(28 55 48 / 5%)",
} as const

const STATUS_COLOR: Record<string, string> = {
  unknown: "#76857f",
  online: "#10b981",
  fault: "#ef4444",
  offline: "#76857f",
  building: "#1f7a68",
}

type StationRange = "D" | "M" | "Y"

function revenuePeriodMeta(gran: Granularity, dateRange: RevenueDateRange) {
  const defaultRange = getDefaultRevenueDateRange(gran)

  const isDefaultRange =
    dateRange.start === defaultRange.start && dateRange.end === defaultRange.end

  if (gran === "周") {
    return {
      start: dateRange.start,

      end: dateRange.end,

      currentLabel: isDefaultRange ? "本周收益" : "选定范围收益",

      totalLabel: isDefaultRange ? "近8周累计收益" : "选定范围累计收益",

      compositionLabel: isDefaultRange ? "近8周收益构成" : "选定范围收益构成",

      compareLabel: "上一周",
    }
  }

  if (gran === "月") {
    return {
      start: dateRange.start,

      end: dateRange.end,

      currentLabel: isDefaultRange ? "本月收益" : "选定范围收益",

      totalLabel: isDefaultRange ? "本年累计收益" : "选定范围累计收益",

      compositionLabel: isDefaultRange ? "本年收益构成" : "选定范围收益构成",

      compareLabel: "上月",
    }
  }

  if (gran === "年") {
    return {
      start: dateRange.start,

      end: dateRange.end,

      currentLabel: isDefaultRange ? "本年收益" : "选定范围收益",

      totalLabel: isDefaultRange ? "近5年累计收益" : "选定范围累计收益",

      compositionLabel: isDefaultRange ? "近5年收益构成" : "选定范围收益构成",

      compareLabel: "上一年",
    }
  }

  return {
    start: dateRange.start,

    end: dateRange.end,

    currentLabel: isDefaultRange ? "今日收益" : "选定范围收益",

    totalLabel: isDefaultRange ? "本月累计收益" : "选定范围累计收益",

    compositionLabel: isDefaultRange ? "本月收益构成" : "选定范围收益构成",

    compareLabel: "上一周期",
  }
}

// ── Chart data generators (memoised per station/range) ───────────────────────

function makePowerData(station: Station, range: StationRange) {
  return buildStationPowerData(station, range)
}

function makeSocData(station: Station, range: StationRange) {
  return buildStationSocData(station, range)
}

// ── Custom chart tooltip ──────────────────────────────────────────────────────

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null

  return (
    <div
      style={{
        background: "rgba(15,23,42,0.92)",
        color: "#fff",
        padding: "8px 12px",
        borderRadius: 6,
        fontSize: 11,
      }}
    >
      <div style={{ color: "#76857f", marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginTop: 2 }}>
          {p.name}: <span style={mono}>{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function stationDevice(station: Station, id: string) {
  return station.deviceInventory?.find((device) => device.id === id)
}

function stationPoint(station: Station, deviceId: string, pointId: string) {
  return pointValue(
    stationDevice(station, deviceId)?.points.find(
      (point) => point.id === pointId,
    ),
  )
}

function stationSnapshotTime(station: Station) {
  const latest =
    station.operations?.samples?.at(-1)?.timestamp ??
    station.telemetryHistory?.at(-1)?.timestamp ??
    station.deviceInventory

      ?.map((device) => device.updatedAt)

      .filter(Boolean)

      .sort()

      .at(-1)

  if (latest) {
    const parsed = new Date(latest)

    if (Number.isFinite(parsed.getTime()))
      return parsed.toLocaleTimeString("zh-CN", { hour12: false })
  }

  return station.updateTime || "—"
}

function trendPercent(current: number | null, previous: number | null) {
  if (current === null || previous === null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null

  const value = ((current - previous) / Math.abs(previous)) * 100

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
}

// ── Trend Charts ──────────────────────────────────────────────────────────────

const POWER_LINES = [
  { key: "load", name: "负荷", color: "#10b981" },

  { key: "grid", name: "电网", color: "#1f7a68" },

  { key: "storage", name: "储能", color: "#2a806e" },
] as const

const RANGE_BTNS: StationRange[] = ["D", "M", "Y"]

function formatDate(value: Date) {
  const y = value.getFullYear()

  const m = String(value.getMonth() + 1).padStart(2, "0")

  const d = String(value.getDate()).padStart(2, "0")

  return `${y}-${m}-${d}`
}

function trendPeriodLabel(range: StationRange, station: Station) {
  const now = stationDataNow(station)

  if (range === "M")
    return `本月 ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

  if (range === "Y") return `今年 ${now.getFullYear()}`

  return `今日 ${formatDate(now)}`
}

function TrendCharts({ station }: { station: Station }) {
  const [rangeIdx, setRangeIdx] = useState(0)

  const selectedRange = RANGE_BTNS[rangeIdx] ?? "D"

  const tickInterval = selectedRange === "D" ? 3 : selectedRange === "M" ? 4 : 0

  const powerData = useMemo(
    () => makePowerData(station, selectedRange),
    [station, selectedRange],
  )

  const socData = useMemo(
    () => makeSocData(station, selectedRange),
    [station, selectedRange],
  )

  const clock = stationSnapshotTime(station)

  const last = powerData[powerData.length - 1]

  return (
    <div
      className="station-overview-trend-card"
      style={{ ...card, padding: 16, flex: 1, minWidth: 0, overflow: "hidden" }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          flexWrap: "wrap",
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>
          运行趋势
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setRangeIdx((i) => (i + 1) % RANGE_BTNS.length)}
          title="切换时间范围"
          data-time-range="station-trend"
          style={{
            border: "none",

            background: "none",

            padding: 0,

            fontSize: 11,

            color: "#76857f",

            cursor: "pointer",
          }}
        >
          {trendPeriodLabel(selectedRange, station)}
        </button>
        {RANGE_BTNS.map((b, i) => (
          <button
            key={b}
            onClick={() => setRangeIdx(i)}
            style={{
              padding: "2px 7px",
              borderRadius: 4,
              border: "1px solid #d8e3dc",

              background: rangeIdx === i ? "#eaf5ef" : "none",

              color: rangeIdx === i ? "#1f7a68" : "#61716b",

              fontSize: 10,
              cursor: "pointer",
              fontWeight: rangeIdx === i ? 600 : 400,
            }}
          >
            {b}
          </button>
        ))}
        <span
          style={{
            fontSize: 10,
            color: "#61716b",
            marginLeft: 2,
            cursor: "pointer",
          }}
        >
          总计
        </span>
      </div>

      {/* Power chart */}
      <div style={{ marginBottom: 4 }} data-chart="station-power-trend">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 500, color: "#465b53" }}>
            站点功率 MW
          </span>
          {POWER_LINES.map((l) => (
            <div
              key={l.key}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              <div
                style={{
                  width: 14,
                  height: 2,
                  background: l.color,
                  borderRadius: 1,
                }}
              />
              <span style={{ fontSize: 10, color: "#61716b" }}>
                {l.name}{" "}
                <span style={{ ...mono, fontWeight: 700, color: l.color }}>
                  {last[l.key]} MW
                </span>
              </span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ ...mono, fontSize: 11, color: "#76857f" }}>
            {clock}
          </span>
        </div>
        <div style={{ width: "100%", height: 110, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={powerData}
              margin={{ top: 4, right: 6, bottom: 0, left: -22 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e8f0eb"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#76857f" }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#76857f" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTip />} />
              {POWER_LINES.map((l) => (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.name}
                  stroke={l.color}
                  strokeWidth={1.5}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ height: 12 }} />

      {/* SOC chart */}
      <div data-chart="station-soc-trend">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 500, color: "#465b53" }}>
            SOC %
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 14,
                height: 2,
                background: "#10b981",
                borderRadius: 1,
              }}
            />
            <span style={{ fontSize: 10, color: "#61716b" }}>
              SOC {station.soc}%
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 14,
                height: 0,
                borderTop: "1.5px dashed #f59e0b",
              }}
            />
            <span style={{ fontSize: 10, color: "#76857f" }}>上限 90%</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 14,
                height: 0,
                borderTop: "1.5px dashed #ef4444",
              }}
            />
            <span style={{ fontSize: 10, color: "#76857f" }}>下限 20%</span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ ...mono, fontSize: 11, color: "#76857f" }}>
            {clock}
          </span>
        </div>
        <div style={{ width: "100%", height: 110, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={socData}
              margin={{ top: 4, right: 6, bottom: 0, left: -22 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#e8f0eb"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#76857f" }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#76857f" }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
              />
              <Tooltip content={<ChartTip />} />
              <ReferenceLine
                y={90}
                stroke="#f59e0b"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
              <ReferenceLine
                y={20}
                stroke="#ef4444"
                strokeDasharray="4 3"
                strokeWidth={1}
              />
              <Line
                type="monotone"
                dataKey="soc"
                name="SOC"
                stroke="#10b981"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}

// ── Device Detail ─────────────────────────────────────────────────────────────

const DEVICE_TABS = ["电网", "光伏", "负荷", "PCS", "电池"] as const

type DeviceTab = typeof DEVICE_TABS[number]

function DeviceDetail({
  station,

  compact = false,

  onViewDetails,

  summaryCount,

  showAction = false,
}: {
  station: Station

  compact?: boolean

  onViewDetails?: () => void

  summaryCount?: number

  showAction?: boolean
}) {
  const [tab, setTab] = useState<DeviceTab>("电池")

  const actual = (deviceId: string, pointId: string, fallback: number) =>
    stationPoint(station, deviceId, pointId) ?? fallback

  const loadMw = Math.max(0, station.activePower / 1000)

  const gridMw = Math.max(0, loadMw - station.pvOutput - station.generator)

  const pcsMw = Math.max(0, (station.storageCapacity * station.soc) / 100)

  const dailyPvMwh = Math.max(0, station.pvOutput * 5.6)

  const dailyLoadMwh = Math.max(0, loadMw * 8.2)

  const voltage =
    stationPoint(station, "PCS-01", "dcVoltage") ??
    stationPoint(station, "BMS-01", "dcVoltage") ??
    768

  const current =
    stationPoint(station, "BMS-01", "dcCurrent") ??
    (voltage ? (station.activePower * 1000) / voltage : 0)

  const latestStorage = station.telemetryHistory?.at(-1)?.values.storage ?? null

  const batteryState =
    station.status === "offline" || station.dataStatus === "disconnected"
      ? "离线"
      : latestStorage !== null && latestStorage > 0
        ? "放电中"
        : latestStorage !== null && latestStorage < 0
          ? "充电中"
          : "待机"

  const metrics: Record<DeviceTab, {
    label: string
    value: string
    unit?: string
  }[]> = {
    电网: [
      { label: "当前功率", value: gridMw.toFixed(2), unit: "MW" },

      {
        label: "电压",
        value: actual("MTR-01", "voltageA", 400).toFixed(2),
        unit: "V",
      },

      {
        label: "频率",
        value: actual("MTR-01", "frequency", 50).toFixed(2),
        unit: "Hz",
      },

      {
        label: "功率因数",
        value: actual("MTR-01", "powerFactor", 0.98).toFixed(3),
      },

      { label: "日用电量", value: dailyLoadMwh.toFixed(1), unit: "MWh" },
    ],

    光伏: [
      {
        label: "发电功率",
        value: Math.max(0, station.pvOutput).toFixed(2),
        unit: "MW",
      },

      { label: "日发电量", value: dailyPvMwh.toFixed(1), unit: "MWh" },

      {
        label: "MPPT效率",
        value: actual("PCS-01", "efficiency", 97.8).toFixed(1),
        unit: "%",
      },

      {
        label: "辐照强度",
        value: Math.round(Math.max(0, station.pvOutput) * 640).toString(),
        unit: "W/m²",
      },

      {
        label: "组件温度",
        value: actual("BMS-01", "temperature", 32).toFixed(1),
        unit: "°C",
      },
    ],

    负荷: [
      { label: "用电功率", value: loadMw.toFixed(2), unit: "MW" },

      {
        label: "功率因数",
        value: actual("MTR-02", "powerFactor", 0.95).toFixed(3),
      },

      { label: "日用电量", value: dailyLoadMwh.toFixed(1), unit: "MWh" },

      { label: "负载率", value: `${station.loadRate}`, unit: "%" },
    ],

    PCS: [
      { label: "充电功率", value: pcsMw.toFixed(2), unit: "MW" },

      {
        label: "效率",
        value: actual("PCS-01", "efficiency", 96.5).toFixed(1),
        unit: "%",
      },

      { label: "直流母线电压", value: voltage.toFixed(2), unit: "V" },

      {
        label: "温度",
        value: actual("PCS-01", "temperature", 28.5).toFixed(1),
        unit: "°C",
      },

      {
        label: "运行状态",
        value: station.status === "fault" ? "告警保护" : "并网运行",
      },
    ],

    电池: [
      { label: "SOC", value: station.soc.toFixed(1), unit: "%" },

      {
        label: "SOH",
        value: actual("BMS-01", "soh", 98.2).toFixed(1),
        unit: "%",
      },

      {
        label: "有功功率",
        value: Math.round(station.activePower).toString(),
        unit: "kW",
      },

      { label: "直流电压", value: voltage.toFixed(2), unit: "V" },

      { label: "直流电流", value: current.toFixed(2), unit: "A" },

      {
        label: "最高温度",
        value: actual("BMS-01", "temperature", 31.6).toFixed(1),
        unit: "°C",
      },

      {
        label: "单体温差",
        value: actual("BMS-01", "tempDelta", 2.4).toFixed(1),
        unit: "°C",
      },
    ],
  }

  const visibleMetrics = compact
    ? metrics[tab].slice(0, summaryCount ?? 3)
    : metrics[tab]

  return (
    <div
      className="station-overview-device"
      style={{
        ...card,
        padding: compact ? 12 : 14,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: compact ? 6 : 10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>
          设备详情
        </span>
        <span style={{ fontSize: 10, color: "#76857f" }}>
          当前选中 · 电池簇 01
        </span>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          background: "#f4f8f5",
          borderRadius: 6,
          padding: 3,
          marginBottom: compact ? 8 : 12,
          gap: 2,
        }}
      >
        {DEVICE_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "5px 0",
              borderRadius: 5,
              border: "none",
              cursor: "pointer",

              fontSize: 11,
              fontWeight: tab === t ? 600 : 400,

              color: tab === t ? "#1f7a68" : "#61716b",

              background: tab === t ? "#fff" : "none",

              boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none",

              transition: "all 0.12s",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Status badge (battery only) */}
      {tab === "电池" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: compact ? "4px 8px" : "6px 10px",
            background: "#f0fdf8",
            borderRadius: 6,
            marginBottom: compact ? 5 : 10,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background:
                batteryState === "离线"
                  ? "#76857f"
                  : station.status === "fault"
                    ? "#ef4444"
                    : "#10b981",
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color:
                batteryState === "离线"
                  ? "#76857f"
                  : station.status === "fault"
                    ? "#ef4444"
                    : "#10b981",
            }}
          >
            {batteryState}
          </span>
          <span
            style={{
              ...mono,
              fontSize: 10,
              color: "#76857f",
              marginLeft: "auto",
            }}
          >
            BMS-01 · {stationSnapshotTime(station)}
          </span>
        </div>
      )}

      {/* Overview is intentionally a summary; detailed telemetry remains in the device page. */}
      <div
        className={
          compact
            ? "station-overview-device-metrics is-compact"
            : "station-overview-device-metrics"
        }
      >
        {visibleMetrics.map(({ label, value, unit }) => (
          <div
            key={label}
            style={{
              display: "flex",

              justifyContent: compact ? "flex-start" : "space-between",

              flexDirection: compact ? "column" : "row",

              alignItems: compact ? "flex-start" : "center",

              gap: compact ? 3 : 0,

              padding: compact ? "5px 8px" : "6px 0",

              borderBottom: compact ? "none" : "1px solid #f4f8f5",
            }}
          >
            <span style={{ fontSize: 11, color: "#61716b" }}>{label}</span>
            <span
              style={{
                ...mono,
                fontSize: compact ? 13 : 12,
                fontWeight: 600,
                color: "#1d2f2a",
              }}
            >
              {value}
              {unit && (
                <span
                  style={{
                    fontSize: 10,
                    color: "#76857f",
                    fontWeight: 400,
                    marginLeft: 2,
                  }}
                >
                  {unit}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {(!compact || showAction) && (
        <button
          onClick={onViewDetails}
          style={{
            width: "100%",
            marginTop: compact ? 8 : 12,
            padding: "7px 0",
            borderRadius: 6,
            border: "1px solid #d8e3dc",
            background: "none",
            fontSize: 11,
            color: "#1f7a68",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          查看设备完整档案 →
        </button>
      )}
    </div>
  )
}

// ── Alert Panel ───────────────────────────────────────────────────────────────

type AlertLevel = "critical" | "warning" | "recovered"

interface AlertItem {
  level: AlertLevel

  msg: string

  device: string

  time: string
}

function buildAlerts(station: Station): AlertItem[] {
  if (station.alarmHistory?.length) {
    return station.alarmHistory.map((alarm) => ({
      level: alarm.status === "recovered" ? "recovered" : alarm.severity,

      msg: alarm.title,

      device: alarm.device,

      time: new Date(alarm.occurredAt).toLocaleTimeString("zh-CN", {
        hour12: false,
      }),
    }))
  }

  const deviceAlerts =
    station.deviceInventory?.flatMap((device) =>
      device.alarms.map((alarm) => ({
        level: alarm.active ? alarm.severity : "recovered" as AlertLevel,

        msg: alarm.title,

        device: device.id,

        time: new Date(alarm.at).toLocaleTimeString("zh-CN", {
          hour12: false,
        }),
      })),
    ) ?? []

  if (deviceAlerts.length) return deviceAlerts

  return station.alerts.map((alert) => ({
    level: alert.level,

    msg: alert.msg,

    device: "站点告警",

    time: alert.time,
  }))
}

const LVL: Record<AlertLevel, { label: string, color: string, bg: string }> = {
  critical: { label: "严重", color: "#ef4444", bg: "#fff5f5" },

  warning: { label: "一般", color: "#f97316", bg: "#fff7ed" },

  recovered: { label: "已恢复", color: "#76857f", bg: "#f4f8f5" },
}

function AlertPanel({
  station,
  compact = false,
  onViewAll,
}: {
  station: Station
  compact?: boolean
  onViewAll?: () => void
}) {
  const alerts = useMemo(() => buildAlerts(station), [station])

  const [tab, setTab] = useState<"all" | AlertLevel>("all")

  const counts = {
    critical: alerts.filter((a) => a.level === "critical").length,

    warning: alerts.filter((a) => a.level === "warning").length,

    recovered: alerts.filter((a) => a.level === "recovered").length,
  }

  const displayed =
    tab === "all" ? alerts : alerts.filter((a) => a.level === tab)

  const visibleAlerts = compact ? displayed.slice(0, 2) : displayed

  const filterTabs: { key: "all" | AlertLevel, label: string, count: number }[] =
    [
      { key: "all", label: "全部", count: alerts.length },

      { key: "critical", label: "严重", count: counts.critical },

      { key: "warning", label: "一般", count: counts.warning },

      { key: "recovered", label: "已恢复", count: counts.recovered },
    ]

  return (
    <div
      className="station-overview-alert"
      style={{
        ...card,
        padding: 14,
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>
          实时告警
        </span>
        {counts.critical > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>
            {counts.critical}条活动告警
          </span>
        )}
      </div>

      {!compact && (
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid #e8f0eb",
            marginBottom: 8,
          }}
        >
          {filterTabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                border: "none",
                background: "none",
                cursor: "pointer",

                color: tab === key ? "#1f7a68" : "#61716b",

                fontWeight: tab === key ? 600 : 400,

                borderBottom:
                  tab === key ? "2px solid #1f7a68" : "2px solid transparent",
              }}
            >
              {label} {count > 0 && <span style={mono}>{count}</span>}
            </button>
          ))}
        </div>
      )}

      {!compact && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "40px 1fr 64px 52px",
            gap: 8,
            paddingBottom: 6,
            borderBottom: "1px solid #e8f0eb",
          }}
        >
          {["等级", "告警内容", "设备", "时间"].map((h) => (
            <span
              key={h}
              style={{ fontSize: 10, color: "#76857f", fontWeight: 500 }}
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {visibleAlerts.map((a, i) => {
          const cfg = LVL[a.level]

          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: compact
                  ? "40px minmax(0, 1fr) 42px"
                  : "40px 1fr 64px 52px",
                gap: 8,

                padding: compact ? "6px 0" : "8px 0",
                borderBottom: "1px solid #f4f8f5",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 5px",
                  borderRadius: 4,
                  color: cfg.color,
                  background: cfg.bg,
                  textAlign: "center",
                }}
              >
                {cfg.label}
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "#24423b",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {a.msg}
              </span>
              {!compact && (
                <span style={{ ...mono, fontSize: 10, color: "#76857f" }}>
                  {a.device}
                </span>
              )}
              <span
                style={{
                  ...mono,
                  fontSize: 10,
                  color: "#76857f",
                  textAlign: "right",
                }}
              >
                {a.time}
              </span>
            </div>
          )
        })}
        {displayed.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "28px 0",
              fontSize: 12,
              color: "#76857f",
            }}
          >
            暂无告警
          </div>
        )}
      </div>

      {onViewAll && (
        <button
          onClick={onViewAll}
          style={{
            marginTop: compact ? 6 : 10,
            fontSize: 11,
            color: "#1f7a68",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "right",
            padding: 0,
            flexShrink: 0,
          }}
        >
          查看全部告警 →
        </button>
      )}
    </div>
  )
}

// ── Station info summary ─────────────────────────────────────────────────────

function StationInfoCard({ station }: { station: Station }) {
  const statusLabel: Record<string, string> = {
    online: "在线",
    fault: "故障",
    offline: "离线",
    building: "建设中",
  }

  const statusColor = STATUS_COLOR[station.status]

  const statusBg: Record<string, string> = {
    online: "#f0fdf8",
    fault: "#fff5f5",
    offline: "#f4f8f5",
    building: "#eaf5ef",
  }

  const infoItems = [
    {
      label: "额定功率",
      value: Number.isFinite(station.ratedPower) ? (station.ratedPower / 1000).toFixed(2) : "—",
      unit: "MW",
    },

    {
      label: "额定容量",
      value: Number.isFinite(station.storageCapacity) ? (station.storageCapacity / (DEMO_MODE ? 1 : 1000)).toFixed(2) : "—",
      unit: "MWh",
    },

    { label: "站点类型", value: station.type || (DEMO_MODE ? "工商业储能" : "—") },

    { label: "运行模式", value: station.mode || (DEMO_MODE ? "自用 + 需量控制" : "—") },

    {
      label: "所属区域",
      value: station.region
        ? `${station.region} · ${station.project}`
        : station.project,
    },

    { label: "运行状态", value: station.runStatus || (DEMO_MODE ? "正常运行" : "—") },
  ]

  return (
    <div
      className="station-overview-info-card"
      style={{
        ...card,
        padding: 14,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>
            站点信息
          </div>
          <div
            style={{
              ...mono,
              fontSize: 10,
              color: "#76857f",
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {station.code}
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,

            padding: "3px 8px",
            borderRadius: 999,

            background: statusBg[station.status] ?? "#f4f8f5",

            border: `1px solid ${statusColor}33`,

            color: statusColor,
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusColor,
            }}
          />
          {DEMO_MODE ? statusLabel[station.status] ?? "状态未知" : station.runStatus || "状态未知"}
        </span>
      </div>

      <div className="station-overview-info-media">
        {station.imageUrl ? <img src={station.imageUrl} alt={station.name} /> : <div className="station-api-photo"><span>▧</span>暂无站点图片</div>}
      </div>

      <div className="station-overview-info-divider" />

      <div className="station-overview-info-list">
        {infoItems.map((item) => (
          <div key={item.label} className="station-overview-info-item">
            <span>{item.label}</span>
            <strong>
              {item.value}
              {item.unit && <em>{item.unit}</em>}
            </strong>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Station Header ────────────────────────────────────────────────────────────

function StationHeader({ station }: { station: Station }) {
  const statusLabel: Record<string, string> = {
    online: "在线",
    fault: "故障",
    offline: "离线",
    building: "建设中",
  }

  const statusColor = STATUS_COLOR[station.status]

  const statusBg: Record<string, string> = {
    online: "#f0fdf8",
    fault: "#fff5f5",
    offline: "#f4f8f5",
    building: "#eaf5ef",
  }

  const clock = stationSnapshotTime(station)

  return (
    <div
      className="station-overview-header"
      style={{
        background: "#fff",
        borderBottom: "1px solid #dbe6df",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        rowGap: 8,
        flexWrap: "wrap",
        flexShrink: 0,
      }}
    >
      {/* Name + code */}
      <div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "#14221f",
            lineHeight: 1.2,
          }}
        >
          {station.name}
        </div>
        <div style={{ ...mono, fontSize: 10, color: "#76857f", marginTop: 2 }}>
          {station.code}
        </div>
      </div>

      {/* Status badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,

          padding: "3px 10px",
          borderRadius: 20,

          background: statusBg[station.status] ?? "#f4f8f5",

          border: `1px solid ${statusColor}40`,
        }}
      >
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: statusColor,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 11, fontWeight: 600, color: statusColor }}>
          {DEMO_MODE ? statusLabel[station.status] ?? "状态未知" : station.runStatus || "状态未知"}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: "#d8e3dc" }} />

      {/* Meta info */}
      {[
        { icon: "📍", label: station.region ? `${station.region}区域` : "—" },

        {
          icon: "⚡",
          label: `${Number.isFinite(station.ratedPower) ? (station.ratedPower / 1000).toFixed(1) : "—"} MW · ${Number.isFinite(station.storageCapacity) ? (station.storageCapacity / (DEMO_MODE ? 1 : 1000)).toFixed(1) : "—"} MWh`,
        },

        { icon: "🏭", label: station.type || (DEMO_MODE ? "工商业储能" : "—") },

        {
          icon: "👤",

          label:
            [station.manager, station.phone].filter(Boolean).join(" · ") ||
            "负责人未配置",
        },
      ].map(({ icon, label }) => (
        <div
          key={label}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
        >
          <span style={{ fontSize: 11 }}>{icon}</span>
          <span style={{ fontSize: 11, color: "#61716b" }}>{label}</span>
        </div>
      ))}

      <div style={{ flex: 1 }} />

      {/* Live clock */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: DEMO_MODE ? "#10b981" : "#94a39c",
            animation: DEMO_MODE ? "headerPulse 2s ease-in-out infinite" : undefined,
          }}
        />
        <span style={{ ...mono, fontSize: 11, color: "#76857f" }}>
          更新 {clock}
        </span>
      </div>
      <style>{`@keyframes headerPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

// ── KPI strip ─────────────────────────────────────────────────────────────────

function KpiStrip({ station }: { station: Station }) {
  const socColor =
    station.soc >= 60 ? "#10b981" : station.soc >= 30 ? "#f97316" : "#ef4444"

  const latestTelemetry = station.telemetryHistory?.at(-1)?.values

  const previousTelemetry = station.telemetryHistory?.at(-2)?.values

  const revenueModel = DEMO_MODE ? buildStationRevenueModel(
    station,

    "日",

    getDefaultRevenueDateRange("日"),
  ) : null

  const activeTrend = trendPercent(
    latestTelemetry?.storage ?? station.activePower,

    previousTelemetry?.storage ?? null,
  )

  const loadTrend = trendPercent(
    latestTelemetry?.load ?? station.activePower,

    previousTelemetry?.load ?? null,
  )

  const pvTrend = trendPercent(
    latestTelemetry?.pv ?? station.pvOutput,

    previousTelemetry?.pv ?? null,
  )

  const kpis = [
    {
      label: "有功功率",
      unit: "kW",

      value:
        station.activePower > 0 ? station.activePower.toLocaleString() : "—",

      color: "#1f7a68",
      bg: "#eaf5ef",

      icon: "⚡",
      trend: activeTrend,
      metric: "station-detail-active-power",
    },

    {
      label: "SOC",
      unit: "%",

      value: station.soc > 0 ? String(station.soc) : "—",

      color: socColor,
      bg:
        station.soc >= 60
          ? "#f0fdf8"
          : station.soc >= 30
            ? "#fff7ed"
            : "#fff5f5",

      icon: "🔋",
      trend: null,
      metric: "station-detail-soc",
    },

    {
      label: "负载率",
      unit: "%",

      value: station.loadRate > 0 ? String(station.loadRate) : "—",

      color: "#2a806e",
      bg: "#f5f3ff",

      icon: "📊",
      trend: loadTrend,
      metric: "station-detail-load-rate",
    },

    {
      label: "光伏出力",
      unit: "MWp",

      value: station.pvOutput > 0 ? station.pvOutput.toFixed(2) : "—",

      color: "#f59e0b",
      bg: "#fffbeb",

      icon: "☀️",
      trend: pvTrend,
      metric: "station-detail-pv-output",
    },

    {
      label: "累计收益",
      unit: "",

      value: station.revenue || "—",

      color: "#10b981",
      bg: "#f0fdf8",

      icon: "💰",
      trend: revenueModel ? `较上一周期 ${
        revenueModel.comparison.changePct >= 0 ? "+" : ""
      }${revenueModel.comparison.changePct}%` : null,
      metric: "station-detail-revenue",
    },
  ]

  return (
    <div
      className="station-overview-kpis"
      style={{ padding: "12px 20px", background: "#fff", flexShrink: 0 }}
    >
      {kpis.map((k) => (
        <div
          key={k.label}
          className="station-overview-kpi"
          style={{
            background: "#fff",
            borderRadius: 8,
            padding: "12px 14px",

            border: "1px solid #dbe6df",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",

            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 11, color: "#61716b" }}>{k.label}</span>
            <span
              style={{
                fontSize: 9,
                padding: "2px 6px",
                borderRadius: 20,

                background: k.bg,
                color: k.color,
                fontWeight: 600,
              }}
            >
              {k.icon}
            </span>
          </div>
          <div
            data-metric={k.metric}
            style={{
              ...mono,
              fontSize: 20,
              fontWeight: 700,
              color: k.color,
              lineHeight: 1,
            }}
          >
            {k.value}
            {k.unit && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 400,
                  color: "#76857f",
                  marginLeft: 3,
                }}
              >
                {k.unit}
              </span>
            )}
          </div>
          {k.trend && (
            <div style={{ fontSize: 10, color: "#76857f" }}>{k.trend}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Station Overview layout ───────────────────────────────────────────────────

function FlowExpandIcon({ expanded }: { expanded: boolean }) {
  return expanded ? (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M2 5h3V2M11 5H8V2M2 8h3v3M11 8H8v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M1 4V1h3M9 1h3v3M1 9v3h3M9 12h3V9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ApiOverviewDevice({ station, onOpen }: { station: Station; onOpen?: () => void }) {
  const [tab, setTab] = useState<DeviceTab>("电池")
  const metrics: Record<DeviceTab, string[]> = {
    电网: ["有功功率", "无功功率", "电压", "电流", "频率", "功率因数"],
    光伏: ["实时功率", "今日发电", "累计发电", "直流电压", "直流电流", "转换效率"],
    负荷: ["有功功率", "无功功率", "今日用电", "负载率", "电压", "电流"],
    PCS: ["有功功率", "无功功率", "直流电压", "直流电流", "转换效率", "运行温度"],
    电池: ["SOC", "SOH", "总电压", "总电流", "最高温度", "最低温度"],
  }
  return <section className="station-api-panel">
    <div className="station-api-heading"><h2>设备详情</h2><span>{station.deviceInventory?.length ?? 0} 台已登记</span></div>
    <div className="station-api-segments">{DEVICE_TABS.map(item => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    <div className="station-api-notice">通信状态未知 · 暂无遥测数据</div>
    <div className="station-api-device-metrics">{metrics[tab].map(label => <div key={label}><span>{label}</span><strong>—</strong></div>)}</div>
    {onOpen && <button className="station-api-link" onClick={onOpen}>查看设备详情 →</button>}
  </section>
}

function ApiOverviewTrends() {
  const [range, setRange] = useState("D")
  return <section className="station-api-panel station-api-trends">
    <div className="station-api-heading"><h2>运行趋势</h2><div className="station-api-segments">{["D", "M", "Y"].map(item => <button key={item} aria-pressed={range === item} onClick={() => setRange(item)}>{item}</button>)}</div></div>
    <div className="station-api-chart-grid">{["功率趋势", "SOC 趋势"].map((title, index) => <div key={title}><div className="station-api-heading"><h3>{title}</h3><span>{index ? "%" : "kW"}</span></div><div className="station-api-chart-empty"><span>暂无{range === "D" ? "今日" : range === "M" ? "本月" : "本年"}遥测数据</span></div><div className="station-api-chart-axis"><span>{range === "D" ? "00:00" : range === "M" ? "1日" : "1月"}</span><span>{range === "D" ? "12:00" : range === "M" ? "15日" : "6月"}</span><span>{range === "D" ? "24:00" : range === "M" ? "月末" : "12月"}</span></div><div className="station-api-chart-legend">{index ? "● SOC" : "● 电网　● 储能　● 光伏　● 负荷"}</div></div>)}</div>
  </section>
}

function StationOverview({
  station,

  onSetSubNav,

  allowedSubNavs,
}: {
  station: Station

  onSetSubNav: (nav: string) => void

  allowedSubNavs: readonly StationSubNav[]
}) {
  const [flowView, setFlowView] = useState<"3d" | "diagram">("diagram")

  const [flowExpanded, setFlowExpanded] = useState(false)

  const canOpenDevices = allowedSubNavs.includes("设备详情")

  const canOpenAlarms = allowedSubNavs.includes("告警信息")

  const canEditFlow = allowedSubNavs.includes("电价设置")

  // Shared topology — kept alive across view switches so diagram always reflects 3D edits

  const [sharedDevices, setSharedDevices] =
    useState<DeviceConfig[]>(INIT_DEVICES)

  const [sharedEdges, setSharedEdges] = useState<EdgeConfig[]>(INIT_EDGES)

  const handleDevicesChange = useCallback(
    (d: DeviceConfig[]) => setSharedDevices(d),
    [],
  )

  const handleEdgesChange = useCallback(
    (e: EdgeConfig[]) => setSharedEdges(e),
    [],
  )

  // Close expanded view on Escape

  useEffect(() => {
    if (!flowExpanded) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFlowExpanded(false)
    }

    window.addEventListener("keydown", handler)

    return () => window.removeEventListener("keydown", handler)
  }, [flowExpanded])

  const FlowHeader = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginBottom: flowExpanded ? 14 : 10,
      }}
    >
      <span
        style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a", flex: 1 }}
      >
        能量流向
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div
          style={{
            display: "flex",
            background: "#e8f0eb",
            borderRadius: 6,
            padding: 2,
            gap: 1,
          }}
        >
          {([
            ["3d", "3D 流向"],
            ["diagram", "能源图"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFlowView(key)}
              aria-pressed={flowView === key}
              style={{
                padding: "3px 10px",
                borderRadius: 4,
                border: "none",
                cursor: "pointer",

                fontSize: 11,
                fontWeight: flowView === key ? 600 : 400,

                color: flowView === key ? "#1f7a68" : "#61716b",

                background: flowView === key ? "#fff" : "none",

                boxShadow:
                  flowView === key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",

                transition: "all 0.12s",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFlowExpanded((v) => !v)}
          title={flowExpanded ? "收起" : "放大"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",

            width: 26,
            height: 26,
            borderRadius: 6,
            border: "1px solid #d8e3dc",

            background: flowExpanded ? "#eaf5ef" : "#f4f8f5",

            color: flowExpanded ? "#1f7a68" : "#61716b",

            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <FlowExpandIcon expanded={flowExpanded} />
        </button>
      </div>
    </div>
  )

  const FlowContent = !DEMO_MODE ? (
    <div className={`station-api-flow-empty ${flowView === "3d" ? "is-perspective" : ""}`}>
      <div className="station-api-flow-symbol">⚡</div><strong>暂无能量流向数据</strong><span>设备连接及实时功率接入后显示</span>
      <div className="station-api-flow-types">{["电网", "光伏", "储能", "负荷"].map(label => <div key={label}><span>{label}</span><b>—</b><small>kW</small></div>)}</div>
    </div>
  ) : (
    <div
      style={{
        flex: 1,
        width: "100%",
        minWidth: 0,
        minHeight: 0,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: flowView === "3d" ? "block" : "none",
        }}
      >
        <EnergyFlow3D
          station={station}
          devices={sharedDevices}
          edges={sharedEdges}
          editable={canEditFlow}
          onDevicesChange={handleDevicesChange}
          onEdgesChange={handleEdgesChange}
        />
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: flowView === "diagram" ? "block" : "none",
        }}
      >
        <EnergyFlowDiagram
          station={station}
          devices={sharedDevices}
          edges={sharedEdges}
        />
      </div>
    </div>
  )

  return (
    <div
      className="station-overview"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "auto",
      }}
    >
      <style>{`
        .station-overview {
          --overview-gap: 12px;
          background: #fff;
          container-type: inline-size;
        }
        .station-overview-board {
          display: grid;
          grid-template-columns: minmax(200px, 0.78fr) minmax(420px, 2.1fr) minmax(270px, 1.12fr);
          grid-template-rows: minmax(356px, 0.92fr) minmax(330px, 1.08fr);
          grid-template-areas:
            "info flow device"
            "trend trend alerts";
          gap: var(--overview-gap);
          min-height: 620px;
          padding: var(--overview-gap) 16px 16px;
          align-items: stretch;
        }
        .station-overview-info { grid-area: info; min-width: 0; min-height: 0; }
        .station-overview-flow { grid-area: flow; min-width: 0; min-height: 0; }
        .station-overview-device-slot { grid-area: device; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
        .station-overview-trends { grid-area: trend; min-width: 0; min-height: 0; display: flex; }
        .station-overview-alert-slot { grid-area: alerts; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
        .station-overview-flow-card {
          min-height: 260px;
        }
        .station-overview-info-media {
          height: 92px;
          border-radius: 6px;
          overflow: hidden;
          background: #f4f8f5;
          border: 1px solid #e2ebe6;
        }
        .station-overview-info-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .station-overview-info-divider {
          height: 2px;
          margin: 12px 0 10px;
          background: #1f7a68;
          border-radius: 999px;
        }
        .station-overview-info-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 10px;
          min-height: 0;
        }
        .station-overview-info-item {
          min-width: 0;
          padding: 7px 8px;
          border-radius: 6px;
          background: #f8fbf9;
          border: 1px solid #edf3ef;
        }
        .station-overview-info-item span,
        .station-overview-info-footer span {
          display: block;
          font-size: 10px;
          color: #61716b;
          margin-bottom: 4px;
        }
        .station-overview-info-item strong,
        .station-overview-info-footer strong {
          display: block;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
          font-weight: 600;
          color: #1d2f2a;
        }
        .station-overview-info-item em {
          margin-left: 3px;
          font-style: normal;
          font-size: 10px;
          font-weight: 400;
          color: #76857f;
        }
        .station-overview-info-footer {
          margin-top: auto;
          padding-top: 9px;
          border-top: 1px solid #edf3ef;
        }
        .station-overview-info-footer strong {
          color: #1f7a68;
        }
        .station-overview-flow {
          min-width: 0;
        }
        .station-overview-device-metrics.is-compact {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0;
          border-top: 1px solid #edf3ef;
          border-bottom: 1px solid #edf3ef;
        }
        .station-overview-device-metrics.is-compact > div + div {
          border-left: 1px solid #edf3ef;
        }
        .station-overview-device-metrics.is-compact > div:nth-child(3n + 1) {
          border-left: none;
        }
        .station-overview-trend-card {
          min-height: 0;
        }
        @container (max-width: 1040px) {
          .station-overview-board {
            grid-template-columns: minmax(250px, 0.9fr) minmax(0, 1.6fr);
            grid-template-rows: minmax(350px, auto) minmax(310px, auto) minmax(350px, auto);
            grid-template-areas:
              "info flow"
              "device alerts"
              "trend trend";
            min-height: 0;
          }
          .station-overview-info { min-height: 350px; }
          .station-overview-flow { min-height: 350px; }
          .station-overview-info-card { min-height: 350px; }
          .station-overview-flow-card { min-height: 350px; }
        }
        @container (max-width: 860px) {
          .station-overview-header { padding: 12px 16px !important; }
        }
        @container (max-width: 680px) {
          .station-overview-board {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows:
              minmax(350px, auto)
              minmax(300px, auto)
              minmax(230px, auto)
              minmax(360px, auto)
              minmax(300px, auto);
            grid-template-areas:
              "info"
              "flow"
              "device"
              "trend"
              "alerts";
            padding: 12px;
          }
          .station-overview-info { min-height: 350px; }
          .station-overview-flow { min-height: 300px; }
          .station-overview-device-slot { min-height: 230px; }
          .station-overview-trends { min-height: 360px; }
          .station-overview-alert-slot { min-height: 300px; }
          .station-overview-info-card { min-height: 350px; }
          .station-overview-flow-card { min-height: 300px; }
          .station-overview-device { min-height: 230px; }
          .station-overview-alert { min-height: 300px; }
          .station-overview-trend-card { overflow-x: auto; }
        }
        @media (max-width: 1220px) {
          .station-overview-board {
            grid-template-columns: minmax(250px, 0.9fr) minmax(0, 1.6fr);
            grid-template-rows: minmax(350px, auto) minmax(310px, auto) minmax(350px, auto);
            grid-template-areas:
              "info flow"
              "device alerts"
              "trend trend";
            min-height: 0;
          }
          .station-overview-info { min-height: 350px; }
          .station-overview-flow { min-height: 350px; }
          .station-overview-info-card { min-height: 350px; }
          .station-overview-flow-card { min-height: 350px; }
        }
        @media (max-width: 860px) {
          .station-overview-header { padding: 12px 16px !important; }
        }
        @media (max-width: 736px) {
          .station-overview-board {
            grid-template-columns: minmax(0, 1fr);
            grid-template-rows:
              minmax(350px, auto)
              minmax(300px, auto)
              minmax(230px, auto)
              minmax(360px, auto)
              minmax(300px, auto);
            grid-template-areas:
              "info"
              "flow"
              "device"
              "trend"
              "alerts";
            padding: 12px;
          }
          .station-overview-info { min-height: 350px; }
          .station-overview-flow { min-height: 300px; }
          .station-overview-device-slot { min-height: 230px; }
          .station-overview-trends { min-height: 360px; }
          .station-overview-alert-slot { min-height: 300px; }
          .station-overview-info-card { min-height: 350px; }
          .station-overview-flow-card { min-height: 300px; }
          .station-overview-device { min-height: 230px; }
          .station-overview-alert { min-height: 300px; }
          .station-overview-trend-card { overflow-x: auto; }
        }
      `}</style>
      {/* Station header */}
      <StationHeader station={station} />

      {/* Expanded overlay */}
      {flowExpanded && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9000,

            background: "rgba(15,23,42,0.55)",
            backdropFilter: "blur(4px)",

            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setFlowExpanded(false)
          }}
        >
          <div
            style={{
              width: "min(1063px, calc(100vw - 32px))",

              height: "min(582px, calc(100vh - 32px))",

              minWidth: 0,
              minHeight: 0,

              boxSizing: "border-box",

              background: "#fff",
              borderRadius: 14,

              boxShadow: "0 24px 80px rgba(0,0,0,0.24)",

              display: "flex",
              flexDirection: "column",

              padding: 20,
              overflow: "hidden",

              animation: "flowExpand 0.18s ease",
            }}
          >
            <style>{`@keyframes flowExpand{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}`}</style>
            {FlowHeader}
            {FlowContent}
          </div>
        </div>
      )}

      <div className="station-overview-board">
        <div className="station-overview-info">
          <StationInfoCard station={station} />
        </div>

        <div
          className="station-overview-flow"
          style={{ display: "flex", flexDirection: "column" }}
        >
          <div
            className="station-overview-flow-card"
            style={{
              ...card,
              padding: 16,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {FlowHeader}
            {/* Hide canvas when expanded so its Html labels don't bleed through the overlay */}
            {!flowExpanded && FlowContent}
            {flowExpanded && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "#76857f",
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  已在弹窗中展开
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="station-overview-device-slot">
          {!DEMO_MODE ? <ApiOverviewDevice station={station} onOpen={canOpenDevices ? () => onSetSubNav("设备详情") : undefined} /> : <DeviceDetail
            station={station}
            compact
            summaryCount={6}
            showAction={canOpenDevices}
            onViewDetails={
              canOpenDevices ? () => onSetSubNav("设备详情") : undefined
            }
          />}
        </div>

        <div className="station-overview-trends">
          {DEMO_MODE ? <TrendCharts station={station} /> : <ApiOverviewTrends />}
        </div>

        <div className="station-overview-alert-slot">
          <AlertPanel
            station={station}
            onViewAll={
              canOpenAlarms ? () => onSetSubNav("告警信息") : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}

// ── 运营收益 page ─────────────────────────────────────────────────────────────

type Granularity = "日" | "周" | "月" | "年"

const REV_STATUS: Record<string, { color: string, bg: string }> = {
  已结算: { color: "#059669", bg: "#ecfdf5" },

  待结算: { color: "#1f7a68", bg: "#eaf5ef" },

  当日暂估: { color: "#f59e0b", bg: "#fffbeb" },
}

type RevenueDailyPoint = ReturnType<typeof buildStationRevenueModel>["dailyData"][number]

function TrendChart({ data }: { data: RevenueDailyPoint[] }) {
  const pointTotals = data.map((item) => item.settled + item.pending + item.est)

  const maxBar =
    Math.max(
      1000,

      ...pointTotals,
    ) * 1.15

  const W = 560,
    H = 200,
    pL = 38,
    pR = 8,
    pT = 20,
    pB = 36

  const cW = W - pL - pR,
    cH = H - pT - pB

  const n = Math.max(1, data.length),
    gap = cW / n

  const bW = gap * 0.55

  const toY = (v: number) => pT + cH - (v / maxBar) * cH

  const yTicks = [0.2, 0.4, 0.6, 0.8, 1].map((ratio) =>
    Math.round(maxBar * ratio),
  )

  let cum = 0

  const cumMax = Math.max(
    1,

    pointTotals.reduce((s, total) => s + total, 0),
  )

  const linePoints = data
    .map((_, i) => {
      cum += pointTotals[i]

      return `${pL + i * gap + gap / 2},${pT + cH - (cum / cumMax) * cH}`
    })
    .join(" ")

  const currentIndex = data.findIndex((item) => item.isCurrent)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      {/* Grid */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={pL}
            y1={toY(v)}
            x2={W - pR}
            y2={toY(v)}
            stroke="#e8f0eb"
            strokeWidth="1"
          />
          <text
            x={pL - 5}
            y={toY(v) + 3.5}
            textAnchor="end"
            fontSize="9"
            fill="#76857f"
            fontFamily="Inter,sans-serif"
          >
            {v / 1000}k
          </text>
        </g>
      ))}
      {/* Bars */}
      {data.map((d, i) => {
        const x = pL + i * gap + (gap - bW) / 2

        const segments = [
          { key: "settled", value: d.settled, color: "#10b981" },

          { key: "pending", value: d.pending, color: "#1f7a68" },

          { key: "est", value: d.est, color: "#f59e0b" },
        ] as const

        let base = 0

        return (
          <g key={`${d.date}-${i}`}>
            {segments.map((segment) => {
              if (!segment.value) return null

              const y = toY(base + segment.value)

              const h = Math.max(1, (segment.value / maxBar) * cH)

              base += segment.value

              return (
                <rect
                  key={segment.key}
                  x={x}
                  y={y}
                  width={bW}
                  height={h}
                  rx="2"
                  fill={segment.color}
                  opacity={d.isCurrent ? 0.98 : 0.88}
                />
              )
            })}
          </g>
        )
      })}
      {/* Cumulative area + line */}
      {linePoints && (
        <polyline
          points={linePoints}
          fill="none"
          stroke="#1d2f2a"
          strokeWidth="1.8"
          strokeLinejoin="round"
          opacity={0.7}
        />
      )}
      {/* Current period line */}
      {currentIndex >= 0 &&
        (() => {
          const cx = pL + currentIndex * gap + gap / 2

          return (
            <g>
              <line
                x1={cx}
                y1={pT}
                x2={cx}
                y2={pT + cH}
                stroke="#f59e0b"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
              <text
                x={cx}
                y={pT - 5}
                textAnchor="middle"
                fontSize="9"
                fill="#f59e0b"
                fontWeight="600"
                fontFamily="Inter,sans-serif"
              >
                当前
              </text>
            </g>
          )
        })()}
      {/* X labels */}
      {data.map((d, i) => {
        if (i % 4 !== 0 && i !== n - 1) return null

        return (
          <text
            key={d.date}
            x={pL + i * gap + gap / 2}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill="#76857f"
            fontFamily="Inter,sans-serif"
          >
            {d.date}
          </text>
        )
      })}
      <text
        x={pL}
        y={H}
        fontSize="8"
        fill="#cbd8d0"
        fontFamily="Inter,sans-serif"
      >
        单日收益 / CNY
      </text>
    </svg>
  )
}

function RevenueOverview({ station }: { station: Station }) {
  const [gran, setGran] = useState<Granularity>("日")

  const [rangeOpen, setRangeOpen] = useState(false)

  const [datePickerOpen, setDatePickerOpen] = useState(false)

  const [dateRange, setDateRange] = useState<RevenueDateRange>(() =>
    getDefaultRevenueDateRange("日"),
  )

  const [draftDateRange, setDraftDateRange] =
    useState<RevenueDateRange>(dateRange)

  const [dateRangeError, setDateRangeError] = useState("")

  const datePickerRef = useRef<HTMLDivElement>(null)

  const periodMeta = useMemo(
    () => revenuePeriodMeta(gran, dateRange),

    [gran, dateRange],
  )

  const revenueModel = useMemo(
    () => buildStationRevenueModel(station, gran, dateRange),

    [station, gran, dateRange],
  )

  const {
    settled,

    pending,

    est,

    monthly,

    sources,

    detailRows,

    dailyData,

    trendDataSource,
  } = revenueModel

  const trendSourceLabel =
    trendDataSource === "connected" ? "交付包结算数据" : "补充运行估算"

  const snapshotTime = stationSnapshotTime(station)

  const totalSrc = Math.max(
    1,

    sources.filter((s) => s.value > 0).reduce((a, s) => a + s.value, 0),
  )

  const composition = [
    { color: "#10b981", label: "已结算", value: settled },

    { color: "#1f7a68", label: "待结算", value: pending },

    { color: "#f59e0b", label: "当日暂估", value: est },
  ]

  const compTotal = Math.max(1, monthly)

  useEffect(() => {
    const nextRange = getDefaultRevenueDateRange("日")

    setDateRange(nextRange)

    setDraftDateRange(nextRange)

    setDatePickerOpen(false)

    setDateRangeError("")
  }, [station.id])

  useEffect(() => {
    if (!datePickerOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target as Node)
      ) {
        setDatePickerOpen(false)

        setDateRangeError("")
      }
    }

    document.addEventListener("mousedown", handlePointerDown)

    return () => document.removeEventListener("mousedown", handlePointerDown)
  }, [datePickerOpen])

  function updateDraftDateRange(key: keyof RevenueDateRange, value: string) {
    setDraftDateRange((current) => ({ ...current, [key]: value }))

    setDateRangeError("")
  }

  function applyDateRange() {
    if (!draftDateRange.start || !draftDateRange.end) {
      setDateRangeError("请选择开始日期和结束日期")

      return
    }

    if (draftDateRange.start > draftDateRange.end) {
      setDateRangeError("结束日期不能早于开始日期")

      return
    }

    setDateRange(draftDateRange)

    setDatePickerOpen(false)

    setDateRangeError("")
  }

  function cancelDateRange() {
    setDraftDateRange(dateRange)

    setDatePickerOpen(false)

    setDateRangeError("")
  }

  function handleGranularityChange(nextGran: Granularity) {
    const nextRange = getDefaultRevenueDateRange(nextGran)

    setGran(nextGran)

    setDateRange(nextRange)

    setDraftDateRange(nextRange)

    setDatePickerOpen(false)

    setDateRangeError("")
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* ① Filter bar */}
      <div
        style={{
          background: "#fff",
          borderBottom: "1px solid #e8f0eb",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexShrink: 0,
        }}
      >
        {/* Date range */}
        <div ref={datePickerRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => {
              setDraftDateRange(dateRange)

              setDateRangeError("")

              setDatePickerOpen((open) => !open)
            }}
            title="选择日期范围"
            aria-expanded={datePickerOpen}
            aria-haspopup="dialog"
            data-time-range="station-revenue"
            style={{
              display: "flex",

              alignItems: "center",

              gap: 8,

              padding: "4px 12px",

              borderRadius: 7,

              border: `1px solid ${datePickerOpen ? "#78aa9b" : "#d8e3dc"}`,

              background: datePickerOpen ? "#eaf5ef" : "#f4f8f5",

              cursor: "pointer",

              whiteSpace: "nowrap",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect
                x="1"
                y="2"
                width="10"
                height="9"
                rx="1.5"
                stroke="#61716b"
                strokeWidth="1.2"
              />
              <path
                d="M4 1v2M8 1v2M1 5h10"
                stroke="#61716b"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
            <span
              data-date-start
              style={{ fontSize: 12, color: "#24423b", fontWeight: 500 }}
            >
              {periodMeta.start}
            </span>
            <span style={{ color: "#76857f" }}>→</span>
            <span
              data-date-end
              style={{ fontSize: 12, color: "#24423b", fontWeight: 500 }}
            >
              {periodMeta.end}
            </span>
          </button>

          {datePickerOpen && (
            <div
              role="dialog"
              aria-label="选择日期范围"
              data-date-picker="station-revenue"
              style={{
                position: "absolute",

                top: "calc(100% + 8px)",

                left: 0,

                zIndex: 300,

                width: "min(300px, calc(100vw - 190px))",

                minWidth: 228,

                padding: 14,

                background: "#fff",

                border: "1px solid #dbe3ec",

                borderRadius: 9,

                boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <span
                  style={{ fontSize: 12, fontWeight: 700, color: "#1d2f2a" }}
                >
                  选择日期范围
                </span>
                <span style={{ fontSize: 10, color: "#76857f" }}>
                  按自然日统计
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    fontSize: 10,
                    color: "#61716b",
                  }}
                >
                  开始日期
                  <input
                    type="date"
                    value={draftDateRange.start}
                    max={draftDateRange.end || undefined}
                    data-date-start-input
                    autoFocus
                    onChange={(event) =>
                      updateDraftDateRange("start", event.target.value)
                    }
                    style={{
                      width: "100%",

                      minWidth: 0,

                      padding: "7px 8px",

                      border: "1px solid #dbe3ec",

                      borderRadius: 6,

                      color: "#24423b",

                      background: "#fff",

                      fontSize: 11,

                      fontFamily: "Inter, sans-serif",
                    }}
                  />
                </label>
                <label
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                    fontSize: 10,
                    color: "#61716b",
                  }}
                >
                  结束日期
                  <input
                    type="date"
                    value={draftDateRange.end}
                    min={draftDateRange.start || undefined}
                    data-date-end-input
                    onChange={(event) =>
                      updateDraftDateRange("end", event.target.value)
                    }
                    style={{
                      width: "100%",

                      minWidth: 0,

                      padding: "7px 8px",

                      border: "1px solid #dbe3ec",

                      borderRadius: 6,

                      color: "#24423b",

                      background: "#fff",

                      fontSize: 11,

                      fontFamily: "Inter, sans-serif",
                    }}
                  />
                </label>
              </div>
              {dateRangeError && (
                <div
                  role="alert"
                  style={{ marginTop: 8, color: "#dc2626", fontSize: 10 }}
                >
                  {dateRangeError}
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 8,
                  marginTop: 14,
                }}
              >
                <button
                  type="button"
                  onClick={cancelDateRange}
                  data-date-cancel
                  style={{
                    padding: "6px 12px",

                    border: "1px solid #d8e3dc",

                    borderRadius: 6,

                    background: "#fff",

                    color: "#61716b",

                    fontSize: 11,

                    cursor: "pointer",
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={applyDateRange}
                  data-date-apply
                  style={{
                    padding: "6px 14px",

                    border: "1px solid #1f7a68",

                    borderRadius: 6,

                    background: "#1f7a68",

                    color: "#fff",

                    fontSize: 11,

                    cursor: "pointer",

                    fontWeight: 600,
                  }}
                >
                  应用
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Granularity pills */}
        <div
          style={{
            display: "flex",
            background: "#e8f0eb",
            borderRadius: 7,
            padding: 2,
            gap: 1,
          }}
        >
          {(["日", "周", "月", "年"] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => handleGranularityChange(g)}
              data-granularity={g}
              style={{
                padding: "3px 12px",
                borderRadius: 5,
                border: "none",
                cursor: "pointer",
                fontSize: 12,

                fontWeight: gran === g ? 600 : 400,

                color: gran === g ? "#1f7a68" : "#61716b",

                background: gran === g ? "#fff" : "none",

                boxShadow: gran === g ? "0 1px 4px rgba(0,0,0,0.08)" : "none",

                transition: "all 0.1s",
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Revenue range dropdown */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setRangeOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 12px",

              borderRadius: 7,
              border: "1px solid #d8e3dc",
              background: "#f4f8f5",

              fontSize: 12,
              color: "#24423b",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            全部收益
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M2 4l3 3 3-3"
                stroke="#76857f"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {rangeOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                zIndex: 200,
                background: "#fff",
                border: "1px solid #d8e3dc",
                borderRadius: 9,
                boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
                overflow: "hidden",
                minWidth: 120,
              }}
            >
              {["全部收益", "峰谷套利", "需量节省", "光伏盈用", "VPP响应"].map(
                (r) => (
                  <button
                    key={r}
                    onClick={() => setRangeOpen(false)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 14px",
                      textAlign: "left",
                      fontSize: 12,
                      color: r === "全部收益" ? "#1f7a68" : "#24423b",
                      fontWeight: r === "全部收益" ? 600 : 400,
                      background: r === "全部收益" ? "#eaf5ef" : "none",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    {r}
                  </button>
                ),
              )}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "#61716b",
          }}
        >
          <span style={{ color: "#76857f" }}>币种</span>
          <span style={{ fontWeight: 600, color: "#24423b" }}>CNY</span>
          <span style={{ color: "#d8e3dc", margin: "0 4px" }}>|</span>
          <span style={{ color: "#76857f" }}>对比</span>
          <span style={{ fontWeight: 600, color: "#24423b" }}>
            {periodMeta.compareLabel}
          </span>
        </div>

        <div style={{ flex: 1 }} />
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 16px",
            borderRadius: 7,
            border: "1px solid #d8e3dc",
            background: "#fff",
            fontSize: 12,
            color: "#465b53",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M6 1v7M3 6l3 3 3-3M1 10h10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          导出明细
        </button>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "14px 20px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* ② KPI row — three equal columns */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1.6fr",
            gap: 12,
          }}
        >
          {/* Today */}
          <div style={{ ...card, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: "#76857f", marginBottom: 6 }}>
              数据截止 · {periodMeta.end} {snapshotTime}
            </div>
            <div style={{ fontSize: 11, color: "#61716b", marginBottom: 4 }}>
              {periodMeta.currentLabel}
            </div>
            <div
              data-metric="station-revenue-today"
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: "#1d2f2a",
                letterSpacing: "-1px",
                lineHeight: 1.1,
              }}
            >
              ¥ {est.toLocaleString()}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                marginTop: 8,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#f59e0b",
                }}
              />
              <span style={{ fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
                截至 {snapshotTime} · 当日暂估
              </span>
            </div>
          </div>

          {/* Monthly */}
          <div style={{ ...card, padding: "16px 20px" }}>
            <div style={{ fontSize: 10, color: "#76857f", marginBottom: 6 }}>
              {periodMeta.totalLabel}
            </div>
            <div style={{ fontSize: 11, color: "#61716b", marginBottom: 4 }}>
              {periodMeta.totalLabel}
            </div>
            <div
              data-metric="station-revenue-monthly"
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: "#1d2f2a",
                letterSpacing: "-1px",
                lineHeight: 1.1,
              }}
            >
              ¥ {monthly.toLocaleString()}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginTop: 8,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 8l4-5 4 5"
                  stroke="#059669"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span style={{ fontSize: 10, color: "#059669", fontWeight: 600 }}>
                较{periodMeta.compareLabel}{" "}
                {revenueModel.comparison.changePct >= 0 ? "+" : ""}
                {revenueModel.comparison.changePct}%
              </span>
            </div>
          </div>

          {/* Composition */}
          <div style={{ ...card, padding: "16px 20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 11, color: "#61716b" }}>
                {periodMeta.compositionLabel}
              </span>
              <span style={{ fontSize: 9, color: "#76857f" }}>
                过去日期不显示运行估算
              </span>
            </div>
            {/* Stacked bar */}
            <div
              style={{
                display: "flex",
                borderRadius: 4,
                overflow: "hidden",
                height: 8,
                marginBottom: 14,
              }}
            >
              {composition.map(({ color, value }) => (
                <div
                  key={color}
                  style={{ flex: value / compTotal, background: color }}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              {composition.map(({ color, label, value }) => (
                <div key={label} style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      marginBottom: 3,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 10, color: "#61716b" }}>
                      {label}
                    </span>
                  </div>
                  <div
                    style={{ fontSize: 16, fontWeight: 700, color: "#1d2f2a" }}
                  >
                    ¥ {value.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 9, color: "#76857f", marginTop: 1 }}>
                    {Math.round((value / compTotal) * 100)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ③ Middle: chart (60%) + sources (40%) */}
        <div
          style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 14 }}
        >
          {/* Trend chart */}
          <div style={{ ...card, padding: "14px 16px 10px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <div>
                <span
                  style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}
                >
                  收益趋势
                </span>
                <span style={{ fontSize: 10, color: "#76857f", marginLeft: 8 }}>
                  {trendSourceLabel} · 按结算状态堆叠
                </span>
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ display: "flex", gap: 12 }}>
                {[
                  { color: "#10b981", label: "已结算" },

                  { color: "#1f7a68", label: "待结算" },

                  { color: "#f59e0b", label: "当日暂估" },

                  { color: "#1d2f2a", label: "累计", line: true },
                ].map(({ color, label, line }) => (
                  <div
                    key={label}
                    style={{ display: "flex", alignItems: "center", gap: 4 }}
                  >
                    {line ? (
                      <div
                        style={{
                          width: 16,
                          borderTop: `2px solid ${color}`,
                          opacity: 0.7,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          background: color,
                        }}
                      />
                    )}
                    <span style={{ fontSize: 9, color: "#76857f" }}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{ height: 220 }}
              data-chart="station-revenue-trend"
              data-source={trendDataSource}
            >
              <TrendChart data={dailyData} />
            </div>
          </div>

          {/* Revenue sources */}
          <div style={{ ...card, padding: "14px 16px" }}>
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>
                收益来源构成
              </span>
              <span style={{ fontSize: 10, color: "#76857f", marginLeft: 8 }}>
                本统计周期
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {sources.map(({ label, value, color }) => {
                const pct = Math.abs(value) / totalSrc

                const isNeg = value < 0

                return (
                  <div key={label}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: 5,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: "#465b53",
                            fontWeight: 500,
                          }}
                        >
                          {label}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: isNeg ? "#ef4444" : "#1d2f2a",
                        }}
                      >
                        {isNeg
                          ? `-¥ ${Math.abs(value).toLocaleString()}`
                          : `¥ ${value.toLocaleString()}`}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 6,
                        borderRadius: 3,
                        background: "#e8f0eb",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct * 100}%`,
                          height: "100%",
                          borderRadius: 3,
                          background: color,
                          opacity: isNeg ? 0.5 : 1,
                          transition: "width 0.4s",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontSize: 9,
                        color: "#76857f",
                        marginTop: 3,
                        textAlign: "right",
                      }}
                    >
                      {isNeg ? "占扣减" : "占收益"} {Math.round(pct * 100)}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ④ Detail table */}
        <div style={{ ...card, padding: "14px 0 0" }}>
          <div
            style={{
              padding: "0 16px 10px",
              display: "flex",
              alignItems: "baseline",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1d2f2a" }}>
              收益明细
            </span>
            <span style={{ fontSize: 10, color: "#76857f" }}>
              可追溯到价格、计量、运行策略与结算版本
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12,
              }}
            >
              <thead>
                <tr
                  style={{
                    background: "#f4f8f5",
                    borderTop: "1px solid #e8f0eb",
                    borderBottom: "1px solid #e8f0eb",
                  }}
                >
                  {[
                    "日期",
                    "峰谷套利",
                    "需量节省",
                    "光伏盈用",
                    "VPP响应",
                    "罚款与调差",
                    "净收益",
                    "数据状态",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "9px 16px",
                        textAlign: "left",
                        fontWeight: 600,
                        color: "#61716b",
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row, i) => {
                  const ss = REV_STATUS[row.status]

                  return (
                    <tr
                      key={row.date}
                      style={{
                        borderBottom: "1px solid #f4f8f5",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.background =
                          "#f8fbf8")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.background =
                          "")
                      }
                    >
                      <td
                        style={{
                          padding: "12px 16px",
                          color: "#24423b",
                          fontWeight: 600,
                        }}
                      >
                        {row.date}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#24423b" }}>
                        ¥ {row.peakValley.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#24423b" }}>
                        ¥ {row.demand.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#24423b" }}>
                        ¥ {row.pv.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 16px", color: "#24423b" }}>
                        {row.vpp ? (
                          `¥ ${row.vpp.toLocaleString()}`
                        ) : (
                          <span style={{ color: "#cbd8d0" }}>—</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          color: "#ef4444",
                          fontWeight: 500,
                        }}
                      >
                        -¥ {Math.abs(row.penalty)}
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontWeight: 700,
                          color: "#1d2f2a",
                        }}
                      >
                        ¥ {row.net.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            padding: "3px 9px",
                            borderRadius: 5,
                            fontSize: 11,
                            fontWeight: 600,
                            color: ss.color,
                            background: ss.bg,
                          }}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div
            style={{ padding: "8px 16px 12px", fontSize: 9, color: "#76857f" }}
          >
            当日暂估不会回写历史；关账后按结算流程转为待结算或已结算。
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Placeholder for unimplemented sub-pages ────────────────────────────────────

function Placeholder({ nav }: { nav: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        color: "#76857f",
      }}
    >
      <div style={{ fontSize: 36 }}>🚧</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: "#61716b" }}>
        {nav}
      </div>
      <div style={{ fontSize: 12 }}>功能开发中，敬请期待</div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

const SUB_NAVS = [
  "站点概览",
  "运营收益",
  "运行策略",
  "告警信息",
  "运行曲线",
  "一次接线图",
  "设备详情",
  "电价设置",
] as const

interface Props {
  tabs: Station[]

  activeId: string

  onClose: (id: string) => void

  onSetActive: (id: string) => void

  onBack: () => void

  initialSubNav?: string

  allowedSubNavs?: readonly StationSubNav[]

  role?: UserRole
}

export default function StationDetailPage({
  tabs,

  activeId,

  onClose,

  onSetActive,

  onBack,

  initialSubNav = "站点概览",

  allowedSubNavs = SUB_NAVS,

  role = "operator",
}: Props) {
  const { user } = useAuth()
  const station = tabs.find((s) => s.id === activeId)

  const normalizedInitialSubNav =
    initialSubNav === "数据分析" ? "运行曲线" : initialSubNav

  const visibleSubNavs = SUB_NAVS.filter((item) =>
    allowedSubNavs.includes(item),
  )

  const defaultSubNav = visibleSubNavs.includes(
    normalizedInitialSubNav as StationSubNav,
  )
    ? normalizedInitialSubNav
    : (visibleSubNavs[0] ?? "站点概览")

  const [subNav, setSubNav] = useState<string>(defaultSubNav)

  const selectSubNav = (next: string) => {
    setSubNav(
      visibleSubNavs.includes(next as StationSubNav)
        ? next
        : (visibleSubNavs[0] ?? "站点概览"),
    )
  }

  // Reset sub-nav when switching station tabs

  useEffect(() => {
    selectSubNav(normalizedInitialSubNav)
  }, [activeId, normalizedInitialSubNav, allowedSubNavs])

  if (!station) return null

  return (
    <div
      className="station-detail-shell"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      {/* ── Multi-station tab bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          background: "#fff",
          borderBottom: "1px solid #d8e3dc",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flex: 1, overflowX: "auto" }}>
          {tabs.map((tab) => {
            const active = tab.id === activeId

            return (
              <div
                key={tab.id}
                onClick={() => onSetActive(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,

                  padding: "11px 14px 9px",
                  cursor: "pointer",
                  flexShrink: 0,

                  borderBottom: active
                    ? "2px solid #1f7a68"
                    : "2px solid transparent",

                  color: active ? "#1f7a68" : "#61716b",

                  background: active ? "rgba(239,246,255,0.5)" : "none",

                  transition: "all 0.1s",
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: STATUS_COLOR[tab.status],
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    maxWidth: 130,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tab.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(tab.id)
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 2,
                    color: "#cbd8d0",
                    borderRadius: 3,
                  }}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.color =
                      "#76857f"
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      "#e8f0eb"
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.color =
                      "#cbd8d0"
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      "none"
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            )
          })}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 12px",
              fontSize: 11,
              color: "#76857f",
              flexShrink: 0,
            }}
          >
            已打开 {tabs.length}
          </div>
        </div>

        {/* Back button */}
        <button
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,

            padding: "0 18px",
            border: "none",
            borderLeft: "1px solid #e8f0eb",

            background: "none",
            fontSize: 12,
            color: "#61716b",
            cursor: "pointer",
            flexShrink: 0,
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background =
              "#f4f8f5")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.background = "none")
          }
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect
              x="0.5"
              y="1.5"
              width="12"
              height="1.5"
              rx="0.75"
              fill="currentColor"
            />
            <rect
              x="0.5"
              y="5.75"
              width="12"
              height="1.5"
              rx="0.75"
              fill="currentColor"
            />
            <rect
              x="0.5"
              y="10"
              width="12"
              height="1.5"
              rx="0.75"
              fill="currentColor"
            />
          </svg>
          站点列表
        </button>
      </div>

      {/* ── Secondary navigation ── */}
      <nav className="ui-tabs" aria-label="站点二级导航">
        {visibleSubNavs.map((nav) => {
          const active = nav === subNav

          return (
            <button
              key={nav}
              onClick={() => setSubNav(nav)}
              aria-current={active ? "page" : undefined}
            >
              {nav}
            </button>
          )
        })}
      </nav>

      {/* ── Content ── */}
      {subNav === "站点概览" && (
        <StationOverview
          station={station}
          onSetSubNav={selectSubNav}
          allowedSubNavs={visibleSubNavs}
        />
      )}
      {subNav === "运营收益" && <StationRevenuePage station={station} />}
      {subNav === "运行策略" && <StationStrategyPage station={station} />}
      {subNav === "告警信息" && (
        <StationAlarmsPage
          key={station.id}
          station={station}
          canCreateOrder={
            DEMO_MODE
              ? role !== "owner"
              : hasStationPermission(user, station.id, "workorder.create")
          }
        />
      )}
      {subNav === "运行曲线" && (
        <StationRunCurvePage key={station.id} station={station} />
      )}
      {subNav === "一次接线图" && (
        <StationSingleLinePage
          station={station}
          onOpenDevices={() => selectSubNav("设备详情")}
        />
      )}
      {subNav === "设备详情" && (
        <StationDevicesPage key={station.id} station={station} />
      )}
      {subNav === "电价设置" && (
        <StationPriceSettingsPage
          key={station.id}
          station={station}
          onOpenStrategy={() => selectSubNav("运行策略")}
        />
      )}
      {subNav !== "站点概览" &&
        subNav !== "运营收益" &&
        subNav !== "运行策略" &&
        subNav !== "告警信息" &&
        subNav !== "运行曲线" &&
        subNav !== "一次接线图" &&
        subNav !== "设备详情" &&
        subNav !== "电价设置" && <Placeholder nav={subNav} />}
    </div>
  )
}
