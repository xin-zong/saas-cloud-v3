import { hasStationPermission } from "@/auth/apiPermissions"
import { useCallback, useEffect, useState, type FormEvent } from "react"

import type { Station } from "@/App"

import { api, allRows, send, type ApiRow } from "@/api/client"

import { useAuth } from "@/auth/AuthContext"
import './operations-market.css'
import './api-market.css'
import { useEditorLeaveGuard, type RegisterLeaveGuard } from './useEditorLeaveGuard'
import { Modal } from './station-provision/Common'

const statuses: Record<string, string> = {
  draft: "内部草稿",
  withdrawn: "已撤回草稿",
  submitted: "已提交记录",
  confirmed: "已确认记录",
  running: "执行中记录",
  completed: "已完成记录",
  cancelled: "已取消记录",
}

export default function ApiMarketPage({ stations, registerLeaveGuard }: { stations: Station[]; registerLeaveGuard?: RegisterLeaveGuard }) {
  const { user } = useAuth()
  stations = stations.filter(station => hasStationPermission(user, station.id, "market.read"))

  const [stationId, setStationId] = useState(stations[0]?.id ?? ""),
    [services, setServices] = useState<ApiRow[]>([]),
    [qualifications, setQualifications] = useState<ApiRow[]>([])

  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [revision, setRevision] = useState(0),
    [creating, setCreating] = useState(false)

  const [qualification, setQualification] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [capacity, setCapacity] = useState("")

  const [dirty, setDirty] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const resetDraft = useCallback(() => {
    setQualification("")
    setName("")
    setCode("")
    setStart("")
    setEnd("")
    setCapacity("")
    setDirty(false)
  }, [])
  const enabled = hasStationPermission(user, stationId, "market.manage")
  const { requestLeave, settleLeave } = useEditorLeaveGuard({dirty:creating && dirty, enabled, registerLeaveGuard, onConfirm:()=>setLeaving(true),onCancel:()=>setLeaving(false)})
  useEffect(()=>{if(!enabled){setCreating(false);resetDraft()}},[enabled,resetDraft])
  useEffect(()=>{setCreating(false);resetDraft()},[stationId,resetDraft])
  useEffect(()=>{
    const beforeUnload=(e:BeforeUnloadEvent)=>{if(creating&&dirty){e.preventDefault();e.returnValue=""}}
    window.addEventListener("beforeunload",beforeUnload)
    return()=>window.removeEventListener("beforeunload",beforeUnload)
  },[creating,dirty])

  useEffect(() => {
    if (!stations.some((s) => s.id === stationId)) {
      setStationId(stations[0]?.id ?? "")
      setServices([])
      setQualifications([])
      setCreating(false)
    }
  }, [stations, stationId])

  const station = stations.find((item) => item.id === stationId)
  const canManage = hasStationPermission(user, stationId, "market.manage")

  useEffect(() => {
    if (!stationId) return
    const c = new AbortController()
    setError("")
    setServices([])
    setQualifications([])
    setQualification("")
    setLoading(true)
    Promise.all([
      allRows(`/stations/${stationId}/market-services`, c.signal),
      api<ApiRow[]>(`/stations/${stationId}/qualifications`, {
        signal: c.signal,
      }),
    ])
      .then(([s, q]) => {
        setServices(s)
        setQualifications(q)
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [stationId, revision])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!canManage) return
    setError("")
    const q = qualifications.find((item) => String(item.id) === qualification)

    const from = new Date(start),
      to = new Date(end),
      kw = Number(capacity)

    if (
      !name.trim() || !code.trim() || !q || q.status !== "valid" ||
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to <= from ||
      to.getTime() - from.getTime() > 86400000 ||
      !(kw > 0) ||
      !station ||
      kw > station.ratedPower
    ) {
      setError("请选择有效资格、24 小时内的服务时段及不超过额定功率的正容量")
      return
    }

    setBusy(true)
    try {
      await send("/market-drafts", "POST", {
        stationId: Number(stationId),
        areaId: Number(q.area_id),
        eventCode: code.trim(),
        name: name.trim(),
        kind: q.kind,
        startsAt: from.toISOString(),
        endsAt: to.toISOString(),
        capacityKw: kw,
      })
      setCreating(false)
      resetDraft()
      setRevision((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败")
    } finally {
      setBusy(false)
    }
  }

  async function cancel(id: unknown) {
    if (!canManage) return
    setBusy(true)
    setError("")
    try {
      await send(`/market-drafts/${id}/cancel`, "POST", {})
      setRevision((v) => v + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : "撤回失败")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="market-page api-market-page">
      <div className="market-toolbar">
        <label>
          市场服务站点
          <select
            aria-label="市场服务站点"
            value={stationId}
            disabled={!stations.length}
            onChange={(e) => {
              const id = e.target.value
              void(async()=>{if(await requestLeave()){setStationId(id);setCreating(false);resetDraft()}})()
            }}
          >
            {!stations.length && <option value="">暂无授权站点</option>}
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="operations-button"
          onClick={() => setRevision((v) => v + 1)}
            disabled={loading || !stationId}
        >
          刷新
        </button>
        {canManage && (
          <button
            className="operations-button market-primary"
            disabled={!stationId}
            onClick={() => {void(async()=>{if(await requestLeave()){resetDraft();setCreating(!creating)}})()}}
          >
            新建内部草稿
          </button>
        )}
      </div>
      <p className="market-notice">
        内部草稿不提交外部交易。额定功率不等于实时可用容量；服务记录按页读取。
      </p>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">正在加载服务记录…</p>}
      <section className="market-surface" aria-label="服务资格列表"><div className="market-heading"><h2>服务资格</h2><span>{loading || error ? "—" : qualifications.length} 项</span></div><div className="operations-table-scroll"><table className="operations-table"><thead><tr>{["服务区域", "服务类型", "资格状态", "有效期至"].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{!loading && !error && qualifications.length ? qualifications.map((q) => <tr key={String(q.id)}><td>{String(q.area_name)}</td><td>{String(q.kind)}</td><td><span className="api-market-status">{q.status === "valid" ? "有效" : String(q.status)}</span></td><td>{String(q.valid_until)}</td></tr>) : <tr><td colSpan={4} className="api-market-empty">{loading ? "正在加载服务资格…" : error ? "服务资格加载失败" : "暂无已登记资格"}</td></tr>}</tbody></table></div></section>
      {creating && (
        <form onSubmit={save} onChange={()=>setDirty(true)} className="market-create-form">
          <h3>新建内部服务草稿</h3>
          <label>
            服务资格
            <select
              required
              aria-label="服务资格"
              value={qualification}
              onChange={(e) => setQualification(e.target.value)}
            >
              <option value="">请选择</option>
              {qualifications
                .filter((q) => q.status === "valid")
                .map((q) => (
                  <option key={String(q.id)} value={String(q.id)}>
                    {String(q.area_name)} · {String(q.kind)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            事件编号
            <input
              required
              maxLength={100}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label>
            服务名称
            <input
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            开始时间
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            结束时间
            <input
              type="datetime-local"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label>
            承诺容量 kW
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={Number.isFinite(station?.ratedPower) ? station?.ratedPower : undefined}
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
          <button className="operations-button" disabled={busy} type="submit">
            {busy ? "保存中…" : "保存内部草稿"}
          </button>
        </form>
      )}
      <section className="market-surface market-event-list" aria-label="服务记录"><div className="market-heading"><h2>服务记录</h2><span>{loading || error ? "—" : services.length} 条记录</span></div>
      <div className="operations-table-scroll market-event-scroll">
        <table className="operations-table">
          <thead>
            <tr>
              {[
                "编号",
                "服务",
                "开始 / 结束",
                "承诺容量 kW",
                "状态",
                "操作",
              ].map((h) => (
                <th scope="col" key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading || error || !services.length ? <tr><td colSpan={6} className="api-market-empty">{loading ? "正在加载服务记录…" : error ? "服务记录加载失败" : "暂无服务记录"}</td></tr> : services.map((s) => (
              <tr key={String(s.id)}>
                <td>{String(s.event_code)}</td>
                <td>{String(s.name)}</td>
                <td>
                  {String(s.starts_at)} / {String(s.ends_at)}
                </td>
                <td>{String(s.capacity_kw)}</td>
                <td><span className="api-market-status">{statuses[String(s.status)] ?? String(s.status)}</span></td>
                <td>
                  {canManage && s.status === "draft" ? (
                    <button
                      className="operations-button"
                      disabled={busy}
                      onClick={() => void cancel(s.id)}
                    >
                      撤回草稿
                    </button>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div><footer>共 {loading || error ? "—" : services.length} 条服务记录</footer></section>
      {leaving && <Modal title="放弃未保存修改？" onClose={()=>{setLeaving(false);settleLeave(false)}} actions={<><button className="operations-button" onClick={()=>{setLeaving(false);settleLeave(false)}}>继续编辑</button><button className="operations-button market-primary" onClick={()=>{setLeaving(false);resetDraft();settleLeave(true)}}>放弃修改</button></>}><p>内部服务草稿尚未保存。</p></Modal>}
    </section>
  )
}
