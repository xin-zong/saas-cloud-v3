import { DEMO_MODE, send } from "@/api/client"

import { loadStations } from "@/api/stations"
import { apiRoleConfig, hasStationPermission, stationRoleConfig } from "@/auth/apiPermissions"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import Sidebar from "@/components/Sidebar"
import StationGlobalHeader from "@/components/StationGlobalHeader"
import "@/styles/stations-figma.css"

import Header from "@/components/Header"

import MapView from "@/components/MapView"

import LeftPanel from "@/components/LeftPanel"

import RightPanel from "@/components/RightPanel"

import BottomBar from "@/components/BottomBar"

import StationPopup from "@/components/StationPopup"

import TickerBar from "@/components/TickerBar"

import AssetsPage from "@/components/AssetsPage"

import StationDetailPage from "@/components/StationDetailPage"

import LivePreview from "@/dev/LivePreview"

import type { StationAlarm } from "@/data/stationAlarms"

import type { TelemetrySample } from "@/data/stationTelemetry"

import type { StationDevice } from "@/data/stationDevices"

import type { OperationsData } from "@/data/operations"

import OperationsCenterPage from "@/components/OperationsCenterPage"

import MaintenanceCenterPage from "@/components/MaintenanceCenterPage"

import WorkOrdersApprovalPage from "@/components/WorkOrdersApprovalPage"

import AnalyticsAiPage from "@/components/AnalyticsAiPage"

import GlobalAiDrawer from "@/components/GlobalAiDrawer"

import PlatformManagementPage from "@/components/PlatformManagementPage"

import SystemSettingsPage from "@/components/SystemSettingsPage"

import type { MaintenanceData } from "@/data/stationMaintenance"

import { stationsDataNow } from "@/data/dataClock"

import { demoStations } from "@/data/demoStations"

import LoginPage from "@/components/LoginPage"

import { useAuth } from "@/auth/AuthContext"

import {
  ROLE_CONFIG,
  canAccessStation,
  type AuthUser,
  type NavLabel,
} from "@/auth/roles"

export type RevenueHistoryPoint = {
  date: string

  amount?: number

  settled?: number

  pending?: number

  est?: number

  peakValley?: number

  demand?: number

  pv?: number

  vpp?: number

  penalty?: number
}

