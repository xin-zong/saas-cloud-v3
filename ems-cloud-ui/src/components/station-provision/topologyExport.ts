import type { Device, ProvisionDraft } from './model';
import { type ProvisionModel } from './deviceConfiguration';
import { type TopologyIssue } from './topologyModel';
import { communicationMode, enabledValue, endpointPort, interfaceType, isElectricalStructure, measurementFor, topologyNodes, topologyTypes, topologyScope, validateTopologyContract, viaId, xmlNodeId } from './topologyContract';
export type TopologyExport = {
    files: {
        emsId: string;
        emsCode: string;
        filename: string;
        xml: string;
    }[];
    issues: TopologyIssue[];
    pending: string[];
    blocked: boolean;
};
const escapeXml = (value: unknown) => String(value ?? '').replace(/[<>&"']/g, c => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'
}[c]!));
const attrs = (value: Record<string, unknown>) => Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => k + '="' + escapeXml(v) + '"').join(' ');
const tag = (name: string, values: Record<string, unknown>, indent = '') => indent + '<' + name + (Object.keys(values).length ? ' ' + attrs(values) : '') + ' />';
const parity = (value: string | undefined) => ({
    '无校验': 'None', '偶校验': 'Even', '奇校验': 'Odd'
}[value ?? ''] ?? value);
export function exportTopologyByEms(draft: ProvisionDraft, models?: ProvisionModel[]): TopologyExport {
    const issues = validateTopologyContract(draft), pending: string[] = [];
    const nodes = topologyNodes(draft), emses = nodes.filter(n => n.type === 'EMS');
    const xmlIdFor = (id: string | undefined) => {
        const n = nodes.find(n => n.id === id || xmlNodeId(n) === id);
        return n ? xmlNodeId(n) : id;
    };
    if (nodes.some(n => n.protocol === 'Modbus TCP' && nodes.find(e => e.id === n.emsId)?.ports?.find(p => p.id === n.interface)?.dhcp === true))
        pending.push('DHCP 接口无法静态确认设备网段，设备实际可达性须现场核验。');
    if (!models)
        pending.push('当前文件通过结构与引用校验；设备适配、厂家型号对应关系及现场接入仍需平台登记资料确认。');
    if (draft.topologyMeta?.parametersFile === undefined)
        pending.push('未生成运行参数文件，本次不输出 RelatedFiles 参数文件引用。');
    pending.push('status=Draft 表示配置草稿；不表示云端下发、现场生效或设备适配认证。');
    const blocked = issues.some(i => i.severity !== 'warning');
    const files = blocked ? [] : emses.map(ems => {
        const scope = topologyScope(draft, ems), selected = scope.nodes, wires = scope.connections;
        const selectedWires = new Set(wires.map(e => e.id)), groups = draft.devices.filter(g => g.type === '标准柜' && selected.some(n => n.cabinetId === g.id));
        const nodeXml = (d: Device) => {
            const type = topologyTypes[d.type]!, lines = ['    <Node ' + attrs({
                    id: xmlNodeId(d), type, name: d.name, enabled: enabledValue(d), ...(!isElectricalStructure(d) ? {
                        manufacturer: d.manufacturer, modelCode: d.modelCode
                    } : {})
                }) + '>'];
            if (d.type === 'EMS') {
                lines.push(tag('EmsIdentity', {
                    no: d.emsNumber, role: {
                        master: 'Master', slave: 'Slave', standalone: 'Standalone'
                    }[d.emsRole!]
                }, '      '), '      <Interfaces>');
                for (const p of d.ports ?? []) {
                    const child: string[] = [];
                    if (interfaceType(p) === 'Ethernet' && p.dhcp !== undefined)
                        child.push(tag('Network', p.dhcp ? {
                            mode: 'DHCP'
                        } : {
                            mode: 'Static', ip: p.ip, subnetMask: p.subnet
                        }, '          '));
                    if (interfaceType(p) === 'RS485' && p.enabled !== false) {
                        const [dataBits, stopBits] = (p.bits ?? '').split('/').map(x => x.trim());
                        child.push(tag('SerialSettings', {
                            baudRate: p.baud, dataBits, parity: parity(p.parity), stopBits
                        }, '          '));
                    }
                    const values = {
                        id: p.id, type: interfaceType(p), name: p.name ?? p.interface, enabled: enabledValue(p)
                    };
                    lines.push(child.length ? '        <Interface ' + attrs(values) + '>\n' + child.join('\n') + '\n        </Interface>' : tag('Interface', values, '        '));
                }
                lines.push('      </Interfaces>');
            }
            else if (!isElectricalStructure(d)) {
                const measurement = measurementFor(d);
                if (measurement && selectedWires.has(measurement.measuredObjectRef))
                    lines.push(tag('Measurement', measurement, '      '));
                const mode = communicationMode(d), common = {
                    mode, controlEnabled: d.controlPermission === 'control' ? 'true' : 'false'
                };
                if (mode === 'Forwarded')
                    lines.push(tag('Communication', {
                        mode, viaRef: xmlIdFor(viaId(d)), controlEnabled: common.controlEnabled
                    }, '      '));
                else if (mode === 'None')
                    lines.push(tag('Communication', common, '      '));
                else {
                    lines.push('      <Communication ' + attrs(common) + '>');
                    if (d.protocol === 'DI')
                        lines.push(tag('DigitalInput', {
                            interfaceRef: d.interface, activeLevel: d.digitalInput?.activeLevel, signalMeaning: d.digitalInput?.signalMeaning
                        }, '        '));
                    else
                        lines.push(tag('Connection', d.protocol === 'Modbus TCP' ? {
                            protocol: 'ModbusTcp', interfaceRef: d.interface, host: d.ip, port: d.port, unitId: d.address
                        } : {
                            protocol: 'ModbusRtu', interfaceRef: d.interface, unitId: d.address
                        }, '        '));
                    lines.push('      </Communication>');
                }
            }
            if (lines.length === 1)
                return tag('Node', {
                    id: xmlNodeId(d), type, name: d.name, enabled: enabledValue(d)
                }, '    ');
            return [...lines, '    </Node>'].join('\n');
        };
        const explicitPeers = ems.emsPeers ?? [], localPeers = (ems.peerEmsIds ?? []).map(id => nodes.find(n => n.id === id)).filter((n): n is Device => !!n).map(n => ({
            id: xmlNodeId(n), no: n.emsNumber, role: {
                master: 'Master', slave: 'Slave', standalone: 'Standalone'
            }[n.emsRole!], host: n.ip, port: n.port
        }));
        const peers = [...explicitPeers, ...localPeers.filter(p => !explicitPeers.some(e => e.id === p.id))];
        const meta = draft.topologyMeta!;
        const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<SiteTopology ' + attrs({
                schemaVersion: 'draft-2', status: 'Draft', configSetId: meta.configSetId, revision: meta.revision, siteId: meta.siteId, siteCode: draft.code, emsRef: xmlNodeId(ems)
            }) + '>'];
        if (meta.parametersFile)
            lines.push(tag('RelatedFiles', {
                parameters: meta.parametersFile
            }, '  '));
        lines.push('  <Nodes>', ...selected.map(nodeXml), '  </Nodes>');
        lines.push(peers.length ? '  <Peers>\n' + peers.map(p => tag('Ems', p, '    ')).join('\n') + '\n  </Peers>' : '  <Peers />');
        lines.push('  <ElectricalConnections>', ...wires.map(e => {
            const from = nodes.find(n => n.id === e.from)!, to = nodes.find(n => n.id === e.to)!;
            return ['    <Connection ' + attrs({
                    id: e.id
                }) + '>', tag('Endpoint', {
                    nodeRef: xmlNodeId(from), portRef: endpointPort(from, e.fromPort, e.kind)
                }, '      '), tag('Endpoint', {
                    nodeRef: xmlNodeId(to), portRef: endpointPort(to, e.toPort, e.kind)
                }, '      '), '    </Connection>'].join('\n');
        }), '  </ElectricalConnections>', '  <Groups>', ...groups.map(g => ['    <Group ' + attrs({
                id: g.id, type: 'Cabinet', name: g.name, cabinetNo: g.cabinetNumber
            }) + '>', ...selected.filter(n => n.cabinetId === g.id).map(n => tag('Member', {
                nodeRef: xmlNodeId(n)
            }, '      ')), '    </Group>'].join('\n')), '  </Groups>', '</SiteTopology>');
        return {
            emsId: ems.id, emsCode: ems.code ?? ems.name, filename: 'siteTopology.' + (ems.code ?? ems.id).replace(/[^a-zA-Z0-9_-]/g, '_') + '.xml', xml: lines.join('\n')
        };
    });
    return {
        files, issues, pending, blocked
    };
}
