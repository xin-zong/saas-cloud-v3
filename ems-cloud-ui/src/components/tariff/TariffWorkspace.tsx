import { useEffect, useState } from 'react'
import type { Station } from '@/App'
import { api, send, DEMO_MODE, type ApiRow } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { hasStationPermission } from '@/auth/apiPermissions'
import { Modal as Dialog } from '../station-provision/Common'
import { useEditorLeaveGuard } from '../useEditorLeaveGuard'
import TariffTemplateEditor, { TariffIcon } from './TariffTemplateEditor'
import TariffCalendar from './TariffCalendar'
import { dateKey, minute, modeNames, newTemplate, validateTemplate, validatePeriods, type TariffTemplate, type TariffWorkspace as Workspace } from './model'
import './tariff.css'

function load(key: string): Workspace {
  try {
    const result = JSON.parse(localStorage.getItem(key) || 'null')
    if (result && Array.isArray(result.templates) && result.templates.every((t: TariffTemplate)=>t && typeof t.id==='string' && typeof t.name==='string' && ['fixed','tou','dynamic'].includes(t.mode) && Array.isArray(t.buy) && Array.isArray(t.sell) && t.source) && result.assignments && typeof result.assignments==='object') return result
  } catch { /* Missing or obsolete local data opens an empty workspace. */ }
  return {templates:[],assignments:{}}
}
export default function TariffWorkspace({station,onOpenStrategy,registerLeaveGuard}: {station:Station;onOpenStrategy?:()=>void;registerLeaveGuard?:(guard:null|(()=>Promise<boolean>))=>void}) {
  const {user}=useAuth()
  const canManage=DEMO_MODE || hasStationPermission(user,station.id,'tariff.manage')
  const canRead=canManage || hasStationPermission(user,station.id,'tariff.read')
  const key=`enerlution-tariff-workspace-v1:${DEMO_MODE?'demo':'api'}:${user?.id??'anonymous'}:${station.id}`
  const [workspace,setWorkspace]=useState<Workspace>(()=>load(key))
  const [saved,setSaved]=useState<Workspace>(()=>load(key))
  const [view,setView]=useState<'calendar'|'templates'|'editor'>('calendar')
  const [editor,setEditor]=useState<TariffTemplate|null>(null)
  const [editorBase,setEditorBase]=useState('')
  const [pendingLeave,setPendingLeave]=useState<{target?:'calendar'|'templates'}|null>(null)
  const [deleting,setDeleting]=useState<string|null>(null)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [serverRows,setServerRows]=useState<ApiRow[]>([])
  const [loading,setLoading]=useState(false)
  const [publishing,setPublishing]=useState<TariffTemplate|null>(null)
  const [from,setFrom]=useState(()=>dateKey(new Date()))
  const [until,setUntil]=useState('')
  const [busy,setBusy]=useState(false)
  const [revision,setRevision]=useState(0)
  const calendarDirty=JSON.stringify(workspace.assignments)!==JSON.stringify(saved.assignments)
  const editorDirty=!!editor && JSON.stringify(editor)!==editorBase
  const dirty=calendarDirty||editorDirty
  const {requestLeave,settleLeave}=useEditorLeaveGuard({
    dirty,enabled:canRead&&canManage,registerLeaveGuard,
    onConfirm:()=>setPendingLeave({}),onCancel:()=>setPendingLeave(null),
  })

  useEffect(()=>{
    const handler=(event:BeforeUnloadEvent)=>{if(dirty&&canManage){event.preventDefault();event.returnValue=''}}
    window.addEventListener('beforeunload',handler)
    return()=>window.removeEventListener('beforeunload',handler)
  },[dirty,canManage])
  useEffect(()=>{
    if(DEMO_MODE || !canRead) {setServerRows([]);setLoading(false);return}
    const controller=new AbortController()
    setLoading(true);setServerRows([]);setError('')
    api<ApiRow[]>(`/stations/${encodeURIComponent(station.id)}/tariffs`,{signal:controller.signal})
      .then(rows=>{if(!controller.signal.aborted)setServerRows(rows)})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'读取电价失败')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[station.id,canRead,revision])
  useEffect(()=>{
    if(!canManage){setEditor(null);setPublishing(null);setDeleting(null);setView('calendar')}
  },[canManage])
  function persist(next:Workspace,message:string) {
    if(!canManage)return false
    try{
      localStorage.setItem(key,JSON.stringify(next))
      setWorkspace(next);setSaved(next);setNotice(message);setError('')
      return true
    } catch{setError('本机存储失败，内容仍在页面中，请重试');return false}
  }
  function persistTemplate(nextTemplates:TariffTemplate[],message:string,nextAssignments=workspace.assignments,savedAssignments=saved.assignments) {
    if(!canManage)return false
    const persisted={templates:nextTemplates,assignments:savedAssignments}
    try {
      localStorage.setItem(key,JSON.stringify(persisted))
      setWorkspace({templates:nextTemplates,assignments:nextAssignments});setSaved(persisted);setNotice(message);setError('')
      return true
    } catch {setError('本机存储失败，内容仍在页面中，请重试');return false}
  }
  function saveCalendar() {
    return persist({templates:workspace.templates,assignments:workspace.assignments},'电价日历分配已保存到本机，尚未发布到服务器')
  }
  function discardDraft() {
    if(calendarDirty)setWorkspace(current=>({...current,assignments:saved.assignments}))
    if(editorDirty)setEditor(null)
  }
  function finishLeave(save:boolean) {
    if(save && (editorDirty && !saveTemplate() || calendarDirty && !saveCalendar()))return
    if(!save)discardDraft()
    const target=pendingLeave?.target
    settleLeave(true)
    setPendingLeave(null)
    if(target){setEditor(null);setView(target);setError('')}
  }
  function navigate(next:'calendar'|'templates') {
    if((view==='editor'&&editorDirty) || (view==='calendar'&&calendarDirty)){setPendingLeave({target:next});return}
    setEditor(null);setView(next);setError('')
  }
  function openEditor(template?:TariffTemplate) {
    const value=structuredClone(template??newTemplate())
    setEditor(value);setEditorBase(JSON.stringify(value));setView('editor');setError('');setNotice('')
  }
  function saveTemplate() {
    if(!editor || !canManage)return false
    const problem=validateTemplate(editor)
    if(problem){setError(problem);return false}
    if(workspace.templates.some(item=>item.id!==editor.id && item.name.trim()===editor.name.trim())){setError('模板名称已存在');return false}
    const next=[...workspace.templates.filter(item=>item.id!==editor.id),{...editor,name:editor.name.trim()}]
    if(!persistTemplate(next,'模板已保存到本机，尚未发布到服务器'))return false
    setEditor(null);setView('templates');return true
  }
  async function publish() {
    if(!publishing || busy || !canManage)return
    const problem=validatePeriods(publishing.buy)
    if(problem || !from || !until || until<=from){setError(problem || '请输入有效的生效日期与结束日期（不含）');return}
    if(serverRows.some(row=>from<String(row.valid_until) && until>String(row.valid_from))){setError('新电价生效期间与已保存期间重叠；请创建不重叠的新期间');return}
    setBusy(true);setError('')
    try {
      await send('/tariffs','POST',{stationId:Number(station.id),name:publishing.name,currency:publishing.currency,validFrom:from,validUntil:until,periods:publishing.buy.map(row=>({startMinute:minute(row.start),endMinute:minute(row.end),band:row.band,pricePerKwh:Number(row.price)}))})
      setPublishing(null);setNotice('新电价生效期间已由服务器创建，既有版本未覆盖；独立售电规则未发布');setRevision(v=>v+1)
    } catch(cause){setError(cause instanceof Error?cause.message:'保存电价失败')}
    finally{setBusy(false)}
  }
  function copyServer(row:ApiRow) {
    const time=(value:unknown)=>`${String(Math.floor(Number(value)/60)).padStart(2,'0')}:${String(Number(value)%60).padStart(2,'0')}`
    const value=newTemplate()
    value.name=`${String(row.name)} 副本`;value.mode='tou';value.currency=String(row.currency)
    value.buy=((row.periods??[]) as ApiRow[]).map(item=>({start:time(item.start_minute),end:time(item.end_minute),band:item.band as TariffTemplate['buy'][number]['band'],price:String(item.price_per_kwh)}))
    openEditor(value)
  }
  return <main className="tariff-workspace" data-tariff-view={view}>
    <nav className="tariff-breadcrumb" aria-label="电价导航">
      <button onClick={()=>{void requestLeave().then(allowed=>{if(allowed)onOpenStrategy?.()})}}>策略运行</button><span>›</span><button onClick={()=>navigate('calendar')}>电价设置</button>
      {view==='editor'&&<><span>›</span><button onClick={()=>navigate('templates')}>日模板管理</button></>}
    </nav>
    <header className="tariff-title"><h1>{view==='calendar'?'电价日历':view==='templates'?'日模板管理':'编辑日模板'}</h1><div>
      {view==='calendar'?<><button onClick={()=>navigate('templates')}>日模板管理</button><button className="primary" disabled={!canManage} onClick={saveCalendar}>保存设置</button></>:
        view==='templates'?<><button onClick={()=>navigate('calendar')}>返回日历</button><button className="primary" disabled={!canManage} onClick={()=>openEditor()}>＋ 新增模板</button></>:
          <><button onClick={()=>navigate('templates')}>取消</button><button className="primary" disabled={!canManage} onClick={saveTemplate}>保存模板</button></>}
    </div></header>
    {error&&!pendingLeave&&<p role="alert" className="tariff-error">{error}</p>}{notice&&<p role="status" className="tariff-notice">{notice}</p>}
    {view==='calendar'&&<TariffCalendar workspace={workspace} onChange={setWorkspace} serverRows={serverRows} disabled={!canManage}/>}
    {view==='templates'&&<>
      <section className="tariff-card tariff-template-table"><table><thead><tr><th>模板名称</th><th>购电规则</th><th>售电规则</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {workspace.templates.map(template=><tr key={template.id}>
          <td>{template.name}</td><td>{modeNames[template.mode]}电价{template.mode==='dynamic'?'':` · ${template.buy.length} 个时段`}</td>
          <td>{template.mode==='dynamic'?'动态映射':template.sell.every(row=>!row.price.trim())?'待配置':`${template.sell.length===1?'固定':'分时'}电价 · ${template.sell.length} 个时段`}</td><td><span className="tariff-badge">本地草稿</span></td>
          <td><div className="tariff-row-actions"><button aria-label={`编辑${template.name}`} disabled={!canManage} onClick={()=>openEditor(template)}><TariffIcon name="edit"/></button>
            <button aria-label={`删除${template.name}`} disabled={!canManage} onClick={()=>setDeleting(template.id)}><TariffIcon name="delete"/></button>
            {!DEMO_MODE&&<button disabled={!canManage||template.mode==='dynamic'} title={template.mode==='dynamic'?'动态电价服务未接通':''} onClick={()=>{setPublishing(template);setError('')}}>创建生效期间</button>}
          </div></td>
        </tr>)}
        {!workspace.templates.length&&<tr><td colSpan={5} className="tariff-empty">暂无日模板，点击“新增模板”开始配置</td></tr>}
      </tbody></table></section>
      {!DEMO_MODE&&<section className="tariff-card"><h2>服务器电价版本</h2><p className="tariff-footnote">现有接口支持创建购电生效期间；独立售电、日历批量发布、动态供应商接入尚未支持。</p>
        <table><thead><tr><th>名称</th><th>币种</th><th>生效日期</th><th>结束日期（不含）</th><th>操作</th></tr></thead><tbody>
          {serverRows.map((row,index)=><tr key={String(row.id??index)}><td>{String(row.name)}</td><td>{String(row.currency)}</td><td>{String(row.valid_from)}</td><td>{String(row.valid_until)}</td><td><button disabled={!canManage} onClick={()=>copyServer(row)}>复制为本地模板</button></td></tr>)}
          {!serverRows.length&&<tr><td colSpan={5} className="tariff-empty">{loading?'正在读取电价版本…':'服务器暂无电价版本。请新建生效期间并配置时段。'}</td></tr>}
        </tbody></table>
      </section>}
    </>}
    {view==='editor'&&editor&&<TariffTemplateEditor value={editor} onChange={next=>{setEditor(next);setError('')}} disabled={!canManage}/>}
    {pendingLeave&&<Dialog title={editorDirty?'未保存的模板':'未保存的日历分配'} onClose={()=>{settleLeave(false);setPendingLeave(null)}}><p>{editorDirty?'模板尚未保存':'日历分配尚未保存'}，离开后本次修改将丢失。</p>{error&&<p role="alert" className="tariff-error">{error}</p>}<div className="tariff-dialog-actions">
      <button onClick={()=>{settleLeave(false);setPendingLeave(null)}}>继续编辑</button><button onClick={()=>finishLeave(false)}>不保存离开</button>
      <button className="primary" disabled={!canManage} onClick={()=>finishLeave(true)}>保存并离开</button>
    </div></Dialog>}
    {deleting&&<Dialog title="删除日模板" onClose={()=>setDeleting(null)}><p>删除后，将同时移除本机日历对该模板的分配，不会删除服务器已生效电价。</p><div className="tariff-dialog-actions">
      <button onClick={()=>setDeleting(null)}>取消</button><button disabled={!canManage} onClick={()=>{const templates=workspace.templates.filter(t=>t.id!==deleting);const assignments=Object.fromEntries(Object.entries(workspace.assignments).filter(([,id])=>id!==deleting));const savedAssignments=Object.fromEntries(Object.entries(saved.assignments).filter(([,id])=>id!==deleting));if(persistTemplate(templates,'本地模板及相关日历分配已删除',assignments,savedAssignments))setDeleting(null)}}>确认删除</button>
    </div></Dialog>}
    {publishing&&<Dialog title="创建服务器电价生效期间" onClose={()=>{if(!busy)setPublishing(null)}}>
      <p>模板：{publishing.name}。只提交购电规则，不覆盖已有电价；独立售电及日历分配不会发布。</p>
      <label>生效日期<input aria-label="电价生效日期" type="date" value={from} disabled={busy} onChange={e=>setFrom(e.target.value)}/></label>
      <label>结束日期（不含）<input aria-label="电价结束日期" type="date" min={from} value={until} disabled={busy} onChange={e=>setUntil(e.target.value)}/></label>
      {error&&<p role="alert">{error}</p>}<div className="tariff-dialog-actions"><button disabled={busy} onClick={()=>setPublishing(null)}>取消</button><button className="primary" disabled={busy||!canManage} onClick={publish}>{busy?'正在保存…':'创建新生效期间'}</button></div>
    </Dialog>}
  </main>
}
