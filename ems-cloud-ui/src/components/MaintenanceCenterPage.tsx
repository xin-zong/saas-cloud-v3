import { hasStationPermission } from "@/auth/apiPermissions"
import { DEMO_MODE, send, api, type ApiRow } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Download,
  Plus,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react"

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import type { Station } from "@/App"

import type { UserRole } from "@/auth/roles"

import { dateRangeEndingAt, stationsDataNow } from "@/data/dataClock"

import { exportOperationsCsv } from "@/data/operations"

import {
  buildMaintenanceStation,
  maintenanceQueue,
  maintenanceSummary,
  maintenanceTime,
  maintenanceTrend,
  MAINTENANCE_SEVERITY,
  WORK_ORDER_STATUS,
  FIRMWARE_STATUS,
  type MaintenanceStation,
} from "@/data/stationMaintenance"

import { formatPoint } from "@/data/stationDevices"

import "./operations-center.css"

import "./maintenance-center.css"

import { PageHeader } from "./ui/Workspace"
import MaintenanceWorkbench from "./maintenance/MaintenanceWorkbench"
import MaintenanceFirmware from "./maintenance/MaintenanceFirmware"
import type { RegisterLeaveGuard } from "./useEditorLeaveGuard"

const TABS = ["运维总览", "告警事件", "设备健康", "固件升级"] as const

type Tab = typeof TABS[number]

type Detail = {
  stationId: string

  kind: "alarm" | "order" | "firmware"

  id: string
}

type InteractionNotice = {
  tone: "success" | "warning" | "info"

  text: string
}

const NOTE_KEY = "enerlution-maintenance-notes-v1"

const VIEW_KEY = "enerlution-maintenance-view-v1"

const ALARM_CHART_SERIES = [
  {
    key: "critical",

    label: MAINTENANCE_SEVERITY.critical.label,

    fill: "var(--ui-chart-primary)",
  },

  {
    key: "warning",

    label: MAINTENANCE_SEVERITY.warning.label,

    fill: "var(--ui-chart-secondary)",
  },

  {
    key: "info",

    label: MAINTENANCE_SEVERITY.info.label,

    fill: "var(--ui-chart-tertiary)",
  },
] as const

type HealthDeviceCategory = "pcs" | "battery" | "bms" | "hvac" | "pv" | "meter"

type HealthCondition = "all" | "fault" | "normal"

type HealthFault = {
  date: string
  occurredAt: string

  title: string

  recoveredAt?: string

  status: "已恢复" | "未恢复"
}

type HealthMaintenance = {
  completedAt: string

  title: string

  owner: string

  workOrder: string
}

type HealthMetric = {
  label: string

  value: string
}

type HealthDeviceRecord = {
  id: string
  code: string

  category: HealthDeviceCategory

  categoryLabel: string

  title: string

  stationId: string

  stationName: string

  status: "在线" | "异常" | "离线" | "未知"

  runtime: string

  faultCount: number | null

  responseCount: number | null

  latestFault?: string

  latestMaintenance: string

  detail: {
    statusLabel: string

    statusTone: "success" | "danger" | "neutral"

    sampledAt: string
    sampledDate: string

    metrics: HealthMetric[]

    faults: HealthFault[]

    maintenance: HealthMaintenance[]
  }
}

const HEALTH_CATEGORY_LABELS: Record<HealthDeviceCategory | "all", string> = {
  all: "设备类型",

  pcs: "储能变流器",

  battery: "电池簇",

  bms: "电池管理系统",

  hvac: "温控系统",

  pv: "光伏逆变器",

  meter: "电能表",
}

function buildHealthDeviceRecords(stations: Station[]) {
  const categoryFor = (
    device: NonNullable<Station["deviceInventory"]>[number],
  ): HealthDeviceCategory => {
    if (/PCS/i.test(device.id) || /PCS/i.test(device.group)) return "pcs"

    if (/BMS/i.test(device.id)) return "bms"

    if (/RACK|BAT|电池/i.test(device.code) || /储能|电池|battery/i.test(device.group))
      return "battery"

    if (/HVAC|温控/i.test(device.id) || /环境/i.test(device.group))
      return "hvac"

    if (/PV|光伏/i.test(device.id) || /光伏/i.test(device.group)) return "pv"

    return "meter"
  }

  const categoryTitle: Record<HealthDeviceCategory, string> = {
    pcs: "储能变流器",

    battery: "电池簇",

    bms: "电池管理系统",

    hvac: "温控系统",

    pv: "光伏逆变器",

    meter: "电能表",
  }

  const dateLabel = (value?: string) => {
    if (!value) return "—"

    const parsed = new Date(value)

    return Number.isFinite(parsed.getTime())
      ? parsed.toLocaleString("zh-CN", {
          month: "2-digit",

          day: "2-digit",

          hour: "2-digit",

          minute: "2-digit",

          hour12: false,
        })
      : "—"
  }

  return stations.flatMap((station) =>
    (station.deviceInventory ?? []).map((device) => {
      const category = categoryFor(device)

      const alarms = device.alarms ?? []

      const activeAlarms = alarms.filter((alarm) => alarm.active)

      const latestAlarm = alarms

        .slice()

        .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0]

      const workOrders =
        (DEMO_MODE ? station.maintenance?.workOrders?.filter((order) =>
          order.title.includes(device.id),
        ) : []) ?? []

      const latestWorkOrder = workOrders

        .slice()

        .sort(
          (left, right) =>
            Date.parse(right.createdAt ?? "") -
            Date.parse(left.createdAt ?? ""),
        )[0]

      const currentStatus: HealthDeviceRecord["status"] =
        device.status === "warning" || activeAlarms.length ? "异常" : device.status === "online" ? "在线" : device.status === "offline" ? "离线" : "未知"

      const commissioned = Date.parse(device.commissionedAt)

      const updated = Date.parse(device.updatedAt)

      const runtimeHours = Number.isFinite(commissioned)
        ? Math.max(
            0,

            Math.round(
              ((Number.isFinite(updated) ? updated : Date.now()) -
                commissioned) /
                3600000,
            ),
          )
        : null

      const metricLabels = category === "battery" ? ["SOH", "循环次数", "单体压差", "单体温差"] : category === "pcs" ? ["模块温度", "散热器温度", "设备运行状态", "降额状态"] : ["设备状态", "运行时长", "告警状态", "采样时间"]
      const metrics = metricLabels.map(label => ({label: `${label} · ${category === "battery" ? "BMS" : category === "pcs" ? "PCS" : "设备"}上报`, value: formatPoint(device.points.find(p => p.label.toLowerCase().includes(label.toLowerCase())))}))

      const faults: HealthFault[] = alarms.map((alarm) => ({
        date: alarm.at.slice(0,10),
        occurredAt: dateLabel(alarm.at),

        title: alarm.title,

        recoveredAt: undefined,

        status: alarm.active ? "未恢复" : "已恢复",
      }))

      const maintenance: HealthMaintenance[] = workOrders.map((order) => ({
        completedAt: dateLabel(order.createdAt),

        title: order.title,

        owner: order.owner || station.manager,

        workOrder: order.id,
      }))

      const statusTone: HealthDeviceRecord["detail"]["statusTone"] =
        currentStatus === "异常" ? "danger" : currentStatus === "在线" ? "success" : "neutral"

      return {
        id: `${station.id}-${device.id}`,
        code: device.code || device.id,

        category,

        categoryLabel: categoryTitle[category],

        title: device.name,

        stationId: station.id,

        stationName: station.name,

        status: currentStatus,

        runtime:
          !DEMO_MODE || runtimeHours === null ? "—" : `${runtimeHours.toLocaleString()} h`,

        faultCount: DEMO_MODE ? activeAlarms.length : null,

        responseCount: DEMO_MODE ? alarms.length : null,

        latestFault: latestAlarm ? dateLabel(latestAlarm.at) : undefined,

        latestMaintenance: latestWorkOrder
          ? dateLabel(latestWorkOrder.createdAt)
          : "—",

        detail: {
          statusLabel:
            !DEMO_MODE ? currentStatus : currentStatus === "异常"
              ? `在线 · ${activeAlarms.length}项故障未恢复`
              : "在线 · 无未恢复故障",

          statusTone,

          sampledAt: dateLabel(device.updatedAt),
          sampledDate: device.updatedAt.slice(0,10),

          metrics: metrics.length
            ? metrics
            : [{ label: "设备状态 · 设备上报", value: currentStatus }],

          faults,

          maintenance,
        },
      }
    }),
  )
}

const number = (value: number | null) =>
  value === null
    ? "--"
    : value.toLocaleString("zh-CN", { maximumFractionDigits: 1 })

const clock = (value: number | null) =>
  value === null
    ? "--"
    : new Date(value).toLocaleTimeString("zh-CN", {
        hour: "2-digit",

        minute: "2-digit",

        hour12: false,
      })

