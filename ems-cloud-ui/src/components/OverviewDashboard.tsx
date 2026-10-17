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
import { dateKey,calendarBounds } from "@/preferences/date"
import {defaultMonitorLayout,type MonitorStation,type MonitorWidget} from '@/api/monitor'
import {hasStationPermission} from '@/auth/apiPermissions'
import MonitorAnalytics from './MonitorAnalytics'
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
  const [draftWidgets,setDraftWidgets]=useState<MonitorWidget[]>([])
  const [appliedRange,setAppliedRange]=useState({start:dateKey(new Date()),end:dateKey(new Date())})
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(cards),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [leave, setLeave] = useState(false),
    [custom, setCustom] = useState(false),
    [period, setPeriod] = useState("今日"),
    [range, setRange] = useState({
      start: dateKey(new Date()),
      end: dateKey(new Date()),
    })
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
  const currentWidgets=(widgets.length?widgets:defaultMonitorLayout(cards)).filter(w=>cards.includes(w.card))
  const today=dateKey(new Date()),startDate=new Date(today+'T00:00:00Z');startDate.setUTCDate(startDate.getUTCDate()-(period==='近7天'?6:period==='近30天'?29:0))
  const historyFrom=calendarBounds(period==='自定义'?appliedRange.start:startDate.toISOString().slice(0,10),'D').start.toISOString(),historyTo=new Date(calendarBounds(period==='自定义'?appliedRange.end:today,'D').end.getTime()+1).toISOString()
  const telemetryIds=stations.filter(s=>hasStationPermission(user,s.id,'telemetry.read')).map(s=>s.id)
  const historyPanel=<MonitorAnalytics stationIds={telemetryIds} names={Object.fromEntries(stations.map(s=>[s.id,s.name]))} from={historyFrom} to={historyTo} onOpenStation={onOpenStation} canExport={telemetryIds.length>0&&telemetryIds.every(id=>hasStationPermission(user,id,'report.export'))}/>
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
        "当前授权站点快照",
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
    a.download = "总览站点快照.csv"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice("已导出当前授权站点快照")
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
            {["今日", "近7天", "近30天", "自定义"].map((p) => (
              <button
                key={p}
                aria-pressed={period === p}
                onClick={() => {
                  setPeriod(p)
                  if (p === "自定义") setCustom(true)
                }}
              >
                {p}
              </button>
            ))}
          </div>
          <Button onClick={exportData}>
            <img src="/figma/overview/dashboard/imgDownload.svg" alt="" />
            站点快照导出
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
        资产与通信为当前快照；实测功率按所选日期读取，最长31天。
      </p>
      {!DEMO_MODE&&<div className="overview-dashboard-actions" aria-label="授权范围统计"><span>站点 {monitorStations.length}</span><span>通信在线 {monitorStations.filter(s=>s.communication==='online').length}</span><span>通信离线 {monitorStations.filter(s=>s.communication==='offline').length}</span><span>未取得心跳 {monitorStations.filter(s=>s.communication==='unknown').length}</span><span>设备 {monitorStations.reduce((n,s)=>n+Number(s.device_count),0)}</span><span>额定功率 {monitorStations.reduce((n,s)=>n+Number(s.rated_power_kw),0).toFixed(1)} kW</span><span>储能容量 {monitorStations.filter(s=>s.scene==='BESS'||s.scene==='Hybrid').reduce((n,s)=>n+Number(s.capacity_kwh),0).toFixed(1)} kWh</span><span>光伏装机 {monitorStations.some(s=>s.solar_capacity_kw===null)?'—':monitorStations.reduce((n,s)=>n+Number(s.solar_capacity_kw),0).toFixed(1)} kWp</span></div>}
      {notice && (
        <p role="status" className="overview-notice">
          {notice}
        </p>
      )}
      {!DEMO_MODE?<div style={{display:'grid',gridTemplateColumns:'repeat(12,minmax(0,1fr))',gridAutoRows:'minmax(68px,auto)',gap:16}} aria-label="个人看板布局">{currentWidgets.map(w=><div key={w.card} style={{gridColumn:`${w.x+1} / span ${w.w}`,gridRow:`${w.y+1} / span ${w.h}`,minWidth:0}} data-layout-card={w.card}>{w.card==='储能充放趋势'?historyPanel:['异常与告警实时监控','子系统可用性与出力'].includes(w.card)?<BottomBar stations={stations} role={role} visibleCards={[w.card]} onSelectStation={s=>onOpenStation(s.id)} onViewAll={alarms}/>:['在线运行容量','能源供应与构成','收益概览','运行健康','交付就绪度'].includes(w.card)?<RightPanel stations={stations} role={role} visibleCards={[w.card]}/>:<LeftPanel stations={stations} role={role} visibleCards={[w.card]} onViewStations={viewStations}/>}</div>)}</div>:<><div className="overview-shared-card-grid">
        <LeftPanel
          stations={stations}
          role={role}
          visibleCards={cards}
          onViewStations={viewStations}
        />
        <RightPanel stations={stations} role={role} visibleCards={cards} />
      </div>
      </>}
      {!DEMO_MODE&&!cards.includes('储能充放趋势')&&user.permissions.includes('telemetry.read')&&historyPanel}
      {DEMO_MODE&&<div className="overview-shared-bottom">
        <BottomBar
          stations={stations}
          role={role}
          visibleCards={cards}
          onSelectStation={(s) => onOpenStation(s.id)}
          onViewAll={alarms}
        />
      </div>}
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
            {DEMO_MODE ? "演示模式：布局保存在当前浏览器。" : "保存当前私人模板或默认看板的12列布局；坐标从0开始，模块不能重叠。版本冲突时刷新版本后核对草稿。"}
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
              {!DEMO_MODE&&draft.includes(s)&&(['x','y','w','h'] as const).map(key=><label key={key}>{({x:'列',y:'行',w:'宽',h:'高'})[key]}<input aria-label={`${s}-${key}`} type="number" min={key==='w'||key==='h'?1:0} max={key==='y'?100:12} value={draftWidgets.find(w=>w.card===s)?.[key]??0} onChange={e=>setDraftWidgets(previous=>previous.map(w=>w.card===s?{...w,[key]:Number(e.target.value)}:w))}/></label>)}
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
                if (!range.start||!range.end||range.start > range.end||Date.parse(range.end)-Date.parse(range.start)>30*86400000) {
                  setError("请选择31天内有效日期范围")
                  return
                }
                setAppliedRange(range)
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
              value={range.start}
              onChange={(e) => setRange({ ...range, start: e.target.value })}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              value={range.end}
              onChange={(e) => setRange({ ...range, end: e.target.value })}
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
