import {ReferenceMeterTou} from './ReferenceMeterTou'
import {ReferenceBatteryClusters} from './ReferenceBatteryClusters'
import {ReferenceBatteryCells} from './ReferenceBatteryCells'
import {isValidElement,type ReactNode} from 'react'
import type {DeviceDetail} from '@/data/stationDevices'
import {detailPoint,formatPoint} from '@/data/stationDevices'
import {batterySummary,dashboardPoint,deviceDashboard,isStackParent} from '@/data/referenceDeviceDetail'
import {display,Empty} from './reference-station/shared'

type Props={detail:DeviceDetail;observations:Record<string,unknown>[];telemetry:boolean;canExport?:boolean;alarms:ReactNode;onParameters:()=>void}
export function ReferenceDeviceDashboard({detail,observations,telemetry,canExport=false,alarms,onParameters}:Props){
 const type=detail.type,battery=type==='battery-cluster'||type==='battery-stack',simple=['logger','ems','environment','mppt','liquid-cooler'].includes(type),sections=deviceDashboard(type,detail.points)
 const strings=type==='inverter'?[...new Set(detail.points.flatMap(point=>{const match=/^(?:详情 · )?(PV[1-9]\d*) (?:电压|电流|功率)$/.exec(String(point.name??''));return match?[match[1]]:[]}))].sort((a,b)=>Number(a.slice(2))-Number(b.slice(2))):[]
 const inverterAc=type==='inverter'&&detail.points.some(point=>/^(?:详情 · )?[ABC]相 (?:电压|电流|频率|实时功率因数)$/.test(String(point.name??'')))
 function reading(label:string){
  const point=dashboardPoint(detail.points,label)
  if(!point)return '--'
  const value=detailPoint(point,observations.find(o=>String(o.pointId)===String(point.id)))
  if(value.lastKnownValue!==undefined&&value.staleReason){
   const time=value.sourceTime?new Date(value.sourceTime).toLocaleString():'时间缺失'
   return <span className="rd-stale-reading" title={`最后保存采样：${time}`}>{[value.lastKnownValue,value.unit].filter(Boolean).join(' ')}</span>
  }
  return formatPoint(value)
 }
 function field(label:string){const point=dashboardPoint(detail.points,label),observation=point&&observations.find(o=>String(o.pointId)===String(point.id));const serial=label==='SN'||label==='内置设备SN'||label==='序列号';return <div key={label} title={observation?.sourceTime?`采样时间：${new Date(Number(observation.sourceTime)).toLocaleString()}`:undefined}><span>{label}</span><strong>{serial?display(detail.archive.serial_number):telemetry?reading(label):'--'}</strong></div>}
 const basic=<article className="rs-panel rd-basic"><h3>基础信息</h3><div className="rs-stat-grid">{[['SN',detail.archive.serial_number],...(battery?[['架构',telemetry?reading('架构'):'--']]:[]),['所属场站',detail.archive.station_name],['所属子场站',detail.archive.child_station_name],...(type==='battery-cluster'?[['所属电池堆',detail.connections.filter(isStackParent).map(c=>c.serial_number??c.name).join('、')]]:[])].map(([k,v])=><div key={String(k)}><span>{String(k)}：</span><b>{isValidElement(v)?v:display(v)}</b></div>)}</div></article>
 const metrics=sections.map(s=><article key={s.title} className={`rs-panel rd-metrics ${battery?'rd-wide':''}`}><h3>{s.title}{!simple&&<button aria-label="查看全部设备参数" title="查看全部参数" onClick={onParameters}>›</button>}</h3>{!telemetry?<Empty text="无遥测查看权限"/>:<div className={battery?"rd-battery-running":undefined}>{battery&&<div className="rd-battery-gauge"><span>{reading('电池温度')}</span><div><strong>{reading('SOC')}</strong></div><span>{reading('充放电状态')}</span><small>功率：{reading('当前功率')}</small></div>}<div className="rs-point-grid">{s.fields.map(field)}</div></div>}</article>)
 if(!sections.length)return <Empty text="该设备类型的详情尚未核验"/>
 if(simple){const groups=sections.map(section=>[section]);if(['mppt','liquid-cooler'].includes(type)&&groups.length>1){groups[0].push(...groups[1]);groups.splice(1,1)}return <div className="rd-detail-sections">{groups.map((group,index)=><article className="rs-panel" key={index}>{group.map(section=><section key={section.title}><h3>{section.title}</h3><div className="rs-point-grid">{section.fields.map(field)}</div></section>)}</article>)}{!telemetry&&<p className="rs-note">无遥测查看权限</p>}</div>}
 return <div className={`rd-detail-grid rd-dashboard-${type}`}>
  {basic}
  {type==='inverter'&&<article className="rs-panel"><h3>组串信息<button disabled title="组串配置提交行为尚未核验">编辑</button></h3><div className="rs-stat-grid"><div><span>架构：</span><b>{telemetry?reading('架构'):'--'}</b></div><div><span>实际组串容量：</span><b>{telemetry?reading('实际组串容量'):'--'}</b></div></div></article>}
  {type==='meter'&&<article className="rs-panel rd-wide"><h3>电表配置信息<button disabled title="电表配置提交行为尚未核验">编辑</button></h3><div className="rs-stat-grid"><div><span>应用于：</span><b>{telemetry?reading('应用于'):'--'}</b></div></div><table><thead><tr>{['安装位置','正向电能','反向电能','电流比','电压比'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody><tr>{['安装位置','正向电能','反向电能','电流比','电压比'].map(v=><td key={v}>{telemetry?reading(v):'--'}</td>)}</tr></tbody></table></article>}
  {battery&&<article className="rs-panel rd-battery-summary"><h3>{type==='battery-stack'?'整堆':'整簇'}单体数据</h3><div className="rs-point-grid">{batterySummary.map(field)}</div></article>}
  {battery&&alarms}
  {metrics}
  {!battery&&alarms}
  {['pcs','meter'].includes(type)&&<article className="rs-panel rd-wide rd-phase-table"><table><thead><tr>{['交流','有功功率','无功功率','视在功率','实时功率因数','电压','电流'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{['A','B','C'].map(phase=><tr key={phase}><td>{phase}</td>{['有功功率','无功功率','视在功率','实时功率因数','电压','电流'].map(v=><td key={v}>{telemetry?reading(`${phase}相 ${v}`):'--'}</td>)}</tr>)}</tbody></table></article>}
  {type==='meter'&&<article className="rs-panel rd-wide rd-phase-table"><table><thead><tr>{['类别','作用','总','尖','峰','平','谷','深谷'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{['日正向有功电能','日反向有功电能','总正向有功电能','总反向有功电能'].map(category=><tr key={category}><td>{category}</td><td>{telemetry?reading(category+' · 作用'):'--'}</td>{['总','尖','峰','平','谷','深谷'].map(period=><td key={period}>{telemetry?reading(category+' · '+period):'--'}</td>)}</tr>)}</tbody></table></article>}
  {type==='meter'&&<ReferenceMeterTou stationId={String(detail.archive.station_id)} deviceId={String(detail.archive.id)} telemetry={telemetry} canExport={canExport}/>}
  {type==='battery-cluster'&&<ReferenceBatteryCells deviceId={String(detail.archive.id)} telemetry={telemetry} points={detail.points} observations={observations} detail={detail} canExport={canExport}/>}
  {type==='battery-stack'&&<ReferenceBatteryClusters stationId={String(detail.archive.station_id)} deviceIds={detail.connections.filter(c=>c.direction==='downstream').map(c=>String(c.id))}/>}
  {type==='inverter'&&<article className="rs-panel rd-wide"><h3>组串数据分析</h3><div className="rs-point-grid">{['组串电流离散率','组串电流平均值','组串电压离散率','组串电压平均值'].map(field)}</div></article>}
  {type==='inverter'&&strings.length>0&&<article className="rs-panel rd-wide rd-phase-table"><table><thead><tr>{['直流','电压','电流','功率','备注'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{strings.map(string=><tr key={string}><td>{string}</td>{['电压','电流','功率','备注'].map(label=><td key={label}>{telemetry?reading(`${string} ${label}`):'--'}</td>)}</tr>)}</tbody></table></article>}
  {inverterAc&&<article className="rs-panel rd-wide rd-phase-table"><table><thead><tr>{['交流','电压','电流','频率','实时功率因数'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{['A','B','C'].map(phase=><tr key={phase}><td>{phase}</td>{['电压','电流','频率','实时功率因数'].map(label=><td key={label}>{telemetry?reading(`${phase}相 ${label}`):'--'}</td>)}</tr>)}</tbody></table></article>}
 </div>
}
