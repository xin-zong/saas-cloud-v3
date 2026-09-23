import type { Station } from "@/App"
import { finite, operationsDate } from "./operations"

export type MaintenanceAlarm = {
  id: string
  title: string
  device: string
  category?: string
  severity: "critical" | "warning" | "info"
  status: "active" | "recovered"
  occurredAt?: string
  recoveredAt?: string
  acknowledged?: boolean
  slaDueAt?: string
  owner?: string
}
export type MaintenanceWorkOrder = {
  id: string
  title: string
  status: "pending" | "processing" | "completed" | "cancelled"
  createdAt?: string
  dueAt?: string
  owner?: string
  alarmId?: string
  description?: string
}
export type MaintenanceInspection = {
  id: string
  title: string
  dueAt: string
  status: "pending" | "completed" | "cancelled"
  owner?: string
  completedAt?: string
}
export type MaintenanceFirmware = {
  id: string
  device: string
  currentVersion: string
  targetVersion?: string
  status: "pending" | "running" | "succeeded" | "failed"
  updatedAt?: string
}
export type MaintenanceApproval = {
  id: string
  submittedAt: string
  type: "strategy" | "dispatch" | "permission" | "workOrder" | "device"
  title: string
  submitter: string
  reviewer?: string
  urgency: "normal" | "urgent"
  status: "pending" | "approved" | "rejected" | "withdrawn"
  stationId?: string
  change?: string
  note?: string
}
export type MaintenanceData = {
  source?: "demo" | "connected"
  updatedAt?: string
  alarms?: MaintenanceAlarm[]
  workOrders?: MaintenanceWorkOrder[]
  inspections?: MaintenanceInspection[]
  firmware?: MaintenanceFirmware[]
  approvals?: MaintenanceApproval[]
  health?: {
    score: number | null
    observedAt: string
  } | null
  communication?: {
    lastSeenAt?: string
    status?: "online" | "offline"
  } | null
}

export const MAINTENANCE_SEVERITY = {
  critical: { label: "严重", color: "#ae4852", fill: "#efc5c7" },
  warning: { label: "重要", color: "#a46b22", fill: "#e5c48e" },
  info: { label: "一般", color: "#647672", fill: "#b8c6c2" },
}
export const WORK_ORDER_STATUS = {
  pending: "待接单",
  processing: "处理中",
  completed: "已完成",
  cancelled: "已取消",
}
export const INSPECTION_STATUS = {
  pending: "待巡检",
  completed: "已完成",
  cancelled: "已取消",
}
export const FIRMWARE_STATUS = {
  pending: "待升级",
  running: "升级中",
  succeeded: "已完成",
  failed: "升级失败",
}
export function maintenanceTime(value?: string) {
  const stamp = value ? new Date(value).getTime() : NaN
  return Number.isFinite(stamp) ? stamp : null
}
const unique = <T extends { id: string }>(items: T[]) => [
  ...new Map(
    items.filter((item) => item?.id).map((item) => [item.id, item]),
  ).values(),
]
const knownTotal = (items: (number | null)[]) =>
  items.length && items.every(finite)
    ? items.reduce<number>((sum, item) => sum + item!, 0)
    : null

