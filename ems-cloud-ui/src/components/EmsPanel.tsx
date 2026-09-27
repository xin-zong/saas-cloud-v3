import { useEffect, useRef, useState } from 'react'
import type { Station } from '@/App'
import { api, DEMO_MODE, CAPABILITIES_CHANGED, type ApiRow } from '@/api/client'
import { emsAllowed, exactText, loadStationEms, readEms, type Gateway, type Observation } from '@/api/ems'
import { useAuth } from '@/auth/AuthContext'
import { Button, Select } from './ui/Workspace'
import { useEmsResource } from './useEmsResource'
import EmsHistory from './EmsHistory'
import EmsManagement from './EmsManagement'
import './ems-panel.css'

export type EmsModule = 'overview' | 'assets' | 'operations' | 'maintenance' | 'workorders' | 'analysis' | 'platform' | 'settings'
const titles: Record<EmsModule,string> = { overview:'EMS 实时概况',assets:'EMS 设备与实时点',operations:'EMS 实际运行',maintenance:'EMS 通信与告警证据',workorders:'EMS 告警关联',analysis:'EMS 历史与统计',platform:'EMS 身份与映射',settings:'EMS 生效配置（只读）' }
const time = (value: unknown) => value == null ? '—（未知）' : typeof value === 'number' ? new Date(value).toLocaleString('zh-CN') : String(value)

