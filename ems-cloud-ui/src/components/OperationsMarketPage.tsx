import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DEMO_MODE } from "@/api/client"
import ApiMarketPage from "./ApiMarketPage"
import OperationsMarketResources from "./OperationsMarketResources"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import { ROLE_CONFIG } from "@/auth/roles"
import { useEditorLeaveGuard, type RegisterLeaveGuard } from "./useEditorLeaveGuard"
import { Modal } from "./station-provision/Common"
import { ArrowLeft, ArrowRight, Plus, TriangleAlert, X } from "lucide-react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Station } from "@/App"
import { stationsDataNow } from "@/data/dataClock"
import {
  finite,
  minuteLabel,
  operationsDate,
  timeMinute,
} from "@/data/operations"
import {
  MARKET_KINDS,
  marketServices,
  marketStation,
  marketTimeline,
  serviceLastDelivery,
  type MarketKind,
  type PortfolioService,
} from "@/data/stationMarket"
import "./operations-market.css"

const DECISIONS_KEY = "enerlution-market-response-decisions-v1"
const EVENTS_KEY = "enerlution-market-response-events-v1"
type Decision = {
  state: "accepted" | "rejected"
  capacities: Record<string, number>
  savedAt: string
}
type LocalEvent = {
  id: string
  name: string
  date: string
  kind: MarketKind
  start: string
  end: string
  capacity: number
  stationIds: string[]
}
type Participant = {
  station: Station
  capacity: number | null
  available: number | null
  actual: number | null
  status: string
}
type ResponseEvent = {
  key: string
  reference: string
  name: string
  date: string
  kind: MarketKind | null
  start: number | null
  end: number | null
  capacity: number | null
  status: string
  source: string
  participants: Participant[]
  service?: PortfolioService
  local?: boolean
}

function readStored<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback
  } catch {
    return fallback
  }
}
function rangeDays(start: string, end: string) {
  if (!start || !end || start > end) return []
  const result: string[] = []
  const date = new Date(`${start}T12:00:00`)
  while (operationsDate(date) <= end && result.length < 31) {
    result.push(operationsDate(date))
    date.setDate(date.getDate() + 1)
  }
  return result
}
function initialStart(now: Date) {
  const date = new Date(now)
  date.setDate(date.getDate() - 6)
  return operationsDate(date)
}
const power = (value: number | null | undefined) =>
  value == null ? "--" : `${Math.round(value).toLocaleString("zh-CN")} kW`
const statusName = (value: string) =>
  value === "等待开始" ? "待回复" : value === "正在交付" ? "执行中" : value

