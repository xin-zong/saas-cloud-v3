import { useEffect, useMemo, useState } from "react"
import type { Station } from "@/App"
import { api, DEMO_MODE, type ApiRow } from "@/api/client"
import {
  DEVICE_STATUS_LABEL,
  demoStationDevices,
  formatPoint,
  type StationDevice,
} from "@/data/stationDevices"
import { stationDataNow } from "@/data/dataClock"
import "./station-single-line-figma.css"

const asset = (name: string) =>
  `/figma/stations/single-line/imgEnergySymbol${name}.svg`
const symbol = (device: StationDevice) =>
  /pcs/i.test(device.group + device.name)
    ? "Pcs"
    : /储能|电池|BMS/.test(device.group + device.name)
      ? "Battery"
      : /光伏|PV/i.test(device.name)
        ? "Pv"
        : /负荷/.test(device.name)
          ? "Load"
          : "PccMeter"
export default function StationSingleLineFigma({
  station,
  onOpenDevices,
}: {
  station: Station
  onOpenDevices: (deviceId?: string) => void
}) {
  const devices = useMemo(
    () =>
      station.deviceInventory ??
      (DEMO_MODE
        ? demoStationDevices(station, stationDataNow(station).getTime())
        : []),
    [station],
  )
  const [selectedId, setSelectedId] = useState("")
  const selected =
    devices.find((device) => device.id === selectedId) ?? devices[0]
  const [links, setLinks] = useState<ApiRow[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    if (DEMO_MODE) return
    const controller = new AbortController()
    setLinks([])
    setError("")
    setLoading(true)
    api<ApiRow[]>(`/stations/${encodeURIComponent(station.id)}/topology`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setLinks(result)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [station.id])
  const positions = new Map(
    devices.map((device, index) => [
      device.id,
      { x: 100 + (index % 3) * 260, y: 100 + Math.floor(index / 3) * 150 },
    ]),
  )
  const pick = (pattern: RegExp) => {
    const device = devices.find((item) => pattern.test(item.group + item.name))
    if (device) setSelectedId(device.id)
  }
  const demoSymbols = [
    { name: "Grid", x: 126, y: 70, label: "电网 / PCC", match: /并网|电网/ },
    { name: "PccMeter", x: 126, y: 142, label: "并网电表", match: /并网|电网/ },
    { name: "Pv", x: 326, y: 70, label: "光伏系统", match: /光伏|PV/ },
    {
      name: "PvInverter",
      x: 326,
      y: 142,
      label: "光伏逆变器",
      match: /光伏|PV/,
    },
    { name: "Load", x: 716, y: 70, label: "厂区负载", match: /负荷/ },
    { name: "Pcs", x: 516, y: 406, label: "PCS", match: /PCS/ },
    { name: "Battery", x: 516, y: 486, label: "电池", match: /电池|储能/ },
  ]
  return (
    <main className="station-sld-page">
      <section className="station-sld-canvas-card" aria-label="电气拓扑">
        <header>
          <strong>SLD-01 · 主接线</strong>
          <span>{DEMO_MODE ? "演示接线图" : "已登记电气拓扑"}</span>
          <div>
            <button
              aria-label="缩小接线图"
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
            >
              −
            </button>
            <button aria-label="重置接线图缩放" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button
              aria-label="放大接线图"
              onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
            >
              ＋
            </button>
          </div>
        </header>
        {error && <p role="alert">{error}</p>}
        <div className="station-sld-scroll">
          <div
            className="station-sld-drawing"
            style={{
              width: 864 * zoom,
              height:
                Math.max(596, Math.ceil(devices.length / 3) * 150 + 100) * zoom,
            }}
          >
            <div
              className="station-sld-scale"
              style={{ transform: `scale(${zoom})` }}
            >
              {DEMO_MODE ? (
                <>
                  <div
                    className="sld-wire"
                    style={{ left: 74, top: 299, width: 716, height: 3 }}
                  />
                  {[150, 350, 740].map((x) => (
                    <div
                      key={x}
                      className="sld-wire"
                      style={{ left: x - 1, top: 118, width: 2, height: 181 }}
                    />
                  ))}
                  <div
                    className="sld-wire"
                    style={{ left: 539, top: 302, width: 2, height: 232 }}
                  />
                  {[150, 350, 540, 740].map((x) => (
                    <img
                      key={x}
                      className="sld-junction"
                      src="/figma/stations/single-line/imgElectricalJunction.svg"
                      alt=""
                      style={{ left: x - 3.5, top: 296.5 }}
                    />
                  ))}
                  {demoSymbols.map((item) => (
                    <button
                      key={item.name}
                      className="sld-symbol"
                      aria-label={`选择接线图${item.label}`}
                      disabled={!devices.some((device) => item.match.test(device.group + device.name))}
                      title={devices.some((device) => item.match.test(device.group + device.name)) ? item.label : "暂无对应设备档案"}
                      style={{ left: item.x, top: item.y }}
                      onClick={() => pick(item.match)}
                    >
                      <img src={asset(item.name)} alt="" />
                      <span>{item.label}</span>
                    </button>
                  ))}
                  {[
                    { x: 134, y: 220 },
                    { x: 334, y: 220 },
                    { x: 724, y: 220 },
                    { x: 524, y: 348 },
                  ].map((item) => (
                    <div
                      key={item.x}
                      className="sld-breaker"
                      style={{ left: item.x, top: item.y }}
                    >
                      <img src={asset("GridBreaker")} alt="断路器" />
                      <small>开关状态 —</small>
                    </div>
                  ))}
                  <span className="sld-bus-label">AC BUS-01</span>
                </>
              ) : (
                <>
                  {loading ? (
                    <p className="sld-empty">正在加载拓扑…</p>
                  ) : !devices.length ? (
                    <p className="sld-empty">暂无已登记设备和连接</p>
                  ) : (
                    <>
                      <svg
                        className="sld-connections"
                        width="864"
                        height={Math.max(
                          596,
                          Math.ceil(devices.length / 3) * 150 + 100,
                        )}
                        aria-label="已配置连接"
                      >
                        {links.map((link, index) => {
                          const a = positions.get(
                              String(link.source_device_id),
                            ),
                            b = positions.get(String(link.target_device_id))
                          return a && b ? (
                            <polyline
                              key={index}
                              points={`${a.x + 24},${a.y + 48} ${a.x + 24},${a.y + 85} ${b.x + 24},${a.y + 85} ${b.x + 24},${b.y}`}
                              fill="none"
                              stroke="#1b2734"
                              strokeWidth="2"
                            />
                          ) : null
                        })}
                      </svg>
                      {devices.map((device) => {
                        const position = positions.get(device.id)!
                        return (
                          <button
                            className="sld-symbol"
                            key={device.id}
                            style={{ left: position.x, top: position.y }}
                            aria-label={`选择接线图${device.name}`}
                            onClick={() => setSelectedId(device.id)}
                          >
                            <img src={asset(symbol(device))} alt="" />
                            <span>{device.name}</span>
                          </button>
                        )
                      })}
                      {!links.length && !error && (
                        <p className="sld-missing-links">
                          暂无已配置连接 · 设备位置仅用于目录展示
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
      <aside className="station-sld-inspector" aria-label="接线图设备检查">
        <header>
          <h2>设备检查</h2>
          <span>{devices.length} 台设备</span>
        </header>
        <div className="station-sld-device-list">
          {devices.map((device) => (
            <button
              key={device.id}
              aria-pressed={selected?.id === device.id}
              onClick={() => setSelectedId(device.id)}
            >
              <i data-status={device.status} />
              <span>{device.name}</span>
              <small>{DEVICE_STATUS_LABEL[device.status]}</small>
            </button>
          ))}
          {!devices.length && <p>暂无设备</p>}
        </div>
        <section>
          <h3>{selected?.name ?? "未选择设备"}</h3>
          <p>{selected?.code ?? "—"}</p>
          <dl>
            {[
              {
                label: "运行状态",
                value: selected ? DEVICE_STATUS_LABEL[selected.status] : "未知",
              },
              ...[
                "有功功率",
                "无功功率",
                "交流频率",
                "直流电压",
                "直流电流",
                "内部温度",
              ].map((label) => ({
                label,
                value: formatPoint(
                  selected?.points.find((point) => point.label === label),
                ),
              })),
            ].map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <button
          className="ui-button"
          disabled={!selected}
          onClick={() => onOpenDevices(selected?.id)}
        >
          查看设备详情 →
        </button>
      </aside>
    </main>
  )
}
