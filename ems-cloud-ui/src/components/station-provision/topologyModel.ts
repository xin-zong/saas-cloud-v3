import { validateTopologyContract } from "./topologyContract";
import { createDevice, newNodeId, type Device, type DeviceType, type ProvisionDraft, type Connection, } from "./model";
import { availableEmus, hasDcPv, portKind, embeddedCommunicationDevices, } from "./deviceConfiguration";
export type TopologyIssue = {
    view?: "electrical" | "communication";
    category?: string;
    severity?: "error" | "warning";
    targetNodeId?: string;
    nodeId: string;
    field: string;
    message: string;
};
export const structuralTypes = [
    "电网",
    "交流母线",
    "直流母线",
    "不可控负载",
    "负载",
    "变压器",
    "断路器",
];
export function isStructure(d: Device) {
    return structuralTypes.includes(d.type);
}
export function canWire(a: Device, b: Device, kind: "AC" | "DC") {
    if (a.id === b.id ||
        a.type === "EMS" ||
        b.type === "EMS" ||
        a.type === "标准柜" ||
        b.type === "标准柜")
        return false;
    if (kind === "AC")
        return ![a.type, b.type].some((t) => ["直流母线", "电池 / BMS", "光伏 DC/DC", "DC充电桩"].includes(t));
    return [a.type, b.type].every((t) => ["PCS", "直流母线", "电池 / BMS", "光伏 DC/DC", "DC充电桩"].includes(t));
}
export function cabinetNodes(count: number, withPv: boolean, emsId: string) {
    const cabinet = createDevice("标准柜", count);
    cabinet.emsId = emsId;
    cabinet.height = 270;
    const pcs = createDevice("PCS", count), bat = createDevice("电池 / BMS", count), bus = createDevice("直流母线", count);
    const nodes = [pcs, bat, bus, createDevice("光伏 DC/DC", count)];
    nodes.forEach((n) => {
        n.cabinetId = cabinet.id;
        n.emsId = emsId;
        n.enabled = true;
        if (n.type === "光伏 DC/DC")
            n.dcPvConfigured = withPv;
        n.access = n.type === "光伏 DC/DC" ? "EMU" : "EMS";
        n.protocol = "Modbus TCP";
        n.interface = "ETH1";
    });
    bat.cooling = true;
    bat.coolingConfiguration = {
        nodeId: newNodeId(), name: "温控设备", enabled: true, access: "设备转发", forwardDeviceId: bat.id
    };
    const pv = nodes.find((n) => n.type === "光伏 DC/DC");
    if (pv)
        pv.emuId = bat.id;
    const connections: Connection[] = nodes
        .filter((n) => n.id !== bus.id)
        .map((n) => ({
        id: newNodeId(), from: bus.id, to: n.id, kind: "DC"
    }));
    return {
        devices: [cabinet, ...nodes], connections, cabinet, pcs
    };
}
export function buildSiteTemplate(template: string): Pick<ProvisionDraft, "devices" | "connections" | "buses" | "template"> {
    if (template === "自定义空白拓扑")
        return {
            template, devices: [], connections: [], buses: []
        };
    const ems = createDevice("EMS", 1);
    ems.x = 86;
    ems.y = 12;
    ems.ports = ["ETH1", "RS485_1"].map((name, i) => ({
        id: name,
        interface: name,
        protocol: i ? "Modbus RTU" : "Modbus TCP",
        role: "客户端 / 主站",
        ip: "",
        port: "502",
        address: "1",
        version: "",
        targets: [],
        baud: "9600",
        parity: "偶校验",
        bits: "8 / 1",
        subnet: "255.255.255.0",
    }));
    const grid = createDevice("电网", 1), meter = createDevice("电表", 1), bus = createDevice("交流母线", 1), load = createDevice("不可控负载", 1);
    grid.x = 50;
    grid.y = 12;
    meter.x = 50;
    meter.y = 28;
    meter.gridId = grid.id;
    meter.emsId = ems.id;
    meter.interface = "RS485_1";
    meter.protocol = "Modbus RTU";
    meter.access = "EMS";
    bus.x = 50;
    bus.y = 30;
    bus.width = 600;
    load.x = 82;
    load.y = 12;
    const devices = [grid, bus, load, ems], connections: Connection[] = [];
    const link = (a: Device, b: Device) => connections.push({
        id: newNodeId(), from: a.id, to: b.id, kind: "AC"
    });
    link(grid, bus);
    grid.metering = {
        nodeId: meter.id, code: meter.code, name: "进线计量", enabled: true, emsId: ems.id, access: "EMS", protocol: meter.protocol, interface: meter.interface, address: meter.address, controlPermission: "collect", measurement: {
            measuredObjectRef: connections[0].id, positiveDirection: "Unspecified"
        }
    };
    link(bus, load);
    for (let i = 1; i <= 1; i++) {
        const group = cabinetNodes(i, template !== "工商业储能", ems.id);
        group.cabinet.x = 50;
        group.cabinet.y = 56;
        devices.push(...group.devices);
        connections.push(...group.connections);
        link(bus, group.pcs);
    }
    if (template === "光储充") {
        const ev = createDevice("充电桩", 1);
        ev.x = 86;
        ev.y = 28;
        ev.access = "不接入";
        ev.enabled = false;
        devices.push(ev);
        link(bus, ev);
    }
    return {
        template, devices, connections, buses: []
    };
}
export function nodePosition(draft: ProvisionDraft, d: Device, index: number): {
    x: number;
    y: number;
} {
    if (d.cabinetId && d.x === undefined && d.y === undefined) {
        const cab = draft.devices.find((n) => n.id === d.cabinetId), x = cab?.x ?? 45, y = cab?.y ?? 65;
        const batteryOffset = Math.min(22, Math.max(0, ((cab?.height ?? 270) - 65 - 42) / 7.4));
        if (d.type === "PCS")
            return {
                x, y: y + 3
            };
        if (d.type === "直流母线")
            return {
                x, y: y + Math.min(12, Math.max(7, batteryOffset - 10))
            };
        const children = draft.devices.filter((n) => n.cabinetId === d.cabinetId &&
            ["电池 / BMS", "光伏 DC/DC"].includes(n.type));
        return {
            x: x + (children.indexOf(d) === 0 ? -8 : 8), y: y + batteryOffset
        };
    }
    return {
        x: d.x ?? 15 + (index % 4) * 22,
        y: d.y ?? 20 + Math.floor(index / 4) * 22,
    };
}
export function splitCabinet(draft: ProvisionDraft, id: string) {
    return {
        devices: draft.devices
            .filter((n) => n.id !== id)
            .map((n) => n.cabinetId === id
            ? {
                ...n,
                ...nodePosition(draft, n, draft.devices.indexOf(n)),
                cabinetId: undefined,
            }
            : n),
        connections: draft.connections ?? [],
    };
}
export function moveNode(draft: ProvisionDraft, id: string, position: {
    x: number;
    y: number;
}) {
    const device = draft.devices.find((n) => n.id === id);
    if (!device)
        return {
            devices: draft.devices
        };
    const before = nodePosition(draft, device, draft.devices.indexOf(device));
    return {
        devices: draft.devices.map((n) => {
            if (n.id === id)
                return {
                    ...n, ...position
                };
            if (n.cabinetId === id)
                return {
                    ...n,
                    x: n.x === undefined ? undefined : n.x + position.x - before.x,
                    y: n.y === undefined ? undefined : n.y + position.y - before.y,
                };
            return n;
        }),
    };
}
export function cloneNode(draft: ProvisionDraft, id: string) {
    const device = draft.devices.find(n => n.id === id);
    if (!device) return {devices:draft.devices,connections:draft.connections??[],selectedId:''};
    const originals = [device,...draft.devices.filter(n=>n.cabinetId===id)];
    const originalIds = new Set(originals.map(n=>n.id));
    const mapping = new Map(originals.map(n=>[n.id,newNodeId()]));
    const nestedIds = new Map<string,string>();
    // References use UI identities. XML identities are renewed independently and
    // aliases to old XML identities are remapped to the corresponding new node.
    for (const n of originals) {
        if(n.nodeId) mapping.set(n.nodeId,mapping.get(n.id)!);
        for(const [key,suffix] of [['metering','meter'],['coolingConfiguration','tms']] as const) {
            const config=n[key];if(!config)continue;
            nestedIds.set(n.id+'/'+key,newNodeId());
            const virtual=mapping.get(n.id)!+':'+suffix;
            mapping.set(n.id+':'+suffix,virtual);
            if(config.nodeId)mapping.set(config.nodeId,virtual);
        }
    }
    const internal=(draft.connections??[]).filter(e=>originalIds.has(e.from)&&originalIds.has(e.to));
    const wireIds=new Map(internal.map(e=>[e.id,newNodeId()]));
    const remap=(value:string|undefined)=>value===undefined?undefined:mapping.get(value)??value;
    function references<T extends Partial<Device>>(value:T):T {
        const next=structuredClone(value);
        return {...next,
            cabinetId:remap(next.cabinetId),emsId:remap(next.emsId),emuId:remap(next.emuId),
            forwardDeviceId:remap(next.forwardDeviceId),gridId:remap(next.gridId),masterEmsId:remap(next.masterEmsId),
            peerEmsIds:next.peerEmsIds?.map(v=>remap(v)!),
            emsPeers:next.emsPeers?.map(p=>({...p,id:remap(p.id)!})),
            measurement:next.measurement?{...next.measurement,measuredObjectRef:wireIds.get(next.measurement.measuredObjectRef)??next.measurement.measuredObjectRef}:undefined,
            // Older drafts used this field before Measurement became structured.
            measuredConnectionId:next.measuredConnectionId?wireIds.get(next.measuredConnectionId)??next.measuredConnectionId:undefined,
        } as T;
    }
    const cabinetNumbers=new Set(draft.devices.filter(n=>n.type==='标准柜').map(n=>Number(n.cabinetNumber)).filter(n=>Number.isSafeInteger(n)&&n>0));
    const codes=new Set(draft.devices.map(n=>n.code));
    const copied:Device[]=originals.map(n=>{
        const pos=nodePosition(draft,n,draft.devices.indexOf(n)),grouped=originalIds.has(n.cabinetId??'');
        const copy=references(n),newId=mapping.get(n.id)!;
        let suffix=draft.devices.length,code=(n.code??n.type)+'-copy-'+suffix;
        while(codes.has(code))code=(n.code??n.type)+'-copy-'+(++suffix);
        codes.add(code);
        copy.id=newId;copy.nodeId=newId;copy.code=code;copy.name=n.name+' 副本';
        if(n.type==='标准柜'){
            let no=1;while(cabinetNumbers.has(no))no++;
            copy.cabinetNumber=String(no);cabinetNumbers.add(no);
        }
        for(const key of ['metering','coolingConfiguration'] as const){
            if(n[key])copy[key]={...references(n[key]!),nodeId:nestedIds.get(n.id+'/'+key)!};
        }
        copy.x=grouped&&n.x===undefined?undefined:pos.x+8;
        copy.y=grouped&&n.y===undefined?undefined:pos.y+8;
        copy.ports=copy.ports?.map(p=>({...p,targets:p.targets.map(target=>{
            const slash=target.indexOf('/');if(slash<0)return remap(target)!;
            return remap(target.slice(0,slash))+target.slice(slash);
        })}));
        return copy;
    });
    return {devices:[...draft.devices,...copied],selectedId:copied[0].id,
        connections:[...(draft.connections??[]),...internal.map(e=>({...structuredClone(e),id:wireIds.get(e.id)!,from:mapping.get(e.from)!,to:mapping.get(e.to)!}))]};
}
/** Shared electrical geometry in canvas pixels; positions remain percentages. */