function ConfirmDialog({
  event,
  kind,
  total,
  onClose,
  onConfirm,
}: {
  event: ResponseEvent
  kind: "accepted" | "rejected"
  total: number
  onClose: () => void
  onConfirm: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  const accepted = kind === "accepted"
  return (
    <dialog
      ref={ref}
      className="market-confirm-dialog"
      aria-label={accepted ? "确认参与本次响应" : "拒绝本次邀约"}
      onCancel={onClose}
    >
      <button
        className="market-dialog-close"
        aria-label="关闭确认窗口"
        onClick={onClose}
      >
        <img src="/figma/operations/imgIconActionClose.svg" alt="" />
      </button>
      <span className="market-dialog-icon">
        <img src="/figma/operations/imgIconStatusWarning.svg" alt="" />
      </span>
      <h2>{accepted ? "确认参与本次响应?" : "拒绝本次邀约?"}</h2>
      <p>
        {event.name} · {event.date}{" "}
        {event.start === null
          ? ""
          : `${minuteLabel(event.start)}–${minuteLabel(event.end ?? 0)}`}
      </p>
      <strong>
        {accepted
          ? `参与容量 ${power(total)} / 需求 ${power(event.capacity)}`
          : "拒绝后本地预览将标记为不参与"}
      </strong>
      <div>
        <button className="operations-button" onClick={onClose}>
          取消
        </button>
        <button
          className="operations-button market-primary"
          onClick={onConfirm}
        >
          {accepted ? "确认参与" : "确认拒绝"}
        </button>
      </div>
    </dialog>
  )
}

export default function OperationsMarketPage({ stations, onOpenStation, registerLeaveGuard }: {
  stations: Station[]
  onOpenStation: (id: string, subNav?: string) => void
  registerLeaveGuard?: RegisterLeaveGuard
}) {
  const { user } = useAuth()
  return <ResponseWorkspace key={`${DEMO_MODE ? "demo" : "api"}:${user?.id}`} stations={stations} onOpenStation={onOpenStation} registerLeaveGuard={registerLeaveGuard} />
}
function ResponseWorkspace({ stations, onOpenStation, registerLeaveGuard }: {
  stations: Station[]
  onOpenStation: (id: string, subNav?: string) => void
  registerLeaveGuard?: RegisterLeaveGuard
}) {
  const { user } = useAuth()
  const servicesGuard = useRef<null | (() => Promise<boolean>)>(null)
  const registerServicesGuard = useCallback((guard: null | (() => Promise<boolean>)) => {servicesGuard.current = guard;registerLeaveGuard?.(guard)},[registerLeaveGuard])
  const [resourcesOpen,setResourcesOpen]=useState(false)
  const [servicesOpen, setServicesOpen] = useState(false)
  const permitted = (id: string) => DEMO_MODE ? !!user && ROLE_CONFIG[user.role].operationsTabs.includes("市场服务") : hasStationPermission(user, id, "market.manage")
  const manageable = stations.filter(s => permitted(s.id))
  const canManage = manageable.length > 0
  const decisionsKey = `${DECISIONS_KEY}:${DEMO_MODE ? "demo" : "api"}:${user?.id}`
  const eventsKey = `${EVENTS_KEY}:${DEMO_MODE ? "demo" : "api"}:${user?.id}`
  const [dirty, setDirty] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { requestLeave, settleLeave } = useEditorLeaveGuard({dirty, enabled:canManage, registerLeaveGuard:servicesOpen ? undefined : registerLeaveGuard, onConfirm:()=>setLeaving(true), onCancel:()=>setLeaving(false)})
  const leaveDialog = leaving && <Modal title="放弃未保存修改？" onClose={()=>{setLeaving(false);settleLeave(false)}} actions={<><button className="operations-button" onClick={()=>{setLeaving(false);settleLeave(false)}}>继续编辑</button><button className="operations-button market-primary" onClick={()=>{setLeaving(false);setDirty(false);settleLeave(true)}}>放弃修改</button></>}><p>参与功率或邀约草稿尚未保存。离开会丢失本次修改。</p></Modal>
  const [now] = useState(() => stationsDataNow(stations))
  const today = operationsDate(now)
  const [start, setStart] = useState(() => initialStart(now))
  const [end, setEnd] = useState(today)
  const [platform,setPlatform] = useState("")
  const [extraFilter,setExtraFilter] = useState(false)
  const [kind, setKind] = useState("")
  const [status, setStatus] = useState("")
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const [dialog, setDialog] = useState<"accepted" | "rejected" | null>(null)
  const [creating, setCreating] = useState(false)
  const [notice, setNotice] = useState("")
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() =>
    readStored(decisionsKey, {}),
  )
  const [localEvents, setLocalEvents] = useState<LocalEvent[]>(() => {
    const saved = readStored<unknown>(eventsKey, [])
    return Array.isArray(saved)
      ? saved.filter((event) => event && typeof event.id === "string" && typeof event.name === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.date) && typeof event.start === "string" && typeof event.end === "string" && finite(event.capacity) && event.capacity > 0 && Array.isArray(event.stationIds) && event.stationIds.every((id: unknown) => typeof id === "string"))
      : []
  })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [capacities, setCapacities] = useState<Record<string, number>>({})
  const [draft, setDraft] = useState({
    name: "",
    date: today,
    kind: "response" as MarketKind,
    start: "14:00",
    end: "16:00",
    capacity: "",
    stationIds: [] as string[],
  })
  const [formError, setFormError] = useState("")
  const days = useMemo(() => rangeDays(start, end), [start, end])
  const events = useMemo(() => {
    const fromServices: ResponseEvent[] = (DEMO_MODE ? days : []).flatMap((date) => {
      const rows = stations.map((station) => marketStation(station, date, now))
      return marketServices(rows).map((service) => ({
        key: service.key,
        reference:
          service.members[0]?.service.eventId ??
          service.members[0]?.service.id ??
          service.key,
        name: service.name,
        date,
        kind: service.kind,
        start: service.start,
        end: service.end,
        capacity: service.capacity,
        status: service.status,
        source: `${service.members[0]?.row.area ?? "未提供区域"} · ${
          service.kind === "reserve" ? "BSP" : "VPP"
        }`,
        participants: service.members.map(({ row, service: member }) => ({
          station: row.station,
          capacity: finite(member.capacity) ? member.capacity : null,
          available: row.capacity?.up ?? null,
          actual:
            serviceLastDelivery(
              { ...service, members: [{ row, service: member }] },
              date,
              now,
            )?.actual ?? null,
          status: member.status,
        })),
        service,
      }))
    })
    const fromLocal: ResponseEvent[] = localEvents
      .filter((event) => event.date >= start && event.date <= end && event.stationIds.some(id => stations.some(s => s.id === id)))
      .map((event) => ({
        key: event.id,
        reference: `LOCAL-${event.id.slice(0, 8)}`,
        name: event.name,
        date: event.date,
        kind: event.kind,
        start: timeMinute(event.start),
        end: timeMinute(event.end),
        capacity: event.capacity,
        status: "等待开始",
        source: "本地邀约草稿 · 未接入市场",
        participants: event.stationIds.flatMap((id) => {
          const station = stations.find((item) => item.id === id)
          if (!station) return []
          const row = marketStation(station, event.date, now)
          return [
            {
              station,
              capacity: event.capacity / event.stationIds.length,
              available: DEMO_MODE ? row.capacity?.up ?? null : null,
              actual: null,
              status: "待响应",
            },
          ]
        }),
        local: true,
      }))
    return [...fromLocal, ...fromServices].sort(
      (a, b) => b.date.localeCompare(a.date) || (b.start ?? 0) - (a.start ?? 0),
    )
  }, [days, stations, now, localEvents, start, end])
  const filtered = events.filter((event) => {
    const eventStatus =
      decisions[event.key]?.state === "accepted"
        ? "已确认"
        : decisions[event.key]?.state === "rejected"
          ? "已拒绝"
          : statusName(event.status)
    return (!platform || event.source===platform) && (!kind || event.kind === kind) && (!status || eventStatus === status)
  })
  const detail = events.find((event) => event.key === detailKey)
  const selectedTotal = selectedIds.reduce(
    (total, id) => total + (capacities[id] ?? 0),
    0,
  )
  const canRespond = canManage && detail?.status === "等待开始" && !decisions[detail.key]
  const detailTimeline = detail?.service
    ? marketTimeline([], [detail.service], detail.date, now)
    : []

  useEffect(() => {
    const invalidate = !canManage || (detail && detail.participants.some(p => !permitted(p.station.id)))
    if (invalidate) { setDialog(null); setCreating(false); setDirty(false); setSelectedIds([]); setCapacities({}); setDetailKey(null) }
  }, [canManage, stations.map(s=>`${s.id}:${permitted(s.id)}`).join("|")])
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) {event.preventDefault();event.returnValue=""} }
    window.addEventListener("beforeunload",beforeUnload)
    return () => window.removeEventListener("beforeunload",beforeUnload)
  }, [dirty])
  function openDetail(event: ResponseEvent) {
    setDirty(false)
    setDetailKey(event.key)
    setNotice("")
    const available = event.participants.filter(
      (member) => member.available !== null && member.available > 0,
    )
    setSelectedIds(available.map((member) => member.station.id))
    setCapacities(
      Object.fromEntries(
        available.map((member) => [
          member.station.id,
          Math.floor(Math.min(member.capacity ?? 0, member.available ?? 0)),
        ]),
      ),
    )
  }
  function decide(value: "accepted" | "rejected") {
    if (!detail || !canRespond || detail.participants.some(p => !permitted(p.station.id))) return
    const next = {
      ...decisions,
      [detail.key]: {
        state: value,
        capacities:
          value === "accepted"
            ? Object.fromEntries(
                selectedIds.map((id) => [id, capacities[id] ?? 0]),
              )
            : {},
        savedAt: new Date().toISOString(),
      },
    } satisfies Record<string, Decision>
    try {
      localStorage.setItem(decisionsKey, JSON.stringify(next))
      setDirty(false)
      setDecisions(next)
      setNotice(
        value === "accepted"
          ? "参与意向已保存至本机，未向市场或设备提交"
          : "拒绝意向已保存至本机，未向市场提交",
      )
    } catch {
      setNotice("保存失败：浏览器本地存储不可用")
    }
    setDialog(null)
  }
  function createEvent() {
    const capacity = Number(draft.capacity)
    if (
      !canManage ||
      !draft.name.trim() ||
      draft.stationIds.some(id => !permitted(id)) ||
      !draft.date ||
      draft.date < today ||
      (draft.date === today &&
        timeMinute(draft.start) <= now.getHours() * 60 + now.getMinutes()) ||
      !(timeMinute(draft.start) < timeMinute(draft.end)) ||
      !finite(capacity) ||
      capacity <= 0 ||
      !draft.stationIds.length
    ) {
      setFormError("请填写事件名称、有效时段、需求容量并选择参与站点")
      return
    }
    const event: LocalEvent = {
      id: crypto.randomUUID(),
      name: draft.name.trim(),
      date: draft.date,
      kind: draft.kind,
      start: draft.start,
      end: draft.end,
      capacity,
      stationIds: draft.stationIds,
    }
    try {
      const next = [...localEvents, event]
      localStorage.setItem(eventsKey, JSON.stringify(next))
      setDirty(false)
      setLocalEvents(next)
      setStart((current) => (current > event.date ? event.date : current))
      setEnd((current) => (current < event.date ? event.date : current))
      setCreating(false)
      setNotice("响应事件已保存为本地预览，未发布到市场")
      setFormError("")
    } catch {
      setFormError("保存失败：浏览器本地存储不可用")
    }
  }

  if (detail) {
    const decision = decisions[detail.key]
    const active = detail.status === "正在交付" || detail.status === "已完成"
    return (
      <div className="market-page market-detail-page">
        <button
          className="operations-button market-back"
          onClick={() => { void (async()=>{if(await requestLeave()){setDetailKey(null);setNotice("");setDirty(false)}})() }}
        >
          <ArrowLeft size={15} />
          返回事件列表
        </button>
        <p className="market-boundary">邀约参与与拒绝接口尚未接通。当前仅保存本地意向，不代表平台已确认或设备已执行。</p>
        <section
          className="market-surface market-event-info"
          aria-label="响应事件信息"
        >
          <div className="market-heading">
            <h2>{detail.name}</h2>
            <span
              className={
                active ? "market-event-state is-active" : "market-event-state"
              }
            >
              {decision
                ? decision.state === "accepted"
                  ? "参与意向草稿 · 未提交"
                  : "拒绝意向草稿 · 未提交"
                : statusName(detail.status)}
            </span>
          </div>
          <dl>
            <div>
              <dt>来源平台</dt>
              <dd>{detail.source}</dd>
            </div>
            <div>
              <dt>执行时间</dt>
              <dd>
                {detail.date}{" "}
                {detail.start === null
                  ? "--"
                  : `${minuteLabel(detail.start)}–${minuteLabel(detail.end ?? 0)}`}
              </dd>
            </div>
            <div>
              <dt>{active ? "目标放电功率" : "请求功率"}</dt>
              <dd>{power(detail.capacity)}</dd>
            </div>
            <div>
              <dt>响应方式</dt>
              <dd>{detail.kind ? MARKET_KINDS[detail.kind] : "--"}</dd>
            </div>
            <div>
              <dt>{active ? "设备回执" : "回复截止"}</dt>
              <dd>未提供</dd>
            </div>
            <div>
              <dt>事件编号</dt>
              <dd>{detail.reference}</dd>
            </div>
          </dl>
        </section>

        {active && (
          <section
            className="market-surface market-delivery"
            aria-label="响应执行功率"
          >
            <div className="market-heading">
              <h2>
                响应执行功率 <small>（kW）</small>
              </h2>
              <span>实测功率 · 承诺功率</span>
            </div>
            <div
              className="market-delivery-chart"
              data-testid="market-delivery-chart"
            >
              {detailTimeline.some(
                (point) => point.actual !== null || point.committed !== null,
              ) ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart
                    data={detailTimeline}
                    margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid vertical={false} stroke="var(--ui-border)" />
                    <XAxis
                      dataKey="minute"
                      type="number"
                      domain={[detail.start ?? 0, detail.end ?? 1440]}
                      ticks={[detail.start ?? 0, detail.end ?? 1440]}
                      tickFormatter={minuteLabel}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--ui-muted)", fontSize: 12 }}
                    />
                    <YAxis
                      width={46}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "var(--ui-muted)", fontSize: 12 }}
                    />
                    <Tooltip
                      labelFormatter={(value) => minuteLabel(Number(value))}
                      formatter={(value, name) => [power(Number(value)), name]}
                    />
                    {detail.capacity !== null && (
                      <ReferenceLine
                        y={detail.capacity}
                        stroke="var(--ui-chart-secondary)"
                        strokeDasharray="4 4"
                      />
                    )}
                    <Line
                      dataKey="actual"
                      name="实测功率"
                      stroke="var(--ui-primary)"
                      strokeWidth={2}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="operations-empty">暂无有效执行采样</div>
              )}
            </div>
          </section>
        )}

        {decision?.state === "rejected" ? <section className="market-surface"><h2>已保存拒绝意向</h2><p>本地保存时间 {new Date(decision.savedAt).toLocaleString()}</p><p className="market-boundary">未发送来源平台，邀约状态尚未改变。</p></section> : <>
        <section
          className="market-surface market-participants"
          aria-label={active ? "参与站点" : "参与站点与功率"}
        >
          <h2>{active ? "参与站点" : "参与站点与功率"}</h2>
          <div className="operations-table-scroll">
            <table>
              <thead>
                <tr>
                  {!active && !decision && <th>选择</th>}
                  {[
                    "站点",
                    active ? "目标响应需求" : "当前 SOC",
                    active ? "实际响应功率" : "可调度功率",
                    ...(active ? ["设备回执", "执行状态"] : ["参与功率"]),
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {detail.participants.map((member) => {
                  const checked = selectedIds.includes(member.station.id)
                  return (
                    <tr key={member.station.id}>
                      {!active && !decision && (
                        <td>
                          <label className="market-selection">
                          <input
                            type="checkbox"
                            aria-label={`选择${member.station.name}`}
                            checked={checked}
                            disabled={
                              !canRespond ||
                              member.available === null ||
                              member.available <= 0
                            }
                            onChange={(event) => {setDirty(true);
                              setSelectedIds((current) =>
                                event.target.checked
                                  ? [...current, member.station.id]
                                  : current.filter(
                                      (id) => id !== member.station.id,
                                    ),
                              )
                            }}
                          />
                          <img alt="" src={`/figma/operations/${checked ? "imgSelectionCheckedStateDefault" : "imgSelectionUncheckedStateDefault"}.svg`} />
                          </label>
                        </td>
                      )}
                      <td>
                        <button
                          className="operations-link market-station-link"
                          onClick={() => {void(async()=>{if(await requestLeave()) onOpenStation(member.station.id)})()}}
                        >
                          {member.station.name}
                        </button>
                      </td>
                      <td>
                        {active
                          ? power(member.capacity)
                          : `${member.station.soc}%`}
                      </td>
                      <td>
                        {active
                          ? power(member.actual)
                          : power(member.available)}
                      </td>
                      {active && <td>未接入</td>}
                      <td>
                        {active ? (
                          statusName(member.status)
                        ) : decision?.state === "accepted" ? (
                          power(decision.capacities[member.station.id] ?? 0)
                        ) : (
                          <input
                            className="market-capacity-input"
                            aria-label={`${member.station.name}参与功率`}
                            type="number"
                            min={0}
                            max={member.available ?? 0}
                            value={capacities[member.station.id] ?? 0}
                            disabled={!canRespond || !checked}
                            step="1"
                            onChange={(event) => {setDirty(true);
                              setCapacities((current) => ({
                                ...current,
                                [member.station.id]: Number(event.target.value),
                              }))
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!detail.participants.length && (
            <div className="operations-empty">暂无可参与站点</div>
          )}
          {!active && !decision && (
            <div className="market-participation-total">
              已选 {selectedIds.length} 个站点{" "}
              <span>
                参与合计 {power(selectedTotal)} / 请求 {power(detail.capacity)}
                {detail.capacity !== null && selectedTotal < detail.capacity && `，还需分配 ${power(detail.capacity - selectedTotal)}`}
              </span>
            </div>
          )}
        </section>
        </>}
        {canRespond && detail.participants.some(p => p.available === null) && <p className="market-notice">可用功率未知，不能确认参与；额定功率不能代替实时可用功率。</p>}
        {canRespond && (
          <div className="market-detail-actions">
            <button
              className="operations-button"
              onClick={() => setDialog("rejected")}
            >
              拒绝邀约
            </button>
            <button
              className="operations-button market-primary"
              disabled={
                !selectedIds.length ||
                selectedTotal <= 0 ||
                (detail.capacity === null || selectedTotal < detail.capacity || selectedTotal > detail.capacity) ||
                selectedIds.some(
                  (id) =>
                    !finite(capacities[id]) ||
                    capacities[id] <= 0 ||
                    capacities[id] >
                      (detail.participants.find(
                        (member) => member.station.id === id,
                      )?.available ?? 0),
                )
              }
              onClick={() => setDialog("accepted")}
            >
              确认参与
            </button>
          </div>
        )}
        {notice && (
          <p className="market-notice" role="status">
            {notice}
          </p>
        )}
        {leaveDialog}
        {dialog && (
          <ConfirmDialog
            event={detail}
            kind={dialog}
            total={selectedTotal}
            onClose={() => setDialog(null)}
            onConfirm={() => decide(dialog)}
          />
        )}
      </div>
    )
  }

  if (resourcesOpen) return <OperationsMarketResources stations={stations} onBack={()=>setResourcesOpen(false)} />
  if (servicesOpen) return <div><div className="ops-subview-toolbar"><button className="operations-button" onClick={()=>{void(async()=>{if(await (servicesGuard.current?.() ?? Promise.resolve(true)))setServicesOpen(false)})()}}>返回市场响应</button></div><ApiMarketPage stations={stations} registerLeaveGuard={registerServicesGuard} /></div>
  return (
    <div className="market-page">
      <section className="market-toolbar" aria-label="响应事件筛选">
        <div className="market-range">
          <input
            aria-label="事件开始日期"
            type="date"
            value={start}
            max={end}
            onChange={(event) => setStart(event.target.value)}
          />
          <span>—</span>
          <input
            aria-label="事件结束日期"
            type="date"
            value={end}
            min={start}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
        <select aria-label="来源平台" value={platform} onChange={e=>setPlatform(e.target.value)}><option value="">全部来源平台</option>{[...new Set(events.map(e=>e.source))].map(p=><option key={p}>{p}</option>)}</select>
        <select
          aria-label="响应事件类型"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="">全部事件类型</option>
          {Object.entries(MARKET_KINDS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button className="operations-button" onClick={()=>{setExtraFilter(!extraFilter);setStatus("")}} aria-expanded={extraFilter}>＋ 新增筛选条件</button>
        {extraFilter && <select
          aria-label="响应事件状态"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">全部事件状态</option>
          {["待回复", "执行中", "已完成", "已取消", "已确认", "已拒绝"].map(
            (value) => (
              <option key={value}>{value}</option>
            ),
          )}
        </select>}
        {canManage && <button
          className="operations-button market-new"
          onClick={() => setCreating(true)}
        >
          <Plus size={15} />
          新建本地邀约草稿
        </button>}
        <button className="operations-button" onClick={()=>setResourcesOpen(true)}>资源与交付</button>
        {!DEMO_MODE && <button className="operations-button" onClick={()=>setServicesOpen(true)}>市场服务</button>}
      </section>
      <p className="market-boundary">{DEMO_MODE ? "演示数据与本地草稿，均不提交外部市场。" : "市场邀约接口尚未接通；响应事件为空。可手动准备本地草稿，既有市场服务与资格由业务服务器提供。"}</p>
      <section
        className="market-surface market-event-list"
        aria-label="响应事件"
      >
        <div className="market-heading">
          <h2>响应事件</h2>
          <span>
            全部 {events.length}　待回复{" "}
            {
              events.filter(
                (event) => event.status === "等待开始" && !decisions[event.key],
              ).length
            }
            　执行中{" "}
            {events.filter((event) => event.status === "正在交付").length}
          </span>
        </div>
        <div className="operations-table-scroll market-event-scroll">
          <table>
            <thead>
              <tr>
                {[
                  "事件 / 类型",
                  "来源平台",
                  "执行时间",
                  "请求功率",
                  "参与站点",
                  "状态",
                  "操作",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.key}>
                  <td>
                    <strong>{event.name}</strong>
                    <small>
                      {event.kind ? MARKET_KINDS[event.kind] : "其他服务"}
                    </small>
                  </td>
                  <td>{event.source}</td>
                  <td>
                    {event.date.slice(5)}{" "}
                    {event.start === null
                      ? "--"
                      : `${minuteLabel(event.start)}–${minuteLabel(event.end ?? 0)}`}
                  </td>
                  <td>{power(event.capacity)}</td>
                  <td>{event.participants.length} 个站点</td>
                  <td>
                    {decisions[event.key]
                      ? decisions[event.key].state === "accepted"
                        ? "参与意向草稿 · 未提交"
                        : "拒绝意向草稿 · 未提交"
                      : statusName(event.status)}
                  </td>
                  <td>
                    <button
                      className="operations-link"
                      onClick={() => openDetail(event)}
                    >
                      {event.status === "等待开始" && !decisions[event.key] ? "处理邀约" : event.status === "正在交付" ? "查看执行" : "查看详情"} <ArrowRight size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="operations-empty">所选范围暂无响应事件</div>
        )}
        <footer>共 {filtered.length} 条</footer>
      </section>
      {notice && (
        <p className="market-notice" role="status">
          {notice}
        </p>
      )}
      {creating && canManage && (
        <NewEventDialog
          stations={manageable}
          draft={draft}
          error={formError}
          onChange={(patch) => {
            setDirty(true)
            setDraft((current) => ({ ...current, ...patch }))
            setFormError("")
          }}
          onClose={() => { void(async()=>{if(await requestLeave()){setCreating(false);setFormError("");setDirty(false);setDraft({name:"",date:today,kind:"response",start:"14:00",end:"16:00",capacity:"",stationIds:[]})}})() }}
          onSave={createEvent}
        />
      )}
      {leaveDialog}
    </div>
  )
}

function NewEventDialog({
  stations,
  draft,
  error,
  onChange,
  onClose,
  onSave,
}: {
  stations: Station[]
  draft: {
    name: string
    date: string
    kind: MarketKind
    start: string
    end: string
    capacity: string
    stationIds: string[]
  }
  error: string
  onChange: (patch: Partial<typeof draft>) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <Modal title="新建本地邀约草稿" onClose={onClose} actions={<><button className="operations-button" onClick={onClose}>取消</button><button className="operations-button market-primary" onClick={onSave}>保存本地草稿</button></>}>
      <p className="market-boundary">手动记录，仅保存在当前账号的本机浏览器，不发布市场事件。</p>
      <div className="market-create-fields">
        <label>
          事件名称
          <input
            value={draft.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        <label>
          服务类型
          <select
            value={draft.kind}
            onChange={(event) =>
              onChange({ kind: event.target.value as MarketKind })
            }
          >
            {Object.entries(MARKET_KINDS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          响应日期
          <input
            type="date"
            value={draft.date}
            onChange={(event) => onChange({ date: event.target.value })}
          />
        </label>
        <label>
          需求容量 kW
          <input
            type="number"
            min="1"
            value={draft.capacity}
            onChange={(event) => onChange({ capacity: event.target.value })}
          />
        </label>
        <label>
          开始时间
          <input
            type="time"
            value={draft.start}
            onChange={(event) => onChange({ start: event.target.value })}
          />
        </label>
        <label>
          结束时间
          <input
            type="time"
            value={draft.end}
            onChange={(event) => onChange({ end: event.target.value })}
          />
        </label>
        <fieldset>
          <legend>参与站点</legend>
          {stations
            .filter((station) => station.status !== "building")
            .map((station) => (
              <label key={station.id}>
                <input
                  type="checkbox"
                  checked={draft.stationIds.includes(station.id)}
                  onChange={(event) =>
                    onChange({
                      stationIds: event.target.checked
                        ? [...draft.stationIds, station.id]
                        : draft.stationIds.filter((id) => id !== station.id),
                    })
                  }
                />
                {station.name}
              </label>
            ))}
        </fieldset>
        {error && (
          <p role="alert" className="market-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
