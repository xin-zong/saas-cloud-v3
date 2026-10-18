import {useEffect, useState} from 'react'
import {useAuth} from '@/auth/AuthContext'
import {hasStationPermission} from '@/auth/apiPermissions'
import {communicationNames, metricDefinitions, metricText} from '@/api/monitorWorkspace'
import {loadStationProfile, stationProfileFields, type StationProfile} from '@/api/stationProfile'
import {useMonitorWorkspace} from './useMonitorWorkspace'
import './station-stored-overview.css'

export default function StationStoredOverview({stationId, allowedSubNavs, onNavigate}: {stationId:string; allowedSubNavs:readonly string[]; onNavigate:(tab:string)=>void}) {
  const {user}=useAuth()
  const allowed=hasStationPermission(user,stationId,'asset.read')
  const telemetryAllowed=hasStationPermission(user,stationId,'telemetry.read')
  const alarmAllowed=hasStationPermission(user,stationId,'alarm.read')
  const permissionKey=JSON.stringify([user?.id,user?.stationPermissions,user?.permissions])
  const source='capture' as const
  const {data,busy,error,refresh}=useMonitorWorkspace(permissionKey,{stationId,sourceMode:source},allowed,0)
  const [profile,setProfile]=useState<StationProfile|null>(null)
  const [profileError,setProfileError]=useState('')
  useEffect(()=>{
    setProfile(null);setProfileError('')
    if(!allowed)return
    const controller=new AbortController()
    loadStationProfile(stationId,controller.signal).then(value=>{if(!controller.signal.aborted)setProfile(value)}).catch(e=>{if(!controller.signal.aborted)setProfileError(e.message)})
    return()=>controller.abort()
  },[stationId,allowed,permissionKey])
  if(!allowed)return null
  const row=data?.sourceMode===source?data.items.find(item=>item.id===stationId):undefined
  const text=(value:unknown)=>value===null||value===undefined||value===''?'未采集':String(value)
  const groups=[['光伏指标','pv'],['储能指标','storage']]
  return <section className="station-stored-overview" aria-label="站点已入库数据">
    <header><h2>站点数据</h2><div><button onClick={refresh} disabled={busy}>刷新站点数据</button></div></header>
    <p>指标按采样时间显示，未采集的指标不按零计算。</p>
    {error?<p role="alert">站点数据读取失败：{error}</p>:!row?<p role="status">{busy?'正在读取站点数据…':'暂无可查看的站点数据'}</p>:<>
      <p>数据更新时间：{text(row.updatedAt)} · 接收时间：{text(row.capturedAt)}</p>
      {row.telemetryUnavailable&&<p role="status">采集服务暂不可用，运行指标暂无数据。</p>}
      <dl className="station-stored-grid">{[
        ['站点名称',row.name],['站点编号',row.code],['场景',row.scene],['地区',row.region],['地址',row.address],['站点类型',row.siteType],
        ['通信状态',telemetryAllowed?(communicationNames[row.communication]??'未知'):'无查看权限'],['设备数量',row.device_count],['当前系统告警数',alarmAllowed&&row.alarmAllowed?row.alarmCount:'无查看权限'],
        ['充放电状态',telemetryAllowed&&row.telemetryAllowed?({charging:'充电',discharging:'放电',idle:'静止'}[row.chargeStatus]??'未采集'):'无查看权限'],
        ['标签',row.tags.map(t=>t.name).join('、')||'暂无标签'],
        ...(profile?stationProfileFields(profile).map(([label,value])=>[label,value==='—'?'未采集':value]):[])
      ].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{text(value)}</dd></div>)}</dl>
      {profileError&&<p role="alert">基本资料读取失败：{profileError}</p>}
      {!profile&&!profileError&&<p>基本资料暂无数据</p>}
      {groups.map(([title,prefix])=><details key={prefix} open><summary>{title}</summary><dl className="station-stored-grid">{Object.entries(metricDefinitions).filter(([key])=>key.startsWith(prefix)&&key!=='pvTrend').map(([key,[label,unit]])=>{
        const value=row.metrics[key]
        const metadata=['pvCapacity','storagePower','storageCapacity'].includes(key)
        return <div key={key} data-metric={key}><dt>{label}</dt><dd>{!metadata&&(!telemetryAllowed||!row.telemetryAllowed)?'无查看权限':typeof value==='number'&&Number.isFinite(value)?<>{metricText(value)} <small>{unit}</small></>:'未采集'}</dd></div>
      })}</dl></details>)}
      <footer>{['设备详情','运行曲线','告警信息'].filter(tab=>allowedSubNavs.includes(tab)).map(tab=><button key={tab} onClick={()=>onNavigate(tab)}>查看{tab}</button>)}</footer>
    </>}
  </section>
}
