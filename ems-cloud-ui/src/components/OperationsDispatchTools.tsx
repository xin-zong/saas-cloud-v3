import { useEffect, useState } from "react"
import type { Station } from "@/App"
import { useAuth } from "@/auth/AuthContext"
import { hasStationPermission } from "@/auth/apiPermissions"
import { DEMO_MODE } from "@/api/client"
import { dispatchStation } from "@/data/stationDispatch"
import { operationsDate } from "@/data/operations"
import { stationsDataNow } from "@/data/dataClock"
import { Modal } from "./station-provision/Common"
import { useEditorLeaveGuard, type RegisterLeaveGuard } from "./useEditorLeaveGuard"

const actions = ["设置充电有功功率", "设置放电有功功率", "记录运行交接", "暂停计划建议", "取消计划建议", "暂停策略建议", "回滚版本建议"]
type Note = { action: string; power: string; note: string; version: string; savedAt: string }
export default function OperationsDispatchTools({station, onBack, onStrategy, onOpenStation, registerLeaveGuard}: {
  station: Station
  onBack: () => void
  onStrategy: () => void
  onOpenStation: (id:string,tab?:string)=>void
  registerLeaveGuard?: RegisterLeaveGuard
}) {
  const {user} = useAuth()
  const canManage = DEMO_MODE || hasStationPermission(user,station.id,"strategy.manage")
  const canAsset = DEMO_MODE || hasStationPermission(user,station.id,"asset.read")
  const key = `enerlution-dispatch-notes-v1:${DEMO_MODE?"demo":"api"}:${user?.id}:${station.id}`
  const [action,setAction] = useState(actions[0]), [power,setPower]=useState(""),[note,setNote]=useState(""),[version,setVersion]=useState("")
  const [dirty,setDirty]=useState(false),[leaving,setLeaving]=useState(false),[confirm,setConfirm]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  const [notes,setNotes]=useState<Note[]>(()=>{try{const value=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(value)?value.filter(n=>n&&typeof n.action==="string"&&typeof n.note==="string"&&typeof n.savedAt==="string"):[]}catch{return []}})
  const {requestLeave,settleLeave}=useEditorLeaveGuard({dirty,enabled:canManage,registerLeaveGuard,onConfirm:()=>setLeaving(true),onCancel:()=>setLeaving(false)})
  useEffect(()=>{if(!canManage){setConfirm(false);setDirty(false);setPower("");setNote("");setVersion("")}},[canManage])
  useEffect(()=>{const unload=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue=""}};window.addEventListener("beforeunload",unload);return()=>window.removeEventListener("beforeunload",unload)},[dirty])
  const now=stationsDataNow([station]),row=dispatchStation(station,operationsDate(now),now)
  const isPower=action.includes("有功功率")
  function validate() {
    if(!canManage)return false
    if(isPower && (!power.trim() || !Number.isFinite(Number(power)) || Number(power)<=0 || !Number.isFinite(station.ratedPower) || Number(power)>station.ratedPower)){setError("目标功率须大于 0 且不超过站点额定功率；设备能力与联锁尚未接通。");return false}
    if(!note.trim() || (action==="回滚版本建议"&&!version.trim())){setError("请填写操作说明及回滚目标版本。");return false}
    setError("");return true
  }
  function save(){
    if(!validate())return
    const next=[{action,power:isPower?power:"",note:note.trim(),version,savedAt:new Date().toISOString()},...notes]
    try{localStorage.setItem(key,JSON.stringify(next));setNotes(next);setDirty(false);setConfirm(false);setNotice("本地建议已保存，未下发设备或提交审批。")}catch{setError("本地保存失败，请检查浏览器存储权限。");setConfirm(false)}
  }
  const leave=(next:()=>void)=>{void(async()=>{if(await requestLeave())next()})()}
  return <div className="dispatch-page ops-dispatch-tools">
    <div className="dispatch-toolbar"><button className="operations-button" onClick={()=>leave(onBack)}>返回策略执行</button><strong>{station.name}</strong><button className="operations-button" onClick={()=>leave(onStrategy)}>策略与内部计划</button></div>
    <div className="ops-dispatch-grid"><div>
      <section className="dispatch-surface"><h2>当前调度状态</h2><div className="ops-state-counts"><div><span>计划覆盖</span><strong>{row.hasPlan?"已接入":"未知"}</strong></div><div><span>当前目标 / 实测</span><strong>{row.current.planned??"--"} / {row.current.actual??"--"} kW</strong></div><div><span>偏差</span><strong>{row.percent===null?"--":`${row.percent.toFixed(1)}%`}</strong></div></div><p className="market-boundary">采样偏差不代表设备下发结果；未接入设备回执。</p></section>
      <section className="dispatch-surface"><h2>活跃调度任务与时段</h2><div className="operations-table-scroll"><table><thead><tr><th>计划版本</th><th>时间范围</th><th>目标值</th><th>模式</th></tr></thead><tbody>{row.plan.periods.map(p=><tr key={p.id}><td>{row.version}</td><td>{p.start} — {p.end}</td><td>{p.power} kW</td><td>{p.mode==="charge"?"充电":p.mode==="discharge"?"放电":"待机"}</td></tr>)}</tbody></table></div>{!row.plan.periods.length&&<div className="operations-empty">暂无已接入的计划时段</div>}</section>
      <section className="dispatch-surface"><h2>偏差与交接</h2><p>{row.status} · {row.version}</p><div className="operations-actions">{canAsset&&<button className="operations-button" onClick={()=>leave(()=>onOpenStation(station.id,"运行曲线"))}>查看实时与历史曲线</button>}{canAsset&&(DEMO_MODE||hasStationPermission(user,station.id,"alarm.read"))&&<button className="operations-button" onClick={()=>leave(()=>onOpenStation(station.id,"告警信息"))}>转告警事件</button>}</div><p className="market-boundary">计划审批继续使用“策略与内部计划”中已接入的提交审批。暂停、取消、回滚与设备控制尚未接通。</p></section>
    </div><section className="dispatch-surface"><h2>调度控制与运行交接</h2><p className="market-boundary">本地操作建议。设备控制、联锁检测、版本历史与外部审批未接通，不能下发指令。</p>
      <form onSubmit={e=>{e.preventDefault();if(validate())setConfirm(true)}} onChange={()=>{setDirty(true);setNotice("")}} className="ops-dispatch-form">
        <label>控制对象<input value={station.name} readOnly disabled /></label>
        <label>控制动作<select value={action} disabled={!canManage} onChange={e=>setAction(e.target.value)}>{actions.map(a=><option key={a}>{a}</option>)}</select></label>
        {isPower&&<label>目标有功功率 kW<input aria-label="目标有功功率 kW" type="number" value={power} disabled={!canManage} onChange={e=>setPower(e.target.value)} /><small>额定功率 {Number.isFinite(station.ratedPower)?station.ratedPower:"--"} kW；实时可用功率未知</small></label>}
        {action==="回滚版本建议"&&<label>目标版本<input value={version} onChange={e=>setVersion(e.target.value)} disabled={!canManage} /></label>}
        <label>操作说明<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} disabled={!canManage} /></label>
        <div className="market-boundary">下发安全检测：设备联锁未知 · 任务冲突未核验 · 电池温度未核验</div>
        {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
        {canManage&&<button className="operations-button market-primary" type="submit">检查并确认</button>}
      </form>
    </section></div>
    <section className="dispatch-surface"><h2>本地建议与交接记录</h2><table><thead><tr><th>动作</th><th>功率 / 版本</th><th>说明</th><th>保存时间</th><th>状态</th></tr></thead><tbody>{notes.map((n,i)=><tr key={`${n.savedAt}:${i}`}><td>{n.action}</td><td>{n.power?`${n.power} kW`:n.version||"—"}</td><td>{n.note}</td><td>{new Date(n.savedAt).toLocaleString()}</td><td>本地草稿 · 未提交</td></tr>)}</tbody></table>{!notes.length&&<div className="operations-empty">暂无本地记录；设备下发历史未接通</div>}</section>
    {confirm&&canManage&&<Modal title="确认保存调度建议？" onClose={()=>setConfirm(false)} actions={<><button className="operations-button" onClick={()=>setConfirm(false)}>取消</button><button className="operations-button market-primary" onClick={save}>保存本地建议</button></>}><p>{station.name} · {action} {isPower?`${power} kW`:version}</p><p>仅保存在当前账号的本机浏览器，未下发设备或提交审批。</p></Modal>}
    {leaving&&<Modal title="放弃未保存修改？" onClose={()=>{setLeaving(false);settleLeave(false)}} actions={<><button className="operations-button" onClick={()=>{setLeaving(false);settleLeave(false)}}>继续编辑</button><button className="operations-button market-primary" onClick={()=>{setLeaving(false);setDirty(false);settleLeave(true)}}>放弃修改</button></>}><p>调度建议尚未保存。</p></Modal>}
  </div>
}