export function electricalNodeSize(d: Device) {
  return {
    x:
      d.width ??
      (d.type === "标准柜"
        ? 340
        : d.type.includes("母线")
          ? d.cabinetId
            ? 300
            : 720
          : d.type === "ATS"
            ? 342
            : 138),

    y:
      d.height ??
      (d.type === "标准柜" ? 270 : d.type.includes("母线") ? 4 : 58),
  }
}

export function arrangeNodes(draft: ProvisionDraft) {
  // One immutable patch keeps automatic arrangement a single undo operation.

  const devices = draft.devices.map((n) => ({ ...n }))

  const roots = devices.filter(
    (n) =>
      !n.cabinetId ||
      !devices.some((c) => c.id === n.cabinetId && c.type === "标准柜"),
  )

  const cabinets = roots.filter((n) => n.type === "标准柜")

  const put = (n: Device, x: number, y: number) => {
    n.x = x / 10
    n.y = y / 7.4
  }

  const rowWidth = (nodes: Device[]) =>
    nodes.reduce((w, n) => w + electricalNodeSize(n).x + 28, -28)

  const row = (nodes: Device[], center: number, y: number) => {
    let left = center - Math.max(0, rowWidth(nodes)) / 2

    for (const n of nodes) {
      const size = electricalNodeSize(n)
      put(n, left + size.x / 2, y)
      left += size.x + 28
    }
  }

  // Rebuild member layers instead of translating their stale, explicit offsets.

  // Preserve custom symbol sizes and expand enclosing groups only when needed.

  for (const cabinet of cabinets) {
    const members = devices.filter((n) => n.cabinetId === cabinet.id)

    const pcs = members.filter((n) => n.type === "PCS")

    const buses = members.filter((n) => n.type.includes("母线"))

    const leaves = members.filter((n) => !pcs.includes(n) && !buses.includes(n))

    cabinet.width = Math.max(
      electricalNodeSize(cabinet).x,
      rowWidth(pcs) + 40,
      rowWidth(leaves) + 40,
      ...buses.map((n) => electricalNodeSize(n).x + 40),
    )

    const topHeight = Math.max(58, ...pcs.map((n) => electricalNodeSize(n).y))

    const busHeight = buses.reduce(
      (h, n) => h + electricalNodeSize(n).y + 32,
      0,
    )

    const leafHeight = Math.max(
      58,
      ...leaves.map((n) => electricalNodeSize(n).y),
    )

    cabinet.height = Math.max(
      electricalNodeSize(cabinet).y,
      42 + topHeight + 36 + busHeight + leafHeight + 20,
    )
  }

  const upstreamTypes = [
    "电网",
    "柴油发电机",
    "光伏",
    "ATS",
    "变压器",
    "断路器",
  ]

  const upstream = roots.filter((n) => upstreamTypes.includes(n.type))

  const acBuses = roots.filter((n) => n.type === "交流母线")

  const depth = new Map<string, number>(acBuses.map((n) => [n.id, 0]))

  const allowed = new Set([...upstream, ...acBuses].map((n) => n.id))

  const queue = acBuses.map((n) => n.id)

  // Undirected breadth-first traversal accepts arbitrary wire directions and cycles.

  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]

    for (const edge of draft.connections ?? []) {
      if (edge.kind !== "AC") continue

      const next =
        edge.from === id ? edge.to : edge.to === id ? edge.from : undefined

      if (next && allowed.has(next) && !depth.has(next)) {
        depth.set(next, depth.get(id)! + 1)
        queue.push(next)
      }
    }
  }

  for (const n of upstream)
    if (!depth.has(n.id)) depth.set(n.id, n.type === "ATS" ? 1 : 2)

  const maxDepth = Math.max(1, ...upstream.map((n) => depth.get(n.id)!))

  const layerY = new Map<number, number>()

  let layerTop = 40

  for (let level = maxDepth; level >= 1; level--) {
    const height = Math.max(
      58,
      ...upstream
        .filter((n) => depth.get(n.id) === level)
        .map((n) => electricalNodeSize(n).y),
    )

    layerY.set(level, layerTop + height / 2)
    layerTop += height + 62
  }

  const trunkY = layerTop

  const busY = trunkY + Math.max(0, acBuses.length - 1) * 32

  const lower = roots.filter(
    (n) =>
      !cabinets.includes(n) &&
      !upstream.includes(n) &&
      !acBuses.includes(n) &&
      n.type !== "EMS",
  )

  const dcBuses = lower.filter((n) => n.type === "直流母线")

  const dcLeaves = lower.filter((n) =>
    ["电池 / BMS", "光伏 DC/DC", "DC充电桩"].includes(n.type),
  )

  const other = lower.filter(
    (n) => !dcBuses.includes(n) && !dcLeaves.includes(n),
  )

  const cabinetWidth = Math.max(
    0,
    cabinets.reduce((w, n) => w + electricalNodeSize(n).x + 64, -64),
  )

  const lowerWidth = cabinetWidth + (other.length ? rowWidth(other) + 64 : 0)

  const contentWidth = Math.max(
    920,
    lowerWidth + 80,
    rowWidth(dcLeaves) + 80,
    ...[...dcBuses, ...acBuses].map((n) => electricalNodeSize(n).x + 80),
    ...Array.from(
      { length: maxDepth },
      (_, i) =>
        rowWidth(upstream.filter((n) => depth.get(n.id) === i + 1)) + 80,
    ),
  )

  const center = contentWidth / 2

  for (let level = 1; level <= maxDepth; level++)
    row(
      upstream.filter((n) => depth.get(n.id) === level),
      center,
      layerY.get(level)!,
    )

  // ATS source identities determine the source-card alignment.

  const fixed = new Set<string>()

  for (const ats of upstream.filter((n) => n.type === "ATS"))
    for (const edge of draft.connections ?? []) {
      const port =
        edge.from === ats.id
          ? edge.fromPort
          : edge.to === ats.id
            ? edge.toPort
            : undefined

      if (port !== "sourceA" && port !== "sourceB") continue

      const source = upstream.find(
        (n) => n.id === (edge.from === ats.id ? edge.to : edge.from),
      )

      if (!source || source.type === "ATS") continue

      const targetX =
        ats.x! * 10 +
        electricalNodeSize(ats).x * (port === "sourceA" ? -0.25 : 0.25)

      // Wider sources need clear card spacing more than exact terminal alignment.

      if (
        upstream.some(
          (n) =>
            fixed.has(n.id) &&
            n.id !== source.id &&
            Math.abs(source.y! * 7.4 - n.y! * 7.4) <
              (electricalNodeSize(source).y + electricalNodeSize(n).y) / 2 +
                28 &&
            Math.abs(targetX - n.x! * 10) <
              (electricalNodeSize(source).x + electricalNodeSize(n).x) / 2 + 28,
        )
      )
        continue

      put(
        source,
        targetX,

        source.y! * 7.4,
      )
      fixed.add(source.id)
    }

  // Keep independent upstream branches clear of the reserved ATS source slots.

  for (let level = 1; level <= maxDepth; level++) {
    const nodes = upstream.filter((n) => depth.get(n.id) === level),
      placed = nodes.filter((n) => fixed.has(n.id))

    for (const n of nodes.filter((n) => !fixed.has(n.id))) {
      let x = n.x! * 10
      const w = electricalNodeSize(n).x

      while (
        placed.some(
          (p) =>
            Math.abs(x - p.x! * 10) < (w + electricalNodeSize(p).x) / 2 + 28,
        )
      )
        x =
          Math.max(
            ...placed.map((p) => p.x! * 10 + electricalNodeSize(p).x / 2),
          ) +
          28 +
          w / 2

      put(n, x, n.y! * 7.4)
      placed.push(n)
    }
  }

  let left = Math.max(40, center - lowerWidth / 2)

  for (const cabinet of cabinets) {
    const size = electricalNodeSize(cabinet),
      x = left + size.x / 2,
      top = busY + 70

    put(cabinet, x, top + 65)

    const members = devices.filter((n) => n.cabinetId === cabinet.id),
      pcs = members.filter((n) => n.type === "PCS"),
      buses = members.filter((n) => n.type.includes("母线")),
      leaves = members.filter((n) => !pcs.includes(n) && !buses.includes(n))

    const topHeight = Math.max(58, ...pcs.map((n) => electricalNodeSize(n).y))

    row(pcs, x, top + 42 + topHeight / 2)

    let y = top + 42 + topHeight + 36

    for (const bus of buses) {
      put(bus, x, y)
      y += electricalNodeSize(bus).y + 32
    }

    const leafHeight = Math.max(
      58,
      ...leaves.map((n) => electricalNodeSize(n).y),
    )

    row(leaves, x, y + leafHeight / 2)

    left += size.x + 64
  }

  const otherHeight = Math.max(58, ...other.map((n) => electricalNodeSize(n).y))

  row(
    other,
    cabinets.length ? left + Math.max(0, rowWidth(other)) / 2 : center,
    busY + 119 + otherHeight / 2,
  )

  let dcY = Math.max(
    busY + 280,
    busY + 119 + otherHeight + 70,
    ...cabinets.map((n) => n.y! * 7.4 - 65 + electricalNodeSize(n).y + 70),
  )

  for (const bus of dcBuses) {
    put(bus, center, dcY)
    dcY += electricalNodeSize(bus).y + 48
  }

  row(
    dcLeaves,
    center,
    dcY +
      Math.max(58, ...dcLeaves.map((n) => electricalNodeSize(n).y)) / 2 +
      24,
  )

  const allBranches = devices.filter(
    (n) => !acBuses.includes(n) && n.type !== "EMS",
  )

  const right = Math.max(
    contentWidth - 40,
    ...allBranches.map((n) => n.x! * 10 + electricalNodeSize(n).x / 2),
  )

  for (const [i, bus] of acBuses.entries()) {
    bus.width = Math.max(electricalNodeSize(bus).x, right - 40)
    put(bus, 40 + bus.width / 2, trunkY + i * 32)
  }

  row(
    roots.filter((n) => n.type === "EMS"),
    right + 120,
    48,
  )

  return { devices }
}

