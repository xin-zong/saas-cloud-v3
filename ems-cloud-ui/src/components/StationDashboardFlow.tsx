import {useState,type ReactNode} from 'react'
import type {Station} from '@/App'
import {buildStationFlow,type FlowDirectionConvention,type StationFlowInput} from '@/data/stationFlow'
import EnergyFlow3D,{INIT_DEVICES,type DeviceType,type EnergyMetrics} from './EnergyFlow3D'
import EnergyFlowDiagram from './EnergyFlowDiagram'
export interface StationDashboardFlowProps {
 scene:string
 metrics:EnergyMetrics
 station?:Station
 rawFlow?:StationFlowInput|null
 directionConvention?:FlowDirectionConvention
 view?:'2d'|'3d'
 onViewChange?:(view:'2d'|'3d')=>void
 selectedType?:DeviceType
 onDeviceSelect?:(type:DeviceType)=>void
 fallback?:ReactNode
}
/** Selectable 2D view and original 3D geometry share the same measured flow model. */
export default function StationDashboardFlow({scene,station,rawFlow,directionConvention=null,view:controlledView,onViewChange,selectedType,onDeviceSelect,...props}:StationDashboardFlowProps){
 const [localView,setLocalView]=useState<'2d'|'3d'>('2d'),[localSelected,setLocalSelected]=useState<DeviceType>()
 const selected=selectedType??localSelected,selectDevice=(type:DeviceType)=>{setLocalSelected(type);onDeviceSelect?.(type)}
 const view=controlledView??localView
 const model=buildStationFlow(rawFlow,directionConvention,scene)
 const devices=INIT_DEVICES.filter(d=>scene==='grid'?['tower','factory','pcs'].includes(d.type):['solar','pv'].includes(scene)?d.type!=='battery':true)
 const changeView=(next:'2d'|'3d')=>{setLocalView(next);onViewChange?.(next)}
 const unknown=model.gridDirection==='unknown'||model.batteryDirection==='unknown'
 return <div style={{height:'100%',display:'flex',flexDirection:'column',minHeight:0}}>
  <div role="group" aria-label="能量流视图" style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px'}}>
   {(['2d','3d'] as const).map(mode=><button type="button" key={mode} aria-pressed={view===mode} onClick={()=>changeView(mode)} style={{border:'1px solid #d8e3dc',borderRadius:6,padding:'4px 12px',background:view===mode?'#e7f4ee':'white',color:'#24423b'}}>{mode==='2d'?'2D 能流':'3D 视图'}</button>)}
   <span style={{fontSize:11,color:'#75848b'}}>能量流向{unknown?' · 缺数或方向未知时停止箭头':''}</span>
  </div>
  <div style={{flex:1,minHeight:0}}>{view==='2d'?station?<EnergyFlowDiagram station={station} measured={model} devices={devices} selectedType={selected} onDeviceSelect={selectDevice}/>:<div role="status">暂无场站能流数据</div>:<EnergyFlow3D {...props} selectedType={selected} onDeviceSelect={selectDevice} metrics={model.metrics} devices={devices} edges={model.edges}/>}</div>
 </div>
}
