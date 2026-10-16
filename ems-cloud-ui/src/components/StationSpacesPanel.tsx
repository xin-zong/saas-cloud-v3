import { useEffect, useRef, useState } from 'react'
import { ApiError, DEMO_MODE } from '@/api/client'
import {
  SPACE_TYPES, bindStationSpaceDevices, createStationSpace, deleteStationSpace, loadStationSpaceDevices,
  loadStationSpaces, moveStationSpace, normalizeSpaceName, orderedStationSpaces, renameStationSpace,
  stationSpaceDescendants, unbindStationSpaceDevice,
  type StationSpace, type StationSpaceDevice, type StationSpaceDevicePage, type StationSpaceType,
} from '@/api/stationSpaces'
import { Modal, Field } from './station-provision/Common'
import { Button } from './ui/Workspace'
import { useConfigurationLeaveGuard } from './useConfigurationLeaveGuard'
import type { RegisterLeaveGuard } from './useEditorLeaveGuard'
import './station-provision/station-entry.css'
import './station-spaces.css'

type Props = { station: { id: string; name: string }; canEdit: boolean; onClose: () => void; registerLeaveGuard?: RegisterLeaveGuard }
type Draft = { mode: 'create' | 'rename' | 'move'; id: string; name: string; type: StationSpaceType; parentId: string | null; version: number }
type Confirmation = { kind: 'delete'; space: StationSpace } | { kind: 'unbind'; space: StationSpace; device: StationSpaceDevice }
const fingerprint = (draft: Draft) => JSON.stringify({ name: draft.name, type: draft.type, parentId: draft.parentId })
const typeLabel = (type: number) => SPACE_TYPES.find(item => item.value === type)?.label ?? '未知类型'
const PAGE_SIZE = 20

