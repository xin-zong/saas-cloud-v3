import { useState } from 'react'
import { ApiError } from '@/api/client'
import { createMonitorTemplate, updateMonitorTemplate, pinMonitorTemplate, deleteMonitorTemplate, type MonitorConfiguration, type MonitorTemplate } from '@/api/monitorTemplates'
import { Modal, Field } from './station-provision/Common'
import { Button } from './ui/Workspace'
import { useConfigurationLeaveGuard } from './useConfigurationLeaveGuard'
import type { RegisterLeaveGuard } from './useEditorLeaveGuard'
import './configuration.css'

export default function MonitorTemplatesPanel({ configuration, cards, reload, select, onClose, registerLeaveGuard }: { registerLeaveGuard?: RegisterLeaveGuard; configuration: MonitorConfiguration; cards: string[]; reload: () => Promise<MonitorConfiguration>; select: (id: string | null) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState<{ id: string; name: string; version: number; cards: string[] } | null>(null)
  const [deleting, setDeleting] = useState<MonitorTemplate | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [conflict, setConflict] = useState(false)
  const leave = useConfigurationLeaveGuard({ dirty: !!draft, busy, registerLeaveGuard, onClose, onDiscard: () => setDraft(null) })
  async function run(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true); setError('')
    try { await action(); setDraft(null); setDeleting(null); await reload(); setConflict(false) }
    catch (e) { setError((e as Error).message); setConflict(e instanceof ApiError && e.status === 409) }
    finally { setBusy(false) }
  }
  async function refresh() {
    setBusy(true)
    try {
      const data = await reload()
      if (draft?.id) {
        const latest = data.items.find(t => t.id === draft.id)
        if (latest) setDraft({ ...draft, version: latest.version, cards: latest.cards })
        else { setDraft({ ...draft, id: '', version: 0 }); setError('模板已删除，名称草稿已保留，可另存新模板。') }
      }
      if (deleting) setDeleting(data.items.find(t => t.id === deleting.id) ?? null)
      setConflict(false)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <><Modal title="私人看板模板" onClose={() => void leave.close()} actions={<Button disabled={busy} onClick={() => void leave.close()}>关闭</Button>}>
    <div className="configuration-panel"><p>模板仅保存当前账号的卡片配置；数据仍按当前权限显示。</p>
      <div className="configuration-toolbar"><Button disabled={busy || !!draft} onClick={() => { setDraft({ id: '', name: '', cards, version: 0 }); setDeleting(null) }}>新建模板</Button><Button disabled={busy} onClick={() => void refresh()}>刷新模板（保留名称草稿）</Button></div>
      {error && <p role="alert">{error}</p>}{conflict && <p>模板已变化，请刷新取得最新版本，核对草稿后重试。</p>}
      {!configuration.items.length && <p>暂无私人模板，新建后可保存页面布局。</p>}
      <table className="station-table"><thead><tr><th>模板名称</th><th>状态</th><th>操作</th></tr></thead><tbody>{configuration.items.map(t => <tr key={t.id}><td>{t.name}</td><td>{t.pinned ? '已置顶' : '普通'}{t.id === configuration.selectedId ? ' · 当前' : ''}</td><td>
        <Button disabled={busy || !!draft} onClick={() => void run(() => select(t.id))}>选择{t.name}</Button>
        <Button disabled={busy || !!draft} onClick={() => { setDraft({ ...t }); setDeleting(null) }}>重命名{t.name}</Button>
        <Button disabled={busy || conflict || !!draft} onClick={() => void run(() => pinMonitorTemplate(t, !t.pinned))}>{t.pinned ? '取消置顶' : '置顶'}{t.name}</Button>
        <Button disabled={busy || !!draft} onClick={() => { setDeleting(t); setDraft(null) }}>删除{t.name}</Button>
      </td></tr>)}</tbody></table>
      {draft && <fieldset disabled={busy} className="configuration-editor"><legend>{draft.id ? '重命名模板' : '新建模板'}</legend><Field label="模板名称"><input maxLength={50} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field><Button onClick={() => setDraft(null)}>取消编辑</Button><Button variant="primary" disabled={!draft.name.trim() || conflict} onClick={() => void run(async () => { if (draft.id) await updateMonitorTemplate({ ...draft, name: draft.name.trim() }); else await createMonitorTemplate(draft.name.trim(), draft.cards) })}>保存模板</Button></fieldset>}
      {deleting && <div><p>确认删除「{deleting.name}」？删除当前模板后将恢复默认卡片。</p><Button disabled={busy} onClick={() => setDeleting(null)}>取消删除</Button><Button disabled={busy || conflict} onClick={() => void run(() => deleteMonitorTemplate(deleting))}>确认删除模板</Button></div>}
    </div>
  </Modal>{leave.confirmation}</>
}