export function removeNode(draft: ProvisionDraft, id: string) {
    const ids = new Set([
        id,
        ...draft.devices.filter((n) => n.cabinetId === id).map((n) => n.id),
    ]);
    return {
        devices: draft.devices
            .filter((n) => !ids.has(n.id))
            .map((n) => ({
            ...n,
            emsId: ids.has(n.emsId ?? "") ? "" : n.emsId,
            emuId: ids.has(n.emuId ?? "") ? "" : n.emuId,
            gridId: ids.has(n.gridId ?? "") ? "" : n.gridId,
            ports: n.ports?.map((p) => ({
                ...p,
                targets: p.targets.filter((t) => !ids.has(t.split("/")[0])),
            })),
        })),
        connections: draft.connections?.filter((e) => !ids.has(e.from) && !ids.has(e.to)),
    };
}
function validateLegacyTopology(draft: ProvisionDraft): TopologyIssue[] {
    const issues: TopologyIssue[] = [], codes = new Set<string>(), addresses = new Set<string>();
    const add = (d: Device, field: string, message: string) => issues.push({
        nodeId: d.id,
        field,
        message: `${d.code || d.name} · ${message}`,
    });
    if (!draft.devices.length)
        issues.push({
            nodeId: "", field: "", message: "请添加设备并配置电气连接"
        });
    draft.connections?.forEach((e) => {
        const a = draft.devices.find((n) => n.id === e.from), b = draft.devices.find((n) => n.id === e.to);
        if (!a || !b || !canWire(a, b, e.kind))
            issues.push({
                nodeId: e.from,
                field: "connections",
                message: "电气连接失效或 AC/DC 类型不兼容",
            });
    });
    for (const d of draft.devices) {
        if (d.type === "光伏 DC/DC" && !hasDcPv(d))
            continue;
        if (d.cabinetId) {
            const parent = draft.devices.find((n) => n.id === d.cabinetId && n.type === "标准柜");
            if (!parent || parent.emsId !== d.emsId)
                add(d, "emsId", "柜内设备必须使用所属标准柜的 EMS");
        }
        if (!d.code?.trim() || codes.has(d.code.trim()))
            add(d, "code", "节点编号为空或重复");
        codes.add(d.code?.trim() ?? "");
        if (!d.name.trim())
            add(d, "name", "请填写节点名称");
        if (d.type === "标准柜")
            continue;
        if (d.type !== "EMS" &&
            !draft.connections?.some((e) => e.from === d.id || e.to === d.id))
            add(d, "connections", "尚未连接电气拓扑");
        if (isStructure(d))
            continue;
        if (d.type === "EMS") {
            const names = new Set<string>();
            for (const p of d.ports ?? []) {
                if (!p.id || names.has(p.id))
                    add(d, "ports", "接口名称为空或重复");
                names.add(p.id);
                if (!portKind(p))
                    add(d, "ports", "请选择接口类型");
                if (portKind(p) === "RS485" &&
                    ![
                        "1200",
                        "2400",
                        "4800",
                        "9600",
                        "19200",
                        "38400",
                        "57600",
                        "115200",
                    ].includes(p.baud ?? "9600"))
                    add(d, "ports", "串口波特率无效");
            }
            continue;
        }
        if (d.enabled === false || d.access === "不接入")
            continue;
        if (["PCS", "光伏 DC/DC"].includes(d.type) &&
            d.rating &&
            (!Number.isFinite(Number(d.rating)) || Number(d.rating) < 0))
            add(d, "rating", "功率上限必须为非负数");
        if (d.access === "设备转发")
            continue;
        if (d.access === "EMU") {
            if (!availableEmus(draft, d).some((n) => n.id === d.emuId))
                add(d, "emuId", "请选择关联的 EMU");
            continue;
        }
        // Old drafts retain their explicit multi-port model until deliberately reconfigured.
        if (!d.access && d.ports?.length)
            continue;
        const ems = draft.devices.find((n) => n.id === d.emsId && n.type === "EMS");
        const port = ems?.ports?.find((p) => p.id === d.interface);
        if (!port ||
            port.enabled === false ||
            port.purpose === "reserved" ||
            (d.protocol === "Modbus TCP" && portKind(port) !== "ETH") ||
            (d.protocol === "Modbus RTU" && portKind(port) !== "RS485"))
            add(d, "interface", "接入 EMS 接口与通信协议不兼容");
        if (!["Modbus TCP", "Modbus RTU", "DI"].includes(d.protocol))
            add(d, "protocol", "请选择通信协议");
        if (d.protocol === "Modbus TCP" &&
            (!validIp(d.ip) ||
                !/^\d+$/.test(d.port) ||
                +d.port < 1 ||
                +d.port > 65535))
            add(d, "ip", "IP 地址或 TCP 端口无效");
        if (d.protocol !== "DI" &&
            (!/^\d+$/.test(d.address) || +d.address < 1 || +d.address > 247))
            add(d, "address", "Unit ID / 从站地址应为 1–247");
        const key = `${d.emsId}/${d.interface}/${d.protocol === "Modbus TCP"
            ? d.ip.split(".").map(Number).join(".") + ":" + Number(d.port)
            : ""}/${Number(d.address)}`;
        if (addresses.has(key))
            add(d, "address", "相同 EMS 接口的通信地址冲突");
        addresses.add(key);
    }
    return issues;
}
export function validIp(ip: string) {
    return (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split(".").every((x) => +x <= 255));
}
export function validateSiteTopology(draft: ProvisionDraft, scope: "all" | "electrical" | "communication" = "all"): TopologyIssue[] {
    if (draft.topologyMeta)
        return validateTopologyContract(draft).filter(i => scope === 'all' || i.view === scope);
    const electricalFields = new Set([
        "connections",
        "code",
        "name",
        "rating",
        "cabinetId",
    ]);
    const issues: TopologyIssue[] = validateLegacyTopology(draft).map((issue) => ({
        ...issue,
        view: electricalFields.has(issue.field) || !issue.nodeId
            ? "electrical"
            : "communication",
        category: electricalFields.has(issue.field) ? "电气完整性" : "通信配置",
        severity: "error",
    }) as TopologyIssue);
    const add = (d: Device, field: string, message: string, category = "通信配置") => issues.push({
        nodeId: d.id.split(":")[0],
        targetNodeId: d.id,
        field,
        message: (d.code || d.name) + " · " + message,
        view: "communication",
        category,
        severity: "error",
    });
    const nodes = [...draft.devices, ...embeddedCommunicationDevices(draft)];
    const communicationAddresses = new Map<string, string>();
    for (const owner of draft.devices) {
        if (owner.metering?.measuredConnectionId &&
            !draft.connections?.some((e) => e.id === owner.metering!.measuredConnectionId &&
                (e.from === owner.id || e.to === owner.id)))
            issues.push({
                nodeId: owner.id,
                targetNodeId: owner.id + ":meter",
                field: "measuredConnectionId",
                message: (owner.code || owner.name) + " · 计量线路不存在或未连接所属设备",
                view: "electrical",
                category: "计量配置",
                severity: "error",
            });
    }
    const allCodes = new Set(draft.devices.map((n) => n.code));
    for (const n of embeddedCommunicationDevices(draft)) {
        if (!n.code?.trim() || allCodes.has(n.code))
            issues.push({
                nodeId: n.id.split(":")[0],
                targetNodeId: n.id,
                field: "code",
                message: n.name + " · 内嵌设备编号为空或重复",
                view: "electrical",
                category: "设备身份",
                severity: "error",
            });
        allCodes.add(n.code);
    }
    for (const d of nodes) {
        if (d.type === "EMS") {
            if (d.emsRole === "slave" &&
                !draft.devices.some((n) => n.id === d.masterEmsId &&
                    n.id !== d.id &&
                    n.type === "EMS" &&
                    n.emsRole === "master"))
                add(d, "masterEmsId", "请选择有效的主机 EMS", "EMS 关系");
            if (d.peerEmsIds?.some((id) => id === d.id ||
                !draft.devices.some((n) => n.id === id && n.type === "EMS")))
                add(d, "peerEmsIds", "Peers 包含自身或不存在的 EMS", "EMS 关系");
            for (const p of d.ports ?? []) {
                if (p.enabled === false)
                    continue;
                if (p.purpose === "reserved" || portKind(p) === "CAN")
                    continue;
                if (portKind(p) === "ETH" &&
                    p.dhcp === false &&
                    (!validIp(p.ip) || !validIp(p.subnet ?? "")))
                    add(d, "ports", "静态 ETH 接口的 IP / 子网掩码无效");
            }
            continue;
        }
        if (d.enabled === false ||
            d.access === "不接入" ||
            (d.type === "光伏 DC/DC" && !hasDcPv(d)))
            continue;
        if (!isStructure(d) &&
            d.type !== "标准柜" &&
            !draft.devices.some((n) => n.id === d.emsId && n.type === "EMS" && n.enabled !== false) &&
            !(d.ports?.length && !d.access))
            add(d, "emsId", "请选择启用的上级 EMS");
        if (d.access === "EMU" || d.access === "设备转发") {
            const parentId = d.access === "EMU" ? d.emuId : d.forwardDeviceId;
            const parent = nodes.find((n) => n.id === parentId);
            if (!parent ||
                parent.id === d.id ||
                parent.emsId !== d.emsId ||
                parent.enabled === false ||
                parent.access === "不接入" ||
                isStructure(parent) ||
                parent.type === "EMS" ||
                parent.type === "标准柜")
                add(d, d.access === "EMU" ? "emuId" : "forwardDeviceId", parent?.id === d.id
                    ? "禁止转发自引用自身"
                    : "转发设备须启用且属于同一 EMS", "设备转发");
            if (d.controlPermission === "control" &&
                parent &&
                parent.controlPermission !== "control")
                add(d, "controlPermission", "转发上级仅允许采集，当前设备不能启用控制", "控制权限");
            const seen = new Set([d.id]);
            let current = parent?.id === d.id ? undefined : parent;
            while (current) {
                if (seen.has(current.id)) {
                    add(d, "forwardDeviceId", "设备转发存在循环", "设备转发");
                    break;
                }
                seen.add(current.id);
                current = nodes.find((n) => n.id ===
                    (current!.access === "EMU"
                        ? current!.emuId
                        : current!.forwardDeviceId));
            }
        }
        if (d.id.includes(":") && d.access === "EMS") {
            const p = draft.devices
                .find((n) => n.id === d.emsId)
                ?.ports?.find((p) => p.id === d.interface);
            if (!p ||
                p.enabled === false ||
                p.purpose === "reserved" ||
                (d.protocol === "Modbus TCP" && portKind(p) !== "ETH") ||
                (d.protocol === "Modbus RTU" && portKind(p) !== "RS485"))
                add(d, "interface", "内嵌设备接入接口无效");
            if (d.protocol === "Modbus TCP" &&
                (!validIp(d.ip) ||
                    !/^\d+$/.test(d.port) ||
                    +d.port < 1 ||
                    +d.port > 65535))
                add(d, "ip", "内嵌设备 IP 地址或 TCP 端口无效");
            if (!["Modbus TCP", "Modbus RTU", "DI"].includes(d.protocol))
                add(d, "protocol", "请选择内嵌设备通信协议");
        }
        if (!isStructure(d) && d.type !== "标准柜" && d.access === "EMS") {
            if (d.protocol !== "DI" &&
                (!/^\d+$/.test(d.address) || +d.address < 1 || +d.address > 247))
                add(d, "address", "Unit ID / 从站地址应为 1–247");
            const key = [
                d.emsId,
                d.interface,
                d.protocol,
                d.protocol === "Modbus TCP"
                    ? d.ip.split(".").map(Number).join(".") + ":" + Number(d.port)
                    : "",
                Number(d.address),
            ].join("/");
            if (communicationAddresses.has(key))
                add(d, "address", "同一 EMS 接口的设备或内嵌设备通信地址冲突");
            communicationAddresses.set(key, d.id);
            const p = draft.devices
                .find((n) => n.id === d.emsId)
                ?.ports?.find((p) => p.id === d.interface);
            if (p && ["uplink", "peer", "reserved"].includes(p.purpose ?? ""))
                add(d, "interface", "所选 EMS 接口用途不允许设备接入");
        }
        if (d.protocol === "DI" && d.access === "EMS") {
            const p = draft.devices
                .find((n) => n.id === d.emsId)
                ?.ports?.find((p) => p.id === d.interface);
            if (!p || portKind(p) !== "DI")
                add(d, "interface", "DI 设备必须使用 DI 接口");
        }
    }
    return issues.filter((x) => scope === "all" || x.view === scope);
}
