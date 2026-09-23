import { useMemo, useState, type KeyboardEvent } from "react"
import { DEMO_MODE } from "@/api/client"
import ApiTopology from "./ApiTopology"
import {
  BatteryCharging,
  Cpu,
  Factory,
  PlugZap,
  RadioTower,
  SunMedium,
  type LucideIcon,
} from "lucide-react"

import type { Station } from "@/App"

import { stationDataNow } from "@/data/dataClock"

import {
  DEVICE_STATUS_LABEL,
  demoStationDevices,
  formatPoint,
  pointValue,
  type DeviceStatus,
  type StationDevice,
} from "@/data/stationDevices"

type LineDeviceId = "pcc" | "pv" | "pcs" | "battery" | "load"

type Metric = {
  label: string

  value: string
}

type LineDevice = {
  id: LineDeviceId

  label: string

  code: string

  deviceName: string

  role: string

  status: DeviceStatus

  statusText: string

  tag: string

  Icon: LucideIcon

  metrics: Metric[]
}

const statusTone: Record<DeviceStatus, {
  text: string
  bg: string
  dot: string
}> = {
  unknown: { text: "#61716b", bg: "#eee", dot: "#999" },

  online: { text: "#16734b", bg: "#edf8f1", dot: "#16734b" },

  warning: { text: "#925c0b", bg: "#fff6e5", dot: "#925c0b" },

  offline: { text: "#61716b", bg: "#f4f8f5", dot: "#8a9992" },
}

function signedKw(value: number) {
  const safe = Number.isFinite(value) ? value : 0

  const sign = safe > 0 ? "+" : safe < 0 ? "-" : ""

  return `${sign}${Math.abs(safe).toFixed(1)} kW`
}

function formatKw(value: number) {
  return `${Math.max(0, value).toFixed(1)} kW`
}

function formatMv(value: number) {
  return `${Math.max(0, value).toFixed(2)} MW`
}

function readPoint(
  device: StationDevice | undefined,
  id: string,
  fallback: string,
) {
  const point = device?.points.find((item) => item.id === id)

  return pointValue(point) === null ? fallback : formatPoint(point)
}

function deviceStatus(station: Station, device?: StationDevice): DeviceStatus {
  if (station.dataStatus === "disconnected" || station.status === "offline")
    return "offline"

  if (station.status === "fault" || device?.status === "warning")
    return "warning"

  return device?.status ?? "online"
}

