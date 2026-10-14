import { useEffect, useState } from 'react';
import { createDevice, newNodeId, deviceLabels, type Device, type DeviceType, type ProvisionDraft } from './model';
import { cabinetNodes, canWire, removeNode, validateSiteTopology, nodePosition, splitCabinet, cloneNode, moveNode, arrangeNodes, type TopologyIssue } from './topologyModel';
import DeviceInspector from './DeviceInspector';
import LegacyTopologyEditor from './LegacyTopologyEditor';
import './topology-editor.css';
const iconNames: Record<DeviceType, string> = { 标准柜: 'battery', 电网: 'grid', 光伏: 'pv', '光伏 DC/DC': 'pcs', PCS: 'pcs', '电池 / BMS': 'battery', 负载: 'load', 电表: 'meter', 变压器: 'grid', 交流母线: 'bus', 直流母线: 'bus', 断路器: 'bus', EMS: 'pcs', 光伏侧电表: 'meter', 柴油发电机: 'pcs', 充电桩: 'load', 可控负载: 'load', 不可控负载: 'load' };
export function NodeIcon({ type }: {
    type: DeviceType;
}) { return <img className="provision-node-icon" src={`/figma/provision-v3/${iconNames[type]}.svg`} alt=""/>; }
type Props = {
    draft: ProvisionDraft;
    change: (patch: Partial<ProvisionDraft>) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    onClear: () => void;
    onExport: () => void;
    validationTrigger?: number;
};
const groups: {
    label: string;
    types: DeviceType[];
}[] = [{ label: '储能设备', types: ['标准柜', 'PCS', '电池 / BMS', '光伏 DC/DC'] }, { label: '控制设备', types: ['EMS'] }, { label: '计量设备', types: ['电表', '光伏侧电表'] }, { label: '电气结构', types: ['电网', '交流母线', '直流母线'] }, { label: '发电设备', types: ['光伏', '柴油发电机'] }, { label: '用电设备', types: ['充电桩', '可控负载', '不可控负载'] }];
export default function TopologyEditor(props: Props) {
    const { draft, change, undo, redo, canUndo, canRedo, onClear, onExport, validationTrigger = 0 } = props;
    const [library, setLibrary] = useState(true), [search, setSearch] = useState(''), [selected, setSelected] = useState(draft.devices.find(n => n.type === '标准柜')?.id ?? ''), [expanded, setExpanded] = useState(false), [connect, setConnect] = useState(false), [source, setSource] = useState(''), [kind, setKind] = useState<'AC' | 'DC'>('AC'), [zoom, setZoom] = useState(1), [message, setMessage] = useState(''), [checked, setChecked] = useState(false), [legacy, setLegacy] = useState(false);
    const device = draft.devices.find(d => d.id === selected), container = device?.type === '标准柜' ? device : draft.devices.find(n => n.id === device?.cabinetId), issues = checked ? validateSiteTopology(draft) : [];
    useEffect(() => {
        if (!draft.devices.some(n => n.id === selected)) {
            setSelected(draft.devices.find(n => n.type === '标准柜')?.id ?? draft.devices[0]?.id ?? '');
        }
    }, [draft.devices, selected]);
    useEffect(() => { if (validationTrigger)
        setChecked(true); }, [validationTrigger]);
    useEffect(() => { const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') {
        setExpanded(false);
        setConnect(false);
        setSource('');
    } }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, []);
    const patch = (id: string, values: Partial<Device>) => change({ devices: draft.devices.map(d => d.id === id ? { ...d, ...values } : d) });
    function add(type: DeviceType) {
        let number = draft.devices.filter(d => d.type === type).length + 1;
        while (draft.devices.some(d => d.code === createDevice(type, number).code))
            number++;
        if (type === '标准柜') {
            const group = cabinetNodes(number, true, draft.devices.find(n => n.type === 'EMS')?.id ?? '');
            group.cabinet.x = 30 + (number % 2) * 35;
            group.cabinet.y = 65;
            change({ devices: [...draft.devices, ...group.devices], connections: [...(draft.connections ?? []), ...group.connections] });
            setSelected(group.cabinet.id);
        }
        else {
            const d = createDevice(type, number);
            d.x = 15 + (draft.devices.length % 4) * 22;
            d.y = 20 + (draft.devices.length % 3) * 15;
            d.enabled = true;
            d.access = type === '光伏 DC/DC' ? 'EMU' : 'EMS';
            d.emsId = draft.devices.find(n => n.type === 'EMS')?.id ?? '';
            change({ devices: [...draft.devices, d] });
            setSelected(d.id);
        }
        setChecked(false);
    }
    function pick(d: Device) { setSelected(d.id); if (!connect)
        return; if (!source) {
        setSource(d.id);
        setMessage('请选择目标节点');
        return;
    } const from = draft.devices.find(n => n.id === source); if (!from || !canWire(from, d, kind)) {
        setMessage('连接不兼容：EMS/机柜不接主电路，请连接实际设备的 AC/DC 端口');
        return;
    } if (draft.connections?.some(e => (e.from === source && e.to === d.id) || (e.from === d.id && e.to === source))) {
        setMessage('节点已经连接');
        return;
    } change({ connections: [...(draft.connections ?? []), { id: newNodeId(), from: source, to: d.id, kind }] }); setSource(''); setMessage('已添加本地电气连接'); }
    function position(d: Device, i: number) { return nodePosition(draft, d, i); }
    function duplicate() { if (!device)
        return; const { selectedId, ...patch } = cloneNode(draft, device.id); change(patch); setSelected(selectedId); }
    function locate(issue: TopologyIssue) { setChecked(false); setSelected(issue.nodeId); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-device-field="${issue.nodeId}:${issue.field}"]`)?.focus()); }
    if (legacy)
        return <div><button className="station-text-button" onClick={() => setLegacy(false)}>返回统一拓扑画布</button><LegacyTopologyEditor {...props}/></div>;
    const node = (d: Device, i: number) => { const p = position(d, i), bus = d.type === '交流母线' || d.type === '直流母线'; return <button key={d.id} className={`topology-device unified-node ${bus ? (d.type === '直流母线' ? 'unified-bus unified-dc-bus' : 'unified-bus') : ''} ${selected === d.id ? 'selected' : ''}`} aria-label={`配置 ${d.name}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} draggable={!connect} onDragStart={e => e.dataTransfer.setData('text/plain', d.id)} onClick={() => pick(d)}><NodeIcon type={d.type}/><span>{d.code}<small>{d.name}</small>{!bus && <em>{d.type === 'EMS' ? 'TCP / RS485' : d.access === '不接入' ? '不接入' : d.access === 'EMU' ? 'EMU' : d.protocol || '待配置'}</em>}</span></button>; };
    return <div className={`topology-v3 ${expanded ? 'topology-expanded' : ''}`} data-design-node="2136:8619">
  <aside className="unified-library"><nav><button aria-pressed={library} onClick={() => setLibrary(true)}>节点库</button><button aria-pressed={!library} onClick={() => setLibrary(false)}>设备列表</button></nav><input aria-label="搜索设备或结构" placeholder="按名称搜索" value={search} onChange={e => setSearch(e.target.value)}/>{library ? groups.map(g => <section key={g.label}><h3>{g.label}</h3><div>{g.types.filter(t => `${deviceLabels[t]} ${t}`.includes(search)).map(t => <button key={t} onClick={() => add(t)}><NodeIcon type={t}/>{t === '电表' ? '电网侧电表' : deviceLabels[t]}</button>)}</div></section>) : <div className="node-list">{draft.devices.filter(n => `${n.code} ${n.name}`.toLowerCase().includes(search.toLowerCase())).map(n => <button key={n.id} aria-pressed={selected === n.id} onClick={() => setSelected(n.id)}>{n.code}<small>{n.name}</small></button>)}</div>}</aside>
  <section className="unified-workspace"><div className="unified-toolbar">{[['select', '选择', () => { setConnect(false); setSource(''); }], ['connect', '连线', () => { setConnect(!connect); setSource(''); }], ['undo', '撤销', undo], ['redo', '重做', redo], ['layout', '整理布局', () => change(arrangeNodes(draft))]].map(([icon, label, action]) => <button key={String(icon)} title={String(label)} aria-label={String(label)} disabled={label === '撤销' ? !canUndo : label === '重做' ? !canRedo : false} onClick={action as () => void}><img src={`/figma/provision-v3/${icon}.svg`} alt=""/></button>)}{connect && <select aria-label="连线类型" value={kind} onChange={e => setKind(e.target.value as 'AC' | 'DC')}><option>AC</option><option>DC</option></select>}<button aria-label="拆分标准柜" title="拆分标准柜" disabled={!container} onClick={() => { if (container) {
        change(splitCabinet(draft, container.id));
        setSelected(draft.devices.find(n => n.cabinetId === container.id && n.type === 'PCS')?.id ?? '');
    } }}><img src="/figma/provision-v3/hierarchy.svg" alt=""/></button><span /><button aria-label="清空" onClick={onClear}><img src="/figma/provision-v3/delete.svg" alt=""/></button><button aria-label={expanded ? '收起画布' : '展开画布'} onClick={() => setExpanded(!expanded)}><img src="/figma/provision-v3/fullscreen.svg" alt=""/></button></div>
   <div className="unified-viewport"><div className="unified-surface" style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'), rect = e.currentTarget.getBoundingClientRect(); change(moveNode(draft, id, { x: Math.min(92, Math.max(8, (e.clientX - rect.left) / rect.width * 100)), y: Math.min(88, Math.max(8, (e.clientY - rect.top) / rect.height * 100)) })); }}>
    <p className="unified-caption">全站电气结构 · 设备内显示通信接入</p>
    {draft.devices.filter(d => d.type === '标准柜').map((d, i) => { const p = position(d, i); return <div key={d.id} className="unified-cabinet" style={{ left: `${p.x}%`, top: `calc(${p.y}% - 90px)` }}><button draggable={!connect} onDragStart={e => e.dataTransfer.setData('text/plain', d.id)} onClick={() => setSelected(d.id)}>标准柜 · {d.code}</button></div>; })}
    <svg className="unified-lines" width="100%" height="100%" aria-hidden="true">{draft.connections?.map(e => { const a = draft.devices.find(n => n.id === e.from), b = draft.devices.find(n => n.id === e.to); if (!a || !b || (a.type === '光伏 DC/DC' && a.enabled === false) || (b.type === '光伏 DC/DC' && b.enabled === false))
        return null; const p = position(a, draft.devices.indexOf(a)), q = position(b, draft.devices.indexOf(b)), isBus = (n: Device) => n.type === '交流母线' || n.type === '直流母线'; return <line key={e.id} x1={`${isBus(a) ? q.x : p.x}%`} y1={`${p.y}%`} x2={`${isBus(b) ? p.x : q.x}%`} y2={`${q.y}%`} stroke={e.kind === 'AC' ? '#547787' : '#b78130'} strokeWidth="1.5"/>; })}</svg>
    {draft.devices.filter(d => d.type !== '标准柜' && !(d.type === '光伏 DC/DC' && d.enabled === false)).map(node)}{!draft.devices.length && <div className="provision-empty">从左侧添加标准柜或独立设备</div>}
   </div></div><footer><span>— AC连接　<span className="dc-legend">— DC连接</span></span><button onClick={() => setZoom(Math.max(.75, zoom - .25))} aria-label="缩小画布">−</button><button onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button onClick={() => setZoom(Math.min(2, zoom + .25))} aria-label="放大画布">＋</button><button onClick={onExport}>导出</button></footer>{message && <p role="status">{message}</p>}
  </section>
  <aside className="unified-inspector"><h3>{checked ? '校验结果' : '设备配置'}</h3>{checked ? <><strong className={issues.length ? 'station-danger' : 'station-accent'}>{issues.length ? `发现 ${issues.length} 项待完善` : '本地拓扑校验通过'}</strong>{issues.map((issue, i) => <section className="topology-issue" key={i}><p>{issue.message}</p><button className="station-text-button" onClick={() => locate(issue)}>定位设备与字段 →</button></section>)}<p>修正后重新校验；配置仍可保存为草稿。</p></> : device ? <>
   {container ? <><h2>标准柜 · {container.code}</h2><div className="inspector-pair"><input aria-label="机柜编号" value={container.code ?? ''} onChange={e => patch(container.id, { code: e.target.value })}/><select aria-label="机柜所属 EMS" value={container.emsId ?? ''} onChange={e => { change({ devices: draft.devices.map(n => n.id === container.id || n.cabinetId === container.id ? { ...n, emsId: e.target.value } : n) }); }}><option value="">请选择 EMS</option>{draft.devices.filter(n => n.type === 'EMS').map(n => <option key={n.id} value={n.id}>{n.code}</option>)}</select></div>{draft.devices.filter(n => n.cabinetId === container.id && n.type !== '直流母线').map((n, i) => <details className="cabinet-config" key={n.id} open={n.id === selected || (device.type === '标准柜' && i === 0)}><summary>{n.code} · {deviceLabels[n.type]}</summary><DeviceInspector device={n} draft={draft} patch={patch} change={change}/></details>)}</> : <DeviceInspector device={device} draft={draft} patch={patch} change={change}/>}
   <div className="node-actions"><button onClick={duplicate}>复制节点</button><button onClick={() => { change(removeNode(draft, device.id)); setSelected(''); }}>删除节点</button></div><details className="unified-connections"><summary>编辑电气连接</summary>{draft.connections?.filter(e => e.from === device.id || e.to === device.id).map(e => <div key={e.id}>{e.kind} · {draft.devices.find(n => n.id === (e.from === device.id ? e.to : e.from))?.code}<button aria-label="删除连接" onClick={() => change({ connections: draft.connections?.filter(q => q.id !== e.id) })}>×</button></div>)}</details>
  </> : <><h2>从节点库开始</h2><p>添加标准柜，或单独添加 PCS、电池系统和 DCDC。</p><button className="ui-button ui-button--primary" onClick={() => add('标准柜')}>添加标准柜</button></>}
  {draft.devices.some(n => n.ports?.some(p => p.targets.length)) && <button className="station-text-button" onClick={() => setLegacy(true)}>编辑旧草稿通信端口</button>}</aside>
 </div>;
}
