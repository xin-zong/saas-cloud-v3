import { DEMO_MODE, send, type ApiRow } from "@/api/client"

import { adaptStation } from "@/api/adapters"
import { loadStations } from "@/api/stations"
import { apiRoleConfig, hasStationPermission, stationRoleConfig } from "@/auth/apiPermissions"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import Sidebar from "@/components/Sidebar"
import StationGlobalHeader from "@/components/StationGlobalHeader"
import "@/styles/stations-figma.css"

import Header from "@/components/Header"
import OverviewPage from "@/components/OverviewPage"
import "@/styles/all-modules-shell.css"

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
import SettingsDialog from "@/components/SettingsDialog"

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
  customerId?: string | null
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
  const overviewLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const registerOverviewLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { overviewLeaveGuard.current = guard }, [])
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const logoutPending = useRef(false)
  const settingsLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const registerSettingsLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { settingsLeaveGuard.current = guard }, [])
  const platformLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const stationLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const assetsLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const maintenanceLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const workOrdersLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const registerWorkOrdersLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { workOrdersLeaveGuard.current = guard }, [])
  const registerMaintenanceLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { maintenanceLeaveGuard.current = guard }, [])
  const operationsLeaveGuard = useRef<null | (() => Promise<boolean>)>(null)
  const sidebarTransitionPending = useRef(false)
  const registerPlatformLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { platformLeaveGuard.current = guard }, [])
  const registerStationLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { stationLeaveGuard.current = guard }, [])
  const requestStationLeave = useCallback(() => stationLeaveGuard.current?.() ?? Promise.resolve(true), [])
  const registerAssetsLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { assetsLeaveGuard.current = guard }, [])
  const registerOperationsLeaveGuard = useCallback((guard: null | (() => Promise<boolean>)) => { operationsLeaveGuard.current = guard }, [])
  const requestOperationsLeave = useCallback(() => operationsLeaveGuard.current?.() ?? Promise.resolve(true), [])

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

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const [activeNav, setActiveNav] = useState<NavLabel>(() =>
    getInitialNavFromHash(user),
  )

  const [workOrderFocus, setWorkOrderFocus] = useState<{
    stationId: string

    orderId?: string
  } | null>(null)

  const [immersive, setImmersive] = useState(false)

  // Station detail tabs

  const [detailTabs, setDetailTabs] = useState<string[]>([])

  const [activeDetailId, setActiveDetailId] = useState<string | null>(null)

  const [detailSubNav, setDetailSubNav] = useState("站点概览")
  const rememberedSubNav = useRef<Record<string, string>>({})

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

  async function handleOpenStation(id: string, subNav?: string) {
    if (!canAccessStation(user, id) || (!DEMO_MODE && !hasStationPermission(user, id, "asset.read"))) return
    if (!(await requestActiveEditorLeave())) return

    setActiveNav("资产与站点")

    const requestedSubNav = subNav ?? rememberedSubNav.current[id] ?? "站点概览"
    const validSubNav = roleConfig.stationSubNavs.includes(requestedSubNav as never) ? requestedSubNav : "站点概览"
    if (subNav) rememberedSubNav.current[id] = validSubNav
    setDetailSubNav(validSubNav)

    setDetailTabs((prev) => (prev.includes(id) ? prev : [...prev, id]))

    setActiveDetailId(id)
  }

  async function handleCloseDetailTab(id: string) {
    if (id === activeDetailId && !(await requestStationLeave())) return
    delete rememberedSubNav.current[id]
    setDetailTabs((prev) => {
      const next = prev.filter((t) => t !== id)

      setActiveDetailId((curr) => {
        if (curr !== id) return curr

        const closedIndex = prev.indexOf(id)
        const neighbor = next[closedIndex] ?? next[closedIndex - 1] ?? null
        setDetailSubNav(neighbor ? rememberedSubNav.current[neighbor] ?? "站点概览" : "站点概览")
        return neighbor
      })

      return next
    })
  }

  async function handleBackFromDetail() {
    if (!(await requestStationLeave())) return
    setActiveDetailId(null)
  }

  function requestActiveEditorLeave() {
    if (activeNav === "总览") return overviewLeaveGuard.current?.() ?? Promise.resolve(true)
    if (activeNav === "资产与站点") return activeDetailId ? requestStationLeave() : assetsLeaveGuard.current?.() ?? Promise.resolve(true)
    if (activeNav === "运营中心") return requestOperationsLeave()
    if (activeNav === "运维中心") return maintenanceLeaveGuard.current?.() ?? Promise.resolve(true)
    if (activeNav === "工单与审批") return workOrdersLeaveGuard.current?.() ?? Promise.resolve(true)
    if (activeNav === "平台管理") return platformLeaveGuard.current?.() ?? Promise.resolve(true)
    if (activeNav === "设置") return settingsLeaveGuard.current?.() ?? Promise.resolve(true)
    return Promise.resolve(true)
  }

  function requestLogout() { if (!logoutPending.current) setLogoutConfirm(true) }
  async function confirmLogout() {
    if (logoutPending.current) return
    logoutPending.current = true
    setLogoutConfirm(false)
    try { if (await requestActiveEditorLeave()) logout() }
    finally { logoutPending.current = false }
  }

  const handleUpdateStation = useCallback(
    async (id: string, patch: Partial<Station>) => {
      if (!canAccessStation(user, id) || !(DEMO_MODE ? roleConfig.canEditAssets : hasStationPermission(user, id, "asset.edit"))) throw new Error("站点编辑权限已失效，请刷新后重试")

      if (!DEMO_MODE) {
        const current = stations.find((s) => s.id === id)

        if (!current) throw new Error("站点已不可用，请刷新后重试")

        const next = { ...current, ...patch }
        const customerId = patch.customerId == null ? patch.customerId : Number(patch.customerId)
        if (customerId != null && (!Number.isSafeInteger(customerId) || customerId <= 0)) {
          throw new Error("客户标识无效，请刷新后重试")
        }

        const persisted = await send<ApiRow>(`/stations/${id}`, "PUT", {
          name: next.name,
          ...(patch.customerId !== undefined ? { customerId } : {}),
          ratedPowerKw: Number.isFinite(next.ratedPower) ? next.ratedPower : undefined,
          capacityKwh: Number.isFinite(next.storageCapacity) ? next.storageCapacity : undefined,
          region: next.region,
          address: next.address,
          longitude: next.lng ? Number(next.lng) : null,
          latitude: next.lat ? Number(next.lat) : null,
        })

        if (persisted) {
          const saved = adaptStation(persisted)
          setStations(prev => prev.map(s => s.id === id ? {
            ...s, name: saved.name, shortName: saved.shortName,
            customerId: saved.customerId, ratedPower: saved.ratedPower,
            storageCapacity: saved.storageCapacity, region: saved.region,
            address: saved.address, lng: saved.lng, lat: saved.lat,
          } : s))
        }
        refreshApi()

        return
      }

      setStations((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      )

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
    if (roleConfig.nav.includes(activeNav)) return

    setActiveNav(roleConfig.defaultNav)

    setActiveDetailId(null)

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
    <div className="workspace-shell" data-immersive={immersive} data-nav-collapsed={sidebarCollapsed} data-design-area={activeNav === "资产与站点" ? "stations" : activeNav !== "总览" ? "business" : undefined}>
      {activeNav !== "总览" && <StationGlobalHeader user={user} onLogout={requestLogout} status={DEMO_MODE ? undefined : apiError || (apiLoading ? "正在加载授权站点…" : `已连接业务服务 · ${stations.length} 个授权站点`)} loading={apiLoading} onRefresh={refreshApi} />}
      {!immersive && activeNav === "总览" && <Header showImmersive={activeNav === "总览"} immersive={immersive} onToggleImmersive={async () => { if (await requestActiveEditorLeave()) { setActiveNav("总览"); setImmersive(true) } }} user={user} onLogout={requestLogout} />}
      {logoutConfirm && <SettingsDialog title="退出登录？" logout onClose={() => setLogoutConfirm(false)}><p>确认退出当前账户？</p><footer><button onClick={() => setLogoutConfirm(false)}>取消</button><button className="settings-confirm-logout" onClick={() => {void confirmLogout()}}>退出登录</button></footer></SettingsDialog>}
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
              if (nav !== activeNav && !(await requestActiveEditorLeave())) return
              if (nav === "工单与审批") setWorkOrderFocus(null)
              setActiveNav(nav as NavLabel)
            } finally { sidebarTransitionPending.current = false }
          })() }}
          user={user}
          onLogout={requestLogout}
        />
      )}

      <div className="workspace-content flex flex-col flex-1 min-w-0 overflow-hidden">
        {!DEMO_MODE && activeNav === "总览" && (
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
              void (async () => {
                if (id !== activeDetailId && !(await requestStationLeave())) return
                setDetailSubNav(rememberedSubNav.current[id] ?? "站点概览")
                setActiveDetailId(id)
              })()
            }}
            onBack={handleBackFromDetail}
            onSubNavChange={(id, subNav) => {
              rememberedSubNav.current[id] = subNav
              if (id === activeDetailId) setDetailSubNav(subNav)
            }}
            registerLeaveGuard={registerStationLeaveGuard}
            requestLeave={requestStationLeave}
            allowedSubNavs={DEMO_MODE ? roleConfig.stationSubNavs : stationRoleConfig(user, activeDetailId).stationSubNavs}
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
            registerLeaveGuard={registerAssetsLeaveGuard}
            stations={scopedStations}
            onUpdateStation={handleUpdateStation}
            onCreateStation={handleCreateStation}
            onOpenStation={handleOpenStation}
            canEdit={
              roleConfig.nav.includes("资产与站点") &&
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
            registerLeaveGuard={registerOperationsLeaveGuard}
            requestLeave={requestOperationsLeave}
            stations={operationalStations}
            onOpenStation={handleOpenStation}
            allowedTabs={roleConfig.operationsTabs}
          />
        )}
        {activeNav === "运维中心" && (
          <MaintenanceCenterPage
            registerLeaveGuard={registerMaintenanceLeaveGuard}
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
            registerLeaveGuard={registerWorkOrdersLeaveGuard}
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
            stations={operationalStations}
            allowedTabs={roleConfig.platformTabs}
            registerLeaveGuard={registerPlatformLeaveGuard}
          />
        )}
        {activeNav === "设置" && (
          <SystemSettingsPage
            key={`${DEMO_MODE ? "demo" : "api"}:${user.id}`}
            registerLeaveGuard={registerSettingsLeaveGuard}
            stations={operationalStations}
            user={user}
            onLogout={requestLogout}
          />
        )}
        {activeNav === "总览" && <OverviewPage emsStations={operationalStations} stations={scopedStations} user={user} nav={roleConfig.nav} immersive={immersive} onExitImmersive={() => setImmersive(false)} onOpenStation={handleOpenStation} registerLeaveGuard={registerOverviewLeaveGuard} requestLeave={() => overviewLeaveGuard.current?.() ?? Promise.resolve(true)} onNavigate={async nav => { if (roleConfig.nav.includes(nav) && await requestActiveEditorLeave()) setActiveNav(nav) }} />}
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