function buildLineDevices(
  station: Station,
  devices: StationDevice[],
): LineDevice[] {
  const pcc = devices.find((device) => device.id === "MTR-01")

  const load = devices.find((device) => device.id === "MTR-02")

  const pcs = devices.find((device) => device.id === "PCS-01")

  const battery =
    devices.find((device) => device.id === "BMS-01") ??
    devices.find((device) => device.group === "储能系统")

  const offline =
    station.dataStatus === "disconnected" || station.status === "offline"

  const pcsPower = offline ? 0 : -Math.max(0, station.activePower * 0.39)

  const loadPower = offline ? 0 : Math.max(0, station.activePower)

  const pvPower = offline ? 0 : Math.max(0, station.pvOutput)

  const energyFallback = Math.round(
    Math.max(0, station.activePower) * 24 * 0.6,
  )

  const pccState = offline ? "QF-IN · 断开" : "QF-IN · 合闸"

  const pcsState = offline ? "QF-PCS · 断开" : "QF-PCS · 合闸"

  const batteryState = offline ? "BMS · 离线" : "BMS · 在线"

  return [
    {
      id: "pcc",

      label: "电网 / PCC",

      code: "QF-IN",

      deviceName: pcc?.name ?? "开关柜 / PCC",

      role: "并网计量与入口开关",

      status: deviceStatus(station, pcc),

      statusText: DEVICE_STATUS_LABEL[deviceStatus(station, pcc)],

      tag: pccState,

      Icon: RadioTower,

      metrics: [
        {
          label: "入口功率",
          value: readPoint(pcc, "power", formatKw(loadPower * 0.84)),
        },

        {
          label: "A相电压",
          value: readPoint(pcc, "voltageA", offline ? "--" : "400.2 V"),
        },

        {
          label: "频率",
          value: readPoint(pcc, "frequency", offline ? "--" : "50.01 Hz"),
        },

        {
          label: "功率因数",
          value: readPoint(pcc, "powerFactor", offline ? "--" : "0.986"),
        },

        {
          label: "正向电量",
          value: readPoint(
            pcc,
            "energy",
            offline ? "--" : `${energyFallback.toLocaleString()} kWh`,
          ),
        },

        {
          label: "采集状态",
          value:
            station.dataStatus === "partial"
              ? "部分同步"
              : offline
                ? "离线"
                : "实时同步",
        },
      ],
    },

    {
      id: "pv",

      label: "光伏支路",

      code: "PV-01",

      deviceName: "PV-01 光伏",

      role: "光伏逆变器并网支路",

      status: offline ? "offline" : "online",

      statusText: offline ? "离线" : "发电",

      tag: "QF-PV · 合闸",

      Icon: SunMedium,

      metrics: [
        { label: "实时出力", value: formatMv(pvPower) },

        {
          label: "并网状态",
          value: offline ? "离线" : pvPower > 0 ? "发电" : "待机",
        },

        { label: "交流电压", value: offline ? "--" : "400.0 V" },

        { label: "频率", value: offline ? "--" : "50.00 Hz" },

        {
          label: "日发电量",
          value: offline
            ? "--"
            : `${Math.max(0, pvPower * 4.6).toFixed(2)} MWh`,
        },

        { label: "通讯状态", value: offline ? "中断" : "正常" },
      ],
    },

    {
      id: "pcs",

      label: "储能变流器",

      code: "PCS-01",

      deviceName: pcs?.name ?? "PCS-01",

      role: "储能 PCS 并网支路",

      status: deviceStatus(station, pcs),

      statusText:
        deviceStatus(station, pcs) === "online"
          ? "运行中"
          : DEVICE_STATUS_LABEL[deviceStatus(station, pcs)],

      tag: pcsState,

      Icon: Cpu,

      metrics: [
        { label: "有功功率", value: offline ? "--" : signedKw(pcsPower) },

        {
          label: "无功功率",
          value: offline
            ? "--"
            : `+${Math.max(0, Math.abs(pcsPower) * 0.096).toFixed(1)} kvar`,
        },

        {
          label: "交流电压",
          value: readPoint(pcs, "voltageA", offline ? "--" : "398.6 V"),
        },

        {
          label: "交流频率",
          value: readPoint(pcs, "frequency", offline ? "--" : "50.01 Hz"),
        },

        {
          label: "直流电压",
          value: readPoint(pcs, "dcVoltage", offline ? "--" : "768.2 V"),
        },

        {
          label: "转换效率",
          value: readPoint(pcs, "efficiency", offline ? "--" : "97.8 %"),
        },

        {
          label: "模块温度",
          value: readPoint(pcs, "temperature", offline ? "--" : "41.6 °C"),
        },

        {
          label: "今日告警",
          value: String(
            pcs?.alarms.filter((alarm) => alarm.active).length ?? 0,
          ),
        },
      ],
    },

    {
      id: "battery",

      label: "BAT-01 电池",

      code: "BAT-01",

      deviceName: battery?.name ?? "BAT-01 电池",

      role: "电池簇与 BMS 采集",

      status: deviceStatus(station, battery),

      statusText: offline ? "离线" : "充电",

      tag: batteryState,

      Icon: BatteryCharging,

      metrics: [
        { label: "SOC", value: offline ? "--" : `${station.soc.toFixed(1)} %` },

        {
          label: "SOH",
          value: readPoint(battery, "soh", offline ? "--" : "98.2 %"),
        },

        {
          label: "电池功率",
          value: readPoint(
            battery,
            "power",
            offline ? "--" : formatKw(Math.abs(pcsPower)),
          ),
        },

        {
          label: "直流电压",
          value: readPoint(battery, "dcVoltage", offline ? "--" : "768.0 V"),
        },

        {
          label: "最高温度",
          value: readPoint(battery, "temperature", offline ? "--" : "34.6 °C"),
        },

        {
          label: "循环次数",
          value: readPoint(battery, "cycles", offline ? "--" : "386 次"),
        },
      ],
    },

    {
      id: "load",

      label: "厂区负载",

      code: "QF-LOAD",

      deviceName: load?.name ?? "厂区负载",

      role: "园区负荷计量支路",

      status: deviceStatus(station, load),

      statusText:
        deviceStatus(station, load) === "online"
          ? "正常"
          : DEVICE_STATUS_LABEL[deviceStatus(station, load)],

      tag: "QF-LOAD · 合闸",

      Icon: Factory,

      metrics: [
        {
          label: "当前负荷",
          value: readPoint(load, "power", formatKw(loadPower)),
        },

        {
          label: "A相电压",
          value: readPoint(load, "voltageA", offline ? "--" : "399.8 V"),
        },

        {
          label: "A相电流",
          value: readPoint(load, "currentA", offline ? "--" : "286.4 A"),
        },

        {
          label: "频率",
          value: readPoint(load, "frequency", offline ? "--" : "50.01 Hz"),
        },

        {
          label: "负载率",
          value: `${Math.max(0, station.loadRate).toFixed(1)} %`,
        },

        {
          label: "数据状态",
          value:
            station.dataStatus === "partial"
              ? "部分同步"
              : offline
                ? "离线"
                : "正常",
        },
      ],
    },
  ]
}

