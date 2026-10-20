import {useState} from 'react'
import type {DeviceDetail} from '@/data/stationDevices'
import {detailPoint,formatPoint} from '@/data/stationDevices'
import {dashboardPoint} from '@/data/referenceDeviceDetail'
import {display} from './reference-station/shared'
export function ReferenceDeviceSettings({detail,observations,telemetry,onEdit}:{detail:DeviceDetail;observations:Record<string,unknown>[];telemetry:boolean;onEdit?:()=>void}){
 const [section,setSection]=useState('基本信息')
 function reading(label:string){const point=dashboardPoint(detail.points,label);return telemetry&&point?formatPoint(detailPoint(point,observations.find(o=>String(o.pointId)===String(point.id)))):'--'}
 return <article className="rs-panel"><div className="rd-settings-layout"><nav role="tablist" aria-label="设备设置分类">{(detail.type==='inverter'?['基本信息','组串信息']:['基本信息']).map(label=><button role="tab" key={label} aria-selected={section===label} onClick={()=>setSection(label)}>{label}</button>)}</nav><section><h3>{section}</h3>{section==='基本信息'?<div className="rd-setting-name"><span>设备名称</span><strong>{display(detail.archive.name)}</strong>{onEdit&&<button onClick={onEdit}>修改</button>}</div>:<div className="rs-stat-grid"><div><span>架构</span><b>{reading('架构')}</b></div><div><span>实际组串容量</span><b>{reading('实际组串容量')}</b></div></div>}</section></div></article>
}
