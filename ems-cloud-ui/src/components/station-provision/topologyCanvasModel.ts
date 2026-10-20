import { newNodeId, type Device, type ProvisionDraft } from "./model"
import { canWire, electricalNodeSize, isStructure, moveNode, nodePosition } from "./topologyModel"
import { embeddedCommunicationDevices, hasDcPv, portKind } from "./deviceConfiguration"

export type CanvasMode = "electrical" | "communication"
export type Point = { x: number; y: number }
export type Viewport = Point & { scale: number }
export type PortRef = { node: string; port: string }
export type CanvasPort = {
  id: string
  kind: string
  label: string
  side: "top" | "bottom"
  ratio: number
}
export type CanvasEdge = {
  id: string
  from: PortRef
  to: PortRef
  kind: string
  legacy?: boolean
}
export const WORLD = { width: 1000, height: 740 }
/** Fit the visible content with a stable reading scale; preserve empty-canvas defaults. */
export function fitCanvasViewport(rects: {x:number;y:number;width:number;height:number}[], box: Point, padding=48): Viewport {
  const valid=rects.filter(r=>[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0)
  const bounds=valid.length?{
    left:Math.min(...valid.map(r=>r.x)),top:Math.min(...valid.map(r=>r.y)),
    right:Math.max(...valid.map(r=>r.x+r.width)),bottom:Math.max(...valid.map(r=>r.y+r.height)),
  }:{left:0,top:0,right:WORLD.width,bottom:WORLD.height}
  const width=bounds.right-bounds.left,height=bounds.bottom-bounds.top
  const scale=Math.max(.25,Math.min(1.2,Math.max(1,box.x-padding*2)/width,Math.max(1,box.y-padding*2)/height))
  return {scale,x:box.x/2-(bounds.left+width/2)*scale,y:box.y/2-(bounds.top+height/2)*scale}
}

export const screenToWorld = (p: Point, v: Viewport): Point => ({
  x: (p.x - v.x) / v.scale,
  y: (p.y - v.y) / v.scale,
})
export function zoomAt(v: Viewport, scale: number, p: Point): Viewport {
  const next = Math.min(2.5, Math.max(0.25, scale)),
    w = screenToWorld(p, v)
  return { scale: next, x: p.x - w.x * next, y: p.y - w.y * next }
}
export function canvasPosition(
  draft: ProvisionDraft,
  d: Device,
  mode: CanvasMode,
): Point {
  if (mode === "electrical")
    return nodePosition(draft, d, draft.devices.indexOf(d))
  const nodes = draft.devices.filter(
      (n) => n.type !== "标准柜" && n.type !== "EMS" && !isStructure(n),
    ),
    i = nodes.findIndex((n) => n.id === d.id)
  return {
    x: d.commX ?? (d.type === "EMS" ? 50 : 18 + (Math.max(0, i) % 4) * 21),
    y:
      d.commY ??
      (d.type === "EMS" ? 13 : 35 + Math.floor(Math.max(0, i) / 4) * 23),
  }
}
export function moveCanvasNode(
  draft: ProvisionDraft,
  id: string,
  p: Point,
  mode: CanvasMode,
) {
  const position = {
    x: Math.min(96, Math.max(4, p.x)),
    y: Math.min(93, Math.max(6, p.y)),
  }
  return mode === "electrical"
    ? moveNode(draft, id, position)
    : {
        devices: draft.devices.map((n) =>
          n.id === id ? { ...n, commX: position.x, commY: position.y } : n,
        ),
      }
}
export function electricalPorts(d: Device): CanvasPort[] {
  if (["EMS", "标准柜", "温控设备", "电表", "光伏侧电表"].includes(d.type)) return []
  if(d.type === 'ATS') return [
    {id:'sourceA',kind:'AC',label:'电源 A',side:'top',ratio:.25},
    {id:'sourceB',kind:'AC',label:'电源 B',side:'top',ratio:.75},
    {id:'common',kind:'AC',label:'公共输出',side:'bottom',ratio:.5},
  ]
  const kinds = d.type === "PCS" ? ["AC", "DC"] : ["直流母线", "电池 / BMS", "光伏 DC/DC", "DC充电桩"].includes(d.type) ? ["DC"] : ["AC"]
  return kinds.map((kind, i) => ({
    id: d.type.includes('母线') ? 'bus' : kind.toLowerCase(), kind, label:kind,
    side: i === 1 || ["电网", "光伏", "柴油发电机"].includes(d.type) ? "bottom" : "top", ratio:.5,
  }))
}
/** Resolve old AC/DC endpoint references without guessing an ATS source. */
export function resolveElectricalPort(d:Device, ref:string):CanvasPort|undefined {
 const ports=electricalPorts(d)
 return ports.find(p=>p.id===ref)|| (d.type!=='ATS'?ports.find(p=>p.id.toLowerCase()===ref.toLowerCase()||p.kind===ref):undefined)
}
/** Route terminal-to-terminal on a rectilinear visibility grid, avoiding cards.
 * Cabinet outlines are containers, so wires may enter their actual member ports.
 * The graph is bounded by node geometry and never follows topology recursively.
 */

export function electricalWirePoints(
  draft: ProvisionDraft,
  edge: CanvasEdge,
): Point[] {
  const from = draft.devices.find((n) => n.id === edge.from.node),
    to = draft.devices.find((n) => n.id === edge.to.node)

  if (!from || !to) return []

  const endpoint = (d: Device, ref: string) => {
    const p = nodePosition(draft, d, draft.devices.indexOf(d)),
      s = electricalNodeSize(d),
      port = resolveElectricalPort(d, ref)

    return {
      x: p.x * 10 - s.x / 2 + s.x * (port?.ratio ?? 0.5),
      y: p.y * 7.4 + (port?.side === "bottom" ? s.y / 2 : -s.y / 2),
      side: port?.side ?? "top",
    }
  }

  const a = endpoint(from, edge.from.port),
    b = endpoint(to, edge.to.port)

  for (const [d, p, other] of [
    [from, a, b],
    [to, b, a],
  ] as const)
    if (d.type.includes("母线")) {
      const center = nodePosition(draft, d, draft.devices.indexOf(d)),
        w = electricalNodeSize(d).x

      p.x = Math.max(
        center.x * 10 - w / 2,
        Math.min(center.x * 10 + w / 2, other.x),
      )
      p.y = center.y * 7.4
      p.side = other.y < p.y ? "top" : "bottom"
    }

  const cards = draft.devices

    .filter(
      (n) =>
        !n.type.includes("母线") &&
        n.type !== "标准柜" &&
        n.type !== "EMS" &&
        !(n.type === "光伏 DC/DC" && !hasDcPv(n)),
    )
    .map((n) => {
      const p = nodePosition(draft, n, draft.devices.indexOf(n)),
        s = electricalNodeSize(n)

      return {
        id: n.id,

        left: p.x * 10 - s.x / 2,

        right: p.x * 10 + s.x / 2,

        top: p.y * 7.4 - s.y / 2,

        bottom: p.y * 7.4 + s.y / 2,
      }
    })
  // Saved drafts may leave less than the usual clearance between cards.

  // Shrink the routing margin and terminal stubs to fit the actual free gap.

  let margin = 8

  for (let i = 0; i < cards.length; i++)
    for (let j = i + 1; j < cards.length; j++) {
      const p = cards[i],
        q = cards[j]

      if (p.left < q.right && p.right > q.left) {
        const gap = Math.max(p.top, q.top) - Math.min(p.bottom, q.bottom)

        if (gap >= 0) margin = Math.min(margin, gap / 4)
      }

      if (p.top < q.bottom && p.bottom > q.top) {
        const gap = Math.max(p.left, q.left) - Math.min(p.right, q.right)

        if (gap >= 0) margin = Math.min(margin, gap / 4)
      }
    }

  const obstacles = cards.map((r) => ({
    left: r.left - margin,
    right: r.right + margin,
    top: r.top - margin,
    bottom: r.bottom + margin,
  }))

  const stub = (p: typeof a, id: string): Point => {
    const direction = p.side === "top" ? -1 : 1

    const gaps = cards
      .filter((r) => r.id !== id && p.x > r.left && p.x < r.right)

      .map((r) => (direction < 0 ? p.y - r.bottom : r.top - p.y))
      .filter((gap) => gap >= 0)

    const length = Math.min(16, ...gaps.map((gap) => gap / 2))

    return { x: p.x, y: p.y + direction * length }
  }

  const start = stub(a, from.id),
    end = stub(b, to.id)

  const clear = (p: Point, q: Point) =>
    !obstacles.some((r) =>
      p.x === q.x
        ? p.x > r.left &&
          p.x < r.right &&
          Math.max(p.y, q.y) > r.top &&
          Math.min(p.y, q.y) < r.bottom
        : p.y > r.top &&
          p.y < r.bottom &&
          Math.max(p.x, q.x) > r.left &&
          Math.min(p.x, q.x) < r.right,
    )

  const simplify = (points: Point[]) =>
    points.reduce<Point[]>((result, p) => {
      const last = result.at(-1),
        before = result.at(-2)

      if (last && last.x === p.x && last.y === p.y) return result

      if (
        before &&
        last &&
        ((before.x === last.x && last.x === p.x) ||
          (before.y === last.y && last.y === p.y))
      )
        result.pop()

      result.push({ x: p.x, y: p.y })
      return result
    }, [])

  if ((start.x === end.x || start.y === end.y) && clear(start, end))
    return simplify([a, start, end, b])

  const xs = [
    ...new Set([
      start.x,
      end.x,
      ...obstacles.flatMap((r) => [r.left, r.right]),
    ]),
  ].sort((a, b) => a - b)

  const ys = [
    ...new Set([
      start.y,
      end.y,
      ...obstacles.flatMap((r) => [r.top, r.bottom]),
    ]),
  ].sort((a, b) => a - b)

  const key = (x: number, y: number, dir: number) =>
    (y * xs.length + x) * 3 + dir

  const sx = xs.indexOf(start.x),
    sy = ys.indexOf(start.y),
    tx = xs.indexOf(end.x),
    ty = ys.indexOf(end.y)

  const initial = key(sx, sy, 0),
    cost = new Map([[initial, 0]]),
    previous = new Map<number, number>()

  const pending = [{ x: sx, y: sy, dir: 0, key: initial, score: 0 }],
    visited = new Set<number>()

  let finish: number | undefined

  while (pending.length) {
    pending.sort((a, b) => b.score - a.score)

    const current = pending.pop()!

    if (visited.has(current.key)) continue

    visited.add(current.key)

    if (current.x === tx && current.y === ty) {
      finish = current.key
      break
    }

    for (const [dx, dy] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const x = current.x + dx,
        y = current.y + dy,
        dir = dx ? 1 : 2

      if (x < 0 || y < 0 || x >= xs.length || y >= ys.length) continue

      const p = { x: xs[current.x], y: ys[current.y] },
        q = { x: xs[x], y: ys[y] },
        next = key(x, y, dir)

      if (visited.has(next) || !clear(p, q)) continue

      const value =
        cost.get(current.key)! +
        Math.abs(p.x - q.x) +
        Math.abs(p.y - q.y) +
        (current.dir && current.dir !== dir ? 16 : 0)

      if (value >= (cost.get(next) ?? Infinity)) continue

      cost.set(next, value)
      previous.set(next, current.key)

      pending.push({
        x,
        y,
        dir,
        key: next,
        score: value + Math.abs(q.x - end.x) + Math.abs(q.y - end.y),
      })
    }
  }

  // Overlapping cards may make a safe route impossible. Never fabricate a

  // fallback segment through a card's interior.

  if (finish === undefined) return []

  const middle: Point[] = []

  for (
    let id: number | undefined = finish;
    id !== undefined;
    id = previous.get(id)
  ) {
    const index = Math.floor(id / 3)
    middle.push({
      x: xs[index % xs.length],
      y: ys[Math.floor(index / xs.length)],
    })
  }

  return simplify([a, ...middle.reverse(), b])
}

export function communicationPorts(d: Device): CanvasPort[] {
  if (d.type === "EMS")
    return (d.ports ?? []).map((p, i, all) => ({
      id: p.id,
      kind: portKind(p) || p.protocol,
      label: p.id,
      side: "bottom",
      ratio: (i + 1) / (all.length + 1),
    }))
  return [
    {
      id: "IN",
      kind: d.protocol || "ETH",
      label: d.interface || "接入",
      side: "top",
      ratio: 0.5,
    },
    ...(["电池 / BMS", "PCS"].includes(d.type)
      ? [
          {
            id: "FORWARD",
            kind: "FORWARD",
            label: "转发",
            side: "bottom" as const,
            ratio: 0.5,
          },
        ]
      : []),
  ]
}
export function communicationEdges(draft: ProvisionDraft): CanvasEdge[] {
  const edges: CanvasEdge[] = []
  for (const d of draft.devices) {
    if (
      d.type === "EMS" ||
      d.type === "标准柜" ||
      isStructure(d) ||
      d.access === "不接入"
    )
      continue
    const parent =
      d.access === "EMU"
        ? d.emuId
        : d.access === "设备转发"
          ? d.forwardDeviceId
          : d.emsId
    const parentDevice = draft.devices.find((n) => n.id === parent)
    if (
      parent &&
      parentDevice &&
      (d.access === "EMU" ||
        d.access === "设备转发" ||
        parentDevice.ports?.some((p) => p.id === d.interface))
    )
      edges.push({
        id: `comm:${d.id}`,
        from: {
          node: parent,
          port:
            d.access === "EMU" || d.access === "设备转发"
              ? "FORWARD"
              : d.interface,
        },
        to: { node: d.id, port: "IN" },
        kind:
          d.access === "EMU" || d.access === "设备转发"
            ? "FORWARD"
            : d.protocol === "Modbus RTU"
              ? "RS485"
              : d.protocol === "CAN"
                ? "CAN"
                : d.protocol === "DI"
                  ? "DI"
                  : "ETH",
      })
    for (const p of d.ports ?? [])
      for (const target of p.targets ?? []) {
        const [node, port] = target.split("/")
        if (draft.devices.some((n) => n.id === node))
          edges.push({
            id: `legacy:${d.id}:${p.id}:${target}`,
            from: { node: d.id, port: "IN" },
            to: { node, port },
            kind: p.protocol === "Modbus RTU" ? "RS485" : "ETH",
            legacy: true,
          })
      }
  }
  return edges
}
export function connectPorts(
  draft: ProvisionDraft,
  a: PortRef,
  b: PortRef,
  mode: CanvasMode,
): { patch?: Partial<ProvisionDraft>; error?: string } {
  const from = draft.devices.find((n) => n.id === a.node),
    to = draft.devices.find((n) => n.id === b.node)
  if (!from || !to || from.id === to.id)
    return { error: "请选择不同设备的兼容端口" }
  if (mode === "electrical") {
    const sourcePort=resolveElectricalPort(from,a.port),targetPort=resolveElectricalPort(to,b.port)
    if(!sourcePort||!targetPort||sourcePort.kind!==targetPort.kind||!canWire(from,to,sourcePort.kind as 'AC'|'DC'))return {error:'端口不兼容，请连接同类 AC / DC 端口；ATS 需明确选择电源 A / B 或公共输出'}
    const kind=sourcePort.kind as 'AC'|'DC'
    const occupied=(node:Device,p:CanvasPort)=>p.id!=='bus'&&draft.connections?.some(e=>(e.from===node.id&&resolveElectricalPort(node,e.fromPort??e.kind)?.id===p.id)||(e.to===node.id&&resolveElectricalPort(node,e.toPort??e.kind)?.id===p.id))
    if(occupied(from,sourcePort)||occupied(to,targetPort))return {error:'设备端口已被连线占用，请先删除原连接；母线端口可共享'}

    if(draft.connections?.some(e=>e.kind===kind&&((e.from===a.node&&e.to===b.node&&(e.fromPort??sourcePort.id)===sourcePort.id&&(e.toPort??targetPort.id)===targetPort.id)||(e.from===b.node&&e.to===a.node&&(e.fromPort??targetPort.id)===targetPort.id&&(e.toPort??sourcePort.id)===sourcePort.id))))return {error:'这两个端口已连接'}
    return {patch:{connections:[...(draft.connections??[]),{id:newNodeId(),from:a.node,to:b.node,kind,fromPort:sourcePort.id,toPort:targetPort.id}]}}
  }
  const source =
    from.type === "EMS" || a.port === "FORWARD"
      ? from
      : to.type === "EMS" || b.port === "FORWARD"
        ? to
        : undefined
  if (!source) return { error: "请从 EMS 接口或设备转发端口连接到设备接入端口" }
  const target = source === from ? to : from,
    ref = source === from ? a : b,
    targetRef = source === from ? b : a
  if (target.type === "EMS" || targetRef.port !== "IN")
    return { error: "目标应为设备接入端口" }
  if (isStructure(target) || target.type === "标准柜")
    return { error: "结构节点无需通信接入" }
  let values: Partial<Device>
  if (ref.port === "FORWARD") {
    if(draft.devices.some(n=>n.id!==target.id&&n.type===target.type&&((n.access==='EMU'&&n.emuId===source.id)||(n.access==='设备转发'&&n.forwardDeviceId===source.id))))return {error:'同一转发设备下，同一种设备类型最多连接一台'}
    let cursor: Device | undefined = source
    const visited = new Set([target.id])
    while (cursor) {
      if (visited.has(cursor.id)) return { error: "设备转发不能形成循环" }
      visited.add(cursor.id)
      const id: string | undefined =
        cursor.access === "EMU"
          ? cursor.emuId
          : cursor.access === "设备转发"
            ? cursor.forwardDeviceId
            : undefined
      cursor = draft.devices.find((n) => n.id === id)
    }
    values =
      source.type === "电池 / BMS"
        ? {
            access: "EMU",
            emuId: source.id,
            forwardDeviceId: undefined,
            emsId: source.emsId,
          }
        : {
            access: "设备转发",
            forwardDeviceId: source.id,
            emuId: undefined,
            emsId: source.emsId,
          }
  } else {
    const port = source.ports?.find((p) => p.id === ref.port)
    if (!port || !portKind(port)) return { error: "请先配置 EMS 接口类型" }
    const kind=portKind(port)
    if(!['ETH','RS485','DI'].includes(kind))return {error:'此接口为预留接口，不能连接通信设备'}
    if(kind==='RS485'&&draft.devices.some(n=>n.id!==target.id&&n.emsId===source.id&&n.interface===port.id&&n.access!=='不接入'&&n.access!=='EMU'&&n.access!=='设备转发'))return {error:'一路 RS485 接口只能连接一个直接接入设备'}
    values = {
      ...(kind==='DI'?{controlPermission:'collect' as const}:{}),
      access: "EMS",
      emsId: source.id,
      interface: port.id,
      protocol:
        portKind(port) === "RS485"
          ? "Modbus RTU"
          : portKind(port) === "CAN"
            ? "CAN"
            : portKind(port) === "DI"
              ? "DI"
              : "Modbus TCP",
      emuId: undefined,
      forwardDeviceId: undefined,
    }
  }
  return {
    patch: {
      devices: draft.devices.map((n) =>
        n.id === target.id ? { ...n, ...values } : n,
      ),
    },
  }
}

/** Embedded meters and TMS are canvas projections; persist edits in their owner. */
export function communicationDraft(draft: ProvisionDraft): ProvisionDraft {
  return {
    ...draft,
    devices: [...draft.devices, ...embeddedCommunicationDevices(draft)],
  }
}
export function persistCanvasPatch(
  original: ProvisionDraft,
  patch: Partial<ProvisionDraft>,
): Partial<ProvisionDraft> {
  if (!patch.devices) return patch
  const beforeProjection = embeddedCommunicationDevices(original)
  const devices = original.devices.map((owner) => {
    const direct = patch.devices!.find((n) => n.id === owner.id) ?? owner
    let result = direct
    for (const [suffix, key] of [
      ["meter", "metering"],
      ["tms", "coolingConfiguration"],
    ] as const) {
      const virtual = patch.devices!.find(
        (n) => n.id === owner.id + ":" + suffix,
      )
      // A direct inspector edit of the nested config is authoritative.
      if (!virtual || direct[key] !== owner[key]) continue
      const before = beforeProjection.find((n) => n.id === virtual.id)
      const fields = [
        "code",
        "name",
        "model",
        "modelId",
        "modelCode",
        "nodeId",
        "enabledState",
        "measurement",
        "digitalInput",
        "manufacturer",
        "enabled",
        "access",
        "forwardDeviceId",
        "protocol",
        "interface",
        "ip",
        "port",
        "address",
        "controlPermission",
        "commX",
        "commY",
        "commWidth",
        "commHeight",
        "emsId",
        "emuId",
      ] as const
      const values = Object.fromEntries(
        fields
          .filter(
            (k) =>
              !Object.is(
                virtual[(k as keyof Device)],
                before?.[(k as keyof Device)],
              ),
          )
          .map((k) => [k, virtual[(k as keyof Device)]]),
      )
      result = { ...result, [key]: { ...result[key], ...values } }
    }
    return result
  })
  return { ...patch, devices }
}

export function arrangeCommunication(
  draft: ProvisionDraft,
): Partial<ProvisionDraft> {
  const expanded = communicationDraft(draft)
  return persistCanvasPatch(draft, {
    devices: expanded.devices.map((d) => {
      if (isStructure(d) || d.type === "标准柜") return d
      const p = canvasPosition(
        expanded,
        { ...d, commX: undefined, commY: undefined },
        "communication",
      )
      return { ...d, commX: p.x, commY: p.y }
    }),
  })
}
