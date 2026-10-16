import { useEffect, useRef, useState } from 'react'
import { ApiError, DEMO_MODE } from '@/api/client'
import {
  REPORT_KIND_LABELS, REPORT_TIME_LABELS, cloneReportTemplate, createReportTemplate, deleteReportTemplate,
  loadReportTemplateFields, loadReportTemplates, lockedReportTemplateFields, normalizeReportTemplateFields,
  normalizeReportTemplateName, toggleReportTemplateField, updateReportTemplate,
  type ReportTemplate, type ReportTemplateCatalog, type ReportTimeType,
} from '@/api/reportTemplates'
import type { ReportKind } from './apiAnalytics'
import { Button } from './ui/Workspace'
import { Modal, Field } from './station-provision/Common'
import { useConfigurationLeaveGuard } from './useConfigurationLeaveGuard'
import type { RegisterLeaveGuard } from './useEditorLeaveGuard'
import './station-provision/station-entry.css'
import './report-templates.css'

type Props = { kind: ReportKind; canEdit: boolean; onClose: () => void; registerLeaveGuard?: RegisterLeaveGuard; onChanged?: (rows: ReportTemplate[]) => void }
type Draft = { mode: 'create' | 'edit' | 'clone'; value: ReportTemplate }
const fingerprint = (draft: Draft) => JSON.stringify({ name: draft.value.name, timeType: draft.value.timeType, fields: [...draft.value.fields].sort() })