function demoMaintenance(station: Station, now: Date): MaintenanceData {
  if (station.status === "building")
    return {
      source: "demo",
      alarms: [],
      workOrders: [],
      inspections: [],
      firmware: [],
      approvals: [],
      health: null,
      communication: null,
    }
  const day = new Date(`${operationsDate(now)}T00:00:00`).getTime()
  const seed = [...station.id].reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  )
  const at = (minutes: number) =>
    new Date(now.getTime() + minutes * 60000).toISOString()
  const atDay = (minutes: number) =>
    new Date(day + minutes * 60000).toISOString()
  const labels = [
    ["BMS-01", "电池簇温差偏高"],
    ["PCS-01", "PCS 直流过压"],
    ["HVAC-01", "温控系统回风温度偏高"],
    ["MTR-01", "电表采集延迟"],
    ["FSS-01", "消防回路异常"],
  ]
  const alarms: MaintenanceAlarm[] = Array.from({ length: 20 }, (_, index) => {
    const [device, title] = labels[(index + seed) % labels.length]
    // Keep demo history inside the rolling window; future demo events make
    // the overview jump as the wall clock advances.
    const minute = -1500 + index * 70 + (seed % 17)
    return {
      id: `DEMO-EVT-${station.id}-${operationsDate(now)}-${index}`,
      title,
      device,
      category: "设备",
      severity:
        index % 7 === 0 ? "critical" : index % 3 === 0 ? "warning" : "info",
      occurredAt: at(minute),
      recoveredAt: at(minute + 45),
      status: "recovered",
      acknowledged: true,
      owner: station.manager,
    }
  })
  station.alerts.forEach((alert, index) =>
    alarms.push({
      id: `DEMO-ACT-${station.id}-${index}`,
      title: alert.msg,
      device: alert.msg.match(/[A-Z]+(?:-\d+)?/)?.[0] ?? "网关",
      category: alert.msg.includes("通讯") ? "通信" : "设备",
      severity: alert.level,
      status: "active",
      occurredAt: at(-30 - index * 17),
      acknowledged: false,
      slaDueAt: atDay(12 * 60 + 12 + index * 12),
      owner: station.manager,
    }),
  )
  const workOrders: MaintenanceWorkOrder[] = [
    {
      id: `WO-${2840 + seed}`,
      title:
        station.status === "offline" ? "站点通信链路排查" : "储能设备例行检修",
      status: "processing",
      createdAt: atDay(-180),
      dueAt: atDay(16 * 60),
      owner: station.manager,
      description: "示例工单，未连接工单执行系统。",
    },
    {
      id: `WO-${2940 + seed}`,
      title: "设备数据采集核验",
      status: "pending",
      createdAt: atDay(-60),
      dueAt: atDay(18 * 60),
      owner: station.manager,
    },
  ]
  const approvalTypes: MaintenanceApproval["type"][] = [
    "strategy",
    "dispatch",
    "permission",
    "workOrder",
    "strategy",
    "device",
    "dispatch",
    "workOrder",
  ]
  const approvalTitles = [
    "运行模式切换",
    "参与需求响应",
    "新增站点负责人",
    "2#电池室检修",
    "峰谷策略调整",
    "PCS 参数变更",
    "日前计划变更",
    "消防巡检复核",
  ]
  const approvals: MaintenanceApproval[] = approvalTitles.map(
    (title, index) => ({
      id: `REV-${String(4080 + seed + index).padStart(4, "0")}-0${(index % 8) + 1}`,
      submittedAt: atDay(8 * 60 - index * 37),
      type: approvalTypes[index],
      title,
      submitter:
        index % 3 === 0
          ? station.manager
          : index % 3 === 1
            ? "系统自动"
            : "运营中心",
      reviewer: index % 4 === 0 ? "周新岸" : undefined,
      urgency: index === 1 || index === 2 || index === 6 ? "urgent" : "normal",
      status:
        index < 4
          ? "pending"
          : index === 4
            ? "approved"
            : index === 5
              ? "rejected"
              : "approved",
      stationId: station.id,
      change:
        index % 2 === 0
          ? `${station.mode} → 需求响应`
          : `SoC: ${Math.round(station.soc)}% → ${Math.min(100, Math.round(station.soc + 6))}%；功率: ${Math.round(station.activePower)} → ${Math.round(station.activePower * 0.82)} kW`,
      note: index === 0 ? "切换前请确认站点负荷和备用容量。" : undefined,
    }),
  )
  return {
    source: "demo",
    updatedAt: now.toISOString(),
    alarms,
    workOrders,
    inspections: [
      {
        id: `INSP-${station.id}-1`,
        title: "储能舱安全巡检",
        dueAt: atDay(10 * 60),
        status: "completed",
        completedAt: atDay(9 * 60),
        owner: station.manager,
      },
      {
        id: `INSP-${station.id}-2`,
        title: "电气及消防日检",
        dueAt: atDay(17 * 60),
        status: "pending",
        owner: station.manager,
      },
    ],
    health: {
      score:
        station.status === "offline"
          ? 61
          : Math.max(
              0,
              98 - station.devices.fault * 6 - station.devices.offline * 2,
            ),
      observedAt: now.toISOString(),
    },
    communication: {
      lastSeenAt: new Date(
        now.getTime() - (station.status === "offline" ? 2 * 3600000 : 60000),
      ).toISOString(),
      status: station.status === "offline" ? "offline" : "online",
    },
    firmware: [
      {
        id: `FW-${station.id}`,
        device: "PCS-01",
        currentVersion: "V3.8.2",
        targetVersion: "V3.8.3",
        status: "pending",
        updatedAt: atDay(-300),
      },
    ],
    approvals,
  }
}

