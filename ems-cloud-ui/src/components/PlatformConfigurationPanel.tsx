import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { DEMO_MODE } from "@/api/client"
import { useAuth } from "@/auth/AuthContext"
import type { RolePermissionsHandle } from "./RolePermissionsPanel"
import { useEditorLeaveGuard } from "./useEditorLeaveGuard"
import PlatformLeaveDialog from "./PlatformLeaveDialog"

const tabs = ["审批规则", "安全策略", "告警与通知", "接口接入", "系统配置"] as const
type Tab = typeof tabs[number]
type Draft = { id: string; tab: Tab; name: string; values: Record<string, string> }
type Field = { label: string; options?: string[]; type?: string; min?: number; max?: number; secret?: boolean }
const fields: Record<Tab, { title: string; fields: Field[] }[]> = {
 "审批规则": [{ title:"规则设置", fields:[{label:"规则名称"},{label:"业务类型",options:["策略下发","工单验收","临时授权"]},{label:"适用范围"},{label:"审批人顺序"},{label:"审批方式",options:["逐级审批","会签"]},{label:"同人处理",options:["提交人与审批人不可为同一人","允许同人（草稿）"]},{label:"驳回处理",options:["退回提交人，修改后重新提交","终止申请"]}]}],
 "安全策略": [{title:"登录与会话",fields:[{label:"多因素认证",options:["管理员必须启用","所有成员必须启用"]},{label:"登录失败次数",type:"number",min:1,max:20},{label:"锁定时长（分钟）",type:"number",min:1,max:1440},{label:"会话超时（分钟）",type:"number",min:5,max:1440},{label:"密码最小长度",type:"number",min:8,max:128}]},{title:"访问限制",fields:[{label:"IP访问限制",options:["仅允许指定网段","不限制（草稿）"]},{label:"允许网段（CIDR）"},{label:"外部服务访问",options:["仅限授权资产范围"]},{label:"账号会话管理",options:["由管理员撤销会话"]}]},{title:"审计与敏感操作",fields:[{label:"审计保留期限（月）",type:"number",min:1,max:120},{label:"记录删除",options:["不允许"]},{label:"导出权限"},{label:"API密钥轮换",options:["二次身份验证"]},{label:"权限变更",options:["记录变更前后内容"]},{label:"生产控制",options:["独立操作授权及审批"]}]}],
 "告警与通知": [{title:"故障警告及门限触发规则",fields:[{label:"规则名称"},{label:"触发条件逻辑"},{label:"告警级别",options:["特级强阻断","一般偏差警告"]},{label:"下发通道",options:["SMS","Email","Wechat","SMS + Email + Wechat"]},{label:"首次联系岗位"},{label:"静默周期（分钟）",type:"number",min:0,max:1440}]},{title:"通知通道配置（不保存凭证）",fields:[{label:"短信接收号码"},{label:"SMTP服务器",secret:true},{label:"SMTP端口",type:"number",min:1,max:65535},{label:"SMTP账号",secret:true},{label:"SMTP认证密码",type:"password",secret:true},{label:"邮件接收地址"},{label:"企业微信Webhook地址",type:"url",secret:true}]},{title:"分级联动升级告警响应机制",fields:[{label:"首轮通知延迟（分钟）",type:"number",min:0,max:1440},{label:"一级升级等待（分钟）",type:"number",min:1,max:1440},{label:"一级升级岗位"},{label:"终期干预等待（分钟）",type:"number",min:1,max:1440},{label:"终期干预岗位"}]}],
 "接口接入": [{title:"API凭证申请（服务未接通）",fields:[{label:"凭证名称"},{label:"权限范围说明"},{label:"到期时间",type:"date"}]},{title:"第三方集成连接",fields:[{label:"集成类型",options:["电网调度自动化系统","气象数据服务","SAP ERP","SCADA中心","企业微信通知","自定义外部Webhook"]},{label:"接口地址",type:"url",secret:true},{label:"协议",options:["HTTPS JSON-RPC","HTTPS REST"]},{label:"推流频率（秒）",type:"number",min:1,max:86400},{label:"认证凭证（仅本次输入）",type:"password",secret:true}]}],
 "系统配置": [{title:"基本设置 (General)",fields:[{label:"平台管理名称"},{label:"默认展示语言",options:["简体中文","English"]},{label:"默认运行时区",options:["Asia/Shanghai","UTC"]},{label:"数据保留期（天）",type:"number",min:1,max:3650}]},{title:"安全设置 (Security & Auth)",fields:[{label:"管理员密码最小长度",type:"number",min:8,max:128},{label:"口令复杂度",options:["大小写、数字与特殊字符","字母与数字"]},{label:"静止超时（分钟）",type:"number",min:5,max:1440},{label:"高功率操作二次验证",options:["必须校验验证器令牌"]},{label:"IP信任网段（CIDR）"}]},{title:"数据管理与采集 (Data & Edge)",fields:[{label:"采集基准（秒）",type:"number",min:1,max:3600},{label:"协议无损压缩",options:["开启（草稿）","关闭（草稿）"]},{label:"本地计划备份",options:["开启（草稿）","关闭（草稿）"]},{label:"备份触发周期",options:["每天03:00","每周一03:00"]},{label:"备份保留天数",type:"number",min:1,max:365}]},{title:"可视化与显示偏好 (Display)",fields:[{label:"温度单位",options:["摄氏度 °C","华氏度 °F"]},{label:"本位币种",options:["CNY","USD","EUR"]},{label:"图表默认时段",options:["过去24小时","过去7天","过去30天"]},{label:"全局深色模式",options:["浅色","深色","跟随系统"]}]}],
}
const isSingleton = (tab: Tab) => tab === "安全策略" || tab === "系统配置"

