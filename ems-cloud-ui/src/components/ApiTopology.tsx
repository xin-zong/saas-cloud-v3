import { useEffect, useState } from "react"

import { api, type ApiRow } from "@/api/client"

import type { Station } from "@/App"
import { PageHeader, Button } from "./ui/Workspace"
import "./station-api-overview.css"

export default function ApiTopology({
  station,
  onOpenDevices,
}: {
  station: Station
  onOpenDevices: () => void
}) {
  const [links, setLinks] = useState<ApiRow[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLinks([])
    setError("")
    api<ApiRow[]>(`/stations/${station.id}/topology`, {
      signal: controller.signal,
    })
      .then(setLinks)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [station.id])

  const devices = station.deviceInventory ?? []

  const positions = new Map(
    devices.map((d, index) => [
      d.id,
      { x: 50 + (index % 3) * 240, y: 50 + Math.floor(index / 3) * 130 },
    ]),
  )

  return (
    <main className="single-line-page api-topology-workspace">
      <PageHeader
        title="一次接线图"
        description={station.name}
        actions={<Button onClick={onOpenDevices}>查看设备资料</Button>}
      />
      <div className="api-topology-metrics">
        {[
          ["已登记设备", devices.length],
          ["已配置连接", loading || error ? "—" : links.length],
          ["实时有功功率 / kW", "—"],
          ["运行状态", "遥测未知"],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <section className="station-api-panel">
        <div className="station-api-heading">
          <h2>站点电气拓扑</h2>
          <span>已登记连接 · 实时遥测待接入</span>
        </div>
        <div className="api-topology-canvas">
          {error && <p role="alert">{error}</p>}
          {error ? null : loading ? (
            <p>正在加载拓扑…</p>
          ) : (
            <>
              {!links.length && (
                <p
                  role="status"
                  style={{
                    textAlign: "center",
                    color: "#76857f",
                    fontSize: 12,
                  }}
                >
                  暂无已配置连接
                </p>
              )}
              <svg
                role="img"
                aria-label="已登记设备连接图"
                viewBox={`0 0 780 ${Math.max(180, Math.ceil(devices.length / 3) * 130 + 40)}`}
                style={{ width: "100%", maxHeight: 600 }}
              >
                <defs>
                  <marker
                    id="topology-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8" fill="#527869" />
                  </marker>
                </defs>
                {links.map((link) => {
                  const a = positions.get(String(link.source_device_id)),
                    b = positions.get(String(link.target_device_id))
                  return a && b ? (
                    <line
                      key={`${link.source_device_id}-${link.target_device_id}`}
                      x1={a.x + 90}
                      y1={a.y + 30}
                      x2={b.x + 90}
                      y2={b.y + 30}
                      stroke="#527869"
                      strokeWidth="2"
                      markerEnd="url(#topology-arrow)"
                    />
                  ) : null
                })}
                {devices.map((d) => {
                  const p = positions.get(d.id)!
                  return (
                    <g key={d.id}>
                      <rect
                        x={p.x}
                        y={p.y}
                        width="180"
                        height="60"
                        rx="8"
                        fill="white"
                        stroke="#527869"
                      />
                      <text x={p.x + 12} y={p.y + 24} fontSize="13">
                        {d.name}
                      </text>
                      <text
                        x={p.x + 12}
                        y={p.y + 45}
                        fontSize="11"
                        fill="#64748b"
                      >
                        {d.code} ·{" "}
                        {d.status === "unknown"
                          ? "通信未知"
                          : d.status === "online"
                            ? "在线"
                            : "离线"}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </>
          )}
        </div>
        <div className="api-topology-legend">
          <span>□ 已登记设备</span>
          <span>→ 已配置连接</span>
          <span>遥测及开关状态：—</span>
        </div>
      </section>
    </main>
  )
}
