import { useEffect, useState } from 'react';
import { api, DEMO_MODE, type ApiRow } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { hasStationPermission } from '@/auth/apiPermissions';
import { Button } from '../ui/Workspace';
import type { ProvisionDraft } from './model';
export default function DeploymentResults({ draft, onDownload }: {
    draft: ProvisionDraft;
    onDownload: () => void;
}) {
    const { user } = useAuth(), [expanded, setExpanded] = useState<string[]>([]), [bindings, setBindings] = useState<ApiRow[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
    const controllers = draft.devices.filter(n => n.type === 'EMS');
    const canRead = !!draft.stationId && !DEMO_MODE && hasStationPermission(user, draft.stationId, 'ems.read');
    async function refresh() { setError(''); if (!canRead) {
        setError('部署反馈服务未接通；暂无可读取的现场部署结果。');
        return;
    } setLoading(true); try {
        setBindings(await api<ApiRow[]>(`/stations/${draft.stationId}/ems`));
    }
    catch (e) {
        setError(e instanceof Error ? e.message : '无法读取 EMS 绑定');
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { setBindings([]); if (canRead)
        void refresh(); }, [draft.stationId, canRead]);
    return <div className="provision-results" data-design-node="2136:8851"><section className="station-panel"><header><div><h2>部署服务未接通</h2><p>{draft.name || '未命名站点'} · 本地草稿 V{draft.version}.0 · 尚未发布</p></div><div><Button onClick={onDownload}>下载本地草稿</Button><Button disabled={loading} onClick={() => void refresh()}>{loading ? '正在刷新…' : '刷新结果'}</Button></div></header><div className="deployment-progress">{['配置已生成', '等待部署结果', '部署结果已确认'].map((x, i) => <div key={x}><span>○</span><p>{x}<small>{i === 0 ? '仅有本地草稿，未生成正式配置' : '未接通'}</small></p></div>)}</div>{error && <p role="status" className="station-subtle">{error}</p>}</section>
 <section className="station-panel"><h2>EMS 部署结果 <small>共 {controllers.length} 台（草稿）</small></h2><div className="provision-table-scroll"><table className="station-table"><thead><tr>{['EMS 编号', '目标版本', '生效版本', '配置应用', '设备自检', '最近反馈时间', '操作'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{controllers.map(ems => { const devices = draft.devices.filter(n => n.emsId === ems.id && n.type !== '标准柜' && n.type !== '直流母线'); return <tr key={ems.id}><td colSpan={7}><div className="deployment-ems-row"><button aria-expanded={expanded.includes(ems.id)} onClick={() => setExpanded(p => p.includes(ems.id) ? p.filter(x => x !== ems.id) : [...p, ems.id])}>{expanded.includes(ems.id) ? '▾' : '▸'} {ems.code}</button><span>本地 V{draft.version}.0</span><span>—</span><span>未接通</span><span>未接通</span><span>—</span><button className="station-text-button" onClick={onDownload}>下载本地草稿</button></div>{expanded.includes(ems.id) && <div className="deployment-ems-detail"><p>EMS UUID：未获取部署关联；设备的设计编号不能代替现场 UUID。</p><p>投运确认：未接通</p><h3>所属设备自检</h3><table className="station-table"><thead><tr>{['设备编号', '设备类型', '通信地址', '通信检查', '功能自检', '异常原因'].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{devices.map(d => <tr key={d.id}><td>{d.code}</td><td>{d.type}</td><td>{d.access === 'EMU' ? 'EMU' : `${d.interface || '—'} / ${d.protocol === 'Modbus TCP' ? `${d.ip || '—'}:${d.port}` : d.address || '—'}`}</td><td>未接通</td><td>未接通</td><td>—</td></tr>)}</tbody></table>{!devices.length && <p>暂无已分配设备</p>}</div>}</td></tr>; })}</tbody></table></div>{!controllers.length && <p className="station-subtle">草稿暂无 EMS，请回到拓扑与设备添加。</p>}
 {bindings.length > 0 && <details className="deployment-help"><summary>现有站点 EMS 注册记录（不代表本草稿已部署）</summary>{bindings.map((b, i) => <p key={i}>{String(b.ems_uuid ?? b.emsUuid ?? b.id ?? '—')} · {String(b.name ?? b.device_name ?? 'EMS')}</p>)}</details>}
 </section></div>;
}