export function buildMaintenanceStation(station: Station, now = new Date()) {
  const input = station.maintenance
  const seed =
    input?.source === "demo" ? demoMaintenance(station, now) : undefined
  const source = { ...seed, ...input }
  // Explicit arrays, including empty arrays, always override the demo source.
  const alarmsKnown =
    input?.alarms !== undefined ||
    station.alarmHistory !== undefined ||
    source.alarms !== undefined
  const alarmInput =
    input?.alarms ?? station.alarmHistory ?? source.alarms ?? []
  const alarms = unique<MaintenanceAlarm>(alarmInput)
    .filter(
      (alarm) =>
        ["critical", "warning", "info"].includes(alarm.severity) &&
        ["active", "recovered"].includes(alarm.status) &&
        (alarm.occurredAt === undefined ||
          (maintenanceTime(alarm.occurredAt) !== null &&
            maintenanceTime(alarm.occurredAt)! <= now.getTime())),
    )
    .map((alarm) => ({
      ...alarm,
      status:
        alarm.status === "recovered" &&
        maintenanceTime(alarm.recoveredAt) !== null &&
        maintenanceTime(alarm.recoveredAt)! > now.getTime()
          ? "active" as const
          : alarm.status,
    }))
  const active = alarms.filter((alarm) => alarm.status === "active")
  const workOrders = unique(source.workOrders ?? []).filter(
    (order) =>
      order.status in WORK_ORDER_STATUS &&
      (!order.createdAt ||
        (maintenanceTime(order.createdAt) !== null &&
          maintenanceTime(order.createdAt)! <= now.getTime())),
  )
  const openOrders = workOrders.filter((order) =>
    ["pending", "processing"].includes(order.status),
  )
  const inspections = unique(source.inspections ?? [])
    .filter(
      (item) =>
        maintenanceTime(item.dueAt) !== null &&
        item.status in INSPECTION_STATUS,
    )
    .map((item) => ({
      ...item,
      status:
        item.status === "completed" &&
        maintenanceTime(item.completedAt) !== null &&
        maintenanceTime(item.completedAt)! > now.getTime()
          ? "pending" as const
          : item.status,
    }))
  const todayInspections = inspections.filter(
    (item) =>
      operationsDate(new Date(item.dueAt)) === operationsDate(now) &&
      item.status !== "cancelled",
  )
  const healthTime = maintenanceTime(source.health?.observedAt)
  const health =
    finite(source.health?.score) &&
    source.health.score >= 0 &&
    source.health.score <= 100 &&
    healthTime !== null &&
    healthTime <= now.getTime() &&
    now.getTime() - healthTime <= 86400000
      ? source.health.score
      : null
  const lastSeen = maintenanceTime(source.communication?.lastSeenAt)
  const validLastSeen =
    lastSeen !== null && lastSeen <= now.getTime() ? lastSeen : null
  const communication =
    source.communication?.status === "offline"
      ? "offline"
      : validLastSeen !== null
        ? now.getTime() - validLastSeen > 900000
          ? "offline"
          : "online"
        : null
  const dueDates = [
    ...active.map((alarm) => maintenanceTime(alarm.slaDueAt)),
    ...openOrders.map((order) => maintenanceTime(order.dueAt)),
  ].filter(finite)
  const critical = active.filter(
    (alarm) => alarm.severity === "critical",
  ).length
  const unacknowledged =
    active.every((alarm) => typeof alarm.acknowledged === "boolean") &&
    alarmsKnown
      ? active.filter((alarm) => !alarm.acknowledged).length
      : null
  const earliestSla = dueDates.length ? Math.min(...dueDates) : null
  return {
    station,
    alarms,
    active,
    alarmsKnown,
    workOrders,
    openOrders,
    ordersKnown: source.workOrders !== undefined,
    inspections,
    todayInspections,
    inspectionsKnown: source.inspections !== undefined,
    firmware: unique(source.firmware ?? []).filter(
      (item) => item.status in FIRMWARE_STATUS,
    ),
    firmwareKnown: source.firmware !== undefined,
    approvals: unique(source.approvals ?? []).filter(
      (item) =>
        item.status in
          { pending: "", approved: "", rejected: "", withdrawn: "" } &&
        maintenanceTime(item.submittedAt) !== null &&
        maintenanceTime(item.submittedAt)! <= now.getTime(),
    ),
    health,
    healthObservedAt: source.health?.observedAt,
    communication,
    lastSeen: validLastSeen,
    critical,
    unacknowledged,
    earliestSla,
    attention:
      active.length > 0 ||
      openOrders.length > 0 ||
      todayInspections.some((item) => item.status === "pending") ||
      communication === "offline" ||
      (health !== null && health < 80),
    demo: input?.source === "demo",
    updatedAt: maintenanceTime(source.updatedAt),
  }
}
export type MaintenanceStation = ReturnType<typeof buildMaintenanceStation>

