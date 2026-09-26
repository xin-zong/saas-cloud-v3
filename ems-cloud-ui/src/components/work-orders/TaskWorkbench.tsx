import {useEffect, useState} from 'react'
import {useAuth} from '@/auth/AuthContext'
import {hasStationPermission} from '@/auth/apiPermissions'
import {DEMO_MODE} from '@/api/client'
import {exportOperationsCsv} from '@/data/operations'
import {type RegisterLeaveGuard} from '../useEditorLeaveGuard'
import {useWorkflowLeave, workflowKey} from './WorkflowEditor'

type Task = {id:string; title:string; domain:string; status:string; owner:string; due?:string; stationId:string}
const tabs = ['全部任务','执行任务','异常待接管','任务编排','消息中心','协作与交接'] as const
type Tab = typeof tabs[number]
const phases = ['准备','范围确认','安全检查','执行','观察','验证','恢复']
const initialNodes = ['触发','范围校核','安全复核','执行','验证','交接','关闭']
const empty = {
  object:'', stage:'准备', evidence:'', phaseEvidence:{} as Record<string,string>,
  soc:'', threshold:'', rollback:'', responsibility:'', reason:'', name:'', condition:'', branch:'',
  context:'', unresolved:'', receiver:'', subscription:'', merge:'5', ack:false,
}
type Draft = typeof empty
type SavedDraft = {draft:Draft; nodes:string[]}
const openStates = ['待处理','处理中','待审批']
const knownDeadline = (task:Task) => Boolean(task.due && Number.isFinite(Date.parse(task.due)))
const isOverdue = (task:Task) => knownDeadline(task) && Date.parse(task.due!) < Date.now() && openStates.includes(task.status)
const draftLabel = (draft:Draft) => draft.name || draft.object || draft.subscription || draft.context || '未命名草稿'

function readSaved(key:string): SavedDraft | null {
  const raw = localStorage.getItem(key)
  if (!raw) return null
  const saved = JSON.parse(raw)
  const draft = {...empty, ...saved.draft}
  // Recover the old single-step evidence into its original phase, without claiming other phases have evidence.
  draft.phaseEvidence = saved.draft?.phaseEvidence || (draft.evidence ? {[draft.stage]:draft.evidence} : {})
  return {draft, nodes:saved.nodes || initialNodes}
}

