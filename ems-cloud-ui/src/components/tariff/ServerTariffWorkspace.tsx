import { useEffect, useRef, useState } from 'react'
import type { Station } from '@/App'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { hasStationPermission } from '@/auth/apiPermissions'
import {
  TARIFF_BANDS, archiveTariffTemplate, canModifyTariffBinding, createTariffBinding, createTariffTemplate,
  loadTariffBindingHistory, loadTariffBindings, loadTariffTemplates, removeTariffBinding, shanghaiToday,
  shanghaiTomorrow, tariffMinute, tariffTime, updateTariffBindingDates, updateTariffTemplate,
  type ServerTariffPeriod, type ServerTariffTemplate, type TariffBand, type TariffBinding, type TariffPricingMode,
} from '@/api/tariffTemplates'
import { Button } from '../ui/Workspace'
import { Modal, Field } from '../station-provision/Common'
import { useConfigurationLeaveGuard } from '../useConfigurationLeaveGuard'
import type { RegisterLeaveGuard } from '../useEditorLeaveGuard'
import '../station-provision/station-entry.css'
import './server-tariff.css'

type Props = { station: Station; onOpenStrategy?: () => void; registerLeaveGuard?: RegisterLeaveGuard }
type PeriodDraft = { key: string; start: string; end: string; band: TariffBand; price: string }
type TemplateDraft = { id: string; name: string; currency: string; pricingMode: TariffPricingMode; version: number; fixedPrice: string; periods: PeriodDraft[] }
type BindingDraft = { mode: 'create' | 'dates'; source: TariffBinding | null; templateId: string; expectedTemplateVersion: number | null; validFrom: string; validUntil: string }
type Confirmation = { kind: 'archive'; template: ServerTariffTemplate } | { kind: 'remove'; binding: TariffBinding }
type PriceView = { name: string; currency: string; periods: ServerTariffPeriod[]; version: number | null }
const tomorrowEnd = () => { const date = new Date(`${shanghaiTomorrow()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10) }
const templateFingerprint = (draft: TemplateDraft) => JSON.stringify({ name: draft.name, currency: draft.currency, pricingMode: draft.pricingMode, fixedPrice: draft.fixedPrice, periods: draft.periods.map(({ key: _key, ...period }) => period) })
const bindingFingerprint = (draft: BindingDraft) => JSON.stringify({ templateId: draft.templateId, validFrom: draft.validFrom, validUntil: draft.validUntil })
const bandLabel = (band: TariffBand) => TARIFF_BANDS.find(item => item.value === band)?.label ?? band
const bindingStatus = (binding: TariffBinding) => !binding.active ? '已解除' : binding.validFrom > shanghaiToday() ? '未来生效' : binding.validUntil <= shanghaiToday() ? '已结束' : '生效中'

/** Figma 1051:820 is an operations table/editor alternative; no independent tariff board exists in 4:4. */
export default function ServerTariffWorkspace(props: Props) {
  const { user } = useAuth()
  return <ServerTariffEditor key={`${user?.id}:${user?.tenantName}:${props.station.id}`} {...props} canManage={hasStationPermission(user, props.station.id, 'tariff.manage')} />
}
function ServerTariffEditor({ station, onOpenStrategy, registerLeaveGuard, canManage }: Props & { canManage: boolean }) {
  const [templates, setTemplates] = useState<ServerTariffTemplate[]>([]), [bindings, setBindings] = useState<TariffBinding[]>([])
  const [tab, setTab] = useState<'bindings' | 'templates'>('bindings'), [includeInactive, setIncludeInactive] = useState(true)
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null), [bindingDraft, setBindingDraft] = useState<BindingDraft | null>(null)
  const [templateBase, setTemplateBase] = useState(''), [bindingBase, setBindingBase] = useState(''), [confirm, setConfirm] = useState<Confirmation | null>(null)
  const [history, setHistory] = useState<{ binding: TariffBinding; rows: TariffBinding[] } | null>(null), [priceView, setPriceView] = useState<PriceView | null>(null)
  const [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [revoked, setRevoked] = useState(false), [conflict, setConflict] = useState(false), [missing, setMissing] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState('')
  const alive = useRef(true), lock = useRef(false), sequence = useRef(0), destination = useRef<() => void>(() => {}), periodSequence = useRef(0)
  const canWrite = canManage && !revoked, working = !!templateDraft || !!bindingDraft || !!confirm
  const dirty = (!!templateDraft && templateFingerprint(templateDraft) !== templateBase) || (!!bindingDraft && bindingFingerprint(bindingDraft) !== bindingBase)
  function discard() { setTemplateDraft(null); setBindingDraft(null); setTemplateBase(''); setBindingBase(''); setConfirm(null); setConflict(false); setMissing(false); setError('') }
  const leave = useConfigurationLeaveGuard({ dirty, busy, registerLeaveGuard, onClose: () => destination.current(), onDiscard: discard })
  function cancelEditor() { destination.current = discard; void leave.close() }
  function navigateStrategy() { destination.current = onOpenStrategy ?? (() => {}); void leave.close() }
  function failed(cause: unknown) {
    setError(cause instanceof Error ? cause.message : '电价配置请求失败，请重试。')
    setConflict(cause instanceof ApiError && cause.status === 409)
    if (cause instanceof ApiError && cause.status === 403) setRevoked(true)
  }
  const snapshot = () => Promise.all([loadTariffTemplates(), loadTariffBindings(station.id, true)])
  async function refresh() {
    if (lock.current || !canManage) return
    lock.current = true; const request = ++sequence.current, current = () => alive.current && request === sequence.current
    setBusy(true); setError('')
    try {
      const [rows, assignments] = await snapshot()
      if (!current()) return
      setTemplates(rows); setBindings(assignments); setLoaded(true); setRevoked(false); setConflict(false); setMissing(false)
      if (templateDraft?.id) {
        const latest = rows.find(row => row.id === templateDraft.id)
        if (latest) setTemplateDraft({ ...templateDraft, version: latest.version })
        else { setMissing(true); setError('原模板已归档，输入草稿已保留；可明确另存为新模板。') }
      }
      if (bindingDraft) {
        if (bindingDraft.mode === 'create' && bindingDraft.templateId) {
          const latest = rows.find(row => row.id === bindingDraft.templateId)
          if (latest) { setBindingDraft({ ...bindingDraft, expectedTemplateVersion: latest.version }); setNotice('模板版本已刷新，日期草稿已保留；请重新核对购电价格后保存。') }
          else { setMissing(true); setError('所选模板已归档，日期草稿已保留，请重新选择有效模板。') }
        }
        if (bindingDraft.mode === 'dates') {
          const latest = assignments.find(row => row.id === bindingDraft.source?.id)
          if (latest) {
            setBindingDraft({ ...bindingDraft, source: latest })
            if (!canModifyTariffBinding(latest)) setError('该绑定已变为只读，日期输入仍保留；请取消编辑。')
          } else { setMissing(true); setError('该绑定已不存在，日期草稿已保留；请取消编辑后重新读取。') }
        }
      }
      if (confirm) {
        if (confirm.kind === 'archive') { const latest = rows.find(row => row.id === confirm.template.id); setConfirm(latest ? { kind: 'archive', template: latest } : null) }
        else { const latest = assignments.find(row => row.id === confirm.binding.id); setConfirm(latest ? { kind: 'remove', binding: latest } : null) }
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
  const periodDrafts = (periods: ServerTariffPeriod[]): PeriodDraft[] => periods.map(period => ({ key: `period-${++periodSequence.current}`, start: tariffTime(period.startMinute), end: tariffTime(period.endMinute), band: period.band, price: period.pricePerKwh }))
  function openTemplate(template?: ServerTariffTemplate) {
    if (!canWrite || !loaded || lock.current || working) return
    const value: TemplateDraft = template ? { ...template, fixedPrice: template.pricingMode === 'fixed' ? template.periods[0]?.pricePerKwh ?? '' : '', periods: periodDrafts(template.periods) }
      : { id: '', name: '', currency: 'CNY', pricingMode: 'fixed', version: 0, fixedPrice: '', periods: periodDrafts([{ startMinute: 0, endMinute: 1440, band: 'flat', pricePerKwh: '' }]) }
    setTemplateDraft(value); setTemplateBase(templateFingerprint(value)); setError(''); setNotice(''); setConflict(false); setMissing(false)
  }
  function openBinding(binding?: TariffBinding) {
    if (!canWrite || !loaded || lock.current || working || (binding && !canModifyTariffBinding(binding))) return
    const value: BindingDraft = binding ? { mode: 'dates', source: binding, templateId: binding.templateId ?? '', expectedTemplateVersion: binding.templateVersion, validFrom: binding.validFrom, validUntil: binding.validUntil }
      : { mode: 'create', source: null, templateId: '', expectedTemplateVersion: null, validFrom: shanghaiTomorrow(), validUntil: tomorrowEnd() }
    setBindingDraft(value); setBindingBase(bindingFingerprint(value)); setError(''); setNotice(''); setConflict(false); setMissing(false)
  }
  async function mutate(operation: () => Promise<unknown>, success: string) {
    if (!canWrite || !loaded || lock.current || conflict || missing) return
    lock.current = true; const request = ++sequence.current, current = () => alive.current && request === sequence.current
    let committed = false
    setBusy(true); setError(''); setNotice('')
    try {
      await operation(); committed = true
      if (!current()) return
      discard(); setNotice(success)
      const [rows, assignments] = await snapshot()
      if (!current()) return
      setTemplates(rows); setBindings(assignments); setLoaded(true)
    } catch (cause) { if (current()) { failed(cause); if (committed) setLoaded(false) } }
    finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  function saveTemplate() {
    if (!templateDraft) return
    let value: ServerTariffTemplate
    try {
      const periods: ServerTariffPeriod[] = templateDraft.pricingMode === 'fixed'
        ? [{ startMinute: 0, endMinute: 1440, band: 'flat', pricePerKwh: templateDraft.fixedPrice }]
        : templateDraft.periods.map(period => ({ startMinute: tariffMinute(period.start), endMinute: tariffMinute(period.end, true), band: period.band, pricePerKwh: period.price }))
      value = { id: templateDraft.id, name: templateDraft.name, currency: templateDraft.currency, pricingMode: templateDraft.pricingMode, periods, version: templateDraft.version }
    } catch (cause) { failed(cause); return }
    void mutate(() => value.id ? updateTariffTemplate(value) : createTariffTemplate(value), '购电模板已保存到服务器。')
  }
  function saveBinding() {
    if (!bindingDraft) return
    const value = bindingDraft
    if (value.mode === 'dates') { if (value.source) void mutate(() => updateTariffBindingDates(value.source!, value.validFrom, value.validUntil), '未来生效区间已修改，历史版本已保留。'); return }
    if (!value.templateId || value.expectedTemplateVersion === null || !templates.some(template => template.id === value.templateId)) { setError('请选择有效购电模板。'); return }
    void mutate(() => createTariffBinding(station.id, { id: value.templateId, version: value.expectedTemplateVersion! }, value.validFrom, value.validUntil), '未来购电绑定已保存，价格版本已冻结。')
  }
  async function showHistory(binding: TariffBinding) {
    if (lock.current || working || !loaded) return
    lock.current = true; const request = ++sequence.current, current = () => alive.current && request === sequence.current
    setBusy(true); setError('')
    try { const rows = await loadTariffBindingHistory(binding); if (current()) setHistory({ binding, rows }) }
    catch (cause) { if (current()) failed(cause) }
    finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  const bindingReadonly = bindingDraft?.mode === 'dates' && (!bindingDraft.source || !canModifyTariffBinding(bindingDraft.source))
  const selectedTemplate = bindingDraft?.mode === 'create' ? templates.find(template => template.id === bindingDraft.templateId) : null
  const priceTable = (value: PriceView) => <div className="server-tariff-table-scroll"><table className="server-tariff-table"><thead><tr><th>开始</th><th>结束（不含）</th><th>类型</th><th>购电价（{value.currency}/kWh）</th></tr></thead><tbody>{value.periods.map((period, index) => <tr key={index}><td>{tariffTime(period.startMinute)}</td><td>{tariffTime(period.endMinute)}</td><td>{bandLabel(period.band)}</td><td>{period.pricePerKwh}</td></tr>)}</tbody></table></div>
  return <main className="server-tariff-workspace station-entry-scope" data-design-alternative="1051:820">
    <nav className="server-tariff-breadcrumb" aria-label="电价导航">{onOpenStrategy && <Button onClick={navigateStrategy}>策略运行</Button>}<span>电价设置</span></nav>
    <header className="server-tariff-heading"><div><h1>购电费率配置</h1><p>{station.name} · 模板版本与站点生效区间由服务器保存</p></div><div className="server-tariff-actions"><Button disabled={busy || !canManage} onClick={() => void refresh()}>刷新服务器配置（保留草稿）</Button><Button disabled={!canWrite || busy || !loaded || working} onClick={() => openBinding()}>新建未来生效区间</Button><Button variant="primary" disabled={!canWrite || busy || !loaded || working} onClick={() => openTemplate()}>新增购电模板</Button></div></header>
    {!canWrite && <p className="server-tariff-notice">当前没有写入权限；已输入的草稿仍保留。</p>}
    {error && !templateDraft && !bindingDraft && !confirm && <p className="server-tariff-error" role="alert">{error}</p>}{notice && <p className="server-tariff-notice" role="status">{notice}</p>}
    <div className="server-tariff-tabs" role="tablist" aria-label="购电配置视图"><button role="tab" aria-selected={tab === 'bindings'} disabled={busy || working} onClick={() => setTab('bindings')}>站点购电绑定</button><button role="tab" aria-selected={tab === 'templates'} disabled={busy || working} onClick={() => setTab('templates')}>购电模板库</button></div>
    {tab === 'templates' ? <section className="server-tariff-card"><h2>手工购电模板</h2><p>保存修改会创建新的价格版本；已有绑定保留原名称、币种和价格。归档不解除已有绑定。</p><div className="server-tariff-table-scroll"><table className="server-tariff-table"><thead><tr><th>模板名称</th><th>币种</th><th>购电方式</th><th>当前版本</th><th>操作</th></tr></thead><tbody>{templates.map(template => <tr key={template.id}><td>{template.name}</td><td>{template.currency}</td><td>{template.pricingMode === 'fixed' ? '固定' : '分时'} · {template.periods.length} 段</td><td>v{template.version}</td><td><div className="server-tariff-actions"><Button disabled={busy || working} onClick={() => setPriceView({ ...template })}>查看时段{template.name}</Button><Button disabled={!canWrite || busy || working || !loaded} onClick={() => openTemplate(template)}>编辑为新版本{template.name}</Button><Button disabled={!canWrite || busy || working || !loaded} onClick={() => { setConfirm({ kind: 'archive', template }); setError(''); setConflict(false) }}>归档{template.name}</Button></div></td></tr>)}{!templates.length && <tr><td colSpan={5}>{loaded ? '暂无购电模板，请新增模板。' : '正在读取模板…'}</td></tr>}</tbody></table></div></section>
      : <section className="server-tariff-card"><div className="server-tariff-heading"><div><h2>站点绑定与历史</h2><p>生效日期含当日，结束日期不含当日。仅上海时间明天及之后开始的有效绑定可改期或解除。</p></div><label className="server-tariff-inline"><input type="checkbox" checked={includeInactive} onChange={event => setIncludeInactive(event.target.checked)} />显示已解除绑定</label></div><div className="server-tariff-table-scroll"><table className="server-tariff-table"><thead><tr><th>名称 / 价格版本</th><th>币种</th><th>生效日期</th><th>结束日期（不含）</th><th>状态</th><th>操作</th></tr></thead><tbody>{bindings.filter(binding => includeInactive || binding.active).map(binding => <tr key={binding.id}><td>{binding.name}<small>{binding.templateId ? `模板价格 v${binding.templateVersion}` : '遗留绑定（无模板身份）'}</small></td><td>{binding.currency}</td><td>{binding.validFrom}</td><td>{binding.validUntil}</td><td>{bindingStatus(binding)}{!canModifyTariffBinding(binding) && <small>只读</small>}</td><td><div className="server-tariff-actions"><Button disabled={busy || working} onClick={() => setPriceView({ name: binding.name, currency: binding.currency, periods: binding.periods, version: binding.templateVersion })}>查看绑定价格{binding.name}</Button><Button disabled={busy || working || !loaded} onClick={() => void showHistory(binding)}>查看历史{binding.name}</Button><Button disabled={!canWrite || busy || working || !loaded || !canModifyTariffBinding(binding)} onClick={() => openBinding(binding)}>改期{binding.name}</Button><Button disabled={!canWrite || busy || working || !loaded || !canModifyTariffBinding(binding)} onClick={() => { setConfirm({ kind: 'remove', binding }); setError(''); setConflict(false) }}>解除{binding.name}</Button></div></td></tr>)}{!bindings.filter(binding => includeInactive || binding.active).length && <tr><td colSpan={6}>{loaded ? '暂无符合条件的购电绑定。' : '正在读取站点绑定…'}</td></tr>}</tbody></table></div></section>}
    <p className="server-tariff-todo">外部/自动/阶梯电价、独立售电、基本电费、工作日与按月小时导入仍待实现；已生效绑定的未来截断与替换也待明确。本页不修改或重算结算金额。</p>
    {templateDraft && <Modal title={templateDraft.id ? '编辑购电模板新版本' : '新增购电模板'} onClose={cancelEditor} actions={<><Button disabled={busy} onClick={cancelEditor}>取消模板编辑</Button><Button variant="primary" disabled={!canWrite || busy || !loaded || conflict || missing} onClick={saveTemplate}>保存购电模板</Button></>}><div className="server-tariff-editor">
      <p>价格按十进制字符串保存，最多六位小数；可填写零或负价。</p>{error && <p role="alert">{error}</p>}{conflict && <p>请刷新服务器配置以取得最新版本，输入内容会保留。</p>}
      <Button disabled={busy} onClick={() => void refresh()}>刷新模板版本（保留草稿）</Button>
      {missing && <Button disabled={!canWrite || busy} onClick={() => { setTemplateDraft({ ...templateDraft, id: '', version: 0 }); setMissing(false); setConflict(false); setError('') }}>明确另存为新购电模板</Button>}
      <fieldset disabled={!canWrite || busy}><div className="server-tariff-form-grid"><Field label="购电模板名称"><input maxLength={50} value={templateDraft.name} onChange={event => setTemplateDraft({ ...templateDraft, name: event.target.value })} /></Field><Field label="购电币种"><input maxLength={3} value={templateDraft.currency} onChange={event => setTemplateDraft({ ...templateDraft, currency: event.target.value.toUpperCase() })} /></Field><Field label="购电方式"><select value={templateDraft.pricingMode} onChange={event => setTemplateDraft({ ...templateDraft, pricingMode: event.target.value as TariffPricingMode })}><option value="fixed">固定</option><option value="tou">分时</option></select></Field></div>
        {templateDraft.pricingMode === 'fixed' ? <Field label="全天购电价格"><input inputMode="decimal" value={templateDraft.fixedPrice} onChange={event => setTemplateDraft({ ...templateDraft, fixedPrice: event.target.value })} placeholder="例如输入十进制价格" /></Field> : <><div className="server-tariff-table-scroll"><table className="server-tariff-table"><thead><tr><th>开始时间</th><th>结束时间（不含）</th><th>峰平谷</th><th>购电价（{templateDraft.currency}/kWh）</th><th>操作</th></tr></thead><tbody>{templateDraft.periods.map((period, index) => <tr key={period.key}><td><input aria-label={`时段${index + 1}开始时间`} value={period.start} placeholder="00:00" onChange={event => setTemplateDraft({ ...templateDraft, periods: templateDraft.periods.map(row => row.key === period.key ? { ...row, start: event.target.value } : row) })} /></td><td><input aria-label={`时段${index + 1}结束时间`} value={period.end} placeholder="24:00" onChange={event => setTemplateDraft({ ...templateDraft, periods: templateDraft.periods.map(row => row.key === period.key ? { ...row, end: event.target.value } : row) })} /></td><td><select aria-label={`时段${index + 1}峰平谷`} value={period.band} onChange={event => setTemplateDraft({ ...templateDraft, periods: templateDraft.periods.map(row => row.key === period.key ? { ...row, band: event.target.value as TariffBand } : row) })}>{TARIFF_BANDS.map(band => <option key={band.value} value={band.value}>{band.label}</option>)}</select></td><td><input aria-label={`时段${index + 1}购电价格`} inputMode="decimal" value={period.price} onChange={event => setTemplateDraft({ ...templateDraft, periods: templateDraft.periods.map(row => row.key === period.key ? { ...row, price: event.target.value } : row) })} /></td><td><Button disabled={templateDraft.periods.length <= 1} onClick={() => setTemplateDraft({ ...templateDraft, periods: templateDraft.periods.filter(row => row.key !== period.key) })}>移除时段{index + 1}</Button></td></tr>)}</tbody></table></div><Button disabled={templateDraft.periods.length >= 96} onClick={() => setTemplateDraft({ ...templateDraft, periods: [...templateDraft.periods, { key: `period-${++periodSequence.current}`, start: '', end: '', band: 'flat', price: '' }] })}>添加购电时段</Button></>}
      </fieldset>
    </div></Modal>}
    {bindingDraft && <Modal title={bindingDraft.mode === 'create' ? '新建未来购电绑定' : '修改未来生效日期'} onClose={cancelEditor} actions={<><Button disabled={busy} onClick={cancelEditor}>取消绑定编辑</Button><Button variant="primary" disabled={!canWrite || busy || !loaded || conflict || missing || !!bindingReadonly} onClick={saveBinding}>保存购电绑定</Button></>}><div className="server-tariff-editor"><p>生效日期须为上海时间明天或之后；结束日期不含当日。绑定后冻结所选模板的名称与价格版本。</p>{error && <p role="alert">{error}</p>}{conflict && <p>记录已变化，请刷新版本后核对日期和价格；草稿会保留。</p>}<Button disabled={busy} onClick={() => void refresh()}>刷新绑定版本（保留日期）</Button>
      <fieldset disabled={!canWrite || busy || !!bindingReadonly}>{bindingDraft.mode === 'create' ? <Field label="绑定购电模板"><select value={bindingDraft.templateId} onChange={event => { const template = templates.find(row => row.id === event.target.value); setBindingDraft({ ...bindingDraft, templateId: event.target.value, expectedTemplateVersion: template?.version ?? null }); setMissing(false); setConflict(false); setError('') }}><option value="">请选择模板</option>{bindingDraft.templateId && !selectedTemplate && <option value={bindingDraft.templateId} disabled>所选模板已归档，请重新选择</option>}{templates.map(template => <option key={template.id} value={template.id}>{template.name} · v{template.version}</option>)}</select></Field> : <p>原绑定：{bindingDraft.source?.name} · {bindingDraft.source?.templateVersion === null ? '遗留规则' : `价格 v${bindingDraft.source?.templateVersion}`}。改期不会改变价格。</p>}<div className="server-tariff-form-grid"><Field label="购电生效日期"><input type="date" min={shanghaiTomorrow()} value={bindingDraft.validFrom} onChange={event => setBindingDraft({ ...bindingDraft, validFrom: event.target.value })} /></Field><Field label="购电结束日期（不含）"><input type="date" min={bindingDraft.validFrom} value={bindingDraft.validUntil} onChange={event => setBindingDraft({ ...bindingDraft, validUntil: event.target.value })} /></Field></div></fieldset>
      {selectedTemplate && <section><h3>待绑定价格 · {selectedTemplate.name} v{selectedTemplate.version}</h3>{priceTable({ ...selectedTemplate })}</section>}
    </div></Modal>}
    {confirm && <Modal title={confirm.kind === 'archive' ? '归档购电模板' : '解除未来购电绑定'} onClose={() => { if (!busy) { setConfirm(null); setConflict(false) } }} actions={<><Button disabled={busy} onClick={() => { setConfirm(null); setConflict(false) }}>取消操作</Button><Button disabled={!canWrite || busy || conflict || !loaded || (confirm.kind === 'remove' && !canModifyTariffBinding(confirm.binding))} onClick={() => void mutate(() => confirm.kind === 'archive' ? archiveTariffTemplate(confirm.template) : removeTariffBinding(confirm.binding), confirm.kind === 'archive' ? '购电模板已归档，既有绑定保持原价格。' : '未来绑定已解除，历史版本已保留。')}>{confirm.kind === 'archive' ? '确认归档购电模板' : '确认解除未来绑定'}</Button></>}><div className="server-tariff-editor"><p>{confirm.kind === 'archive' ? `确认归档「${confirm.template.name}」？以后不能再用该模板新建绑定，已绑定价格不会改变。` : `确认解除「${confirm.binding.name}」的未来生效区间？记录保留在历史中。`}</p>{error && <p role="alert">{error}</p>}{confirm.kind === 'remove' && !canModifyTariffBinding(confirm.binding) && <p>该绑定当前已为只读，不能解除。</p>}<Button disabled={busy} onClick={() => void refresh()}>刷新确认版本</Button></div></Modal>}
    {priceView && <Modal title={`购电价格 · ${priceView.name}`} onClose={() => setPriceView(null)} actions={<Button onClick={() => setPriceView(null)}>关闭价格查看</Button>}><div className="server-tariff-editor"><p>{priceView.version === null ? '遗留绑定快照' : `价格版本 v${priceView.version}`}</p>{priceTable(priceView)}</div></Modal>}
    {history && <Modal title={`绑定历史 · ${history.binding.name}`} onClose={() => { if (!busy) setHistory(null) }} actions={<Button disabled={busy} onClick={() => setHistory(null)}>关闭绑定历史</Button>}><div className="server-tariff-editor"><p>历史版本仅供查看；只能在站点绑定列表操作当前且允许修改的记录。</p><Button disabled={busy} onClick={() => void showHistory(history.binding)}>刷新绑定历史</Button>{history.rows.map(row => <section key={row.version} className="server-tariff-history-row"><h3>绑定版本 v{row.version} · {row.active ? '有效记录' : '已解除'}</h3><p>{row.name} · {row.currency} · {row.validFrom} 至 {row.validUntil}（结束日不含）· {row.templateVersion === null ? '遗留价格' : `模板价格 v${row.templateVersion}`}</p>{priceTable({ name: row.name, currency: row.currency, periods: row.periods, version: row.templateVersion })}</section>)}{!history.rows.length && <p>暂无历史记录。</p>}</div></Modal>}
    {leave.confirmation}
  </main>
}
