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

// Reference list columns verified in monitor--index-DvfM7jaW.js. Missing aggregates remain unknown.
export const substationColumns = {
 pv: [['solarCapacityKw','光伏装机容量 (kWp)'],['generationPower','光伏发电功率 (kW)'],['generationCapacity','功率归一化 (%)'],['powerGenerationTrend','光伏发电趋势'],['generationValue','当日光伏发电量 (kWh)'],['fullPowerHoursDay','当日满发小时 (h)'],['prYesterday','昨日 PR (%)'],['generationValueMonth','当月光伏发电量 (kWh)'],['generationValueTotalActual','总光伏发电量 (kWh)'],['weeklyFullPowerHours','本周满发小时 (h)'],['monthlyFullPowerHours','本月满发小时 (h)'],['yearlyFullPowerHours','本年满发小时 (h)'],['weeklyAvgPr','本周 PR (%)'],['monthlyAvgPr','本月 PR (%)'],['yearlyAvgPr','本年 PR (%)']],
 storage: [['batterySoc','SOC (%)'],['batterySoh','SOH (%)'],['weeklyChargeDischargeEfficiency','本周充放电效率 (%)'],['monthlyChargeDischargeEfficiency','本月充放电效率 (%)'],['yearlyChargeDischargeEfficiency','本年充放电效率 (%)'],['weeklyChargeDischargeUtilizationRatio','本周充放电利用率 (%)'],['monthlyChargeDischargeUtilizationRatio','本月充放电利用率 (%)'],['yearlyChargeDischargeUtilizationRatio','本年充放电利用率 (%)'],['storagePowerKw','储能额定功率 (kW)'],['storageCapacityKwh','储能额定容量 (kWh)'],['batteryPower','储能功率 (kW)'],['batteryStatus','充放电状态'],['chargeValue','当日充电量 (kWh)'],['dischargeValue','当日放电量 (kWh)'],['chargeUploadTotal','累计充电量 (kWh)'],['dischargeUploadTotal','累计放电量 (kWh)']],
} as const
export function selectSubstations(rows:Substation[],search:string,type:string,sort:string,descending:boolean){
 return rows.filter(r=>r.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())&&(!type||(type==='hybrid'?r.systems.includes('pv')&&r.systems.includes('storage'):r.systems.includes(type)&&!r.systems.includes(type==='pv'?'storage':'pv')))).sort((a,b)=>{
 const av=a[sort as keyof Substation],bv=b[sort as keyof Substation];if(av==null&&bv==null)return a.id.localeCompare(b.id);if(av==null)return 1;if(bv==null)return -1;
 const c=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),'zh-CN');return (descending?-c:c)||a.id.localeCompare(b.id)
 })
}

export function substationCsv(rows:unknown[][]){const cell=(value:unknown)=>'"'+String(value??'').replace(/^[=+@\-\t\r\n]/,"'$&").replace(/"/g,'""')+'"';return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')}

export function substationSelectionChanged(selected:string[],initial:string[]){return selected.length!==initial.length||selected.some(id=>!initial.includes(id))}
export function substationDraftChanged(draft:SubstationDraft|null,initial?:SubstationDraft){
 if(!draft)return false;if(!initial)return true;
 const fields=['name','solarCapacityKw','storagePowerKw','storageCapacityKwh','chargePowerKw','mpptCapacityKw','azimuth','tilt','voltageKv','roofType','pavedArea'] as const;
 return substationSelectionChanged(draft.systems,initial.systems)||fields.some(key=>(draft[key]??'')!==(initial[key]??''))
}
