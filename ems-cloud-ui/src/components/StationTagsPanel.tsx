import { useEffect, useState } from 'react'
import { ApiError, DEMO_MODE } from '@/api/client'
import { allStationTags, createStationTag, updateStationTag, deleteStationTag, loadStationTags, assignStationTags, type StationTag } from '@/api/stationTags'
import { Modal, Field } from './station-provision/Common'
import { Button } from './ui/Workspace'
import { useConfigurationLeaveGuard } from './useConfigurationLeaveGuard'
import type { RegisterLeaveGuard } from './useEditorLeaveGuard'
import './configuration.css'

export default function StationTagsPanel({ station, canEdit, onClose, registerLeaveGuard }: { registerLeaveGuard?: RegisterLeaveGuard; station?: { id: string; name: string }; canEdit: boolean; onClose: () => void }) {
  const [tags, setTags] = useState<StationTag[]>([]), [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState<StationTag | null>(null), [deleting, setDeleting] = useState<StationTag | null>(null)
  const [query, setQuery] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false)
  const [notice, setNotice] = useState(''), [savedSelection, setSavedSelection] = useState<string[]>([])
  const leave = useConfigurationLeaveGuard({ dirty: !!draft || JSON.stringify([...selected].sort()) !== JSON.stringify([...savedSelection].sort()), busy, registerLeaveGuard, onClose, onDiscard: () => { setDraft(null); setSelected(savedSelection) } })
  async function refresh(preserve = false) {
    if (DEMO_MODE) return
    setBusy(true)
    try {
      const [rows, assigned] = await Promise.all([allStationTags(), station ? loadStationTags(station.id) : Promise.resolve([])])
      setTags(rows); setSavedSelection(assigned.map(t => t.id))
      if (!preserve) setSelected(assigned.map(t => t.id))
      else setSelected(previous => previous.filter(id => rows.some(t => t.id === id)))
      if (preserve && selected.some(id => !rows.some(t => t.id === id))) setNotice('部分标签已删除，已从待分配草稿中移除；请核对后保存')
      if (preserve && draft?.id) {
        const latest = rows.find(t => t.id === draft.id)
        if (latest) setDraft({ ...draft, version: latest.version })
        else { setError('该标签已被删除，草稿仍保留，可另存为新标签。'); setDraft({ ...draft, id: '', version: 0 }) }
      }
      if (preserve && deleting) setDeleting(rows.find(t => t.id === deleting.id) ?? null)
      setLoaded(true); setConflict(false)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { void refresh() }, [station?.id])
  async function mutate(action: () => Promise<unknown>, success: string) {
    if (!canEdit || busy || !loaded) return
    setBusy(true); setError(''); setNotice('')
    try { await action(); setDraft(null); setDeleting(null); setNotice(success); await refresh() }
    catch (e) { setError((e as Error).message); setConflict(e instanceof ApiError && e.status === 409) }
    finally { setBusy(false) }
  }
  return <><Modal title={station ? `${station.name} · 站点标签` : '标签管理'} onClose={() => void leave.close()} actions={<>
    <Button disabled={busy} onClick={() => void leave.close()}>关闭</Button>
    {station && !DEMO_MODE && <Button variant="primary" disabled={!canEdit || busy || !loaded} onClick={() => void mutate(() => assignStationTags(station.id, selected), '站点标签已保存')}>保存站点标签</Button>}
  </>}>
    <div className="configuration-panel">
      {DEMO_MODE ? <p>演示模式：标签服务仅在 API 模式提供，此处不生成服务端标签。</p> : <>
        {!canEdit && <p>当前仅有查看权限。</p>}
        <div className="configuration-toolbar"><input aria-label="搜索标签" placeholder="搜索标签" value={query} onChange={e => setQuery(e.target.value)} />
          <Button disabled={busy} onClick={() => void refresh(true)}>刷新标签（保留草稿）</Button>
          {!station && canEdit && <Button disabled={busy || !loaded || !!draft} onClick={() => { setDraft({ id: '', name: '', description: '', version: 0 }); setDeleting(null) }}>新增标签</Button>}
        </div>
        {error && <p role="alert">{error}</p>}{conflict && <p>记录已变化。请刷新标签以取得最新版本；输入草稿会保留，核对后再次保存。</p>}
        {notice && <p role="status">{notice}</p>}
        {!loaded && !error && <p role="status">正在读取标签…</p>}
        {loaded && !tags.length && <p>暂无标签</p>}
        {!!tags.length && <table className="station-table"><thead><tr><th>标签名称</th><th>说明</th><th>{station ? '分配' : '操作'}</th></tr></thead><tbody>
          {tags.filter(t => `${t.name} ${t.description}`.toLowerCase().includes(query.trim().toLowerCase())).map(t => <tr key={t.id}><td>{t.name}</td><td>{t.description || '—'}</td><td>
            {station ? <input type="checkbox" aria-label={t.name} checked={selected.includes(t.id)} disabled={!canEdit || busy} onChange={e => setSelected(e.target.checked ? [...selected, t.id] : selected.filter(id => id !== t.id))} /> : canEdit && <><Button disabled={busy || !!draft} onClick={() => { setDraft({ ...t }); setDeleting(null) }}>编辑{t.name}</Button><Button disabled={busy || !!draft} onClick={() => { setDeleting(t); setDraft(null) }}>删除{t.name}</Button></>}
          </td></tr>)}
        </tbody></table>}
        {draft && <fieldset disabled={!canEdit || busy} className="configuration-editor"><legend>{draft.id ? '编辑标签' : '新增标签'}</legend>
          <Field label="标签名称"><input maxLength={50} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
          <Field label="标签说明"><textarea maxLength={500} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></Field>
          <Button onClick={() => setDraft(null)}>取消编辑</Button><Button variant="primary" disabled={!draft.name.trim() || conflict} onClick={() => void mutate(() => draft.id ? updateStationTag({ ...draft, name: draft.name.trim() }) : createStationTag({ name: draft.name.trim(), description: draft.description }), '标签已保存')}>保存标签</Button>
        </fieldset>}
        {deleting && <div><p>确认删除标签「{deleting.name}」？已关联站点的标签须先解除关联。</p><Button disabled={busy} onClick={() => setDeleting(null)}>取消删除</Button><Button disabled={!canEdit || busy || conflict} onClick={() => void mutate(() => deleteStationTag(deleting), '标签已删除')}>确认删除标签</Button></div>}
      </>}
    </div>
  </Modal>{leave.confirmation}</>
}