function DiagramNode({
  device,

  selected,

  x,

  y,

  variant = "default",

  onSelect,
}: {
  device: LineDevice

  selected: boolean

  x: number

  y: number

  variant?: "default" | "storage"

  onSelect: (id: LineDeviceId) => void
}) {
  const Icon = device.Icon

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()

      onSelect(device.id)
    }
  }

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`single-line-node single-line-node--${variant} single-line-node--${device.id} ${
        selected ? "is-selected" : ""
      }`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={() => onSelect(device.id)}
      onKeyDown={handleKeyDown}
    >
      <span className="single-line-node__label">{device.label}</span>
      <span className="single-line-node__box">
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="single-line-node__breaker">
        {device.id === "battery" ? (
          <BatteryCharging size={15} />
        ) : (
          <PlugZap size={15} />
        )}
      </span>
      <span className="single-line-node__tag">
        <i style={{ background: statusTone[device.status].dot }} />
        {device.tag}
      </span>
    </button>
  )
}

function DeviceListItem({
  device,

  selected,

  onSelect,
}: {
  device: LineDevice

  selected: boolean

  onSelect: (id: LineDeviceId) => void
}) {
  return (
    <button
      type="button"
      className="single-line-device-row"
      data-selected={selected ? "true" : undefined}
      onClick={() => onSelect(device.id)}
    >
      <span className="single-line-device-row__main">
        <i style={{ background: statusTone[device.status].dot }} />
        <span>{device.deviceName}</span>
      </span>
      <span
        className="single-line-device-row__state"
        style={{
          color: selected ? "#176b5d" : statusTone[device.status].text,

          background: selected ? "transparent" : statusTone[device.status].bg,
        }}
      >
        {selected ? "已选择" : device.statusText}
      </span>
    </button>
  )
}