/** Composed at native module surfaces; the business workflow beside it remains separate. */
export default function EmsPanel({stations,module,deviceId,visible=true,onAlarm}:{stations:Station[];module:EmsModule;deviceId?:string;visible?:boolean;onAlarm?:(stationId:string,alarmId:string)=>void}) {
  const {user}=useAuth()
  const allowed=stations.filter(s=>emsAllowed(user,s.id,'ems.read') || module==='platform' && emsAllowed(user,s.id,'ems.manage'))
  const [requested,setStation]=useState('')
  const [expanded,setExpanded]=useState(false)
  const station=allowed.find(s=>s.id===requested)??allowed[0]
  const identity=`${user?.id}|${JSON.stringify(user?.stationPermissions)}|${station?.id}|${module}`
  const reading=!!station&&emsAllowed(user,station.id,'ems.read')
  const resource=useEmsResource(identity,!!user&&!DEMO_MODE&&visible&&reading,signal=>loadStationEms(user!,station!.id,signal))
  const data=resource.data
  const [gatewayId,setGateway]=useState('')
  const gateway=data?.gateways.find(g=>g.ems_uuid===gatewayId)??data?.gateways[0]
  if(DEMO_MODE || !Object.values(user?.stationPermissions??{}).some(codes=>codes.some(code=>['ems.read','ems.manage','ems.query'].includes(code))))return null
  const points=data?.points??[]
  return <section className="ems-panel" data-ems-module={module} data-expanded={expanded} aria-label={titles[module]}>
    <header className="ems-panel-heading"><strong>{titles[module]}</strong><div>
      <Select aria-label={`${titles[module]}站点`} value={station?.id??''} onChange={e=>setStation(e.target.value)}><option value="" disabled>选择授权站点</option>{allowed.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      <Button onClick={resource.refresh} disabled={!reading||!visible}>刷新 EMS</Button>
      <Button aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'收起 EMS 详情':'展开 EMS 详情'}</Button>
    </div></header>
    <p className="ems-source-note">EMS 实时数据 · 每 10 秒刷新 · 下方业务与旧历史数据采用各自来源</p>
    {!station?<p role="status">暂无 EMS 授权站点</p>:<>
      {resource.loading&&<p role="status">正在读取 EMS…</p>}{resource.error&&<p role="alert">{resource.error}</p>}
      {data&&<><div className="ems-summary"><span>已注册 EMS <b>{data.gateways.length}</b></span><span>通信可达 <b>{data.gateways.filter(g=>g.reachable===true).length}</b></span><span>通信未知 <b>{data.gateways.filter(g=>g.reachable==null).length}</b></span><span>最近刷新 {time(data.responseAt)}</span></div>
      {!data.gateways.length&&<p role="status">未注册 EMS · 功率 / SOC / 当前告警未知；请先提供真实身份及资产映射。</p>}
      {['overview','assets','operations','analysis'].includes(module)&&<div className="ems-compact-points">{data.latest?.items.slice(0,2).map(r=><span key={r.pointId}>{String(points.find(p=>String(p.id)===r.pointId)?.name??'实时测点')} <b>{exactText(r.value)}</b> {String(points.find(p=>String(p.id)===r.pointId)?.unit??'')} · {qualityLabel(r.quality)} · {r.staleReason?'数据过时':r.sourceTime==null?'源时间未知':`采样 ${time(r.sourceTime)}`}</span>)}{data.latest&&!data.latest.items.length&&<span>暂无已映射观测 · 功率 / SOC 未知</span>}</div>}
      <div hidden={!expanded} className="ems-detail-body"><p>精确来源、绑定期与质量证据如下。计划 / 审批 / 人工确认不代表 EMS 执行或保存回执；旧历史来源未验证。</p>
      {data.gateways.length>0&&<div className="ems-gateway-select"><Select aria-label="EMS 身份" value={gateway?.ems_uuid??''} onChange={e=>setGateway(e.target.value)}>{data.gateways.map(g=><option key={g.ems_uuid} value={g.ems_uuid}>{g.ems_uuid}</option>)}</Select><span>绑定期 {gateway?.binding_period_id} · 心跳 {time(gateway?.last_fresh_heartbeat)} · {gateway?.reachable===true?'通信可达':gateway?.reachable===false?'通信不可达':'通信未知'}</span></div>}
      {['overview','assets','operations','analysis'].includes(module)&&<><h3>已映射实时点 · {data.latest?.items.length??0} 条观测 / {data.latest?.total??'—'} 个映射点</h3><ObservationTable rows={data.latest?.items??[]} points={points}/>{!data.latest?<p>无该站点 telemetry.read 权限</p>:!data.latest.items.length?<p>暂无已映射 EMS 观测；缺少观测不等于数值 0。</p>:null}{data.latest?.hasMore&&<LatestPages stationId={station.id} points={points} scope={identity}/>}</>}
      {['operations','analysis'].includes(module)&&emsAllowed(user,station.id,'telemetry.read')&&<EmsHistory key={identity} points={points} gateways={data.gateways} scope={identity}/>}
      </div></>}
      {gateway&&<GatewayEvidence key={`${identity}|${gateway.ems_uuid}|${deviceId}`} expanded={expanded} gateway={gateway} station={station} module={module} deviceId={deviceId} scope={identity} visible={visible} onAlarm={onAlarm}/>}
      <div hidden={!expanded} className="ems-detail-body">{module==='platform'&&emsAllowed(user,station.id,'ems.manage')&&<EmsManagement key={identity} station={station} gateway={gateway} onChange={resource.refresh}/>}
      {module==='settings'&&<p>此处显示设备上报的生效快照，个人偏好保存不会写入 EMS。</p>}</div>
    </>}
  </section>
}
function qualityLabel(value:string){return ({valid:'有效',invalid:'无效',stale:'过时',unknown:'质量未知'} as Record<string,string>)[value]??'质量未知'}
function sourceLabel(value:unknown){return ({ems:'EMS 实时',cabinet_30s:'柜实时（30 秒）',cabinet_60s:'柜实时（60 秒）',ems_cell:'单体上报'} as Record<string,string>)[String(value)]??exactText(value)}
export function ObservationTable({rows,points=[]}:{rows:Observation[];points?:ApiRow[]}) {
  return <div className="ems-table-wrap"><table className="ui-table"><thead><tr>{['测点 / 类型','精确原值','质量 / 新鲜度','源时间','接收时间','来源 / 绑定期'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.pointId}|${i}`}><td>{String(points.find(p=>String(p.id)===r.pointId)?.name??r.pointId??r.kind??'—')}<small>{r.valueType}</small></td><td className="ems-exact">{exactText(r.value)}</td><td>{qualityLabel(r.quality)}<small>{exactText(r.staleReason)}</small></td><td>{r.sourceTime==null?'源时间未知':time(r.sourceTime)}</td><td>{time(r.receivedAt)}</td><td>{sourceLabel(r.source)}<small>{exactText(r.bindingPeriodId)}</small></td></tr>)}</tbody></table></div>
}
function LatestPages({stationId,points,scope}:{stationId:string;points:ApiRow[];scope:string}) {
  const [offset,setOffset]=useState(0)
  const rows=useEmsResource(`${scope}|${offset}`,offset>0,signal=>api<{items:Observation[];hasMore:boolean}>(`/stations/${stationId}/telemetry/latest?limit=200&offset=${offset}`,{signal}))
  return <><Button onClick={()=>setOffset(n=>n+200)}>下一页实时点</Button>{offset>0&&<Button onClick={()=>setOffset(0)}>返回第一页</Button>}{rows.error&&<p role="alert">{rows.error}</p>}{rows.data&&<><p>从 {offset+1} 个映射点起 · {rows.data.hasMore?'还有更多':'末页'}</p><ObservationTable rows={rows.data.items} points={points}/></>}</>
}
function GatewayEvidence({gateway,station,module,deviceId,scope,visible,expanded,onAlarm}:{gateway:Gateway;station:Station;module:EmsModule;deviceId?:string;scope:string;visible:boolean;expanded:boolean;onAlarm?:(stationId:string,alarmId:string)=>void}) {
  const {user}=useAuth();const enabled=visible&&emsAllowed(user,station.id,'ems.read')
  const config=['assets','platform','settings'].includes(module)
  const alarms=['overview','maintenance','workorders'].includes(module)
  const structure=['assets','platform','maintenance'].includes(module)
  const details=useEmsResource(`${scope}|${gateway.ems_uuid}`,enabled,async signal=>{
    const [configuration,tree,current,ingestion]=await Promise.all([
      config?readEms(gateway.ems_uuid,'configuration',signal):null,
      structure?readEms(gateway.ems_uuid,'structure',signal):null,
      alarms?readEms(gateway.ems_uuid,'alarms?scope=current&limit=200&offset=0',signal):null,
      module==='maintenance'?readEms(gateway.ems_uuid,'ingestion-status',signal):null,
    ]);return {configuration,tree,current,ingestion}
  })
  const [alarmOffset,setAlarmOffset]=useState(0),[history,setHistory]=useState(false)
  const events=useEmsResource(`${scope}|${gateway.ems_uuid}|${history}|${alarmOffset}`,enabled&&alarms&&(history||alarmOffset>0),signal=>readEms<ApiRow[]|ApiRow>(gateway.ems_uuid,`alarms?scope=${history?'history':'current'}&stationId=${encodeURIComponent(station.id)}&limit=200&offset=${alarmOffset}`,signal))
  const current=alarmOffset>0&&!history?events.data as ApiRow|undefined:details.data?.current
  const tree=details.data?.tree
  const mappings=(tree?.deviceMappings??[]) as ApiRow[]
  const [selectedDevice,setDevice]=useState(deviceId??'')
  const physical=deviceId||selectedDevice||String(mappings.find(m=>['bms','bmu'].includes(String(m.role)))?.device_id??'')
  const cells=useEmsResource(`${scope}|${physical}`,enabled&&module==='assets'&&!!physical&&emsAllowed(user,station.id,'telemetry.read'),signal=>api<ApiRow>(`/devices/${encodeURIComponent(physical)}/cells`,{signal}))
  return <>
    {details.error&&<p role="alert">{details.error}</p>}
    {alarms&&current&&<p className="ems-compact-evidence">{current.known?'已观测柜的当前告警列表已知':'当前告警状态未知；最后已知记录仅作参考'} · 已观测 {((current.snapshots??[]) as unknown[]).length} 柜</p>}
    {config&&details.data?.configuration&&<p className="ems-compact-evidence">生效配置：{details.data.configuration.known?'已取得上报快照':'尚无上报快照'} · 只读</p>}
    <div hidden={!expanded} className="ems-detail-body">
    {tree&&<details className="ems-evidence" open><summary>EMS / 柜 / 设备结构 · {tree.known?'已有快照':'未知'}</summary><p>结构版本 {exactText(tree.sv)} · 接收 {time(tree.receivedAt)} · {exactText(tree.unknownReason)}</p><p>柜通信为柜级 link.online 的最后上报，独立于 EMS 心跳可达性与结构激活状态。</p>{((tree.cabinetLinks??[]) as ApiRow[]).map(link=><p key={String(link.cabinet_no)}>柜 {exactText(link.cabinet_no)} · 通信 {link.online===true?'在线':link.online===false?'离线':'未知'} · 源时间 {exactText(link.source_time_ms)} ms · 接收 {time(link.received_at)}</p>)}{!((tree.cabinetLinks??[]) as ApiRow[]).length&&<p>柜通信未知：尚无 link.online 上报。</p>}<Evidence value={tree.metadata}/><Evidence value={tree.layout}/><div className="ems-table-wrap"><table className="ui-table"><thead><tr>{['作用域 / 柜号','角色 / 位置','物理设备','绑定 ID'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{mappings.map(m=><tr key={String(m.id)}><td>{exactText(m.scope)} / {exactText(m.cabinet_no)}</td><td>{exactText(m.role)} / {exactText(m.local_no)}</td><td>{exactText(m.device_id)}</td><td>{exactText(m.id)}</td></tr>)}</tbody></table></div>{!mappings.length&&<p>暂无设备映射</p>}<details><summary>测点映射 / 目录 / 聚合语义</summary><Evidence value={tree.pointMappings}/></details></details>}
    {module==='assets'&&<><label>单体物理设备 <Select aria-label="EMS 单体设备" value={physical} onChange={e=>setDevice(e.target.value)}><option value="">选择已映射 BMS / BMU</option>{mappings.filter(m=>['bms','bmu'].includes(String(m.role))).map(m=><option key={String(m.id)} value={String(m.device_id)}>{exactText(m.device_id)} · {exactText(m.role)} 位置 {exactText(m.local_no)}</option>)}</Select></label>{cells.error&&<p role="alert">{cells.error}</p>}{cells.data&&<details open><summary>单体 · {cells.data.known?'当前连接已观测':'未知'}</summary><p>{exactText(cells.data.unknownReason)}</p><ObservationTable rows={(cells.data.values??[]) as Observation[]}/><Evidence value={cells.data.values}/></details>}</>}
    {details.data?.configuration&&<details className="ems-evidence" open={module==='settings'}><summary>生效配置 · 只读 · {details.data.configuration.known?'已有快照':'未知'}</summary><p>版本 {exactText(details.data.configuration.revision)} · 快照身份，不比较数值大小 · 接收 {time(details.data.configuration.receivedAt)}</p><p>{exactText(details.data.configuration.unknownReason)}</p><Evidence value={details.data.configuration.values}/><Button disabled title="固件写配置协议未定义">写入 EMS 配置未接通</Button></details>}
    {alarms&&<><div className="ems-alarm-controls"><Button onClick={()=>{setHistory(false);setAlarmOffset(0)}}>当前告警</Button><Button onClick={()=>{setHistory(true);setAlarmOffset(0)}}>历史告警事件</Button><Button onClick={()=>setAlarmOffset(n=>n+200)}>下一页告警</Button>{alarmOffset>0&&<Button onClick={()=>setAlarmOffset(n=>Math.max(0,n-200))}>上一页告警</Button>}</div>{events.error&&<p role="alert">{events.error}</p>}
      {history? <AlarmRows rows={Array.isArray(events.data)?events.data:[]} stationId={station.id} onAlarm={onAlarm}/>:current&&<><p>当前范围：仅已观测柜快照 · {current.known?'列表已知':'当前列表未知'} · {exactText(current.unknownReason)}；EMS / 公共当前查询不支持。</p>{((current.snapshots??[]) as ApiRow[]).map(s=><section className="ems-alarm-snapshot" key={String(s.cabinet_no)}><h3>柜 {exactText(s.cabinet_no)} · {s.known?'已知当前列表':'最后已知记录，不能确认当前活动告警'}</h3><p>观测 {time(s.observed_at)} · 通信 {exactText(s.reachable)} · 总成员 {exactText(s.total_members)} · {s.hasMore?'尚有更多成员':'当前分页结束'}</p><AlarmRows rows={(s.alarms??[]) as ApiRow[]} stationId={station.id} onAlarm={onAlarm}/>{s.known===true&&Number(s.total_members)===0&&<p>已知空列表：本页没有活动告警</p>}</section>)}</>}
    </>}
    {details.data?.ingestion&&<details className="ems-evidence" open><summary>补传与接入证据</summary><p>消费者延迟 {exactText(details.data.ingestion.consumerLag)} · 历史完整度 {exactText(details.data.ingestion.historyCompleteness)}。接收年龄不是 Kafka lag，包数不能证明历史缺口全部恢复。</p><Evidence value={details.data.ingestion}/></details>}
    {['assets','platform','maintenance'].includes(module)&&<EmsQueries gateway={gateway} stationId={station.id} mappings={mappings} scope={scope}/>}
    </div>
  </>
}
export function Evidence({value}:{value:unknown}){return <pre className="ems-json">{exactText(value)}</pre>}
function AlarmRows({rows,stationId,onAlarm}:{rows:ApiRow[];stationId:string;onAlarm?:(stationId:string,alarmId:string)=>void}) {
  const {user}=useAuth()
  return <div className="ems-table-wrap"><table className="ui-table"><thead><tr>{['告警标识','原始级别 / 代码','报告故障证据','源时间 / 接收时间','业务关联'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={`${r.alarm_id}|${i}`}><td>{exactText(r.alarm_id)}</td><td>{exactText(r.level)} · {exactText(r.levelLabel)} / {exactText(r.code)}</td><td><Evidence value={r.device}/><small>代码未解释，未声称固件原因字典已启用</small></td><td>{time(r.source_at)}<small>{time(r.received_at)}</small></td><td>{r.business_alarm_id&&emsAllowed(user,stationId,'alarm.read')? <><span>业务告警 {exactText(r.business_alarm_id)}</span>{onAlarm&&<Button onClick={()=>onAlarm(stationId,String(r.business_alarm_id))}>查看关联人工流程</Button>}</>: '未投影 / 无业务告警读取权限'}</td></tr>)}</tbody></table>{!rows.length&&<p>本页暂无告警证据</p>}</div>
}
function EmsQueries({gateway,stationId,mappings,scope}:{gateway:Gateway;stationId:string;mappings:ApiRow[];scope:string}) {
  const {user}=useAuth(),[query,setQuery]=useState<ApiRow|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[cabinet,setCabinet]=useState('')
  const request=useRef<AbortController|null>(null)
  const allowed=emsAllowed(user,stationId,'ems.query')
  useEffect(()=>{request.current?.abort();setQuery(null);setError('');setBusy(false);return()=>request.current?.abort()},[scope,allowed])
  const poll=useEmsResource(`${scope}|${query?.id}`,allowed&&!!query?.id&&['pending','sent'].includes(String(query?.status)),signal=>readEms(gateway.ems_uuid,`queries/${encodeURIComponent(String(query!.id))}`,signal))
  useEffect(()=>{if(poll.data)setQuery(poll.data)},[poll.data])
  useEffect(()=>{const cancel=()=>{request.current?.abort();setQuery(null);setBusy(false)};window.addEventListener(CAPABILITIES_CHANGED,cancel);return()=>window.removeEventListener(CAPABILITIES_CHANGED,cancel)},[])
  const result=poll.data??query
  async function start(operation:string){if(!allowed||gateway.reachable!==true||busy)return;request.current?.abort();const ctrl=new AbortController();request.current=ctrl;setBusy(true);setError('');try{const response=await api<ApiRow>(`/ems/${gateway.ems_uuid}/queries`,{method:'POST',body:JSON.stringify({operation,params:operation==='structure.get'?{}:{c:Number(cabinet)}}),signal:ctrl.signal});if(!ctrl.signal.aborted)setQuery(response)}catch(e){if(!ctrl.signal.aborted)setError(e instanceof Error?e.message:'查询失败')}finally{if(!ctrl.signal.aborted)setBusy(false)}}
  const cabinets=[...new Set(mappings.filter(m=>m.scope==='cabinet').map(m=>String(m.cabinet_no)))]
  return <details className="ems-evidence"><summary>只读设备查询 · {allowed?'有查询权限':'无 ems.query 权限'}</summary><p>排队 / 已发送不等于成功；unknown 不等于 failed / expired。读取查询不会执行设备控制。</p><Button disabled={!allowed||gateway.reachable!==true||busy} onClick={()=>void start('structure.get')}>读取结构</Button><Select aria-label="EMS 告警查询柜号" value={cabinet} onChange={e=>setCabinet(e.target.value)}><option value="">已分配柜号</option>{cabinets.map(c=><option key={c}>{c}</option>)}</Select><Button disabled={!allowed||gateway.reachable!==true||!cabinet||busy} onClick={()=>void start('alarm.current.get')}>读取当前柜告警</Button>{error&&<p role="alert">{error}</p>}{poll.error&&<p role="alert">{poll.error}</p>}{result&&<><p role="status">请求 {exactText(result.id)} · 状态 {exactText(result.status)} · 截止 {time(result.expires_at)}</p><Evidence value={result.result}/></>}</details>
}
