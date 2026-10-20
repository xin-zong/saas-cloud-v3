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

import CompactOverviewDashboard from "./CompactOverviewDashboard"

import { dateKey } from "@/preferences/date"

type Props = {
  stations: Station[]

  user: AuthUser

  nav: NavLabel[]

  onNavigate: (nav: NavLabel) => void

  onOpenStation: (id: string, subNav?: string) => void

  registerLeaveGuard: (guard: null | (() => Promise<boolean>)) => void

  cards: string[]

  availableCards: string[]

  onUpdateCards: (cards: string[]) => void

  region: string
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

  region,
}: Props) {
  const [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(cards),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [leave, setLeave] = useState(false),
    [custom, setCustom] = useState(false),
    [period, setPeriod] = useState("近7天"),
    [range, setRange] = useState({
      start: dateKey(new Date()),

      end: dateKey(new Date()),
    })

  const pending = useRef<null | (() => void)>(null)

  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(cards)

  const { settleLeave } = useEditorLeaveGuard({
    dirty,

    registerLeaveGuard,

    onConfirm: () => setLeave(true),

    onCancel: () => setLeave(false),
  })

  const authorizationKey = `${availableCards.join("|")}:${[...user.permissions].sort().join("|")}:${[...user.stationIds].sort().join("|")}`

  useEffect(() => {
    // Permission/scope changes cancel the pending destination and the stale editor.

    pending.current = null

    settleLeave(false)

    setLeave(false)

    setEditing(false)

    setDraft(cards)
  }, [authorizationKey, settleLeave])

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
    <section
      className="overview-dashboard exact-figma-dashboard"
      aria-label="经营看板"
    >
      <div className="overview-dashboard-heading">
        <div>
          <h1>平台总览运营看板</h1>
          <p>快速获悉全场站的电量分发、设备运行及实时收益趋势</p>
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
            数据导出
          </Button>
          <Button
            onClick={() => {
              setDraft(cards)

              setEditing(true)

              setError("")
            }}
          >
            <img src="/figma/overview/dashboard/imgEdit.svg" alt="" />
            页面定制
          </Button>
        </div>
      </div>
      {notice && (
        <p role="status" className="overview-notice">
          {notice}
        </p>
      )}
      <CompactOverviewDashboard
        stations={stations}
        user={user}
        region={region}
        onOpenStation={onOpenStation}
        onNavigate={onNavigate}
        nav={nav}
        show={(name) => cards.includes(name)}
        period={period}
        range={range}
      />
      <details className="compact-role-extras">
        <summary>更多指标与页面说明</summary>
        <p className="overview-dashboard-range">
          当前授权站点快照 · 历史聚合未接通，所选日期不改变当前快照
        </p>
        <div className="overview-shared-card-grid">
          <LeftPanel
            stations={stations}
            role={role}
            visibleCards={cards}
            onViewStations={viewStations}
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
      </details>
      {editing && (
        <Modal
          title="页面定制"
          onClose={() => {
            if (dirty) {
              pending.current = () => setEditing(false)

              setLeave(true)
            } else setEditing(false)
          }}
          actions={
            <>
              <Button
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
                onClick={() => {
                  if (!draft.length) {
                    setError("请至少保留一个看板模块")

                    return
                  }

                  try {
                    onUpdateCards(draft)

                    setEditing(false)

                    setNotice("布局已保存至本机，地图总览同步更新")
                  } catch {
                    setError("无法保存至本机，请检查浏览器存储后重试")
                  }
                }}
              >
                保存页面布局
              </Button>
            </>
          }
        >
          <p>
            两个视图展示相同卡片；布局仅保存在当前账号和站点范围的本机浏览器。
          </p>
          {availableCards.map((s) => (
            <label key={s} className="overview-checkbox">
              <input
                type="checkbox"
                checked={draft.includes(s)}
                onChange={(e) =>
                  setDraft(
                    e.target.checked
                      ? [...draft, s]
                      : draft.filter((x) => x !== s),
                  )
                }
              />
              {s}
            </label>
          ))}
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
      {custom && (
        <Modal
          title="自定义时间范围"
          onClose={() => setCustom(false)}
          actions={
            <Button
              onClick={() => {
                if (range.start > range.end) {
                  setError("结束日期不能早于开始日期")

                  return
                }

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
