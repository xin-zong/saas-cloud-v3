import EmsPanel from "./EmsPanel"
import { hasStationPermission } from "@/auth/apiPermissions"
import { DEMO_MODE, send, api, allRows, type ApiRow } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import {type RegisterLeaveGuard} from './useEditorLeaveGuard'
import {WorkHandling, WorkflowConfirm, useWorkflowLeave, workflowKey, LocalWorkflowFields} from './work-orders/WorkflowEditor'
import {TaskWorkbench} from './work-orders/TaskWorkbench'
import {WorkflowFilters,matchesWorkflowFilters,orderFilters,approvalFilters,todoFilters,type WorkflowFilterValues} from './work-orders/WorkflowFilters'
import {
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  Plus,
  Search,
  X,
} from "lucide-react"
import type { Station } from "@/App"
import { ROLE_CONFIG, type UserRole } from "@/auth/roles"
import { stationsDataNow } from "@/data/dataClock"
import { exportOperationsCsv } from "@/data/operations"
import {
  buildMaintenanceStation,
  maintenanceTime,
  type MaintenanceApproval,
  type MaintenanceInspection,
  type MaintenanceStation,
  type MaintenanceWorkOrder,
} from "@/data/stationMaintenance"
import "./operations-center.css"
import "./work-orders-approval.css"

type View = "工单中心" | "审批中心" | "我的待办"
type ReviewState = MaintenanceApproval["status"]
type ServerApproval = ApiRow & {
  id: number
  title: string
  submitted_at: string
  status: ReviewState
  submitter_id: number
  reviewer_id?: number | null
  station_id?: number | null
  station_name?: string | null
  requester_name?: string | null
  decider_name?: string | null
  plan_id?: number | null
  work_order_id?: number | null
  note?: string | null
}
type ServerMember = { id: number; display_name: string; account: string; enabled: boolean }
type WorkOrderState = MaintenanceWorkOrder["status"]
type InspectionState = MaintenanceInspection["status"] | "processing"
type Priority = "P1" | "P2" | "P3"
type StatusTone = "normal" | "warning" | "danger" | "muted"
type WorkOrderSource =
  | "人工"
  | "告警"
  | "巡检"
  | "维护"
  | "安装"
  | "调试"
  | "升级"
type DisplayWorkOrder = MaintenanceWorkOrder & {
  stationId?: string
  source?: WorkOrderSource
  device?: string
  priority?: Priority
  createdBy?: string
  updatedAt?: string
}
type LocalWorkOrder = DisplayWorkOrder & {
  stationId: string
  source: WorkOrderSource
  device: string
  priority: Priority
  createdBy: string
  updatedAt: string
}
type WorkOrderDraft = {
  stationId: string
  source: WorkOrderSource
  device: string
  priority: Priority
  title: string
  owner: string
  dueAt: string
  description: string
}
type InspectionDraft={stationId:string;title:string;dueAt:string;device?:string;priority?:string;description?:string}
type OrderOverride = {
  status: WorkOrderState
  updatedAt: string
  operator?: string
}
type InspectionOverride = {
  status: InspectionState
  updatedAt: string
  startedAt?: string
  completedAt?: string
  operator?: string
}
type DisplayInspection = Omit<MaintenanceInspection, "status"> & {
  status: InspectionState
  startedAt?: string
  completedAt?: string
  updatedAt?: string
  operator?: string
}
type TodoKind = "order" | "inspection" | "approval"
type TodoGroup = "pending" | "processing" | "done"
type TodoItem = {
  key: string
  kind: TodoKind
  sourceId: string
  typeLabel: string
  title: string
  row: MaintenanceStation
  device: string
  dueAt?: string
  statusLabel: string
  statusTone: StatusTone
  group: TodoGroup
  actionLabel: string
  order?: DisplayWorkOrder
  approval?: MaintenanceApproval
  inspection?: DisplayInspection
}
type DeadlineInfo = {
  label: string
  tone: StatusTone
}
const PAGE_TABS: View[] = ["工单中心", "审批中心", "我的待办"]
const OPERATOR_WORK_ORDER_SOURCE_OPTIONS: WorkOrderSource[] = [
  "人工",
  "告警",
  "巡检",
  "维护",
]
const INTEGRATOR_WORK_ORDER_SOURCE_OPTIONS: WorkOrderSource[] = [
  "安装",
  "调试",
  "升级",
  "维护",
]
const ALL_WORK_ORDER_SOURCE_OPTIONS = Array.from(
  new Set([
    ...OPERATOR_WORK_ORDER_SOURCE_OPTIONS,
    ...INTEGRATOR_WORK_ORDER_SOURCE_OPTIONS,
  ]),
)
const WORK_ORDER_PRIORITY_OPTIONS: Priority[] = ["P1", "P2", "P3"]
const WORK_ORDER_STATE_OPTIONS: WorkOrderState[] = [
  "pending",
  "processing",
  "completed",
  "cancelled",
]
const INSPECTION_STATE_OPTIONS: InspectionState[] = [
  "pending",
  "processing",
  "completed",
  "cancelled",
]
const PRIORITY_DUE_MINUTES: Record<Priority, number> = {
  P1: 30,
  P2: 120,
  P3: 480,
}
const COMMON_DEVICE_OPTIONS = [
  "PCS-01",
  "BMS-01",
  "电表端07",
  "网关",
  "消防回路",
  "温控系统",
]
const REVIEW_STATUS: Record<ReviewState, string> = {
  pending: "待审批",
  approved: "已通过",
  rejected: "已驳回",
  withdrawn: "已撤回",
}
const APPROVAL_TYPE_LABEL = {
  strategy: "策略发布",
  dispatch: "调度计划",
  permission: "权限申请",
  workOrder: "工单审批",
  device: "站点接入",
}
const TYPE_LABEL = {
  strategy: "策略发布",
  dispatch: "调度计划",
  permission: "权限变更",
  workOrder: "工单审批",
  device: "设备变更",
}
const URGENCY_LABEL = { normal: "普通", urgent: "紧急" }
const ORDER_DISPLAY_STATUS: Record<WorkOrderState, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  cancelled: "已取消",
}
const INSPECTION_DISPLAY_STATUS: Record<InspectionState, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已办结",
  cancelled: "已取消",
}
const NOTE_KEY = "enerlution-work-order-review-notes-v1"
const REVIEW_STATE_KEY = "enerlution-work-order-review-states-v1"
const LOCAL_ORDER_KEY = "enerlution-work-orders-local-v1"
const ORDER_OVERRIDE_KEY = "enerlution-work-order-overrides-v1"
const INSPECTION_OVERRIDE_KEY = "enerlution-inspection-overrides-v1"
const EMPTY_ORDER_DRAFT: WorkOrderDraft = {
  stationId: "",
  source: "人工",
  device: "PCS-01",
  priority: "P2",
  title: "",
  owner: "",
  dueAt: "",
  description: "",
}
const dateOnly = (value: Date) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
const defaultDateRange = (now = new Date()) => {
  const end = new Date(now)
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return { start: dateOnly(start), end: dateOnly(end) }
}
const dateTimeLocal = (value: Date) =>
  `${dateOnly(value)}T${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
const dateTime = (value?: string) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--"
const timeLabel = (value?: string) =>
  value
    ? new Date(value).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "--"
const compactDateLabel = (value?: string) => {
  const time = maintenanceTime(value)
  if (time === null) return "--"
  const date = new Date(time)
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${timeLabel(value)}`
}
const deadlineDateLabel = (value?: string, now = new Date()) => {
  const time = maintenanceTime(value)
  if (time === null) return "--"
  const date = new Date(time)
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dateOnly(date) === dateOnly(now)) return `今日 ${timeLabel(value)}`
  if (dateOnly(date) === dateOnly(tomorrow)) return `明日 ${timeLabel(value)}`
  return compactDateLabel(value)
}
const minutesAgo = (value?: string, now = Date.now()) => {
  const time = maintenanceTime(value)
  return time === null ? null : Math.max(0, Math.floor((now - time) / 60000))
}
const isOpenOrder = (status: WorkOrderState) =>
  status === "pending" || status === "processing"
const durationLabel = (minutes: number) => {
  const safe = Math.max(0, Math.floor(minutes))
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
}
const deadlineInfo = (
  dueAt: string | undefined,
  status: WorkOrderState,
  now = Date.now(),
): DeadlineInfo => {
  if (!isOpenOrder(status)) return { label: "—", tone: "muted" }
  const due = maintenanceTime(dueAt)
  if (due === null) return { label: "未设定", tone: "muted" }
  const minutes = Math.floor((due - now) / 60000)
  if (minutes < 0)
    return { label: `超时 ${durationLabel(Math.abs(minutes))}`, tone: "danger" }
  if (minutes <= 30) return { label: durationLabel(minutes), tone: "danger" }
  if (minutes <= 120) return { label: durationLabel(minutes), tone: "warning" }
  return { label: durationLabel(minutes), tone: "normal" }
}
const isOrderRisk = (order: MaintenanceWorkOrder, now = Date.now()) =>
  deadlineInfo(order.dueAt, order.status, now).tone === "danger"
const orderPriority = (order: DisplayWorkOrder, now = Date.now()): Priority => {
  if (order.priority) return order.priority
  const due = deadlineInfo(order.dueAt, order.status, now)
  if (due.tone === "danger") return "P1"
  if (order.status === "pending" || due.tone === "warning") return "P2"
  return "P3"
}
const approvalPriority = (
  approval: MaintenanceApproval,
  state: ReviewState = approval.status,
): Priority => {
  if (!DEMO_MODE) return "P3"
  if (approval.urgency === "urgent" && state === "pending") return "P1"
  if (state === "pending") return "P2"
  return "P3"
}
const approvalDeadlineInfo = (
  approval: MaintenanceApproval,
  state: ReviewState,
  now = Date.now(),
): DeadlineInfo => {
  if (!DEMO_MODE) return { label: "未设定", tone: "muted" }
  if (state !== "pending") return { label: "—", tone: "muted" }
  const elapsed = minutesAgo(approval.submittedAt, now)
  if (elapsed === null) return { label: "未设定", tone: "muted" }
  const limit = approval.urgency === "urgent" ? 30 : 120
  const remaining = limit - elapsed
  if (remaining < 0)
    return {
      label: `超时 ${durationLabel(Math.abs(remaining))}`,
      tone: "danger",
    }
  if (remaining <= 15)
    return { label: durationLabel(remaining), tone: "danger" }
  if (remaining <= 45)
    return { label: durationLabel(remaining), tone: "warning" }
  return { label: durationLabel(remaining), tone: "normal" }
}
const orderSource = (order: DisplayWorkOrder) => {
  if (!DEMO_MODE) return "服务器工单"
  if (order.source) return order.source
  if (order.alarmId) return "告警"
  if (/巡检/.test(order.title)) return "巡检"
  if (/检修|维护/.test(order.title)) return "维护"
  return "人工"
}
const orderDevice = (row: MaintenanceStation, order: DisplayWorkOrder) => {
  if (!DEMO_MODE) return order.device || "未关联设备"
  if (order.device) return order.device
  if (/通信|链路/.test(order.title)) return "网关"
  if (/采集|电表/.test(order.title)) return "电表端07"
  if (/电池|BMS/.test(order.title)) return "BMS-01"
  return row.active[0]?.device ?? "PCS-01"
}
const rowSearchText = (text: string, keyword: string) =>
  text.toLowerCase().includes(keyword.trim().toLowerCase())
const dueFromPriority = (priority: Priority, now = new Date()) => {
  const due = new Date(now.getTime() + PRIORITY_DUE_MINUTES[priority] * 60000)
  due.setSeconds(0, 0)
  return dateTimeLocal(due)
}
const defaultQuickFilter = (view: View) =>
  view === "我的待办" ? "pending" : "all"
const orderActionLabel = (status: WorkOrderState) => {
  if (status === "pending") return "开始处理"
  if (status === "processing") return "办结工单"
  return "查看详情"
}
const inspectionActionLabel = (status: InspectionState) => {
  if (status === "pending") return "开始巡检"
  if (status === "processing") return "完成巡检"
  return "查看详情"
}
const inspectionGroup = (status: InspectionState): TodoGroup =>
  status === "completed" || status === "cancelled"
    ? "done"
    : status === "processing"
      ? "processing"
      : "pending"
const inspectionTone = (
  inspection: DisplayInspection,
  now = Date.now(),
): StatusTone => {
  if (inspection.status === "completed" || inspection.status === "cancelled")
    return "muted"
  if (inspection.status === "processing") return "warning"
  const due = maintenanceTime(inspection.dueAt)
  return due !== null && due < now ? "danger" : "normal"
}
const stationName = (row: MaintenanceStation) =>
  row.station.shortName || row.station.name