const stamp = (value?: string) =>
  maintenanceTime(value) === null
    ? "--"
    : new Date(value!).toLocaleString("zh-CN", { hour12: false })

const dateStamp = (value?: string) =>
  maintenanceTime(value) === null
    ? "--"
    : new Date(value!).toLocaleDateString("zh-CN", {
        month: "2-digit",

        day: "2-digit",
      })

const duration = (start?: string, now = Date.now(), end?: string) => {
  const from = maintenanceTime(start)

  if (from === null) return "--"

  const to = maintenanceTime(end) ?? now

  const minutes = Math.max(0, Math.round((to - from) / 60000))

  if (minutes >= 1440) return `${Math.floor(minutes / 1440)} d`

  if (minutes >= 60)
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`

  return `${minutes} min`
}

function deadline(value: number | null, now: number) {
  if (value === null) return "SLA 未接入"

  const minutes = Math.ceil(Math.abs(value - now) / 60000)

  const duration =
    minutes >= 60
      ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`
      : `${minutes} min`

  return value < now ? `超时 ${duration}` : `剩余 ${duration}`
}

function alarmDisplayStatus(alarm: {
  status: "active" | "recovered"

  acknowledged?: boolean
}) {
  if (alarm.status === "recovered") return "已恢复"

  return alarm.acknowledged ? "已看到" : "处理中"
}

function Badge({
  severity,
}: {
  severity: keyof typeof MAINTENANCE_SEVERITY | "order"
}) {
  return (
    <span className={`maintenance-badge maintenance-${severity}`}>
      {severity === "order" ? "工单" : MAINTENANCE_SEVERITY[severity].label}
    </span>
  )
}

