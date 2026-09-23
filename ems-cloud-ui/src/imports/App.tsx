import { useState, useRef, useEffect } from "react"
import Sidebar from "./components/Sidebar"
import Header from "./components/Header"
import MapView from "./components/MapView"
import LeftPanel from "./components/LeftPanel"
import RightPanel from "./components/RightPanel"
import BottomBar from "./components/BottomBar"
import StationPopup from "./components/StationPopup"
import TickerBar from "./components/TickerBar"
import AssetsPage from "./components/AssetsPage"
import StationDetailPage from "./components/StationDetailPage"
import LivePreview from "./dev/LivePreview"

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

  // Asset fields (editable via AssetsPage)
  type: string // "BESS" | "PV" | "Wind" | "Hybrid" | "Diesel"
  region: string // "华东"
  project: string // "苏州项目"
  address: string
  lng: string
  lat: string
  mode: string // "削峰填谷" | "需量管理" | ...
  runtime: string // "128天 6时"  (computed, read-only in form)
  revenue: string // "¥128,650"   (computed, read-only in form)
  imageUrl: string
  dataStatus: "connected" | "partial" | "disconnected"
  updateTime: string // "3分钟前"
  updateSub: string // "实时同步"

  // Contact
  manager: string
  email: string
  phone: string
  role: string

  // Misc
  remark: string
}

const initialStations: Station[] = [
  {
    id: "1",
    name: "苏州园区站",
    shortName: "苏州园区",
    code: "SITE-SZ-001",
    status: "online",
    runStatus: "正常",
    x: 66,
    y: 34,
    devices: { online: 8, fault: 2, offline: 1, building: 1 },
    activePower: 326,
    ratedPower: 512,
    loadRate: 63.7,
    pvOutput: 1.1,
    storageCapacity: 0.58,
    soc: 68,
    generator: 0.75,
    alerts: [{ msg: "PCS变流器通讯中断", time: "09:42", level: "critical" }],
    type: "BESS",
    region: "华东",
    project: "苏州项目",
    address: "苏州市工业园区星湖街328号",
    lng: "120.7153°E",
    lat: "31.2989°N",
    mode: "削峰填谷",
    runtime: "128天 6时",
    revenue: "¥128,650",
    imageUrl:
      "https://images.unsplash.com/photo-1587293852726-70cdb56c2866?w=160&h=90&fit=crop",
    dataStatus: "connected",
    updateTime: "3分钟前",
    updateSub: "实时同步",
    manager: "张工程师",
    email: "zhang@enerlution.com",
    phone: "138-0000-1234",
    role: "站点运维工程师",
    remark: "",
  },
  {
    id: "2",
    name: "南通港口站",
    shortName: "南通港口",
    code: "SITE-NT-002",
    status: "fault",
    runStatus: "异常",
    x: 68,
    y: 30,
    devices: { online: 5, fault: 3, offline: 1, building: 1 },
    activePower: 180,
    ratedPower: 256,
    loadRate: 70.3,
    pvOutput: 0.9,
    storageCapacity: 0.45,
    soc: 55,
    generator: 0.6,
    alerts: [
      {
        msg: "BESS-01 电池单体温升过高异常",
        time: "14:31:05",
        level: "critical",
      },
      {
        msg: "PCS-02 交流侧电压径偏离目标",
        time: "14:28:40",
        level: "warning",
      },
    ],
    type: "BESS",
    region: "华东",
    project: "南通项目",
    address: "南通市港闸区滨江路1号",
    lng: "120.8942°E",
    lat: "32.0285°N",
    mode: "需量管理",
    runtime: "256天 12时",
    revenue: "¥256,800",
    imageUrl:
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=160&h=90&fit=crop",
    dataStatus: "connected",
    updateTime: "1小时前",
    updateSub: "正常采集",
    manager: "李站长",
    email: "li@enerlution.com",
    phone: "138-0000-2345",
    role: "站长",
    remark: "",
  },
  {
    id: "3",
    name: "常州数据中心",
    shortName: "常州数据中心",
    code: "SITE-CZ-003",
    status: "online",
    runStatus: "正常",
    x: 64,
    y: 32,
    devices: { online: 10, fault: 0, offline: 1, building: 0 },
    activePower: 198,
    ratedPower: 380,
    loadRate: 52.1,
    pvOutput: 1.5,
    storageCapacity: 0.8,
    soc: 46,
    generator: 1.0,
    alerts: [],
    type: "BESS",
    region: "华东",
    project: "江苏项目",
    address: "常州市武进区湖塘镇延政大道6号",
    lng: "119.9741°E",
    lat: "31.7208°N",
    mode: "备用电源",
    runtime: "45天 3时",
    revenue: "¥45,320",
    imageUrl:
      "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?w=160&h=90&fit=crop",
    dataStatus: "partial",
    updateTime: "离线",
    updateSub: "等待恢复",
    manager: "王主任",
    email: "wang@enerlution.com",
    phone: "138-0000-3456",
    role: "主任",
    remark: "",
  },
  {
    id: "4",
    name: "无锡制造基地",
    shortName: "无锡制造基地",
    code: "SITE-WX-004",
    status: "offline",
    runStatus: "待机",
    x: 63,
    y: 33,
    devices: { online: 0, fault: 0, offline: 8, building: 2 },
    activePower: 0,
    ratedPower: 512,
    loadRate: 0,
    pvOutput: 0,
    storageCapacity: 1.2,
    soc: 19,
    generator: 0,
    alerts: [],
    type: "BESS",
    region: "华东",
    project: "江苏项目",
    address: "无锡市惠山区前洲镇工业园区",
    lng: "120.2863°E",
    lat: "31.5785°N",
    mode: "调频响应",
    runtime: "12天 8时",
    revenue: "¥12,680",
    imageUrl:
      "https://images.unsplash.com/photo-1655936072925-b71b7b5d8e3c?w=160&h=90&fit=crop",
    dataStatus: "disconnected",
    updateTime: "2天前",
    updateSub: "断连中断",
    manager: "刘经理",
    email: "liu@enerlution.com",
    phone: "138-0000-4567",
    role: "经理",
    remark: "",
  },
  {
    id: "5",
    name: "上海临港站",
    shortName: "上海临港",
    code: "SITE-SH-005",
    status: "building",
    runStatus: "待机",
    x: 68,
    y: 33,
    devices: { online: 0, fault: 0, offline: 0, building: 6 },
    activePower: 0,
    ratedPower: 256,
    loadRate: 0,
    pvOutput: 0,
    storageCapacity: 0.5,
    soc: 0,
    generator: 0,
    alerts: [],
    type: "BESS",
    region: "华东",
    project: "上海项目",
    address: "上海市浦东新区临港新片区",
    lng: "121.9312°E",
    lat: "30.8761°N",
    mode: "削峰填谷",
    runtime: "—",
    revenue: "—",
    imageUrl: "",
    dataStatus: "disconnected",
    updateTime: "—",
    updateSub: "建设中",
    manager: "",
    email: "",
    phone: "",
    role: "",
    remark: "站点已完成二期扩容，新增储能柜4组，预计2024 Q2投产。",
  },
]

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