const approvalCode = (approval: MaintenanceApproval) => {
  const digits = approval.id.replace(/\D/g, "")
  return `AP-${(digits.slice(-3) || approval.id).padStart(3, "0")}`
}
const approvalDueAt = (approval: MaintenanceApproval) => {
  const submitted = maintenanceTime(approval.submittedAt)
  if (submitted === null) return undefined
  const limit = approval.urgency === "urgent" ? 30 : 120
  return new Date(submitted + limit * 60000).toISOString()
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
const isWorkOrderSource = (value: unknown): value is WorkOrderSource =>
  typeof value === "string" &&
  ALL_WORK_ORDER_SOURCE_OPTIONS.includes(value as WorkOrderSource)
const isPriority = (value: unknown): value is Priority =>
  typeof value === "string" &&
  WORK_ORDER_PRIORITY_OPTIONS.includes(value as Priority)
const isWorkOrderState = (value: unknown): value is WorkOrderState =>
  typeof value === "string" &&
  WORK_ORDER_STATE_OPTIONS.includes(value as WorkOrderState)
const isInspectionState = (value: unknown): value is InspectionState =>
  typeof value === "string" &&
  INSPECTION_STATE_OPTIONS.includes(value as InspectionState)
const isReviewState = (value: unknown): value is ReviewState =>
  typeof value === "string" &&
  ["pending", "approved", "rejected", "withdrawn"].includes(value)
const readString = (value: unknown) => (typeof value === "string" ? value : "")
const storedRecord = <T,>(
  value: unknown,
  mapItem: (id: string, item: Record<string, unknown>) => T | null,
): Record<string, T> => {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, item]) => {
      if (!isRecord(item)) return []
      const next = mapItem(id, item)
      return next ? [[id, next]] : []
    }),
  )
}
const storedLocalOrders = (value: unknown): LocalWorkOrder[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const stationId = readString(item.stationId)
    const id = readString(item.id)
    const title = readString(item.title).trim()
    const dueAt = readString(item.dueAt)
    const createdAt = readString(item.createdAt)
    if (!stationId || !id || !title || maintenanceTime(createdAt) === null)
      return []
    const status = isWorkOrderState(item.status) ? item.status : "pending"
    return [
      {
        id,
        stationId,
        title,
        status,
        createdAt,
        dueAt: maintenanceTime(dueAt) === null ? undefined : dueAt,
        owner: readString(item.owner),
        alarmId: readString(item.alarmId) || undefined,
        description: readString(item.description),
        source: isWorkOrderSource(item.source) ? item.source : "人工",
        device: readString(item.device) || "PCS-01",
        priority: isPriority(item.priority) ? item.priority : "P2",
        createdBy: readString(item.createdBy) || "本地创建",
        updatedAt: readString(item.updatedAt) || createdAt,
      },
    ]
  })
}
const storedOrderOverrides = (value: unknown): Record<string, OrderOverride> =>
  storedRecord(value, (_id, item) => {
    if (!isWorkOrderState(item.status)) return null
    const updatedAt = readString(item.updatedAt)
    return {
      status: item.status,
      updatedAt:
        maintenanceTime(updatedAt) === null
          ? new Date().toISOString()
          : updatedAt,
      operator: readString(item.operator) || undefined,
    }
  })
const storedInspectionOverrides = (
  value: unknown,
): Record<string, InspectionOverride> =>
  storedRecord(value, (_id, item) => {
    if (!isInspectionState(item.status)) return null
    const updatedAt = readString(item.updatedAt)
    const startedAt = readString(item.startedAt)
    const completedAt = readString(item.completedAt)
    return {
      status: item.status,
      updatedAt:
        maintenanceTime(updatedAt) === null
          ? new Date().toISOString()
          : updatedAt,
      startedAt: maintenanceTime(startedAt) === null ? undefined : startedAt,
      completedAt:
        maintenanceTime(completedAt) === null ? undefined : completedAt,
      operator: readString(item.operator) || undefined,
    }
  })
const storedReviewStates = (value: unknown): Record<string, ReviewState> => {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, status]) =>
      isReviewState(status) ? [[id, status]] : [],
    ),
  )
}
const deviceOptionsForRow = (row?: MaintenanceStation) => [
  ...new Set([
    ...(row?.active.map((alarm) => alarm.device) ?? []),
    ...(row?.firmware.map((item) => item.device) ?? []),
    ...(DEMO_MODE ? COMMON_DEVICE_OPTIONS : (row?.station.deviceInventory?.map(device => device.name) ?? [])),
  ]),
]

