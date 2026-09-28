import { useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Station } from "@/App"
import { DEMO_MODE } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import { queryStationTelemetry } from "./stationTelemetryQuery"
import {
  demoStationDevices,
  DEVICE_STATUS_LABEL,
  formatPoint,
  pointValue,
} from "@/data/stationDevices"
import { stationDataNow } from "@/data/dataClock"
import { buildCurveData } from "./StationRunCurvePage"
import "./station-overview-figma.css"
import StationEnergy3D from "./StationEnergy3D"
import type { DeviceType, EnergyMetrics } from "./EnergyFlow3D"

const modelCategories: Record<DeviceType, string> = {
  tower: "电网", solar: "光伏", factory: "负荷", pcs: "PCS", battery: "电池",
}

const root = "/figma/stations/overview/"
const equipment = [
  {
    name: "电网",
    x: 198.04,
    y: 28.16,
    w: 92.4,
    h: 130.24,
    ix: -101.64,
    iy: -5.06,
    iw: 651.2,
    ih: 292.6,
    lx: 35,
    ly: 77,
  },
  {
    name: "光伏",
    x: 177.36,
    y: 227.92,
    w: 133.76,
    h: 85.36,
    ix: -79.64,
    iy: -179.3,
    iw: 651.2,
    ih: 292.6,
    lx: 27,
    ly: 247,
  },
  {
    name: "负荷",
    x: 518.36,
    y: 35.2,
    w: 162.8,
    h: 123.2,
    ix: -409.64,
    iy: -19.14,
    iw: 651.2,
    ih: 292.6,
    lx: 719,
    ly: 77,
  },
  {
    name: "PCS",
    x: 388.56,
    y: 127.6,
    w: 66.88,
    h: 95.04,
    ix: -286.44,
    iy: -97.46,
    iw: 651.2,
    ih: 292.6,
    lx: 364,
    ly: 67,
  },
  {
    name: "电池",
    x: 522.32,
    y: 227.92,
    w: 154.88,
    h: 92.4,
    ix: -347.21,
    iy: -149.19,
    iw: 569.8,
    ih: 256.025,
    lx: 719,
    ly: 247,
  },
]
const numeric = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("zh-CN", { maximumFractionDigits: 1 })
    : "--"
const series = [
  { key: "pv", label: "光伏功率", color: "#c79632" },
  { key: "battery", label: "电池功率", color: "#277e68" },
  { key: "load", label: "负荷功率", color: "#607d99" },
  { key: "grid", label: "电网功率", color: "#9275b3" },
]