export default function App() {
  const [stations, setStations] = useState<Station[]>(initialStations)
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [activeNav, setActiveNav] = useState("总览")
  const [immersive, setImmersive] = useState(false)
  const [region, setRegion] = useState("")
  const [regionOpen, setRegionOpen] = useState(false)
  const regionRef = useRef<HTMLDivElement>(null)

  // Station detail tabs
  const [detailTabs, setDetailTabs] = useState<string[]>([])
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null)

  function handleOpenStation(id: string) {
    setDetailTabs((prev) => (prev.includes(id) ? prev : [...prev, id]))
    setActiveDetailId(id)
  }

  function handleCloseDetailTab(id: string) {
    setDetailTabs((prev) => {
      const next = prev.filter((t) => t !== id)
      setActiveDetailId((curr) => {
        if (curr !== id) return curr
        return next[next.length - 1] ?? null
      })
      return next
    })
  }

  function handleBackFromDetail() {
    setActiveDetailId(null)
    setDetailTabs([])
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (regionRef.current && !regionRef.current.contains(e.target as Node))
        setRegionOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function handleUpdateStation(id: string, patch: Partial<Station>) {
    setStations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    )
    // Keep selected popup in sync
    setSelectedStation((sel) => (sel?.id === id ? { ...sel, ...patch } : sel))
  }

  return (
    <div
      className="flex w-full overflow-hidden"
      style={{
        fontFamily: "'Inter', sans-serif",
        background: "#f0f4f8",
        height: "100%",
      }}
    >
      {!immersive && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          navItems={navItems}
          activeNav={activeNav}
          onNavChange={setActiveNav}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Station detail page takes over when a station is open */}
        {activeDetailId !== null && (
          <StationDetailPage
            tabs={detailTabs
              .map((id) => stations.find((s) => s.id === id)!)
              .filter(Boolean)}
            activeId={activeDetailId}
            onClose={handleCloseDetailTab}
            onSetActive={setActiveDetailId}
            onBack={handleBackFromDetail}
          />
        )}

        {activeDetailId === null && !immersive && (
          <Header
            immersive={immersive}
            onToggleImmersive={() => setImmersive(true)}
          />
        )}

        {activeDetailId === null && activeNav === "总览" && (
          <TickerBar stations={stations} onSelectStation={setSelectedStation} />
        )}

        {/* Assets page */}
        {activeDetailId === null && activeNav === "资产与站点" && (
          <AssetsPage
            stations={stations}
            onUpdateStation={handleUpdateStation}
            onOpenStation={handleOpenStation}
          />
        )}

        {/* Map area */}
        <div
          className="relative flex-1 min-h-0"
          style={{
            display:
              activeDetailId !== null || activeNav === "资产与站点"
                ? "none"
                : undefined,
          }}
        >
          <div className="absolute inset-0" style={{ zIndex: 0 }}>
            <MapView
              stations={stations}
              selectedStation={selectedStation}
              onSelectStation={setSelectedStation}
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
            className="absolute left-3 overflow-y-auto flex flex-col gap-2.5"
            style={{ top: 48, bottom: 0, width: 228, zIndex: 1000 }}
          >
            <LeftPanel />
          </div>

          <div
            className="absolute right-3 overflow-y-auto flex flex-col gap-2.5"
            style={{ top: 48, bottom: 0, width: 228, zIndex: 1000 }}
          >
            <RightPanel />
          </div>

          {selectedStation && (
            <StationPopup
              station={selectedStation}
              onClose={() => setSelectedStation(null)}
              onOpenStation={(id) => {
                setSelectedStation(null)
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

        {activeDetailId === null && activeNav !== "资产与站点" && (
          <BottomBar stations={stations} onSelectStation={setSelectedStation} />
        )}
      </div>

      <LivePreview />
    </div>
  )
}
