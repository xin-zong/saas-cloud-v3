export const systemNames:Record<string,string>={pv:'光伏',storage:'储能',charge:'充电',mppt:'MPPT'}
export const capacityFields=[['solarCapacityKw','光伏装机容量（kWp）','pv'],['storagePowerKw','储能额定功率（kW）','storage'],['storageCapacityKwh','储能额定容量（kWh）','storage'],['chargePowerKw','充电装机功率（kW）','charge'],['mpptCapacityKw','MPPT装机容量（kWp）','mppt']] as const
export type SubstationDraft={name:string;systems:string[];solarCapacityKw?:number|null;storagePowerKw?:number|null;storageCapacityKwh?:number|null;chargePowerKw?:number|null;mpptCapacityKw?:number|null;azimuth?:number|null;tilt?:number|null;voltageKv?:number|null;roofType?:string|null;pavedArea?:number|null}
export type Substation=SubstationDraft&{id:string;stationId:string;version:number;deviceIds?:string[];deviceCount:number;state:'pending_devices'|'ready'}
export type Candidate={deviceId:string;name:string;code:string;substationId:string|null;substationName:string|null}
export type Capabilities=Partial<Record<typeof capacityFields[number][0],number|null>>&{systems?:string[];capacityNotice?:string}
export const inStation=(row:{stationId:string},stationId:string)=>String(row.stationId)===String(stationId)
export const canBindDevice=(device:{substationId:string|null},id:string)=>!device.substationId||device.substationId===id
export function validateSubstation(d:SubstationDraft,limits:Capabilities={}):string|null{
 if(!d.name.trim()||d.name.trim().length>50)return '请输入50字以内的子场站名称'
 if(!d.systems.some(s=>s==='pv'||s==='storage'))return '请至少选择光伏或储能系统'
 if(d.systems.includes('mppt')&&!d.systems.includes('storage'))return 'MPPT需要储能系统'
 for(const [key,label,system] of capacityFields){if(!d.systems.includes(system))continue;const v=d[key];if(v==null||!Number.isFinite(v)||v<0)return `请填写有效的${label}`;if(limits[key]!=null&&v>limits[key]!)return `${label}不能超过父场站容量 ${limits[key]}`}
 for(const key of ['azimuth','tilt','voltageKv','pavedArea'] as const)if(d[key]!=null&&(!Number.isFinite(d[key])||d[key]!<0))return '补充参数须为有效非负数'
 return null
}

export function toggleSubstationSystem(d:SubstationDraft,system:string,checked:boolean):SubstationDraft{
 const systems=checked?[...new Set([...d.systems,system])]:d.systems.filter(s=>s!==system&&(system!=='storage'||s!=='mppt'))
 const next={...d,systems};for(const [key,,required] of capacityFields)if(!systems.includes(required))next[key]=null
 return next
}
