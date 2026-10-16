import { useEffect, useRef, useState } from 'react'
import { ApiError, DEMO_MODE } from '@/api/client'
import { createStationGenerationPlan, deleteStationGenerationPlan, generationPlanYears, loadStationGenerationPlans, normalizeGenerationMonths, updateStationGenerationPlan, type GenerationMonth, type StationGenerationPlan } from '@/api/stationGenerationPlans'
import { Modal, Field } from './station-provision/Common'
import { Button } from './ui/Workspace'
import { useConfigurationLeaveGuard } from './useConfigurationLeaveGuard'
import type { RegisterLeaveGuard } from './useEditorLeaveGuard'
import './station-provision/station-entry.css'
import './station-generation-plans.css'

type Props = { station: { id: string; name: string }; canEdit: boolean; onClose: () => void; registerLeaveGuard?: RegisterLeaveGuard }
type Draft = StationGenerationPlan
const fingerprint = (draft: Draft) => JSON.stringify({ year: draft.year, months: draft.months })
const blankMonths = (): GenerationMonth[] => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, plannedKwh: '', excellentKwh: null }))
const byYear = (a: StationGenerationPlan, b: StationGenerationPlan) => b.year - a.year

/** Figma 1114:8271 is the table/modal alternative; no separate generation-plan board exists. */
export default function StationGenerationPlansPanel(props: Props) {
  return <GenerationPlansEditor key={props.station.id} {...props} />
}
function GenerationPlansEditor({ station, canEdit, onClose, registerLeaveGuard }: Props) {
  const [records, setRecords] = useState<StationGenerationPlan[]>([])
  const [draft, setDraft] = useState<Draft | null>(null), [baseline, setBaseline] = useState('')
  const [deleting, setDeleting] = useState<StationGenerationPlan | null>(null)
  const [yearFilter, setYearFilter] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [conflict, setConflict] = useState(false), [missing, setMissing] = useState(false), [revoked, setRevoked] = useState(false)
  const lock = useRef(false), alive = useRef(true), destination = useRef<() => void>(onClose)
  const years = generationPlanYears(), canWrite = canEdit && !revoked && !DEMO_MODE
  const dirty = !!draft && fingerprint(draft) !== baseline
  const resetDraft = () => { setDraft(null); setBaseline(''); setConflict(false); setMissing(false); setError('') }
  const leave = useConfigurationLeaveGuard({ dirty, busy, registerLeaveGuard, onClose: () => destination.current(), onDiscard: resetDraft })
  function close() { destination.current = onClose; void leave.close() }
  function cancelEditor() { destination.current = resetDraft; void leave.close() }
  function failed(e: unknown) {
    setError(e instanceof Error ? e.message : '读取或保存计划失败，请重试。')
    setConflict(e instanceof ApiError && e.status === 409)
    if (e instanceof ApiError && e.status === 403) setRevoked(true)
  }
  async function refresh() {
    if (DEMO_MODE || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const rows = await loadStationGenerationPlans(station.id)
      if (!alive.current) return
      setRecords([...rows].sort(byYear)); setLoaded(true)
      if (draft?.id) {
        const latest = rows.find(row => row.id === draft.id)
        if (latest) { setDraft({ ...draft, version: latest.version }); setBaseline(fingerprint(latest)); setMissing(false); setConflict(false) }
        else { setMissing(true); setConflict(true); setError('此计划已被删除。输入草稿已保留，请核对后关闭或取消编辑。') }
      } else { setConflict(false); setMissing(false) }
      if (deleting) {
        const latest = rows.find(row => row.id === deleting.id)
        setDeleting(latest ?? null)
        if (!latest) setNotice('该计划已不存在。')
      }
      setRevoked(false)
    } catch (e) { if (alive.current) failed(e) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false } }, [])
  useEffect(() => {
    if (!dirty && !busy) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, busy])
  function openDraft(plan?: StationGenerationPlan) {
    if (draft || deleting || lock.current || !loaded) return
    const next: Draft = plan ? { ...plan, months: plan.months.map(month => ({ ...month })) } : { id: '', stationId: station.id, year: years[20], months: blankMonths(), version: 0 }
    setDraft(next); setBaseline(fingerprint(next)); setError(''); setNotice(''); setConflict(false); setMissing(false)
  }
  async function save() {
    if (!draft || !canWrite || !loaded || lock.current || conflict || missing) return
    let months: GenerationMonth[]
    try { months = normalizeGenerationMonths(draft.months) } catch (e) { failed(e); return }
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const saved = draft.id ? await updateStationGenerationPlan({ ...draft, months }) : await createStationGenerationPlan(station.id, draft.year, months)
      if (!alive.current) return
      setRecords(rows => [...rows.filter(row => row.id !== saved.id), saved].sort(byYear))
      resetDraft(); setNotice('年度发电计划已保存。')
    } catch (e) { if (alive.current) failed(e) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function remove() {
    if (!deleting || !canWrite || lock.current || conflict) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await deleteStationGenerationPlan(deleting)
      if (!alive.current) return
      setRecords(rows => rows.filter(row => row.id !== deleting.id)); setDeleting(null); setNotice('年度发电计划已删除。')
    } catch (e) { if (alive.current) failed(e) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  const existingYear = draft && !draft.id ? records.find(row => row.year === draft.year) : null
  const filtered = records.filter(row => !yearFilter || row.year === Number(yearFilter))
  return <div className="station-entry-scope generation-plans-scope"><Modal title={`${station.name} · 年度月发电计划`} onClose={close} actions={<Button disabled={busy} onClick={close}>关闭计划</Button>}>
    <div className="generation-plans-panel">
      {DEMO_MODE ? <p>演示模式：年度月发电计划服务不可用，仅在 API 模式提供。</p> : <>
        <p className="station-subtle">常规计划须填写全部 12 个月，卓越计划可选；单位 kWh。仅保存计划配置。</p>
        {!canWrite && <p>{revoked ? '权限已变化，已停用编辑操作；未保存输入仍保留。' : '当前仅有查看权限。'}</p>}
        <div className="generation-plans-toolbar"><Field label="筛选年份"><select value={yearFilter} disabled={busy} onChange={e => setYearFilter(e.target.value)}><option value="">全部年份</option>{Array.from(new Set([...years, ...records.map(row => row.year)])).sort((a, b) => b - a).map(year => <option key={year} value={year}>{year}年</option>)}</select></Field>
          <Button disabled={busy} onClick={() => void refresh()}>刷新计划（保留草稿）</Button>
          {canWrite && <Button variant="primary" disabled={busy || !loaded || !!draft || !!deleting} onClick={() => openDraft()}>新增年度计划</Button>}
        </div>
        {error && <p role="alert">{error}</p>}{conflict && <p className="station-subtle">记录已变化，请刷新取得最新版本；月份输入草稿会保留，核对后再次保存。</p>}
        {notice && <p role="status">{notice}</p>}{!loaded && !error && <p role="status">正在读取计划…</p>}
        {loaded && !filtered.length && <p>{records.length ? '该年份暂无计划' : '暂无年度发电计划'}</p>}
        {!!filtered.length && <div className="generation-plans-list"><table className="station-table"><thead><tr><th>年份</th><th>常规月计划</th><th>卓越月计划</th><th>操作</th></tr></thead><tbody>{filtered.map(plan => <tr key={plan.id}><td>{plan.year}年</td><td>已配置 {plan.months.length} 个月</td><td>已配置 {plan.months.filter(month => month.excellentKwh !== null).length} 个月</td><td>
          <Button disabled={busy || !!draft || !!deleting} onClick={() => openDraft(plan)}>{canWrite ? '编辑' : '查看'}{plan.year}年计划</Button>
          {canWrite && <Button disabled={busy || !!draft || !!deleting} onClick={() => { setDeleting(plan); setConflict(false); setError('') }}>删除{plan.year}年计划</Button>}
        </td></tr>)}</tbody></table></div>}
        {draft && <section className="generation-plans-editor" aria-label={draft.id ? `${draft.year}年计划详情` : '新增年度计划表单'}>
          <h3>{draft.id ? `${draft.year}年计划` : '新增年度计划'}</h3>
          <Field label="计划年份"><select value={draft.year} disabled={!canWrite || busy || !!draft.id} onChange={e => { setDraft({ ...draft, year: Number(e.target.value) }); setConflict(false) }}>{Array.from(new Set([...years, draft.year])).sort((a, b) => b - a).map(year => <option key={year} value={year}>{year}年</option>)}</select></Field>
          <p className="station-subtle">{draft.id ? '已有计划的年份不可修改。' : '新建年份按上海时区当前年前后 20 年选择。'} 常规及卓越值为 0.01–99999999.99，最多 2 位小数。</p>
          {existingYear && <p>该年份已有计划。<Button disabled={!canWrite || busy} onClick={() => { setDraft({ ...draft, id: existingYear.id, version: existingYear.version }); setBaseline(fingerprint(existingYear)); setConflict(false); setMissing(false); setError('') }}>改为编辑已有年度计划（保留输入）</Button></p>}
          <fieldset disabled={!canWrite || busy} className="generation-months"><legend className="generation-visually-hidden">12 个月发电计划，单位 kWh</legend><div className="generation-month-table-wrap"><table className="station-table"><thead><tr><th>月份</th><th>常规计划（kWh）*</th><th>卓越计划（kWh）</th></tr></thead><tbody>{draft.months.map((month, index) => <tr key={month.month}><th scope="row">{month.month}月</th><td><input aria-label={`${month.month}月常规计划（kWh）`} inputMode="decimal" required maxLength={64} value={month.plannedKwh} onChange={e => setDraft({ ...draft, months: draft.months.map((row, i) => i === index ? { ...row, plannedKwh: e.target.value } : row) })} /></td><td><input aria-label={`${month.month}月卓越计划（kWh）`} inputMode="decimal" maxLength={64} placeholder="可选" value={month.excellentKwh ?? ''} onChange={e => setDraft({ ...draft, months: draft.months.map((row, i) => i === index ? { ...row, excellentKwh: e.target.value || null } : row) })} /></td></tr>)}</tbody></table></div></fieldset>
          <div className="generation-plans-actions"><Button disabled={busy} onClick={cancelEditor}>取消编辑计划</Button><Button variant="primary" disabled={!canWrite || busy || conflict || missing || !!existingYear} onClick={() => void save()}>保存年度计划</Button></div>
        </section>}
        {deleting && <section className="generation-plans-delete"><p>确认删除 {deleting.year} 年的全部 12 个月发电计划？</p><div className="generation-plans-actions"><Button disabled={busy} onClick={() => { setDeleting(null); setConflict(false); setError('') }}>取消删除计划</Button><Button disabled={!canWrite || busy || conflict} onClick={() => void remove()}>确认删除年度计划</Button></div></section>}
      </>}
    </div>
  </Modal>{leave.confirmation}</div>
}
