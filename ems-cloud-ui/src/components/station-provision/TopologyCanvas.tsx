import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import { hasDcPv } from "./deviceConfiguration"
import { electricalNodeSize, isStructure } from "./topologyModel"
import { type Device, type DeviceType, type ProvisionDraft } from "./model"
import {
  canvasPosition,
  fitCanvasViewport,
  communicationDraft,
  persistCanvasPatch,
  communicationEdges,
  communicationPorts,
  connectPorts,
  electricalPorts,
  electricalWirePoints,
  resolveElectricalPort,
  moveCanvasNode,
  screenToWorld,
  zoomAt,
  WORLD,
  type CanvasMode,
  type CanvasPort,
  type Point,
  type PortRef,
  type Viewport,
} from "./topologyCanvasModel"

type Props = {
  draft: ProvisionDraft
  mode: CanvasMode
  selected: string
  select: (id: string) => void
  change: (patch: Partial<ProvisionDraft>) => void
  add: (type: DeviceType, p?: Point) => void
  focusRevision: number
  status: (text: string) => void
  zoom: number
  setZoom: (zoom: number) => void
  fitRevision: number
  readOnly?: boolean
}
const colors: Record<string, string> = {
  AC: "#547787",
  DC: "#ca811e",
  ETH: "#2e9e7d",
  RS485: "#526ed1",
  CAN: "#8766b0",
  DI: "#71846c",
  FORWARD: "#d9802e",
}
export default function TopologyCanvas({
  draft,
  mode,
  selected,
  select,
  change,
  add,
  focusRevision,
  status,
  zoom,
  setZoom,
  fitRevision,
  readOnly = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 }),
    [preview, setPreview] = useState<ProvisionDraft | null>(null),
    [wire, setWire] = useState<{ ref: PortRef; point: Point } | null>(null)
  const gesture = useRef<{
      type: "move" | "pan" | "resize"
      id?: string
      start: Point
      view: Viewport
      draft: ProvisionDraft
      position?: Point
      size?: Point
      changed: boolean
    } | null>(null),
    latest = useRef(draft),
    latestView = useRef(view),
    previewRef = useRef<ProvisionDraft | null>(null),
    portStart = useRef<PortRef | null>(null)
  latest.current = draft
  latestView.current = view
  previewRef.current = preview
  const original = draft
  draft = mode === "communication" ? communicationDraft(draft) : draft
  latest.current = draft
  const commit = (patch: Partial<ProvisionDraft>) =>
    change(
      mode === "communication" ? persistCanvasPatch(original, patch) : patch,
    )
  const model = preview ?? draft
  const electricalRoutes = useMemo(() => {
    if (mode !== "electrical") return new Map<string, Point[]>()
    return new Map((model.connections ?? []).map(e => [e.id, electricalWirePoints(model, {
      id: e.id, from: {node:e.from,port:e.fromPort??e.kind},
      to: {node:e.to,port:e.toPort??e.kind}, kind:e.kind,
    })]))
  }, [model.devices, model.connections, mode])
  const visible = model.devices.filter((n) =>
    mode === "communication"
      ? n.type !== "标准柜" && !isStructure(n)
      : n.type !== "EMS" && !(n.type === "光伏 DC/DC" && !hasDcPv(n)),
  )
  const fit = () => {
    const box = host.current?.getBoundingClientRect()
    if (!box) return
    const next=fitCanvasViewport(visible.map(d=>{
      const p=point(d),s=size(d)
      return {x:p.x-s.x/2,y:d.type==='标准柜'?p.y-65:p.y-s.y/2,width:s.x,height:s.y}
    }),{x:box.width,y:box.height})
    setView(next)
    setZoom(next.scale)
  }
  const fitLatest = useRef(fit)
  fitLatest.current = fit
  useEffect(() => {
    fit()
    const observer = new ResizeObserver(() => fitLatest.current())
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [mode, fitRevision])
  useEffect(() => {
    if (Math.abs(zoom - view.scale) > 0.001) {
      const r = host.current?.getBoundingClientRect()
      if (r)
        setView((v) => zoomAt(v, zoom, { x: r.width / 2, y: r.height / 2 }))
    }
  }, [zoom])
  useEffect(() => {
    if (!focusRevision) return
    const d = draft.devices.find((n) => n.id === selected)??draft.devices.find(n=>selected===n.id+':meter'||selected===n.id+':tms'),
      box = host.current?.getBoundingClientRect()
    if (d && box) {
      const p = canvasPosition(draft, d, mode)
      setView((v) => ({
        ...v,
        x: box.width / 2 - (p.x / 100) * WORLD.width * v.scale,
        y: box.height / 2 - (p.y / 100) * WORLD.height * v.scale,
      }))
    }
  }, [focusRevision])
  useEffect(() => {
    const el = host.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const next = zoomAt(
        latestView.current,
        latestView.current.scale *
          Math.exp(-Math.max(-300, Math.min(300, e.deltaY)) * 0.0015),
        { x: e.clientX - r.left, y: e.clientY - r.top },
      )
      setView(next)
      setZoom(next.scale)
    }
    el.addEventListener("wheel", wheel, { passive: false })
    return () => el.removeEventListener("wheel", wheel)
  }, [])
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (gesture.current || portStart.current) { e.preventDefault(); status(portStart.current ? "已取消连线" : "已取消操作") }
        gesture.current = null
        portStart.current = null
        setPreview(null)
        setWire(null)
      }
    }
    window.addEventListener("keydown", escape, true)
    return () => window.removeEventListener("keydown", escape, true)
  }, [])
  function local(e: { clientX: number; clientY: number }) {
    const r = host.current!.getBoundingClientRect()
    return screenToWorld(
      { x: e.clientX - r.left, y: e.clientY - r.top },
      latestView.current,
    )
  }
  function size(d: Device) {
    const fields = d as Device & {
      width?: number
      height?: number
      commWidth?: number
      commHeight?: number
    }
    return {
      x:
        mode === "communication"
          ? (fields.commWidth ?? (d.type === "EMS" ? 570 : 138))
          : electricalNodeSize(d).x,
      y:
        mode === "communication"
          ? (fields.commHeight ?? (d.type === "EMS" ? 80 : 62))
          : electricalNodeSize(d).y,
    }
  }
  function point(d: Device) {
    const p = canvasPosition(model, d, mode)
    return { x: (p.x / 100) * WORLD.width, y: (p.y / 100) * WORLD.height }
  }
  function ports(d: Device) {
    return mode === "communication" ? communicationPorts(d) : electricalPorts(d)
  }
  function endpoint(id: string, port: string) {
    const d = model.devices.find((n) => n.id === id)
    if (!d) return null
    const p = point(d),
      s = size(d),
      ps = ports(d),
      entry = ps.find((n) => n.id === port) ?? (mode==='electrical'?resolveElectricalPort(d,port):ps[0])
    if (!entry) return p
    return {
      x: p.x - s.x / 2 + s.x * entry.ratio,
      y: p.y + (entry.side === "top" ? -s.y / 2 : s.y / 2),
    }
  }
  function start(e: ReactPointerEvent, type: "move" | "resize", d: Device) {
    if (readOnly || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    select(d.id)
    const p = local(e)
    gesture.current = {
      type,
      id: d.id,
      start: p,
      view,
      position: canvasPosition(draft, d, mode),
      size: size(d),
      draft,
      changed: false,
    }
    host.current?.setPointerCapture(e.pointerId)
  }
  function finishPort(ref: PortRef) {
    const source = portStart.current
    if (!source) {
      portStart.current = ref
      setWire({ ref, point: endpoint(ref.node, ref.port) ?? { x: 0, y: 0 } })
      status("拖动或选择目标端口；Esc 取消")
      return
    }
    if (source.node === ref.node && source.port === ref.port) return
    const result = connectPorts(latest.current, source, ref, mode)
    if (result.error) status(result.error)
    else if (result.patch) {
      commit(result.patch)
      status("连接已更新；请保存草稿")
    }
    portStart.current = null
    setWire(null)
  }
  function up(e: ReactPointerEvent) {
    if (portStart.current) {
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-port-node]")
      if (el && el.dataset.portNode && el.dataset.port)
        finishPort({ node: el.dataset.portNode, port: el.dataset.port })
    }
    const g = gesture.current
    if (g && g.type !== "pan" && g.changed && previewRef.current)
      commit({ devices: previewRef.current.devices })
    if (g?.type === "pan" && !g.changed) select("")
    gesture.current = null
    setPreview(null)
    if (host.current?.hasPointerCapture(e.pointerId))
      host.current.releasePointerCapture(e.pointerId)
  }
  const edges =
    mode === "communication"
      ? communicationEdges(model)
      : (model.connections ?? []).map((e) => ({
          id: e.id,
          from: { node: e.from, port: e.fromPort??e.kind },
          to: { node: e.to, port: e.toPort??e.kind },
          kind: e.kind,
        }))
  function renderPort(d: Device, p: CanvasPort) {
    const s = size(d)
    return (
      <button
        key={p.id}
        className={`topo-port ${
          mode === "communication" && d.type === "EMS" ? "topo-port-label" : ""
        } ${
          portStart.current?.node === d.id && portStart.current.port === p.id
            ? "active"
            : ""
        }`}
        style={
          {
            left: s.x * p.ratio,
            top: p.side === "top" ? 0 : s.y,
            "--port-color": colors[p.kind] ?? colors.ETH,
          } as React.CSSProperties
        }
        data-port-node={d.id}
        data-port={p.id}
        aria-label={`${d.code} ${p.label} 端口`}
        title={`${d.code} · ${p.label}：拖动连线或点击后选择目标端口`}
        disabled={readOnly}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          if (!portStart.current) {
            portStart.current = { node: d.id, port: p.id }
            setWire({ ref: portStart.current, point: local(e) })
            host.current?.setPointerCapture(e.pointerId)
          }
        }}
        onPointerUp={(e) => {
          e.stopPropagation()
          up(e)
        }}
        onClick={(e) => {
          if (e.detail === 0) finishPort({ node: d.id, port: p.id })
        }}
      >
        {mode === "communication" && d.type === "EMS" ? (
          p.label
        ) : (
          <span>{p.label}</span>
        )}
      </button>
    )
  }
  return (
    <div
      className="topo-viewport"
      ref={host}
      data-testid="topology-canvas"
      aria-label={mode === "electrical" ? "电气拓扑画布" : "通信拓扑画布"}
      onDragOver={(e) => {
        if (!readOnly) e.preventDefault()
      }}
      onDrop={(e) => {
        e.preventDefault()
        if (readOnly) return
        const type = e.dataTransfer.getData("application/enerlution-node")
        if (type) {
          const p = local(e)
          add(type as DeviceType, {
            x: (p.x / WORLD.width) * 100,
            y: (p.y / WORLD.height) * 100,
          })
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        gesture.current = {
          type: "pan",
          start: { x: e.clientX, y: e.clientY },
          view,
          draft,
          changed: false,
        }
        host.current?.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const p = local(e)
        if (portStart.current) setWire({ ref: portStart.current, point: p })
        const g = gesture.current
        if (!g) return
        if (g.type === "pan") {
          g.changed ||= Math.hypot(e.clientX-g.start.x,e.clientY-g.start.y)>3
          setView({
            ...g.view,
            x: g.view.x + e.clientX - g.start.x,
            y: g.view.y + e.clientY - g.start.y,
          })
          return
        }
        const delta = { x: p.x - g.start.x, y: p.y - g.start.y }
        g.changed = Math.hypot(delta.x, delta.y) > 2
        if (g.type === "move" && g.position) {
          const patch = moveCanvasNode(
            g.draft,
            g.id!,
            {
              x: g.position.x + (delta.x / WORLD.width) * 100,
              y: g.position.y + (delta.y / WORLD.height) * 100,
            },
            mode,
          )
          setPreview({ ...g.draft, ...patch })
        } else if (g.size) {
          const width = Math.max(100, Math.min(900, g.size.x + delta.x * 2)),
            height = Math.max(40, Math.min(420, g.size.y + delta.y * 2))
          setPreview({
            ...g.draft,
            devices: g.draft.devices.map((n) =>
              n.id === g.id
                ? {
                    ...n,
                    ...(mode === "communication"
                      ? { commWidth: width, commHeight: height }
                      : { width, height }),
                  }
                : n,
            ),
          })
        }
      }}
      onPointerUp={up}
      onPointerCancel={() => {
        gesture.current = null
        portStart.current = null
        setPreview(null)
        setWire(null)
      }}
    >
      <div
        className="topo-scene"
        style={{
          width: WORLD.width,
          height: WORLD.height,
          transform: `translate(${view.x}px,${view.y}px) scale(${view.scale})`,
        }}
      >
        {mode === "electrical" &&
          visible
            .filter((n) => n.type === "标准柜")
            .map((d) => {
              const p = point(d),
                s = size(d)
              return (
                <div
                  key={d.id}
                  className={`topo-cabinet ${
                    selected === d.id ? "selected" : ""
                  }`}
                  style={{
                    left: p.x - s.x / 2,
                    top: p.y - 65,
                    width: s.x,
                    height: s.y,
                  }}
                >
                  <button
                    onPointerDown={(e) => start(e, "move", d)}
                    onClick={() => select(d.id)}
                  >
                    标准柜 · {d.code}
                    <small>
                      {model.devices.filter((n) => n.cabinetId === d.id).length}{" "}
                      个成员
                    </small>
                  </button>
                  <button
                    className="topo-resize"
                    aria-label={`调整 ${d.code} 尺寸`}
                    onPointerDown={(e) => start(e, "resize", d)}
                  >
                    ⌟
                  </button>
                </div>
              )
            })}
        <svg className="topo-wires" width={WORLD.width} height={WORLD.height}>
          {edges.map((e) => {
            if (
              !visible.some((n) => n.id === e.from.node) ||
              !visible.some((n) => n.id === e.to.node)
            )
              return null
            const a = endpoint(e.from.node, e.from.port),
              b = endpoint(e.to.node, e.to.port)
            if (!a || !b) return null
            const mid = (a.y + b.y) / 2
            const points = electricalRoutes.get(e.id) ?? []
            return (
              <path
                key={e.id}
                d={mode === "electrical" ? points.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ') : `M${a.x} ${a.y}V${mid}H${b.x}V${b.y}`}
                stroke={colors[e.kind] ?? colors.ETH}
                strokeWidth={2}
                strokeDasharray={e.kind === "FORWARD" ? "6 5" : undefined}
                fill="none"
              >
                <title>
                  {e.kind} · {e.from.port} → {e.to.port}
                </title>
              </path>
            )
          })}
          {wire &&
            (() => {
              const a = endpoint(wire.ref.node, wire.ref.port)
              return a ? (
                <path
                  d={`M${a.x} ${a.y}V${(a.y + wire.point.y) / 2}H${wire.point.x}V${wire.point.y}`}
                  stroke="#1e6656"
                  strokeWidth="2"
                  strokeDasharray="5 4"
                  fill="none"
                />
              ) : null
            })()}
        </svg>
        {visible
          .filter((n) => n.type !== "标准柜")
          .map((d) => {
            const p = point(d),
              s = size(d),
              bus = ["交流母线", "直流母线"].includes(d.type)
            return (
              <div
                key={d.id}
                className={`topo-card ${bus ? "topo-bus" : ""} ${
                  d.type === "直流母线" ? "topo-bus-dc" : ""
                } ${d.type === "EMS" ? "topo-ems" : ""} ${
                  selected === d.id ? "selected" : ""
                }`}
                data-canvas-node={d.id}
                style={{
                  left: p.x - s.x / 2,
                  top: p.y - s.y / 2,
                  width: s.x,
                  height: s.y,
                }}
              >
                <button
                  className="topo-card-body"
                  aria-label={`配置 ${d.name}`}
                  onPointerDown={(e) => start(e, "move", d)}
                  onClick={() => select(d.id)}
                  onKeyDown={(e) => {
                    if (readOnly || !e.key.startsWith("Arrow")) return
                    e.preventDefault()
                    const pos = canvasPosition(draft, d, mode),
                      step = e.shiftKey ? 3 : 1
                    commit(
                      moveCanvasNode(
                        draft,
                        d.id,
                        {
                          x:
                            pos.x +
                            (e.key === "ArrowRight"
                              ? step
                              : e.key === "ArrowLeft"
                                ? -step
                                : 0),
                          y:
                            pos.y +
                            (e.key === "ArrowDown"
                              ? step
                              : e.key === "ArrowUp"
                                ? -step
                                : 0),
                        },
                        mode,
                      ),
                    )
                  }}
                >
                  {!bus && <img src={nodeIcon(d.type)} alt="" />}
                  <span>
                    <small>{d.code}</small>
                    <strong>{d.name}</strong>
                  </span>
                  {mode === "communication" && (
                    <em>
                      {d.type === "EMS"
                        ? "默认"
                        : d.access === "不接入"
                          ? "不接入"
                          : d.access === "EMU" || d.access === "设备转发"
                            ? `经 ${model.devices.find((n) => n.id === (d.emuId || d.forwardDeviceId))?.code ?? "未配置"}`
                            : d.emsId
                              ? d.protocol || "待配置"
                              : "待配置"}
                    </em>
                  )}
                  {d.cooling && mode === "electrical" && (
                    <img
                      className="topo-cooling"
                      src="/figma/topology-current/figmaElectrical-imgCapabilityTms01.svg"
                      alt="液冷 TMS"
                    />
                  )}
                </button>
                {mode==='electrical'&&d.metering&&<button className="topo-meter-marker" aria-label={'配置计量电表 '+(d.metering.name??d.code)} title={'计量电表 · '+(d.metering.nodeId??d.id+':meter')} onPointerDown={e=>e.stopPropagation()} onClick={()=>select(d.id+':meter')}>M</button>}
                {ports(d).map((p) => renderPort(d, p))}
                {selected === d.id && !bus && !readOnly && (
                  <button
                    className="topo-resize"
                    aria-label={`调整 ${d.code} 尺寸`}
                    title="拖动调整尺寸"
                    onPointerDown={(e) => start(e, "resize", d)}
                  >
                    ⌟
                  </button>
                )}
              </div>
            )
          })}
      </div>
      {!visible.length && (
        <div className="topo-empty">
          {mode === "electrical"
            ? "从左侧拖入节点，开始搭建电气拓扑"
            : "暂无通信设备，请先添加 EMS 和设备"}
          <small>
            拖动设备可移动 · 拖动端口可连线 · 滚轮缩放 · 空白处拖动平移
          </small>
        </div>
      )}
      <div className="topo-legend">
        {(mode === "electrical"
          ? ["AC", "DC"]
          : [
              "ETH",
              "RS485",
              "FORWARD",
              ...["CAN", "DI"].filter((k) => edges.some((e) => e.kind === k)),
            ]
        ).map((k) => (
          <span key={k}>
            <i style={{ background: colors[k] }} />
            {
              {
                AC: "AC连接",
                DC: "DC连接",
                ETH: "以太网",
                RS485: "RS485",
                CAN: "CAN",
                DI: "DI",
                FORWARD: "设备转发",
              }[k]
            }
          </span>
        ))}
      </div>
    </div>
  )
}
export function nodeIcon(type: DeviceType) {
  const map: Partial<Record<DeviceType, string>> = {
    电网: "figmaElectrical-imgCanvasIconGrid01",
    柴油发电机: "figmaElectrical-imgCanvasIconGen01",
    ATS: "figmaElectrical-imgCanvasIconAts01",
    PCS: "figmaElectrical-imgCanvasIconPcs01",
    "电池 / BMS": "figmaElectrical-imgCanvasIconEmu01",
    标准柜: "figmaElectrical-imgCanvasIconEmu01",
    "光伏 DC/DC": "figmaElectrical-imgCanvasIconDcdc01",
    EMS: "figmaCanvas-imgLibraryIconEms",
    温控设备: "figmaCanvas-imgLibraryIconTms",
    电表: "figmaCanvas-imgLibraryIcon",
    光伏侧电表: "figmaCanvas-imgLibraryIcon",
    AC充电桩: "figmaCanvas-imgLibraryIconAcch01",
    DC充电桩: "figmaCanvas-imgLibraryIconDcch01",
    充电桩: "figmaCanvas-imgLibraryIconAcch01",
  }
  return map[type]
    ? `/figma/topology-current/${map[type]}.svg`
    : `/figma/provision-v3/${
        type === "光伏" ? "pv" : type.includes("母线") ? "bus" : "load"
      }.svg`
}
