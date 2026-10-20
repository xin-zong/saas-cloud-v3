import { useState } from 'react';
import { Button } from '../ui/Workspace';
import { Field } from './Common';
import type { ProvisionDraft } from './model';
import { exportTopologyByEms } from './topologyExport';
import './topology-export-preview.css';
export default function TopologyExportPreview({ draft, onClose, onDownloadDraft }: {
    draft: ProvisionDraft;
    onClose: () => void;
    onDownloadDraft: () => void;
}) {
    const result = exportTopologyByEms(draft);
    const [emsId, setEmsId] = useState(''), [showXml, setShowXml] = useState(false);
    const file = result.files.find(f => f.emsId === emsId) ?? result.files[0];
    function downloadXml() {
        // Recheck the current draft at the download boundary, not a cached preview.
        const fresh = exportTopologyByEms(draft);
        const current = fresh.files.find(f => f.emsId === file?.emsId);
        if (fresh.blocked || !current)
            return;
        const url = URL.createObjectURL(new Blob([current.xml], { type: 'application/xml;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = current.filename;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return <section className="topology-export-preview" aria-label="拓扑配置导出" data-design-node="3725:131139">
    <h2>生成配置文件</h2>
    {result.blocked ? <>
      <div role="alert" className="topology-export-errors"><strong>校验未通过，无法生成 XML</strong><p>请修正以下问题后重新校验。</p></div>
      <ol className="topology-export-issues">{result.issues.filter(i => i.severity !== 'warning').map((issue, index) => <li key={`${issue.nodeId}:${issue.field}:${index}`}>{issue.message}</li>)}</ol>
    </> : <>
      <Field label="目标 EMS"><select value={file?.emsId ?? ''} onChange={e => { setEmsId(e.target.value); setShowXml(false); }}>{result.files.map(f => <option key={f.emsId} value={f.emsId}>{f.emsCode}</option>)}</select></Field>
      <dl><div><dt>配置版本</dt><dd>{draft.topologyMeta?.revision ?? draft.version}</dd></div><div><dt>拓扑格式</dt><dd>SiteTopology · draft-2</dd></div></dl>
      <h3>生成内容</h3><ul><li>设备与通信接口</li><li>电气连接与端口</li><li>计量线路与正方向</li><li>标准柜与成员</li><li>EMS 身份与 Peers</li></ul>
      <h3>配置文件</h3><Field label="拓扑文件"><input readOnly value={file?.filename ?? ''}/></Field>
      <Field label="运行参数文件"><input readOnly value="运行参数文件尚未生成"/></Field>
      <button className="station-text-button" onClick={() => setShowXml(v => !v)}>{showXml ? '收起 XML' : '预览 XML →'}</button>
      {showXml && <pre className="topology-export-code" tabIndex={0}>{file?.xml}</pre>}
      <Button variant="primary" onClick={downloadXml}>下载拓扑 XML</Button>
    </>}
    <details className="topology-export-pending" open><summary>待确认项</summary>{result.pending.map((message, index) => <p key={index}>{message}</p>)}</details>
    <p className="topology-export-contract">已按提供的 SiteTopology draft-2 格式生成；下载文件不等于已下发或现场生效。</p>
    <div className="topology-export-actions"><Button onClick={onDownloadDraft}>下载本地草稿</Button><Button onClick={onClose}>返回编辑</Button></div>
  </section>;
}
