import type { Device, DeviceType, ProvisionDraft, CommunicationPort } from './model';
import { embeddedCommunicationDevices, portKind } from './deviceConfiguration';
import type { TopologyIssue } from './topologyModel';
export const topologyTypes: Partial<Record<DeviceType, string>> = {
    EMS: 'EMS', '电池 / BMS': 'EMU', PCS: 'PCS', '光伏 DC/DC': 'PVDC', 温控设备: 'TMS',
    电表: 'GridMeter', 光伏侧电表: 'PVMeter', 电网: 'ExternalGrid', 交流母线: 'ACBus', 直流母线: 'DCBus',
    ATS: 'ATS', 光伏: 'PVInverter', 柴油发电机: 'DieselGenerator', AC充电桩: 'ACCharger', DC充电桩: 'DCCharger',
    可控负载: 'ControllableLoad', 不可控负载: 'GeneralLoad', 负载: 'GeneralLoad',
};
export const topologyPorts: Record<string, Record<string, 'AC' | 'DC'>> = {
    ExternalGrid: {
        ac: 'AC'
    }, ACBus: {
        bus: 'AC'
    }, DCBus: {
        bus: 'DC'
    }, PCS: {
        ac: 'AC', dc: 'DC'
    }, EMU: {
        dc: 'DC'
    }, PVDC: {
        dc: 'DC'
    },
    ATS: {
        sourceA: 'AC', sourceB: 'AC', common: 'AC'
    }, PVInverter: {
        ac: 'AC'
    }, DieselGenerator: {
        ac: 'AC'
    },
    ACCharger: {
        ac: 'AC'
    }, DCCharger: {
        dc: 'DC'
    }, ControllableLoad: {
        ac: 'AC'
    }, GeneralLoad: {
        ac: 'AC'
    },
    EMS: {}, TMS: {}, GridMeter: {}, PVMeter: {},
};
export const xmlNodeId = (d: Device) => d.nodeId ?? d.id;
export const topologyNodes = (draft: ProvisionDraft) => [...draft.devices.filter(d => d.type !== '标准柜'), ...embeddedCommunicationDevices(draft)];
export const isElectricalStructure = (d: Device) => ['ExternalGrid', 'ACBus', 'DCBus', 'GeneralLoad'].includes(topologyTypes[d.type] ?? '');
export const enabledValue = (d: {
    enabled?: boolean;
    enabledState?: string;
}) => d.enabledState !== undefined && !['true', 'false'].includes(d.enabledState) ? 'Unspecified' : typeof d.enabled === 'boolean' ? String(d.enabled) : d.enabledState ?? 'Unspecified';
export function endpointPort(d: Device, port: string | undefined, kind: 'AC' | 'DC') {
    const type = topologyTypes[d.type] ?? '';
    if (port && port !== 'AC' && port !== 'DC')
        return port;
    if (type === 'ACBus' || type === 'DCBus')
        return 'bus';
    if (type === 'ATS')
        return '';
    return kind === 'AC' ? 'ac' : 'dc';
}
export const interfaceType = (p: CommunicationPort) => (({
    ETH: 'Ethernet', RS485: 'RS485', CAN: 'CAN', DI: 'DigitalInput', DO: 'RelayOutput', LSD: 'LowSideOutput', HSD: 'HighSideOutput', ADC: 'AnalogInput'
} as Record<string, string>)[portKind(p)] ?? '');
export const communicationMode = (d: Device) => d.access === 'EMS' ? 'Direct' : d.access === 'EMU' || d.access === '设备转发' ? 'Forwarded' : d.access === '不接入' ? 'None' : 'Unspecified';
export const viaId = (d: Device) => d.access === 'EMU' ? d.emuId : d.forwardDeviceId;
export const measurementFor = (d: Device) => d.measurement ?? (d.measuredConnectionId ? {
    measuredObjectRef: d.measuredConnectionId, positiveDirection: typeof d.reverse === 'boolean' ? (d.reverse ? 'Endpoint2To1' : 'Endpoint1To2') : 'Unspecified'
} : undefined);
const complete = (v: unknown): v is string => typeof v === 'string' && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/.test(v) && v.trim().length > 0 && !['Unspecified', '请选择', '待选型'].includes(v);
const ipNumber = (ip: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) && ip.split('.').every(s => Number(s) <= 255) ? ip.split('.').reduce((n, s) => (n * 256 + Number(s)) >>> 0, 0) : undefined;
export function networkRange(ip: string, mask: string) {
    const host = ipNumber(ip), bits = ipNumber(mask);
    if (host === undefined || bits === undefined)
        return;
    const inv = (~bits) >>> 0;
    if ((inv & (inv + 1)) !== 0 || bits === 0 || inv < 3)
        return;
    const net = (host & bits) >>> 0, broadcast = (net | inv) >>> 0;
    if (host === net || host === broadcast)
        return;
    return {
        host, net, broadcast, mask: bits
    };
}
/** A file contains local devices and electrically reachable public structure; foreign cabinet buses stay private. */
export function topologyScope(draft: ProvisionDraft, ems: Device) {
    const nodes = topologyNodes(draft), local = new Set(nodes.filter(n => n.id === ems.id || (!isElectricalStructure(n) && n.type !== 'EMS' && n.emsId === ems.id)).map(n => n.id));
    const cabinetOwner = (id: string) => {
        const cabinet = draft.devices.find(g => g.id === id && g.type === '标准柜');
        if (cabinet?.emsId)
            return cabinet.emsId;
        const owners = [...new Set(nodes.filter(n => n.cabinetId === id && n.emsId).map(n => n.emsId))];
        return owners.length === 1 ? owners[0] : undefined;
    };
    const allowed = new Set(nodes.filter(n => isElectricalStructure(n) && (!n.cabinetId || cabinetOwner(n.cabinetId) === ems.id)).map(n => n.id));
    for (const n of nodes)
        if (isElectricalStructure(n) && n.cabinetId && cabinetOwner(n.cabinetId) === ems.id)
            local.add(n.id);
    let changed = true;
    while (changed) {
        changed = false;
        for (const e of draft.connections ?? []) {
            if (local.has(e.from) && allowed.has(e.to) && !local.has(e.to)) {
                local.add(e.to);
                changed = true;
            }
            if (local.has(e.to) && allowed.has(e.from) && !local.has(e.from)) {
                local.add(e.from);
                changed = true;
            }
        }
    }
    return {
        nodes: nodes.filter(n => local.has(n.id)), connections: (draft.connections ?? []).filter(e => local.has(e.from) && local.has(e.to))
    };
}
export function validateTopologyContract(draft: ProvisionDraft, metadata = true): TopologyIssue[] {
    const issues: TopologyIssue[] = [], nodes = topologyNodes(draft), index = new Map(nodes.map(d => [d.id, d])), xmlIds = new Set<string>(), nodeIds = new Set<string>();
    const add = (d: Device | undefined, field: string, message: string, view: 'electrical' | 'communication' = 'communication', category = '配置完整性') => issues.push({
        nodeId: d?.id.split(':')[0] ?? '', targetNodeId: d?.id, field, message: (d?.code || d?.name ? `${d.code || d.name} · ` : '') + message, view, category, severity: 'error'
    });
    if (metadata) {
        const m = draft.topologyMeta;
        for (const [field, value] of Object.entries({
            configSetId: m?.configSetId, revision: m?.revision, siteId: m?.siteId, siteCode: draft.code
        }))
            if (!complete(value))
                add(undefined, field, '请补齐配置元数据 ' + field);
        if (m?.configSetId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m.configSetId))
            add(undefined, 'configSetId', '配置集合 ID 必须为平台生成的 UUID');
        if (m?.revision && !/^[1-9]\d*$/.test(m.revision))
            add(undefined, 'revision', '配置修订号须为正整数');
        if (m?.parametersFile !== undefined && !complete(m.parametersFile))
            add(undefined, 'parametersFile', '关联参数文件名无效');
    }
    const emses = nodes.filter(d => d.type === 'EMS');
    if (!emses.length)
        add(undefined, 'emsId', '至少配置一台 EMS');
    if (draft.topologyMeta?.emsRef && !emses.some(d => xmlNodeId(d) === draft.topologyMeta!.emsRef || d.id === draft.topologyMeta!.emsRef))
        add(undefined, 'emsRef', '本机 EMS 引用不存在');
    const portOwners = new Set<string>(), tcpAddresses = new Set<string>(), serialOwners = new Set<string>(), forwardTypes = new Set<string>();
    for (const d of nodes) {
        const type = topologyTypes[d.type], id = xmlNodeId(d);
        if (d.rating && (!Number.isFinite(Number(d.rating)) || Number(d.rating) < 0))
            add(d, 'rating', '功率/容量必须是非负数', 'electrical');
        if (!type)
            add(d, 'type', '该设备类型尚未在 draft-2 受控字典登记', 'electrical');
        if (!complete(id) || xmlIds.has(id) || nodeIds.has(d.id))
            add(d, 'id', '节点 ID 为空或重复', 'electrical');
        xmlIds.add(id);
        nodeIds.add(d.id);
        if (!complete(d.name))
            add(d, 'name', '节点名称为空或占位', 'electrical');
        if (!['true', 'false'].includes(enabledValue(d)))
            add(d, 'enabled', '启用状态为 Unspecified，不能作为 false 导出', 'electrical');
        if (!isElectricalStructure(d) && (!complete(d.manufacturer) || !complete(d.modelCode)))
            add(d, 'model', '请从适配目录选择厂家与型号，不能使用占位或手填未核验型号', 'electrical');
        if (d.cabinetId && !draft.devices.some(c => c.id === d.cabinetId && c.type === '标准柜'))
            add(d, 'cabinetId', '所属机柜不存在', 'electrical');
        if (d.type === 'EMS') {
            if (!complete(d.emsNumber) || !/^\d+$/.test(d.emsNumber))
                add(d, 'emsNumber', 'EMS 编号须明确填写');
            if (!['master', 'slave', 'standalone'].includes(d.emsRole ?? ''))
                add(d, 'emsRole', 'EMS 运行角色尚未确定');
            const hardwareIds: Record<string, RegExp> = {
                ETH: /^ETH[1-9]\d*$/, RS485: /^RS485_[1-9]\d*$/, CAN: /^CAN[1-9]\d*$/, DI: /^DI[1-9]\d*$/, DO: /^DO[1-9]\d*$/, LSD: /^LSD[1-9]\d*$/, HSD: /^HSD[1-9]\d*$/, ADC: /^ADC[1-9]\d*$/
            };
            const names = new Set<string>();
            for (const p of d.ports ?? []) {
                if (!complete(p.id) || names.has(p.id))
                    add(d, 'ports:' + p.id, '接口 ID 为空或重复');
                names.add(p.id);
                if (!hardwareIds[portKind(p)]?.test(p.id))
                    add(d, 'ports:' + p.id, '硬件接口 ID 与接口类型不符；请使用 ETHn / RS485_n / CANn / DIn 等规范编号');
                if (!interfaceType(p))
                    add(d, 'ports', '接口类型尚未定义');
                if (!complete(p.name ?? p.interface))
                    add(d, 'ports', '接口名称不能为空');
                if (!['true', 'false'].includes(enabledValue(p)))
                    add(d, 'ports', '接口启用状态尚未确定');
                if (portKind(p) === 'ETH' && (p.enabled !== false || p.dhcp !== undefined)) {
                    if (p.dhcp === false && !networkRange(p.ip, p.subnet ?? ''))
                        add(d, 'ports', '静态 IP 与子网掩码无效');
                    if (p.enabled !== false && typeof p.dhcp !== 'boolean')
                        add(d, 'ports', '以太网地址分配模式尚未确定');
                }
                if (portKind(p) === 'RS485' && p.enabled !== false) {
                    const [dataBits, stopBits] = (p.bits ?? '').split('/').map(x => x.trim());
                    if (!['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'].includes(p.baud ?? '') || !['7', '8'].includes(dataBits) || !['1', '2'].includes(stopBits) || !['None', 'Even', 'Odd', '无校验', '偶校验', '奇校验'].includes(p.parity ?? ''))
                        add(d, 'ports', '串口波特率、数据位、校验位与停止位必须完整');
                }
            }
            const peers = d.emsPeers ?? [], ids = new Set<string>();
            for (const peer of peers) {
                if (!complete(peer.id) || peer.id === xmlNodeId(d) || ids.has(peer.id) || !complete(peer.no) || !/^\d+$/.test(peer.no) || !['Master', 'Slave', 'Standalone'].includes(peer.role) || ipNumber(peer.host) === undefined || !/^\d+$/.test(peer.port) || +peer.port < 1 || +peer.port > 65535)
                    add(d, 'emsPeers', 'Peer 必须有唯一 ID、编号、明确角色、有效 IP 和 TCP 端口');
                ids.add(peer.id);
            }
            for (const id of d.peerEmsIds ?? []) {
                const peer = index.get(id);
                if (!peer || peer.type !== 'EMS' || peer.id === d.id || ids.has(xmlNodeId(peer)) || !complete(peer.emsNumber) || ipNumber(peer.ip) === undefined || !/^\d+$/.test(peer.port) || +peer.port < 1 || +peer.port > 65535)
                    add(d, 'peerEmsIds', '其他 EMS 引用或 Peers 网络身份未完整');
                if (peer)
                    ids.add(xmlNodeId(peer));
            }
            continue;
        }
        if (isElectricalStructure(d))
            continue;
        const mode = communicationMode(d), ems = index.get(d.emsId ?? '');
        if (!ems || ems.type !== 'EMS')
            add(d, 'emsId', '设备必须归属本机 EMS');
        if (!['collect', 'control'].includes(d.controlPermission ?? ''))
            add(d, 'controlPermission', '控制权限为 Unspecified，须明确只采集或允许控制');
        if (mode === 'Unspecified')
            add(d, 'access', '通信方式尚未确定，不能用停用代替');
        if (mode === 'None' && d.controlPermission !== 'collect')
            add(d, 'controlPermission', '不通信必须明确 controlEnabled=false');
        if (mode === 'Direct') {
            const p = ems?.ports?.find(p => p.id === d.interface);
            if (!p || enabledValue(p) !== 'true')
                add(d, 'interface', '接入接口不存在或未启用');
            if (d.protocol === 'DI') {
                if (p && portKind(p) !== 'DI')
                    add(d, 'interface', 'DI 状态输入须接 DigitalInput 接口');
                if (d.controlPermission !== 'collect')
                    add(d, 'controlPermission', 'DI 输入不具备控制输出能力，必须只采集');
                if (!d.digitalInput || !['High', 'Low'].includes(d.digitalInput.activeLevel) || !complete(d.digitalInput.signalMeaning))
                    add(d, 'digitalInput', 'DI 必须明确有效电平和信号含义');
            }
            else if (d.protocol === 'Modbus TCP' || d.protocol === 'Modbus RTU') {
                if (p && portKind(p) !== (d.protocol === 'Modbus TCP' ? 'ETH' : 'RS485'))
                    add(d, 'interface', '通信协议与接口类型不匹配');
                if (!/^\d+$/.test(d.address) || +d.address < 1 || +d.address > 247)
                    add(d, 'address', 'Unit ID / 从站地址应为 1–247');
                if (d.protocol === 'Modbus TCP') {
                    const host = ipNumber(d.ip), range = p?.dhcp === false ? networkRange(p.ip, p.subnet ?? '') : undefined;
                    if (host === undefined || (p?.dhcp !== true && (!range || ((host & range.mask) >>> 0) !== range.net || host === range.host || host === range.net || host === range.broadcast)))
                        add(d, 'ip', '设备 IP 无效或不在所选接口可达网段，不能使用接口本机/网络/广播地址');
                    if (!/^\d+$/.test(d.port) || +d.port < 1 || +d.port > 65535)
                        add(d, 'port', 'TCP 端口须为 1–65535');
                    const key = [d.emsId, host, Number(d.port), Number(d.address)].join('/');
                    if (tcpAddresses.has(key))
                        add(d, 'address', 'TCP 设备地址重复');
                    tcpAddresses.add(key);
                }
                else {
                    const key = d.emsId + '/' + d.interface;
                    if (serialOwners.has(key))
                        add(d, 'interface', '一路 RS485 只允许接一个设备，即使从站地址不同');
                    serialOwners.add(key);
                }
            }
            else
                add(d, 'protocol', '直连协议未登记；CAN 仅预留，不能视为可运行协议');
        }
        if (mode === 'Forwarded') {
            const parent = index.get(viaId(d) ?? '') ?? nodes.find(n => xmlNodeId(n) === viaId(d)), key = viaId(d) + '/' + type;
            if (forwardTypes.has(key))
                add(d, 'forwardDeviceId', '每个转发提供者下同一种受控 type 最多一台');
            forwardTypes.add(key);
            if (d.controlPermission === 'control' && parent && parent.controlPermission !== 'control')
                add(d, 'controlPermission', '转发上级仅允许采集，不能通过此路径启用控制');
            const seen = new Set([d.id]);
            let current = parent, valid = false;
            while (current) {
                if (seen.has(current.id) || current.emsId !== d.emsId || isElectricalStructure(current) || current.type === 'EMS')
                    break;
                seen.add(current.id);
                const upper = communicationMode(current);
                if (upper === 'Direct') {
                    valid = true;
                    break;
                }
                if (upper !== 'Forwarded')
                    break;
                current = index.get(viaId(current) ?? '') ?? nodes.find(n => xmlNodeId(n) === viaId(current!));
            }
            if (!valid)
                add(d, 'forwardDeviceId', '转发必须无自引用/循环并最终到达同一 EMS 的 Direct 入口');
        }
        if (type === 'GridMeter' || type === 'PVMeter') {
            const m = measurementFor(d);
            if (!m || !draft.connections?.some(e => e.id === m.measuredObjectRef) || !['Endpoint1To2', 'Endpoint2To1'].includes(m.positiveDirection))
                add(d, 'measurement', '计量设备必须绑定有效电气线路及明确正方向', 'electrical', '计量配置');
            const wire = draft.connections?.find(e => e.id === m?.measuredObjectRef);
            if (wire && [wire.from, wire.to].some(id => {
                const endpoint = index.get(id);
                return endpoint && !isElectricalStructure(endpoint) && endpoint.emsId !== d.emsId;
            }))
                add(d, 'measurement', '测量线路不在本机 EMS 的电气导出范围内', 'electrical', '计量配置');
        }
    }
    for (const d of nodes) {
        if (Object.keys(topologyPorts[topologyTypes[d.type] ?? ''] ?? {}).length && !draft.connections?.some(e => e.from === d.id || e.to === d.id))
            add(d, 'connections', '具备电气端口的节点尚未接入电气连线', 'electrical');
    }
    const wireIds = new Set<string>();
    for (const e of draft.connections ?? []) {
        const from = index.get(e.from), to = index.get(e.to), a = from && endpointPort(from, e.fromPort, e.kind), b = to && endpointPort(to, e.toPort, e.kind);
        if (!complete(e.id) || wireIds.has(e.id))
            add(from, 'connections', '电气连线 ID 为空或重复', 'electrical');
        wireIds.add(e.id);
        if (!from || !to || from.id === to.id || !a || !b || !topologyPorts[topologyTypes[from.type] ?? '']?.[a] || topologyPorts[topologyTypes[from.type] ?? '']?.[a] !== topologyPorts[topologyTypes[to.type] ?? '']?.[b] || topologyPorts[topologyTypes[from.type] ?? '']?.[a] !== e.kind)
            add(from, 'connections', '电气端点不存在、端口未明确或 AC/DC 域不匹配', 'electrical');
        if (from && !a)
            add(from, 'fromPort', '请选择明确的设备起点端口', 'electrical');
        if (to && !b)
            add(to, 'toPort', '请选择明确的设备终点端口', 'electrical');
        for (const [n, port] of [[from, a], [to, b]] as const) {
            if (!n || !port || port === 'bus')
                continue;
            const key = n.id + '/' + port;
            if (portOwners.has(key))
                add(n, 'connections', '设备端口 ' + port + ' 已被其他连线占用', 'electrical');
            portOwners.add(key);
        }
    }
    const cabinetNos = new Set<string>(), groupIds = new Set<string>(), groups = draft.devices.filter(d => d.type === '标准柜');
    for (const g of groups) {
        if (groupIds.has(g.id) || xmlIds.has(g.id))
            add(g, 'id', '机柜 Group ID 重复或与 Node ID 冲突', 'electrical');
        groupIds.add(g.id);
        if (!complete(g.cabinetNumber) || !/^[1-9]\d*$/.test(g.cabinetNumber) || cabinetNos.has(g.cabinetNumber))
            add(g, 'cabinetNumber', '机柜 cabinetNo 须为唯一正整数', 'electrical');
        cabinetNos.add(g.cabinetNumber ?? '');
        if (!complete(g.name) || !complete(g.id))
            add(g, 'name', '机柜 ID 与名称必须完整', 'electrical');
    }
    const exportedNodes = new Set<string>();
    for (const ems of emses) {
        const scope = topologyScope(draft, ems), wireIds = new Set(scope.connections.map(e => e.id));
        for (const n of scope.nodes) {
            exportedNodes.add(n.id);
            const m = measurementFor(n);
            if (m && !wireIds.has(m.measuredObjectRef))
                add(n, 'measurement', '测量线路不属于本机 EMS 文件范围，禁止省略 Measurement', 'electrical', '计量配置');
        }
    }
    for (const n of nodes) {
        if (!exportedNodes.has(n.id))
            add(n, 'connections', '未确定所属 EMS，或未接入本站设备拓扑；节点不在任何目标 EMS 导出范围内', 'electrical', '导出范围');
    }
    for (const g of groups) {
        const owners = new Set(nodes.filter(n => n.cabinetId === g.id && n.emsId).map(n => n.emsId));
        if (owners.size > 1 || (g.emsId && [...owners].some(id => id !== g.emsId)))
            add(g, 'emsId', '一个机柜不能横跨不同 EMS；柜内结构与设备归属须一致');
    }
    return issues;
}
