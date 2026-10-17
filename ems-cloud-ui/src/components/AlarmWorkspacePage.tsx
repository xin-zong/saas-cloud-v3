import { useCallback, useEffect, useRef, useState } from "react"

import type { Station } from "@/App"

import { useAuth } from "@/auth/AuthContext"

import { hasStationPermission } from "@/auth/apiPermissions"

import {
  alarmDetail,
  handleAlarm,
  markAlarmsRead,
  queryAlarms,
  type AlarmRow,
} from "@/api/alarmWorkspace"

import { send } from "@/api/client"

import { formatDate } from "@/preferences/date"

import AlarmRulesPage from "./AlarmRulesPage"

import "./alarm-workspace.css"

const levels = { critical: "严重", warning: "重要", info: "一般" }

const lifecycle = { active: "未恢复", recovered: "已恢复", closed: "人工关闭" }

const stamp = (value: string | null | undefined) =>
  value
    ? formatDate(new Date(value), {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

export default function AlarmWorkspacePage({
  stationId,
  stations = [],
  onRefresh,
}: {
  stationId?: string
  stations?: Station[]
  onRefresh?: () => void
}) {
  const { user } = useAuth()
  const [tab, setTab] = useState("live")
  const [scope, setScope] = useState(stationId ?? "")
  const [source, setSource] = useState("")
  const [severity, setSeverity] = useState("")
  const [readFlag, setReadFlag] = useState("")
  const [device, setDevice] = useState("")
  const [query, setQuery] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<AlarmRow[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<number[]>([])
  const [detail, setDetail] = useState<AlarmRow | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState("")
  const [pending, setPending] = useState<string | null>(null)
  const [orderDraft, setOrderDraft] = useState<{
    title: string
    description: string
  } | null>(null)
  const revision = useRef(0)
  const detailRequest = useRef(0)
  const mutationContext = useRef(0)

  const canHandle =
    !!detail && hasStationPermission(user, detail.station_id, "alarm.handle")

  const load = useCallback(async () => {
    const seq = ++revision.current
    setLoading(true)
    setError("")
    try {
      const result = await queryAlarms({
        stationId: scope || undefined,
        view: tab === "rules" ? "all" : tab,
        source,
        severity,
        deviceId: device,
        readFlag,
        query,
        start: start ? new Date(start).toISOString() : undefined,
        end: end ? new Date(end).toISOString() : undefined,
        limit: 20,
        offset: page * 20,
      })
      if (seq === revision.current) {
        setItems(result.items)
        setTotal(result.total)
        setSelected([])
      }
    } catch (e) {
      if (seq === revision.current) {
        setError((e as Error).message)
        setItems([])
        setTotal(0)
      }
    } finally {
      if (seq === revision.current) setLoading(false)
    }
  }, [
    scope,
    tab,
    source,
    severity,
    device,
    readFlag,
    query,
    start,
    end,
    page,
    user,
  ])

  useEffect(() => {
    setScope(stationId ?? "")
    setPage(0)
    setDetail(null)
  }, [stationId])

  useEffect(() => {
    if (tab !== "rules") void load()
    return () => {
      revision.current++
    }
  }, [load, tab])

  useEffect(() => {
    detailRequest.current++
    mutationContext.current++
    setBusy(false)
    setDetail(null)
    setPending(null)
    setNote("")
    setOrderDraft(null)
    return () => { detailRequest.current++; mutationContext.current++ }
  }, [stationId, scope, tab, user])

  async function open(id: number) {
    const seq = ++detailRequest.current
    setError("")
    try {
      let row = await alarmDetail(id)
      if (seq !== detailRequest.current) return
      if (!row.read_flag) {
        await markAlarmsRead([id])
        if (seq !== detailRequest.current) return
        row = await alarmDetail(id)
        if (seq !== detailRequest.current) return
        await load()
      }
      if (seq === detailRequest.current) {
        setDetail(row)
        setPending(null)
        setNote("")
        setOrderDraft(null)
      }
    } catch (e) {
      if (seq === detailRequest.current) setError((e as Error).message)
    }
  }

  async function read(ids: number[]) {
    const context = mutationContext.current
    setBusy(true)
    setError("")
    try {
      await markAlarmsRead(ids)
      if (context !== mutationContext.current) return
      await load()
      if (context !== mutationContext.current) return
      if (detail && ids.includes(detail.id)) await open(detail.id)
    } catch (e) {
      if (context === mutationContext.current) setError((e as Error).message)
    } finally {
      if (context === mutationContext.current) setBusy(false)
    }
  }

  async function act() {
    if (!detail || !pending) return
    const context = mutationContext.current
    setBusy(true)
    setError("")
    try {
      const id = detail.id
      await handleAlarm(detail, pending, note)
      if (context !== mutationContext.current) return
      setPending(null)
      setNote("")
      await load()
      if (context !== mutationContext.current) return
      onRefresh?.()
      if (pending === "delete") setDetail(null)
      else await open(id)
    } catch (e) {
      if (context === mutationContext.current) setError((e as Error).message)
    } finally {
      if (context === mutationContext.current) setBusy(false)
    }
  }

  const filter = (change: () => void) => {
    change()
    setPage(0)
  }

  return (
    <section
      className="alarm-business-workspace"
      data-figma-node={stationId ? "2572:2990" : "1036:820"}
    >
      <div className="alarm-business-workspace-tabs">
        {[
          ["live", "实时告警"],
          ["history", "历史告警"],
          ["all", "全部事件"],
          ["rules", "规则管理"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() =>
              filter(() => {
                setTab(key)
                setDetail(null)
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "rules" ? (
        <AlarmRulesPage stationId={stationId} stations={stations} />
      ) : (
        <>
          <div className="alarm-business-workspace-filters">
            {!stationId && (
              <select
                aria-label="告警站点"
                value={scope}
                onChange={(e) => filter(() => setScope(e.target.value))}
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
            )}
            <select
              aria-label="告警来源"
              value={source}
              onChange={(e) => filter(() => setSource(e.target.value))}
            >
              <option value="">全部来源</option>
              <option value="device">设备告警</option>
              <option value="rule">规则告警</option>
            </select>
            <select
              aria-label="告警等级"
              value={severity}
              onChange={(e) => filter(() => setSeverity(e.target.value))}
            >
              <option value="">全部等级</option>
              {Object.entries(levels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="个人阅读状态"
              value={readFlag}
              onChange={(e) => filter(() => setReadFlag(e.target.value))}
            >
              <option value="">全部阅读状态</option>
              <option value="unread">未读</option>
              <option value="read">已读</option>
            </select>
            <input
              aria-label="设备ID筛选"
              inputMode="numeric"
              type="number"
              min="1"
              placeholder="设备ID"
              value={device}
              onChange={(e) => filter(() => setDevice(e.target.value))}
            />
            <input
              aria-label="告警起始时间"
              type="datetime-local"
              value={start}
              onChange={(e) => filter(() => setStart(e.target.value))}
            />
            <span>至</span>
            <input
              aria-label="告警结束时间（不含）"
              type="datetime-local"
              value={end}
              onChange={(e) => filter(() => setEnd(e.target.value))}
            />
            <input
              aria-label="搜索告警"
              placeholder="名称 / 代码 / 设备"
              value={query}
              onChange={(e) => filter(() => setQuery(e.target.value))}
            />
            <button disabled={busy || loading} onClick={() => void load()}>
              刷新
            </button>
            <button
              onClick={() =>
                filter(() => {
                  setSource("")
                  setSeverity("")
                  setReadFlag("")
                  setDevice("")
                  setQuery("")
                  setStart("")
                  setEnd("")
                  setScope(stationId ?? "")
                })
              }
            >
              重置
            </button>
          </div>
          <div className="alarm-business-workspace-heading">
            <span>共 {total} 条告警 · 打开详情计个人已读，确认独立执行</span>
            <button
              disabled={busy || !selected.length}
              onClick={() => void read(selected)}
            >
              批量标为已读（{selected.length}）
            </button>
          </div>
          {error && (
            <p role="alert" className="alarm-business-workspace-error">
              {error}
            </p>
          )}
          <div className="alarm-business-workspace-table">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="选择本页告警"
                      checked={
                        items.length > 0 && selected.length === items.length
                      }
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? items.map((a) => a.id) : [],
                        )
                      }
                    />
                  </th>
                  {[
                    "告警名称",
                    "所属站点 / 设备",
                    "发生时间",
                    "恢复状态",
                    "处理状态",
                    "等级",
                    "来源 / 阅读",
                    "操作",
                  ].map((x) => (
                    <th key={x}>{x}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`选择告警${a.id}`}
                        checked={selected.includes(a.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, a.id]
                              : selected.filter((id) => id !== a.id),
                          )
                        }
                      />
                    </td>
                    <td>
                      {a.title}
                      <small>{a.code}</small>
                    </td>
                    <td>
                      {a.station_name}
                      <small>
                        {a.device_name} · ID {a.device_id}
                      </small>
                    </td>
                    <td>{stamp(a.occurred_at)}</td>
                    <td>{lifecycle[a.lifecycle]}</td>
                    <td>{a.acknowledged_at ? "已确认" : "待确认"}</td>
                    <td>
                      <span
                        className={`alarm-business-workspace-level ${a.severity}`}
                      >
                        {levels[a.severity]}
                      </span>
                    </td>
                    <td>
                      {a.source === "rule" ? "规则" : "设备"} /{" "}
                      {a.read_flag ? "已读" : "未读"}
                    </td>
                    <td>
                      <button onClick={() => void open(a.id)}>
                        事件详情 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!items.length && (
              <p className="alarm-business-workspace-empty">
                {loading ? "正在读取告警…" : "当前条件下暂无告警"}
              </p>
            )}
          </div>
          <div className="alarm-business-workspace-pagination">
            <button
              disabled={!page || loading}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>第 {page + 1} 页</span>
            <button
              disabled={(page + 1) * 20 >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
          {detail && (
            <div
              className="alarm-business-workspace-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="告警详情"
            >
              <div className="alarm-business-workspace-dialog-head">
                <h2>{detail.title}</h2>
                <button
                  disabled={busy}
                  onClick={() => {
                    detailRequest.current++
                    setDetail(null)
                    setPending(null)
                  }}
                >
                  关闭详情
                </button>
              </div>
              <p>
                {detail.station_name} / {detail.device_name} ·{" "}
                {levels[detail.severity]} · {lifecycle[detail.lifecycle]}
              </p>
              <p>
                发生：{stamp(detail.occurred_at)}　自动恢复：
                {stamp(detail.effective_recovered_at)}　人工关闭：
                {stamp(detail.closed_at)}
              </p>
              <p>
                业务确认：{stamp(detail.acknowledged_at)}　个人阅读：
                {detail.read_flag ? "已读" : "未读"}
              </p>
              <p className="alarm-business-workspace-muted">
                {detail.sampleStatus}
                。打开详情会记录当前账号已读，业务确认独立执行。
              </p>
              <div className="alarm-business-workspace-actions">
                <button
                  disabled={busy || detail.read_flag}
                  onClick={() => void read([detail.id])}
                >
                  标为已读
                </button>
                {canHandle &&
                  [
                    ["acknowledge", "确认告警"],
                    ["note", "添加备注"],
                    ["close", "人工关闭"],
                    ["delete", "软删除"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      disabled={
                        busy ||
                        (key === "delete"
                          ? detail.lifecycle === "active"
                          : key !== "note" && detail.lifecycle !== "active") ||
                        (key === "acknowledge" && !!detail.acknowledged_at)
                      }
                      onClick={() => {
                        setPending(key)
                        setNote("")
                      }}
                    >
                      {label}
                    </button>
                  ))}
              </div>
              {pending && (
                <div className="alarm-business-workspace-confirm">
                  <p>
                    {pending === "close"
                      ? "人工关闭将进入历史，不改写设备自动恢复时间。"
                      : pending === "delete"
                        ? "删除后从业务列表隐藏，审计和关联工单保留。"
                        : "请填写处理说明。"}
                  </p>
                  <textarea
                    aria-label="告警处理说明"
                    maxLength={4000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button
                    disabled={busy || !note.trim()}
                    onClick={() => void act()}
                  >
                    确认提交
                  </button>
                  <button disabled={busy} onClick={() => setPending(null)}>
                    取消
                  </button>
                </div>
              )}
              {error && (
                <p role="alert" className="alarm-business-workspace-error">
                  {error}
                </p>
              )}
              {hasStationPermission(
                user,
                detail.station_id,
                "workorder.create",
              ) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    setOrderDraft({
                      title: detail.title,
                      description: `关联告警 ${detail.code}：${detail.title}`,
                    })
                  }
                >
                  创建工单
                </button>
              )}
              {orderDraft && (
                <form
                  className="alarm-business-workspace-confirm"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const context = mutationContext.current
                    setBusy(true)
                    send("/work-orders", "POST", {
                      stationId: detail.station_id,
                      title: orderDraft.title,
                      description: orderDraft.description,
                      alarmId: detail.id,
                      ...(hasStationPermission(user, detail.station_id, "workorder.handle")
                        ? { assignedTo: Number(user?.id) } : {}),
                    })
                      .then(() => {
                        if (context !== mutationContext.current) return
                        setOrderDraft(null)
                        setError("工单已创建，可到工单中心查看")
                        onRefresh?.()
                      })
                      .catch((e) => {
                        if (context === mutationContext.current) setError(e.message)
                      })
                      .finally(() => {
                        if (context === mutationContext.current) setBusy(false)
                      })
                  }}
                >
                  <label>
                    工单标题
                    <input
                      required
                      maxLength={200}
                      value={orderDraft.title}
                      onChange={(e) =>
                        setOrderDraft({ ...orderDraft, title: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    问题描述
                    <textarea
                      required
                      maxLength={4000}
                      value={orderDraft.description}
                      onChange={(e) =>
                        setOrderDraft({
                          ...orderDraft,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <button disabled={busy} type="submit">
                    保存工单
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOrderDraft(null)}
                  >
                    取消
                  </button>
                </form>
              )}
              <h3>处理记录</h3>
              {detail.events?.length ? (
                detail.events.map((e) => (
                  <p key={e.id}>
                    {stamp(e.occurred_at)} · {e.actor_name} · {e.action}：
                    {e.note}
                  </p>
                ))
              ) : (
                <p>暂无处置审计记录</p>
              )}
              <h3>备注</h3>
              {detail.notes?.length ? (
                detail.notes.map((n) => (
                  <p key={n.id}>
                    {stamp(n.created_at)} · {n.author_name}：{n.body}
                  </p>
                ))
              ) : (
                <p>暂无备注</p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}
