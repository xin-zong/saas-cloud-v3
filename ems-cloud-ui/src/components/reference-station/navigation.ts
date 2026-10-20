export const stationModules=['数据看板','子场站','设备','报警','能量管理','智能分析','系统布局','一次接线图','操作日志','设置'] as const
export type StationModule=typeof stationModules[number]
/** Only a persisted, verified station configuration may narrow the legacy menu. */
export function configuredStationModules(configured?:readonly string[]|null):StationModule[]{
 const labels:Record<string,StationModule>={dashboard:'数据看板',substations:'子场站',devices:'设备',alarms:'报警',energy:'能量管理',analysis:'智能分析',layout:'系统布局',wiring:'一次接线图',logs:'操作日志',settings:'设置'}
 const known=(configured??[]).map(name=>labels[name]??name).filter((name):name is StationModule=>stationModules.includes(name as StationModule))
 return known.length?[...new Set(known)]:[...stationModules]
}
export function visibleStationModule(selected:string,modules:readonly StationModule[]):StationModule{
 return modules.includes(selected as StationModule)?selected as StationModule:modules[0]??'数据看板'
}
export function resolveStationModule(initialTab?:string,initialDeviceId?:string):StationModule{
 if(stationModules.includes(initialTab as StationModule))return initialTab as StationModule
 if(initialTab==='告警信息')return '报警'
 if(initialTab==='设备详情'||initialDeviceId)return '设备'
 return '数据看板'
}
