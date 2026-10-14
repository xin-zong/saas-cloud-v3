import { Field } from './Common';
import { Switch } from './RuntimeParametersPage';
import { type Device, type ProvisionDraft, type CommunicationPort } from './model';
import { isStructure } from './topologyModel';
export default function DeviceInspector({ device, draft, patch, change }: {
    device: Device;
    draft: ProvisionDraft;
    patch: (id: string, patch: Partial<Device>) => void;
    change: (patch: Partial<ProvisionDraft>) => void;
}) {
    const set = (key: keyof Device, value: string | boolean) => patch(device.id, { [key]: value });
    const input = (key: keyof Device, label: string, type = 'text') => <Field label={label}><input data-device-field={`${device.id}:${key}`} type={type} value={String(device[key] ?? '')} onChange={e => set(key, e.target.value)}/></Field>;
    const ems = draft.devices.find(n => n.id === device.emsId && n.type === 'EMS');
    const select = (key: keyof Device, label: string, options: {
        id: string;
        name: string;
    }[]) => <Field label={label}><select data-device-field={`${device.id}:${key}`} value={String(device[key] ?? '')} onChange={e => set(key, e.target.value)}><option value="">请选择</option>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>;
    const relation = <><h3>连接关系</h3><p>{draft.connections?.filter(e => e.from === device.id || e.to === device.id).map(e => draft.devices.find(n => n.id === (e.from === device.id ? e.to : e.from))?.code).join('、') || '尚未连接'}</p></>;
    if (isStructure(device))
        return <><h2>{device.code} · {device.name}</h2>{input('name', '节点名称')}{input('code', '节点编号')}<p>仅保存电气连接，不配置通信或设备绑定。</p>{relation}</>;
    if (device.type === 'EMS') {
        const update = (index: number, values: Partial<CommunicationPort>) => patch(device.id, { ports: device.ports?.map((p, i) => i === index ? { ...p, ...values } : p) });
        return <><h2>{device.code} · 采集与控制</h2>{input('code', 'EMS 编号')}<div className="inspector-pair">{input('ip', '本机 IP')}{input('subnet', '子网掩码')}</div><h3>下行接口 <button aria-label="添加 EMS 接口" onClick={() => patch(device.id, { ports: [...(device.ports ?? []), { id: `接口-${(device.ports?.length ?? 0) + 1}`, interface: '', protocol: '', role: '客户端 / 主站', ip: '', port: '502', address: '1', version: '', targets: [], baud: '9600', parity: '偶校验', bits: '8 / 1', subnet: '255.255.255.0' }] })}>＋</button></h3>
   {device.ports?.map((p, i) => <details key={i} className="ems-interface" open><summary>{p.id} · {p.interface || '请选择接口类型'}</summary>
    <div className="inspector-pair"><Field label={`${p.id} 接口名称`}><input value={p.id} onChange={e => { const next = e.target.value; change({ devices: draft.devices.map(n => n.id === device.id ? { ...n, ports: n.ports?.map((q, j) => j === i ? { ...q, id: next } : q) } : n.emsId === device.id && n.interface === p.id ? { ...n, interface: next } : n) }); }}/></Field>
    <Field label={`${p.id} 接口类型`}><select value={p.interface.startsWith('ETH') ? 'ETH' : p.interface.startsWith('RS485') ? 'RS485' : ''} onChange={e => {
                    const type = e.target.value, next = `${type}-${1 + (device.ports ?? []).filter((q, j) => j !== i && q.interface.startsWith(type)).length}`;
                    change({ devices: draft.devices.map(n => n.id === device.id ? { ...n, ports: n.ports?.map((q, j) => j === i ? { ...q, id: next, interface: next, protocol: type === 'ETH' ? 'Modbus TCP' : 'Modbus RTU' } : q) } : n.emsId === device.id && n.interface === p.id ? { ...n, interface: '' } : n) });
                }}><option value="">请选择接口类型</option><option value="ETH">网口（ETH）</option><option value="RS485">串口（RS485）</option></select></Field></div>
    {p.interface && <><Field label={`${p.id} 物理接口`}><input value={p.interface} onChange={e => update(i, { interface: e.target.value })}/></Field>
    {p.interface.startsWith('ETH') ? <div className="inspector-pair"><Field label={`${p.id} IP 地址`}><input value={p.ip} onChange={e => update(i, { ip: e.target.value })}/></Field><Field label={`${p.id} 子网掩码`}><input value={p.subnet ?? ''} onChange={e => update(i, { subnet: e.target.value })}/></Field></div> : <div className="inspector-pair">{[['baud', '波特率', ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200']], ['parity', '校验位', ['无校验', '奇校验', '偶校验']], ['bits', '数据位 / 停止位', ['8 / 1', '8 / 2', '7 / 1']]].map(([key, label, options]) => <Field key={key as string} label={`${p.id} ${label}`}><select value={String(p[key as keyof CommunicationPort] ?? '')} onChange={e => update(i, { [key as string]: e.target.value })}>{(options as string[]).map(x => <option key={x}>{x}</option>)}</select></Field>)}</div>}</>}
    <button className="station-text-button station-danger" onClick={() => change({ devices: draft.devices.map(n => n.id === device.id ? { ...n, ports: n.ports?.filter((_, j) => j !== i) } : n.emsId === device.id && n.interface === p.id ? { ...n, interface: '' } : n) })}>移除此接口</button>
   </details>)}<p>EMS 不参与电气连接。更改接口后请重新校验接入设备。</p></>;
    }
    const nonConnected = device.enabled === false || device.access === '不接入';
    return <><h2>{device.code} · {device.name}</h2><div className="inspector-pair">{input('code', '设备编号')}{(device.cabinetId ? <Field label="所属 EMS"><input readOnly value={ems?.code ?? '未选择 EMS'}/></Field> : select('emsId', '所属 EMS', draft.devices.filter(n => n.type === 'EMS').map(n => ({ id: n.id, name: n.code ?? n.name }))))}</div>{input('name', '节点名称')}
  <Field label="类别启用"><Switch label={`启用 ${device.code}`} value={device.enabled !== false} onChange={v => set('enabled', v)}/></Field>
  {input('model', '厂家 / 型号')}{device.type === 'PCS' && input('rating', '有功功率上限（kW）', 'number')}
  {device.type === '光伏 DC/DC' && <Field label="配置 DC PV"><Switch label="配置 DC PV" value={device.enabled !== false} onChange={v => set('enabled', v)}/></Field>}
  <h3>通信接入</h3>{select('access', '接入方式', [{ id: 'EMS', name: 'EMS' }, { id: 'EMU', name: 'EMU' }, { id: '不接入', name: '不接入' }])}
  {!nonConnected && (device.access === 'EMU' ? select('emuId', '关联 EMU', draft.devices.filter(n => n.type === '电池 / BMS').map(n => ({ id: n.id, name: n.code ?? n.name }))) : <>
   <div className="inspector-pair"><Field label="通信协议"><select data-device-field={`${device.id}:protocol`} value={device.protocol} onChange={e => patch(device.id, { protocol: e.target.value, access: 'EMS', interface: '' })}><option value="">请选择</option><option>Modbus TCP</option><option>Modbus RTU</option></select></Field>{select('interface', '接入接口', (ems?.ports ?? []).filter(p => device.protocol === 'Modbus TCP' ? p.interface.startsWith('ETH') : p.interface.startsWith('RS485')).map(p => ({ id: p.id, name: `${ems?.code} / ${p.id}` })))}</div>
   {device.protocol === 'Modbus TCP' ? <><div className="inspector-pair">{input('ip', '设备 IP 地址')}{input('port', 'TCP 端口', 'number')}</div>{input('address', 'Unit ID', 'number')}</> : <>{input('address', '从站地址', 'number')}<p>使用所选 EMS 接口的串口参数：{ems?.ports?.find(p => p.id === device.interface)?.baud ?? '—'} bps · {ems?.ports?.find(p => p.id === device.interface)?.parity ?? '—'} · {ems?.ports?.find(p => p.id === device.interface)?.bits ?? '—'}</p></>}
  </>)}
  {device.type === '电池 / BMS' && <><Field label="存在液冷系统"><Switch label="存在液冷系统" value={!!device.cooling} onChange={v => set('cooling', v)}/></Field>{device.cooling && <>{input('coolingModel', '液冷厂家 / 型号')}<p>液冷接入方式：EMU</p></>}</>}{relation}
 </>;
}