/** Figma 1114:8271 supplies the current table/modal alternative; no separate space board exists. */
export default function StationSpacesPanel(props: Props) {
  return <StationSpacesEditor key={props.station.id} {...props} />
}
function StationSpacesEditor({ station, canEdit, onClose, registerLeaveGuard }: Props) {
  const [spaces, setSpaces] = useState<StationSpace[]>([]), [selectedId, setSelectedId] = useState('')
  const [devices, setDevices] = useState<StationSpaceDevicePage>({ items: [], total: 0 })
  const [selection, setSelection] = useState<Record<string, StationSpaceDevice>>({})
  const [queryInput, setQueryInput] = useState(''), [query, setQuery] = useState(''), [scope, setScope] = useState('all'), [offset, setOffset] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null), [baseline, setBaseline] = useState(''), [confirm, setConfirm] = useState<Confirmation | null>(null)
  const [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [revoked, setRevoked] = useState(false)
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [conflict, setConflict] = useState(false), [missing, setMissing] = useState(false)
  const lock = useRef(false), alive = useRef(true), sequence = useRef(0), destination = useRef<() => void>(onClose)
  const canWrite = canEdit && !revoked && !DEMO_MODE, selected = spaces.find(space => space.id === selectedId)
  const selectionIds = Object.keys(selection), working = !!draft || !!confirm || selectionIds.length > 0
  const dirty = (!!draft && fingerprint(draft) !== baseline) || selectionIds.length > 0
  function discard() { setDraft(null); setBaseline(''); setConfirm(null); setSelection({}); setConflict(false); setMissing(false); setError('') }
  const leave = useConfigurationLeaveGuard({ dirty, busy, registerLeaveGuard, onClose: () => destination.current(), onDiscard: discard })
  function close() { destination.current = onClose; void leave.close() }
  function cancelDraft() { destination.current = discard; void leave.close() }
  function failed(e: unknown) {
    setError(e instanceof Error ? e.message : '空间管理请求失败，请重试。')
    setConflict(e instanceof ApiError && e.status === 409)
    if (e instanceof ApiError && e.status === 403) setRevoked(true)
  }
  const filter = () => ({ q: query, ...(scope === 'current' && selectedId ? { spaceId: selectedId } : {}), unassigned: scope === 'unassigned', limit: PAGE_SIZE, offset })
  const snapshot = async () => {
    const rows = await loadStationSpaces(station.id)
    const currentFilter = filter()
    if (selectedId && !rows.some(row => row.id === selectedId)) { delete currentFilter.spaceId; currentFilter.offset = 0 }
    const page = await loadStationSpaceDevices(station.id, currentFilter)
    return [rows, page] as const
  }
  async function refreshedSelection(rows: StationSpace[], isCurrent: () => boolean) {
    if (!selectionIds.length) return
    const remaining = new Set(selectionIds), found: Record<string, StationSpaceDevice> = {}
    for (let start = 0; remaining.size; start += 100) {
      const page = await loadStationSpaceDevices(station.id, { limit: 100, offset: start })
      if (!isCurrent()) return
      for (const device of page.items) if (remaining.has(device.deviceId)) {
        remaining.delete(device.deviceId)
        if (!device.spaceId || device.spaceId === selectedId) found[device.deviceId] = device
      }
      if (start + page.items.length >= page.total || !page.items.length) break
    }
    if (!isCurrent()) return
    setSelection(found)
    if (Object.keys(found).length !== selectionIds.length) setNotice('部分待关联设备已删除或已关联其他空间，已移出选择；请核对后保存。')
    if (selectedId && !rows.some(row => row.id === selectedId)) setError('当前空间已删除。设备选择已保留，请先清空选择，再选择有效空间。')
  }
  async function refresh() {
    if (DEMO_MODE || lock.current) return
    lock.current = true; const request = ++sequence.current
    const current = () => alive.current && request === sequence.current
    setBusy(true); setError('')
    try {
      const [rows, page] = await snapshot()
      if (!current()) return
      setSpaces(rows); setDevices(page); setLoaded(true); setConflict(false); setMissing(false)
      if (selectedId && !rows.some(row => row.id === selectedId)) { setScope('all'); setOffset(0); if (!draft && !selectionIds.length) setSelectedId('') }
      if (draft?.id) {
        const latest = rows.find(row => row.id === draft.id)
        if (latest) {
          setDraft({ ...draft, version: latest.version, ...(draft.mode === 'rename' ? { parentId: latest.parentId, type: latest.type } : {}) })
          setBaseline(fingerprint({ ...draft, name: latest.name, type: latest.type, parentId: latest.parentId }))
        } else { setMissing(true); setConflict(true); setError('该空间已删除，输入草稿仍保留；请取消编辑后重新选择。') }
      }
      if (confirm) {
        const latest = rows.find(row => row.id === confirm.space.id)
        setConfirm(latest ? { ...confirm, space: latest } : null)
      }
      await refreshedSelection(rows, current)
      if (current()) setRevoked(false)
    } catch (e) { if (current()) failed(e) }
    finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  async function refreshDevices() {
    if (!loaded || DEMO_MODE || lock.current) return
    lock.current = true; const request = ++sequence.current
    const current = () => alive.current && request === sequence.current
    setBusy(true); setError('')
    try { const page = await loadStationSpaceDevices(station.id, filter()); if (current()) setDevices(page) }
    catch (e) { if (current()) failed(e) }
    finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  useEffect(() => {
    alive.current = true; void refresh()
    return () => { alive.current = false; sequence.current++; lock.current = false }
  }, [])
  useEffect(() => { void refreshDevices() }, [query, scope, offset, selectedId])
  useEffect(() => {
    if (!dirty && !busy) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, busy])
  async function mutate(action: () => Promise<unknown>, success: string) {
    if (!canWrite || !loaded || lock.current || conflict || missing) return
    lock.current = true; const request = ++sequence.current
    const current = () => alive.current && request === sequence.current
    let committed = false
    setBusy(true); setError(''); setNotice('')
    try {
      await action(); committed = true
      if (!current()) return
      discard(); setNotice(success)
      const [rows, page] = await snapshot()
      if (!current()) return
      setSpaces(rows); setDevices(page); setLoaded(true)
      if (selectedId && !rows.some(row => row.id === selectedId)) { setSelectedId(''); setScope('all'); setOffset(0) }
    } catch (e) { if (current()) { failed(e); if (committed) setLoaded(false) } }
    finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  function choose(id: string) {
    if (working || lock.current) return
    setSelectedId(id); setOffset(0); setError(''); setNotice('')
    if (!id && scope === 'current') setScope('all')
  }
  function openDraft(mode: Draft['mode'], parentId: string | null = null) {
    if (!canWrite || !loaded || lock.current || working) return
    if (mode !== 'create' && !selected) return
    const next: Draft = mode === 'create'
      ? { mode, id: '', name: '', type: 10, parentId, version: 0 }
      : { ...selected!, mode }
    setDraft(next); setBaseline(fingerprint(next)); setConflict(false); setMissing(false); setError(''); setNotice('')
  }
  function saveDraft() {
    if (!draft) return
    if (draft.mode !== 'move') { try { normalizeSpaceName(draft.name) } catch (e) { failed(e); return } }
    const identity = { ...draft, stationId: station.id }
    void mutate(() => draft.mode === 'create' ? createStationSpace(station.id, draft)
      : draft.mode === 'rename' ? renameStationSpace(identity, draft.name)
      : moveStationSpace(identity, draft.parentId), '空间配置已保存。')
  }
  const ordered = orderedStationSpaces(spaces), excludedParents = draft?.mode === 'move' ? stationSpaceDescendants(spaces, draft.id) : new Set<string>()
  const invalidParent = !!draft?.parentId && !spaces.some(space => space.id === draft.parentId)
  const hasChildren = !!selected && spaces.some(space => space.parentId === selected.id)
  return <div className="station-entry-scope station-spaces-scope"><Modal title={`${station.name} · 空间管理`} onClose={close} actions={<Button disabled={busy} onClick={close}>关闭空间管理</Button>}>
    <div className="station-spaces-panel" data-design-node="1114:8271">
      {DEMO_MODE ? <p>演示模式：空间管理仅在 API 模式提供，此处不创建示例空间或设备。</p> : <>
        <p className="station-subtle">管理空间层级与站内设备关联；每台设备只能属于一个空间。</p>
        {!canWrite && <p>{revoked ? '权限已变化，已停用写入；未保存草稿仍保留。' : '当前仅有查看权限。'}</p>}
        <div className="spaces-toolbar"><Button disabled={busy} onClick={() => void refresh()}>刷新空间（保留草稿）</Button><Button disabled={!canWrite || busy || !loaded || working} onClick={() => openDraft('create')}>新增空间</Button></div>
        {error && <p className="spaces-error" role="alert">{error}</p>}{conflict && <p>空间版本或关联已变化，请刷新后核对保留的草稿，再次保存。</p>}{notice && <p role="status">{notice}</p>}
        {!loaded && !error && <p role="status">正在读取空间与设备…</p>}
        <div className="spaces-layout">
          <aside className="spaces-tree-panel"><h3>空间层级</h3><Button disabled={busy || working} aria-pressed={!selectedId} onClick={() => choose('')}>全部设备</Button>
            {!spaces.length && loaded && <p>暂无空间</p>}
            <div role="tree" aria-label="空间树">{ordered.map(({ space, depth }) => <button type="button" role="treeitem" aria-level={depth + 1} aria-selected={selectedId === space.id} aria-label={`选择空间${space.name}`} key={space.id} disabled={busy || working} style={{ paddingInlineStart: `${12 + depth * 14}px` }} onClick={() => choose(space.id)}><span>{space.name}</span><small>{typeLabel(space.type)} · {space.deviceCount} 台</small></button>)}</div>
          </aside>
          <div className="spaces-main">
            <div className="spaces-toolbar"><strong>{selected ? selected.name : selectedId ? '当前空间已不存在' : '全部空间'}</strong>
              <Button disabled={!selected || !canWrite || busy || working || !loaded} onClick={() => openDraft('create', selectedId)}>新增子空间</Button>
              <Button disabled={!selected || !canWrite || busy || working || !loaded} onClick={() => openDraft('rename')}>重命名空间</Button>
              <Button disabled={!selected || !canWrite || busy || working || !loaded} onClick={() => openDraft('move')}>移动空间</Button>
              <Button title="仅允许删除没有子空间和关联设备的空叶节点" disabled={!selected || !canWrite || busy || working || !loaded || hasChildren || selected.deviceCount > 0} onClick={() => { if (selected && !lock.current) { setConfirm({ kind: 'delete', space: selected }); setConflict(false) } }}>删除空间</Button>
            </div>
            <p className="station-subtle">仅能删除无子空间且无关联设备的空叶节点。</p>
            <div className="spaces-table-scroll"><table className="spaces-table"><thead><tr><th>空间名称</th><th>类型</th><th>上级空间</th><th>关联设备</th></tr></thead><tbody>{ordered.map(({ space }) => <tr key={space.id}><td><button disabled={busy || working} onClick={() => choose(space.id)}>{space.name}</button></td><td>{typeLabel(space.type)}</td><td>{spaces.find(parent => parent.id === space.parentId)?.name ?? (space.parentId ? '上级已不存在' : '根节点')}</td><td>{space.deviceCount} 台</td></tr>)}</tbody></table></div>
            {draft && <section className="spaces-editor"><h3>{draft.mode === 'create' ? '新增空间' : draft.mode === 'rename' ? '重命名空间' : '移动空间'}</h3>
              <fieldset disabled={!canWrite || busy}>
                {draft.mode !== 'move' && <Field label="空间名称"><input maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>}
                {draft.mode === 'create' && <Field label="空间类型"><select value={draft.type} onChange={e => setDraft({ ...draft, type: Number(e.target.value) as StationSpaceType })}>{SPACE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></Field>}
                {draft.mode !== 'rename' && <Field label="上级空间"><select value={draft.parentId ?? ''} onChange={e => setDraft({ ...draft, parentId: e.target.value || null })}><option value="">根节点</option>{invalidParent && <option value={draft.parentId!} disabled>原上级空间已删除，请重新选择</option>}{ordered.filter(({ space }) => !excludedParents.has(space.id)).map(({ space, depth }) => <option key={space.id} value={space.id}>{'　'.repeat(depth)}{space.name}</option>)}</select></Field>}
              </fieldset>
              <div className="spaces-toolbar"><Button disabled={busy} onClick={cancelDraft}>取消空间编辑</Button><Button variant="primary" disabled={!canWrite || busy || !loaded || conflict || missing || invalidParent} onClick={saveDraft}>保存空间</Button></div>
            </section>}
            <section className="spaces-devices"><h3>站点设备</h3><div className="spaces-toolbar">
              <input aria-label="搜索空间设备" placeholder="搜索设备名称或编码" disabled={busy || !!draft || !!confirm} value={queryInput} onChange={e => setQueryInput(e.target.value)} />
              <Button disabled={busy || !!draft || !!confirm} onClick={() => { setQuery(queryInput.trim()); setOffset(0) }}>搜索设备</Button>
              <label>设备范围 <select aria-label="空间设备范围" value={scope} disabled={busy || !!draft || !!confirm} onChange={e => { setScope(e.target.value); setOffset(0) }}><option value="all">全部设备</option><option value="current" disabled={!selected}>当前空间</option><option value="unassigned">未分配设备</option></select></label>
            </div>
              {!devices.items.length && loaded && <p>当前条件暂无设备</p>}
              <div className="spaces-table-scroll"><table className="spaces-table"><thead><tr><th>选择</th><th>设备名称 / 编码</th><th>所属空间</th><th>操作</th></tr></thead><tbody>{devices.items.map(device => <tr key={device.deviceId}><td><input type="checkbox" aria-label={`选择设备${device.name}`} disabled={!canWrite || busy || !!draft || !!confirm || !selected || !!device.spaceId || (!selection[device.deviceId] && selectionIds.length >= 200)} checked={!!selection[device.deviceId]} onChange={e => setSelection(previous => { const next = { ...previous }; if (e.target.checked) next[device.deviceId] = device; else delete next[device.deviceId]; return next })} /></td><td>{device.name}<small>{device.code || '—'}</small></td><td>{device.spaceName || (device.spaceId ? '空间名称不可用' : '未分配')}</td><td>{device.spaceId && <Button disabled={!canWrite || busy || working || !loaded} onClick={() => { const space = spaces.find(item => item.id === device.spaceId); if (space && !lock.current) { setConfirm({ kind: 'unbind', space, device }); setConflict(false) } }}>解除关联{device.name}</Button>}</td></tr>)}</tbody></table></div>
              <div className="spaces-toolbar"><Button disabled={busy || !!draft || !!confirm || !offset} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>上一页设备</Button><span>第 {Math.floor(offset / PAGE_SIZE) + 1} 页 · 共 {devices.total} 台</span><Button disabled={busy || !!draft || !!confirm || offset + PAGE_SIZE >= devices.total} onClick={() => setOffset(value => value + PAGE_SIZE)}>下一页设备</Button></div>
              {!selected && <p className="station-subtle">先选择目标空间，再勾选未分配设备进行批量关联。已关联设备须明确解除后重新选择。</p>}
              {selectionIds.length > 0 && <div className="spaces-selection"><p>待关联到「{selected?.name ?? '已删除的空间'}」：{selectionIds.length} 台</p><ul>{Object.values(selection).map(device => <li key={device.deviceId}>{device.name}（{device.code || device.deviceId}）</li>)}</ul><Button disabled={busy} onClick={() => { setSelection({}); setConflict(false); setError('') }}>清空待关联选择</Button><Button variant="primary" disabled={!selected || !canWrite || busy || conflict || !loaded} onClick={() => { if (selected) void mutate(() => bindStationSpaceDevices(selected, selectionIds), '设备关联已保存。') }}>关联已选设备</Button></div>}
            </section>
          </div>
        </div>
        {confirm && <section className="spaces-confirm"><p>{confirm.kind === 'delete' ? `确认删除空叶空间「${confirm.space.name}」？` : `确认将设备「${confirm.device.name}」从空间「${confirm.space.name}」解除关联？`}</p><Button disabled={busy} onClick={() => { setConfirm(null); setConflict(false); setError('') }}>取消空间操作</Button><Button disabled={!canWrite || busy || conflict || !loaded} onClick={() => void mutate(() => confirm.kind === 'delete' ? deleteStationSpace(confirm.space) : unbindStationSpaceDevice(confirm.space, confirm.device.deviceId), confirm.kind === 'delete' ? '空间已删除。' : '设备关联已解除。')}>{confirm.kind === 'delete' ? '确认删除空间' : '确认解除设备关联'}</Button></section>}
      </>}
    </div>
  </Modal>{leave.confirmation}</div>
}