export default function StationOverviewPage({
  station,
  onSetSubNav,
  allowedSubNavs,
  onOpenDevices,
}: {
  station: Station
  onSetSubNav: (next: string) => void
  allowedSubNavs: readonly string[]
  onOpenDevices?: (id?: string) => void
}) {
  const { user } = useAuth()
  const canRead =
    DEMO_MODE || hasStationPermission(user, station.id, "telemetry.read")
  const [samples, setSamples] = useState<Station["telemetryHistory"]>([])
  const [error, setError] = useState("")
  const [category, setCategory] = useState("电池")
  const [energyView, setEnergyView] = useState<"diagram" | "3d">("diagram")
  const [deviceId, setDeviceId] = useState("")
  const [date, setDate] = useState(() => {
    const now = stationDataNow(station)
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  })
  const [range, setRange] = useState<"D" | "M" | "Y" | "A">("D")
  const [hidden, setHidden] = useState<string[]>([])
  const devices = useMemo(
    () =>
      station.deviceInventory ??
      (DEMO_MODE
        ? demoStationDevices(station, stationDataNow(station).getTime())
        : []),
    [station],
  )
  const matches = devices.filter((device) =>
    category === "PCS"
      ? /PCS/i.test(device.group)
      : category === "电池"
        ? /储能|电池|BMS/.test(device.group)
        : category === "电网"
          ? /并网|电网/.test(device.name)
          : category === "负荷"
            ? /负荷/.test(device.name)
            : /光伏|PV/i.test(device.group + device.name),
  )
  const device = matches.find((item) => item.id === deviceId) ?? matches[0]
  const point = (id: string) => device?.points.find((item) => item.id === id)
  const soc = pointValue(point("soc"))
  useEffect(() => {
    if (DEMO_MODE) return
    setSamples([])
    setError("")
    if (!canRead) return
    if (range === "A") {
      setSamples(station.telemetryHistory ?? [])
      return
    }
    const controller = new AbortController()
    const start = new Date(`${date}T00:00:00`),
      end = new Date(`${date}T23:59:59`)
    if (range === "M") {
      start.setDate(1)
      end.setMonth(end.getMonth() + 1, 0)
    }
    if (range === "Y") {
      start.setMonth(0, 1)
      end.setMonth(11, 31)
    }
    queryStationTelemetry(station, start, end, 15, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted) setSamples(rows)
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "读取采样失败")
      })
    return () => controller.abort()
  }, [station.id, date, range, canRead])
  const model = useMemo(
    () =>
      buildCurveData(
        DEMO_MODE
          ? station
          : { ...station, telemetryHistory: canRead ? samples : [] },
        date,
        range,
      ),
    [station, date, range, samples, canRead],
  )
  const metrics: Record<string, number | undefined | null> = {
    电网: pointValue(
      devices
        .find((item) => /并网|电网/.test(item.name))
        ?.points.find((item) => item.id === "power"),
    ),
    光伏: station.pvOutput == null ? undefined : station.pvOutput * 1000,
    负荷: pointValue(
      devices
        .find((item) => /负荷/.test(item.name))
        ?.points.find((item) => item.id === "power"),
    ),
    PCS: station.activePower,
    电池: station.soc,
  }
  return (
    <main className="station-overview-figma">

      <div className="station-overview-top">
        <section className="station-energy-card" aria-label="站点能流图">
          <div className="station-energy-view-switch" role="group" aria-label="设备图显示方式">
            <button aria-pressed={energyView === "diagram"} onClick={() => setEnergyView("diagram")}>设备图</button>
            <button aria-pressed={energyView === "3d"} onClick={() => setEnergyView("3d")}>3D</button>
          </div>
          {energyView === "3d" ? <StationEnergy3D
            metrics={Object.fromEntries(Object.entries(modelCategories).map(([type, name]) => [type, {
              value: numeric(metrics[name]), unit: name === "电池" ? "%" : "kW",
            }])) as EnergyMetrics}
            selectedType={Object.entries(modelCategories).find(([, name]) => name === category)?.[0] as DeviceType}
            onDeviceSelect={(type) => { setCategory(modelCategories[type]); setDeviceId("") }}
          /> : <div className="station-energy-canvas">
            <img
              className="station-energy-arrows"
              src={`${root}imgEnergyFlowUnifiedCoordinatesAlignedArrows.svg`}
              alt="电网、光伏、PCS、负荷与电池连接关系"
            />
            {equipment.map((item) => (
              <div key={item.name}>
                <button
                  className="station-equipment"
                  aria-label={`查看${item.name}设备`}
                  onClick={() => {
                    setCategory(item.name)
                    setDeviceId("")
                  }}
                  style={{
                    left: `${(item.x / 844) * 100}%`,
                    top: item.y,
                    width: item.w,
                    height: item.h,
                  }}
                >
                  <img
                    src={`${root}imgIllustrationIsometricEquipmentStrip.png`}
                    alt={item.name}
                    style={{
                      left: item.ix,
                      top: item.iy,
                      width: item.iw,
                      height: item.ih,
                    }}
                  />
                </button>
                <div
                  className="station-flow-value"
                  style={{ left: `${(item.lx / 844) * 100}%`, top: item.ly }}
                >
                  <small>
                    {item.name === "电池" ? "电池 SOC" : `${item.name}功率`}
                  </small>
                  <span>
                    {numeric(metrics[item.name])}{" "}
                    <small>{item.name === "电池" ? "%" : "kW"}</small>
                  </span>
                </div>
              </div>
            ))}
            {allowedSubNavs.includes("告警信息") && (
              <button
                className="station-overview-alarm"
                aria-label="查看本站告警"
                onClick={() => onSetSubNav("告警信息")}
              >
                <img src={`${root}imgIconStatusWarning.svg`} alt="" />
                {station.alerts.length}
              </button>
            )}
          </div>}
        </section>
        <section className="station-device-card" aria-label="选中设备详情">
          <div className="station-device-types">
            {equipment.map((item) => (
              <button
                key={item.name}
                aria-pressed={category === item.name}
                onClick={() => {
                  setCategory(item.name)
                  setDeviceId("")
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
          <select
            aria-label="选择概览设备"
            value={device?.id ?? ""}
            onChange={(event) => setDeviceId(event.target.value)}
            disabled={!matches.length}
          >
            {matches.length ? (
              matches.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))
            ) : (
              <option value="">暂无{category}设备</option>
            )}
          </select>
          <div className="station-device-identity">
            <strong>{device?.code || "--"}</strong>
            <span>
              {device ? DEVICE_STATUS_LABEL[device.status] : "未接入"}
            </span>
          </div>
          <div className="station-device-main">
            <small>{category === "电池" ? "SOC" : "有功功率"}</small>
            <strong>
              {numeric(category === "电池" ? soc : pointValue(point("power")))}{" "}
              <small>{category === "电池" ? "%" : "kW"}</small>
            </strong>
          </div>
          <div className="station-soc-track">
            <i
              style={{
                width: `${soc === null ? 0 : Math.max(0, Math.min(100, soc))}%`,
              }}
            />
          </div>
          <div className="station-device-pair">
            <span>
              SOH <b>{formatPoint(point("soh"))}</b>
            </span>
            <span>
              充放电功率 <b>{formatPoint(point("power"))}</b>
            </span>
          </div>
          <div className="station-device-metrics">
            {["dcVoltage", "dcCurrent", "temperature", "insulation"].map(
              (id, index) => (
                <div key={id}>
                  <small>
                    {point(id)?.label ||
                      ["直流电压", "直流电流", "温度", "绝缘阻抗"][index]}
                  </small>
                  <strong>{formatPoint(point(id))}</strong>
                </div>
              ),
            )}
          </div>
          {allowedSubNavs.includes("设备详情") && (
            <button
              className="station-device-detail-link"
              onClick={() => onOpenDevices ? onOpenDevices(device?.id) : onSetSubNav("设备详情")}
            >
              设备详情 →
            </button>
          )}
        </section>
      </div>
      <section className="station-overview-trends" aria-label="运行趋势">
        {error && (
          <div role="alert" className="station-overview-query-error">
            {error}
          </div>
        )}
        <header>
          <h2>
            运行趋势 {range === "A" && <small>· 当前已加载历史数据</small>}
          </h2>
          <div>
            <input
              type="date"
              aria-label="概览趋势日期"
              value={date}
              onChange={(event) => {
                if (event.target.value) setDate(event.target.value)
              }}
            />
            {(["D", "M", "Y", "A"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={range === value}
                onClick={() => setRange(value)}
              >
                {{ D: "日", M: "月", Y: "年", A: "总计" }[value]}
              </button>
            ))}
          </div>
        </header>
        <div className="station-overview-chart-title">
          <span>
            站点功率趋势 <small>kW</small>
          </span>
          <div>
            {series.map((item) => (
              <button
                key={item.key}
                aria-pressed={!hidden.includes(item.key)}
                onClick={() =>
                  setHidden((current) =>
                    current.includes(item.key)
                      ? current.filter((key) => key !== item.key)
                      : [...current, item.key],
                  )
                }
              >
                <i style={{ background: item.color }} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="station-overview-power">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={model.points}
              margin={{ left: 0, right: 20, top: 5, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e9edf0" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                minTickGap={60}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={44}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip />
              {series
                .filter((item) => !hidden.includes(item.key))
                .map((item) => (
                  <Line
                    key={item.key}
                    dataKey={item.key}
                    name={item.label}
                    stroke={item.color}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
          {!model.sampleCount && (
            <span className="station-chart-empty">暂无采样数据</span>
          )}
        </div>
        <div className="station-overview-chart-title">
          <span>
            SOC 趋势 <small>%</small>
          </span>
        </div>
        <div className="station-overview-soc">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={model.points}
              margin={{ left: 0, right: 20, top: 5, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#e9edf0" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10 }}
                minTickGap={60}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                width={44}
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip />
              <Line
                dataKey="soc"
                name="SOC"
                stroke="#277e68"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          {!model.sampleCount && (
            <span className="station-chart-empty">暂无 SOC 数据</span>
          )}
        </div>
      </section>
    </main>
  )
}
