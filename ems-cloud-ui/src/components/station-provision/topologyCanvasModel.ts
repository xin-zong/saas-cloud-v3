import { newNodeId, type Device, type ProvisionDraft } from "./model"
import { canWire, isStructure, moveNode, nodePosition } from "./topologyModel"
import { embeddedCommunicationDevices, portKind } from "./deviceConfiguration"

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
