import { useEffect, useState } from 'react'
import { CAPABILITIES_CHANGED } from '../api/client'
import { loadStationOperationLogs, type OperationLogFilters, type StationOperationLogPage } from '../api/stationOperationLogs'
import './station-operation-logs.css'

const actionNames: Record<string,string> = {
 'station-metric-source.save':'保存指标数据源','station-energy-offset.save':'保存电量偏移','station-energy-offset.revoke':'撤销电量偏移','station-metric.recalculate':'重算场站电量',
 'station.edit':'编辑场站资料','station-wiring-diagram.save':'保存接线图','station-basic-electricity.save':'保存基本电费配置',
 'substation.create':'创建子场站','substation.update':'编辑子场站','substation.devices-replace':'调整子场站设备关联',
 'station-space.create':'创建空间','station-space.rename':'重命名空间','station-space.move':'移动空间','station-space.delete':'删除空间','station-space.bind':'关联空间设备','station-space.unbind':'解除空间设备关联',
 'tariff-binding.create':'绑定电价模板','tariff-binding.dates':'调整电价生效日期','tariff-binding.unbind':'解除电价绑定',
 'station-generation-plan.create':'创建发电计划','station-generation-plan.update':'修改发电计划','station-generation-plan.delete':'删除发电计划',
 'alarm.read':'阅读告警','alarm.confirm':'确认告警','device.configuration.save':'保存设备本地配置',
}
export function StationOperationLogs({ stationId }: { stationId: string }) {
  // Keyed content resets filters and rows synchronously when switching stations.
  return <LogContent key={stationId} stationId={stationId} />
}
function LogContent({ stationId }: { stationId: string }) {
  const [draft, setDraft] = useState<OperationLogFilters>({})
  const [query, setQuery] = useState({ filters: {} as OperationLogFilters, offset: 0, refresh: 0 })
  const [page, setPage] = useState<StationOperationLogPage | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  useEffect(() => {
    const abort = new AbortController()
    setPage(null); setError(''); setBusy(true)
    const revoked = () => { abort.abort(); setPage(null); setBusy(false); setError('权限已变化，请重新查询。') }
    window.addEventListener(CAPABILITIES_CHANGED, revoked)
    loadStationOperationLogs(stationId, query.filters, query.offset, abort.signal)
      .then(result => { if (!abort.signal.aborted) setPage(result) })
      .catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : '日志加载失败') })
      .finally(() => { if (!abort.signal.aborted) setBusy(false) })
    return () => { abort.abort(); window.removeEventListener(CAPABILITIES_CHANGED, revoked) }
  }, [stationId, query])
  function search(event: React.FormEvent) {
    event.preventDefault()
    const filters = { ...draft }
    if (filters.content) filters.content = Object.entries(actionNames).find(([,label])=>label===filters.content)?.[0] ?? filters.content
    if (filters.channel==='应用') filters.channel='application'
    try {
      if (filters.from) filters.from = new Date(filters.from).toISOString()
      if (filters.to) filters.to = new Date(filters.to).toISOString()
    } catch { setError('请输入有效的查询时间。'); return }
    if (filters.from && filters.to && filters.from >= filters.to) { setError('结束时间须晚于开始时间。'); return }
    setPage(null); setQuery(q => ({ filters, offset: 0, refresh: q.refresh + 1 }))
  }
  return <section className="station-operation-logs" aria-label="站点操作日志">
    <h3>操作日志</h3>
    <p>仅展示有明确本站关联的审计记录。人员组、IP 和操作位置未记录时显示“未记录”；历史关联不完整的操作不在此补推。</p>
    <form onSubmit={search} className="operation-log-filters">
      {([['content', '操作内容'], ['actor', '操作人员'], ['channel', '通道'], ['ip', 'IP']] as const).map(([field, label]) => <label key={field}>{label}<input maxLength={200} value={draft[field] || ''} onChange={event => setDraft(v => ({ ...v, [field]: event.target.value }))} /></label>)}
      {([['from', '开始时间'], ['to', '结束时间（不含）']] as const).map(([field, label]) => <label key={field}>{label}<input type="datetime-local" value={draft[field] || ''} onChange={event => setDraft(v => ({ ...v, [field]: event.target.value }))} /></label>)}
      <button className="ui-button ui-button-primary" type="submit">查询</button>
      <button className="ui-button" type="button" onClick={() => { setDraft({}); setPage(null); setQuery(q => ({ filters: {}, offset: 0, refresh: q.refresh + 1 })) }}>重置</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">正在加载日志…</p>}
    {page && <><div className="operation-log-table"><table className="station-table"><thead><tr>{['操作时间', '操作人员', '人员组', '操作内容', '通道', 'IP', '操作位置'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {page.items.map(row => <tr key={row.id}><td>{new Date(row.occurredAt).toLocaleString('zh-CN')}</td><td>{row.actor || '未记录'}</td><td>{row.actorGroup || '未记录'}</td><td><strong>{actionNames[row.action] || row.action}</strong>{row.sharedDetail ? <p>批量操作：跨站详情未展示</p> : row.content ? <details><summary>记录详情</summary><div className="operation-log-content">{row.content}</div></details> : <p>详情未记录</p>}</td><td>{row.channel==='application'?'应用':row.channel || '未记录'}</td><td>{row.ip || '未记录'}</td><td>未记录</td></tr>)}
      {!page.items.length && <tr><td colSpan={7}>没有符合条件的本站操作日志</td></tr>}
    </tbody></table></div><div className="operation-log-pagination"><button className="ui-button" disabled={query.offset === 0} onClick={() => {setPage(null);setQuery(q => ({ ...q, offset: Math.max(0, q.offset - 20) }))}}>上一页</button><span>第 {Math.floor(query.offset / 20) + 1} 页</span><button className="ui-button" disabled={!page.hasMore || query.offset >= 100000} onClick={() => {setPage(null);setQuery(q => ({ ...q, offset: q.offset + 20 }))}}>下一页</button></div></>}
  </section>
}