function ReviewBadge({
  status,
  urgency,
}: {
  status: ReviewState
  urgency?: "normal" | "urgent"
}) {
  return (
    <span className={`work-order-badge work-order-status-${status}`}>
      <i />
      {REVIEW_STATUS[status]}
      {urgency === "urgent" && <b> · 紧急</b>}
    </span>
  )
}
function OrderStatus({
  status,
  risk = false,
}: {
  status: WorkOrderState
  risk?: boolean
}) {
  const key = risk ? "risk" : status
  return (
    <span className={`work-order-badge work-order-order-${key}`}>
      <i />
      {risk ? "超时风险" : ORDER_DISPLAY_STATUS[status]}
    </span>
  )
}
function StatusChip({
  label,
  count,
  active,
  tone = "neutral",
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  tone?: "neutral" | "danger"
  onClick: () => void
}) {
  return (
    <button
      className={`work-orders-chip work-orders-chip--${tone}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
      {typeof count === "number" ? ` ${count}` : ""}
    </button>
  )
}
function Stat({
  priority,
  total,
  active,
  risk,
}: {
  priority: Priority
  total: number
  active: number
  risk: number
}) {
  const ratio = total ? Math.round((risk / total) * 100) : 0
  return (
    <div
      className={`work-order-stat work-order-stat--${priority.toLowerCase()}`}
    >
      <span>{priority}</span>
      <strong>
        {active} <em>/</em> {total}
      </strong>
      <small>{ratio}% 临近超时</small>
    </div>
  )
}

export default function WorkOrdersApprovalPage({
  registerLeaveGuard,
  stations,
  onServerChange,
  initialFocus,
  initialView,
  allowedViews = PAGE_TABS,
  role = "operator",
}: {
  registerLeaveGuard?: RegisterLeaveGuard
  stations: Station[]
  onServerChange?: () => void
  initialFocus?: {
    stationId: string
    orderId?: string
  } | null
  initialView?: View
  allowedViews?: readonly View[]
  role?: UserRole
}) {
  const { user } = useAuth()
  const storageScope=(key:string)=>`${key}:${DEMO_MODE?'demo':'api'}:${user?.id||role}`
  const [serverBusy, setServerBusy] = useState(false)
  const initialNow = DEMO_MODE ? stationsDataNow(stations) : new Date()
  const requestedInitialView: View = initialFocus?.orderId
    ? "工单中心"
    : (initialView ?? "工单中心")
  const visibleViews = PAGE_TABS.filter((item) => allowedViews.includes(item))
  const initialVisibleView = visibleViews.includes(requestedInitialView)
    ? requestedInitialView
    : (visibleViews[0] ?? "工单中心")
  const [view, setView] = useState<View>(initialVisibleView)
  useEffect(() => {if (!visibleViews.includes(view)) setView(visibleViews[0] ?? "工单中心")}, [view, visibleViews.join("|")])
  const [now, setNow] = useState(() => initialNow)
  const [range, setRange] = useState(() => defaultDateRange(initialNow))
  const [scope, setScope] = useState(initialFocus?.stationId ?? "")
  const [type, setType] = useState("")
  const [status, setStatus] = useState("")
  const [submitter, setSubmitter] = useState("")
  const [search, setSearch] = useState("")
  const [quickFilter, setQuickFilter] = useState(() =>
    defaultQuickFilter(initialVisibleView),
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [repairQueue,setRepairQueue]=useState(false)
  const [extendedFilters,setExtendedFilters]=useState<WorkflowFilterValues>({})
  const [selectedKey, setSelectedKey] = useState("")
  const [orderDetailKey, setOrderDetailKey] = useState("")
  const [inspectionDetailKey, setInspectionDetailKey] = useState("")
  const [localOrders, setLocalOrders] = useState<LocalWorkOrder[]>([])
  const [orderOverrides, setOrderOverrides] =
    useState<Record<string, OrderOverride>>({})
  const [inspectionOverrides, setInspectionOverrides] =
    useState<Record<string, InspectionOverride>>({})
  const [createOpen, setCreateOpen] = useState(false)
  const [inspectionCreateOpen, setInspectionCreateOpen] = useState(false)
  const [inspectionDraft, setInspectionDraft] = useState<InspectionDraft>({stationId:"", title:"", dueAt:""})
  const [inspectionCreateError, setInspectionCreateError] = useState("")
  const [orderDraft, setOrderDraft] =
    useState<WorkOrderDraft>(EMPTY_ORDER_DRAFT)
  const [createError, setCreateError] = useState("")
  const [reviewStates, setReviewStates] = useState<Record<string, ReviewState>>(
    {},
  )
  const [reviewNote, setReviewNote] = useState("")
  const [serverApprovals, setServerApprovals] = useState<ServerApproval[]>([])
  const [members, setMembers] = useState<ServerMember[]>([])
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [approvalError, setApprovalError] = useState("")
  const [notice, setNotice] = useState("")
  const [fieldNotice,setFieldNotice]=useState('')
  const [toolsOpen,setToolsOpen]=useState(false)
  const [createDirty,setCreateDirty]=useState(false)
  const [noteDirty,setNoteDirty]=useState(false)
  const noteBaseline=useRef('')
  const childGuard=useRef<null|(()=>Promise<boolean>)>(null)
  const registerChildGuard=useCallback<RegisterLeaveGuard>(guard=>{childGuard.current=guard},[])
  const parentGuard=useRef<null|(()=>Promise<boolean>)>(null)
  const registerParentGuard=useCallback<RegisterLeaveGuard>(guard=>{parentGuard.current=guard},[])
  const requestLeave=useCallback(async()=>{if(childGuard.current&&!(await childGuard.current()))return false;return parentGuard.current?.()??true},[])
  useEffect(()=>{registerLeaveGuard?.(requestLeave);return()=>registerLeaveGuard?.(null)},[registerLeaveGuard,requestLeave])
  const discardForms=()=>{setCreateDirty(false);setNoteDirty(false);setOrderDraft(EMPTY_ORDER_DRAFT);setInspectionDraft({stationId:'',title:'',dueAt:''});setReviewNote(noteBaseline.current)}
  const leave=useWorkflowLeave(createDirty||noteDirty,registerParentGuard,discardForms,user?.id||'')
  const go=(action:()=>void)=>{void requestLeave().then(ok=>{if(ok)action()})}
  const canReview = DEMO_MODE || Boolean(user?.permissions.includes("approval.review"))
  const currentActor = DEMO_MODE ? (role === "integrator" ? "林启明" : "陈明") : (user?.id ?? "")
  const workOrderSourceOptions =
    role === "integrator"
      ? INTEGRATOR_WORK_ORDER_SOURCE_OPTIONS
      : OPERATOR_WORK_ORDER_SOURCE_OPTIONS
  const rows = useMemo(
    () =>
      stations
        .filter((station) => station.status !== "building" && (DEMO_MODE || ['workorder.read','workorder.create','inspection.manage','approval.read','strategy.manage'].some(permission=>hasStationPermission(user,station.id,permission))))
        .map((station) => buildMaintenanceStation(station, now)),
    [stations, now, user],
  )
  const canAt = (id: string, permission: string) => DEMO_MODE || hasStationPermission(user, id, permission)
  const createRows = rows.filter(row => canAt(row.station.id, "workorder.create"))
  const inspectionRows = rows.filter(row => canAt(row.station.id, "inspection.manage"))
  const capabilityIdentity=JSON.stringify([user?.permissions,user?.stationPermissions,rows.map(r=>r.station.id)])
  useEffect(()=>{
    if(createOpen&&!createRows.some(r=>r.station.id===orderDraft.stationId)){leave.cancelPending();discardForms();setCreateOpen(false)}
    if(inspectionCreateOpen&&!inspectionRows.some(r=>r.station.id===inspectionDraft.stationId)){leave.cancelPending();discardForms();setInspectionCreateOpen(false)}
    if(scope&&!rows.some(r=>r.station.id===scope))setScope('')
    const approval=serverApprovals.find(item=>String(item.id)===selectedKey)
    if(approval&&!DEMO_MODE&&(!canAt(String(approval.station_id),'approval.review')||(!canAt(String(approval.station_id),'approval.read')&&approval.submitter_id!==Number(user?.id)))){leave.cancelPending();setReviewNote('');setNoteDirty(false);setSelectedKey('')}
  },[capabilityIdentity])
  const allApprovals = DEMO_MODE
    ? rows.flatMap((row) => row.approvals.map((approval) => ({ row, approval })))
    : serverApprovals.flatMap((item) => {
        const row = rows.find((candidate) => candidate.station.id === String(item.station_id))
        if (!row || (!canAt(row.station.id,'approval.read') && item.submitter_id!==Number(user?.id))) return []
        const approval: MaintenanceApproval = {
          id: String(item.id),
          submittedAt: item.submitted_at,
          type: item.plan_id != null ? "strategy" : "workOrder",
          title: item.title,
          submitter: item.requester_name || String(item.submitter_id),
          reviewer: item.decider_name || (item.reviewer_id == null ? undefined : String(item.reviewer_id)),
          urgency: "normal",
          status: item.status,
          stationId: String(item.station_id),
          change: item.plan_id != null ? `计划 #${item.plan_id}` : `工单 #${item.work_order_id}`,
          note: item.note || undefined,
        }
        return [{row, approval}]
      })
  const allInspections = rows.filter(row=>canAt(row.station.id,'inspection.manage')).flatMap((row) =>
    row.inspections.map(
      (inspection): {
        row: MaintenanceStation
        inspection: DisplayInspection
      } => {
        const override = inspectionOverrides[inspection.id]
        return {
          row,
          inspection: {
            ...inspection,
            status: override?.status ?? inspection.status,
            startedAt: override?.startedAt,
            completedAt: override?.completedAt ?? inspection.completedAt,
            updatedAt: override?.updatedAt,
            operator: override?.operator,
          },
        }
      },
    ),
  )
  const allOrders = rows.filter(row=>canAt(row.station.id,'workorder.read')).flatMap((row) => {
    const stationOrders: DisplayWorkOrder[] = [
      ...localOrders.filter((order) => order.stationId === row.station.id),
      ...row.workOrders,
    ]
    return stationOrders.map((order) => {
      const override = orderOverrides[order.id]
      return {
        row,
        order: {
          ...order,
          status: override?.status ?? order.status,
          updatedAt: override?.updatedAt ?? order.updatedAt,
        },
      }
    })
  })
  const getReviewState = (approval: MaintenanceApproval) =>
    reviewStates[approval.id] ?? approval.status
  const inRange = (value?: string) => {
    const time = maintenanceTime(value)
    return (
      time !== null &&
      dateOnly(new Date(time)) >= range.start &&
      dateOnly(new Date(time)) <= range.end
    )
  }
  const nowTime = now.getTime()
  const keyword = search.trim()
  const orderBase = allOrders.filter(
    ({ row, order }) =>
      matchesWorkflowFilters(view==='工单中心'?extendedFilters:{},{站点:row.station.name,设备:orderDevice(row,order),工单类型:orderSource(order),状态:ORDER_DISPLAY_STATUS[order.status],负责人:order.owner,优先级:DEMO_MODE?orderPriority(order,nowTime):undefined,来源:orderSource(order),创建人:order.createdBy,创建时间:order.createdAt,完成期限:order.dueAt,是否超时:isOrderRisk(order,nowTime)?'是':'否'})&&
      inRange(order.createdAt) &&
      (!scope || row.station.id === scope) &&
      rowSearchText(
        `${order.id} ${order.title} ${row.station.name} ${row.station.code} ${order.owner} ${orderSource(order)} ${orderDevice(row, order)} ${order.description ?? ""}`,
        keyword,
      ),
  )
  const approvalBase = allApprovals.filter(
    ({ row, approval }) =>
      matchesWorkflowFilters(view==='审批中心'?extendedFilters:{},{审批类型:APPROVAL_TYPE_LABEL[approval.type],审批状态:REVIEW_STATUS[getReviewState(approval)],关联站点:row.station.name,申请人:approval.submitter,当前审批人:approval.reviewer,申请时间:approval.submittedAt})&&
      inRange(approval.submittedAt) &&
      (!scope || row.station.id === scope) &&
      (view === "我的待办" || !type || approval.type === type) &&
      (!submitter || approval.submitter === submitter) &&
      rowSearchText(
        `${approval.id} ${approvalCode(approval)} ${approval.title} ${approval.submitter} ${row.station.name} ${row.station.code} ${APPROVAL_TYPE_LABEL[approval.type]}`,
        keyword,
      ),
  )
  const orders = orderBase.filter(({ order }) => {
    if (view === "我的待办" && !isOpenOrder(order.status)) return false
    if (status && order.status !== status) return false
    if (quickFilter === "pending") return order.status === "pending"
    if (quickFilter === "processing") return order.status === "processing"
    if (quickFilter === "risk") return isOrderRisk(order, nowTime)
    return true
  })
  const approvals = approvalBase.filter(({ approval }) => {
    const reviewState = getReviewState(approval)
    if (status && reviewState !== status) return false
    if (quickFilter === "pending") return reviewState === "pending"
    if (quickFilter === "finished") return reviewState !== "pending"
    if (quickFilter === "approved") return reviewState === "approved"
    if (quickFilter === "risk")
      return approval.urgency === "urgent" && reviewState === "pending"
    return true
  })
  const pendingOrders = orderBase.filter(
    ({ order }) => order.status === "pending",
  )
  const processingOrders = orderBase.filter(
    ({ order }) => order.status === "processing",
  )
  const riskOrders = orderBase.filter(({ order }) =>
    isOrderRisk(order, nowTime),
  )
  const todoBase = [
    ...allOrders
      .filter(
        ({ row, order }) =>
          (inRange(order.dueAt ?? order.createdAt) ||
            inRange(order.createdAt)) &&
          (DEMO_MODE || order.owner === user?.id) &&
          (!scope || row.station.id === scope),
      )
      .map<TodoItem>(({ row, order }) => {
        const risk = isOrderRisk(order, nowTime)
        const done =
          order.status === "completed" || order.status === "cancelled"
        const processing = order.status === "processing"
        return {
          key: `order:${row.station.id}:${order.id}`,
          kind: "order",
          sourceId: order.id,
          typeLabel: "工单",
          title: order.title,
          row,
          device: orderDevice(row, order),
          dueAt: order.dueAt,
          statusLabel: risk ? "超时风险" : ORDER_DISPLAY_STATUS[order.status],
          statusTone: risk
            ? "danger"
            : processing
              ? "warning"
              : done
                ? "muted"
                : "normal",
          group: done ? "done" : processing ? "processing" : "pending",
          actionLabel: orderActionLabel(order.status),
          order,
        }
      }),
    ...((DEMO_MODE ? role === "operator" : user?.permissions.includes("inspection.manage"))
      ? allInspections
          .filter(
            ({ row, inspection }) =>
              inRange(inspection.dueAt) &&
              (DEMO_MODE || inspection.owner === user?.id) &&
              (DEMO_MODE ? inspection.status !== "cancelled" : true) &&
              (!scope || row.station.id === scope),
          )
          .map<TodoItem>(({ row, inspection }) => {
            const tone = inspectionTone(inspection, nowTime)
            const statusLabel =
              tone === "danger"
                ? "逾期待处理"
                : INSPECTION_DISPLAY_STATUS[inspection.status]
            return {
              key: `inspection:${row.station.id}:${inspection.id}`,
              kind: "inspection",
              sourceId: inspection.id,
              typeLabel: "巡检",
              title: inspection.title,
              row,
              device: "-",
              dueAt: inspection.dueAt,
              statusLabel,
              statusTone: tone,
              group: inspectionGroup(inspection.status),
              actionLabel: inspectionActionLabel(inspection.status),
              inspection,
            }
          })
      : []),
    ...(!DEMO_MODE && canReview ? allApprovals.filter(({approval}) => approval.status === "pending" && serverApprovals.find(item => String(item.id) === approval.id)?.submitter_id !== Number(user?.id)).map<TodoItem>(({row, approval}) => ({
      key: `approval:${approval.id}`, kind: "approval", sourceId: approval.id,
      typeLabel: "审批", title: approval.title, row, device: "-",
      dueAt: approval.submittedAt, statusLabel: "待审批", statusTone: "normal",
      group: "pending", actionLabel: "办理审批", approval,
    })) : []),
  ].filter((item) => {
    if(view==='我的待办'&&!matchesWorkflowFilters(extendedFilters,{事项类型:item.typeLabel,处理状态:item.statusLabel,关联站点:item.row.station.name,优先级:DEMO_MODE&&item.order?orderPriority(item.order,nowTime):undefined,发起人:item.approval?.submitter,创建时间:item.order?.createdAt||item.approval?.submittedAt,截止时间:item.dueAt,是否超时:item.dueAt&&Date.parse(item.dueAt)<nowTime?'是':'否'}))return false
    if (
      !rowSearchText(
        `${item.sourceId} ${item.typeLabel} ${item.title} ${stationName(item.row)} ${item.row.station.name} ${item.device}`,
        keyword,
      )
    )
      return false
    if (view === "我的待办" && type) return item.kind === type
    return true
  })
  const todos = todoBase
    .filter((item) => {
      if (status) return item.group === status || item.statusLabel === status
      if (quickFilter === "pending") return item.group === "pending"
      if (quickFilter === "processing") return item.group === "processing"
      if (quickFilter === "done") return item.group === "done"
      return true
    })
    .sort((a, b) => {
      const aDue = maintenanceTime(a.dueAt) ?? Infinity
      const bDue = maintenanceTime(b.dueAt) ?? Infinity
      return aDue - bDue
    })
  const pendingTodos = todoBase.filter((item) => item.group === "pending")
  const processingTodos = todoBase.filter((item) => item.group === "processing")
  const doneTodos = todoBase.filter((item) => item.group === "done")
  const selectedApproval =
    selectedKey === "closed" || view === "工单中心"
      ? undefined
      : (approvals.find(({ approval }) => approval.id === selectedKey) ??
        approvalBase.find(({ approval }) => approval.id === selectedKey) ??
        allApprovals.find(({ approval }) => approval.id === selectedKey))
  const selectedOrder = orders.find(({ order }) => order.id === selectedKey)
  const selectedRow = selectedApproval?.row ?? selectedOrder?.row
  const [serverEvents, setServerEvents] = useState<ApiRow[]>([])
  useEffect(() => {
    setServerEvents([])
    if (DEMO_MODE || !orderDetailKey || !allOrders.some(item=>item.order.id===orderDetailKey)) return
    const controller = new AbortController()
    api<ApiRow[]>(`/work-orders/${orderDetailKey}/events`, {signal: controller.signal}).then(setServerEvents).catch(error => {if (!controller.signal.aborted) setNotice(error.message)})
    return () => controller.abort()
  }, [orderDetailKey, stations, capabilityIdentity])
  useEffect(() => {
    if (DEMO_MODE || !user || !user.permissions.some(code => ["approval.read", "strategy.manage"].includes(code))) return
    let active = true
    setApprovalLoading(true)
    allRows<ServerApproval>("/approvals")
      .then((items) => { if (active) { setServerApprovals(items); setApprovalError("") } })
      .catch((error) => { if (active) setApprovalError(error instanceof Error ? error.message : "审批列表加载失败") })
      .finally(() => { if (active) setApprovalLoading(false) })
    return () => { active = false }
  }, [user?.id, stations])
  useEffect(() => {
    if (DEMO_MODE || !user?.permissions.includes("organization.member.read")) return
    let active = true
    api<ServerMember[]>("/members").then(items => { if (active) setMembers(items.filter(item => item.enabled)) }).catch(() => { if (active) setMembers([]) })
    return () => { active = false }
  }, [user?.id, user?.permissions])
  const detailOrder = allOrders.find(({ order }) => order.id === orderDetailKey)
  const detailInspection = allInspections.find(
    ({ inspection }) => inspection.id === inspectionDetailKey,
  )
  useEffect(() => {
    setNow(DEMO_MODE ? stationsDataNow(stations) : new Date())
    const timer = window.setInterval(() => setNow(DEMO_MODE ? stationsDataNow(stations) : new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [stations])
  useEffect(() => {
    if (!DEMO_MODE) return
    try {
      setLocalOrders(
        storedLocalOrders(
          JSON.parse(localStorage.getItem(storageScope(LOCAL_ORDER_KEY)) ?? "[]"),
        ),
      )
      setOrderOverrides(
        storedOrderOverrides(
          JSON.parse(localStorage.getItem(storageScope(ORDER_OVERRIDE_KEY)) ?? "{}"),
        ),
      )
      setInspectionOverrides(
        storedInspectionOverrides(
          JSON.parse(localStorage.getItem(storageScope(INSPECTION_OVERRIDE_KEY)) ?? "{}"),
        ),
      )
      setReviewStates(
        storedReviewStates(
          JSON.parse(localStorage.getItem(storageScope(REVIEW_STATE_KEY)) ?? "{}"),
        ),
      )
    } catch {
      setLocalOrders([])
      setOrderOverrides({})
      setInspectionOverrides({})
      setReviewStates({})
    }
  }, [])
  useEffect(() => {
    const item = selectedApproval?.approval
    if (!item) {
      setReviewNote("")
      return
    }
    setNoteDirty(false)
    if (!DEMO_MODE) { noteBaseline.current=item.note??''; setReviewNote(item.note ?? ""); return }
    try {
      const saved = JSON.parse(localStorage.getItem(storageScope(NOTE_KEY)) ?? "{}")
      noteBaseline.current=typeof saved[item.id]?.note==='string'?saved[item.id].note:(item.note??'')
      setReviewNote(
        typeof saved[item.id]?.note === "string"
          ? saved[item.id].note
          : (item.note ?? ""),
      )
    } catch {
      setReviewNote(item.note ?? "")
    }
  }, [selectedApproval?.approval?.id])
  useEffect(() => {
    if (!initialFocus?.orderId) return
    setView("工单中心")
    setQuickFilter("all")
    setSelectedKey(initialFocus.orderId)
  }, [initialFocus?.orderId])
  function persistLocalOrders(next: LocalWorkOrder[]) {
    localStorage.setItem(storageScope(LOCAL_ORDER_KEY), JSON.stringify(next))
  }
  function persistOrderOverrides(next: Record<string, OrderOverride>) {
    localStorage.setItem(storageScope(ORDER_OVERRIDE_KEY), JSON.stringify(next))
  }
  function persistInspectionOverrides(
    next: Record<string, InspectionOverride>,
  ) {
    localStorage.setItem(storageScope(INSPECTION_OVERRIDE_KEY), JSON.stringify(next))
  }
  function persistReviewStates(next: Record<string, ReviewState>) {
    localStorage.setItem(storageScope(REVIEW_STATE_KEY), JSON.stringify(next))
  }
  function reset() {
    setExtendedFilters({})
    setScope("")
    setType("")
    setStatus("")
    setSubmitter("")
    setSearch("")
    setRange(defaultDateRange(now))
    setQuickFilter(defaultQuickFilter(view))
    setSelectedKey("")
    setOrderDetailKey("")
    setInspectionDetailKey("")
    setNotice("筛选条件已重置")
  }
  function buildOrderDraft(row?: MaintenanceStation) {
    const selectedRow =
      row ?? createRows.find((item) => item.station.id === scope) ?? createRows[0]
    return {
      ...EMPTY_ORDER_DRAFT,
      stationId: selectedRow?.station.id ?? "",
      owner: DEMO_MODE ? (selectedRow?.station.manager ?? "") : (hasStationPermission(user, selectedRow?.station.id, "workorder.handle") ? user?.id ?? "" : ""),
      device: deviceOptionsForRow(selectedRow)[0] ?? (DEMO_MODE ? "PCS-01" : ""),
      dueAt: dueFromPriority("P2", now),
    }
  }
  function openCreateDialog() {
    setCreateDirty(false)
    setView("工单中心")
    setQuickFilter("all")
    setCreateError("")
    setOrderDetailKey("")
    setInspectionDetailKey("")
    setNotice("")
    setOrderDraft(buildOrderDraft())
    setCreateOpen(true)
  }
  function openInspectionCreateDialog() {
    setCreateDirty(false)
    setInspectionDraft({stationId:inspectionRows.find(row => row.station.id === scope)?.station.id || inspectionRows[0]?.station.id || "", title:"", dueAt:dueFromPriority("P2", now)})
    setInspectionCreateError("")
    setInspectionCreateOpen(true)
  }
  async function submitInspection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (serverBusy || !hasStationPermission(user, inspectionDraft.stationId, "inspection.manage")) return
    const due = new Date(inspectionDraft.dueAt)
    if (!rows.some(row => row.station.id === inspectionDraft.stationId) || !inspectionDraft.title.trim() || !Number.isFinite(due.getTime()) || due.getTime() <= Date.now()) {setInspectionCreateError("请选择站点、填写标题并设置未来的巡检时间");return}
    setServerBusy(true)
    try {
      const result = await send<{id:number}>("/inspections", "POST", {stationId:Number(inspectionDraft.stationId), title:inspectionDraft.title.trim(), dueAt:due.toISOString(), assignedTo:Number(user?.id)})
      try{localStorage.setItem(workflowKey(user?.id||'',inspectionDraft.stationId,'inspection-fields',String(result.id)),JSON.stringify(inspectionDraft));setFieldNotice('巡检设备、等级与检查内容已另存本地，未提交服务器')}catch{setFieldNotice('巡检已创建，扩展字段本地保存失败')}
      setCreateDirty(false)
      setInspectionDraft({stationId:"", title:"", dueAt:""})
      setInspectionCreateError("")
      setInspectionCreateOpen(false)
      setNotice(`巡检 ${result.id} 已由服务器创建`)
      const dueDay = dateOnly(due)
      setRange(current => ({start: current.start < dueDay ? current.start : dueDay, end: current.end > dueDay ? current.end : dueDay}))
      onServerChange?.()
    } catch(error) {setInspectionCreateError(error instanceof Error ? error.message : "创建巡检失败")}
    finally {setServerBusy(false)}
  }
  function updateOrderDraft(patch: Partial<WorkOrderDraft>) {
    setCreateDirty(true)
    if (!DEMO_MODE && patch.stationId && !hasStationPermission(user, patch.stationId, "workorder.handle")) patch.owner = ""
    setOrderDraft((current) => ({ ...current, ...patch }))
    setCreateError("")
  }
  function createOrderId() {
    const max = allOrders.reduce((best, { order }) => {
      const value = Number(order.id.match(/^WO-(\d+)$/)?.[1])
      return Number.isFinite(value) ? Math.max(best, value) : best
    }, 3000)
    return `WO-${max + 1}`
  }
  async function submitWorkOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!DEMO_MODE) {
      if (serverBusy || !hasStationPermission(user, orderDraft.stationId, "workorder.create")) return
      setServerBusy(true)
      try {
        if(orderDraft.title.trim().length<4)throw new Error('工单标题至少需要 4 个字符')
        if(!Number.isFinite(new Date(orderDraft.dueAt).getTime())||new Date(orderDraft.dueAt).getTime()<=Date.now())throw new Error('处理时限必须晚于当前时间')
        if (!orderDraft.description.trim()) throw new Error('请填写工单描述')
        if (orderDraft.owner && !/^\d+$/.test(orderDraft.owner)) throw new Error('负责人请输入已授权的用户编号')
        const result = await send<{id: number}>('/work-orders', 'POST', {stationId: Number(orderDraft.stationId), title: orderDraft.title.trim(), description: orderDraft.description.trim(), assignedTo: orderDraft.owner ? Number(orderDraft.owner) : null, dueAt: new Date(orderDraft.dueAt).toISOString()})
        let extra=''
        try{localStorage.setItem(workflowKey(user?.id||'',orderDraft.stationId,'order-fields',String(result.id)),JSON.stringify({source:orderDraft.source,device:orderDraft.device,priority:orderDraft.priority}));extra='来源、设备和等级已另存本地草稿，未提交服务器'}catch{extra='来源、设备和等级未保存：本地存储不可用'}
        setCreateDirty(false);setCreateOpen(false); setNotice(`工单 ${result.id} 已由服务器创建`); setFieldNotice(extra); onServerChange?.()
      } catch(error) {setCreateError(error instanceof Error ? error.message : '创建失败')}
      finally {setServerBusy(false)}
      return
    }
    const targetRow = rows.find(
      (row) => row.station.id === orderDraft.stationId,
    )
    const title = orderDraft.title.trim()
    const owner = orderDraft.owner.trim()
    const device = orderDraft.device.trim()
    const dueTime = new Date(orderDraft.dueAt).getTime()
    if (!targetRow) {
      setCreateError("请选择有效站点")
      return
    }
    if (title.length < 4) {
      setCreateError("工单标题至少需要 4 个字符")
      return
    }
    if (!device) {
      setCreateError("请填写设备或对象")
      return
    }
    if (!owner) {
      setCreateError("请填写负责人")
      return
    }
    if (!Number.isFinite(dueTime)) {
      setCreateError("请选择处理时限")
      return
    }
    if (dueTime <= now.getTime()) {
      setCreateError("处理时限必须晚于当前时间")
      return
    }
    const createdAt = now.toISOString()
    const order: LocalWorkOrder = {
      id: createOrderId(),
      stationId: targetRow.station.id,
      title,
      status: "pending",
      createdAt,
      dueAt: new Date(dueTime).toISOString(),
      owner,
      description: orderDraft.description.trim(),
      source: orderDraft.source,
      device,
      priority: orderDraft.priority,
      createdBy: currentActor,
      updatedAt: createdAt,
    }
    const next = [order, ...localOrders]
    let saved = true
    try {
      persistLocalOrders(next)
    } catch {
      saved = false
    }
    setLocalOrders(next)
    setCreateOpen(false)
    setOrderDraft(EMPTY_ORDER_DRAFT)
    setCreateError("")
    setStatus("")
    setQuickFilter("all")
    setScope(targetRow.station.id)
    setSearch("")
    setSelectedKey(order.id)
    setOrderDetailKey(order.id)
    setNotice(
      saved
        ? `${order.id} 已创建为本地工单，未下发后台`
        : `${order.id} 已创建在当前页面，本地保存失败`,
    )
  }
  function removeLocalOrder(orderId: string) {
    if (!DEMO_MODE) {setNotice("服务端工单不支持删除，请使用取消操作"); return}
    const next = localOrders.filter((order) => order.id !== orderId)
    try {
      persistLocalOrders(next)
    } catch {
      // The in-memory state still updates when browser storage is unavailable.
    }
    setLocalOrders(next)
    setOrderOverrides((current) => {
      if (!(orderId in current)) return current
      const { [orderId]: _removed, ...remaining } = current
      try {
        persistOrderOverrides(remaining)
      } catch {
        // The in-memory state still updates when browser storage is unavailable.
      }
      return remaining
    })
    setOrderDetailKey("")
    if (selectedKey === orderId) setSelectedKey("")
    setNotice(`${orderId} 已从本地工单移除`)
  }
  async function transitionWorkOrder(orderId: string, nextStatus: WorkOrderState, suppliedNote?:string) {
    if (!DEMO_MODE) {
      if (serverBusy) return
      const entry = allOrders.find(item => item.order.id === orderId)
      const order = entry?.order
      if (!order || !hasStationPermission(user, entry?.row.station.id, "workorder.handle")) return
      if((nextStatus==='completed'&&order.owner!==user?.id)||(nextStatus==='processing'&&order.owner&&order.owner!==user?.id)){setNotice('仅当前负责人可以接单或完成工单');return}
      const note = suppliedNote ?? window.prompt('请输入本次状态变更说明')
      if (!note?.trim()) return
      setServerBusy(true)
      try {await send(`/work-orders/${orderId}/transition`, 'POST', {expectedStatus: order.status, status: nextStatus, note}); setNotice('服务器已更新工单'); onServerChange?.()}
      catch(error) {setNotice(error instanceof Error ? error.message : '更新失败'); onServerChange?.()}
      finally {setServerBusy(false)}
      return
    }
    const updatedAt = now.toISOString()
    setLocalOrders((current) => {
      const next = current.map((order) =>
        order.id === orderId
          ? { ...order, status: nextStatus, updatedAt }
          : order,
      )
      if (next !== current)
        try {
          persistLocalOrders(next)
        } catch {
          // The in-memory state still updates when browser storage is unavailable.
        }
      return next
    })
    setOrderOverrides((current) => {
      const next = {
        ...current,
        [orderId]: {
          status: nextStatus,
          updatedAt,
          operator: currentActor,
        },
      }
      try {
        persistOrderOverrides(next)
      } catch {
        // The in-memory state still updates when browser storage is unavailable.
      }
      return next
    })
    setNotice(
      `${orderId} 已更新为${ORDER_DISPLAY_STATUS[nextStatus]}（本地预览）`,
    )
  }
  async function transitionInspection(
    inspectionId: string,
    nextStatus: InspectionState,
    suppliedNote?:string,
  ) {
    if (!DEMO_MODE) {
      if (nextStatus !== 'completed' && nextStatus !== 'cancelled') return
      if (serverBusy) return
      const entry=allInspections.find(item=>item.inspection.id===inspectionId)
      if(!entry||!canAt(entry.row.station.id,'inspection.manage'))return false
      const note = suppliedNote ?? window.prompt(nextStatus === 'cancelled' ? '请输入取消原因' : '请输入巡检结果')
      if (!note?.trim()) return
      setServerBusy(true)
      try {await send(`/inspections/${inspectionId}/${nextStatus === 'cancelled' ? 'cancel' : 'complete'}`,'POST',{note:note.trim()});setNotice(nextStatus === 'cancelled' ? '巡检已由服务器取消' : '巡检已由服务器确认完成');onServerChange?.();return true}
      catch(error) {setNotice(error instanceof Error ? error.message : '巡检操作失败');return false}
      finally {setServerBusy(false)}
      return
    }
    const updatedAt = now.toISOString()
    setInspectionOverrides((current) => {
      const previous = current[inspectionId]
      const next = {
        ...current,
        [inspectionId]: {
          ...previous,
          status: nextStatus,
          updatedAt,
          startedAt:
            nextStatus === "processing"
              ? (previous?.startedAt ?? updatedAt)
              : previous?.startedAt,
          completedAt:
            nextStatus === "completed" ? updatedAt : previous?.completedAt,
          operator: currentActor,
        },
      }
      try {
        persistInspectionOverrides(next)
      } catch {
        // The in-memory state still updates when browser storage is unavailable.
      }
      return next
    })
    setNotice(
      `${inspectionId} 已更新为${INSPECTION_DISPLAY_STATUS[nextStatus]}（本地预览）`,
    )
    return true
  }
  function saveNote() {
    if (!DEMO_MODE) {setNotice("审批意见将在提交审核决定时保存至服务器"); return}
    if (!selectedApproval) return
    try {
      const saved = JSON.parse(localStorage.getItem(storageScope(NOTE_KEY)) ?? "{}")
      const base =
        saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}
      localStorage.setItem(
        storageScope(NOTE_KEY),
        JSON.stringify({
          ...base,
          [selectedApproval.approval.id]: {
            note: reviewNote,
            savedAt: new Date().toISOString(),
          },
        }),
      )
      setNotice(
        `${approvalCode(selectedApproval.approval)} 审核意见已保存至本机`,
      )
      noteBaseline.current=reviewNote;setNoteDirty(false)
    } catch {
      setNotice("保存失败：本地存储不可用")
    }
  }
  async function decide(next: ReviewState) {
    if (!DEMO_MODE) {
      if (!selectedApproval || !canAt(selectedApproval.row.station.id, "approval.review") || serverBusy || getReviewState(selectedApproval.approval) !== "pending") return
      if(!serverApprovals.find(item=>String(item.id)===selectedApproval.approval.id)?.plan_id){setNotice('当前接口仅支持运行计划审批');return}
      if (serverApprovals.find(item => String(item.id) === selectedApproval.approval.id)?.submitter_id === Number(user?.id)) {setNotice("不能审批自己的申请"); return}
      if (!reviewNote.trim()) {setNotice("请填写审批意见"); return}
      setServerBusy(true)
      try {
        await send(`/approvals/${selectedApproval.approval.id}/decision`, "POST", {decision: next, note: reviewNote.trim()})
        noteBaseline.current=reviewNote;setNoteDirty(false)
        const fresh = await allRows<ServerApproval>("/approvals")
        setServerApprovals(fresh)
        setNotice(next === "approved" ? "审批已由服务器确认通过" : "审批已由服务器确认驳回")
        onServerChange?.()
      } catch (error) {setNotice(error instanceof Error ? error.message : "审批失败")}
      finally {setServerBusy(false)}
      return
    }
    if (
      !selectedApproval ||
      getReviewState(selectedApproval.approval) !== "pending"
    )
      return
    if (next === "rejected" && !reviewNote.trim()) {
      setNotice("请先填写驳回原因")
      return
    }
    setReviewStates((current) => {
      const nextStates = {
        ...current,
        [selectedApproval.approval.id]: next,
      }
      try {
        persistReviewStates(nextStates)
      } catch {
        // The in-memory state still updates when browser storage is unavailable.
      }
      return nextStates
    })
    setNotice(
      next === "approved"
        ? `${approvalCode(selectedApproval.approval)} 已记录同意（本地预览），未向设备下发`
        : `${approvalCode(selectedApproval.approval)} 已驳回（本地预览），未连接后台`,
    )
    noteBaseline.current=reviewNote;setNoteDirty(false)
  }
  function exportCurrent() {
    if (view === "审批中心") {
      exportOperationsCsv(
        "审批中心.csv",
        [
          "审核编号",
          "提交时间",
          "类型",
          "标题",
          "提交人",
          "紧急程度",
          "状态",
          "站点",
        ],
        approvals.map(({ row, approval }) => [
          approval.id,
          approval.submittedAt,
          TYPE_LABEL[approval.type],
          approval.title,
          approval.submitter,
          DEMO_MODE ? URGENCY_LABEL[approval.urgency] : "未提供",
          REVIEW_STATUS[getReviewState(approval)],
          row.station.name,
        ]),
      )
      setNotice(`已导出审批中心 ${approvals.length} 条记录`)
    } else if (view === "我的待办") {
      exportOperationsCsv(
        "我的待办.csv",
        [
          "来源编号",
          "事项类型",
          "事项名称",
          "站点",
          "设备",
          "截止时间",
          "状态",
        ],
        todos.map((item) => [
          item.sourceId,
          item.typeLabel,
          item.title,
          stationName(item.row),
          item.device,
          item.dueAt ?? "",
          item.statusLabel,
        ]),
      )
      setNotice(`已导出我的待办 ${todos.length} 条记录`)
    } else {
      exportOperationsCsv(
        "运维工单.csv",
        [
          "站点",
          "编号",
          "来源",
          "设备",
          "等级",
          "标题",
          "状态",
          "负责人",
          "截止时间",
          "描述",
        ],
        orders.map(({ row, order }) => [
          row.station.name,
          order.id,
          orderSource(order),
          orderDevice(row, order),
          DEMO_MODE ? orderPriority(order, nowTime) : "未提供",
          order.title,
          ORDER_DISPLAY_STATUS[order.status],
          order.owner || row.station.manager,
          order.dueAt ?? "",
          order.description ?? "",
        ]),
      )
      setNotice(`已导出工单中心 ${orders.length} 条记录`)
    }
  }
  const repairItems=todoBase.filter(item=>item.kind!=='approval'&&matchesWorkflowFilters(extendedFilters,{站点:item.row.station.name,设备:item.device,工单类型:item.kind==='inspection'?'巡检':'检修',状态:item.statusLabel,负责人:item.order?.owner||item.inspection?.owner,完成期限:item.dueAt,是否超时:item.statusTone==='danger'?'是':'否'}))
  const visibleRepairItems=repairItems.filter(item=>quickFilter==='all'||quickFilter===item.group||(quickFilter==='risk'&&item.statusTone==='danger'))
  const currentCount =
    view === "工单中心"
      ? repairQueue?visibleRepairItems.length:orders.length
      : view === "审批中心"
        ? approvals.length
        : todos.length
  const quickChips: {
    key: string
    label: string
    count?: number
    tone?: "neutral" | "danger"
  }[] =
    view === "工单中心"
      ? repairQueue?[
          {key:'all',label:'全部',count:repairItems.length},
          {key:'pending',label:'待处理',count:repairItems.filter(i=>i.group==='pending').length},
          {key:'processing',label:'处理中',count:repairItems.filter(i=>i.group==='processing').length},
          {key:'done',label:'已办结',count:repairItems.filter(i=>i.group==='done').length},
        ]:[
          { key: "all", label: "全部工单", count: orderBase.length },
          { key: "pending", label: "待处理", count: pendingOrders.length },
          {
            key: "processing",
            label: "处理中",
            count: processingOrders.length,
          },
          {
            key: "risk",
            label: "超时风险",
            count: riskOrders.length,
            tone: "danger",
          },
        ]
      : view === "审批中心"
        ? [
            { key: "all", label: "全部审批" },
            { key: "pending", label: "待审批" },
            { key: "finished", label: "已结束" },
          ]
        : [
            { key: "pending", label: "待处理", count: pendingTodos.length },
            {
              key: "processing",
              label: "处理中",
              count: processingTodos.length,
            },
            { key: "done", label: "已办结" },
          ]
  const searchPlaceholder =
    view === "工单中心"
      ? "搜索工单编号 / 标题"
      : view === "审批中心"
        ? "搜索审批编号 / 申请事项"
        : "搜索编号 / 事项名称"
  const filterTypeOptions =
    view === "我的待办"
      ? (DEMO_MODE ? role === "operator" : Boolean(user?.permissions.includes("inspection.manage")))
        ? [
            {
              key: "order",
              label: "工单",
            },
            {
              key: "inspection",
              label: "巡检",
            },
          ]
        : [
            {
              key: "order",
              label: "交付与技术工单",
            },
          ]
      : Object.entries(APPROVAL_TYPE_LABEL).map(([key, label]) => ({
          key,
          label,
        }))
  const filterStatusOptions =
    view === "工单中心"
      ? Object.entries(ORDER_DISPLAY_STATUS).map(([key, label]) => ({
          key,
          label,
        }))
      : view === "审批中心"
        ? Object.entries(REVIEW_STATUS).map(([key, label]) => ({
            key,
            label,
          }))
        : [
            { key: "pending", label: "待处理" },
            { key: "processing", label: "处理中" },
            { key: "done", label: "已办结" },
          ]
  const activeFilterCount = [scope, type, status, submitter, keyword].filter(
    Boolean,
  ).length
  const slaGroups = (["P1", "P2", "P3"] as const).map((priority) => {
    const group = orderBase.filter(
      ({ order }) => orderPriority(order, nowTime) === priority,
    )
    return {
      priority,
      total: group.length,
      active: group.filter(({ order }) => isOpenOrder(order.status)).length,
      risk: group.filter(({ order }) => isOrderRisk(order, nowTime)).length,
    }
  })
  const pageLevelNotice = notice.startsWith("已导出")
  return (
    <main className="operations-page work-orders-page">
      <EmsPanel stations={stations} module="workorders" onAlarm={(id, alarmId) => {
        const linked = allOrders.find(item => item.row.station.id === id && item.order.alarmId === alarmId)
        if (linked) { setView("工单中心"); setOrderDetailKey(linked.order.id) }
        else setNotice(`业务告警 ${alarmId} 尚无可读取的关联工单；可在站点告警信息中人工开单。人工确认 / 工单 / 审批不代表 EMS 执行或保存 ACK。`)
      }} />
      <header className="work-orders-topbar">
        <nav aria-label="工单与审批一级导航">
          {visibleViews.map((item) => (
            <button
              key={item}
              aria-current={view === item ? "page" : undefined}
              onClick={() => go(() => {
                setView(item)
                setRepairQueue(false)
                setExtendedFilters({})
                setToolsOpen(false)
                setStatus("")
                setType("")
                setSubmitter("")
                setQuickFilter(defaultQuickFilter(item))
                setSelectedKey("")
                setOrderDetailKey("")
                setInspectionDetailKey("")
                setNotice("")
              })}
            >
              {item}
            </button>
          ))}
        </nav>
        <button className="operations-button" aria-pressed={toolsOpen} onClick={()=>go(()=>{setToolsOpen(!toolsOpen);setSelectedKey('');setOrderDetailKey('');setInspectionDetailKey('')})}>任务协作</button>
        <span className="work-orders-sync">
          {ROLE_CONFIG[role].shortLabel}范围 · 更新 {timeLabel(now.toISOString())}
        </span>
      </header>
      <div className="work-orders-content">
        {toolsOpen&&<TaskWorkbench stations={rows.map(r=>({id:r.station.id,name:r.station.name}))} tasks={[...allOrders.map(({row,order})=>({id:order.id,title:order.title,domain:'工单',status:ORDER_DISPLAY_STATUS[order.status],owner:order.owner||'',due:order.dueAt,stationId:row.station.id})),...allApprovals.map(({row,approval})=>({id:approval.id,title:approval.title,domain:'审批',status:REVIEW_STATUS[getReviewState(approval)],owner:approval.reviewer||'',due:undefined,stationId:row.station.id}))]} registerLeaveGuard={registerChildGuard} onClose={()=>setToolsOpen(false)} onOpen={(id,domain)=>{setToolsOpen(false);if(domain==='工单'){setView('工单中心');setOrderDetailKey(id)}else{setView('审批中心');setSelectedKey(id)}}}/>}
        {fieldNotice&&<p role="status" className="wo-boundary">{fieldNotice}</p>}
        <section className="work-orders-summary" aria-label="工单审批状态筛选">
          <div className="work-orders-chips">
            {quickChips.map((chip) => (
              <StatusChip
                key={chip.key}
                label={chip.label}
                count={chip.count}
                active={quickFilter === chip.key}
                tone={chip.tone}
                onClick={() => {
                  setQuickFilter(chip.key)
                  setSelectedKey("")
                  setOrderDetailKey("")
                  setInspectionDetailKey("")
                  setNotice("")
                }}
              />
            ))}
          </div>
          {view === "工单中心" && (DEMO_MODE || createRows.length > 0) && (
            <button
              className="operations-button work-orders-new"
              disabled={!rows.length}
              onClick={openCreateDialog}
            >
              <Plus size={14} />
              新建工单
            </button>
          )}
        </section>
        <section className="work-orders-toolbar" aria-label="工单审批筛选">
          <label className="work-orders-search">
            <Search size={13} />
            <input
              type="search"
              aria-label="搜索审批或工单"
              placeholder={searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            className="operations-button work-orders-filter"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Plus size={13} />
            添加筛选
            {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
          </button>
          {view==='工单中心'&&inspectionRows.length>0&&<button className="operations-button" aria-pressed={repairQueue} onClick={()=>{setRepairQueue(!repairQueue);setQuickFilter('all')}}>巡检与检修</button>}
        </section>
        {filtersOpen && (
          <section className="work-orders-scope" aria-label="高级筛选">
            <WorkflowFilters fields={view==='工单中心'?orderFilters:view==='审批中心'?approvalFilters:todoFilters} values={extendedFilters} onChange={setExtendedFilters} options={{站点:rows.map(r=>r.station.name),关联站点:rows.map(r=>r.station.name),负责人:[...new Set(allOrders.map(i=>i.order.owner||'').filter(Boolean))],工单类型:[...new Set(allOrders.map(i=>orderSource(i.order)))],来源:[...new Set(allOrders.map(i=>orderSource(i.order)))],优先级:['P1','P2','P3'],状态:Object.values(ORDER_DISPLAY_STATUS),审批状态:Object.values(REVIEW_STATUS),审批类型:Object.values(APPROVAL_TYPE_LABEL),事项类型:['工单','巡检','审批'],处理状态:['待处理','处理中','已办结','待审批','已通过','已驳回'],是否超时:['是','否']}}/>
            <label>
              责任范围
              <select
                aria-label="审核站点范围"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <option value="">全部站点 · {rows.length}</option>
                {rows.map((row) => (
                  <option key={row.station.id} value={row.station.id}>
                    {row.station.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              类型
              <select
                aria-label={view === "我的待办" ? "事项类型" : "审批类型"}
                disabled={view === "工单中心"}
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="">类型：全部</option>
                {filterTypeOptions.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              状态
              <select
                aria-label="审批状态"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">状态：全部</option>
                {filterStatusOptions.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              提交人
              <select
                aria-label="提交人"
                disabled={view === "工单中心" || view === "我的待办"}
                value={submitter}
                onChange={(event) => setSubmitter(event.target.value)}
              >
                <option value="">提交人：全部</option>
                {[
                  ...new Set(
                    allApprovals.map(({ approval }) => approval.submitter),
                  ),
                ].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <div className="work-orders-date">
              <CalendarDays size={13} />
              <input
                type="date"
                aria-label="开始日期"
                value={range.start}
                onChange={(event) => {
                  const start = event.target.value
                  setRange((current) => ({
                    start,
                    end: current.end < start ? start : current.end,
                  }))
                }}
              />
              <span>至</span>
              <input
                type="date"
                aria-label="结束日期"
                value={range.end}
                min={range.start}
                onChange={(event) =>
                  setRange((current) => ({
                    ...current,
                    end: event.target.value,
                  }))
                }
              />
            </div>
            <div className="work-orders-filter-actions">
              <button
                className="operations-button"
                onClick={exportCurrent}
                disabled={!currentCount}
              >
                <Download size={13} />
                导出
              </button>
              <button className="work-orders-reset" onClick={reset}>
                重置筛选
              </button>
            </div>
          </section>
        )}
        {notice &&
          !detailOrder &&
          !detailInspection &&
          (pageLevelNotice || view === "工单中心" || !selectedApproval) && (
            <div className="work-orders-notice" role="status">
              {notice}
            </div>
          )}
          {!DEMO_MODE && view === "我的待办" && user?.permissions.includes("inspection.manage") && <button className="operations-button work-orders-new" disabled={!rows.length} onClick={openInspectionCreateDialog}><Plus size={14} />新建巡检</button>}
        {!DEMO_MODE && view === "审批中心" && approvalLoading && <div className="work-orders-notice" role="status">正在加载审批记录…</div>}
        {!DEMO_MODE && view === "审批中心" && approvalError && <div className="work-orders-notice" role="alert">{approvalError}</div>}
        <section className="work-orders-table-panel work-orders-orders-panel">
          <div className="work-orders-table-scroll">
            {view==='工单中心'&&repairQueue?<table className="work-orders-sub-table"><thead><tr>{['工单编号','工单类型','工单标题','站点','设备','截止时间','状态','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{visibleRepairItems.map(item=><tr key={item.key}><td>{item.sourceId}</td><td>{item.kind==='inspection'?'巡检':'检修'}</td><td>{item.title}</td><td>{item.row.station.name}</td><td>{item.device}</td><td>{deadlineDateLabel(item.dueAt,now)}</td><td>{item.statusLabel}</td><td><button className="work-orders-action-link" onClick={()=>{if(item.kind==='inspection')setInspectionDetailKey(item.sourceId);else setOrderDetailKey(item.sourceId)}}>处理工单</button></td></tr>)}</tbody></table>:view === "工单中心" ? (
              <table>
                <thead>
                  <tr>
                    {[
                      "工单 / 来源",
                      "站点",
                      "设备",
                      "等级",
                      "处理时限",
                      "负责人",
                      "状态",
                      "更新",
                      "操作",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(({ row, order }) => {
                    const deadline = deadlineInfo(
                      order.dueAt,
                      order.status,
                      nowTime,
                    )
                    const priority = orderPriority(order, nowTime)
                    const risk = isOrderRisk(order, nowTime)
                    return (
                      <tr
                        key={`${row.station.id}:${order.id}`}
                        className={
                          selectedOrder?.order.id === order.id
                            ? "is-selected"
                            : ""
                        }
                        onClick={() => setSelectedKey(order.id)}
                      >
                        <td className="work-orders-title">
                          <strong>
                            {order.id} · {orderSource(order)}
                          </strong>
                          <small>{order.title}</small>
                        </td>
                        <td>{row.station.name}</td>
                        <td>{orderDevice(row, order)}</td>
                        <td>
                          <span
                            className={`work-orders-priority work-orders-priority--${priority.toLowerCase()}`}
                          >
                            {DEMO_MODE?priority:'未提供'}
                          </span>
                        </td>
                        <td
                          className={`work-orders-deadline work-orders-deadline--${deadline.tone}`}
                        >
                          {deadline.label}
                        </td>
                        <td>{order.owner || row.station.manager}</td>
                        <td>
                          <OrderStatus status={order.status} risk={risk} />
                        </td>
                        <td>{timeLabel(order.updatedAt ?? order.createdAt)}</td>
                        <td>
                          <button
                            className="work-orders-detail-button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedKey(order.id)
                              setOrderDetailKey(order.id)
                              setInspectionDetailKey("")
                              setNotice("")
                            }}
                          >
                            查看详情
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : view === "审批中心" ? (
              <table className="work-orders-sub-table">
                <thead>
                  <tr>
                    {[
                      "审批编号",
                      "审批类型",
                      "申请事项",
                      "站点",
                      "设备",
                      "提交时间",
                      "状态",
                      "操作",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {approvals.map(({ row, approval }) => {
                    const reviewState = getReviewState(approval)
                    return (
                      <tr
                        key={`${row.station.id}:${approval.id}`}
                        className={
                          selectedApproval?.approval.id === approval.id
                            ? "is-selected"
                            : ""
                        }
                        onClick={() => setSelectedKey(approval.id)}
                      >
                        <td className="work-orders-title">
                          <strong>{approvalCode(approval)}</strong>
                        </td>
                        <td>{APPROVAL_TYPE_LABEL[approval.type]}</td>
                        <td>{approval.title}</td>
                        <td>{stationName(row)}</td>
                        <td>-</td>
                        <td>{compactDateLabel(approval.submittedAt)}</td>
                        <td>
                          <span
                            className={`work-order-badge work-orders-review-status--${reviewState}`}
                          >
                            {REVIEW_STATUS[reviewState]}
                          </span>
                        </td>
                        <td>
                          <button
                            className="work-orders-detail-button work-orders-action-link"
                            onClick={(event) => {
                              event.stopPropagation()
                              setSelectedKey(approval.id)
                              setOrderDetailKey("")
                              setInspectionDetailKey("")
                              setNotice("")
                            }}
                          >
                            {reviewState === "pending"
                              ? "办理审批"
                              : "查看详情"}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <table className="work-orders-sub-table">
                <thead>
                  <tr>
                    {[
                      "来源编号",
                      "事项类型",
                      "事项名称",
                      "站点",
                      "设备",
                      "截止时间",
                      "状态",
                      "操作",
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todos.map((item) => (
                    <tr
                      key={item.key}
                      className={
                        selectedKey === item.sourceId ||
                        selectedKey === item.approval?.id
                          ? "is-selected"
                          : ""
                      }
                      onClick={() => {
                        setSelectedKey(item.approval?.id ?? item.sourceId)
                        if (item.kind !== "approval") setNotice("")
                      }}
                    >
                      <td className="work-orders-title">
                        <strong>{item.sourceId}</strong>
                      </td>
                      <td>{item.typeLabel}</td>
                      <td>{item.title}</td>
                      <td>{stationName(item.row)}</td>
                      <td>{item.device}</td>
                      <td>{deadlineDateLabel(item.dueAt, now)}</td>
                      <td>
                        <span
                          className={`work-order-badge work-orders-todo-status--${item.statusTone}`}
                        >
                          {item.statusLabel}
                        </span>
                      </td>
                      <td>
                        <button
                          className="work-orders-detail-button work-orders-action-link"
                          aria-label={item.kind === "inspection" ? `查看巡检 ${item.sourceId}` : undefined}
                          onClick={(event) => {
                            event.stopPropagation()
                            setNotice("")
                            setOrderDetailKey("")
                            setInspectionDetailKey("")
                            setSelectedKey(item.approval?.id ?? item.sourceId)
                            if (item.kind === "order" && item.order) {
                              setOrderDetailKey(item.order.id)
                            } else if (
                              item.kind === "approval" &&
                              item.approval
                            ) {
                              setSelectedKey(item.approval.id)
                            } else if (
                              item.kind === "inspection" &&
                              item.inspection
                            ) {
                              setInspectionDetailKey(item.inspection.id)
                            }
                          }}
                        >
                          {item.actionLabel}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!currentCount && (
            <div className="operations-empty">
              {view === "工单中心"
                ? "暂无符合条件的工单"
                : view === "审批中心"
                  ? "暂无符合条件的审批记录"
                  : "暂无符合条件的待办事项"}
              <button className="work-orders-link" onClick={reset}>
                重置筛选
              </button>
            </div>
          )}
        </section>
        {view !== "工单中心" && selectedApproval && (
          <div className="work-orders-detail-row">
            <ApprovalDetail
              row={selectedRow}
              approval={selectedApproval?.approval}
              reviewState={
                selectedApproval
                  ? getReviewState(selectedApproval.approval)
                  : undefined
              }
              note={reviewNote}
              notice={pageLevelNotice ? "" : notice}
              canDecide={canAt(selectedApproval.row.station.id, "approval.review") && (DEMO_MODE || Boolean(serverApprovals.find(item => String(item.id) === selectedApproval.approval.id)?.plan_id) && serverApprovals.find(item => String(item.id) === selectedApproval.approval.id)?.submitter_id !== Number(user?.id))}
              busy={serverBusy}
              onNote={(value) => {
                setNoteDirty(true)
                setReviewNote(value)
                setNotice("")
              }}
              onSaveNote={saveNote}
              registerLeaveGuard={registerChildGuard}
              onDecide={decide}
              onClose={() => go(() => {
                setSelectedKey("closed")
                setNotice("")
              })}
            />
          </div>
        )}
        {view === "工单中心" && (
          <details className="work-orders-sla" aria-label="SLA 负载">
            <summary>SLA 负载</summary>
            <div className="work-orders-sla-grid">
              {slaGroups.map((group) => (
                DEMO_MODE?<Stat key={group.priority} {...group} />:<div key={group.priority}><small>{group.priority}</small><p>— · 服务器未提供工单等级</p></div>
              ))}
            </div>
          </details>
        )}
        {createOpen && (
          <NewWorkOrderDialog
            rows={createRows}
            draft={orderDraft}
            error={createError}
            now={now}
            sourceOptions={workOrderSourceOptions}
            members={members}
            self={user && hasStationPermission(user, orderDraft.stationId, "workorder.handle") ? {id: user.id, name: user.name} : undefined}
            onChange={updateOrderDraft}
            onClose={() => go(() => {
              setCreateOpen(false)
              setCreateError("")
            })}
            onSubmit={submitWorkOrder}
          />
        )}
        {inspectionCreateOpen && <InspectionCreateDialog rows={inspectionRows} draft={inspectionDraft} error={inspectionCreateError} busy={serverBusy} self={user?.name || user?.id || ""} onChange={patch => {setCreateDirty(true);setInspectionDraft(current => ({...current, ...patch})); setInspectionCreateError("")}} onClose={() => go(()=>setInspectionCreateOpen(false))} onSubmit={submitInspection} />}
        {detailOrder && (
          <WorkOrderDetailDialog
            initialHandling={view==='我的待办'}
            registerLeaveGuard={registerChildGuard}
            key={`${detailOrder.row.station.id}:${detailOrder.order.id}`}
            onNote={!DEMO_MODE&&canAt(detailOrder.row.station.id,'workorder.handle')?async note=>{try{await send(`/work-orders/${detailOrder.order.id}/notes`,'POST',{note});onServerChange?.();return true}catch(error){setNotice(error instanceof Error?error.message:'记录保存失败');return false}}:undefined}
            events={serverEvents}
            assignees={[...(user && canAt(detailOrder.row.station.id, "workorder.handle") ? [{id:user.id, name:`${user.name}（当前用户）`}] : []), ...members.filter(member => String(member.id) !== user?.id).map(member => ({id:String(member.id), name:member.display_name || member.account}))]}
            onAssign={!DEMO_MODE && canAt(detailOrder.row.station.id, "workorder.edit") ? async (assignedTo) => {
              if (!/^\d+$/.test(assignedTo)) return
              try {await send(`/work-orders/${detailOrder.order.id}/assignee`, 'PUT', {assignedTo: Number(assignedTo)}); setNotice('服务器已更新负责人'); onServerChange?.()}
              catch(error) {setNotice(error instanceof Error ? error.message : '分派失败')}
            } : undefined}
            row={detailOrder.row}
            order={detailOrder.order}
            nowTime={nowTime}
            local={localOrders.some(
              (order) => order.id === detailOrder.order.id,
            )}
            onClose={() => go(()=>setOrderDetailKey(""))}
            onDelete={() => removeLocalOrder(detailOrder.order.id)}
            canHandle={canAt(detailOrder.row.station.id, "workorder.handle")}
            onTransition={(status) =>
              transitionWorkOrder(detailOrder.order.id, status)
            }
            notice={notice}
          />
        )}
        {detailInspection && (
          <InspectionDetailDialog
            registerLeaveGuard={registerChildGuard}
            canHandle={canAt(detailInspection.row.station.id,'inspection.manage')&&(DEMO_MODE||!detailInspection.inspection.owner||detailInspection.inspection.owner===user?.id)}
            onComplete={async note=>Boolean(await transitionInspection(detailInspection.inspection.id,'completed',note))}
            row={detailInspection.row}
            inspection={detailInspection.inspection}
            onClose={() => go(()=>setInspectionDetailKey(""))}
            onTransition={(status) =>
              transitionInspection(detailInspection.inspection.id, status)
            }
            notice={notice}
          />
        )}
        {leave.dialog}
      </div>
    </main>
  )
}

function InspectionCreateDialog({rows, draft, error, busy, self, onChange, onClose, onSubmit}: {
  rows: MaintenanceStation[]
  draft: InspectionDraft
  error: string
  busy: boolean
  self: string
  onChange: (patch: Partial<InspectionDraft>) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {const dialog = ref.current; dialog?.showModal(); return () => dialog?.close()}, [])
  return <dialog ref={ref} className="work-orders-create-dialog" aria-label="新建巡检" onCancel={event=>{event.preventDefault();onClose()}}>
    <form onSubmit={onSubmit}>
      <header><h2>新建巡检</h2><button type="button" className="operations-icon" aria-label="关闭" onClick={onClose}><img src="/figma/work-orders/close.svg" alt=""/></button></header>
      <div className="work-orders-create-body"><div className="work-orders-create-grid">
        <label className="work-orders-create-field">站点<select aria-label="巡检站点" required value={draft.stationId} onChange={event => onChange({stationId:event.target.value})}>{rows.map(row => <option key={row.station.id} value={row.station.id}>{row.station.name}</option>)}</select></label>
        <label className="work-orders-create-field">巡检标题<input aria-label="巡检标题" required maxLength={200} value={draft.title} onChange={event => onChange({title:event.target.value})} /></label>
        <label className="work-orders-create-field">计划时间<input aria-label="巡检计划时间" required type="datetime-local" value={draft.dueAt} onChange={event => onChange({dueAt:event.target.value})} /></label>
        <div className="work-orders-create-field">负责人<strong>{self}（当前用户）</strong></div>
        <label className="work-orders-create-field">关联设备<input aria-label="巡检关联设备" value={draft.device||''} onChange={event=>onChange({device:event.target.value})}/></label>
        <label className="work-orders-create-field">优先级<select aria-label="巡检优先级" value={draft.priority||'P2'} onChange={event=>onChange({priority:event.target.value})}><option>P1</option><option>P2</option><option>P3</option></select></label>
        <label className="work-orders-create-field work-orders-create-field--wide">检查内容<textarea aria-label="巡检检查内容" value={draft.description||''} onChange={event=>onChange({description:event.target.value})}/></label>
        <p className="wo-boundary">标题、站点、当前负责人及计划时间保存至服务器；设备、优先级与检查内容另存本地草稿。</p>
      </div>{error && <p role="alert" className="work-orders-create-error">{error}</p>}</div>
      <footer><button type="button" className="operations-button" onClick={onClose}>关闭</button><button type="submit" className="operations-button work-orders-approve" disabled={busy}>创建巡检</button></footer>
    </form>
  </dialog>
}

function NewWorkOrderDialog({
  rows,
  draft,
  error,
  now,
  sourceOptions,
  members,
  self,
  onChange,
  onClose,
  onSubmit,
}: {
  rows: MaintenanceStation[]
  draft: WorkOrderDraft
  error: string
  now: Date
  sourceOptions: readonly WorkOrderSource[]
  members: ServerMember[]
  self?: {id: string; name: string}
  onChange: (patch: Partial<WorkOrderDraft>) => void
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const selectedRow =
    rows.find((row) => row.station.id === draft.stationId) ?? rows[0]
  const deviceOptions = deviceOptionsForRow(selectedRow)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  function changeStation(stationId: string) {
    const row = rows.find((item) => item.station.id === stationId)
    const nextDeviceOptions = deviceOptionsForRow(row)
    onChange({
      stationId,
      owner: row?.station.manager ?? "",
      device: nextDeviceOptions.includes(draft.device)
        ? draft.device
        : (nextDeviceOptions[0] ?? (DEMO_MODE ? "PCS-01" : "")),
    })
  }
  function changePriority(priority: Priority) {
    onChange({
      priority,
      dueAt: dueFromPriority(priority, now),
    })
  }
  return (
    <dialog
      ref={ref}
      className="work-orders-create-dialog"
      aria-label="新建工单"
      onCancel={event=>{event.preventDefault();onClose()}}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <form onSubmit={onSubmit}>
        <header>
          <div>
            <h2>新建工单</h2>
            <span>{DEMO_MODE?'本地创建 · 未下发后台':'服务器工单 · 扩展字段另存本地'}</span>
          </div>
          <button
            type="button"
            className="operations-icon"
            aria-label="关闭新建工单"
            title="关闭"
            onClick={onClose}
          >
            <img src="/figma/work-orders/close.svg" alt=""/>
          </button>
        </header>
        <div className="work-orders-create-body">
          <div className="work-orders-create-grid">
            <label className="work-orders-create-field">
              站点
              <select
                required
                aria-label="新建工单站点"
                value={draft.stationId}
                onChange={(event) => changeStation(event.target.value)}
              >
                {rows.map((row) => (
                  <option key={row.station.id} value={row.station.id}>
                    {row.station.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="work-orders-create-field">
              来源
              <select
                required
                aria-label="新建工单来源"
                value={draft.source}
                onChange={(event) =>
                  onChange({
                    source: event.target.value as WorkOrderSource,
                  })
                }
              >
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>
            <label className="work-orders-create-field work-orders-create-field--wide">
              工单标题
              <input
                required
                maxLength={80}
                aria-label="新建工单标题"
                placeholder="例如：PCS-01 直流侧绝缘告警复核"
                value={draft.title}
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </label>
            <label className="work-orders-create-field">
              设备 / 对象
              <input
                required={DEMO_MODE}
                list="work-order-device-options"
                maxLength={40}
                aria-label="新建工单设备"
                value={draft.device}
                onChange={(event) => onChange({ device: event.target.value })}
              />
              <datalist id="work-order-device-options">
                {deviceOptions.map((device) => (
                  <option key={device} value={device} />
                ))}
              </datalist>
            </label>
            <label className="work-orders-create-field">
              等级
              <select
                required
                aria-label="新建工单等级"
                value={draft.priority}
                onChange={(event) =>
                  changePriority(event.target.value as Priority)
                }
              >
                {WORK_ORDER_PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label className="work-orders-create-field">
              处理时限
              <input
                required
                type="datetime-local"
                aria-label="新建工单处理时限"
                min={dateTimeLocal(new Date(now.getTime() + 60000))}
                value={draft.dueAt}
                onChange={(event) => onChange({ dueAt: event.target.value })}
              />
            </label>
            <label className="work-orders-create-field">
              负责人
              {DEMO_MODE ? <input
                required
                maxLength={32}
                aria-label="新建工单负责人"
                value={draft.owner}
                onChange={(event) => onChange({ owner: event.target.value })}
              /> : <select aria-label="新建工单负责人" value={draft.owner} onChange={(event) => onChange({owner:event.target.value})}>
                <option value="">未分派</option>
                {self && <option value={self.id}>{self.name}（当前用户）</option>}
                {members.filter(member => String(member.id) !== self?.id).map(member => <option key={member.id} value={member.id}>{member.display_name || member.account} · {member.account}</option>)}
              </select>}
            </label>
            <label className="work-orders-create-field work-orders-create-field--wide">
              描述
              <textarea
                maxLength={1000}
                aria-label="新建工单描述"
                placeholder="记录异常现象、处置要求或交接说明"
                value={draft.description}
                onChange={(event) =>
                  onChange({ description: event.target.value })
                }
              />
            </label>
          </div>
          {!DEMO_MODE && <p role="note">服务器保存标题、描述、站点、负责人和截止时间；来源、设备和等级暂不保存。</p>}
          {selectedRow && (
            <dl className="work-orders-create-context">
              <div>
                <dt>站点状态</dt>
                <dd>{selectedRow.station.runStatus}</dd>
              </div>
              <div>
                <dt>当前功率</dt>
                <dd>{Number.isFinite(selectedRow.station.activePower) ? `${Math.round(selectedRow.station.activePower)} kW` : "—"}</dd>
              </div>
              <div>
                <dt>活动告警</dt>
                <dd>{selectedRow.alarmsKnown ? selectedRow.active.length : "—"}</dd>
              </div>
            </dl>
          )}
          {error && (
            <p className="work-orders-create-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer>
          <span>创建后进入待处理列表</span>
          <button type="button" className="operations-button" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="operations-button work-orders-approve"
          >
            创建工单
          </button>
        </footer>
      </form>
    </dialog>
  )
}

function WorkOrderDetailDialog({initialHandling=false,events=[],canHandle=true,assignees=[],onAssign,row,order,nowTime,local,onClose,onDelete,onTransition,notice,registerLeaveGuard,onNote}:{
 initialHandling?:boolean;events?:ApiRow[];canHandle?:boolean;assignees?:{id:string;name:string}[];onAssign?:(id:string)=>void;row:MaintenanceStation;order:DisplayWorkOrder;nowTime:number;local:boolean;onClose:()=>void;onDelete:()=>void;onTransition:(status:WorkOrderState)=>void;notice:string;registerLeaveGuard?:RegisterLeaveGuard;onNote?:(note:string)=>Promise<boolean>
}){
 const [handling,setHandling]=useState(initialHandling)
 const [selectedAssignee,setSelectedAssignee]=useState(order.owner||'')
 const handlingGuard=useRef<null|(()=>Promise<boolean>)>(null),assignGuard=useRef<null|(()=>Promise<boolean>)>(null)
 const registerHandling=useCallback<RegisterLeaveGuard>(g=>{handlingGuard.current=g},[]),registerAssign=useCallback<RegisterLeaveGuard>(g=>{assignGuard.current=g},[])
 const requestLeave=useCallback(async()=>{if(handlingGuard.current&&!(await handlingGuard.current()))return false;return assignGuard.current?.()??true},[])
 useEffect(()=>{registerLeaveGuard?.(requestLeave);return()=>registerLeaveGuard?.(null)},[registerLeaveGuard,requestLeave])
 const leave=useWorkflowLeave(selectedAssignee!==(order.owner||''),registerAssign,()=>setSelectedAssignee(order.owner||''),order.id+Boolean(onAssign),Boolean(onAssign))
 useEffect(()=>setSelectedAssignee(order.owner||''),[order.owner,onAssign===undefined])
 const deadline=deadlineInfo(order.dueAt,order.status,nowTime),open=isOpenOrder(order.status)
 return <section className="wo-full-detail" data-handling={handling} aria-label="工单详情"><button className="operations-button" onClick={onClose}>← 返回工单列表</button><header><h2>{order.id} · {order.title}</h2><OrderStatus status={order.status} risk={isOrderRisk(order,nowTime)}/></header><section className="wo-detail-card"><h3>基本信息</h3><dl className="wo-detail-grid">{[['站点',row.station.name],['设备',orderDevice(row,order)],['负责人',assignees.find(m=>m.id===order.owner)?.name||order.owner||'未分派'],['优先级',DEMO_MODE?orderPriority(order,nowTime):'未提供'],['处理时限',deadline.label],['最后更新',dateTime(order.updatedAt||order.createdAt)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section><section className="wo-detail-card"><h3>详细说明</h3><p>{order.description||'暂无描述'}</p><p>来源：{orderSource(order)} {order.alarmId? ' · 关联告警 '+order.alarmId:''}</p></section><section className="wo-detail-card"><h3>处理记录</h3>{events.length?events.map(event=><p key={String(event.id)}>{String(event.created_at??'')} · {String(event.action??'')} · {String(event.note??'')}</p>):<p>暂无处理记录</p>}</section>
 <LocalWorkflowFields stationId={row.station.id} objectId={order.id} kind="order-fields"/><WorkHandling stationId={row.station.id} objectId={order.id} kind="order" canEdit={canHandle&&open} registerLeaveGuard={registerHandling} onNote={onNote}/>
 <footer>{!handling&&canHandle&&open&&<button className="operations-button work-orders-approve" onClick={()=>setHandling(true)}>处理工单</button>}{notice&&<p role="status">{notice}</p>}{onAssign&&open&&<label>负责人<select aria-label="更改负责人" value={selectedAssignee} onChange={e=>setSelectedAssignee(e.target.value)}><option value="">未分派</option>{order.owner&&!assignees.some(m=>m.id===order.owner)&&<option value={order.owner}>当前负责人 #{order.owner}</option>}{assignees.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="operations-button" disabled={!selectedAssignee||selectedAssignee===order.owner} onClick={()=>onAssign(selectedAssignee)}>更改负责人</button></label>}{local&&<button className="operations-button" onClick={onDelete}>删除本地记录</button>}{open&&canHandle&&<button className="operations-button work-orders-reject" onClick={()=>onTransition('cancelled')}>取消工单</button>}{canHandle&&order.status==='pending'&&<button className="operations-button work-orders-approve" onClick={()=>onTransition('processing')}>开始处理</button>}{canHandle&&order.status==='processing'&&<button className="operations-button" onClick={()=>onTransition('completed')}>办结工单</button>}<button className="operations-button" onClick={onClose}>关闭</button><p className="wo-boundary">办结工单直接标记为已完成；验收草稿不会改变此状态。{local?'本地预览，未下发后台':''}</p></footer>{leave.dialog}</section>
}

function InspectionDetailDialog({row,inspection,onClose,onTransition,notice,registerLeaveGuard,onComplete,canHandle}:{row:MaintenanceStation;inspection:DisplayInspection;onClose:()=>void;onTransition:(status:InspectionState)=>void;notice:string;registerLeaveGuard?:RegisterLeaveGuard;onComplete:(note:string)=>Promise<boolean>;canHandle:boolean}){
 return <section className="wo-full-detail wo-inspection-detail" aria-label="巡检详情"><button className="operations-button" onClick={onClose}>← 返回我的待办</button><section className="wo-detail-card"><h2>{inspection.id} · {inspection.title}</h2><dl className="wo-detail-grid">{[['巡检名称',inspection.title],['站点',row.station.name],['设备范围','未关联设备'],['执行人',inspection.owner||'未分派'],['完成期限',dateTime(inspection.dueAt)],['当前状态',INSPECTION_DISPLAY_STATUS[inspection.status]]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><LocalWorkflowFields stationId={row.station.id} objectId={inspection.id} kind="inspection-fields"/><WorkHandling key={inspection.id} kind="inspection" stationId={row.station.id} objectId={inspection.id} canEdit={canHandle&&isOpenOrder(inspection.status)} registerLeaveGuard={registerLeaveGuard} onComplete={onComplete}/></section>{notice&&<p role="status">{notice}</p>}<footer><button className="operations-button" onClick={onClose}>关闭</button>{canHandle&&inspection.status==='pending'&&<button className="operations-button work-orders-reject" onClick={()=>onTransition('cancelled')}>取消巡检</button>}</footer></section>
}

function ApprovalDetail({
  registerLeaveGuard,
  row,
  approval,
  reviewState,
  note,
  notice,
  canDecide,
  busy,
  onNote,
  onSaveNote,
  onDecide,
  onClose,
}: {
  registerLeaveGuard?: RegisterLeaveGuard
  row?: MaintenanceStation
  approval?: MaintenanceApproval
  reviewState?: ReviewState
  note: string
  notice: string
  canDecide: boolean
  busy: boolean
  onNote: (value: string) => void
  onSaveNote: () => void
  onDecide: (state: ReviewState) => void
  onClose: () => void
}) {
  const {user}=useAuth()
  const [confirm,setConfirm]=useState<'approved'|'rejected'|'supplement'|null>(null)
  const [localNotice,setLocalNotice]=useState('')
  const [supplement, setSupplement] = useState('')
  const [savedSupplement, setSavedSupplement] = useState('')
  const supplementKey = workflowKey(user?.id || '', row?.station.id || '', 'supplement', approval?.id || '')
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(supplementKey) || 'null')?.note || ''
      setSupplement(saved)
      setSavedSupplement(saved)
    } catch {
      setSupplement('')
      setSavedSupplement('')
      setLocalNotice('本地补充要求草稿读取失败')
    }
  }, [supplementKey])
  const supplementLeave = useWorkflowLeave(
    supplement !== savedSupplement,
    registerLeaveGuard,
    () => { setSupplement(savedSupplement); setConfirm(null) },
    // Only object/authorization changes invalidate this editor; submission busy state does not.
    `${supplementKey}:${canDecide}`,
    canDecide,
  )
  useEffect(()=>{setConfirm(null);setLocalNotice('')},[approval?.id,canDecide])
  if (!approval || !row)
    return (
      <aside className="work-orders-detail">
        <div className="operations-empty">请选择一条审核记录</div>
      </aside>
    )
  return (
    <aside className="work-orders-detail wo-full-detail" aria-label="审核复核详情">
      <button className="operations-button" onClick={onClose}>← 返回我的待办</button>
      <header>
        <div>
          <h2>
            {approval.id} · {approval.title}
          </h2>
          <span>
            {row.station.name} · {TYPE_LABEL[approval.type]}
          </span>
        </div>
        <button
          className="operations-icon"
          aria-label="关闭详情"
          title="关闭详情"
          onClick={onClose}
        >
          <img src="/figma/work-orders/close.svg" alt=""/>
        </button>
      </header>
      <div className="work-orders-detail-body">
        <section className="work-orders-change">
          <h3>申请内容 · 冻结变更</h3>
          <strong>{approval.change || "系统未提供变更内容"}</strong>
          <dl className="wo-detail-grid">{[['审批对象',TYPE_LABEL[approval.type]],['生效窗口','未提供'],['审批版本','未提供'],['风险等级','未提供']].map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
          <p className="wo-boundary">预检结果及冻结版本未由当前接口提供。本次决定针对服务器中的当前申请，不代表策略已执行。</p>
          {DEMO_MODE && <span>
            SoC：{Math.round(row.station.soc)} % · 有功：
            {Math.round(row.station.activePower)} kW
          </span>}
        </section>
        <section className="work-orders-evidence">
          <h3>基本信息与审批记录</h3>
          <div><span>站点</span><strong>{row.station.name}</strong></div>
          <div><span>设备</span><strong>未关联设备</strong></div>
          <div>
            <span>提交人</span>
            <strong>{approval.submitter}</strong>
          </div>
          <div>
            <span>提交时间</span>
            <strong>{dateTime(approval.submittedAt)}</strong>
          </div>
          <div>
            <span>紧急程度</span>
            <strong
              className={
                approval.urgency === "urgent" ? "work-orders-urgent" : ""
              }
            >
              {DEMO_MODE ? URGENCY_LABEL[approval.urgency] : "未提供"}
            </strong>
          </div>
          <div>
            <span>当前状态</span>
            <ReviewBadge status={reviewState ?? approval.status} />
          </div>
          {approval.reviewer && <div><span>审核人</span><strong>{approval.reviewer}</strong></div>}
          <details><summary>独立复核：操作前后与会签</summary><p>操作前状态：未提供</p><p>操作后状态：未提供</p><p>会签记录：当前接口未提供</p></details>
        </section>
        <section className="work-orders-comment">
          <label>
            填写审批意见
            <textarea
              aria-label="审批意见"
              value={note}
              readOnly={busy || (!DEMO_MODE && (!canDecide || reviewState !== "pending"))}
              maxLength={2000}
              onChange={(event) => onNote(event.target.value)}
              placeholder="请输入审批意见或驳回原因..."
            />
          </label>
          <div>
            {DEMO_MODE && <button className="operations-button" onClick={onSaveNote}>
              <Check size={13} />
              保存意见
            </button>}
            {!DEMO_MODE && <span>{canDecide ? "审批意见将在提交审核决定时保存。" : "当前账号不能办理此审批。"}</span>}
            {notice && <span role="status">{notice}</span>}
          </div>
        </section>
      </div>
      <section className="work-orders-comment wo-detail-card">
        <label>本地补充要求草稿
          <textarea aria-label="本地补充要求草稿" value={supplement} disabled={!canDecide || busy}
            onChange={event => {setSupplement(event.target.value);setLocalNotice('')}} maxLength={2000} />
        </label>
        <p className="wo-boundary">与审批意见独立保存，仅当前账号可在本机恢复；尚未发送给申请人。</p>
        {reviewState !== 'pending' && <button className="operations-button" disabled={!canDecide || busy}
          onClick={() => setConfirm('supplement')}>保存本地补充草稿</button>}
      </section>
      <footer>
        {reviewState === "pending" ? (
          <>
            <button
              className="operations-button work-orders-reject"
              disabled={!canDecide || busy}
              onClick={() => setConfirm('rejected')}
            >
              驳回
            </button>
            <button className="operations-button" disabled={!canDecide || busy} onClick={()=>setConfirm('supplement')}>要求补充</button>
            <button
              className="operations-button work-orders-approve"
              disabled={!canDecide || busy}
              onClick={() => setConfirm('approved')}
            >
              {DEMO_MODE ? "同意（预览）" : "同意"}
              <ChevronRight size={13} />
            </button>
          </>
        ) : (
          <span className="work-orders-final-state">
            {REVIEW_STATUS[reviewState ?? approval.status]} · 审核操作已完成
          </span>
        )}
      </footer>
      {localNotice&&<p role="status">{localNotice}</p>}
      {confirm && <WorkflowConfirm
        busy={busy}
        title={confirm === 'approved' ? '批准这项申请？' : confirm === 'rejected' ? '驳回申请' : '要求补充材料'}
        label={confirm === 'approved' ? '确认批准' : confirm === 'rejected' ? '确认驳回' : '保存补充要求草稿'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!canDecide || busy) return
          if (!(confirm === 'supplement' ? supplement : note).trim()) {
            setLocalNotice('请填写审批意见或补充要求')
            return
          }
          if (confirm === 'supplement') {
            try {
              localStorage.setItem(supplementKey, JSON.stringify({note: supplement}))
              setSavedSupplement(supplement)
              setLocalNotice('补充要求草稿已保存；发送接口尚未接通，审批状态未改变')
              setConfirm(null)
            } catch { setLocalNotice('保存失败：本地存储不可用') }
          } else { onDecide(confirm); setConfirm(null) }
        }}>
        <p>{approval.id} · {approval.title}</p>
        <label>{confirm === 'rejected' ? '驳回原因' : confirm === 'supplement' ? '补充要求' : '审批意见'}
          <textarea aria-label={confirm === 'rejected' ? '驳回原因' : confirm === 'supplement' ? '补充要求' : '确认审批意见'}
            value={confirm === 'supplement' ? supplement : note}
            onChange={event => confirm === 'supplement' ? setSupplement(event.target.value) : onNote(event.target.value)} maxLength={2000}/>
        </label>
        {confirm === 'supplement' ? <p>当前只能保存本地草稿，不会发送给申请人。</p> : <p>本次决定仅针对当前提交的内容。</p>}
      </WorkflowConfirm>}
      {supplementLeave.dialog}
    </aside>
  )
}
