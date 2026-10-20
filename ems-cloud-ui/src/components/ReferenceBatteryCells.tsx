import {useMemo,useRef,useState} from 'react'
import {BatteryMedium,ChartNoAxesCombined,Clock3,Maximize2,X} from 'lucide-react'
import {loadDeviceCells} from '@/api/deviceDetails'
import {batteryCellPacks,batteryCellExtremes,type DeviceDetail} from '@/data/stationDevices'
import {formatDate,dateKey} from '@/preferences/date'
import {ReferenceCellHistory} from './ReferenceCellHistory'
import {Empty,QueryState,useStationQuery} from './reference-station/shared'
import './reference-cell-fullscreen.css'
type Props={deviceId:string;telemetry:boolean;points?:Record<string,unknown>[];observations?:Record<string,unknown>[];detail?:DeviceDetail;canExport?:boolean}
export function ReferenceBatteryCells({deviceId,telemetry,points=[],observations=[],detail,canExport=false}:Props){
 const [kind,setKind]=useState<'voltage'|'temperature'>('voltage'),[selected,setSelected]=useState<string|null>(null),dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLButtonElement|null>(null),fullscreen=useRef<HTMLDialogElement>(null),fullscreenOpener=useRef<HTMLButtonElement|null>(null)
 const query=useStationQuery(`detail-cells:${deviceId}:${telemetry}`,signal=>telemetry?loadDeviceCells(deviceId,signal):Promise.resolve(null))
 const historyPacks=useMemo(()=>({voltage:telemetry?batteryCellPacks('voltage',query.data,points,observations):[],temperature:telemetry?batteryCellPacks('temperature',query.data,points,observations):[]}),[telemetry,query.data,points,observations])
 const groups=historyPacks[kind],extremes=useMemo(()=>batteryCellExtremes(groups),[groups]),unit=kind==='voltage'?'V':'℃'
 const point=telemetry&&selected&&groups.some(group=>group.cells.some(cell=>cell.pointId===selected))?points.find(point=>String(point.id)===selected):undefined
 function open(id:string,button:HTMLButtonElement){opener.current=button;setSelected(id);dialog.current?.showModal()}
 function close(){dialog.current?.close();setSelected(null);opener.current?.focus()}
 function openFullscreen(button:HTMLButtonElement){if(!telemetry)return;fullscreenOpener.current=button;fullscreen.current?.showModal()}
 function closeFullscreen(){fullscreen.current?.close();fullscreenOpener.current?.focus()}
 const timestamp=(time:number|null)=>time===null?'时间未知':formatDate(time,{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})
 const tabs=(full=false)=><div role="tablist" aria-label={full?'全屏电芯参数':'电芯参数'}>{([['voltage','电压/V'],['temperature','温度/℃']] as const).map(([value,label])=><button key={value} role="tab" aria-selected={kind===value} onClick={()=>setKind(value)}>{label}</button>)}</div>
 const range=telemetry?<div className="rd-cell-extremes" title="按当前显示的有效采样比较；保留原始精度，已保存采样不代表实时值。"><span className="maximum">单体最高{kind==='voltage'?'电压':'温度'}：<strong>{extremes.max??'—'}{extremes.max!==null?unit:''}</strong></span><span className="minimum">单体最低{kind==='voltage'?'电压':'温度'}：<strong>{extremes.min??'—'}{extremes.min!==null?unit:''}</strong></span></div>:null
 const cards=<div className="rd-cell-packages">{groups.map(group=><section key={group.name||group.slot}>
   <h4 className="rd-cell-pack-title"><BatteryMedium size={15} aria-hidden="true"/>{group.slot&&<b>#{group.slot}</b>}<label title={group.name}>{group.name||`电池包 ${group.slot}`}</label></h4>
   <div>{group.cells.map(cell=>{const label=`${group.name||`电池包 ${group.slot}`} · ${kind==='voltage'?'电压':'温度'} #${cell.index}`,canOpen=Boolean(detail&&cell.pointId);return <button type="button" className={`rd-cell `} key={cell.index} disabled={!canOpen} aria-label={label} onClick={event=>cell.pointId&&open(cell.pointId,event.currentTarget)} title={`${label}\n采样时间：${timestamp(cell.sourceTime)}${canOpen?'\n点击查看历史':''}`}><strong>{cell.value??'—'}</strong><small>#{cell.index}</small>{canOpen&&<ChartNoAxesCombined className="rd-cell-history-icon" size={11} aria-hidden="true"/>}</button>})}</div>
   <footer className="rd-cell-time"><Clock3 size={12}/>采样时间：{(()=>{const times=[...new Set(group.cells.map(cell=>cell.sourceTime))];return times.length===1?timestamp(times[0]):'各单体时间不同，悬停查看'})()}</footer>
  </section>)}</div>
 return <article className="rs-panel rd-wide rd-cell-panel">
  <header>{tabs()}{range}<button className="rd-cell-fullscreen-open" aria-label="电芯全屏分析" disabled={!telemetry} onClick={event=>openFullscreen(event.currentTarget)}><Maximize2 size={14}/>电芯全屏分析</button></header>
  {groups[0]?.source==='stored'&&<small className="rd-cell-source"><Clock3 size={13}/>已保存单体采样</small>}
  <QueryState {...query}/>{!telemetry?<Empty text="无遥测查看权限"/>:!groups.length&&!query.loading?<Empty text={query.data?.known?'暂无有效单体采样':'暂无已确认布局与单体采样'}/>:cards}
  <dialog ref={dialog} className="rd-cell-history-dialog rd-cell-analysis-drawer" aria-label="单体历史数据分析" onKeyDown={event=>{if(event.key==='Tab')event.stopPropagation();if(event.key==='Escape'){event.stopPropagation();if((event.target as HTMLElement).closest('dialog')===dialog.current){event.preventDefault();close()}}}} onCancel={event=>{event.stopPropagation();if(event.target===event.currentTarget){event.preventDefault();close()}}}><header><h3>单体历史数据分析</h3><button onClick={close} aria-label="关闭单体历史"><X size={18}/></button></header>{point&&<ReferenceCellHistory key={String(point.id)} stationId={detail?.archive.station_id?String(detail.archive.station_id):undefined} deviceId={deviceId} packs={historyPacks} initialKind={kind} initialPoint={String(point.id)} telemetry={telemetry} canExport={canExport} initialDate={dateKey(groups.flatMap(group=>group.cells).find(cell=>cell.pointId===selected)?.sourceTime??new Date())}/>}</dialog>
  <dialog ref={fullscreen} className="rd-cell-fullscreen" aria-label="电芯全屏分析" onKeyDown={event=>{if(event.key==='Tab')event.stopPropagation();if(event.key==='Escape'){event.stopPropagation();event.preventDefault();closeFullscreen()}}} onCancel={event=>{event.stopPropagation();event.preventDefault();closeFullscreen()}}>
   {telemetry?<><header className="rd-cell-fullscreen-heading"><strong>{String(detail?.archive.serial_number??deviceId)} 电池簇</strong><small>{groups[0]?.source==='stored'?'采样时间见参数':'当前采样 · 见采样时间'}</small></header><main><div className="rd-cell-fullscreen-toolbar">{tabs(true)}{range}<button onClick={closeFullscreen}>退出全屏分析</button></div>{groups.length?cards:<Empty text="暂无有效单体采样"/>}</main></>:<Empty text="无遥测查看权限"/>}
  </dialog>
 </article>
}