/** Latest report-center design: Figma 1093:1039; template editor composes its current table/modal styling. */
export default function ReportTemplatesPanel(props: Props) { return <ReportTemplateEditor key={props.kind} {...props} /> }
function ReportTemplateEditor({ kind, canEdit, onClose, registerLeaveGuard, onChanged }: Props) {
  const [templates, setTemplates] = useState<ReportTemplate[]>([]), [catalog, setCatalog] = useState<ReportTemplateCatalog | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null), [baseline, setBaseline] = useState(''), [viewing, setViewing] = useState<ReportTemplate | null>(null), [deleting, setDeleting] = useState<ReportTemplate | null>(null)
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [revoked, setRevoked] = useState(false), [conflict, setConflict] = useState(false), [missing, setMissing] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const alive = useRef(true), lock = useRef(false), sequence = useRef(0), destination = useRef<() => void>(onClose)
  const canWrite = canEdit && !revoked && !DEMO_MODE, working = !!draft || !!deleting
  const dirty = !!draft && fingerprint(draft) !== baseline
  const customCount = templates.filter(template => template.origin === 'custom').length
  function discard() { setDraft(null); setBaseline(''); setDeleting(null); setConflict(false); setMissing(false); setError('') }
  const leave = useConfigurationLeaveGuard({ dirty, busy, registerLeaveGuard, onClose: () => destination.current(), onDiscard: discard })
  function close() { destination.current = onClose; void leave.close() }
  function cancel() { destination.current = discard; void leave.close() }
  function failed(cause: unknown) {
    setError(cause instanceof Error ? cause.message : '模板服务请求失败，请重试。')
    setConflict(cause instanceof ApiError && cause.status === 409)
    if (cause instanceof ApiError && cause.status === 403) setRevoked(true)
  }
  async function snapshot() {
    const [rows, fields] = await Promise.all([loadReportTemplates(), loadReportTemplateFields(kind)])
    if (!Array.isArray(rows) || fields.schemaVersion !== 1 || !Array.isArray(fields.fields) || !Array.isArray(fields.timeTypes)) throw new Error('模板或字段目录响应无效，请刷新后重试。')
    normalizeReportTemplateFields([], fields)
    return { rows, fields }
  }
  async function refresh() {
    if (lock.current || DEMO_MODE) return
    lock.current = true; const request = ++sequence.current, current = () => alive.current && sequence.current === request
    setBusy(true); setError('')
    try {
      const { rows, fields } = await snapshot()
      if (!current()) return
      setTemplates(rows); setCatalog(fields); setLoaded(true); setConflict(false); setMissing(false); onChanged?.(rows)
      if (viewing) setViewing(rows.find(row => row.id === viewing.id) ?? null)
      if (deleting) setDeleting(rows.find(row => row.id === deleting.id) ?? null)
      if (draft) {
        const latest = draft.value.id ? rows.find(row => row.id === draft.value.id) : null
        if (draft.value.id && !latest) { setMissing(true); setConflict(true); setError('原模板已删除，名称与字段草稿仍保留；请取消后新建模板。') }
        else {
          const known = draft.value.fields.filter(code => fields.fields.some(field => field.code === code)), unknown = draft.value.fields.filter(code => !fields.fields.some(field => field.code === code))
          const value = draft.mode === 'clone' && latest ? { ...latest, name: draft.value.name } : { ...draft.value, ...(latest ? { version: latest.version, kind: latest.kind } : {}), fields: [...normalizeReportTemplateFields(known, fields), ...unknown] }
          setDraft({ ...draft, value })
          if (latest && draft.mode === 'edit') setBaseline(fingerprint({ mode: 'edit', value: latest }))
        }
      }
    } catch (cause) { if (current()) failed(cause) }
    finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; sequence.current++; lock.current = false } }, [])
  useEffect(() => {
    if (!dirty && !busy) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, busy])
  function open(mode: Draft['mode'], template?: ReportTemplate) {
    if (!canWrite || !catalog || !loaded || lock.current || working || (mode !== 'edit' && customCount >= 10)) return
    if (mode === 'edit' && template?.origin !== 'custom') return
    const value: ReportTemplate = template ? { ...template, fields: [...template.fields], name: mode === 'clone' ? '' : template.name }
      : { id: '', name: '', kind, timeType: 'range', origin: 'custom', fields: normalizeReportTemplateFields([], catalog), schemaVersion: 1, version: 0 }
    const next = { mode, value }; setDraft(next); setBaseline(fingerprint(next)); setDeleting(null); setViewing(null); setError(''); setNotice(''); setConflict(false); setMissing(false)
  }
  async function mutate(operation: () => Promise<unknown>, success: string) {
    if (!canWrite || !loaded || lock.current || conflict || missing) return
    lock.current = true; const request = ++sequence.current, current = () => alive.current && sequence.current === request
    let committed = false
    setBusy(true); setError(''); setNotice('')
    try {
      await operation(); committed = true
      if (!current()) return
      discard(); setViewing(null); setNotice(success)
      const { rows, fields } = await snapshot()
      if (!current()) return
      setTemplates(rows); setCatalog(fields); setLoaded(true); onChanged?.(rows)
    } catch (cause) { if (current()) { failed(cause); if (committed) setLoaded(false) } }
    finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  function save() {
    if (!draft || !catalog) return
    let name: string, fields: string[]
    try { name = normalizeReportTemplateName(draft.value.name); fields = normalizeReportTemplateFields(draft.value.fields, catalog) } catch (cause) { failed(cause); return }
    void mutate(() => draft.mode === 'clone' ? cloneReportTemplate(draft.value, name)
      : draft.mode === 'edit' ? updateReportTemplate({ ...draft.value, name, fields })
      : createReportTemplate({ ...draft.value, name, fields }), draft.mode === 'clone' ? '已另存为私人模板。' : '报表模板已保存。')
  }
  const effective = draft?.value ?? viewing
  const locked = catalog ? lockedReportTemplateFields(catalog) : new Set<string>()
  const unknown = draft && catalog ? draft.value.fields.filter(code => !catalog.fields.some(field => field.code === code)) : []
  return <div className="station-entry-scope report-templates-scope"><Modal title="报表模板管理" onClose={close} actions={<Button disabled={busy} onClick={close}>关闭报表模板</Button>}>
    <div className="report-templates-panel" data-design-node="1093:1039">
      {DEMO_MODE ? <p>演示模式：报表模板仅在 API 模式提供。</p> : <>
        <p>{REPORT_KIND_LABELS[kind]} · 私人模板 {customCount}/10。系统模板只读，可明确另存为私人模板。</p>
        {!canWrite && <p>{revoked ? '权限已变化，写入已停用；未保存草稿仍保留。' : '当前仅有查看权限。'}</p>}
        <div className="report-template-toolbar"><Button disabled={busy} onClick={() => void refresh()}>刷新模板与目录（保留草稿）</Button><Button disabled={!canWrite || busy || !loaded || working || customCount >= 10} onClick={() => open('create')}>新增报表模板</Button></div>
        {error && <p role="alert">{error}</p>}{conflict && <p>模板版本或名称已变化，请刷新并核对保留的草稿后重试。</p>}{notice && <p role="status">{notice}</p>}
        {!loaded && !error && <p role="status">正在读取模板与字段目录…</p>}
        <div className="report-template-table-scroll"><table className="report-template-table"><thead><tr><th>模板名称</th><th>来源</th><th>周期选择</th><th>操作</th></tr></thead><tbody>{templates.filter(template => template.kind === kind).map(template => <tr key={template.id}><td>{template.name}</td><td>{template.origin === 'system' ? '系统只读' : '私人模板'}</td><td>{catalog?.timeTypes.find(type => type.code === template.timeType)?.label ?? REPORT_TIME_LABELS[template.timeType]}</td><td><Button disabled={busy || working} onClick={() => setViewing(template)}>查看字段{template.name}</Button><Button disabled={!canWrite || busy || working || customCount >= 10} onClick={() => open('clone', template)}>另存{template.name}</Button>{template.origin === 'custom' && <><Button disabled={!canWrite || busy || working} onClick={() => open('edit', template)}>编辑{template.name}</Button><Button disabled={!canWrite || busy || working} onClick={() => { if (!lock.current) { setDeleting(template); setViewing(null); setError(''); setConflict(false) } }}>删除{template.name}</Button></>}</td></tr>)}</tbody></table></div>
        {loaded && !templates.some(template => template.kind === kind) && <p>当前报告类型暂无模板。</p>}
        {customCount >= 10 && <p>已达到私人模板总数上限 10 个，可编辑已有模板或先删除不再使用的模板。</p>}
        {templates.some(template => template.kind !== kind && template.origin === 'custom') && <section className="report-template-other-kinds"><h3>其他报告类型的私人模板</h3><p>可删除自己的其他类型模板以释放总容量；报告数据仍遵循原有站点权限。</p><div className="report-template-table-scroll"><table className="report-template-table"><thead><tr><th>模板名称</th><th>报告类型</th><th>周期选择</th><th>操作</th></tr></thead><tbody>{templates.filter(template => template.kind !== kind && template.origin === 'custom').map(template => <tr key={template.id}><td>{template.name}</td><td>{REPORT_KIND_LABELS[template.kind]}</td><td>{REPORT_TIME_LABELS[template.timeType]}</td><td><Button disabled={!canWrite || busy || working} onClick={() => { if (!lock.current) { setDeleting(template); setViewing(null); setError(''); setConflict(false) } }}>删除其他类型模板{template.name}</Button></td></tr>)}</tbody></table></div></section>}
        {effective && catalog && <section className="report-template-editor"><h3>{draft ? draft.mode === 'clone' ? '另存为私人模板' : draft.mode === 'edit' ? '编辑私人模板' : '新增私人模板' : `字段配置 · ${effective.name}`}</h3>
          {draft && <fieldset disabled={!canWrite || busy}><Field label="报表模板名称"><input maxLength={50} value={draft.value.name} onChange={event => setDraft({ ...draft, value: { ...draft.value, name: event.target.value } })} /></Field><Field label="模板周期"><select disabled={draft.mode === 'clone'} value={draft.value.timeType} onChange={event => setDraft({ ...draft, value: { ...draft.value, timeType: event.target.value as ReportTimeType } })}>{catalog.timeTypes.map(type => <option key={type.code} value={type.code}>{type.label}</option>)}</select></Field></fieldset>}
          {draft?.mode === 'clone' && <p>另存保留原模板的字段与周期；完成后可编辑新的私人模板。</p>}
          <div className="report-template-groups">{[...new Set(catalog.fields.map(field => field.group))].map(group => <fieldset key={group} disabled={!draft || draft.mode === 'clone' || !canWrite || busy}><legend>{group || '报告字段'}</legend>{catalog.fields.filter(field => field.group === group).map(field => <label key={field.code}><input type="checkbox" aria-label={field.label} checked={effective.fields.includes(field.code)} disabled={locked.has(field.code)} onChange={event => { if (!draft) return; try { setDraft({ ...draft, value: { ...draft.value, fields: toggleReportTemplateField(draft.value.fields, field.code, event.target.checked, catalog) } }) } catch (cause) { failed(cause) } }} /><span>{field.label}{locked.has(field.code) ? '（必选）' : ''}</span>{field.linkRef.length > 0 && <small>联动：{field.linkRef.map(code => catalog.fields.find(item => item.code === code)?.label ?? code).join('、')}</small>}</label>)}</fieldset>)}</div>
          {unknown.length > 0 && <div><p role="alert">以下字段已不在目录中：{unknown.join('、')}。请刷新核对，或明确移除后再保存。</p><Button disabled={!canWrite || busy || draft?.mode === 'clone'} onClick={() => { if (draft) setDraft({ ...draft, value: { ...draft.value, fields: normalizeReportTemplateFields(draft.value.fields.filter(code => !unknown.includes(code)), catalog) } }) }}>移除失效字段</Button></div>}
          {draft ? <div className="report-template-toolbar"><Button disabled={busy} onClick={cancel}>取消模板编辑</Button><Button variant="primary" disabled={!canWrite || busy || conflict || missing || !loaded || unknown.length > 0} onClick={save}>{draft.mode === 'clone' ? '确认另存模板' : '保存报表模板'}</Button></div> : <Button onClick={() => setViewing(null)}>关闭字段查看</Button>}
        </section>}
        {deleting && <section className="report-template-delete"><p>确认删除私人模板「{deleting.name}」？已生成报告保留其原有模板快照。</p><Button disabled={busy} onClick={() => { setDeleting(null); setConflict(false) }}>取消删除模板</Button><Button disabled={!canWrite || busy || conflict || !loaded} onClick={() => void mutate(() => deleteReportTemplate(deleting), '私人模板已删除。')}>确认删除报表模板</Button></section>}
        <p className="station-subtle">字段来自本项目现有报告目录。自动调度、外部投递与尚未取得契约的参考字段仍待实现。</p>
      </>}
    </div>
  </Modal>{leave.confirmation}</div>
}
