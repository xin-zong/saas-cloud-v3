import {deviceColumns,type DeviceColumn,type ReferenceDeviceCategory} from '@/data/referenceDevices'
// The station navigation differs from the global device navigation.
export const STATION_DEVICE_CATEGORIES:{key:ReferenceDeviceCategory|null;label:string}[]=[
 {key:'inverter',label:'逆变器'},{key:'pcs',label:'PCS'},{key:'battery-stack',label:'电池堆'},
 {key:'battery-cluster',label:'电池簇'},{key:null,label:'动环'},{key:null,label:'MPPT'},
 {key:null,label:'液冷机'},{key:'meter',label:'电表'},{key:'logger',label:'采集器'},{key:'ems',label:'EMS控制器'},
]
export function stationDeviceColumns(category:ReferenceDeviceCategory):DeviceColumn[]{
 const columns=deviceColumns(category).filter(c=>c.key!=='stationName')
 columns.splice(columns.findIndex(c=>c.key==='updatedAt'),0,{key:'childStationName',label:'所属子场站',width:160,sortable:false})
 if(category==='inverter'){
  const capacity=columns.find(c=>c.key==='stringCapacity')!
  columns.splice(columns.indexOf(capacity),1)
  columns.splice(columns.findIndex(c=>c.key==='architecture')+1,0,capacity)
  columns.splice(columns.findIndex(c=>c.key==='pvTrend')+1,0,{key:'performance',label:'逆变器性能',width:150,sortable:false})
 }
 return columns
}
