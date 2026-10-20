import reference from './industrial-reference.json';
import { createDevice, emptyProvision, type CommunicationPort, type Device, type DeviceType, type EmbeddedConfiguration, type ProvisionDraft } from './model';
// User-supplied local configuration example. This does not register a real station,
// declare device adaptation, or publish any configuration to an EMS.
export function createIndustrialReference(): ProvisionDraft {
    const source = structuredClone(reference);
    const typeMap: Record<string, DeviceType> = { EMS: 'EMS', ExternalGrid: '电网', ACBus: '交流母线', DCBus: '直流母线', PCS: 'PCS', EMU: '电池 / BMS', PVDC: '光伏 DC/DC', TMS: '温控设备', GridMeter: '电表' };
    type ReferenceNode = {
        id: string;
        type: string;
        name: string;
        enabled: string;
        manufacturer?: string;
        modelCode?: string;
        identity?: {
            no: string;
            role: string;
        };
        communication?: {
            mode: string;
            controlEnabled: string;
            viaRef?: string;
        };
        connection?: {
            protocol: string;
            interfaceRef: string;
            host?: string;
            port?: string;
            unitId: string;
        };
        measurement?: {
            measuredObjectRef: string;
            positiveDirection: string;
        };
    };
    function convert(node: ReferenceNode): Device {
        const n = createDevice(typeMap[node.type], 1), c = node.connection;
        Object.assign(n, { id: node.id, code: node.id, name: node.name, enabled: node.enabled === 'true', enabledState: node.enabled, manufacturer: node.manufacturer, modelCode: node.modelCode, model: node.modelCode ?? '', emsId: source.emsRef, controlPermission: node.communication?.controlEnabled === 'true' ? 'control' : 'collect', access: node.communication?.mode === 'Forwarded' ? '设备转发' : node.communication?.mode === 'None' ? '不接入' : 'EMS', forwardDeviceId: node.communication?.viaRef, protocol: c?.protocol === 'ModbusTcp' ? 'Modbus TCP' : c?.protocol === 'ModbusRtu' ? 'Modbus RTU' : '', interface: c?.interfaceRef ?? '', ip: c?.host ?? '', port: c?.port ?? '', address: c?.unitId ?? '' });
        if (node.measurement)
            n.measurement = { measuredObjectRef: node.measurement.measuredObjectRef, positiveDirection: node.measurement.positiveDirection as 'Endpoint1To2' | 'Endpoint2To1' };
        if (source.group.members.includes(node.id))
            n.cabinetId = source.group.id;
        if (node.type === 'EMS') {
            n.emsNumber = node.identity?.no;
            n.emsRole = node.identity?.role === 'Master' ? 'master' : 'standalone';
            n.emsPeers = [];
        }
        return n;
    }
    const nodes = source.nodes.map(convert), grid = nodes.find(n => n.id === 'GRID01')!, battery = nodes.find(n => n.id === 'EMU01')!;
    function embedded(n: Device): EmbeddedConfiguration {
        return { nodeId: n.id, code: n.code, name: n.name, manufacturer: n.manufacturer, modelCode: n.modelCode, model: n.model, enabled: n.enabled, enabledState: n.enabledState, emsId: n.emsId, access: n.access, forwardDeviceId: n.forwardDeviceId, protocol: n.protocol, interface: n.interface, ip: n.ip, port: n.port, address: n.address, controlPermission: n.controlPermission, measurement: n.measurement };
    }
    grid.metering = embedded(nodes.find(n => n.id === 'METER01')!);
    battery.cooling = true;
    battery.coolingConfiguration = embedded(nodes.find(n => n.id === 'TMS01')!);
    const ems = nodes.find(n => n.id === source.emsRef)!;
    ems.ports = source.interfaces.map(p => {
        const network = 'network' in p ? p.network : undefined, serial = 'serial' in p ? p.serial : undefined;
        return { id: p.id, name: p.name, kind: p.type === 'Ethernet' ? 'ETH' : 'RS485', enabled: p.enabled === 'true', enabledState: p.enabled, interface: p.id, protocol: p.type === 'Ethernet' ? 'Modbus TCP' : 'Modbus RTU', purpose: p.id === 'ETH1' ? 'uplink' : 'device', role: '客户端 / 主站', dhcp: network?.mode === 'DHCP', ip: network?.ip ?? '', subnet: network?.subnetMask ?? '', port: '502', address: '1', version: '', targets: [], baud: serial?.baudRate ?? '', parity: serial?.parity === 'None' ? '无校验' : serial?.parity ?? '', bits: serial ? `${serial.dataBits} / ${serial.stopBits}` : '' } as CommunicationPort;
    });
    const cabinet = { ...createDevice('标准柜', 1), id: source.group.id, code: source.group.id, name: source.group.name, cabinetNumber: source.group.cabinetNo, emsId: source.emsRef, x: 50, y: 60, width: 400, height: 290 };
    const devices = [...nodes.filter(n => !['METER01', 'TMS01'].includes(n.id)), cabinet];
    const positions: Record<string, [
        number,
        number
    ]> = { EMS01: [85, 12], GRID01: [50, 12], ACBUS01: [50, 28], DCBUS01: [50, 71], PCS01: [50, 59], EMU01: [41, 82], DCDC01: [59, 82] };
    devices.forEach(n => { if (positions[n.id])
        [n.x, n.y] = positions[n.id]; n.commX = n.type === 'EMS' ? 50 : n.id === 'PCS01' ? 25 : n.id === 'EMU01' ? 65 : 80; n.commY = n.type === 'EMS' ? 15 : n.id === 'DCDC01' ? 75 : 48; });
    return { ...emptyProvision(), template: '工商业储能', name: source.siteName, code: source.siteCode, region: '亚洲', address: '本地配置参考示例', topologyMeta: { configSetId: source.configSetId, siteId: source.siteId, revision: source.revision, emsRef: source.emsRef }, devices, buses: [], connections: source.wires.map(w => ({ id: w.id, from: w.ends[0][0], fromPort: w.ends[0][1], to: w.ends[1][0], toPort: w.ends[1][1], kind: w.ends.some(e => e[1] === 'dc') ? 'DC' : 'AC' })) };
}
