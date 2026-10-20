import {SquarePen, Trash2} from "lucide-react"
import {
  useEditorLeaveGuard,
  type RegisterLeaveGuard,
} from "./useEditorLeaveGuard"
import { loadPoints, type MeasurementPoint } from "./apiAnalytics"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Station } from "@/App"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import {
  alarmRuleHistory,
  alarmRuleOptions,
  deleteAlarmRule,
  listAlarmRules,
  saveAlarmRule,
  toggleAlarmRule,
  type AlarmRuleDraft,
  type AlarmRuleRow,
} from "@/api/alarmWorkspace"
import {
  conditionOperators,
  emptyCondition,
  type Condition,
} from "@/data/alarmRules"
const timeLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
const toMinute = (text: string) => {
  const [h, m] = text.split(":").map(Number)
  return h * 60 + m
}
const levels = {
  critical: "紧急",
  warning: "重要",
  minor: "次要",
  info: "提示",
}
const evaluationLabels: Record<string, string> = {
  ready: "待检测",
  disabled: "检测停用",
  unsupported: "暂不支持",
  waiting: "等待采样",
  active: "告警中",
  normal: "正常",
  unknown: "无法判定",
}
const evaluationLabel = (status: string) =>
  Object.prototype.hasOwnProperty.call(evaluationLabels, status)
    ? evaluationLabels[status]
    : "检测状态未知"
const deliveryLabel = (status: string) =>
  status === "not_connected" ? "通知未接通" : "通知状态未知"