export type Station = {
  // Identity

  id: string

  name: string

  shortName: string

  code: string

  // Status

  status: "online" | "fault" | "offline" | "building"

  runStatus: string // "正常" | "待机" | "维护中" | "异常"

  // Map

  x: number

  y: number

  // Devices

  devices: {
    online: number

    fault: number

    offline: number

    building: number
  }

  // Power metrics

  activePower: number

  ratedPower: number

  loadRate: number

  pvOutput: number

  storageCapacity: number

  soc: number

  generator: number

  // Alerts

  alerts: {
    msg: string

    time: string

    level: "critical" | "warning"
  }[]

  alarmHistory?: StationAlarm[]

  telemetryHistory?: TelemetrySample[]

  deviceInventory?: StationDevice[]

  operations?: OperationsData

  maintenance?: MaintenanceData

  // Asset fields (editable via AssetsPage)

  type: string // "BESS" | "PV" | "Wind" | "Hybrid" | "Diesel"

  region: string // "华东"

  project: string

  address: string

  lng: string

  lat: string

  mode: string // "削峰填谷" | "需量管理" | ...

  runtime: string

  revenue: string

  revenueHistory?: RevenueHistoryPoint[] // normalized historical revenue data for trend charts

  revenueSource?: "demo" | "connected"

  imageUrl: string

  dataStatus: "connected" | "partial" | "disconnected"

  updateTime: string

  updateSub: string

  // Contact

  manager: string

  email: string

  phone: string

  role: string

  // Misc

  remark: string
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear()

  const month = String(value.getMonth() + 1).padStart(2, "0")

  const day = String(value.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

const initialStationsWithHistory: Station[] = demoStations

const navItems = [
  { icon: "grid", label: "总览" },

  { icon: "map-pin", label: "资产与站点" },

  { icon: "activity", label: "运营中心" },

  { icon: "wrench", label: "运维中心" },

  { icon: "file-text", label: "工单与审批" },

  { icon: "bar-chart-2", label: "分析与报告" },

  { icon: "settings-2", label: "平台管理" },

  { icon: "settings", label: "设置" },
]

const REGION_MENU = [
  { label: "全部区域", value: "" },

  { group: "中国大陆" },

  { label: "华东", value: "华东" },

  { label: "华南", value: "华南" },

  { label: "华北", value: "华北" },

  { label: "华中", value: "华中" },

  { label: "西南", value: "西南" },

  { label: "西北", value: "西北" },

  { label: "东北", value: "东北" },

  { group: "亚太" },

  { label: "东南亚", value: "东南亚" },

  { label: "日韩", value: "日韩" },

  { label: "南亚", value: "南亚" },

  { label: "澳洲", value: "澳洲" },

  { group: "欧洲" },

  { label: "西欧", value: "西欧" },

  { label: "中东欧", value: "中东欧" },

  { label: "北欧", value: "北欧" },

  { group: "美洲" },

  { label: "北美", value: "北美" },

  { label: "拉丁美洲", value: "拉丁美洲" },

  { group: "中东 & 非洲" },

  { label: "中东", value: "中东" },

  { label: "非洲", value: "非洲" },
]

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function parseCurrencyValue(value: string) {
  if (!value || value.trim() === "—") return 0

  const parsed = Number(value.replace(/[^\d.-]/g, ""))

  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrencyValue(value: number) {
  return `¥${Math.round(value).toLocaleString()}`
}

function getInitialNavFromHash(user: AuthUser) {
  const config = DEMO_MODE ? ROLE_CONFIG[user.role] : apiRoleConfig(user)

  if (
    typeof window !== "undefined" &&
    window.location.hash.startsWith("#work-orders") &&
    config.nav.includes("工单与审批")
  ) {
    return "工单与审批"
  }

  return config.defaultNav
}

function getInitialWorkOrdersViewFromHash(user: AuthUser) {
  if (typeof window === "undefined") return undefined

  const views = (DEMO_MODE ? ROLE_CONFIG[user.role] : apiRoleConfig(user)).workOrderViews

  if (
    window.location.hash === "#work-orders-approval" &&
    views.includes("审批中心")
  )
    return "审批中心"

  if (
    window.location.hash === "#work-orders-todo" &&
    views.includes("我的待办")
  )
    return "我的待办"

  return undefined
}

export default function App() {
  const { user } = useAuth()

  if (!user) return <LoginPage />

  return <AuthenticatedApp key={user.id} user={user} />
}

function AuthenticatedApp({ user }: { user: AuthUser }) {
  const { logout } = useAuth()
  const platformLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const sidebarTransitionPending = useRef(false)
  const registerPlatformLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { platformLeaveGuard.current = guard }, [])

  const roleConfig = useMemo(
    () => (DEMO_MODE ? ROLE_CONFIG[user.role] : apiRoleConfig(user)),
    [user],
  )
  const [stations, setStations] = useState<Station[]>(
    DEMO_MODE ? initialStationsWithHistory : [],
  )

  const [apiError, setApiError] = useState("")

  const [apiLoading, setApiLoading] = useState(!DEMO_MODE)

  const [revision, setRevision] = useState(0)

  const refreshApi = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (DEMO_MODE) return

    const controller = new AbortController()

    setApiLoading(true)

    setApiError("")

    loadStations(user, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setStations(next)
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setStations([])
          setApiError(error instanceof Error ? error.message : "数据加载失败")
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setApiLoading(false)
      })

    return () => controller.abort()
  }, [user, revision])

  const [selectedStation, setSelectedStation] = useState<Station | null>(null)

  const [popupPos, setPopupPos] = useState<{
    x: number

    y: number
  } | null>(null)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [activeNav, setActiveNav] = useState<NavLabel>(() =>
    getInitialNavFromHash(user),
  )

  const [workOrderFocus, setWorkOrderFocus] = useState<{
    stationId: string

    orderId?: string
  } | null>(null)

  const [immersive, setImmersive] = useState(false)

  const [region, setRegion] = useState("")

  const [regionOpen, setRegionOpen] = useState(false)

  const regionRef = useRef<HTMLDivElement>(null)

  // Station detail tabs

  const [detailTabs, setDetailTabs] = useState<string[]>([])

  const [activeDetailId, setActiveDetailId] = useState<string | null>(null)

  const [detailSubNav, setDetailSubNav] = useState("站点概览")

  const operationalStations = stations.filter(station => canAccessStation(user, station.id))
  const scopedStations = useMemo(
    () => stations.filter((station) => canAccessStation(user, station.id) && (DEMO_MODE || hasStationPermission(user, station.id, "asset.read"))),

    [stations, user],
  )

  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) =>
        roleConfig.nav.includes(item.label as NavLabel),
      ),

    [roleConfig.nav],
  )

  function handleOpenStation(id: string, subNav = "站点概览") {
    if (!canAccessStation(user, id) || (!DEMO_MODE && !hasStationPermission(user, id, "asset.read"))) return

    setActiveNav("资产与站点")

    setDetailSubNav(
      roleConfig.stationSubNavs.includes(subNav as never) ? subNav : "站点概览",
    )

    setDetailTabs((prev) => (prev.includes(id) ? prev : [...prev, id]))

    setActiveDetailId(id)
  }

  function handleCloseDetailTab(id: string) {
    setDetailTabs((prev) => {
      const next = prev.filter((t) => t !== id)

      setActiveDetailId((curr) => {
        if (curr !== id) return curr

        const closedIndex = prev.indexOf(id)
        return next[closedIndex] ?? next[closedIndex - 1] ?? null
      })

      return next
    })
  }

  function handleBackFromDetail() {
    setActiveDetailId(null)
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(e.target as Node))
        setRegionOpen(false)
    }

    document.addEventListener("mousedown", handler)

    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleUpdateStation = useCallback(
    async (id: string, patch: Partial<Station>) => {
      if (!canAccessStation(user, id) || !(DEMO_MODE ? roleConfig.canEditAssets : hasStationPermission(user, id, "asset.edit"))) return

      if (!DEMO_MODE) {
        const current = stations.find((s) => s.id === id)

        if (!current) return

        const next = { ...current, ...patch }

        await send(`/stations/${id}`, "PUT", {
          name: next.name,
          ratedPowerKw: Number.isFinite(next.ratedPower) ? next.ratedPower : undefined,
          capacityKwh: Number.isFinite(next.storageCapacity) ? next.storageCapacity : undefined,
          region: next.region,
          address: next.address,
          longitude: next.lng ? Number(next.lng) : null,
          latitude: next.lat ? Number(next.lat) : null,
        })

        refreshApi()

        return
      }

      setStations((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      )

      setSelectedStation((sel) => (sel?.id === id ? { ...sel, ...patch } : sel))
    },

    [roleConfig.canEditAssets, user, stations, refreshApi],
  )

  const handleCreateStation = useCallback(
    (patch: Partial<Station>) => {
      if (!DEMO_MODE || !roleConfig.canEditAssets) return

      const template = stations[0] ?? initialStationsWithHistory[0]

      if (!template) return

      const id = `station-${Date.now()}`

      const code = `ST-${String(stations.length + 1).padStart(4, "0")}`

      const newStation: Station = {
        ...template,

        ...patch,

        id,

        code,

        shortName:
          patch.shortName ??
          patch.name?.slice(0, 4) ??
          `新站${stations.length + 1}`,

        status: "building",

        runStatus: "建设中",

        x: 42 + (stations.length % 4) * 8,

        y: 42 + (stations.length % 3) * 7,

        devices: { online: 0, fault: 0, offline: 0, building: 0 },

        alerts: [],

        alarmHistory: [],

        telemetryHistory: [],

        deviceInventory: [],

        operations: undefined,

        maintenance: undefined,

        activePower: patch.activePower ?? 0,

        loadRate: 0,

        pvOutput: 0,

        generator: 0,

        storageCapacity: 0,

        soc: patch.soc ?? 0,

        runtime: "0 小时",

        revenue: "—",

        revenueHistory: [],

        revenueSource: "demo",

        dataStatus: "disconnected",

        updateTime: "刚刚",

        updateSub: "待设备接入",
      }

      setStations((current) => [...current, newStation])

      setActiveNav("资产与站点")

      setDetailTabs((current) =>
        current.includes(id) ? current : [...current, id],
      )

      setActiveDetailId(id)

      setDetailSubNav("站点概览")
    },

    [roleConfig.canEditAssets, stations],
  )

  const handleSimulateDataChange = useCallback(() => {
    setStations((prev) => {
      const dataDate = formatLocalDate(stationsDataNow(prev))

      return prev.map((station, index) => {
        if (index > 2) return station

        const direction = index % 2 === 0 ? 1 : -1

        const activeBase =
          station.activePower ||
          Math.max(80, Math.round(station.ratedPower * 0.42))

        const activePower = Math.max(
          0,

          Math.round(activeBase + direction * (120 + index * 35)),
        )

        const soc = Number(
          clampNumber(station.soc + direction * (6.5 + index), 0, 100).toFixed(
            1,
          ),
        )

        const pvOutput = Number(
          Math.max(
            0,

            station.pvOutput + direction * (0.28 + index * 0.08),
          ).toFixed(2),
        )

        const generator = Number(
          Math.max(
            0,

            station.generator + direction * (0.08 + index * 0.03),
          ).toFixed(2),
        )

        const revenueValue = parseCurrencyValue(station.revenue)

        const nextRevenueValue = revenueValue
          ? revenueValue + 2800 + index * 950
          : 0

        const status =
          index === 0
            ? station.status === "online"
              ? "fault"
              : "online"
            : station.status

        const devices =
          index === 0
            ? {
                ...station.devices,

                online: Math.max(0, station.devices.online - 1),

                fault: station.devices.fault + 1,
              }
            : index === 2
              ? { ...station.devices, online: station.devices.online + 1 }
              : station.devices

        return {
          ...station,

          status,

          runStatus: status === "fault" ? "异常" : station.runStatus,

          activePower,

          loadRate: Number(
            clampNumber(
              (activePower / Math.max(1, station.ratedPower)) * 100,

              0,

              100,
            ).toFixed(1),
          ),

          pvOutput,

          generator,

          soc,

          devices,

          revenue: nextRevenueValue
            ? formatCurrencyValue(nextRevenueValue)
            : station.revenue,

          revenueHistory: station.revenueHistory?.map((point) => {
            if (point.date !== dataDate) return point

            const est = Math.max(0, Math.round(nextRevenueValue / 45))

            const total = (point.settled ?? 0) + (point.pending ?? 0) + est

            return {
              ...point,

              est,

              peakValley: Math.round(total * (0.48 + (index % 3) * 0.03)),

              demand: Math.round(total * 0.18),

              pv: Math.round(total * 0.15),

              vpp: Math.round(total * 0.08),

              penalty: -Math.round(total * 0.03),
            }
          }),

          updateTime: "刚刚",

          updateSub: "实时推送",
        }
      })
    })
  }, [])

  useEffect(() => {
    setSelectedStation((selected) => {
      if (!selected) return selected

      return (
        scopedStations.find((station) => station.id === selected.id) ?? null
      )
    })
  }, [scopedStations])

  useEffect(() => {
    if (roleConfig.nav.includes(activeNav)) return

    setActiveNav(roleConfig.defaultNav)

    setActiveDetailId(null)

    setSelectedStation(null)
  }, [activeNav, roleConfig])

  useEffect(() => {
    const isLocalPreview =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1"

    if (!DEMO_MODE || (!import.meta.env.DEV && !isLocalPreview)) return

    const patchStationFromData = (id: string, patch: Partial<Station>) => {
      if (!canAccessStation(user, id)) return

      setStations((prev) =>
        prev.map((station) =>
          station.id === id ? { ...station, ...patch } : station,
        ),
      )

      setSelectedStation((selected) =>
        selected?.id === id ? { ...selected, ...patch } : selected,
      )
    }

    const debugApi = {
      getStations: () => stations,

      replaceStations: (nextStations: Station[]) => setStations(nextStations),

      patchStation: patchStationFromData,
    }

    try {
      Object.defineProperty(window, "__ENERLUTION_DATA__", {
        configurable: true,

        value: debugApi,
      })
    } catch {
      // Some embedded preview browsers keep window non-extensible.
    }

    if (typeof window.addEventListener !== "function") return

    const handlePatchStation = (event: Event) => {
      const detail = (event as CustomEvent<{
        id?: string

        patch?: Partial<Station>
      }>).detail

      if (!detail?.id || !detail.patch) return

      patchStationFromData(detail.id, detail.patch)
    }

    const handleReplaceStations = (event: Event) => {
      const detail = (event as CustomEvent<{ stations?: Station[] }>).detail

      if (!Array.isArray(detail?.stations)) return

      setStations(detail.stations)
    }

    const handleGetStations = (event: Event) => {
      const detail = (event as CustomEvent<{
        respond?: (stations: Station[]) => void
      }>).detail

      detail?.respond?.(stations)
    }

    window.addEventListener("enerlution:patch-station", handlePatchStation)

    window.addEventListener(
      "enerlution:replace-stations",

      handleReplaceStations,
    )

    window.addEventListener("enerlution:get-stations", handleGetStations)

    return () => {
      window.removeEventListener("enerlution:patch-station", handlePatchStation)

      window.removeEventListener(
        "enerlution:replace-stations",

        handleReplaceStations,
      )

      window.removeEventListener("enerlution:get-stations", handleGetStations)

      try {
        delete window.__ENERLUTION_DATA__
      } catch {
        // Global debug API is optional; event bridge remains the stable path.
      }
    }
  }, [stations, user])

  return (
    <div className="workspace-shell" data-nav-collapsed={sidebarCollapsed} data-design-area={activeNav === "资产与站点" ? "stations" : undefined}>
      {activeNav === "资产与站点" && <StationGlobalHeader user={user} onLogout={logout} status={DEMO_MODE ? undefined : apiError || (apiLoading ? "正在加载授权站点…" : `已连接业务服务 · ${stations.length} 个授权站点`)} loading={apiLoading} onRefresh={refreshApi} />}
      {!immersive && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          navItems={visibleNavItems}
          activeNav={activeNav}
          onNavChange={(nav) => { void (async () => {
            if (sidebarTransitionPending.current) return
            sidebarTransitionPending.current = true
            try {
              if (activeNav === "平台管理" && nav !== activeNav && platformLeaveGuard.current && !(await platformLeaveGuard.current())) return
              if (nav === "工单与审批") setWorkOrderFocus(null)
              setActiveNav(nav as NavLabel)
            } finally { sidebarTransitionPending.current = false }
          })() }}
          user={user}
          onLogout={logout}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {!DEMO_MODE && activeNav !== "资产与站点" && (
          <div
            role={apiError ? "alert" : "status"}
            style={{
              padding: "5px 24px",
              background: apiError ? "#fff1f0" : "#edf6f2",
              color: "#24423b",
              fontSize: 12,
            }}
          >
            {apiError ||
              (apiLoading
                ? "正在从服务器加载授权站点…"
                : `已连接业务服务 · ${stations.length} 个授权站点`)}
            <button
              onClick={refreshApi}
              disabled={apiLoading}
              style={{ marginLeft: 12 }}
            >
              刷新
            </button>
          </div>
        )}
        {/* Station detail page — only within 资产与站点 nav */}
        {activeNav === "资产与站点" && activeDetailId !== null && (
          <StationDetailPage
            onRefresh={refreshApi}
            tabs={detailTabs

              .map((id) => scopedStations.find((s) => s.id === id)!)

              .filter(Boolean)}
            activeId={activeDetailId}
            initialSubNav={detailSubNav}
            onClose={handleCloseDetailTab}
            onSetActive={(id) => {
              setDetailSubNav("站点概览")

              setActiveDetailId(id)
            }}
            onBack={handleBackFromDetail}
            allowedSubNavs={DEMO_MODE ? roleConfig.stationSubNavs : stationRoleConfig(user, activeDetailId).stationSubNavs}
            role={user.role}
          />
        )}

        {activeNav !== "资产与站点" &&
          ![
            "运营中心",

            "运维中心",

            "工单与审批",

            "分析与报告",

            "平台管理",

            "设置",
          ].includes(activeNav) &&
          !immersive && (
            <Header
              immersive={immersive}
              onToggleImmersive={() => setImmersive(true)}
              user={user}
              onLogout={logout}
            />
          )}

        {activeNav === "总览" && (
          <TickerBar
            stations={scopedStations}
            onSelectStation={setSelectedStation}
            role={user.role}
          />
        )}

        {/* Assets page — hidden (not unmounted) so its tab state survives nav switches */}
        <div
          style={{
            display:
              activeNav === "资产与站点" && activeDetailId === null
                ? "flex"
                : "none",

            flex: 1,

            minHeight: 0,

            flexDirection: "column",
          }}
        >
          <AssetsPage
            stations={scopedStations}
            onUpdateStation={handleUpdateStation}
            onCreateStation={handleCreateStation}
            onOpenStation={handleOpenStation}
            canEdit={
              roleConfig.canEditAssets &&
              (DEMO_MODE || user.permissions.includes("asset.edit"))
            }
            canEditStation={id => DEMO_MODE ? roleConfig.canEditAssets : hasStationPermission(user, id, "asset.edit")}
            showRevenue={roleConfig.showAssetRevenue}
          />
        </div>

        {/* Map area */}
        {activeNav === "运营中心" && (
          <OperationsCenterPage
            stations={operationalStations}
            onOpenStation={handleOpenStation}
            allowedTabs={roleConfig.operationsTabs}
          />
        )}
        {activeNav === "运维中心" && (
          <MaintenanceCenterPage
            onServerChange={refreshApi}
            stations={operationalStations}
            onOpenStation={handleOpenStation}
            allowedTabs={roleConfig.maintenanceTabs}
            role={user.role}
            onOpenOrders={(stationId, orderId) => {
              setWorkOrderFocus({ stationId, orderId })

              setActiveNav("工单与审批")
            }}
          />
        )}
        {activeNav === "工单与审批" && (
          <WorkOrdersApprovalPage
            stations={operationalStations}
            onServerChange={refreshApi}
            initialFocus={workOrderFocus}
            initialView={getInitialWorkOrdersViewFromHash(user)}
            allowedViews={roleConfig.workOrderViews}
            role={user.role}
          />
        )}
        {activeNav === "分析与报告" && (
          <AnalyticsAiPage
            stations={operationalStations}
            onOpenStation={handleOpenStation}
            allowedTabs={roleConfig.analysisTabs}
            allowedReportTypes={roleConfig.reportTypes}
            role={user.role}
          />
        )}
        {activeNav === "平台管理" && (
          <PlatformManagementPage
            stations={scopedStations}
            allowedTabs={roleConfig.platformTabs}
            registerLeaveGuard={registerPlatformLeaveGuard}
          />
        )}
        {activeNav === "设置" && (
          <SystemSettingsPage
            stations={scopedStations}
            user={user}
            onLogout={logout}
          />
        )}
        <div
          className="relative flex-1 min-h-0"
          style={{
            display: [
              "资产与站点",

              "运营中心",

              "运维中心",

              "工单与审批",

              "分析与报告",

              "平台管理",

              "设置",
            ].includes(activeNav)
              ? "none"
              : undefined,
          }}
        >
          <div className="absolute inset-0" style={{ zIndex: 0 }}>
            <MapView
              stations={scopedStations}
              selectedStation={selectedStation}
              onSelectStation={(s, pos) => {
                setSelectedStation(s)

                setPopupPos(pos ?? null)
              }}
              region={region}
            />
          </div>

          <div
            ref={regionRef}
            className="absolute top-3 left-1/2 -translate-x-1/2"
            style={{ zIndex: 1001 }}
          >
            <button
              onClick={() => setRegionOpen((o) => !o)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full font-medium shadow-sm"
              style={{
                background: region ? "#eaf5ef" : "rgba(255,255,255,0.95)",

                border: `1px solid ${region ? "#1f7a68" : "#d8e3dc"}`,

                color: region ? "#1f7a68" : "#24423b",

                backdropFilter: "blur(8px)",

                fontSize: 12,

                cursor: "pointer",
              }}
            >
              {REGION_MENU.find((r) => "value" in r && r.value === region)
                ?.label ?? "全部区域"}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                style={{
                  transform: regionOpen ? "rotate(180deg)" : undefined,

                  transition: "transform 0.15s",
                }}
              >
                <path
                  d="M2 4l3 3 3-3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {regionOpen && (
              <div
                style={{
                  position: "absolute",

                  top: "calc(100% + 6px)",

                  left: "50%",

                  transform: "translateX(-50%)",

                  background: "#fff",

                  border: "1px solid #d8e3dc",

                  borderRadius: 10,

                  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",

                  zIndex: 100,

                  maxHeight: 320,

                  overflowY: "auto",

                  minWidth: 160,
                }}
              >
                {REGION_MENU.map((item, i) => {
                  if ("group" in item)
                    return (
                      <div
                        key={i}
                        style={{
                          padding: "8px 12px 4px",

                          fontSize: 10,

                          fontWeight: 700,

                          color: "#76857f",

                          letterSpacing: "0.06em",

                          textTransform: "uppercase",
                        }}
                      >
                        {item.group}
                      </div>
                    )

                  const active = region === item.value

                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setRegion(item.value!)

                        setRegionOpen(false)
                      }}
                      style={{
                        display: "flex",

                        alignItems: "center",

                        justifyContent: "space-between",

                        width: "100%",

                        padding: "7px 12px",

                        fontSize: 12,

                        fontWeight: active ? 600 : 400,

                        color: active ? "#1f7a68" : "#24423b",

                        background: active ? "#eaf5ef" : "none",

                        border: "none",

                        cursor: "pointer",

                        textAlign: "left",
                      }}
                    >
                      {item.label}
                      {active && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="#1f7a68"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div
            className="absolute left-3 flex flex-col gap-2.5"
            style={{
              top: 48,

              bottom: 0,

              width: 228,

              zIndex: 1000,

              pointerEvents: "none",

              overflow: "hidden",
            }}
          >
            <div
              style={{
                pointerEvents: "auto",

                overflowY: "auto",

                display: "flex",

                flexDirection: "column",

                gap: 10,
              }}
            >
              <LeftPanel stations={scopedStations} role={user.role} />
            </div>
          </div>

          <div
            className="absolute right-3 flex flex-col gap-2.5"
            style={{
              top: 48,

              bottom: 0,

              width: 228,

              zIndex: 1000,

              pointerEvents: "none",

              overflow: "hidden",
            }}
          >
            <div
              style={{
                pointerEvents: "auto",

                overflowY: "auto",

                display: "flex",

                flexDirection: "column",

                gap: 10,
              }}
            >
              <RightPanel stations={scopedStations} role={user.role} />
            </div>
          </div>

          {selectedStation && (
            <StationPopup
              station={selectedStation}
              initialPos={popupPos}
              onClose={() => {
                setSelectedStation(null)

                setPopupPos(null)
              }}
              onOpenStation={(id) => {
                setSelectedStation(null)

                setPopupPos(null)

                handleOpenStation(id)
              }}
            />
          )}

          {immersive && (
            <button
              onClick={() => setImmersive(false)}
              className="absolute flex items-center gap-1.5 rounded-full transition-all"
              style={{
                top: 12,

                right: 12,

                zIndex: 1200,

                background: "rgba(255,255,255,0.9)",

                border: "1px solid #d8e3dc",

                color: "#61716b",

                fontSize: 11,

                padding: "5px 12px",

                backdropFilter: "blur(8px)",

                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",

                opacity: 0.75,

                cursor: "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.75")}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 3v3a2 2 0 0 1-2 2H3" />
                <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
                <path d="M3 16h3a2 2 0 0 1 2 2v3" />
                <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
              退出全屏
            </button>
          )}
        </div>

        {![
          "资产与站点",

          "运营中心",

          "运维中心",

          "工单与审批",

          "分析与报告",

          "平台管理",

          "设置",
        ].includes(activeNav) && (
          <BottomBar
            stations={scopedStations}
            onSelectStation={setSelectedStation}
            role={user.role}
            onViewAll={() => {
              if (user.role === "owner") {
                const target =
                  scopedStations.find((station) => station.alerts.length) ??
                  scopedStations[0]

                if (target) handleOpenStation(target.id, "告警信息")

                return
              }

              setActiveNav("运维中心")
            }}
          />
        )}
      </div>

      {DEMO_MODE && (
        <LivePreview onSimulateDataChange={handleSimulateDataChange} />
      )}
      {DEMO_MODE && roleConfig.showGlobalAi && (
        <GlobalAiDrawer
          stations={scopedStations}
          activeNav={activeNav}
          role={user.role}
        />
      )}
    </div>
  )
}
