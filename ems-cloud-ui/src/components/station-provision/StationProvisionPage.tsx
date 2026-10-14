import { useEffect, useRef, useState } from 'react';
import type { Station } from '@/App';
import { api, DEMO_MODE } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useEditorLeaveGuard, type RegisterLeaveGuard } from '../useEditorLeaveGuard';
import { Button } from '../ui/Workspace';
import { Field, Modal } from './Common';
import { emptyProvision, parseDraft, provisionDraftKey, templates, validateBasics, type ProvisionDraft } from './model';
import { buildSiteTemplate, validateSiteTopology } from './topologyModel';
import { parseRuntime, validateRuntime } from './runtimeModel';
import RuntimeParametersPage from './RuntimeParametersPage';
import TopologyEditor from './TopologyEditor';
import DeploymentResults from './DeploymentResults';
import './station-entry.css';
import './onboarding-v3.css';
type Props = {
    station?: Station;
    onBack: () => void;
    registerLeaveGuard?: RegisterLeaveGuard;
};
function initial(station?: Station): ProvisionDraft { return station ? { ...emptyProvision(), stationId: station.id, name: station.name, code: station.code, region: station.region, address: station.address, ratedPower: String(station.ratedPower), storageCapacity: String(station.storageCapacity) } : emptyProvision(); }
export default function StationProvisionPage(props: Props) { const { user } = useAuth(), key = provisionDraftKey(user?.id ?? 'anonymous', DEMO_MODE, props.station?.id); return <ProvisionEditor key={key} {...props} storageKey={key}/>; }
function ProvisionEditor({ station, onBack, registerLeaveGuard, storageKey }: Props & {
    storageKey: string;
}) {
    const { user } = useAuth();
    const [draft, setDraft] = useState<ProvisionDraft>(() => { try {
        return parseDraft(localStorage.getItem(storageKey)) ?? initial(station);
    }
    catch {
        return initial(station);
    } });
    const [saved, setSaved] = useState(() => JSON.stringify(draft)), [step, setStep] = useState(station ? 1 : 0), [errors, setErrors] = useState<string[]>([]), [notice, setNotice] = useState(''), [pendingTemplate, setPendingTemplate] = useState<string | null>(null), [modal, setModal] = useState<'leave' | 'clear' | 'publish' | null>(null), [past, setPast] = useState<ProvisionDraft[]>([]), [future, setFuture] = useState<ProvisionDraft[]>([]), [topologyCheck, setTopologyCheck] = useState(0), [runtimeCheck, setRuntimeCheck] = useState(0);
    const dirty = JSON.stringify(draft) !== saved;
    const { settleLeave } = useEditorLeaveGuard({ dirty, registerLeaveGuard, onConfirm: () => setModal('leave'), onCancel: () => setModal(null) });
    const editGeneration = useRef(0);
    useEffect(() => { if (DEMO_MODE || !station || localStorage.getItem(storageKey))
        return; const controller = new AbortController(), generation = editGeneration.current; api<ProvisionDraft>(`/stations/${station.id}/provision-design`, { signal: controller.signal }).then(record => { const value = parseDraft(JSON.stringify(record)); if (value && !controller.signal.aborted && generation === editGeneration.current) {
        setDraft(value);
        setSaved(JSON.stringify(value));
    } }).catch(() => { }); return () => controller.abort(); }, [station?.id, storageKey]);
    useEffect(() => { const guard = (e: BeforeUnloadEvent) => { if (dirty) {
        e.preventDefault();
        e.returnValue = '';
    } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, [dirty]);
    function change(patch: Partial<ProvisionDraft>) { editGeneration.current++; setPast(p => [...p.slice(-39), draft]); setFuture([]); setDraft({ ...draft, ...patch }); setNotice(''); setErrors([]); }
    function field(key: keyof ProvisionDraft, value: string) { change({ [key]: value }); }
    function save() { try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
        setSaved(JSON.stringify(draft));
        setNotice('本地草稿已保存 · 仅保存在此浏览器，尚未发布');
        return true;
    }
    catch {
        setErrors(['浏览器存储不可用，请下载本地草稿保留配置']);
        return false;
    } }
    const back = () => dirty ? setModal('leave') : onBack();
    const finishLeave = () => { settleLeave(true); onBack(); };
    function download() { const url = URL.createObjectURL(new Blob([JSON.stringify({ ...draft, runtime: parseRuntime(draft.runtime), kind: 'local-draft', deploymentStatus: 'unavailable' }, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `${draft.name || 'station'}-本地草稿-v${draft.version}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    function undo() { const d = past.at(-1); if (d) {
        editGeneration.current++;
        setFuture(f => [draft, ...f]);
        setPast(p => p.slice(0, -1));
        setDraft(d);
    } }
    function redo() { const d = future[0]; if (d) {
        editGeneration.current++;
        setPast(p => [...p, draft]);
        setFuture(f => f.slice(1));
        setDraft(d);
    } }
    function next() { if (step === 0) {
        const e = validateBasics(draft);
        if (e.length) {
            setErrors(e);
            return;
        }
    }
    else if (step === 1) {
        setTopologyCheck(n => n + 1);
        if (validateSiteTopology(draft).length)
            return;
    }
    else if (step === 2) {
        setRuntimeCheck(n => n + 1);
        if (validateRuntime(parseRuntime(draft.runtime)).length)
            return;
        setModal('publish');
        return;
    } setErrors([]); setStep(s => Math.min(3, s + 1)); }
    const descriptions: Record<string, string> = { '工商业储能': '标准柜 + 电网侧计量 + 站内负载', '光储协同': '标准柜（含 DC PV）+ 电网侧计量 + 站内负载', '光储充': '标准柜（含 DC PV）+ 充电桩 + 站内负载', '自定义空白拓扑': '从节点库添加设备和交流、直流母线' };
    return <div className="station-provision station-entry-scope onboarding-v3" data-design-node={['2136:8507', '2136:8619', '3223:23087', '2136:8851'][step]}>
  <header className="provision-heading"><button className="station-text-button" onClick={back}>← 返回站点列表</button><h1>{station ? `${station.name} · ${step === 3 ? '建站进度' : '配置版本更新'}` : '新建站点'}<span className="station-muted-tag">本地草稿 V{draft.version}.0</span></h1></header>
  <nav className="provision-steps" aria-label="建站步骤">{['基本信息', '拓扑与设备', '运行参数', '部署结果'].map((label, i) => <button key={label} aria-current={step === i ? 'step' : undefined} onClick={() => { if (i === 0 || step > 0) {
        setStep(i);
        setErrors([]);
    }
    else
        next(); }}>{String(i + 1).padStart(2, '0')}　{label}</button>)}</nav>
  {notice && <p role="status" className="station-notice">{notice}</p>}{errors.length > 0 && <div role="alert" className="station-error">{errors.map(e => <p key={e}>{e}</p>)}</div>}
  <main className="provision-main">{step === 0 && <div className="provision-basics-layout"><section className="station-panel provision-basics"><h2>站点信息</h2><div className="provision-form-grid">
   <Field label="站点名称 *"><input placeholder="请输入站点名称" value={draft.name} onChange={e => field('name', e.target.value)}/></Field>
   <Field label="站点 ID *"><input placeholder="本地草稿标识" value={draft.code} onChange={e => field('code', e.target.value)}/></Field>
   <Field label="所属企业"><input readOnly value={user?.tenantName ?? user?.organization ?? ''}/></Field>
   <Field label="所在地区 *"><select value={draft.region} onChange={e => field('region', e.target.value)}><option value="">请选择地区</option>{[...new Set(['欧洲', '北美', '南美', '亚洲', '非洲', '大洋洲', '华东', '华南', '华北', '华中', '西南', '西北', '东北', '东南亚', draft.region].filter(Boolean))].map(x => <option key={x}>{x}</option>)}</select></Field>
   <Field label="时区 *"><select value={draft.timezone} onChange={e => field('timezone', e.target.value)}>{[...new Set([draft.timezone, 'Europe/Berlin', 'Europe/London', 'Asia/Shanghai (UTC+08:00)', 'America/New_York', 'UTC'])].map(x => <option key={x}>{x}</option>)}</select></Field>
   <Field label="详细地址 *"><input value={draft.address} onChange={e => field('address', e.target.value)}/></Field>
  </div><p className="station-subtle">站点创建后可继续补充设备绑定与现场结果。当前仅编辑本地草稿。</p></section>
  <section className="station-panel provision-templates"><h2>拓扑起始模板</h2><div role="radiogroup" aria-label="拓扑起始模板">{templates.map(t => <label key={t}><span><input type="radio" name="topology-template" aria-label={t} checked={draft.template === t} onChange={() => draft.devices.length ? setPendingTemplate(t) : change(buildSiteTemplate(t))}/>{t}</span><small>{descriptions[t]}</small></label>)}</div><p className="station-subtle">模板只提供起始连接，可增加母线、拆分标准柜并调整接线。</p></section></div>}
  {step === 1 && <TopologyEditor draft={draft} change={change} undo={undo} redo={redo} canUndo={!!past.length} canRedo={!!future.length} onClear={() => setModal('clear')} onExport={download} validationTrigger={topologyCheck}/>}
  {step === 2 && <RuntimeParametersPage value={parseRuntime(draft.runtime)} onChange={runtime => change({ runtime })} validationTrigger={runtimeCheck}/>}
  {step === 3 && <DeploymentResults draft={draft} onDownload={download}/>}
  </main>
  <footer className="provision-footer"><div><Button onClick={save}>保存草稿</Button>{step === 1 && <Button onClick={() => setTopologyCheck(n => n + 1)}>校验配置</Button>}{step === 2 && <Button onClick={() => setRuntimeCheck(n => n + 1)}>校验配置</Button>}{step === 3 && <Button onClick={() => { change({ version: draft.version + 1 }); setStep(1); setNotice('已创建新版本本地草稿，现场生效版本未知。'); }}>新版本配置草稿</Button>}</div><div>{step > 0 && step < 3 && <Button onClick={() => { setErrors([]); setStep(s => s - 1); }}>上一步</Button>}{step < 3 && <><Button variant="primary" onClick={next}>下一步</Button>{step === 2 && <Button onClick={() => setStep(3)}>查看部署结果</Button>}</>}{step === 3 && <Button variant="primary" onClick={back}>返回站点列表</Button>}</div></footer>
  {pendingTemplate && <Modal title="替换当前拓扑？" onClose={() => setPendingTemplate(null)} actions={<><Button onClick={() => setPendingTemplate(null)}>取消</Button><Button variant="primary" onClick={() => { change(buildSiteTemplate(pendingTemplate)); setPendingTemplate(null); }}>替换拓扑</Button></>}><p>将替换节点和连接，保留基本信息、运行参数。替换后可撤销。</p></Modal>}
  {modal === 'clear' && <Modal title="清空画布？" onClose={() => setModal(null)} actions={<><Button onClick={() => setModal(null)}>取消</Button><Button onClick={() => { change({ devices: [], connections: [], buses: [] }); setModal(null); }}>确认清空</Button></>}><p>将移除全部节点和连线，可使用撤销恢复。</p></Modal>}
  {modal === 'leave' && <Modal title="未保存的更改" onClose={() => { settleLeave(false); setModal(null); }} actions={<><Button onClick={() => { settleLeave(false); setModal(null); }}>继续编辑</Button><Button onClick={finishLeave}>放弃更改</Button><Button variant="primary" onClick={() => { if (save())
        finishLeave(); }}>保存并离开</Button></>}><p>你有未保存的本地草稿内容，确定要离开吗？</p></Modal>}
  {modal === 'publish' && <Modal title="暂时无法发布配置" onClose={() => setModal(null)} actions={<><Button onClick={() => setModal(null)}>返回编辑</Button><Button variant="primary" onClick={() => { if (save()) {
        setModal(null);
        setStep(3);
    } }}>保存本地草稿并查看结果</Button></>}><p>配置下发和现场自检服务尚未接通。保存本地草稿不生成正式发布记录，不会下发到设备。</p></Modal>}
 </div>;
}
