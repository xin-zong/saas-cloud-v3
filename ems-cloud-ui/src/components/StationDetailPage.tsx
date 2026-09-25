import { useEffect, useRef, useState } from "react"
import type { Station } from "@/App"
import { DEMO_MODE } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import type { StationSubNav, UserRole } from "@/auth/roles"
import StationOverviewPage from "./StationOverviewPage"
import StationRevenuePage from "./StationRevenuePage"
import StationStrategyPage from "./StationStrategyPage"
import StationAlarmsPage from "./StationAlarmsPage"
import StationRunCurvePage from "./StationRunCurvePage"
import StationSingleLinePage from "./StationSingleLinePage"
import StationDevicesPage from "./StationDevicesPage"
import StationPriceSettingsPage from "./StationPriceSettingsPage"

const SUB_NAVS: readonly StationSubNav[] = [
  "站点概览",
  "运营收益",
  "运行策略",
  "告警信息",
  "运行曲线",
  "一次接线图",
  "设备详情",
  "电价设置",
]
const STATUS_COLOR: Record<string, string> = {
  online: "#299d7c",
  fault: "#e5a343",
  offline: "#9ca3af",
  building: "#6d9bc0",
}
interface Props {
  tabs: Station[]
  activeId: string
  onClose: (id: string) => void
  onSetActive: (id: string) => void
  onBack: () => void
  onRefresh?: () => void
  initialSubNav?: string
  allowedSubNavs?: readonly StationSubNav[]
  role?: UserRole
}
function Placeholder({ nav }: { nav: string }) {
  return <div className="ui-page">{nav}暂无数据</div>
}
export default function StationDetailPage({
  tabs,
  activeId,
  onClose,
  onSetActive,
  onBack,
  onRefresh,
  initialSubNav = "站点概览",
  allowedSubNavs = SUB_NAVS,
  role = "operator",
}: Props) {
  const { user } = useAuth()
  const station = tabs.find((item) => item.id === activeId)
  const normalizedInitialSubNav =
    initialSubNav === "数据分析" ? "运行曲线" : initialSubNav
  const visibleSubNavs = SUB_NAVS.filter((item) =>
    allowedSubNavs.includes(item),
  )
  const allowedKey = visibleSubNavs.join("|")
  const savedSubNavs = useRef<Record<string, string>>({})
  const previousStation = useRef(activeId)
  const [deviceId, setDeviceId] = useState<string>()
  const [subNav, setSubNav] = useState<string>(
    visibleSubNavs.includes(normalizedInitialSubNav as StationSubNav)
      ? normalizedInitialSubNav
      : (visibleSubNavs[0] ?? ""),
  )
  const selectSubNav = (next: string) => {
    const valid = visibleSubNavs.includes(next as StationSubNav)
      ? next
      : (visibleSubNavs[0] ?? "")
    savedSubNavs.current[activeId] = valid
    setSubNav(valid)
  }
  useEffect(() => {
    const next =
      previousStation.current !== activeId
        ? (savedSubNavs.current[activeId] ?? normalizedInitialSubNav)
        : normalizedInitialSubNav
    previousStation.current = activeId
    setDeviceId(undefined)
    setSubNav(
      allowedKey.split("|").includes(next)
        ? next
        : (allowedKey.split("|")[0] ?? ""),
    )
  }, [activeId, normalizedInitialSubNav, allowedKey])
  if (!station) return null
  return (
    <div className="station-detail-shell">
      <div className="station-open-tabs">
        <div className="station-open-tabs-list" aria-label="已打开站点">
          {tabs.map((tab) => (
            <div
              className="station-open-tab"
              data-active={tab.id === activeId}
              key={tab.id}
            >
              <button
                aria-current={tab.id === activeId ? "page" : undefined}
                onClick={() => onSetActive(tab.id)}
              >
                <i
                  style={{ background: STATUS_COLOR[tab.status] ?? "#9ca3af" }}
                />
                {tab.name}
              </button>
              <button
                aria-label={`关闭${tab.name}`}
                onClick={() => onClose(tab.id)}
              >
                <img src="/figma/stations/overview/imgIconClose.svg" alt="" />
              </button>
            </div>
          ))}
          <span className="station-open-tabs-count">已打开 {tabs.length}</span>
        </div>
        <button className="station-list-return" onClick={onBack}>
          <img src="/figma/stations/overview/imgIconStationList.svg" alt="" />
          站点列表
        </button>
      </div>
      {/* ── Secondary navigation ── */}
      <nav className="ui-tabs" aria-label="站点二级导航">
        {visibleSubNavs.map((nav) => {
          const active = nav === subNav

          return (
            <button
              key={nav === "运行策略" ? "策略运行" : nav}
              onClick={() => selectSubNav(nav)}
              aria-current={active ? "page" : undefined}
            >
              {nav === "运行策略" ? "策略运行" : nav}
            </button>
          )
        })}
      </nav>

      {/* ── Content ── */}
      {subNav === "站点概览" && (
        <StationOverviewPage
          key={station.id}
          station={station}
          onSetSubNav={selectSubNav}
          allowedSubNavs={visibleSubNavs}
        />
      )}
      {subNav === "运营收益" && <StationRevenuePage key={station.id} station={station} />}
      {subNav === "运行策略" && <StationStrategyPage key={station.id} station={station} />}
      {subNav === "告警信息" && (
        <StationAlarmsPage
          onRefresh={onRefresh}
          key={station.id}
          station={station}
          canCreateOrder={
            DEMO_MODE
              ? role !== "owner"
              : hasStationPermission(user, station.id, "workorder.create")
          }
        />
      )}
      {subNav === "运行曲线" && (
        <StationRunCurvePage key={station.id} station={station} />
      )}
      {subNav === "一次接线图" && (
        <StationSingleLinePage
          key={station.id}
          station={station}
          onOpenDevices={(id) => {
            setDeviceId(id)
            selectSubNav("设备详情")
          }}
        />
      )}
      {subNav === "设备详情" && (
        <StationDevicesPage
          key={station.id}
          station={station}
          initialDeviceId={deviceId}
        />
      )}
      {subNav === "电价设置" && (
        <StationPriceSettingsPage
          key={station.id}
          station={station}
          onOpenStrategy={() => selectSubNav("运行策略")}
        />
      )}
      {subNav !== "站点概览" &&
        subNav !== "运营收益" &&
        subNav !== "运行策略" &&
        subNav !== "告警信息" &&
        subNav !== "运行曲线" &&
        subNav !== "一次接线图" &&
        subNav !== "设备详情" &&
        subNav !== "电价设置" && <Placeholder nav={subNav} />}
    </div>
  )
}