export default function StationSingleLinePage({
  station,

  onOpenDevices,
}: {
  station: Station

  onOpenDevices: () => void
}) {
  return DEMO_MODE ? (
    <DemoSingleLine station={station} onOpenDevices={onOpenDevices} />
  ) : (
    <ApiTopology station={station} onOpenDevices={onOpenDevices} />
  )
}
function DemoSingleLine({
  station,
  onOpenDevices,
}: {
  station: Station
  onOpenDevices: () => void
}) {
  const devices = useMemo(
    () =>
      station.deviceInventory ??
      demoStationDevices(station, stationDataNow(station).getTime()),

    [station],
  )

  const lineDevices = useMemo(
    () => buildLineDevices(station, devices),
    [devices, station],
  )

  const [selectedId, setSelectedId] = useState<LineDeviceId>("pcs")

  const selected =
    lineDevices.find((device) => device.id === selectedId) ?? lineDevices[0]

  const selectedTone = selected
    ? statusTone[selected.status]
    : statusTone.offline

  return (
    <main className="single-line-page">
      <style>{`
        .single-line-page {
          flex: 1;
          min-height: 0;
          overflow: auto;
          background: var(--ui-bg, #f2f7f4);
          color: var(--ui-text, #1d2f2a);
          font-size: 14px;
        }
        .single-line-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 300px;
          gap: 12px;
          min-height: 100%;
          padding: 12px 16px 16px;
        }
        .single-line-card {
          min-width: 0;
          border: 1px solid var(--ui-border, #d8e3dc);
          border-radius: 8px;
          background: var(--ui-surface, #fff);
          box-shadow: var(--ui-shadow-panel, 0 6px 16px rgb(28 55 48 / 6%));
        }
        .single-line-card__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-height: 42px;
          padding: 10px 14px;
          border-bottom: 1px solid #edf2ef;
          font-size: 12px;
        }
        .single-line-card__title {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          color: #1d2f2a;
          font-weight: 700;
        }
        .single-line-card__title span {
          color: var(--ui-muted, #61716b);
          font-weight: 500;
        }
        .single-line-card__time {
          color: var(--ui-muted, #61716b);
          white-space: nowrap;
        }
        .single-line-diagram {
          display: flex;
          flex-direction: column;
          min-height: 600px;
          overflow: hidden;
        }
        .single-line-stage-scroll {
          flex: 1;
          min-height: 0;
          overflow: auto;
        }
        .single-line-stage {
          position: relative;
          min-width: 760px;
          height: 100%;
          min-height: 560px;
          background:
            linear-gradient(90deg, transparent 0, transparent 39px, rgb(29 47 42 / 2.8%) 40px),
            linear-gradient(0deg, transparent 0, transparent 39px, rgb(29 47 42 / 2.8%) 40px),
            #fff;
          background-size: 40px 40px;
        }
        .single-line-wires {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .single-line-node {
          position: absolute;
          display: block;
          width: 132px;
          height: 120px;
          transform: translate(-50%, -50%);
          border: 0;
          background: transparent;
          color: #1d2f2a;
          cursor: pointer;
          font: inherit;
          z-index: 2;
        }
        .single-line-node__label {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          max-width: 126px;
          overflow: hidden;
          padding: 1px 6px;
          border-radius: 4px;
          background: #fff;
          color: #1d2f2a;
          font-size: 12px;
          font-weight: 700;
          line-height: 16px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .single-line-node__box,
        .single-line-node__breaker {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border: 1px solid #d8e3dc;
          border-radius: 6px;
          background: #f8fbf9;
          color: #31453f;
          box-shadow: 0 1px 3px rgb(28 55 48 / 7%);
        }
        .single-line-node__box {
          top: 25px;
        }
        .single-line-node__breaker {
          top: 67px;
          width: 30px;
          height: 30px;
          color: #50625c;
        }
        .single-line-node__tag {
          position: absolute;
          top: 73px;
          left: 84px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          max-width: 118px;
          overflow: hidden;
          padding: 1px 6px;
          border: 1px solid #edf2ef;
          border-radius: 4px;
          background: #fff;
          color: #176b5d;
          font-size: 11px;
          line-height: 16px;
          text-overflow: ellipsis;
          white-space: nowrap;
          box-shadow: 0 1px 2px rgb(28 55 48 / 4%);
          z-index: 3;
        }
        .single-line-node--load .single-line-node__tag {
          right: 84px;
          left: auto;
        }
        .single-line-node--storage .single-line-node__label {
          top: 25px;
          left: 6px;
          max-width: 104px;
          transform: translateX(-100%);
          text-align: right;
        }
        .single-line-node--storage .single-line-node__tag {
          top: 68px;
          left: 84px;
        }
        .single-line-node__tag i {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          flex: 0 0 auto;
        }
        .single-line-node:hover .single-line-node__box,
        .single-line-node:hover .single-line-node__breaker,
        .single-line-node.is-selected .single-line-node__box,
        .single-line-node.is-selected .single-line-node__breaker {
          border-color: #9fc5b8;
          background: #eaf5ef;
          color: #176b5d;
        }
        .single-line-node:focus-visible {
          outline: 2px solid var(--ui-primary, #176b5d);
          outline-offset: 4px;
          border-radius: 8px;
        }
        .single-line-bus-label,
        .single-line-system-label {
          position: absolute;
          padding: 1px 7px;
          border-radius: 4px;
          background: #fff;
          color: #61716b;
          font-size: 11px;
          font-weight: 600;
          line-height: 16px;
          pointer-events: none;
          z-index: 1;
        }
        .single-line-bus-label {
          left: 51%;
          top: 44%;
          transform: translateX(-50%);
        }
        .single-line-system-label {
          left: 55%;
          top: 56.3%;
          transform: translateX(-100%);
        }
        .single-line-side {
          display: flex;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
        }
        .single-line-side__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 14px 14px 8px;
        }
        .single-line-side__header h2,
        .single-line-detail h3 {
          margin: 0;
          font-size: 15px;
          line-height: 20px;
          font-weight: 700;
        }
        .single-line-side__header p {
          margin: 3px 0 0;
          color: var(--ui-muted, #61716b);
          font-size: 12px;
        }
        .single-line-side__dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #176b5d;
        }
        .single-line-device-list {
          display: grid;
          gap: 4px;
          padding: 0 10px 10px;
        }
        .single-line-device-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          min-height: 34px;
          padding: 6px 8px;
          border: 0;
          border-radius: 5px;
          background: transparent;
          color: #1d2f2a;
          cursor: pointer;
          font: inherit;
          text-align: left;
        }
        .single-line-device-row:hover,
        .single-line-device-row[data-selected="true"] {
          background: #eaf5ef;
        }
        .single-line-device-row:focus-visible {
          outline: 2px solid var(--ui-primary, #176b5d);
          outline-offset: 2px;
        }
        .single-line-device-row__main {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .single-line-device-row__main i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          flex: 0 0 auto;
        }
        .single-line-device-row__main span {
          overflow: hidden;
          font-size: 12px;
          font-weight: 600;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .single-line-device-row__state {
          flex: 0 0 auto;
          border-radius: 999px;
          padding: 2px 7px;
          font-size: 11px;
          font-weight: 600;
          line-height: 16px;
        }
        .single-line-detail {
          margin: 0 10px 10px;
          padding: 14px;
          border: 1px solid var(--ui-border, #d8e3dc);
          border-radius: 8px;
          background: #fff;
        }
        .single-line-detail__heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 14px;
        }
        .single-line-detail__heading p {
          margin: 4px 0 0;
          color: var(--ui-muted, #61716b);
          font-size: 12px;
        }
        .single-line-detail__status {
          border-radius: 999px;
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 700;
          white-space: nowrap;
        }
        .single-line-detail__metrics {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px 18px;
        }
        .single-line-detail__metrics div {
          min-width: 0;
        }
        .single-line-detail__metrics dt {
          margin: 0 0 3px;
          color: var(--ui-muted, #61716b);
          font-size: 11px;
          line-height: 15px;
        }
        .single-line-detail__metrics dd {
          margin: 0;
          overflow-wrap: anywhere;
          color: #1d2f2a;
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          line-height: 17px;
        }
        .single-line-side__action {
          width: fit-content;
          margin: auto 10px 12px;
          min-height: 30px;
          padding: 5px 9px;
          border: 1px solid #c8ddd3;
          border-radius: 4px;
          background: #fff;
          color: #176b5d;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .single-line-side__action:hover {
          background: #f4f8f5;
        }
        @media (max-width: 980px) {
          .single-line-grid {
            grid-template-columns: 1fr;
          }
          .single-line-side {
            min-height: 420px;
          }
        }
        @media (max-width: 680px) {
          .single-line-grid {
            padding: 10px;
          }
          .single-line-card__header {
            align-items: flex-start;
            flex-direction: column;
          }
          .single-line-stage {
            min-width: 700px;
          }
        }
      `}</style>

      <div className="single-line-grid">
        <section
          className="single-line-card single-line-diagram"
          aria-label={`${station.name} 一次接线图`}
        >
          <header className="single-line-card__header">
            <div className="single-line-card__title">
              <strong>SLD-01 · 主接线</strong>
              <span>
                运行版本{" "}
                {devices.find((device) => device.id === "PCS-01")?.firmware ??
                  "交付包版本"}
              </span>
            </div>
            <div className="single-line-card__time">
              数据更新 {station.updateTime || "刚刚"}
            </div>
          </header>
          <div className="single-line-stage-scroll">
            <div className="single-line-stage">
              <svg
                className="single-line-wires"
                viewBox="0 0 760 560"
                aria-hidden="true"
              >
                <defs>
                  <filter
                    id={`single-line-shadow-${station.id}`}
                    x="-20%"
                    y="-20%"
                    width="140%"
                    height="140%"
                  >
                    <feDropShadow
                      dx="0"
                      dy="2"
                      stdDeviation="2.5"
                      floodColor="#1d2f2a"
                      floodOpacity="0.08"
                    />
                  </filter>
                </defs>
                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M90 285 H670" stroke="#17262c" strokeWidth="3" />
                  <path
                    d="M165 92 V103 M165 191 V285"
                    stroke="#7c8984"
                    strokeWidth="3"
                  />
                  <path
                    d="M330 92 V103 M330 191 V285"
                    stroke="#7c8984"
                    strokeWidth="3"
                  />
                  <path
                    d="M602 92 V103 M602 191 V285"
                    stroke="#7c8984"
                    strokeWidth="3"
                  />
                  <path
                    d="M485 285 V334 M485 420 V432"
                    stroke="#7c8984"
                    strokeWidth="3"
                  />
                  <path d="M165 285 H165" stroke="#17262c" strokeWidth="7" />
                  <path d="M330 285 H330" stroke="#17262c" strokeWidth="7" />
                  <path d="M602 285 H602" stroke="#17262c" strokeWidth="7" />
                  <path d="M485 285 H485" stroke="#17262c" strokeWidth="7" />
                </g>
                <g filter={`url(#single-line-shadow-${station.id})`}>
                  <circle cx="165" cy="285" r="4" fill="#17262c" />
                  <circle cx="330" cy="285" r="4" fill="#17262c" />
                  <circle cx="485" cy="285" r="4" fill="#17262c" />
                  <circle cx="602" cy="285" r="4" fill="#17262c" />
                </g>
              </svg>
              <span className="single-line-bus-label">AC BUS-01 · 400V</span>
              <span className="single-line-system-label">储能系统</span>
              <DiagramNode
                device={lineDevices[0]}
                selected={selectedId === "pcc"}
                x={21.7}
                y={25.5}
                onSelect={setSelectedId}
              />
              <DiagramNode
                device={lineDevices[1]}
                selected={selectedId === "pv"}
                x={43.4}
                y={25.5}
                onSelect={setSelectedId}
              />
              <DiagramNode
                device={lineDevices[4]}
                selected={selectedId === "load"}
                x={79.2}
                y={25.5}
                onSelect={setSelectedId}
              />
              <DiagramNode
                device={lineDevices[2]}
                selected={selectedId === "pcs"}
                x={63.8}
                y={67}
                variant="storage"
                onSelect={setSelectedId}
              />
              <DiagramNode
                device={lineDevices[3]}
                selected={selectedId === "battery"}
                x={63.8}
                y={86}
                variant="storage"
                onSelect={setSelectedId}
              />
            </div>
          </div>
        </section>

        <aside
          className="single-line-card single-line-side"
          aria-label="设备运行详情"
        >
          <header className="single-line-side__header">
            <div>
              <h2>设备运行详情</h2>
              <p>选择图中设备查看实时参数</p>
            </div>
            <span className="single-line-side__dot" aria-hidden="true" />
          </header>
          <div className="single-line-device-list">
            {lineDevices.map((device) => (
              <DeviceListItem
                key={device.id}
                device={device}
                selected={device.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </div>
          {selected && (
            <section className="single-line-detail" aria-live="polite">
              <div className="single-line-detail__heading">
                <div>
                  <h3>{selected.deviceName}</h3>
                  <p>{selected.role}</p>
                </div>
                <span
                  className="single-line-detail__status"
                  style={{
                    color: selectedTone.text,
                    background: selectedTone.bg,
                  }}
                >
                  {selected.statusText}
                </span>
              </div>
              <dl className="single-line-detail__metrics">
                {selected.metrics.map((metric) => (
                  <div key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          <button
            type="button"
            className="single-line-side__action"
            onClick={onOpenDevices}
          >
            查看完整设备详情 →
          </button>
        </aside>
      </div>
    </main>
  )
}
