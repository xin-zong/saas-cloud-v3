import { useEffect, useState, type ReactNode } from "react"
import { useAuth } from "@/auth/AuthContext"
import { DEMO_MODE } from "@/api/client"
import { Modal } from "../station-provision/Common"
import { useEditorLeaveGuard, type RegisterLeaveGuard } from "../useEditorLeaveGuard"

export type Draft = Record<string,string>
export function useMaintenanceDraft(stationId:string, kind:string, enabled:boolean, registerLeaveGuard?:RegisterLeaveGuard, onDiscard?:()=>void) {
  const {user}=useAuth()
  const key=`enerlution-maintenance-drafts-v1:${DEMO_MODE?"demo":"api"}:${user?.id}:${stationId}:${kind}`
  const [records,setRecords]=useState<Draft[]>(()=>{try{const rows=JSON.parse(localStorage.getItem(key)||"[]");return Array.isArray(rows)?rows.filter(r=>r&&typeof r==="object"&&Object.values(r).every(v=>typeof v==="string")):[]}catch{return []}})
  const [dirty,setDirty]=useState(false),[leaving,setLeaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("")
  useEffect(()=>{try{const rows=JSON.parse(localStorage.getItem(key)||"[]");setRecords(Array.isArray(rows)?rows.filter(r=>r&&typeof r==="object"&&Object.values(r).every(v=>typeof v==="string")):[])}catch{setRecords([]);setError("本地草稿读取失败，请检查浏览器存储权限。")}setNotice("")},[key])
  const {requestLeave,settleLeave}=useEditorLeaveGuard({dirty,enabled,registerLeaveGuard,onConfirm:()=>setLeaving(true),onCancel:()=>setLeaving(false)})
  useEffect(()=>{const listener=(e:BeforeUnloadEvent)=>{if(dirty&&enabled){e.preventDefault();e.returnValue=""}};window.addEventListener("beforeunload",listener);return()=>window.removeEventListener("beforeunload",listener)},[dirty,enabled])
  useEffect(()=>{if(!enabled){setDirty(false);setRecords([]);setError("");setNotice("")}},[enabled])
  const save=(draft:Draft,message="本地草稿已保存，业务服务尚未接通，未提交或执行。")=>{
    if(!enabled)return false
    try{const next=[{...draft,id:crypto.randomUUID(),savedAt:new Date().toISOString()},...records];localStorage.setItem(key,JSON.stringify(next));setRecords(next);setDirty(false);setError("");setNotice(message);return true}catch{setError("本地保存失败，请检查浏览器存储权限后重试。");return false}
  }
  const leave=(next:()=>void)=>{void(async()=>{if(await requestLeave())next()})()}
  const dialog=leaving&&<Modal title="放弃未保存修改？" onClose={()=>{setLeaving(false);settleLeave(false)}} actions={<><button className="operations-button" onClick={()=>{setLeaving(false);settleLeave(false)}}>继续编辑</button><button className="operations-button is-active" onClick={()=>{onDiscard?.();setError("");setNotice("");setLeaving(false);setDirty(false);settleLeave(true)}}>放弃修改</button></>}><p>当前运维表单尚未保存，离开会丢失修改。</p></Modal>
  return {records,dirty,setDirty,error,setError,notice,setNotice,save,leave,dialog,cancelLeave:()=>{setLeaving(false);settleLeave(false)}}
}
export function Surface({title,children,actions}:{title:string,children:ReactNode,actions?:ReactNode}){return <section className="maintenance-surface"><header><h2>{title}</h2>{actions}</header>{children}</section>}
export function EmptyChart({label,axes}:{label:string,axes?:string}){return <div className="maintenance-empty-chart" role="img" aria-label={`${label}：暂无已接入数据`}><span>{label}数据尚未接通</span><small>{axes}</small></div>}
export function DataTable({headers,rows,empty="暂无已接入记录"}:{headers:string[],rows:ReactNode[][],empty?:string}){return <><div className="operations-table-scroll"><table className="maintenance-tools-table"><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>{!rows.length&&<div className="operations-empty">{empty}</div>}</>}
export function DraftRecords({records}:{records:Draft[]}){return <Surface title="本地草稿记录"><DataTable headers={["内容","保存时间","状态"]} rows={records.map(r=>[Object.entries(r).filter(([k])=>!["id","savedAt"].includes(k)).map(([k,v])=><span key={k}>{v} </span>),new Date(r.savedAt).toLocaleString(),"本地草稿 · 未提交"])} empty="暂无本地草稿"/></Surface>}
