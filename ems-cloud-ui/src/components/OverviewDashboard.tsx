import {useOverviewData} from './OverviewDataContext'
import { useEffect, useRef, useState } from "react"
import type { Station } from "@/App"
import type { AuthUser, NavLabel } from "@/auth/roles"
import { Button } from "./ui/Workspace"
import { Modal } from "./station-provision/Common"
import { useEditorLeaveGuard } from "./useEditorLeaveGuard"
import { overviewPresentationRole } from "./overviewCards"
import LeftPanel from "./LeftPanel"
import RightPanel from "./RightPanel"
import BottomBar from "./BottomBar"
import MapView from "./MapView"
import { DEMO_MODE } from "@/api/client"
import { dateKey } from "@/preferences/date"
import {defaultMonitorLayout,type MonitorStation,type MonitorWidget} from '@/api/monitor'
type Props = {
  stations: Station[]
  user: AuthUser
  nav: NavLabel[]
  onNavigate: (nav: NavLabel) => void
  onOpenStation: (id: string, subNav?: string) => void
  registerLeaveGuard: (guard: null | (() => Promise<boolean>)) => void
  cards: string[]
  availableCards: string[]
  onUpdateCards: (cards: string[], targetId: string | null,widgets?:MonitorWidget[]) => void | Promise<void>
  widgets:MonitorWidget[]
  monitorStations:MonitorStation[]
  layoutTargetId: string | null
  region: string
  onRefreshTemplates: () => Promise<unknown>
}
export default function OverviewDashboard({
  stations,
  user,
  nav,
  onNavigate,
  onOpenStation,
  registerLeaveGuard,
  cards,
  availableCards,
  onUpdateCards,
  layoutTargetId,
  region,
  onRefreshTemplates,
  widgets,
  monitorStations,
}: Props) {
  const overviewData=useOverviewData()
  const [draftWidgets,setDraftWidgets]=useState<MonitorWidget[]>([])
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(cards),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [leave, setLeave] = useState(false),
    [custom, setCustom] = useState(false),
    [period, setPeriod] = useState(DEMO_MODE?"今日":"采集月"),
    [range, setRange] = useState({
      start: dateKey(new Date()),
      end: dateKey(new Date()),
    })
  const [draftRange,setDraftRange]=useState(range)
  const [saving, setSaving] = useState(false)
  const [editingTargetId,setEditingTargetId] = useState<string|null>(null)
  const pending = useRef<null | (() => void)>(null)
  const dirty = editing && (JSON.stringify(draft) !== JSON.stringify(cards)||JSON.stringify(draftWidgets)!==JSON.stringify(widgets.length?widgets:defaultMonitorLayout(cards)))
  const { settleLeave } = useEditorLeaveGuard({
    dirty,
    registerLeaveGuard,
    onConfirm: () => setLeave(true),
    onCancel: () => setLeave(false),
  })
  useEffect(() => {
    setDraft(previous => previous.filter(card => availableCards.includes(card)))
    if (!availableCards.length) {
      setEditing(false)
      setLeave(false)
      pending.current = null
      settleLeave(false)
    }
  }, [availableCards.join('|')])
  const role = overviewPresentationRole(user)
  const viewStations = nav.includes("资产与站点")
    ? () => onNavigate("资产与站点")
    : undefined
  const alarms = () => {
    const target = stations.find((s) => s.alerts.length) ?? stations[0]
    if (target) onOpenStation(target.id, "告警信息")
  }
  function exportData() {
    const cell = (x: unknown) =>
      `"${String(x ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replace(/"/g, '""')}"`
    const rows = [
      ["站点", "编码", "区域", "额定功率(kW)", "储能容量(kWh)", "数据说明"],
      ...stations.map((s) => [
        s.name,
        s.code,
        s.region,
        Number.isFinite(s.ratedPower) ? s.ratedPower : "",
        Number.isFinite(s.storageCapacity) ? s.storageCapacity : "",
        "当前授权站点数据",
      ]),
    ]
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    )
    const a = document.createElement("a")
    a.href = url
    a.download = "总览站点数据.csv"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice("已导出当前授权站点数据")
  }
  return (
    <section className="overview-dashboard" aria-label="经营看板">
      <div className="overview-dashboard-heading">
        <div>
          <h1>平台总览运营看板</h1>
          <p>与地图总览采用相同的电站范围、指标卡片和权限</p>
        </div>
        <div className="overview-dashboard-actions">
          <div className="ui-segmented">
            {(DEMO_MODE?["今日", "近7天", "近30天", "自定义"]:["采集日", "近7日", "采集月", "自定义"]).map((p) => (
              <button
                key={p}
                aria-pressed={period === p}
                onClick={() => {
                  if (p === "自定义") {setDraftRange(range);setCustom(true)}
                  else setPeriod(p)
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <Button onClick={exportData}>
            <img src="/figma/overview/dashboard/imgDownload.svg" alt="" />
            站点数据导出
          </Button>
          <Button
            onClick={() => {
              setDraft(cards)
                  setDraftWidgets(widgets.length?widgets:defaultMonitorLayout(cards))
              setEditingTargetId(layoutTargetId)
              setEditing(true)
              setError("")
            }}
          >
            <img src="/figma/overview/dashboard/imgEdit.svg" alt="" />
            页面定制
          </Button>
        </div>
      </div>
      <p className="overview-dashboard-range">
        周期选择作用于充放电曲线；资产与通信按标注时间，收益按近一年结算记录。
      </p>
      {notice && (
        <p role="status" className="overview-notice">
          {notice}
        </p>
      )}
      <div className="overview-shared-card-grid">
        <LeftPanel
          stations={stations}
          role={role}
          visibleCards={cards}
          onViewStations={viewStations}
          storagePeriod={DEMO_MODE?undefined:{kind:period==='采集日'?'day':period==='近7日'?'week':period==='自定义'?'custom':'month',start:range.start,end:range.end}}
        />
        <RightPanel stations={stations} role={role} visibleCards={cards} />
      </div>
      <div className="overview-shared-bottom">
        <BottomBar
          stations={stations}
          role={role}
          visibleCards={cards}
          onSelectStation={(s) => onOpenStation(s.id)}
          onViewAll={alarms}
        />
      </div>
      <article className="overview-region-context">
        <h2>核心站点区域分布</h2>
        <div
          className="overview-region-map"
          role="region"
          aria-label="核心站点实时地图"
        >
          <MapView
            compact
            region={region}
            stations={stations}
            selectedStation={null}
            onSelectStation={(s) => onOpenStation(s.id)}
          />
        </div>
      </article>
      {editing && (
        <Modal
          title="页面定制"
          onClose={() => {
            if (saving) return
            if (dirty) {
              pending.current = () => setEditing(false)
              setLeave(true)
            } else setEditing(false)
          }}
          actions={
            <>
              <Button
                disabled={saving}
                onClick={() => {
                  if (dirty) {
                    pending.current = () => setEditing(false)
                    setLeave(true)
                  } else setEditing(false)
                }}
              >
                取消
              </Button>
              <Button
                variant="primary"
                disabled={saving}
                onClick={async () => {
                  if (!draft.length) {
                    setError("请至少保留一个看板模块")
                    return
                  }
                  setSaving(true)
                  setError("")
                  try {
                    await onUpdateCards(draft,editingTargetId,draftWidgets.filter(w=>draft.includes(w.card)))
                    setEditing(false)
                    setNotice(DEMO_MODE ? "演示布局已保存至本机，地图总览同步更新" : "布局已保存至服务器，地图总览同步更新")
                  } catch (e) {
                    setError(DEMO_MODE ? "无法保存至本机，请检查浏览器存储后重试" : (e as Error).message)
                  } finally { setSaving(false) }
                }}
              >
                保存页面布局
              </Button>
            </>
          }
        >
          <p>
            {DEMO_MODE ? "演示模式：布局保存在当前浏览器。" : "沿用原型固定分区；卡片选择保存至服务器。版本冲突时刷新版本并保留草稿，核对后保存。"}
          </p>
          {availableCards.map((s) => (
            <div key={s} className="overview-checkbox">
              <label>
              <input
                type="checkbox"
                disabled={saving}
                checked={draft.includes(s)}
                onChange={(e) => {
                  setDraft(
                    e.target.checked
                      ? [...draft, s]
                      : draft.filter((x) => x !== s),
                  );if(e.target.checked&&!draftWidgets.some(w=>w.card===s))setDraftWidgets(previous=>[...previous,{card:s,x:0,y:Math.max(0,...previous.map(w=>w.y+w.h)),w:6,h:3}])
                }}
              />
              {s}
              </label>
            </div>
          ))}
          {error && <p role="alert">{error}</p>}
          {!DEMO_MODE && <Button disabled={saving} onClick={async () => { setSaving(true); try { await onRefreshTemplates(); setError("已刷新模板版本；卡片草稿已保留，请核对后保存") } catch(e) { setError((e as Error).message) } finally { setSaving(false) } }}>刷新版本（保留卡片草稿）</Button>}
        </Modal>
      )}
      {custom && (
        <Modal
          title="自定义时间范围"
          onClose={() => setCustom(false)}
          actions={
            <Button
              onClick={() => {
                if (!draftRange.start||!draftRange.end||draftRange.start > draftRange.end||Date.parse(draftRange.end)-Date.parse(draftRange.start)>30*86400000) {
                  setError("请选择31天内有效日期范围")
                  return
                }
                setRange({...draftRange})
                setPeriod("自定义")
                setNotice(`已选择 ${draftRange.start} 至 ${draftRange.end}；充放电明细按所选日期展示，未采集日期保持空态`)
                setCustom(false)
                setError("")
              }}
            >
              应用时间范围
            </Button>
          }
        >
          <label>
            开始日期
            <input
              type="date"
              value={draftRange.start}
              onChange={(e) => setDraftRange({ ...draftRange, start: e.target.value })}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={draftRange.end}
              onChange={(e) => setDraftRange({ ...draftRange, end: e.target.value })}
            />
          </label>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
      {leave && (
        <Modal
          title="放弃布局修改"
          onClose={() => {
            setLeave(false)
            pending.current = null
            settleLeave(false)
          }}
          actions={
            <>
              <Button
                onClick={() => {
                  setLeave(false)
                  pending.current = null
                  settleLeave(false)
                }}
              >
                继续编辑
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setLeave(false)
                  setEditing(false)
                  pending.current?.()
                  pending.current = null
                  settleLeave(true)
                }}
              >
                放弃修改
              </Button>
            </>
          }
        >
          <p>离开后将保留上次保存的页面布局。</p>
        </Modal>
      )}
    </section>
  )
}
