import {useEffect,useRef,useState,type ReactNode} from 'react'
import {useEditorLeaveGuard,type RegisterLeaveGuard} from '../useEditorLeaveGuard'
import {DEMO_MODE} from '@/api/client'
import {useAuth} from '@/auth/AuthContext'

export function WorkflowConfirm({title,children,onClose,onConfirm,label='确认',busy=false}:{title:string;children:ReactNode;onClose:()=>void;onConfirm:()=>void;label?:string;busy?:boolean}){
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[])
 return <dialog ref={ref} className="wo-confirm" aria-label={title} onCancel={e=>{e.preventDefault();onClose()}}><button className="operations-icon wo-close" aria-label="关闭确认" onClick={onClose}><img src="/figma/work-orders/close.svg" alt=""/></button><span className="wo-confirm-symbol"><img src="/figma/work-orders/warning.svg" alt=""/></span><h2>{title}</h2><div>{children}</div><footer><button className="operations-button" onClick={onClose}>取消</button><button className="operations-button work-orders-approve" disabled={busy} onClick={onConfirm}>{label}</button></footer></dialog>
}
export function useWorkflowLeave(dirty:boolean,registerLeaveGuard:RegisterLeaveGuard|undefined,reset:()=>void,identity:string,enabled=true){
 const [confirm,setConfirm]=useState(false)
 const {requestLeave,settleLeave}=useEditorLeaveGuard({dirty,enabled,registerLeaveGuard,onConfirm:()=>setConfirm(true),onCancel:()=>setConfirm(false)})
 const identityRef=useRef(identity)
 useEffect(()=>{if(identityRef.current!==identity){settleLeave(false);setConfirm(false);reset();identityRef.current=identity}},[identity,settleLeave])
 useEffect(()=>{if(!dirty)return;const unload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',unload);return()=>window.removeEventListener('beforeunload',unload)},[dirty])
 const dialog=confirm?<WorkflowConfirm title="放弃未保存修改？" label="放弃修改" onClose={()=>{setConfirm(false);settleLeave(false)}} onConfirm={()=>{reset();setConfirm(false);settleLeave(true)}}><p>离开后将丢弃尚未保存的内容。</p><button className="operations-button" onClick={()=>{setConfirm(false);settleLeave(false)}}>继续编辑</button></WorkflowConfirm>:null
 return {requestLeave,dialog,cancelPending:()=>{settleLeave(false);setConfirm(false)}}
}
export function workflowKey(account:string,station:string,kind:string,id:string){return `enerlution-workflow-v1:${DEMO_MODE?'demo':'api'}:${account}:${station}:${kind}:${id}`}
export function LocalWorkflowFields({stationId,objectId,kind}:{stationId:string;objectId:string;kind:string}){
 const {user}=useAuth();let draft:Record<string,string>|null=null
 try{draft=JSON.parse(localStorage.getItem(workflowKey(user?.id||'',stationId,kind,objectId))||'null')}catch{return <p role="alert">本地补充字段读取失败</p>}
 if(!draft)return null
 const fields=[['source','来源'],['device','关联设备'],['priority','等级'],['description','检查内容']]
 return <details className="wo-detail-card"><summary>本地补充字段（非服务器记录）</summary><dl className="wo-detail-grid">{fields.filter(([key])=>draft?.[key]).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{draft?.[key]}</dd></div>)}</dl></details>
}
type Draft={result:string;appearance:string;communication:string;parameters:string;files:string[];cause:string;hours:string;part:string;quantity:string}
const empty:Draft={result:'',appearance:'',communication:'',parameters:'',files:[],cause:'',hours:'',part:'',quantity:''}
export function WorkHandling({stationId,objectId,kind,canEdit,registerLeaveGuard,onComplete,onNote}:{stationId:string;objectId:string;kind:'order'|'inspection';canEdit:boolean;registerLeaveGuard?:RegisterLeaveGuard;onComplete?:(note:string)=>Promise<boolean>;onNote?:(note:string)=>Promise<boolean>}){
 const {user}=useAuth();const key=workflowKey(user?.id||'anonymous',stationId,kind,objectId)
 const [draft,setDraft]=useState<Draft>(empty),[baseline,setBaseline]=useState<Draft>(empty),[notice,setNotice]=useState(''),[error,setError]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false)
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');const next=saved?{...empty,...saved}:empty;setDraft(next);setBaseline(next)}catch{setDraft(empty);setBaseline(empty);setError('本地草稿读取失败')}},[key])
 const leave=useWorkflowLeave(JSON.stringify(draft)!==JSON.stringify(baseline),registerLeaveGuard,()=>{setDraft(baseline);setConfirm(false)},`${key}:${canEdit}`,canEdit)
 useEffect(()=>{if(!canEdit){leave.cancelPending();setConfirm(false)}},[canEdit])
 const change=(patch:Partial<Draft>)=>{setDraft(d=>({...d,...patch}));setError('');setNotice('')}
 function validate(){if(!draft.result.trim()){setError(kind==='order'?'请填写处理结果':'请填写巡检记录');return false}if(kind==='inspection'&&(!draft.appearance||!draft.communication||!draft.parameters)){setError('请完成全部三项检查');return false}return true}
 async function save(){if(!canEdit||!validate())return;setBusy(true);try{localStorage.setItem(key,JSON.stringify(draft));setConfirm(false);if(kind==='inspection'&&onComplete){const ok=await onComplete(`设备外观：${draft.appearance}；通信状态：${draft.communication}；运行参数：${draft.parameters}。${draft.result}`);if(!ok){setError('巡检提交失败，已保留本地草稿');return}setBaseline(draft);setNotice(DEMO_MODE?'巡检记录已保存为本地预览，未提交服务器':'巡检记录已由服务器保存；附件仅保存本地文件名')}else {setBaseline(draft);setNotice('验收草稿已保存至本机；验收接口未接通，工单状态未改变')}}catch{setError('保存失败：本地存储不可用')}finally{setBusy(false)}}
 return <section className="wo-handling"><h3>{kind==='order'?'处理与验收':'巡检办理'}</h3>{kind==='inspection'&&<div className="wo-check-grid">{[['appearance','设备外观'],['communication','通信状态'],['parameters','运行参数']].map(([field,label])=><label key={field}>{label}<select disabled={!canEdit} aria-label={label} value={draft[field as keyof Draft] as string} onChange={e=>change({[field]:e.target.value})}><option value="">请选择</option><option>正常</option><option>异常</option><option>不适用</option></select></label>)}</div>}
 <label>{kind==='order'?'处理结果':'巡检记录'}<textarea aria-label={kind==='order'?'处理结果':'巡检记录'} value={draft.result} disabled={!canEdit} onChange={e=>change({result:e.target.value})} maxLength={2000}/></label>
 <label className="wo-upload">上传附件<input type="file" aria-label="上传附件" multiple disabled={!canEdit} onChange={e=>change({files:Array.from(e.target.files||[]).map(f=>f.name)})}/></label>{draft.files.length>0&&<p>{draft.files.join('、')} <button onClick={()=>change({files:[]})} disabled={!canEdit}>移除附件</button></p>}
 <p className="wo-boundary">{kind==='order'?'验收流程尚未接通；可保存处理结果草稿，不会将工单变为已完成。':'三项检查及巡检记录将作为结果说明提交；附件上传尚未接通，仅保存文件名。'}</p>
 {kind==='order'&&<details><summary>维修与排查方案 / 备件申请</summary><div className="wo-check-grid">{[['cause','可能原因分析'],['hours','预计耗时（工时）'],['part','所需消耗备件'],['quantity','需求量']].map(([field,label])=><label key={field}>{label}<input aria-label={label} disabled={!canEdit} value={draft[field as keyof Draft] as string} onChange={e=>change({[field]:e.target.value})}/></label>)}</div><p>库存储备：未接通。方案及备件申请仅保存在本地草稿。</p></details>}
 {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
 <footer>{onNote&&<button className="operations-button" disabled={!canEdit||busy} onClick={async()=>{if(!draft.result.trim()){setError('请填写处理结果');return}setBusy(true);try{if(await onNote(draft.result)){setBaseline(previous=>({...previous,result:draft.result}));setNotice('处理记录已由服务器保存')}}finally{setBusy(false)}}}>保存处理记录</button>}<button className="operations-button work-orders-approve" disabled={!canEdit||busy} onClick={()=>{if(validate())setConfirm(true)}}>{kind==='order'?'提交验收':'提交巡检'}</button></footer>
 {confirm&&<WorkflowConfirm title={kind==='order'?'提交工单处理结果？':'提交巡检记录？'} label={kind==='order'?'保存验收草稿':'确认提交巡检'} busy={busy} onClose={()=>setConfirm(false)} onConfirm={save}><p>{kind==='order'?'本次仅保存本地验收草稿；不会直接关闭工单。':`三项检查：${draft.appearance} / ${draft.communication} / ${draft.parameters}`}</p></WorkflowConfirm>}{leave.dialog}</section>
}