export function maintenanceSummary(
  rows: MaintenanceStation[],
  now = new Date(),
) {
  const pendingAges = rows
    .flatMap((row) =>
      row.active
        .filter((alarm) => alarm.acknowledged === false)
        .map((alarm) => maintenanceTime(alarm.occurredAt)),
    )
    .filter(finite)
    .map((stamp) => Math.max(0, (now.getTime() - stamp) / 60000))
  const dueToday = knownTotal(
    rows.map((row) =>
      row.inspectionsKnown ? row.todayInspections.length : null,
    ),
  )
  const completedToday = knownTotal(
    rows.map((row) =>
      row.inspectionsKnown
        ? row.todayInspections.filter((item) => item.status === "completed")
            .length
        : null,
    ),
  )
  return {
    critical: knownTotal(
      rows.map((row) => (row.alarmsKnown ? row.critical : null)),
    ),
    criticalStations: rows.filter((row) => row.critical > 0).length,
    unacknowledged: knownTotal(rows.map((row) => row.unacknowledged)),
    oldestUnacknowledged: pendingAges.length ? Math.max(...pendingAges) : null,
    openOrders: knownTotal(
      rows.map((row) => (row.ordersKnown ? row.openOrders.length : null)),
    ),
    nearDeadline: rows
      .flatMap((row) => row.openOrders)
      .filter((order) => {
        const due = maintenanceTime(order.dueAt)
        return due !== null && due - now.getTime() <= 3600000
      }).length,
    dueToday,
    completedToday,
    communication: knownTotal(
      rows.map((row) =>
        row.communication === null
          ? null
          : Number(row.communication === "offline"),
      ),
    ),
    healthCovered: rows.filter((row) => row.health !== null).length,
    total: rows.length,
  }
}
export function maintenanceTrend(rows: MaintenanceStation[], now = new Date()) {
  const start = now.getTime() - 86400000
  const known = rows.filter((row) => row.alarmsKnown)
  const bins = Array.from({ length: 12 }, (_, index) => ({
    time: start + index * 7200000,
    critical: 0,
    warning: 0,
    info: 0,
  }))
  const devices = new Map<string, number>([
    ["BMS", 0],
    ["PCS", 0],
    ["温控", 0],
    ["电表", 0],
    ["消防", 0],
  ])
  known
    .flatMap((row) => row.alarms)
    .forEach((alarm) => {
      const stamp = maintenanceTime(alarm.occurredAt)
      if (stamp === null || stamp < start || stamp > now.getTime()) return
      bins[Math.min(11, Math.floor((stamp - start) / 7200000))][
        alarm.severity
      ]++
      const name = /BMS|BESS|RACK/i.test(alarm.device)
        ? "BMS"
        : /PCS/i.test(alarm.device)
          ? "PCS"
          : /HVAC|温控/i.test(alarm.device)
            ? "温控"
            : /MTR|电表/i.test(alarm.device)
              ? "电表"
              : /FSS|消防/i.test(alarm.device)
                ? "消防"
                : "其他"
      devices.set(name, (devices.get(name) ?? 0) + 1)
    })
  const counts = { critical: 0, warning: 0, info: 0 }
  bins.forEach((bin) => {
    counts.critical += bin.critical
    counts.warning += bin.warning
    counts.info += bin.info
  })
  const peak = bins.reduce(
    (best, bin) =>
      bin.critical + bin.warning + bin.info >
      best.critical + best.warning + best.info
        ? bin
        : best,
    bins[0],
  )
  return {
    bins,
    counts,
    devices: [...devices]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    covered: known.length,
    total: counts.critical + counts.warning + counts.info,
    peak,
  }
}
export type MaintenanceQueueItem = {
  key: string
  station: Station
  title: string
  kind: "alarm" | "order"
  id: string
  severity: "critical" | "warning" | "info" | "order"
  dueAt: number | null
  owner: string
}
export function maintenanceQueue(rows: MaintenanceStation[], risk: string) {
  const items: MaintenanceQueueItem[] = rows.flatMap((row) => [
    ...row.active.map((alarm) => ({
      key: JSON.stringify([row.station.id, "alarm", alarm.id]),
      station: row.station,
      title: alarm.title.includes(alarm.device)
        ? alarm.title
        : `${alarm.device} · ${alarm.title}`,
      kind: "alarm" as const,
      id: alarm.id,
      severity: alarm.severity,
      dueAt: maintenanceTime(alarm.slaDueAt),
      owner: alarm.owner || row.station.manager,
    })),
    ...row.openOrders.map((order) => ({
      key: JSON.stringify([row.station.id, "order", order.id]),
      station: row.station,
      title: `${order.id} ${order.title}`,
      kind: "order" as const,
      id: order.id,
      severity: "order" as const,
      dueAt: maintenanceTime(order.dueAt),
      owner: order.owner || row.station.manager,
    })),
  ])
  const rank = { critical: 0, warning: 1, order: 2, info: 3 }
  return items.sort((a, b) =>
    risk === "sla"
      ? (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) ||
        rank[a.severity] - rank[b.severity]
      : rank[a.severity] - rank[b.severity] ||
        (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity),
  )
}