function Table({
  headers,

  children,

  empty,
}: {
  headers: string[]

  children: ReactNode

  empty: boolean
}) {
  return (
    <>
      <div className="operations-table-scroll">
        <table>
          <thead>
            <tr>
              {headers.map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {empty && <div className="operations-empty">暂无符合条件的记录</div>}
    </>
  )
}

function HealthDeviceDetail({
  record,

  onBack,
}: {
  record: HealthDeviceRecord

  onBack: () => void
}) {
  const defaultRange = dateRangeEndingAt(new Date(/^\d{4}-\d{2}-\d{2}$/.test(record.detail.sampledDate) ? `${record.detail.sampledDate}T12:00:00` : Date.now()), 30)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [draftStartDate, setDraftStartDate] = useState(startDate)
  const [draftEndDate, setDraftEndDate] = useState(endDate)
  const [rangeNotice, setRangeNotice] = useState("")
  const visibleFaults = record.detail.faults.filter(fault => fault.date >= startDate && fault.date <= endDate)

  function toggleRange() {
    setRangeOpen((open) => {
      if (!open) {
        setDraftStartDate(startDate)

        setDraftEndDate(endDate)

        setRangeNotice("")
      }

      return !open
    })
  }

  function applyRange() {
    if (!draftStartDate || !draftEndDate || draftStartDate > draftEndDate) {
      setRangeNotice("开始日期不能晚于结束日期")

      return
    }

    setStartDate(draftStartDate)

    setEndDate(draftEndDate)

    setRangeNotice("")

    setRangeOpen(false)
  }

  return (
    <div className="maintenance-health-detail">
      <button
        className="maintenance-health-back"
        type="button"
        onClick={onBack}
      >
        <ArrowLeft size={14} />
        返回设备列表
      </button>
      <section className="maintenance-health-device-head">
        <div>
          <h2>
            {record.code} · {record.title}
          </h2>
          <p>所属站点 {record.stationName}</p>
          <p>时序来源 设备健康监控</p>
        </div>
        <dl>
          <div>
            <dt>累计运行时长</dt>
            <dd>{record.runtime}</dd>
          </div>
          <div>
            <dt>最近维护</dt>
            <dd>{record.latestMaintenance}</dd>
          </div>
          <div className={`is-${record.detail.statusTone}`}>
            <dt>当前状态</dt>
            <dd>{record.detail.statusLabel}</dd>
          </div>
          <div>
            <dt>数据时间</dt>
            <dd>{record.detail.sampledAt}</dd>
          </div>
        </dl>
      </section>
      <section
        className="maintenance-health-metrics"
        aria-label={`${record.id} 设备健康指标`}
      >
        {record.detail.metrics.map((metric) => (
          <div className="maintenance-health-metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </section>
      <section className="maintenance-health-detail-panel">
        <div className="maintenance-health-detail-heading">
          <h2>
            历史故障 <span>· {DEMO_MODE ? `${visibleFaults.length} 次` : "—"}</span>
          </h2>
          <div className="maintenance-health-date-control">
            <button
              type="button"
              className="maintenance-health-filter-button"
              aria-expanded={rangeOpen}
              aria-haspopup="dialog"
              onClick={toggleRange}
            >
              {startDate.slice(5)} ~ {endDate.slice(5)}
              <ChevronDown size={14} />
            </button>
            {rangeOpen && (
              <div
                className="maintenance-health-date-popover"
                role="dialog"
                aria-label="历史故障日期范围"
              >
                <label>
                  开始日期
                  <input
                    aria-label="历史故障开始日期"
                    type="date"
                    value={draftStartDate}
                    onChange={(event) => setDraftStartDate(event.target.value)}
                  />
                </label>
                <label>
                  结束日期
                  <input
                    aria-label="历史故障结束日期"
                    type="date"
                    value={draftEndDate}
                    onChange={(event) => setDraftEndDate(event.target.value)}
                  />
                </label>
                {rangeNotice && (
                  <p className="maintenance-health-date-error" role="alert">
                    {rangeNotice}
                  </p>
                )}
                <button
                  type="button"
                  className="operations-button is-active"
                  onClick={applyRange}
                >
                  应用范围
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="operations-table-scroll">
          <table className="maintenance-health-detail-table">
            <thead>
              <tr>
                <th>发生时间</th>
                <th>故障信息</th>
                <th>恢复时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {visibleFaults.map((fault) => (
                <tr key={`${fault.occurredAt}-${fault.title}`}>
                  <td>{fault.occurredAt}</td>
                  <td>{fault.title}</td>
                  <td>{fault.recoveredAt ?? "—"}</td>
                  <td
                    className={
                      fault.status === "未恢复"
                        ? "maintenance-danger"
                        : "maintenance-success"
                    }
                  >
                    {fault.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visibleFaults.length && (
          <div className="operations-empty">{DEMO_MODE ? "该日期范围内暂无历史故障" : "设备级故障历史尚未接通，暂无可展示记录"}</div>
        )}
      </section>
      <section className="maintenance-health-detail-panel">
        <div className="maintenance-health-detail-heading">
          <h2>维护记录</h2>
        </div>
        <div className="operations-table-scroll">
          <table className="maintenance-health-detail-table">
            <thead>
              <tr>
                <th>完成时间</th>
                <th>维护内容</th>
                <th>负责人</th>
                <th>关联工单</th>
              </tr>
            </thead>
            <tbody>
              {record.detail.maintenance.map((item) => (
                <tr key={item.workOrder}>
                  <td>{item.completedAt}</td>
                  <td>{item.title}</td>
                  <td>{item.owner}</td>
                  <td className="maintenance-health-work-order">
                    {item.workOrder}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MaintenanceDetail({
  row,

  detail,

  onClose,

  onOpenStation,
}: {
  row: MaintenanceStation

  detail: Detail

  onClose: () => void

  onOpenStation: (id: string, subNav?: string) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  const key = JSON.stringify([row.station.id, detail.kind, detail.id])
  const { user } = useAuth()
  const [serverNotes, setServerNotes] = useState<ApiRow[]>([])
  const [saving, setSaving] = useState(false)
  const notesPath =
    detail.kind === "alarm"
      ? `/alarms/${detail.id}/notes`
      : detail.kind === "order"
        ? `/work-orders/${detail.id}/events`
        : ""
  useEffect(() => {
    if (DEMO_MODE || !notesPath) return
    const c = new AbortController()
    api<ApiRow[]>(notesPath, { signal: c.signal })
      .then(setServerNotes)
      .catch((e) => {
        if (!c.signal.aborted) setNotice(e.message)
      })
    return () => c.abort()
  }, [notesPath])
  const [note, setNote] = useState(() => {
    if (!DEMO_MODE) return ""
    try {
      const saved = JSON.parse(localStorage.getItem(NOTE_KEY) ?? "{}")[key]
        ?.note

      return typeof saved === "string" ? saved : ""
    } catch {
      return ""
    }
  })

  const [notice, setNotice] = useState("")

  useEffect(() => {
    const dialog = ref.current

    dialog?.showModal()

    return () => dialog?.close()
  }, [])

  const alarm =
    detail.kind === "alarm"
      ? row.alarms.find((item) => item.id === detail.id)
      : undefined

  const order =
    detail.kind === "order"
      ? row.workOrders.find((item) => item.id === detail.id)
      : undefined

  const firmware =
    detail.kind === "firmware"
      ? row.firmware.find((item) => item.id === detail.id)
      : undefined

  const fields: [string, string][] = alarm
    ? [
        ["事件编号", alarm.id],

        ["告警设备", alarm.device],

        ["发生时间", stamp(alarm.occurredAt)],

        ["恢复时间", stamp(alarm.recoveredAt)],

        ["告警状态", alarm.status === "active" ? "活动中" : "已恢复"],

        [
          "确认状态",

          alarm.acknowledged === undefined
            ? "未接入"
            : alarm.acknowledged
              ? "已确认"
              : "未确认",
        ],

        ["SLA 截止", stamp(alarm.slaDueAt)],

        ["负责人", alarm.owner || row.station.manager],
      ]
    : order
      ? [
          ["工单编号", order.id],

          ["工单状态", WORK_ORDER_STATUS[order.status]],

          ["创建时间", stamp(order.createdAt)],

          ["截止时间", stamp(order.dueAt)],

          ["负责人", order.owner || row.station.manager],

          ["关联告警", order.alarmId || "--"],

          ["工单描述", order.description || "--"],
        ]
      : firmware
        ? [
            ["任务编号", firmware.id],

            ["设备", firmware.device],

            ["当前版本", firmware.currentVersion],

            ["目标版本", firmware.targetVersion || "--"],

            ["状态", FIRMWARE_STATUS[firmware.status]],

            ["更新时间", stamp(firmware.updatedAt)],
          ]
        : []

  const title =
    alarm?.title ??
    order?.title ??
    (firmware ? `${firmware.device} 固件升级` : "记录已移除")

  async function saveNote() {
    if (!DEMO_MODE) {
      if (!note.trim()) {
        setNotice("请填写跟进备注")
        return
      }
      setSaving(true)
      try {
        await send(
          detail.kind === "alarm"
            ? `/alarms/${detail.id}/notes`
            : `/work-orders/${detail.id}/notes`,
          "POST",
          { note: note.trim() },
        )
        setServerNotes(await api<ApiRow[]>(notesPath))
        setNote("")
        setNotice("跟进备注已保存至服务器")
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "保存失败")
      } finally {
        setSaving(false)
      }
      return
    }
    try {
      const saved = JSON.parse(localStorage.getItem(NOTE_KEY) ?? "{}")

      const base =
        saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}

      localStorage.setItem(
        NOTE_KEY,

        JSON.stringify({
          ...base,

          [key]: { note, savedAt: new Date().toISOString() },
        }),
      )

      setNotice("备注已保存至本机，业务状态未改变")
    } catch {
      setNotice("保存失败：本地存储不可用")
    }
  }

  return (
    <dialog
      ref={ref}
      className="maintenance-dialog"
      aria-label="运维记录明细"
      onCancel={onClose}
    >
      <header>
        <div>
          <h2>{title}</h2>
          <span>
            {row.station.name}
            {row.demo ? " · 示例记录" : ""}
          </span>
        </div>
        <button
          className="operations-icon"
          title="关闭"
          aria-label="关闭运维明细"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="maintenance-dialog-body">
        <dl>
          {fields.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {fields.length > 0 && (DEMO_MODE || detail.kind !== "firmware") && (
          <div className="maintenance-note">
            {!DEMO_MODE && (
              <div aria-label="服务器跟进记录">
                {serverNotes.length ? (
                  serverNotes.map((item, index) => (
                    <p key={String(item.id ?? index)}>
                      {String(item.created_at ?? item.occurred_at)} ·{" "}
                      {String(item.author_name ?? item.actor_id ?? "")} ·{" "}
                      {String(item.body ?? item.note ?? "")}
                    </p>
                  ))
                ) : (
                  <p>暂无跟进记录</p>
                )}
              </div>
            )}
            <label>
              跟进备注
              <textarea
                aria-label="运维跟进备注"
                value={note}
                maxLength={2000}
                onChange={(event) => {
                  setNote(event.target.value)

                  setNotice("")
                }}
              />
            </label>
            <div>
              <span className="operations-muted">
                {DEMO_MODE ? "本地记录 · 未提交后台" : "服务器跟进记录"}
              </span>
              <button
                className="operations-button is-active"
                disabled={
                  !DEMO_MODE &&
                  (saving ||
                    !hasStationPermission(user, row.station.id,
                      detail.kind === "alarm"
                        ? "alarm.handle"
                        : "workorder.handle",
                    ))
                }
                onClick={saveNote}
              >
                <Check size={13} />
                保存备注
              </button>
            </div>
            {notice && <p role="status">{notice}</p>}
          </div>
        )}
      </div>
      <footer>
        <button
          className="operations-button"
          disabled={!fields.length}
          onClick={() =>
            exportOperationsCsv(`运维明细-${detail.id}.csv`, ["字段", "内容"], [
              ["站点", row.station.name],

              ...fields,
            ])
          }
        >
          <Download size={13} />
          导出明细
        </button>
        <button
          className="operations-button is-active"
          onClick={() =>
            onOpenStation(
              row.station.id,

              detail.kind === "firmware" ? "设备详情" : "告警信息",
            )
          }
        >
          {detail.kind === "firmware" ? "设备详情" : "站点告警信息"}
          <ArrowRight size={13} />
        </button>
      </footer>
    </dialog>
  )
}

export default function MaintenanceCenterPage({
  stations,

  onOpenStation,

  onOpenOrders,

  onServerChange,

  ordersOnly = false,

  initialFocus,

  onBack,

  allowedTabs = TABS,

  role = "operator",
  registerLeaveGuard,
}: {
  stations: Station[]

  onServerChange?: () => void

  onOpenStation: (id: string, subNav?: string) => void

  onOpenOrders?: (stationId: string, orderId?: string) => void

  ordersOnly?: boolean

  initialFocus?: {
    stationId: string

    orderId?: string
  } | null

  onBack?: () => void

  allowedTabs?: readonly Tab[]

  role?: UserRole
  registerLeaveGuard?: RegisterLeaveGuard
}) {
  const { user } = useAuth()
  const [toolsOpen,setToolsOpen] = useState(false)
  const toolGuard=useRef<null|(()=>Promise<boolean>)>(null)
  const registerToolGuard=useCallback<RegisterLeaveGuard>(guard=>{toolGuard.current=guard;registerLeaveGuard?.(guard)},[registerLeaveGuard])
  const leaveTools=(next:()=>void)=>{void(async()=>{if(await(toolGuard.current?.()??Promise.resolve(true)))next()})()}

  const visibleTabs = TABS.filter((item) => allowedTabs.includes(item))

  const initialDataNow = stationsDataNow(stations)

  const initialHealthRange = dateRangeEndingAt(initialDataNow, 30)

  const [tab, setTab] = useState<Tab>(visibleTabs[0] ?? "运维总览")

  useEffect(() => {if (!visibleTabs.includes(tab)) setTab(visibleTabs[0] ?? "运维总览")}, [tab, visibleTabs.join("|")])
  const [now, setNow] = useState(() => initialDataNow)

  const [scope, setScope] = useState(initialFocus?.stationId ?? "")

  const [owner, setOwner] = useState("")

  const [risk, setRisk] = useState("combined")

  const [attentionOnly, setAttentionOnly] = useState(false)

  const [query, setQuery] = useState("")

  const [sort, setSort] = useState("sla")

  const [state, setState] = useState("")

  const [severity, setSeverity] = useState("")

  const [hidden, setHidden] = useState<string[]>([])

  const [showAllQueue, setShowAllQueue] = useState(false)

  const [selectedAlarmKey, setSelectedAlarmKey] = useState("")

  const [selectedHealthKey, setSelectedHealthKey] = useState("")

  const [selectedHealthDeviceId, setSelectedHealthDeviceId] = useState("")

  const [healthStationId, setHealthStationId] = useState("")

  const [healthDeviceType, setHealthDeviceType] =
    useState<HealthDeviceCategory | "all">("all")

  const [healthRating, setHealthRating] = useState("")

  const [healthCondition, setHealthCondition] = useState<HealthCondition>("all")

  const [healthDateStart, setHealthDateStart] = useState(
    initialHealthRange.start,
  )

  const [healthDateEnd, setHealthDateEnd] = useState(initialHealthRange.end)

  const [healthDraftDateStart, setHealthDraftDateStart] = useState(
    initialHealthRange.start,
  )

  const [healthDraftDateEnd, setHealthDraftDateEnd] = useState(
    initialHealthRange.end,
  )

  const [healthDatePanelOpen, setHealthDatePanelOpen] = useState(false)

  const [healthConditionPanelOpen, setHealthConditionPanelOpen] =
    useState(false)

  const [followedAlarmKeys, setFollowedAlarmKeys] = useState<string[]>([])

  const [viewSavedAt, setViewSavedAt] = useState("")

  const [interactionNotice, setInteractionNotice] =
    useState<InteractionNotice | null>(null)

  const [detail, setDetail] = useState<Detail | null>(
    initialFocus?.orderId
      ? {
          stationId: initialFocus.stationId,

          id: initialFocus.orderId,

          kind: "order",
        }
      : null,
  )

  useEffect(() => {
    setNow(stationsDataNow(stations))

    const timer = window.setInterval(
      () => setNow(stationsDataNow(stations)),
      30000,
    )

    return () => window.clearInterval(timer)
  }, [stations])

  const eligible = stations.filter((station) => station.status !== "building")

  const allRows = useMemo(
    () => eligible.map((station) => buildMaintenanceStation(station, now)),

    [stations, now],
  )

  const healthRecords = useMemo(
    () => buildHealthDeviceRecords(eligible.filter(s=>DEMO_MODE||hasStationPermission(user,s.id,"asset.read"))),

    [eligible],
  )

  const healthRows = healthRecords.filter((record) => {
    return (
      (!healthStationId || record.stationId === healthStationId) &&
      (healthDeviceType === "all" || record.category === healthDeviceType) &&
      (healthCondition === "all" ||
        (healthCondition === "fault"
          ? (record.faultCount ?? 0) > 0 || record.status === "异常"
          : record.faultCount === 0 && record.status === "在线"))
    )
  }).map(record => ({...record, responseCount: DEMO_MODE ? record.detail.faults.filter(fault => fault.date >= healthDateStart && fault.date <= healthDateEnd).length : null}))

  const selectedHealthDevice =
    healthRecords.find((record) => record.id === selectedHealthDeviceId) ?? null

  const rows = allRows.filter(
    (row) =>
      (!scope || row.station.id === scope) &&
      (!owner || row.station.manager === owner) &&
      `${row.station.name} ${row.station.code} ${row.station.manager} ${row.alarms.map((item) => `${item.id} ${item.title} ${item.device}`).join(" ")} ${row.workOrders.map((item) => `${item.id} ${item.title}`).join(" ")}`

        .toLowerCase()

        .includes(query.trim().toLowerCase()) &&
      (!attentionOnly ||
        (risk === "alarm"
          ? row.active.length > 0
          : risk === "sla"
            ? row.earliestSla !== null &&
              row.earliestSla - now.getTime() <= 3600000
            : row.attention)),
  )

  const summary = maintenanceSummary(rows, now)

  const trend = maintenanceTrend(rows, now)

  const queue = maintenanceQueue(rows, risk).filter(
    (item) => risk !== "alarm" || item.kind === "alarm",
  )

  const sorted = rows

    .slice()

    .sort((a, b) =>
      sort === "health"
        ? (a.health ?? Infinity) - (b.health ?? Infinity)
        : sort === "severity"
          ? b.critical - a.critical || b.active.length - a.active.length
          : (a.earliestSla ?? Infinity) - (b.earliestSla ?? Infinity) ||
            b.critical - a.critical,
    )

  const demo = rows.some((row) => row.demo)

  const selected = allRows.find((row) => row.station.id === detail?.stationId)

  const alarmRows = rows

    .flatMap((row) => row.alarms.map((alarm) => ({ row, alarm })))

    .filter(
      ({ alarm }) =>
        (!state || alarm.status === state) &&
        (!severity ||
          (severity === "attention"
            ? alarm.severity !== "info"
            : alarm.severity === severity)),
    )

    .sort(
      (a, b) =>
        (maintenanceTime(b.alarm.occurredAt) ?? 0) -
        (maintenanceTime(a.alarm.occurredAt) ?? 0),
    )

  const orders = rows

    .flatMap((row) => row.workOrders.map((order) => ({ row, order })))

    .filter(({ order }) => !state || order.status === state)

    .sort(
      (a, b) =>
        (maintenanceTime(a.order.dueAt) ?? Infinity) -
        (maintenanceTime(b.order.dueAt) ?? Infinity),
    )

  const firmwareRows = rows

    .flatMap((row) => row.firmware.map((firmware) => ({ row, firmware })))

    .filter(({ firmware }) => !state || firmware.status === state)

  const alarmKey = ({ row, alarm }: typeof alarmRows[number]) =>
    `${row.station.id}:${alarm.id}`

  const selectedAlarm =
    alarmRows.find((item) => alarmKey(item) === selectedAlarmKey) ??
    alarmRows[0]

  const selectedAlarmResolvedKey = selectedAlarm ? alarmKey(selectedAlarm) : ""

  const alarmFollowedCount = alarmRows.filter((item) =>
    followedAlarmKeys.includes(alarmKey(item)),
  ).length

  const selectedAlarmFollowed = followedAlarmKeys.includes(
    selectedAlarmResolvedKey,
  )

  const peakCount = trend.peak.critical + trend.peak.warning + trend.peak.info

  const newest = rows

    .map((row) => row.updatedAt)

    .filter(
      (value): value is number => value !== null && value <= now.getTime(),
    )

    .sort((a, b) => b - a)[0]

  const filtersActive = Boolean(
    scope || owner || query.trim() || attentionOnly || risk !== "combined",
  )

  function announce(text: string, tone: InteractionNotice["tone"] = "success") {
    setInteractionNotice({ text, tone })
  }

  function open(kind: Detail["kind"], stationId: string, id: string) {
    setDetail({ kind, stationId, id })
  }

  function switchTab(value: Tab) {
    if (!visibleTabs.includes(value)) return

    setTab(value)

    setSelectedHealthDeviceId("")

    setHealthDatePanelOpen(false)

    setHealthConditionPanelOpen(false)

    setState(value === "告警事件" ? "active" : "")

    setSeverity(value === "告警事件" ? "attention" : "")

    setInteractionNotice(null)
  }

  function reset() {
    const healthRange = dateRangeEndingAt(now, 30)

    setScope("")

    setOwner("")

    setRisk("combined")

    setQuery("")



    setAttentionOnly(false)

    setState("")

    setSeverity("")

    setHealthStationId("")

    setHealthDeviceType("all")

    setHealthCondition("all")

    setHealthDateStart(healthRange.start)

    setHealthDateEnd(healthRange.end)

    setHealthDraftDateStart(healthRange.start)

    setHealthDraftDateEnd(healthRange.end)

    setHealthDatePanelOpen(false)

    setHealthConditionPanelOpen(false)

    setInteractionNotice(null)
  }

  function toggleHealthDatePanel() {
    setHealthConditionPanelOpen(false)

    setHealthDatePanelOpen((open) => {
      if (!open) {
        setHealthDraftDateStart(healthDateStart)

        setHealthDraftDateEnd(healthDateEnd)
      }

      return !open
    })
  }

  function applyHealthDateRange() {
    if (!healthDraftDateStart || !healthDraftDateEnd || healthDraftDateStart > healthDraftDateEnd) {
      announce("健康记录的开始日期不能晚于结束日期", "warning")

      return
    }

    setHealthDateStart(healthDraftDateStart)

    setHealthDateEnd(healthDraftDateEnd)

    setHealthDatePanelOpen(false)

    announce(
      `已应用健康记录范围 ${healthDraftDateStart.slice(5)} ~ ${healthDraftDateEnd.slice(5)}`,

      "info",
    )
  }

  function saveCurrentView() {
    const savedAt = new Date().toLocaleTimeString("zh-CN", {
      hour: "2-digit",

      minute: "2-digit",

      hour12: false,
    })

    try {
      localStorage.setItem(
        VIEW_KEY,

        JSON.stringify({
          tab,

          scope,

          owner,

          risk,

          state,

          severity,

          sort,

          query,

          attentionOnly,

          savedAt: new Date().toISOString(),
        }),
      )

      setViewSavedAt(savedAt)

      announce(`当前筛选视图已保存 · ${savedAt}`)
    } catch {
      announce("保存失败：本地存储不可用", "warning")
    }
  }

  function followVisibleAlarms() {
    if (!alarmRows.length) {
      announce("当前筛选下没有可关注的告警事件", "warning")

      return
    }

    setFollowedAlarmKeys((current) => [
      ...new Set([...current, ...alarmRows.map(alarmKey)]),
    ])

    announce(`已关注当前 ${alarmRows.length} 条告警事件`)
  }

  function exportCurrent() {
    if (ordersOnly)
      exportOperationsCsv(
        "运维工单.csv",

        ["站点", "工单", "标题", "状态", "截止", "负责人"],

        orders.map(({ row, order }) => [
          row.station.name,

          order.id,

          order.title,

          WORK_ORDER_STATUS[order.status],

          order.dueAt ?? "",

          order.owner || row.station.manager,
        ]),
      )
    else if (tab === "告警事件")
      exportOperationsCsv(
        "告警事件.csv",

        ["站点", "事件", "设备", "告警", "级别", "状态", "发生时间", "SLA截止"],

        alarmRows.map(({ row, alarm }) => [
          row.station.name,

          alarm.id,

          alarm.device,

          alarm.title,

          MAINTENANCE_SEVERITY[alarm.severity].label,

          alarm.status === "active" ? "活动中" : "已恢复",

          alarm.occurredAt ?? "",

          alarm.slaDueAt ?? "",
        ]),
      )
    else if (tab === "固件升级")
      exportOperationsCsv(
        "固件升级.csv",

        ["站点", "任务", "设备", "当前版本", "目标版本", "状态"],

        firmwareRows.map(({ row, firmware }) => [
          row.station.name,

          firmware.id,

          firmware.device,

          firmware.currentVersion,

          firmware.targetVersion ?? "",

          FIRMWARE_STATUS[firmware.status],
        ]),
      )
    else
      exportOperationsCsv(
        "站点运维明细.csv",

        [
          "站点",

          "健康度",

          "活动告警",

          "严重",

          "工单",

          "负责人",

          "最早SLA",

          "最近通信",

          "来源",
        ],

        sorted.map((row) => [
          row.station.name,

          row.health,

          row.alarmsKnown ? row.active.length : null,

          row.alarmsKnown ? row.critical : null,

          row.ordersKnown ? row.openOrders.length : null,

          row.station.manager,

          row.earliestSla === null
            ? ""
            : new Date(row.earliestSla).toISOString(),

          row.lastSeen === null ? "" : new Date(row.lastSeen).toISOString(),

          row.demo ? "示例" : "接入数据",
        ]),
      )
  }

  function handleExportCurrent() {
    exportCurrent()

    announce("当前列表已导出为 CSV", "info")
  }

  const exportButton = (
    <button
      className="operations-button"
      type="button"
      onClick={handleExportCurrent}
      disabled={
        ordersOnly
          ? !orders.length
          : tab === "告警事件"
            ? !alarmRows.length
            : tab === "固件升级"
              ? !firmwareRows.length
              : !rows.length
      }
    >
      <Download size={13} />
      导出
    </button>
  )

  const statusOptions = ordersOnly
    ? WORK_ORDER_STATUS
    : tab === "告警事件"
      ? { active: "活动中", recovered: "已恢复" }
      : FIRMWARE_STATUS

  const liveStatus = (
    <span className="maintenance-live-status">
      <i aria-hidden="true" />
      {demo ? "示例预览" : "跨站风险"} ·{" "}
      {newest ? `数据更新 ${clock(newest)}` : "未提供更新时间"}
    </span>
  )

  return (
    <main className="operations-page maintenance-page">
      {ordersOnly && (
        <PageHeader
          title="工单与审批"
          description="集中跟踪运维工单与审批状态"
          actions={
            <>
              <button
                className="operations-icon"
                title="返回运维中心"
                aria-label="返回运维中心"
                onClick={onBack}
              >
                <ArrowLeft size={17} />
              </button>
              {liveStatus}
            </>
          }
        />
      )}
      {!ordersOnly && (
        <nav className="ui-tabs maintenance-tabs" aria-label="运维中心二级导航">
          {visibleTabs.map((value) => (
            <button
              key={value}
              aria-current={!toolsOpen && tab === value ? "page" : undefined}
              onClick={() => leaveTools(()=>{setToolsOpen(false);switchTab(value)})}
            >
              {value}
            </button>
          ))}
          <button aria-current={toolsOpen?"page":undefined} onClick={()=>leaveTools(()=>setToolsOpen(true))}>运维工具</button>
          {liveStatus}
        </nav>
      )}
      {!ordersOnly && <h1 className="maintenance-page-title">运维中心</h1>}
      {!ordersOnly && (
        <p className="maintenance-role-scope">
          {role === "integrator"
            ? "项目交付与技术支持范围"
            : "责任站点运维范围"}
        </p>
      )}
      {toolsOpen&&!ordersOnly ? <div className="maintenance-content"><MaintenanceWorkbench stations={eligible} registerLeaveGuard={registerToolGuard} onServerChange={onServerChange} onOpenOrders={onOpenOrders} onHealthDevice={(stationId,deviceId)=>{setToolsOpen(false);setTab("设备健康");setSelectedHealthDeviceId(`${stationId}-${deviceId}`)}}/></div> : <div className="maintenance-content">
        {(ordersOnly || tab === "运维总览") && (
          <section className="maintenance-toolbar" aria-label="运维筛选">
            <label>
              责任范围
              <select
                aria-label="运维站点范围"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="">全部站点 · {eligible.length}</option>
                {eligible.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </label>
            {!ordersOnly && (
              <label>
                风险口径
                <select
                  aria-label="运维风险口径"
                  value={risk}
                  onChange={(event) => setRisk(event.target.value)}
                >
                  <option value="combined">实时告警 + SLA</option>
                  <option value="alarm">实时告警</option>
                  <option value="sla">SLA 优先</option>
                </select>
              </label>
            )}
            <label>
              负责人
              <select
                aria-label="运维负责人"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
              >
                <option value="">全部</option>
                {[...new Set(eligible.map((station) => station.manager))]

                  .filter(Boolean)

                  .map((name) => (
                    <option key={name}>{name}</option>
                  ))}
              </select>
            </label>
            <label className="maintenance-attention">
              <input
                type="checkbox"
                checked={attentionOnly}
                onChange={(event) => setAttentionOnly(event.target.checked)}
              />
              仅看待处理
            </label>
            <label className="maintenance-search">
              <Search size={13} />
              <input
                aria-label="搜索运维记录"
                type="search"
                placeholder="站点 / 事件 / 工单"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {filtersActive && (
              <button
                className="operations-icon maintenance-clear-filters"
                title="清除筛选"
                aria-label="清除筛选"
                onClick={reset}
              >
                <RotateCcw size={15} />
              </button>
            )}
          </section>
        )}
        {!ordersOnly && tab === "告警事件" && (
          <section
            className="maintenance-toolbar maintenance-toolbar--reference"
            aria-label="告警事件筛选"
          >
            <label>
              <span>范围</span>
              <select
                aria-label="告警站点范围"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="">全部站点</option>
                {eligible.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>等级</span>
              <select
                aria-label="告警等级"
                value={severity}
                onChange={(event) => setSeverity(event.target.value)}
              >
                <option value="attention">严重 + 重要</option>
                <option value="critical">严重</option>
                <option value="warning">重要</option>
                <option value="info">一般</option>
                <option value="">全部</option>
              </select>
            </label>
            <label>
              <span>状态</span>
              <select
                aria-label="告警状态"
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="active">未关闭</option>
                <option value="recovered">已恢复</option>
                <option value="">全部状态</option>
              </select>
            </label>
            <label>
              <span>SLA</span>
              <select
                aria-label="告警排序"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="sla">即将超时优先</option>
                <option value="severity">严重告警优先</option>
                <option value="health">站点健康优先</option>
              </select>
            </label>
            <button
              className="operations-button is-active"
              type="button"
              onClick={saveCurrentView}
            >
              {viewSavedAt ? `已保存 ${viewSavedAt}` : "保存当前视图"}
            </button>
            <label className="maintenance-search">
              <Search size={13} />
              <input
                aria-label="搜索告警事件"
                type="search"
                placeholder="搜索事件"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </section>
        )}
        {!ordersOnly && tab === "设备健康" && !selectedHealthDevice && (
          <section
            className="maintenance-health-toolbar"
            aria-label="设备健康筛选"
          >
            <label className="maintenance-health-control">
              <select
                aria-label="健康站点范围"
                value={healthStationId}
                onChange={(event) => setHealthStationId(event.target.value)}
              >
                <option value="">全部站点</option>
                {eligible.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <label className="maintenance-health-control">
              <select
                aria-label="健康设备类型"
                value={healthDeviceType}
                onChange={(event) =>
                  setHealthDeviceType(
                    event.target.value as HealthDeviceCategory | "all",
                  )
                }
              >
                <option value="all">设备类型</option>
                {Object.entries(HEALTH_CATEGORY_LABELS)

                  .filter(([key]) => key !== "all")

                  .map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            <div className="maintenance-health-date-control">
              <button
                type="button"
                className="maintenance-health-filter-button"
                aria-expanded={healthDatePanelOpen}
                aria-haspopup="dialog"
                onClick={toggleHealthDatePanel}
              >
                {healthDateStart.slice(5)} ~ {healthDateEnd.slice(5)}
                <ChevronDown size={14} />
              </button>
              {healthDatePanelOpen && (
                <div
                  className="maintenance-health-date-popover"
                  role="dialog"
                  aria-label="设备健康日期范围"
                >
                  <label>
                    开始日期
                    <input
                      aria-label="健康开始日期"
                      type="date"
                      value={healthDraftDateStart}
                      onChange={(event) =>
                        setHealthDraftDateStart(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    结束日期
                    <input
                      aria-label="健康结束日期"
                      type="date"
                      value={healthDraftDateEnd}
                      onChange={(event) =>
                        setHealthDraftDateEnd(event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="operations-button is-active"
                    onClick={applyHealthDateRange}
                  >
                    应用范围
                  </button>
                </div>
              )}
            </div>
            <div className="maintenance-health-condition-control">
              <button
                type="button"
                className={`maintenance-health-filter-button${
                  healthCondition !== "all" ? " is-active" : ""
                }`}
                aria-expanded={healthConditionPanelOpen}
                aria-haspopup="menu"
                onClick={() => {
                  setHealthDatePanelOpen(false)

                  setHealthConditionPanelOpen((open) => !open)
                }}
              >
                <Plus size={14} />
                {healthCondition === "all"
                  ? "新增健康条件"
                  : healthCondition === "fault"
                    ? "仅看异常设备"
                    : "仅看正常设备"}
              </button>
              {healthConditionPanelOpen && (
                <div
                  className="maintenance-health-condition-popover"
                  role="menu"
                  aria-label="健康条件"
                >
                  {([
                    ["all", "全部设备"],

                    ["fault", "仅看异常设备"],

                    ["normal", "仅看正常设备"],
                  ] as const)

                    .map(([value, label]) => (
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={healthCondition === value}
                        key={value}
                        onClick={() => {
                          setHealthCondition(value)

                          setHealthConditionPanelOpen(false)
                        }}
                      >
                        {label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </section>
        )}
        {interactionNotice && (
          <div
            className={`maintenance-action-feedback is-${interactionNotice.tone}`}
            role="status"
          >
            <span>{interactionNotice.text}</span>
            <button
              className="operations-icon"
              type="button"
              aria-label="关闭操作提示"
              onClick={() => setInteractionNotice(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {!ordersOnly && tab === "运维总览" && (
          <>
            <section className="maintenance-metrics" aria-label="运维风险指标">
              {[
                {
                  id: "critical",

                  label: "严重告警",

                  icon: AlertTriangle,

                  tone: "critical",

                  value: number(summary.critical),

                  note: `${summary.criticalStations} 个站点`,

                  action: () => {
                    switchTab("告警事件")

                    setState("active")

                    setSeverity("critical")
                  },
                },

                {
                  id: "unacknowledged",

                  label: "未确认告警",

                  icon: CircleAlert,

                  tone: "warning",

                  value: number(summary.unacknowledged),

                  note:
                    summary.oldestUnacknowledged === null
                      ? "确认时间未接入或无待确认"
                      : `最长 ${Math.floor(summary.oldestUnacknowledged)} min`,
                },

                {
                  id: "orders",

                  label: "处理中工单",

                  icon: ClipboardList,

                  tone: "neutral",

                  value: number(summary.openOrders),

                  note: `${summary.nearDeadline} 单临近或超过时限`,

                  action: () => onOpenOrders?.(scope),
                },

                {
                  id: "inspections", label: "今日到期巡检", icon: ClipboardList, tone: "neutral",
                  value: number(summary.dueToday),
                  note: summary.dueToday && summary.completedToday !== null ? `完成率 ${Math.round(summary.completedToday / summary.dueToday * 100)}%` : "按已接入计划时间统计",
                  action: () => setToolsOpen(true),
                },

                {
                  id: "communication",

                  label: "通信异常",

                  icon: WifiOff,

                  tone: "danger",

                  value: number(summary.communication),

                  note:
                    rows

                      .filter((row) => row.communication === "offline")

                      .map((row) => row.station.shortName)

                      .join("、") || "无已知异常",

                  action: () => switchTab("设备健康"),
                },

                {
                  id: "health",

                  label: "健康覆盖",

                  icon: ShieldCheck,

                  tone: "success",

                  value: `${summary.healthCovered} / ${summary.total}`,

                  note: summary.total
                    ? `${((summary.healthCovered / summary.total) * 100).toFixed(1)}% · 24小时内评分`
                    : "暂无在运站点",

                  action: () => switchTab("设备健康"),
                },
              ].map((item) => (
                <div
                  className="maintenance-metric"
                  data-tone={item.tone}
                  key={item.id}
                >
                  <div className="maintenance-metric-heading">
                    <span>{item.label}</span>

                  </div>
                  {item.action ? (
                    <button
                      className="maintenance-metric-value"
                      data-testid={`maintenance-${item.id}`}
                      onClick={item.action}
                    >
                      {item.value}
                    </button>
                  ) : (
                    <strong data-testid={`maintenance-${item.id}`}>
                      {item.value}
                    </strong>
                  )}
                  <small>{item.note}</small>
                </div>
              ))}
            </section>
            <div className="maintenance-middle">
              <section
                className="maintenance-trend-section"
                aria-label="24小时告警态势"
              >
                <div className="operations-section-heading">
                  <h2>24小时告警态势</h2>
                  <span className="maintenance-period">
                    <Radio size={13} aria-hidden="true" />
                    过去 24 小时
                  </span>
                </div>
                <div className="maintenance-trend-layout">
                  <div className="maintenance-trend">
                    <div className="maintenance-legend">
                      <span>新增告警</span>
                      {ALARM_CHART_SERIES.map(({ key, label, fill }) => (
                        <button
                          key={key}
                          aria-pressed={!hidden.includes(key)}
                          onClick={() =>
                            setHidden((current) =>
                              current.includes(key)
                                ? current.filter((value) => value !== key)
                                : [...current, key],
                            )
                          }
                        >
                          <i aria-hidden="true" style={{ background: fill }} />
                          {label}{" "}
                          {trend.counts[(key as keyof typeof trend.counts)]}
                        </button>
                      ))}
                    </div>
                    <div
                      className="maintenance-chart"
                      data-testid="maintenance-chart"
                    >
                      {trend.covered ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={trend.bins.map((bin) => ({
                              ...bin,

                              plotTime: bin.time + 3600000,
                            }))}
                            margin={{
                              top: 18,

                              right: 14,

                              left: -24,

                              bottom: 0,
                            }}
                          >
                            <CartesianGrid
                              vertical={false}
                              stroke="var(--ui-border)"
                            />
                            <XAxis
                              dataKey="plotTime"
                              type="number"
                              domain={[now.getTime() - 86400000, now.getTime()]}
                              ticks={Array.from(
                                { length: 7 },

                                (_, index) =>
                                  now.getTime() - 86400000 + index * 14400000,
                              )}
                              tickFormatter={(value) => clock(value)}
                              tick={{ fontSize: 12, fill: "var(--ui-muted)" }}
                              axisLine={false}
                              tickLine={false}
                              minTickGap={25}
                            />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 12, fill: "var(--ui-muted)" }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              labelFormatter={(value) =>
                                `${clock(Number(value) - 3600000)} - ${clock(Number(value) + 3600000)}`
                              }
                              formatter={(value, name) => [
                                value,

                                MAINTENANCE_SEVERITY[
                                  (name as keyof typeof MAINTENANCE_SEVERITY)
                                ]?.label ?? name,
                              ]}
                              contentStyle={{
                                fontSize: 12,

                                borderRadius: 4,

                                borderColor: "var(--ui-border)",
                              }}
                              cursor={{ fill: "var(--ui-subtle)" }}
                            />
                            {ALARM_CHART_SERIES.slice()

                              .reverse()

                              .map(({ key, fill }) => (
                                <Bar
                                  key={key}
                                  dataKey={key}
                                  stackId="events"
                                  fill={fill}
                                  maxBarSize={18}
                                  hide={hidden.includes(key)}
                                  isAnimationActive={false}
                                />
                              ))}
                            <ReferenceLine
                              x={now.getTime()}
                              stroke="var(--ui-muted)"
                              label={{
                                value: "现在",

                                position: "insideTopRight",

                                fontSize: 12,

                                fill: "var(--ui-muted)",
                              }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="operations-empty">告警历史尚未接入</div>
                      )}
                    </div>
                    <p className="maintenance-chart-foot">
                      {peakCount
                        ? `高峰 ${clock(trend.peak.time)}-${clock(trend.peak.time + 7200000)} · 新增 ${peakCount} 条`
                        : "过去24小时无已知新增告警"}
                      <span>
                        {trend.covered} / {rows.length} 站已接入
                      </span>
                    </p>
                  </div>
                  <div className="maintenance-device-sources">
                    <h3>主要设备来源</h3>
                    <span>近24小时新增告警</span>
                    <div>
                      {trend.devices.map((item, index) => (
                        <div className="maintenance-source-row" key={item.name}>
                          <span>{item.name}</span>
                          <div>
                            <i
                              style={{
                                width: `${
                                  trend.devices[0]?.value
                                    ? (item.value / trend.devices[0].value) *
                                      100
                                    : 0
                                }%`,

                                background:
                                  index === 0
                                    ? "var(--ui-chart-primary)"
                                    : "var(--ui-chart-tertiary)",
                              }}
                            />
                          </div>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>
                    <p>
                      BMS 与 PCS 占新增告警{" "}
                      {trend.total
                        ? `${Math.round((trend.devices.filter((item) => ["BMS", "PCS"].includes(item.name)).reduce((sum, item) => sum + item.value, 0) / trend.total) * 100)}%`
                        : "--"}
                    </p>
                  </div>
                </div>
              </section>
              <section
                className="maintenance-priority"
                aria-label="优先处置队列"
              >
                <div className="operations-section-heading">
                  <div className="maintenance-section-title">
                    <h2>优先处置队列</h2>
                    <span>{queue.length} 条</span>
                  </div>
                  <button
                    className="operations-button"
                    aria-expanded={showAllQueue}
                    onClick={() => setShowAllQueue((current) => !current)}
                  >
                    {showAllQueue ? "收起" : "查看全部"}
                  </button>
                </div>
                <div className="maintenance-queue">
                  {(showAllQueue ? queue : queue.slice(0, 4)).map((item) => (
                    <article
                      className="maintenance-queue-item"
                      data-queue-kind={item.kind}
                      key={item.key}
                    >
                      <Badge severity={item.severity} />
                      <div className="maintenance-queue-copy">
                        <strong>{item.station.name}</strong>
                        <span>{item.title}</span>
                        <button
                          className="operations-link"
                          onClick={() =>
                            item.kind === "order"
                              ? onOpenOrders?.(item.station.id, item.id)
                              : open("alarm", item.station.id, item.id)
                          }
                        >
                          {item.kind === "order"
                            ? "进入工单与审批"
                            : "进入告警信息"}
                          <ArrowRight size={12} />
                        </button>
                      </div>
                      <div className="maintenance-queue-meta">
                        <span
                          className={
                            item.dueAt !== null && item.dueAt < now.getTime()
                              ? "maintenance-danger"
                              : item.severity === "order"
                                ? "maintenance-blue"
                                : "maintenance-amber"
                          }
                        >
                          {deadline(item.dueAt, now.getTime())}
                        </span>
                        {item.owner && <small>{item.owner}</small>}
                      </div>
                    </article>
                  ))}
                </div>
                {!queue.length && (
                  <div className="operations-empty">当前范围无待处置记录</div>
                )}
              </section>
            </div>
            <section className="maintenance-stations">
              <div className="operations-section-heading">
                <h2>
                  站点运维明细 <span>{rows.length} 个站点</span>
                </h2>
                <div className="operations-actions">
                  <select
                    aria-label="运维站点排序"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="sla">SLA 优先</option>
                    <option value="severity">严重告警优先</option>
                    <option value="health">健康度最低优先</option>
                  </select>
                  {exportButton}
                </div>
              </div>
              <Table
                headers={[
                  "站点",

                  "健康度",

                  "活动告警",

                  "严重",

                  "工单",

                  "负责人",

                  "最早 SLA",

                  "最近通信",

                  "操作",
                ]}
                empty={!sorted.length}
              >
                {sorted.map((row) => (
                  <tr
                    key={row.station.id}
                    className={
                      row.critical
                        ? "maintenance-row-critical"
                        : row.communication === "offline"
                          ? "maintenance-row-warning"
                          : ""
                    }
                  >
                    <td>
                      <div className="maintenance-station-cell">
                        <i
                          className={`maintenance-status-dot ${
                            row.critical
                              ? "is-critical"
                              : row.communication === "offline"
                                ? "is-offline"
                                : row.attention
                                  ? "is-attention"
                                  : "is-healthy"
                          }`}
                          aria-hidden="true"
                        />
                        <button
                          className="operations-link"
                          onClick={() =>
                            onOpenStation(row.station.id, "告警信息")
                          }
                        >
                          {row.station.name}
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    </td>
                    <td>
                      <div
                        className="maintenance-health-cell"
                        aria-label={`健康度 ${number(row.health)}`}
                      >
                        <strong>{number(row.health)}</strong>
                        {row.health !== null && (
                          <span aria-hidden="true">
                            <i
                              style={{
                                width: `${Math.max(
                                  0,

                                  Math.min(100, row.health),
                                )}%`,
                              }}
                            />
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{row.alarmsKnown ? row.active.length : "--"}</td>
                    <td className={row.critical ? "maintenance-danger" : ""}>
                      {row.alarmsKnown ? row.critical : "--"}
                    </td>
                    <td>
                      <button
                        className="operations-link"
                        aria-label={`查看${row.station.name}工单`}
                        onClick={() => onOpenOrders?.(row.station.id)}
                      >
                        {row.ordersKnown ? row.openOrders.length : "--"}
                        <ArrowRight size={11} />
                      </button>
                    </td>
                    <td>{row.station.manager || "--"}</td>
                    <td
                      className={
                        row.earliestSla !== null &&
                        row.earliestSla < now.getTime()
                          ? "maintenance-danger"
                          : "maintenance-amber"
                      }
                    >
                      {deadline(row.earliestSla, now.getTime())}
                    </td>
                    <td
                      title={
                        row.lastSeen === null
                          ? "未接入"
                          : new Date(row.lastSeen).toLocaleString()
                      }
                    >
                      {clock(row.lastSeen)}
                    </td>
                    <td>
                      <button
                        className="operations-link"
                        aria-label={`查看${row.station.name}运维告警`}
                        onClick={() => {
                          setScope(row.station.id)

                          switchTab("告警事件")

                          setState("active")
                        }}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            </section>
          </>
        )}
        {!ordersOnly && tab === "告警事件" && (
          <div className="maintenance-alert-layout">
            <section className="maintenance-reference-panel">
              <div className="maintenance-panel-heading">
                <div>
                  <h2>跨站告警事件</h2>
                  <span>
                    {alarmRows.length} 条活动事件 · 已按等级、SLA和持续时间排序
                  </span>
                </div>
                <button
                  className="operations-button"
                  type="button"
                  disabled={!alarmRows.length}
                  onClick={followVisibleAlarms}
                >
                  {alarmRows.length && alarmFollowedCount === alarmRows.length
                    ? `已关注 ${alarmFollowedCount}`
                    : "批量关注"}
                </button>
              </div>
              <Table
                headers={[
                  "等级",

                  "站点 / 设备",

                  "告警事件",

                  "状态",

                  "持续",

                  "SLA",

                  "负责人",

                  "更新",
                ]}
                empty={!alarmRows.length}
              >
                {alarmRows.map((item) => {
                  const { row, alarm } = item

                  const key = alarmKey(item)

                  const dueAt = maintenanceTime(alarm.slaDueAt)

                  return (
                    <tr
                      key={key}
                      className={
                        key === selectedAlarmResolvedKey ? "is-selected" : ""
                      }
                    >
                      <td>
                        <Badge severity={alarm.severity} />
                      </td>
                      <td>
                        <button
                          className="operations-link operations-link-neutral"
                          onClick={() => setSelectedAlarmKey(key)}
                        >
                          {row.station.shortName || row.station.name}
                        </button>
                        <small>{alarm.device}</small>
                      </td>
                      <td>{alarm.title}</td>
                      <td>{alarmDisplayStatus(alarm)}</td>
                      <td>
                        {duration(
                          alarm.occurredAt,

                          now.getTime(),

                          alarm.recoveredAt,
                        )}
                      </td>
                      <td
                        className={
                          dueAt !== null && dueAt < now.getTime()
                            ? "maintenance-danger"
                            : "maintenance-amber"
                        }
                      >
                        {alarm.status === "recovered"
                          ? "已恢复"
                          : dueAt === null
                            ? "--"
                            : deadline(dueAt, now.getTime()).replace(
                                "剩余 ",

                                "",
                              )}
                      </td>
                      <td>{alarm.owner || row.station.manager || "--"}</td>
                      <td>{clock(maintenanceTime(alarm.occurredAt))}</td>
                    </tr>
                  )
                })}
              </Table>
            </section>
            <aside className="maintenance-reference-panel maintenance-alert-detail">
              {selectedAlarm ? (
                <>
                  <div className="maintenance-alert-detail-head">
                    <Badge severity={selectedAlarm.alarm.severity} />
                    <span>
                      {selectedAlarmFollowed ? "已关注 · " : ""}
                      {selectedAlarm.alarm.id}
                    </span>
                  </div>
                  <h2>{selectedAlarm.alarm.title}</h2>
                  {!DEMO_MODE && (
                    <button
                      className="operations-button"
                      disabled={
                        selectedAlarm.alarm.acknowledged ||
                        !hasStationPermission(user, selectedAlarm.row.station.id, "alarm.handle")
                      }
                      onClick={async () => {
                        try {
                          await send(
                            `/alarms/${selectedAlarm.alarm.id}/acknowledge`,
                            "POST",
                          )
                          announce("服务器已确认告警")
                          onServerChange?.()
                        } catch (error) {
                          announce(
                            error instanceof Error ? error.message : "确认失败",
                            "warning",
                          )
                        }
                      }}
                    >
                      {selectedAlarm.alarm.acknowledged ? "已确认" : "确认告警"}
                    </button>
                  )}
                  <p className="maintenance-detail-station">
                    {selectedAlarm.row.station.name} ·{" "}
                    {selectedAlarm.alarm.device}
                  </p>
                  <p className="maintenance-danger">
                    已持续{" "}
                    {duration(
                      selectedAlarm.alarm.occurredAt,

                      now.getTime(),

                      selectedAlarm.alarm.recoveredAt,
                    )}{" "}
                    · SLA剩余{" "}
                    {deadline(
                      maintenanceTime(selectedAlarm.alarm.slaDueAt),

                      now.getTime(),
                    ).replace("剩余 ", "")}
                  </p>
                  <div
                    className="maintenance-status-flow"
                    aria-label="当前状态"
                  >
                    {["已触发", "已看到", "处理中", "恢复", "待验证"].map(
                      (label, index) => (
                        <span
                          key={label}
                          data-active={
                            index === 0 ||
                            (index === 1 && selectedAlarm.alarm.acknowledged) ||
                            (index === 3 && selectedAlarm.alarm.status === "recovered")
                          }
                        >
                          <i />
                          {label}
                        </span>
                      ),
                    )}
                  </div>
                  <div className="maintenance-evidence">
                    <h3>影响与证据</h3>
                    <dl>
                      <div>
                        <dt>影响</dt>
                        <dd>
                          {selectedAlarm.alarm.device}{" "}
                          关联告警，站点处置优先级上升
                        </dd>
                      </div>
                      <div>
                        <dt>触发值</dt>
                        <dd>
                          触发测点与阈值未提供
                        </dd>
                      </div>
                      <div>
                        <dt>处置建议</dt>
                        <dd>按 SLA 进入现场核查，必要时转工单闭环</dd>
                      </div>
                      <div>
                        <dt>关联事件</dt>
                        <dd>
                          同设备告警{" "}
                          {
                            selectedAlarm.row.alarms.filter(
                              (alarm) =>
                                alarm.device === selectedAlarm.alarm.device,
                            ).length
                          }{" "}
                          条
                        </dd>
                      </div>
                    </dl>
                  </div>
                  <div className="maintenance-inline-trend"><h3>事件前后趋势</h3><div className="maintenance-empty-chart"><span>事件采样与触发阈值尚未接通</span></div></div>
                  <div className="maintenance-evidence"><h3>智能 AI 根因诊断</h3><p className="maintenance-boundary">当前选中：{selectedAlarm.alarm.id}</p><h4>疑似根因分析</h4><p className="maintenance-boundary">AI 诊断服务尚未接通，暂无根因或置信度。</p><h4>推荐处理步骤</h4><p className="maintenance-boundary">暂无已验证的自动建议。可查看原始事件并创建现场核查工单。</p><button className="operations-button" disabled title="远程诊断执行接口未接通">远程诊断未接通</button></div>
                  <div className="maintenance-disposal-log">
                    <h3>处置记录</h3>
                    <p>
                      {clock(maintenanceTime(selectedAlarm.alarm.occurredAt))}{" "}
                      系统触发告警，已生成处置记录
                    </p>
                    <p>
                      {selectedAlarm.alarm.acknowledged ? "已确认" : "待确认"} ·{" "}
                      负责人{" "}
                      {selectedAlarm.alarm.owner ||
                        selectedAlarm.row.station.manager}
                    </p>
                  </div>
                  <div className="maintenance-card-actions">
                    <button
                      className="operations-button"
                      onClick={() =>
                        onOpenOrders?.(selectedAlarm.row.station.id)
                      }
                    >
                      转工单
                    </button>
                    <button
                      className="operations-button is-active"
                      onClick={() =>
                        onOpenStation(selectedAlarm.row.station.id, "告警信息")
                      }
                    >
                      打开站点告警
                    </button>
                    <button
                      className="operations-button"
                      onClick={() =>
                        open(
                          "alarm",

                          selectedAlarm.row.station.id,

                          selectedAlarm.alarm.id,
                        )
                      }
                    >
                      更多操作
                    </button>
                  </div>
                </>
              ) : (
                <div className="operations-empty">暂无告警详情</div>
              )}
            </aside>
          </div>
        )}
        {!ordersOnly &&
          tab === "设备健康" &&
          (selectedHealthDevice ? (
            <HealthDeviceDetail
              record={selectedHealthDevice}
              onBack={() => setSelectedHealthDeviceId("")}
            />
          ) : (
            <section
              className="maintenance-health-list-panel"
              aria-label="设备运行与故障记录"
            >
              <div className="maintenance-health-list-heading">
                <h2>设备运行与故障记录</h2>
                <span>故障统计 · 近 30 天</span>
              </div>
              <div className="operations-table-scroll">
                <table className="maintenance-health-list-table">
                  <thead>
                    <tr>
                      <th>设备</th>
                      <th>所属站点</th>
                      <th>状态</th>
                      <th>累计运行时长</th>
                      <th>未恢复故障</th>
                      <th>区间故障次数</th>
                      <th>最近故障时间</th>
                      <th>最近维护日期</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthRows.map((record) => (
                      <tr key={record.id}>
                        <td>
                          <strong>{record.code}</strong>
                          <small>{record.categoryLabel}</small>
                        </td>
                        <td>{record.stationName}</td>
                        <td>
                          <span
                            className={`maintenance-health-status is-${
                              record.status === "异常" ? "danger" : record.status === "在线" ? "success" : "neutral"
                            }`}
                          >
                            <i />
                            {record.status}
                          </span>
                        </td>
                        <td>{record.runtime}</td>
                        <td>{record.faultCount ?? "—"}</td>
                        <td>{record.responseCount ?? "—"}</td>
                        <td>{record.latestFault ?? "—"}</td>
                        <td>{record.latestMaintenance}</td>
                        <td>
                          <button
                            type="button"
                            className="operations-link"
                            onClick={() => setSelectedHealthDeviceId(record.id)}
                          >
                            查看详情
                            <ArrowRight size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!healthRows.length && (
                <div className="operations-empty">
                  暂无符合条件的设备健康记录
                </div>
              )}
              <footer className="maintenance-health-list-footer">
                <span>共 {healthRows.length} 台设备</span>
                <span>数据来源 · 设备健康监控</span>
              </footer>
            </section>
          ))}
        {!ordersOnly && tab === "固件升级" && <MaintenanceFirmware stations={eligible} registerLeaveGuard={registerToolGuard}/>}
        {ordersOnly && (
          <section className="maintenance-records">
            <div className="operations-section-heading">
              <h2>工单列表</h2>
              <div className="operations-actions">
                <select
                  aria-label="运维记录状态"
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                >
                  <option value="">全部状态</option>
                  {Object.entries(statusOptions).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
                {exportButton}
              </div>
            </div>
            <Table
              headers={[
                "工单 / 任务",

                "站点",

                "状态",

                "负责人",

                "截止时间",

                "SLA",

                "操作",
              ]}
              empty={!orders.length}
            >
              {orders.map(({ row, order }) => (
                <tr key={`${row.station.id}:${order.id}`}>
                  <td>
                    <strong>{order.id}</strong>
                    <small>{order.title}</small>
                  </td>
                  <td>{row.station.name}</td>
                  <td>
                    <span className="maintenance-badge maintenance-order">
                      {WORK_ORDER_STATUS[order.status]}
                    </span>
                  </td>
                  <td>{order.owner || row.station.manager}</td>
                  <td>{stamp(order.dueAt)}</td>
                  <td>
                    {["completed", "cancelled"].includes(order.status)
                      ? "已结束"
                      : deadline(maintenanceTime(order.dueAt), now.getTime())}
                  </td>
                  <td>
                    <button
                      className="operations-link"
                      onClick={() => open("order", row.station.id, order.id)}
                    >
                      查看工单
                      <ArrowRight size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          </section>
        )}
        {!rows.length && (
          <div className="maintenance-reset">
            <button className="operations-link" onClick={reset}>
              重置筛选
            </button>
          </div>
        )}
        <footer className="maintenance-footer">
          <span>
            {demo ? "含示例数据" : "接入数据"} · {rows.length} 个在运站点 · 告警{" "}
            {rows.filter((row) => row.alarmsKnown).length} / 工单{" "}
            {rows.filter((row) => row.ordersKnown).length} 站已接入
          </span>
          <span>
            {ordersOnly
              ? "工单及审批状态以后台回执为准"
              : tab === "固件升级"
                ? "升级状态以设备回执为准 · 未执行固件下发"
                : "SLA 按接入截止时间计算"}
          </span>
        </footer>
      </div>}
      {detail && selected && (
        <MaintenanceDetail
          key={JSON.stringify(detail)}
          row={selected}
          detail={detail}
          onClose={() => setDetail(null)}
          onOpenStation={onOpenStation}
        />
      )}
    </main>
  )
}
