export const stationModules=['数据看板','子场站','设备','报警','能量管理','智能分析','系统布局','一次接线图','操作日志','设置'] as const
export type StationModule=typeof stationModules[number]
export function resolveStationModule(initialTab?:string,initialDeviceId?:string):StationModule{
 if(stationModules.includes(initialTab as StationModule))return initialTab as StationModule
 if(initialTab==='告警信息')return '报警'
 if(initialTab==='设备详情'||initialDeviceId)return '设备'
 return '数据看板'
}
