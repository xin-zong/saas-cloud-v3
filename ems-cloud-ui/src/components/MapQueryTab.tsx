import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import type { Station } from "@/App"
import { DEMO_MODE } from "@/api/client"
import { Button } from "./ui/Workspace"
import { Asset } from "./station-provision/Common"
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY as string | undefined
const color = {
  online: "#257f66",
  fault: "#e4474f",
  offline: "#9aa6b1",
  building: "#dba34b",
}
const label = {
  online: "在线",
  fault: "故障",
  offline: DEMO_MODE ? "离线" : "未知",
  building: "建设中",
}
const show = (n: number, unit = "") =>
  Number.isFinite(n)
    ? n.toLocaleString("zh-CN", { maximumFractionDigits: 2 }) + unit
    : "—"
function total(
  stations: Station[],
  key: "pvOutput" | "activePower" | "ratedPower" | "storageCapacity" | "generator",
) {
  return stations.length && stations.every((s) => Number.isFinite(s[key]))
    ? stations.reduce((sum, s) => sum + s[key], 0)
    : NaN
}
export default function MapQueryTab({
  stations,
  onOpenStation,
}: {
  stations: Station[]
  onOpenStation: (id: string) => void
}) {
  const [region, setRegion] = useState("")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [period, setPeriod] = useState("今日")
  const [mapError, setMapError] = useState(!AMAP_KEY)
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.LayerGroup | null>(null)
  const visible = stations.filter(
    (s) =>
      (!region || s.region === region) &&
      (!search ||
        [s.name, s.code, s.project].some((v) =>
          v.toLowerCase().includes(search.toLowerCase()),
        )),
  )
  const station = visible.find((s) => s.id === selected)
  const counts = (Object.keys(color) as Station["status"][]).map((status) => ({
    status,
    count: visible.filter((s) => s.status === status).length,
  }))
  const knownDevices =
    DEMO_MODE && visible.length &&
    visible.every((s) => Object.values(s.devices).every(Number.isFinite))
  const devices = knownDevices
    ? visible.reduce(
        (sum, s) => sum + Object.values(s.devices).reduce((n, v) => n + v, 0),
        0,
      )
    : NaN
  const alerts = visible.flatMap((s) =>
    s.alerts.map((a) => ({ ...a, station: s })),
  )
  useEffect(() => {
    if (!container.current || !AMAP_KEY) return
    const instance = L.map(container.current, {
      center: [31.5, 120.5],
      zoom: 7,
      zoomControl: false,
      attributionControl: false,
    })
    map.current = instance
    const tiles = L.tileLayer(
      "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}&key=" +
        encodeURIComponent(AMAP_KEY),
      { subdomains: "1234", maxZoom: 18 },
    )
    tiles.on("tileerror", () => setMapError(true))
    tiles.on("load", () => setMapError(false))
    tiles.addTo(instance)
    markers.current = L.layerGroup().addTo(instance)
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      markers.current = null
    }
  }, [])
  useEffect(() => {
    const layer = markers.current,
      instance = map.current
    if (!layer || !instance) return
    layer.clearLayers()
    const points: L.LatLngExpression[] = []
    for (const s of visible) {
      const lat = Number(s.lat),
        lng = Number(s.lng)
      if (
        !s.lat ||
        !s.lng ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      )
        continue
      points.push([lat, lng])
      const marker = L.circleMarker([lat, lng], {
        radius: s.id === selected ? 10 : 6,
        color: "#fff",
        weight: 2,
        fillColor: color[s.status],
        fillOpacity: 0.95,
      }).addTo(layer)
      marker.bindTooltip(s.name, { direction: "top" })
      marker.on("click", () => setSelected(s.id))
    }
    if (points.length && search)
      instance.fitBounds(L.latLngBounds(points), {
        padding: [280, 150],
        maxZoom: 13,
      })
  }, [stations, region, search, selected])
  return (
    <div className="station-map" data-design-node="1122:8285">
      <img
        className="station-map-background"
        src="/figma/station-entry/map-imgGeographicMapBackground.png"
        alt="地理示意底图"
      />
      <div className="station-map-live" ref={container} />
      <div className="station-map-filters">
        <select
          aria-label="地图区域"
          value={region}
          onChange={(e) => {
            setRegion(e.target.value)
            setSelected(null)
          }}
        >
          <option value="">全部集群</option>
          {[...new Set(stations.map((s) => s.region))].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <input
          aria-label="地图搜索站点"
          placeholder="搜索站点"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <aside className="station-map-left">
        <section>
          <h2>站点运营概况</h2>
          <div className="map-total">
            <span>站点总数</span>
            <strong>{visible.length}</strong>
          </div>
          <div className="map-segments">
            {counts.map((c) => (
              <i
                key={c.status}
                style={{ flex: c.count || 0.02, background: color[c.status] }}
              />
            ))}
          </div>
          <div className="map-status-counts">
            {counts.map((c) => (
              <span key={c.status}>
                {label[c.status]} {c.count}
              </span>
            ))}
          </div>
          <div className="map-total">
            <span>关联设备数</span>
            <strong>{show(devices)}</strong>
          </div>
        </section>
        <section>
          <header>
            <h2>储能充放趋势 (24h)</h2>
            <div>
              {["今日", "本月"].map((p) => (
                <button
                  key={p}
                  aria-pressed={period === p}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </header>
          <div className="map-two-metrics">
            <span>
              充电总量<strong>— MWh</strong>
            </span>
            <span>
              放电总量<strong>— MWh</strong>
            </span>
          </div>
          <div className="map-chart-empty">
            <span>{period}暂无充放电序列</span>
            <footer>00:00　　　　　　12:00　　　　　24:00</footer>
          </div>
        </section>
        <section>
          <h2>社会与环境效益</h2>
          <div className="map-environment">
            {[
              ["map-imgLeaf", "CO₂减排量"],
              ["map-imgFlame", "标准煤节约量"],
              ["map-imgTrees", "等效植树量"],
            ].map(([asset, name]) => (
              <div key={name}>
                <Asset name={asset} />
                <strong>—</strong>
                <small>{name}</small>
              </div>
            ))}
          </div>
        </section>
      </aside>
      <aside className="station-map-right">
        <section>
          <h2>在线运行容量</h2>
          {[
            ["发电机组", total(visible.filter(s => s.status === 'online'), "generator"), "MW"],
            ["光伏系统", total(visible.filter(s => s.status === 'online'), "pvOutput"), "MWp"],
            ["储能系统", total(visible.filter(s => s.status === 'online'), "storageCapacity"), DEMO_MODE ? "MWh" : "kWh"],
          ].map(([name, value, unit]) => (
            <div className="map-capacity" key={String(name)}>
              <span>
                {name}
                <strong>{show(Number(value), String(unit))}</strong>
              </span>
              <div />
            </div>
          ))}
        </section>
        <section>
          <h2>能源供应与构成</h2>
          <div className="map-energy-empty">
            <span>暂无占比数据</span>
          </div>
          <small>需接入完整能源计量数据</small>
        </section>
        <section>
          <h2>收益概览</h2>
          <div className="map-two-metrics">
            <span>
              昨日收益<strong>—</strong>
            </span>
            <span>
              累计收益<strong>—</strong>
            </span>
          </div>
          <div className="map-chart-empty">
            <span>暂无汇总收益序列</span>
          </div>
        </section>
      </aside>
      <div className="map-station-picker">
        <label>
          当前站点
          <select
            aria-label="地图选择站点"
            value={selected ?? ""}
            onChange={(e) => setSelected(e.target.value || null)}
          >
            <option value="">请选择站点查看详情</option>
            {visible.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {mapError && <small>地理示意底图 · 实时地图服务未连接</small>}
      </div>
      {station && (
        <article className="station-map-popup">
          <header>
            <div>
              <h2>{station.name}</h2>
              <small>{station.code}</small>
            </div>
            <button aria-label="关闭站点卡片" onClick={() => setSelected(null)}>
              ×
            </button>
          </header>
          <div className="map-device-summary">
            <div className="map-device-ring">
              <strong>
                {DEMO_MODE && Object.values(station.devices).every(Number.isFinite)
                  ? Object.values(station.devices).reduce((a, b) => a + b, 0)
                  : "—"}
              </strong>
              <small>Devices</small>
            </div>
            <div>
              {counts.map((c) => (
                <p key={c.status}>
                  <i style={{ background: color[c.status] }} />
                  {label[c.status]} {DEMO_MODE ? show(station.devices[c.status]) : '—'}
                </p>
              ))}
            </div>
          </div>
          <div className="map-popup-metrics">
            {[
              ["有功功率", show(station.activePower, " kW")],
              ["额定功率", show(station.ratedPower, " kW")],
              ["负载率", show(station.loadRate, "%")],
              ["光伏出力", show(station.pvOutput, " MWp")],
              ["储能容量", show(station.storageCapacity, DEMO_MODE ? " MWh" : " kWh")],
              ["SOC", show(station.soc, "%")],
            ].map(([l, v]) => (
              <span key={l}>
                {l}
                <strong>{v}</strong>
              </span>
            ))}
          </div>
          {station.alerts[0] && (
            <p className="map-popup-alarm">{station.alerts[0].msg}</p>
          )}
          <Button onClick={() => onOpenStation(station.id)}>
            进入站点详情 →
          </Button>
        </article>
      )}
      <div className="station-map-bottom">
        <section>
          <header>
            <h2>异常与告警实时监控</h2>
            <span>{alerts.length} 条</span>
          </header>
          {alerts.slice(0, 2).map((a, i) => (
            <button key={i} onClick={() => onOpenStation(a.station.id)}>
              <span>{a.msg}</span>
              <small>{a.time}</small>
              <b>{a.level === "critical" ? "严重" : "警告"}</b>
            </button>
          ))}
          {!alerts.length && <p className="station-subtle">暂无告警数据</p>}
        </section>
        <section>
          <h2>子系统可用性与出力</h2>
          <div className="map-three-metrics">
            {[
              ["光伏出力", show(total(visible, "pvOutput"), " MWp")],
              ["储能额定功率", show(total(visible, "ratedPower"), " kW")],
              ["有功功率", show(total(visible, "activePower"), " kW")],
            ].map(([l, v]) => (
              <span key={l}>
                {l}
                <strong>{v}</strong>
              </span>
            ))}
          </div>
        </section>
      </div>
      {AMAP_KEY && (
        <div className="station-map-zoom">
          <button aria-label="放大地图" onClick={() => map.current?.zoomIn()}>
            ＋
          </button>
          <button aria-label="缩小地图" onClick={() => map.current?.zoomOut()}>
            −
          </button>
        </div>
      )}
    </div>
  )
}