// Older saves appended random-ID copies. Array order records save order, so
// the last saved copy wins when migrating each singleton business object.
function normalizeDrafts(rows: Draft[]): Draft[] {
  const normalized: Draft[] = []
  for (const row of rows) {
    if (isSingleton(row.tab)) {
      const previous = normalized.findIndex(item => item.tab === row.tab)
      if (previous >= 0) normalized.splice(previous, 1)
      normalized.push({ ...row, id: row.tab, name: row.tab })
    } else normalized.push(row)
  }
  return normalized
}

function read(key: string): Draft[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]")
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(row => row && typeof row.id === "string" && tabs.includes(row.tab) && row.values && typeof row.values === "object" && !Array.isArray(row.values)) as Draft[]
    const normalized = normalizeDrafts(valid)
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      try { localStorage.setItem(key, JSON.stringify(normalized)) } catch { /* Still expose the latest saved value when storage is unavailable. */ }
    }
    return normalized
  } catch { return [] }
}

function singletonDraft(tab: Tab, drafts: Draft[]): Draft {
  const saved = drafts.find(row => row.tab === tab)
  return saved ? structuredClone({ ...saved, id: tab }) : { id: tab, tab, name: tab, values: {} }
}
export default forwardRef<RolePermissionsHandle, { onTemporaryGrants?: () => void }>(function PlatformConfigurationPanel({onTemporaryGrants}, ref) {
 const {user}=useAuth(); const identity=`${DEMO_MODE?"demo":"api"}:${user?.id ?? "anonymous"}`
 const storageKey=`enerlution:platform-config:${identity}`
 const [tab,setTab]=useState<Tab>("审批规则"),[drafts,setDrafts]=useState<Draft[]>(()=>read(storageKey)),[editor,setEditor]=useState<Draft|null>(null),[baseline,setBaseline]=useState<Draft|null>(null),[leave,setLeave]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[query,setQuery]=useState(""),[business,setBusiness]=useState("")
 const fileRef=useRef<HTMLInputElement>(null)
 const dirty=JSON.stringify(editor)!==JSON.stringify(baseline)
 const {requestLeave,settleLeave}=useEditorLeaveGuard({dirty,onConfirm:()=>setLeave(true),onCancel:()=>setLeave(false)})
 useImperativeHandle(ref,()=>({requestLeave}))
 useEffect(()=>{settleLeave(false);setLeave(false);setDrafts(read(storageKey));setEditor(null);setBaseline(null);setNotice("")},[storageKey,settleLeave])
 useEffect(()=>{if(!dirty)return;const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=""};window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent)},[dirty])
 async function change(next: Tab) {
   if (!(await requestLeave())) return
   setTab(next)
   const nextEditor = isSingleton(next) ? singletonDraft(next, drafts) : null
   setEditor(nextEditor)
   setBaseline(nextEditor ? structuredClone(nextEditor) : null)
   setError(""); setNotice(""); setQuery(""); setBusiness("")
 }
 function open(row?: Draft) {
   const next = isSingleton(tab)
     ? singletonDraft(tab, drafts)
     : row ? structuredClone(row) : { id: crypto.randomUUID(), tab, name: "", values: {} }
   setEditor(next)
   setBaseline(structuredClone(next))
   setError(""); setNotice("")
 }
 function value(label:string,v:string){setEditor(current=>current?{...current,values:{...current.values,[label]:v}}:null)}
 function save(){if(!editor)return;const name=editor.values["规则名称"]||editor.values["凭证名称"]||tab;if(!name.trim()){setError("请输入名称");return} const clean={...editor,id:isSingleton(tab)?tab:editor.id,name,values:Object.fromEntries(Object.entries(editor.values).filter(([label])=>!fields[tab].flatMap(s=>s.fields).some(f=>f.label===label&&f.secret)))};const next=normalizeDrafts([...drafts.filter(d=>isSingleton(tab)?d.tab!==tab:d.id!==clean.id),clean]);try{localStorage.setItem(storageKey,JSON.stringify(next));setDrafts(next);setEditor(tab==="安全策略"||tab==="系统配置"?clean:null);setBaseline(tab==="安全策略"||tab==="系统配置"?structuredClone(clean):null);setNotice("本地草稿已保存，尚未提交或生效。")}catch{setError("本地存储不可用，输入仍保留，请重试。")}}
 const rows=drafts.filter(d=>d.tab===tab&&(!business||d.values["业务类型"]===business)&&`${d.name} ${JSON.stringify(d.values)}`.includes(query))
 return <section className="platform-config" aria-label="配置中心"><nav className="orgv2-tabs" role="tablist">{tabs.map(t=><button key={t} role="tab" aria-selected={t===tab} onClick={()=>void change(t)}>{t}</button>)}</nav><p className="api-context-note">配置服务未接通。此处仅编写本账号、本模式的本地草稿，不能下发、生效或改变授权。</p>
 {tab==="审批规则"&&onTemporaryGrants&&<p className="orgv2-subtext">成员期限授权已连接业务服务。<button className="platform-text-button" onClick={async()=>{if(await requestLeave())onTemporaryGrants()}}>管理临时授权</button> 支持30天、90天、1年及长期；自定义小时、原因和审批尚未接通。</p>}
 {notice&&<p role="status" className="api-context-note">{notice}</p>}
 {tab==="告警与通知"&&<div className="platform-config-channels">{["短信通知通道","SMTP邮件通知服务","企业微信Webhook"].map(c=><section className="orgv2-panel" key={c}><h3>{c}</h3><p>未接通 · 无服务状态</p><button className="orgv2-outline" onClick={async()=>{if(await requestLeave()){open();value("下发通道",c.includes("SMTP")?"Email":c.includes("短信")?"SMS":"Wechat")}}}>配置草稿</button><button className="platform-text-button" onClick={()=>setNotice("通知发送和连通测试服务未接通，未发送任何消息。")}>测试通道</button></section>)}</div>}
 {!editor&&<><div className="orgv2-filters"><input aria-label="搜索配置草稿" placeholder="搜索规则 / 配置草稿" value={query} onChange={e=>setQuery(e.target.value)}/>{tab==="审批规则"&&<select aria-label="审批业务类型" value={business} onChange={e=>setBusiness(e.target.value)}><option value="">业务类型：全部</option>{["策略下发","工单验收","临时授权"].map(v=><option key={v}>{v}</option>)}</select>}<button className="orgv2-primary" onClick={()=>open()}>{tab==="审批规则"?"新建规则":tab==="告警与通知"?"添加判定规则":tab==="接口接入"?"申请API凭证 / 配置集成":"编辑配置草稿"}</button></div><section className="orgv2-panel"><h2>{tab==="接口接入"?"安全 API 调用凭证 (API Keys)":tab}</h2><div className="orgv2-table-scroll"><table className="orgv2-table"><thead><tr>{(tab==="审批规则"?["规则名称","业务类型","适用范围","审批人","状态","操作"]:tab==="告警与通知"?["规则名称","触发条件逻辑","告警级别","下发通道","首次联系岗位","静默周期","状态","操作"]:["凭证名称","Client API Key","创建时间","到期时间","权限范围","状态","操作"]).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(d=><tr key={d.id}><td>{d.name}</td>{(tab==="审批规则"?[d.values["业务类型"],d.values["适用范围"],d.values["审批人顺序"]]:tab==="告警与通知"?[d.values["触发条件逻辑"],d.values["告警级别"],d.values["下发通道"],d.values["首次联系岗位"],d.values["静默周期（分钟）"]]:["未生成","—",d.values["到期时间"],d.values["权限范围说明"]]).map((v,i)=><td key={i}>{v||"未配置"}</td>)}<td>本地草稿 · 未生效</td><td><button className="platform-text-button" onClick={()=>open(d)}>编辑草稿</button></td></tr>)}</tbody></table></div>{!rows.length&&<p className="platform-empty">暂无本地草稿；服务尚未接通</p>}</section></>}
 {editor&&<form onSubmit={e=>{e.preventDefault();save()}}><div className="platform-config-grid">{fields[tab].map(section=><section className="orgv2-panel" key={section.title}><h3>{section.title}</h3><div className="platform-config-fields">{section.fields.map(f=><label key={f.label}>{f.label}{f.options?<select aria-label={f.label} value={editor.values[f.label]||""} onChange={e=>value(f.label,e.target.value)}><option value="">请选择（未配置）</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:<input type={f.type||"text"} value={editor.values[f.label]||""} min={f.min} max={f.max} maxLength={500} required={f.label==="规则名称"||f.label==="凭证名称"} autoComplete={f.secret?"off":undefined} onChange={e=>value(f.label,e.target.value)}/>}</label>)}</div>{tab==="系统配置"&&section.title.startsWith("基本")&&<label className="platform-local-logo">系统品牌标志（仅本次预览）<input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={e=>setNotice(e.target.files?.[0]?`已选择 ${e.target.files[0].name}，上传服务未接通，文件未上传。`:"")}/></label>}</section>)}</div>{tab==="审批规则"&&<section className="orgv2-panel"><h3>审批顺序预览</h3><p>提交人 → {editor.values["审批人顺序"]||"待配置审批人"} → 审批通过（草稿流程）</p></section>}{error&&<p role="alert" className="api-inline-error">{error}</p>}<div className="orgv2-submit"><span className="orgv2-subtext">{tab==="接口接入"?"接口地址和认证凭证不会写入本地草稿。":"草稿只保存在当前浏览器。"}</span><button type="button" className="orgv2-outline" onClick={async()=>{if(await requestLeave()){setEditor(null);setBaseline(null)}}}>取消</button>{(tab==="系统配置"||tab==="安全策略")&&<button type="button" className="orgv2-outline" onClick={()=>setEditor({...editor,values:{}})}>恢复未配置默认值</button>}<button className="orgv2-primary">保存本地草稿</button></div></form>}
 {tab==="接口接入"&&<><section className="orgv2-panel"><h3>第三方集成及企业生态数据连接</h3><div className="platform-config-channels">{["电网调度自动化系统","精准气象数据服务","集团SAP ERP","SCADA中心","企业微信通知Webhook","自定义外部Webhook"].map(v=><div key={v}><strong>{v}</strong><p>未接通 · 同步时间 —</p></div>)}</div></section><div className="platform-config-grid"><section className="orgv2-panel"><h3>API安全限流状态</h3><p>当前调用水位 — / —</p><p>服务未接通，无法读取配额。</p></section><section className="orgv2-panel"><h3>最近调用实时日志</h3><table className="orgv2-table"><thead><tr><th>时间</th><th>Endpoint</th><th>方法</th><th>状态码</th><th>网络时延</th></tr></thead></table><p>暂无可读取的调用日志</p></section></div></>}
 {leave&&<PlatformLeaveDialog onDecide={allow=>{if(allow)setEditor(baseline?structuredClone(baseline):null);setLeave(false);settleLeave(allow)}}/>}</section>
})