function draftOf(row: AlarmRuleRow): AlarmRuleDraft {
  return {
    stationId: row.station_id,
    name: row.name,
    objectType: row.object_type,
    deviceId: row.device_id,
    severity: row.severity,
    conditions: row.conditions,
    effectiveStart: row.effective_start,
    effectiveEnd: row.effective_end,
    autoRecoveryDuration: row.auto_recovery_duration_hours ?? 48,
    recoveryDuration: row.recovery_duration,
    solution: row.solution,
    notification: row.notification,
    expectedVersion: row.version,
  }
}
export default function AlarmRulesPage({
  stationId,
  stations = [],
  registerLeaveGuard,
}: {
  stationId?: string
  stations?: Station[]
  registerLeaveGuard?: RegisterLeaveGuard
}) {
  const { user } = useAuth()
  const [updatedDescending, setUpdatedDescending] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const filtered = (items: AlarmRuleRow[]) =>
    items
      .filter((row) =>
        row.name
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()),
      )
      .sort((a, b) => {
        const difference =
          (new Date(a.updated_at ?? 0).getTime() || 0) -
          (new Date(b.updated_at ?? 0).getTime() || 0)
        return updatedDescending ? -difference : difference
      })
  const [rows, setRows] = useState<AlarmRuleRow[]>([])
  const visibleRows = filtered(rows)
  const pageCount = Math.max(1,Math.ceil(visibleRows.length/pageSize))
  const currentPage = Math.max(0,Math.min(page,pageCount-1))
  useEffect(()=>{if(page!==currentPage)setPage(currentPage)},[page,currentPage])
  const [scope, setScope] = useState(stationId ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<AlarmRuleDraft | null>(null)
  const [leaveConfirm, setLeaveConfirm] = useState(false)
  const [conditionDraft, setConditionDraft] = useState<Condition | null>(null)
  const [conditionIndex, setConditionIndex] = useState<number | null>(null)
  const [pointOptions, setPointOptions] = useState<MeasurementPoint[]>([])
  const [pointError, setPointError] = useState("")
  const [editing, setEditing] = useState<number | undefined>()
  const [detail, setDetail] = useState<AlarmRuleRow | null>(null)
  const [history, setHistory] = useState<{
    id: number
    action: string
    version: number
    occurred_at: string
  }[]>([])
  const [options, setOptions] = useState<{
    devices: {
      id: number
      name: string
    }[]
    recipients: {
      id: number
      display_name: string
    }[]
  }>({ devices: [], recipients: [] })
  const [confirmDelete, setConfirmDelete] = useState<AlarmRuleRow | null>(null)
  const listRequest = useRef(0)
  const historyRequest = useRef(0)
  const optionsRequest = useRef(0)
  const contextRequest = useRef(0)
  const mutationActive = useRef(false)
  const clearDraft = () => {
    setDraft(null)
    setConditionDraft(null)
    setConditionIndex(null)
    setEditing(undefined)
  }
  const { requestLeave, settleLeave } = useEditorLeaveGuard({
    dirty: !!draft || busy,
    enabled:
      !!draft && hasStationPermission(user, draft.stationId, "alarm.handle"),
    registerLeaveGuard,
    onConfirm: () => setLeaveConfirm(true),
    onCancel: () => setLeaveConfirm(false),
  })
  const closeDraft = async () => {
    if (await requestLeave()) clearDraft()
  }
  useEffect(() => {
    if (!draft) return
    const before = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", before)
    return () => window.removeEventListener("beforeunload", before)
  }, [draft])
  const eligible = stations.filter((s) =>
    hasStationPermission(user, s.id, "alarm.handle"),
  )
  useEffect(() => {
    const controller = new AbortController()
    setPointOptions([])
    setPointError("")
    if (
      draft?.stationId &&
      draft.objectType === "DEVICE" &&
      draft.deviceId &&
      hasStationPermission(user, draft.stationId, "telemetry.read")
    ) {
      loadPoints(String(draft.stationId), controller.signal)
        .then((points) => {
          if (!controller.signal.aborted)
            setPointOptions(
              points.filter(
                (point) =>
                  point.device_id === String(draft.deviceId) &&
                  point.code !== undefined,
              ),
            )
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setPointError(e instanceof Error ? e.message : "测点加载失败")
        })
    }
    return () => controller.abort()
  }, [draft?.stationId, draft?.deviceId, draft?.objectType, user])
  const load = useCallback(async () => {
    const seq = ++listRequest.current
    setError("")
    try {
      const result = await listAlarmRules(scope || undefined)
      if (seq === listRequest.current) setRows(result)
    } catch (e) {
      if (seq === listRequest.current) {
        setRows([])
        setError((e as Error).message)
      }
    }
  }, [scope, user])
  useEffect(() => {
    setScope(stationId ?? "")
  }, [stationId])
  useEffect(() => {
    setPage(0)
  }, [scope])
  useEffect(() => {
    setRows([])
    void load()
    return () => {
      listRequest.current++
    }
  }, [load])
  useEffect(() => {
    contextRequest.current++
    historyRequest.current++
    optionsRequest.current++
    setDetail(null)
    setDraft(null)
    setConditionDraft(null)
    setEditing(undefined)
    setConfirmDelete(null)
    setHistory([])
    setOptions({ devices: [], recipients: [] })
    setBusy(false)
    mutationActive.current = false
    return () => {
      contextRequest.current++
      historyRequest.current++
      optionsRequest.current++
    }
  }, [scope, stationId, user])
  useEffect(() => {
    const seq = ++optionsRequest.current
    setOptions({ devices: [], recipients: [] })
    if (
      draft?.stationId &&
      hasStationPermission(user, draft.stationId, "alarm.handle")
    ) {
      alarmRuleOptions(draft.stationId)
        .then((result) => {
          if (seq === optionsRequest.current) setOptions(result)
        })
        .catch((e) => {
          if (seq === optionsRequest.current) setError(e.message)
        })
    }
    return () => {
      optionsRequest.current++
    }
  }, [draft?.stationId, user])
  const update = (patch: Partial<AlarmRuleDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d))
  const condition = (_index: number, patch: Partial<Condition>) =>
    setConditionDraft((c) => (c ? { ...c, ...patch } : c))
  function saveCondition() {
    if (!conditionDraft || !draft) return
    if (
      conditionDraft.fields.some((field) => !field.code.trim()) ||
      (conditionDraft.fields[0]?.code === "deviceStatus"
        ? !conditionDraft.statusValue
        : !conditionDraft.extend1 && conditionDraft.lower === null)
    ) {
      setError("请完整填写报警指标及阈值")
      return
    }
    const conditions =
      conditionIndex === null
        ? [...draft.conditions, conditionDraft]
        : draft.conditions.map((c, i) =>
            i === conditionIndex ? conditionDraft : c,
          )
    update({ conditions })
    setConditionDraft(null)
    setError("")
  }
  function create() {
    const id = Number(stationId || scope || eligible[0]?.id)
    if (!id) return
    setConditionDraft(null)
    setConditionIndex(null)
    setEditing(undefined)
    setError("")
    setDraft({
      stationId: id,
      name: "",
      objectType: "STATION",
      deviceId: null,
      severity: "info",
      conditions: [],
      effectiveStart: 0,
      effectiveEnd: 1440,
      autoRecoveryDuration: 48,
      recoveryDuration: 0,
      solution: "",
      notification: {
        needed: false,
        maxCount: 10,
        channels: [],
        recipients: [],
        recoveryNotice: false,
      },
      expectedVersion: 0,
    })
  }
  async function perform(work: () => Promise<unknown>, onSuccess?: () => void) {
    if (mutationActive.current) return
    mutationActive.current = true
    const context = contextRequest.current
    historyRequest.current++
    setDetail(null)
    setHistory([])
    setBusy(true)
    setError("")
    try {
      await work()
      if (context !== contextRequest.current) return
      onSuccess?.()
      await load()
    } catch (e) {
      if (context === contextRequest.current) setError((e as Error).message)
    } finally {
      if (context === contextRequest.current) {
        mutationActive.current = false
        setBusy(false)
      }
    }
  }
  return (
    <div>
      {leaveConfirm && (
        <div
          className="alarm-business-workspace-dialog alarm-leave-confirm"
          role="dialog"
          aria-modal="true"
          aria-label="放弃报警规则草稿"
        >
          <h2>放弃报警规则草稿</h2>
          <p>
            {busy
              ? "正在提交，请等待请求完成。"
              : "离开会丢失未提交的规则和条件，是否放弃修改？"}
          </p>
          <button
            onClick={() => {
              setLeaveConfirm(false)
              settleLeave(false)
            }}
          >
            继续编辑
          </button>
          <button
            disabled={busy}
            onClick={() => {
              clearDraft()
              setLeaveConfirm(false)
              settleLeave(true)
            }}
          >
            放弃修改
          </button>
        </div>
      )}
      <div className="alarm-page-heading alarm-rules-heading">
        <strong title="检测状态以服务端结果为准；外部通知尚未接通">报警规则</strong>
        <input
          aria-label="报警规则名称搜索"
          placeholder="请输入报警规则名称"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(0)
          }}
        />
        <button disabled={busy || !eligible.length} onClick={create}>
          + 新增报警规则
        </button>
      {!stationId && (
        <details className="alarm-rules-scope"><summary>筛选</summary><div>
          <select
            aria-label="规则站点筛选"
            value={scope}
            onChange={async (e) => {
              const value = e.target.value
              if (await requestLeave()) setScope(value)
            }}
          >
            <option value="">全部授权站点</option>
            {stations
              .filter((s) => hasStationPermission(user, s.id, "alarm.read"))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <button onClick={() => void load()}>刷新规则</button>
        </div></details>
      )}
      </div>
      {error && (
        <p role="alert" className="alarm-business-workspace-error">
          {error}
        </p>
      )}
      <div className="alarm-list-card alarm-rules-list"><div className="alarm-business-workspace-table">
        <table>
          <thead>
            <tr>
              {[
                "启用状态",
                "报警规则名称",
                "条件",
                "报警等级",
                "报警对象",
                "生效时间（UTC）",
                "最后更新时间",
                "最后更新用户",
                "操作",
              ].map((x) => (
                <th
                  key={x}
                  aria-sort={
                    x === "最后更新时间"
                      ? updatedDescending
                        ? "descending"
                        : "ascending"
                      : undefined
                  }
                >
                  {x === "最后更新时间" ? (
                    <button
                      onClick={() => {
                        setUpdatedDescending(!updatedDescending)
                        setPage(0)
                      }}
                    >
                      {x} {updatedDescending ? "↓" : "↑"}
                    </button>
                  ) : (
                    x
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows
              .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    <button
                      role="switch"
                      aria-label={`启用规则 ${r.name}`}
                      aria-checked={r.enabled}
                      disabled={
                        busy ||
                        !hasStationPermission(
                          user,
                          r.station_id,
                          "alarm.handle",
                        )
                      }
                      onClick={() => void perform(() => toggleAlarmRule(r))}
                    >
                      <span className="alarm-switch-knob" />
                    </button>
                  </td>
                  <td><button
                      disabled={busy}
                      onClick={() => {
                        if (mutationActive.current) return
                        const seq = ++historyRequest.current
                        setDetail(r)
                        setHistory([])
                        alarmRuleHistory(r.id)
                          .then((result) => {
                            if (seq === historyRequest.current)
                              setHistory(result)
                          })
                          .catch((e) => {
                            if (seq === historyRequest.current)
                              setError(e.message)
                          })
                      }}
                    >
                      {r.name}
                    </button></td>
                  <td className="alarm-rule-condition-summary">
                    {r.conditions.map((c, i) => (
                      <div key={i}>
                        {i + 1}、{c.fields.map((f) => f.code).join(" / ")} ·
                        连续{c.period}个周期 · {conditionOperators[c.operator]}{" "}
                        {c.statusValue ?? c.lower ?? "—"} {c.fields[0]?.unit}
                      </div>
                    ))}
                  </td>
                  <td><span className={`alarm-business-workspace-level ${r.severity}`}>{levels[(r.severity as keyof typeof levels)]}</span></td>
                  <td>
                    {r.object_type === "STATION" ? "场站" : "设备"}
                    <small>{r.station_name}</small>
                  </td>
                  <td>
                    每天{timeLabel(r.effective_start)} ~{" "}
                    {timeLabel(r.effective_end)}
                  </td>
                  <td>
                    {r.updated_at
                      ? new Date(r.updated_at).toLocaleString()
                      : "—"}
                  </td>
                  <td>{r.updated_by_name || "—"}</td>
                  <td>

                    {hasStationPermission(
                      user,
                      r.station_id,
                      "alarm.handle",
                    ) && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => {
                            setConditionDraft(null)
                            setConditionIndex(null)
                            setEditing(r.id)
                            setDraft(draftOf(r))
                            setError("")
                          }}
                        >
                          <SquarePen size={14} aria-label="编辑"/>
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => setConfirmDelete(r)}
                        >
                          <Trash2 size={14} aria-label="删除"/>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!visibleRows.length && (
          <p className="alarm-business-workspace-empty">暂无告警规则</p>
        )}
      </div>
      <div className="alarm-business-workspace-pagination">
        <span>共{visibleRows.length}条</span>
        <button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
          上一页
        </button>
        <span>{currentPage + 1}</span>
        <button
          disabled={currentPage + 1 >= pageCount}
          onClick={() => setPage(currentPage + 1)}
        >
          下一页
        </button>
        <select
          aria-label="规则每页条数"
          value={pageSize}
          onChange={(e) => {
            setPageSize(Number(e.target.value))
            setPage(0)
          }}
        >
          {[20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} 条/页
            </option>
          ))}
        </select>
      </div>
      </div>
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="删除告警规则"
          className="alarm-business-workspace-dialog"
        >
          <h2>删除规则「{confirmDelete.name}」</h2>
          <p>规则将软删除，历史版本和审计保留。</p>
          <button
            disabled={busy}
            onClick={() =>
              void perform(
                () => deleteAlarmRule(confirmDelete),
                () => setConfirmDelete(null),
              )
            }
          >
            确认删除
          </button>
          <button disabled={busy} onClick={() => setConfirmDelete(null)}>
            取消
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      )}
      {detail && (
        <div
          className="alarm-business-workspace-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="规则详情"
        >
          <div className="alarm-business-workspace-dialog-head">
            <h2>{detail.name}</h2>
            <button
              onClick={() => {
                historyRequest.current++
                setDetail(null)
                setHistory([])
              }}
            >
              关闭详情
            </button>
          </div>
          <p>
            <span>检测：{evaluationLabel(detail.evaluationStatus)}</span> ·{" "}
            <span>{detail.evaluationReason || "暂无检测说明"}</span>
          </p>
          <p>
            默认恢复周期 {detail.auto_recovery_duration_hours ?? 48} 小时（执行未接通）；连续正常采样恢复时长 {detail.recovery_duration} 秒 ·{" "}
            {detail.notification.needed ? "已配置通知" : "未配置通知"} ·
            {deliveryLabel(detail.deliveryStatus)}
          </p>
          <p>处置方案：{detail.solution || "未配置"}</p>
          <h3>条件</h3>
          {detail.conditions.map((c, i) => (
            <p key={i}>
              {c.fields.map((f) => f.code).join(" / ")} · {c.algorithm} · 连续{" "}
              {c.period} 个完整分钟 · {conditionOperators[c.operator]} ·{" "}
              {c.lower ?? "不限"}–{c.upper ?? "不限"} · {c.statusValue ?? ""} ·
              下界{c.includeLower ? "包含" : "不含"} / 上界
              {c.includeUpper ? "包含" : "不含"}
            </p>
          ))}
          <h3>版本记录</h3>
          {history.map((h) => (
            <p key={h.id}>
              V{h.version} · {h.action} · {h.occurred_at}
            </p>
          ))}
        </div>
      )}
      {draft && (
        <div
          className="alarm-business-workspace-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "编辑报警规则" : "创建报警规则"}
        >
          <div className="alarm-business-workspace-dialog-head">
            <h2>{editing ? "编辑告警规则" : "新增告警规则"}</h2>
            <button disabled={busy} onClick={() => void closeDraft()}>
              取消
            </button>
          </div>
          <p className="alarm-business-workspace-muted">
            条件编辑仅修改当前草稿，提交规则后保存。
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (conditionDraft) {
                saveCondition()
                return
              }
              void perform(
                () => saveAlarmRule(draft, editing),
                () => setDraft(null),
              )
            }}
          >
            <fieldset disabled={busy} className="alarm-business-workspace-form" style={{border:0,padding:0,margin:0}}>
              <label>
                报警规则名称
                <input
                  required
                  maxLength={120}
                  value={draft.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </label>
              <label>
                所属站点
                <select
                  value={draft.stationId}
                  disabled={!!editing || !!stationId}
                  onChange={(e) =>
                    update({
                      stationId: Number(e.target.value),
                      deviceId: null,
                      notification: { ...draft.notification, recipients: [] },
                    })
                  }
                >
                  {eligible.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                报警对象
                <select
                  value={draft.objectType}
                  onChange={(e) => {
                    const objectType = e.target.value as "DEVICE" | "STATION"
                    update({
                      objectType,
                      deviceId: null,
                      conditions: [emptyCondition(objectType)],
                    })
                  }}
                >
                  <option value="DEVICE">设备</option>
                  <option value="STATION">场站</option>
                </select>
              </label>
              {draft.objectType === "DEVICE" && (
                <label>
                  设备
                  <select
                    aria-label="设备"
                    required
                    value={draft.deviceId ?? ""}
                    onChange={(e) =>
                      update({
                        deviceId: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">请选择设备</option>
                    {options.devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                告警等级
                <select
                  value={draft.severity}
                  onChange={(e) => update({ severity: e.target.value })}
                >
                  {Object.entries(levels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                开始时间
                <input
                  type="time"
                  step="900"
                  required
                  value={timeLabel(draft.effectiveStart)}
                  onChange={(e) =>
                    update({ effectiveStart: toMinute(e.target.value) })
                  }
                />
              </label>
              <label>
                结束时间
                <select
                  value={draft.effectiveEnd}
                  onChange={(e) =>
                    update({ effectiveEnd: Number(e.target.value) })
                  }
                >
                  {Array.from({ length: 96 }, (_, i) => (i + 1) * 15).map(
                    (m) => (
                      <option key={m} value={m}>
                        {timeLabel(m)}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>默认恢复周期（小时）<input type="number" min="1" max="72" step="1" required aria-label="默认恢复周期（小时）" value={draft.autoRecoveryDuration} onChange={e=>update({autoRecoveryDuration:Number(e.target.value)})}/><small>保存配置；按时长自动恢复的执行服务尚未接通。</small></label>
              <label>
                连续正常采样恢复时长（秒）
                <input
                  type="number"
                  min="0"
                  max="86400"
                  required
                  value={draft.recoveryDuration}
                  onChange={(e) =>
                    update({ recoveryDuration: Number(e.target.value) })
                  }
                />
              </label>
              <div className="full">
                <h3>条件（所有条件都触发后将生成规则报警）</h3>
                {!draft.conditions.length && (
                  <p className="alarm-business-workspace-empty">暂无数据</p>
                )}
                <p className="alarm-business-workspace-muted">
                  条件保存后按检测服务支持范围执行。场站指标及非即时算法暂未接通，实际检测状态见规则详情。
                </p>
                {pointError && <p role="alert">{pointError}</p>}
                {!!draft.conditions.length && (
                  <table>
                    <thead>
                      <tr>
                        <th>条件描述</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draft.conditions.map((c, i) => (
                        <tr key={i}>
                          <td>
                            {c.fields.map((f) => f.code).join(" / ")} · 连续
                            {c.period}个周期 · {conditionOperators[c.operator]}{" "}
                            {c.statusValue ?? c.lower ?? "—"}
                            {c.upper !== null ? ` ~ ${c.upper}` : ""}{" "}
                            {c.fields[0]?.unit}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => {
                                setConditionIndex(i)
                                setConditionDraft(structuredClone(c))
                                setError("")
                              }}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                update({
                                  conditions: draft.conditions.filter(
                                    (_, index) => index !== i,
                                  ),
                                })
                              }
                            >
                              删除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {conditionDraft && (
                  <div
                    className="alarm-condition-backdrop"
                    onClick={() => setConditionDraft(null)}
                  />
                )}
                {conditionDraft && (
                  <div
                    className="alarm-condition-editor"
                    role="dialog"
                    aria-modal="true"
                    aria-label="添加条件"
                  >
                    <div className="alarm-business-workspace-dialog-head">
                      <h2>
                        {conditionIndex === null ? "添加条件" : "编辑条件"}
                      </h2>
                      <button
                        type="button"
                        onClick={() => setConditionDraft(null)}
                      >
                        关闭
                      </button>
                    </div>
                    <label>
                      条件描述
                      <textarea
                        disabled
                        value={`${conditionDraft.fields.map((f) => f.code).join(" / ")} · 连续${conditionDraft.period}个周期 · ${conditionOperators[conditionDraft.operator]} ${conditionDraft.statusValue ?? conditionDraft.lower ?? "—"}`}
                      />
                    </label>
                    {[conditionDraft].map((c, i) => (
                      <div
                        key={i}
                        className="alarm-business-workspace-condition"
                      >
                        {c.fields.map((f, j) => (
                          <label key={j}>
                            指标 {j + 1}
                            {!!pointOptions.length && (
                              <select
                                aria-label={`条件${i + 1}指标${j + 1}已登记测点`}
                                value={
                                  pointOptions.some(
                                    (point) => point.code === f.code,
                                  )
                                    ? f.code
                                    : ""
                                }
                                onChange={(e) => {
                                  const point = pointOptions.find(
                                    (point) => point.code === e.target.value,
                                  )
                                  if (point)
                                    condition(i, {
                                      fields: c.fields.map((field, k) =>
                                        k === j
                                          ? {
                                              ...field,
                                              code: point.code!,
                                              unit: point.unit,
                                              cycleType: "INSTANT",
                                            }
                                          : field,
                                      ),
                                      operator: "eq",
                                      lower: null,
                                      upper: null,
                                      statusValue: null,
                                    })
                                }}
                              >
                                <option value="">
                                  选择已登记测点 / 自定义代码
                                </option>
                                {pointOptions.map((point) => (
                                  <option key={point.id} value={point.code}>
                                    {point.name} · {point.unit || "无单位"} ·{" "}
                                    {point.code}
                                  </option>
                                ))}
                              </select>
                            )}
                            <input
                              required
                              maxLength={120}
                              aria-label={`条件${i + 1}指标${j + 1}`}
                              placeholder="指标代码"
                              value={f.code}
                              onChange={(e) => {
                                const fields = c.fields.map((field, k) =>
                                  k === j
                                    ? { ...field, code: e.target.value }
                                    : field,
                                )
                                condition(i, {
                                  fields,
                                  operator: "eq",
                                  lower: null,
                                  upper: null,
                                  statusValue: null,
                                })
                              }}
                            />
                            <input
                              aria-label={`条件${i + 1}指标${j + 1}单位`}
                              placeholder="单位"
                              value={f.unit}
                              onChange={(e) =>
                                condition(i, {
                                  fields: c.fields.map((field, k) =>
                                    k === j
                                      ? { ...field, unit: e.target.value }
                                      : field,
                                  ),
                                })
                              }
                            />
                            <select
                              aria-label={`条件${i + 1}指标${j + 1}周期`}
                              value={f.cycleType}
                              onChange={(e) =>
                                condition(i, {
                                  fields: c.fields.map((field, k) =>
                                    k === j
                                      ? { ...field, cycleType: e.target.value }
                                      : field,
                                  ),
                                })
                              }
                            >
                              <option value="INSTANT">即时指标</option>
                              <option value="DAY_00">日指标</option>
                              <option value="YEAR_EARLY">年初累计</option>
                            </select>
                          </label>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            condition(
                              i,
                              c.fields.length === 1
                                ? {
                                    fields: [
                                      ...c.fields,
                                      {
                                        code: "",
                                        unit: c.fields[0].unit,
                                        cycleType: c.fields[0].cycleType,
                                        objectType: draft.objectType,
                                      },
                                    ],
                                    algorithm: "dpc_rate",
                                    operator: "eq",
                                    lower: null,
                                    upper: null,
                                  }
                                : {
                                    fields: [c.fields[0]],
                                    algorithm: "self",
                                    operator: "eq",
                                    lower: null,
                                    upper: null,
                                  },
                            )
                          }
                        >
                          {c.fields.length === 1 ? "增加第二指标" : "单指标"}
                        </button>
                        <label>
                          检索周期
                          <select
                            value={c.period}
                            onChange={(e) =>
                              condition(i, { period: Number(e.target.value) })
                            }
                          >
                            {[1, 3, 5, 7, 9, 11].map((n) => (
                              <option key={n} value={n}>
                                连续{n}个周期（
                                {c.fields[0]?.cycleType === "DAY_00"
                                  ? "一个周期=每天23:59"
                                  : "一个周期=完整分钟"}
                                ）
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          比较
                          <select
                            value={c.operator}
                            onChange={(e) =>
                              condition(i, {
                                operator: e.target.value,
                                lower: null,
                                upper: null,
                              })
                            }
                          >
                            {Object.entries(conditionOperators).map(
                              ([key, label]) => (
                                <option key={key} value={key}>
                                  {label}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        {c.fields[0].code === "deviceStatus" ? (
                          <label>
                            通信状态
                            <select
                              required
                              value={c.statusValue ?? ""}
                              onChange={(e) =>
                                condition(i, { statusValue: e.target.value })
                              }
                            >
                              <option value="">请选择</option>
                              <option value="online">在线</option>
                              <option value="offline">离线</option>
                            </select>
                          </label>
                        ) : (
                          <>
                            <label>
                              阈值 / 下界
                              <input
                                type="number"
                                step="0.01"
                                disabled={c.extend1}
                                value={c.lower ?? ""}
                                onChange={(e) =>
                                  condition(i, {
                                    lower:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  })
                                }
                              />
                            </label>
                            {[
                              "bet",
                              "nbet",
                              "mom_up",
                              "mom_down",
                              "yoy_up",
                              "yoy_down",
                            ].includes(c.operator) && (
                              <label>
                                上界
                                <input
                                  type="number"
                                  step="0.01"
                                  value={c.upper ?? ""}
                                  onChange={(e) =>
                                    condition(i, {
                                      upper:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                            )}
                          </>
                        )}
                        <label>
                          <input
                            type="checkbox"
                            checked={c.includeLower}
                            onChange={(e) =>
                              condition(i, { includeLower: e.target.checked })
                            }
                          />
                          包含下界
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={c.includeUpper}
                            onChange={(e) =>
                              condition(i, { includeUpper: e.target.checked })
                            }
                          />
                          包含上界
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={c.extend1}
                            onChange={(e) =>
                              condition(i, {
                                extend1: e.target.checked,
                                lower: null,
                              })
                            }
                          />
                          扩展条件
                        </label>
                      </div>
                    ))}
                    <div className="alarm-business-workspace-actions">
                      <button type="button" onClick={saveCondition}>
                        提交条件
                      </button>
                      <button
                        type="button"
                        onClick={() => setConditionDraft(null)}
                      >
                        取消
                      </button>
                    </div>
                    {error && <p role="alert">{error}</p>}
                  </div>
                )}
                <button
                  type="button"
                  disabled={draft.conditions.length >= 10}
                  onClick={() => {
                    setConditionIndex(null)
                    setConditionDraft(emptyCondition(draft.objectType))
                    setError("")
                  }}
                >
                  + 添加条件
                </button>
              </div>
              <label className="full">
                解决方案
                <textarea
                  maxLength={4000}
                  value={draft.solution}
                  onChange={(e) => update({ solution: e.target.value })}
                />
              </label>
              <div className="full">
                <h3>通知配置</h3>
                <div className="alarm-business-workspace-notification">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.notification.needed}
                      onChange={(e) =>
                        update({
                          notification: {
                            ...draft.notification,
                            needed: e.target.checked,
                          },
                        })
                      }
                    />
                    是否需要通知
                  </label>
                  <label>
                    每日通知上限
                    <select
                      value={draft.notification.maxCount}
                      onChange={(e) =>
                        update({
                          notification: {
                            ...draft.notification,
                            maxCount: Number(e.target.value),
                          },
                        })
                      }
                    >
                      {![2, 10, 20, 50].includes(
                        draft.notification.maxCount,
                      ) && (
                        <option value={draft.notification.maxCount}>
                          {draft.notification.maxCount}（已有配置）
                        </option>
                      )}
                      {[2, 10, 20, 50].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.notification.recoveryNotice}
                      onChange={(e) =>
                        update({
                          notification: {
                            ...draft.notification,
                            recoveryNotice: e.target.checked,
                          },
                        })
                      }
                    />
                    恢复通知配置
                  </label>
                  {[
                    ["in_app", "站内"],
                    ["email", "邮件"],
                    ["sms", "短信"],
                    ["app_push", "APP推送"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={draft.notification.channels.includes(key)}
                        onChange={(e) =>
                          update({
                            notification: {
                              ...draft.notification,
                              channels: e.target.checked
                                ? [...draft.notification.channels, key]
                                : draft.notification.channels.filter(
                                    (x) => x !== key,
                                  ),
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <p className="alarm-business-workspace-muted">
                  仅保存渠道和收件人偏好；外部渠道资质与发送服务尚未连接。
                </p>
                <div className="alarm-business-workspace-notification">
                  {options.recipients.map((r) => (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={draft.notification.recipients.includes(r.id)}
                        onChange={(e) =>
                          update({
                            notification: {
                              ...draft.notification,
                              recipients: e.target.checked
                                ? [...draft.notification.recipients, r.id]
                                : draft.notification.recipients.filter(
                                    (id) => id !== r.id,
                                  ),
                            },
                          })
                        }
                      />
                      {r.display_name}
                    </label>
                  ))}
                </div>
                {!options.recipients.length && (
                  <p>暂无同企业且有此站告警阅读权限的收件人</p>
                )}
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="alarm-business-workspace-error">
                {error}
              </p>
            )}
            <div className="alarm-business-workspace-actions">
              <button
                type="submit"
                disabled={
                  busy ||
                  !hasStationPermission(user, draft.stationId, "alarm.handle")
                }
              >
                {busy ? "正在保存…" : "提交"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void closeDraft()}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
