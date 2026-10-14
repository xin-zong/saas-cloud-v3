import { createDevice, newNodeId, type Device, type DeviceType, type ProvisionDraft, type Connection, } from "./model";
export type TopologyIssue = {
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
        return ![a.type, b.type].some((t) => ["直流母线", "电池 / BMS", "光伏 DC/DC"].includes(t));
    return [a.type, b.type].every((t) => ["PCS", "直流母线", "电池 / BMS", "光伏 DC/DC"].includes(t));
}
export function cabinetNodes(count: number, withPv: boolean, emsId: string) {
    const cabinet = createDevice("标准柜", count);
    cabinet.emsId = emsId;
    const pcs = createDevice("PCS", count), bat = createDevice("电池 / BMS", count), bus = createDevice("直流母线", count);
    const nodes = [pcs, bat, bus, createDevice("光伏 DC/DC", count)];
    nodes.forEach((n) => {
        n.cabinetId = cabinet.id;
        n.emsId = emsId;
        n.enabled = n.type !== "光伏 DC/DC" || withPv;
        n.access = n.type === "光伏 DC/DC" ? "EMU" : "EMS";
        n.protocol = "Modbus TCP";
        n.interface = "ETH-1";
    });
    bat.cooling = false;
    const pv = nodes.find((n) => n.type === "光伏 DC/DC");
    if (pv)
        pv.emuId = bat.id;
    const connections: Connection[] = nodes
        .filter((n) => n.id !== bus.id)
        .map((n) => ({ id: newNodeId(), from: bus.id, to: n.id, kind: "DC" }));
    return { devices: [cabinet, ...nodes], connections, cabinet, pcs };
}
export function buildSiteTemplate(template: string): Pick<ProvisionDraft, "devices" | "connections" | "buses" | "template"> {
    if (template === "自定义空白拓扑")
        return { template, devices: [], connections: [], buses: [] };
    const ems = createDevice("EMS", 1);
    ems.x = 86;
    ems.y = 12;
    ems.ports = ["ETH-1", "RS485-1"].map((name, i) => ({
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
    meter.interface = "RS485-1";
    meter.protocol = "Modbus RTU";
    meter.access = "EMS";
    bus.x = 50;
    bus.y = 40;
    load.x = 72;
    load.y = 60;
    const devices = [grid, meter, bus, load, ems], connections: Connection[] = [];
    const link = (a: Device, b: Device) => connections.push({ id: newNodeId(), from: a.id, to: b.id, kind: "AC" });
    link(grid, meter);
    link(meter, bus);
    link(bus, load);
    for (let i = 1; i <= 1; i++) {
        const group = cabinetNodes(i, template !== "工商业储能", ems.id);
        group.cabinet.x = i === 1 ? 28 : 73;
        group.cabinet.y = 66;
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
    return { template, devices, connections, buses: [] };
}
export function nodePosition(draft: ProvisionDraft, d: Device, index: number): {
    x: number;
    y: number;
} {
    if (d.cabinetId && d.x === undefined && d.y === undefined) {
        const cab = draft.devices.find(n => n.id === d.cabinetId), x = cab?.x ?? 45, y = cab?.y ?? 65;
        if (d.type === 'PCS')
            return { x, y: y - 4 };
        if (d.type === '直流母线')
            return { x, y: y + 7 };
        const children = draft.devices.filter(n => n.cabinetId === d.cabinetId && ['电池 / BMS', '光伏 DC/DC'].includes(n.type));
        return { x: x + (children.indexOf(d) === 0 ? -8 : 8), y: y + 17 };
    }
    return { x: d.x ?? 15 + (index % 4) * 22, y: d.y ?? 20 + Math.floor(index / 4) * 22 };
}
export function splitCabinet(draft: ProvisionDraft, id: string) {
    return { devices: draft.devices.filter(n => n.id !== id).map(n => n.cabinetId === id ? { ...n, ...nodePosition(draft, n, draft.devices.indexOf(n)), cabinetId: undefined } : n), connections: draft.connections ?? [] };
}
export function moveNode(draft: ProvisionDraft, id: string, position: {
    x: number;
    y: number;
}) {
    const device = draft.devices.find(n => n.id === id);
    if (!device)
        return { devices: draft.devices };
    const before = nodePosition(draft, device, draft.devices.indexOf(device));
    return { devices: draft.devices.map(n => {
            if (n.id === id)
                return { ...n, ...position };
            if (n.cabinetId === id)
                return {
                    ...n,
                    x: n.x === undefined ? undefined : n.x + position.x - before.x,
                    y: n.y === undefined ? undefined : n.y + position.y - before.y,
                };
            return n;
        }) };
}
export function cloneNode(draft: ProvisionDraft, id: string) {
    const device = draft.devices.find(n => n.id === id);
    if (!device)
        return { devices: draft.devices, connections: draft.connections ?? [], selectedId: '' };
    const originals = [device, ...draft.devices.filter(n => n.cabinetId === id)];
    const mapping = new Map(originals.map(n => [n.id, newNodeId()]));
    const copied = originals.map(n => {
        const pos = nodePosition(draft, n, draft.devices.indexOf(n));
        const grouped = mapping.has(n.cabinetId ?? '');
        return {
            ...n, id: mapping.get(n.id)!, code: `${n.code}-copy-${draft.devices.length}`,
            name: `${n.name} 副本`, cabinetId: mapping.get(n.cabinetId ?? '') ?? n.cabinetId,
            emuId: mapping.get(n.emuId ?? '') ?? n.emuId,
            x: grouped && n.x === undefined ? undefined : pos.x + 8,
            y: grouped && n.y === undefined ? undefined : pos.y + 8,
            ports: n.ports?.map(p => ({ ...p, targets: [] })),
        };
    });
    return {
        devices: [...draft.devices, ...copied], selectedId: copied[0].id,
        connections: [...(draft.connections ?? []), ...(draft.connections ?? [])
                .filter(e => mapping.has(e.from) && mapping.has(e.to))
                .map(e => ({ ...e, id: newNodeId(), from: mapping.get(e.from)!, to: mapping.get(e.to)! }))],
    };
}
export function arrangeNodes(draft: ProvisionDraft) {
    let arranged = draft;
    const roots = draft.devices.filter(n => !n.cabinetId);
    const cabinets = roots.filter(n => n.type === '标准柜');
    const standalone = roots.filter(n => n.type !== '标准柜');
    for (const [i, n] of standalone.entries()) {
        const rows = Math.ceil(standalone.length / 3);
        const position = { x: 20 + i % 3 * 30, y: 14 + Math.floor(i / 3) * (36 / Math.max(1, rows - 1)) };
        arranged = { ...arranged, ...moveNode(arranged, n.id, position) };
    }
    for (const [i, n] of cabinets.entries()) {
        // Keep the group intact and within the canvas when arranging several cabinets.
        const rows = Math.ceil(cabinets.length / 3);
        const position = { x: 18 + i % 3 * 32, y: 60 + Math.floor(i / 3) * (20 / Math.max(1, rows - 1)) };
        arranged = { ...arranged, ...moveNode(arranged, n.id, position) };
    }
    return { devices: arranged.devices };
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
export function validateSiteTopology(draft: ProvisionDraft): TopologyIssue[] {
    const issues: TopologyIssue[] = [], codes = new Set<string>(), addresses = new Set<string>();
    const add = (d: Device, field: string, message: string) => issues.push({
        nodeId: d.id,
        field,
        message: `${d.code || d.name} · ${message}`,
    });
    if (!draft.devices.length)
        issues.push({ nodeId: "", field: "", message: "请添加设备并配置电气连接" });
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
        if (d.cabinetId) {
            const parent = draft.devices.find(n => n.id === d.cabinetId && n.type === '标准柜');
            if (!parent || parent.emsId !== d.emsId)
                add(d, 'emsId', '柜内设备必须使用所属标准柜的 EMS');
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
                if (p.interface.startsWith("RS485") &&
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
        if (d.access === "EMU") {
            if (!draft.devices.some((n) => n.id === d.emuId && n.type === "电池 / BMS" && n.enabled !== false))
                add(d, "emuId", "请选择关联的 EMU");
            continue;
        }
        // Old drafts retain their explicit multi-port model until deliberately reconfigured.
        if (!d.access && d.ports?.length)
            continue;
        const ems = draft.devices.find((n) => n.id === d.emsId && n.type === "EMS");
        const port = ems?.ports?.find((p) => p.id === d.interface);
        if (!port ||
            (d.protocol === "Modbus TCP" && !port.interface.startsWith("ETH")) ||
            (d.protocol === "Modbus RTU" && !port.interface.startsWith("RS485")))
            add(d, "interface", "接入 EMS 接口与通信协议不兼容");
        if (!["Modbus TCP", "Modbus RTU"].includes(d.protocol))
            add(d, "protocol", "请选择通信协议");
        if (d.protocol === "Modbus TCP" &&
            (!validIp(d.ip) ||
                !/^\d+$/.test(d.port) ||
                +d.port < 1 ||
                +d.port > 65535))
            add(d, "ip", "IP 地址或 TCP 端口无效");
        if (!/^\d+$/.test(d.address) || +d.address < 1 || +d.address > 247)
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