export function TaskWorkbench({stations,tasks,registerLeaveGuard,onClose,onOpen}:{
  stations:{id:string;name:string}[]; tasks:Task[]; registerLeaveGuard?:RegisterLeaveGuard;
  onClose:()=>void; onOpen:(id:string,domain:string)=>void;
}) {
  const {user} = useAuth()
  const [tab,setTab] = useState<Tab>('全部任务')
  const [station,setStation] = useState(stations[0]?.id || '')
  const [objectId,setObjectId] = useState('default')
  const [objects,setObjects] = useState<{id:string;label:string}[]>([])
  const [search,setSearch] = useState('')
  const [domain,setDomain] = useState('')
  const [stage,setStage] = useState('')
  const [owner,setOwner] = useState('')
  const [deadline,setDeadline] = useState('')
  const [draft,setDraft] = useState<Draft>(empty)
  const [baseline,setBaseline] = useState<Draft>(empty)
  const [notice,setNotice] = useState('')
  const [error,setError] = useState('')
  const [nodes,setNodes] = useState(initialNodes)
  const [savedNodes,setSavedNodes] = useState(initialNodes)
  const prefix = workflowKey(user?.id || '',station,'tasks',`${tab}:`)
  const key = `${prefix}${objectId}`
  const legacyKey = workflowKey(user?.id || '',station,'tasks',tab)
  const canEdit = DEMO_MODE || hasStationPermission(user,station,'workorder.edit') || hasStationPermission(user,station,'workorder.handle')
  const reset = () => {setDraft(baseline); setNodes(savedNodes); setError('')}
  const leave = useWorkflowLeave(
    JSON.stringify(draft) !== JSON.stringify(baseline) || JSON.stringify(nodes) !== JSON.stringify(savedNodes),
    registerLeaveGuard, reset, key, canEdit,
  )
  const navigate = (action:()=>void) => {void leave.requestLeave().then(ok => {if (ok) action()})}

  function refreshObjects() {
    const entries:{id:string;label:string}[] = []
    for (let index=0; index<localStorage.length; index++) {
      const storedKey = localStorage.key(index)
      if (!storedKey?.startsWith(prefix)) continue
      const saved = readSaved(storedKey)
      if (saved) entries.push({id:storedKey.slice(prefix.length),label:draftLabel(saved.draft)})
    }
    if (!entries.some(entry => entry.id === 'default')) {
      const legacy = readSaved(legacyKey)
      if (legacy) entries.unshift({id:'default',label:draftLabel(legacy.draft)})
    }
    setObjects(entries)
  }
  useEffect(() => {
    if (!stations.some(item => item.id === station)) {
      leave.cancelPending()
      setStation(stations[0]?.id || '')
      setObjectId('default')
      setDraft(empty)
      setBaseline(empty)
    }
  }, [stations.map(item=>item.id).join('|')])
  useEffect(() => {
    try {
      const saved = readSaved(key) || (objectId === 'default' ? readSaved(legacyKey) : null)
      setDraft(saved?.draft || empty)
      setBaseline(saved?.draft || empty)
      setNodes(saved?.nodes || initialNodes)
      setSavedNodes(saved?.nodes || initialNodes)
      refreshObjects()
      setNotice('')
      setError('')
    } catch {
      setDraft(empty); setBaseline(empty); setObjects([])
      setNodes(initialNodes); setSavedNodes(initialNodes)
      setError('草稿读取失败')
    }
  }, [key])

  function change(field:keyof Draft, value:string|boolean) {
    setDraft(previous => ({...previous,[field]:value}))
    setNotice(''); setError('')
  }
  function changePhaseEvidence(value:string) {
    setDraft(previous => ({...previous,phaseEvidence:{...previous.phaseEvidence,[previous.stage]:value}}))
    setNotice(''); setError('')
  }
  const field = (id:Exclude<keyof Draft,'phaseEvidence'>,label:string,multi=false) => {
    const locked = !canEdit || (id === 'object' && Boolean(baseline.object))
    return <label key={id}>{label}{multi ?
      <textarea aria-label={label} value={String(draft[id])} disabled={locked} onChange={event=>change(id,event.target.value)}/> :
      <input aria-label={label} value={String(draft[id])} disabled={locked} onChange={event=>change(id,event.target.value)}/>
    }</label>
  }
  const evidence = tab === '执行任务' ? draft.phaseEvidence[draft.stage] || '' : draft.evidence
  function save() {
    if (!canEdit) return
    const required:(keyof Draft)[] = tab === '执行任务' ? ['object'] : tab === '异常待接管' ? ['object','responsibility','reason'] :
      tab === '任务编排' ? ['name','condition','branch'] : tab === '消息中心' ? ['subscription'] : ['context','unresolved','responsibility','receiver']
    if (required.some(field=>!String(draft[field]).trim()) || (tab === '执行任务' && !evidence.trim())) {
      setError('请填写完整的对象、责任与必填内容'); return
    }
    if (tab === '任务编排' && (!nodes.includes('关闭') || !nodes.includes('安全复核'))) {
      setError('编排必须包含安全复核及关闭节点'); return
    }
    if (tab === '执行任务' && (!Number.isFinite(Number(draft.soc)) || Number(draft.soc)<0 || Number(draft.soc)>100)) {
      setError('SOC 下限应在 0–100% 之间'); return
    }
    try {
      localStorage.setItem(key,JSON.stringify({draft,nodes}))
      setBaseline(draft); setSavedNodes(nodes); refreshObjects()
      setNotice('本地草稿已保存；尚未发布、执行、发送或接管')
    } catch {setError('保存失败：本地存储不可用')}
  }

  // Filter only current authorized station records. Unknown deadlines never imply lateness.
  const scoped = tasks.filter(task=>stations.some(item=>item.id===task.stationId) && (!station || task.stationId===station))
  const visible = scoped.filter(task => {
    if (!`${task.id} ${task.title} ${task.owner}`.includes(search)) return false
    if (tab !== '全部任务') return true
    if (domain && task.domain !== domain) return false
    if (stage && task.status !== stage) return false
    if (owner && (owner === '__unassigned' ? Boolean(task.owner) : task.owner !== owner)) return false
    if (deadline === 'unknown' && knownDeadline(task)) return false
    if (deadline === 'overdue' && !isOverdue(task)) return false
    if (deadline === 'future' && (!knownDeadline(task) || Date.parse(task.due!) < Date.now())) return false
    return true
  })
  const overdue = visible.filter(isOverdue)
  const unassigned = visible.filter(task=>!task.owner)
  const exceptions = visible.filter(task=>!task.owner || isOverdue(task))
  function exportTasks() {
    exportOperationsCsv('任务筛选结果.csv',['编号','任务','业务域','阶段','负责人','截止时间','站点'],visible.map(task=>[
      task.id,task.title,task.domain,task.status,task.owner || null,knownDeadline(task) ? task.due! : null,
      stations.find(item=>item.id===task.stationId)?.name || null,
    ]))
  }
  const table = (list:Task[],exception=false) => <div className="wo-task-table">
    <table><thead><tr>{(exception ? ['异常任务','状态','来源','持续时间','操作'] : ['任务 / 业务域','阶段','负责人','截止时间','操作']).map(label=><th key={label}>{label}</th>)}</tr></thead>
      <tbody>{list.map(task=><tr key={`${task.domain}:${task.id}`}>
        <td>{task.id} · {task.title}</td><td>{exception ? (!task.owner ? '无人负责' : '已超时') : task.status}</td>
        <td>{exception ? task.domain : task.owner || '未分派'}</td><td>{exception ? '未提供' : knownDeadline(task) ? new Date(task.due!).toLocaleString() : '未提供'}</td>
        <td><button className="work-orders-link" onClick={()=>navigate(()=>onOpen(task.id,task.domain))}>查看详情</button></td>
      </tr>)}</tbody>
    </table>{!list.length && <p className="operations-empty">暂无符合条件的{exception?'异常':'任务'}；其他业务域尚未接通。</p>}
  </div>
  const metrics = tab === '全部任务' ? [
    ['按业务域',`${visible.filter(task=>task.domain==='工单').length} 工单 / ${visible.filter(task=>task.domain==='审批').length} 审批`],
    ['按阶段',`${visible.filter(task=>task.status==='处理中').length} 执行中`],['无人负责',String(unassigned.length)],['已超时',String(overdue.length)],
  ] : tab === '异常待接管' ? [['未知态禁令','不可继续或自动关闭'],['接管责任',draft.responsibility||'未指定'],['需要复核','未接通'],['回滚可用',draft.rollback||'未记录']] :
    tab === '任务编排' ? [['当前草案','仅本机'],['生产生效','未接通'],['权限检查','提交前需服务端复核'],['测试运行','未接通']] :
    [['数据来源','本地记录'],['服务状态','尚未接通'],['证据',evidence||'未记录'],['接收确认',draft.ack?'已勾选（本地）':'未确认']]

  return <section className="wo-workbench">
    <nav aria-label="任务协作导航">{tabs.map(item=><button key={item} className="operations-button" aria-pressed={tab===item}
      onClick={()=>navigate(()=>{setTab(item);setObjectId('default')})}>{item}</button>)}
      <button className="operations-button" onClick={()=>navigate(onClose)}>返回工单队列</button>
    </nav>
    <h2>{tab}</h2>
    <div className="wo-workbench-filter">
      <label>业务站点<select aria-label="业务站点" value={station} onChange={event=>{const next=event.target.value;navigate(()=>{setStation(next);setObjectId('default')})}}>
        {stations.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <input aria-label="搜索任务" placeholder="搜索、筛选或定位对象" value={search} onChange={event=>setSearch(event.target.value)}/>
      {tab === '全部任务' && <>
        <label>业务域<select aria-label="任务业务域" value={domain} onChange={event=>setDomain(event.target.value)}><option value="">全部</option>{[...new Set(scoped.map(task=>task.domain))].map(value=><option key={value}>{value}</option>)}</select></label>
        <label>阶段<select aria-label="任务阶段" value={stage} onChange={event=>setStage(event.target.value)}><option value="">全部</option>{[...new Set(scoped.map(task=>task.status))].map(value=><option key={value}>{value}</option>)}</select></label>
        <label>责任人<select aria-label="任务责任人" value={owner} onChange={event=>setOwner(event.target.value)}><option value="">全部</option><option value="__unassigned">未分派</option>{[...new Set(scoped.map(task=>task.owner).filter(Boolean))].map(value=><option key={value}>{value}</option>)}</select></label>
        <label>期限<select aria-label="任务期限" value={deadline} onChange={event=>setDeadline(event.target.value)}><option value="">全部</option><option value="future">尚未到期</option><option value="overdue">已超时且未结束</option><option value="unknown">未提供</option></select></label>
        <button className="operations-button" onClick={exportTasks}>导出筛选结果</button>
      </>}
      {tab !== '全部任务' && <>
        <label>草稿对象<select aria-label="草稿对象" value={objectId} onChange={event=>{const next=event.target.value;navigate(()=>setObjectId(next))}}>
          {!objects.some(item=>item.id===objectId) && <option value={objectId}>新草稿（尚未保存）</option>}
          {objects.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        <button className="operations-button" disabled={!canEdit} onClick={()=>navigate(()=>setObjectId(crypto.randomUUID()))}>新建本地草稿</button>
      </>}
    </div>
    <div className="wo-workbench-grid"><section>
      {tab === '全部任务' && <><h3>全量任务清单</h3>{table(visible)}</>}
      {tab === '执行任务' && <>
        <h3>执行步骤与证据</h3><div className="wo-flow">{phases.map(phase=><button key={phase} className="operations-button" disabled={!canEdit} aria-pressed={draft.stage===phase} onClick={()=>change('stage',phase)}>{phase}</button>)}</div>
        <div className="wo-task-form">{field('object','任务对象')}
          <label>当前步骤证据<textarea aria-label="当前步骤证据" value={evidence} disabled={!canEdit} onChange={event=>changePhaseEvidence(event.target.value)}/></label>
          {field('soc','SOC 下限（%）')}{field('threshold','异常接管阈值（MW）')}{field('rollback','回滚方案')}
        </div><p>当前步骤：{draft.stage}。各步骤证据分别保留；已保存的任务对象不可替换，请新建草稿。未连接控制执行服务。</p>
      </>}
      {tab === '异常待接管' && <><h3>异常与接管队列</h3>{table(exceptions,true)}
        <div className="wo-task-form">{field('object','异常任务编号')}{field('responsibility','接管责任人')}{field('reason','异常原因及复核意见',true)}{field('rollback','接管回滚方案')}</div>
        <p>已保存的异常对象不可替换；其他异常请新建草稿。</p>
      </>}
      {tab === '任务编排' && <><h3>任务编排画布 · 本地草案</h3>
        <div className="wo-flow">{nodes.map((node,index)=><span key={index}>{node}
          <button aria-label={`删除节点 ${index+1}`} disabled={!canEdit} onClick={()=>setNodes(nodes.filter((_,position)=>position!==index))}>×</button>
          {index>0 && <button aria-label={`上移节点 ${index+1}`} disabled={!canEdit} onClick={()=>{const next=[...nodes];[next[index-1],next[index]]=[next[index],next[index-1]];setNodes(next)}}>←</button>}
        </span>)}</div><button className="operations-button" disabled={!canEdit} onClick={()=>setNodes([...nodes,'条件分支'])}>添加阶段</button>
        <div className="wo-task-form">{field('name','模板名称')}{field('condition','触发条件')}{field('responsibility','阶段责任人')}{field('branch','异常分支与闭合条件',true)}</div>
      </>}
      {tab === '消息中心' && <><h3>消息与通知</h3><table><thead><tr>{['消息主题','来源','对象','时间','状态'].map(value=><th key={value}>{value}</th>)}</tr></thead></table>
        <p className="operations-empty">暂无消息数据，通知服务尚未接通。</p><div className="wo-task-form">{field('subscription','订阅规则')}{field('merge','同对象归并窗口（分钟）')}
          <label><input type="checkbox" checked={draft.ack} disabled={!canEdit} onChange={event=>change('ack',event.target.checked)}/>需要接收确认</label>
        </div>
      </>}
      {tab === '协作与交接' && <><h3>跨域协作与交接关系</h3><div className="wo-flow">{['运营 · 偏差事件','任务中心 · 交接包','运维 · 工单处理','厂家 · 诊断意见'].map(value=><span key={value}>{value}</span>)}</div>
        <h3>未结事项与接收</h3><div className="wo-task-form">{field('context','交接上下文',true)}{field('unresolved','未结事项',true)}{field('responsibility','交接责任人')}{field('receiver','接收人')}{field('evidence','证据包与时间线',true)}
          <label><input type="checkbox" checked={draft.ack} disabled={!canEdit} onChange={event=>change('ack',event.target.checked)}/>记录本地接收确认</label>
        </div>
      </>}
    </section><aside>
      <h3>{tab==='全部任务'?'范围与状态分布':tab==='执行任务'?'保护与接管':tab==='异常待接管'?'接管保护':tab==='任务编排'?'模板版本与校验':tab==='消息中心'?'订阅与确认':'交接事实与证据'}</h3>
      {metrics.map(([label,value])=><dl key={label}><dt>{label}</dt><dd>{value}</dd></dl>)}
    </aside></div>
    {tab !== '全部任务' && <footer><p className="wo-boundary">此功能尚未接通后台；草稿按当前账号、模式、站点及固定对象 ID 隔离，标题修改不会改变保存位置。</p>
      {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      <button className="operations-button work-orders-approve" disabled={!canEdit} onClick={save}>检查并保存本地草稿</button>
    </footer>}{leave.dialog}
  </section>
}
