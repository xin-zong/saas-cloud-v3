export const DEVICE_CATEGORIES = [
  ['inverter','逆变器'],['cabinet','储能一体柜'],['pcs','PCS'],['battery-cluster','电池簇'],['battery-stack','电池堆'],['air-conditioner','空调'],['meter','电表'],['logger','采集器'],['ems','EMS'],
] as const
export type ReferenceDeviceCategory = typeof DEVICE_CATEGORIES[number][0] | 'environment' | 'mppt' | 'liquid-cooler'
export type ReferenceDevice = {
  id:string; stationId:string; stationName:string; name:string; serial:string; type:ReferenceDeviceCategory;
  status:'online'|'offline'|'unknown'; alarmAllowed?:boolean; hasAlarm?:boolean|null; activeAlarmCount?:number|null; fields:Record<string,string|number|null>;
  recordedStatus?:'online'|'offline'|'unknown';statusAt?:string|null;updatedAt:string|null; stale?:boolean; telemetryAllowed:boolean; exportAllowed:boolean;
  points?:{name:string;unit:string;value:number|string|null;text?:string|null;quality:string;sourceAt:string|null;stale:boolean}[];
  fieldSamples?:Record<string,{sourceAt:string|null;stale:boolean}>;
}
// Names and units are explicit: never substitute another device's totals or infer charge from power sign.
const pointFields:Record<string,{names:string[];unit:string}>={
  configuration:{names:['配置状态'],unit:''},architecture:{names:['架构'],unit:''},application:{names:['应用于'],unit:''},installation:{names:['安装位置'],unit:''},
  stringDispersion:{names:['组串电流离散率'],unit:'%'},normalization:{names:['功率归一化'],unit:'%'},stringCapacity:{names:['实际组串容量'],unit:'kWp'},fullPowerHours:{names:['当日满发小时'],unit:'h'},
  dcPower:{names:['总直流功率'],unit:'kW'},acPower:{names:['总交流有功功率','交流有功功率'],unit:'kW'},
  batteryPower:{names:['当前功率','储能充放电功率'],unit:'kW'},batteryCurrent:{names:['电池电流'],unit:'A'},
  soc:{names:['SOC','电池SOC'],unit:'%'},soh:{names:['SOH','电池健康度SOH'],unit:'%'},
  cellVoltageRange:{names:['单体电压极差'],unit:'V'},cellVoltageAverage:{names:['单体电压平均值'],unit:'V'},cellVoltageMax:{names:['单体最高电压'],unit:'V'},cellVoltageMin:{names:['单体最低电压'],unit:'V'},
  cellTemperatureRange:{names:['单体温度极差'],unit:'℃'},cellTemperatureAverage:{names:['单体温度平均值','单体温度均值'],unit:'℃'},cellTemperatureMax:{names:['单体最高温度'],unit:'℃'},cellTemperatureMin:{names:['单体最低温度'],unit:'℃'},
  pvPower:{names:['发电功率'],unit:'kW'},pvDaily:{names:['当日光伏发电量'],unit:'kWh'},pvTotal:{names:['累计光伏发电量'],unit:'kWh'},chargeStatus:{names:['充放电状态'],unit:''},
}
export function adaptReferenceDevice(row:ReferenceDevice):ReferenceDevice {
  const fields={...row.fields},fieldSamples:NonNullable<ReferenceDevice['fieldSamples']>={};
  if(fields.parent==null)fields.parent=[fields.parentName,fields.parentSerial].filter(Boolean).join('\n')||null;
  if(row.telemetryAllowed)for(const [key,definition] of Object.entries(pointFields)){
    if(fields[key]!=null)continue;
    const matching=(row.points??[]).filter(p=>definition.names.includes(p.name)&&p.unit===definition.unit&&p.quality==='valid');
    if(matching.length===1){fields[key]=matching[0].text??matching[0].value;fieldSamples[key]={sourceAt:matching[0].sourceAt,stale:matching[0].stale}}
  }
  const sampleTimes=Object.values(fieldSamples).map(p=>p.sourceAt).filter((v):v is string=>!!v).sort();
  return {...row,status:row.telemetryAllowed&&row.statusAt&&['online','offline'].includes(row.recordedStatus??'')?row.recordedStatus!:row.status,alarmAllowed:row.alarmAllowed===true,hasAlarm:row.alarmAllowed===true?row.hasAlarm??null:null,activeAlarmCount:row.alarmAllowed===true?row.activeAlarmCount??null:null,fields,fieldSamples,updatedAt:sampleTimes.at(-1)??row.updatedAt,stale:Object.keys(fieldSamples).length?Object.values(fieldSamples).some(p=>p.stale):row.stale};
}
export type DeviceColumn = {key:string;label:string;width:number;sortable?:boolean}
const col=(key:string,label:string,width=160,sortable=true):DeviceColumn=>({key,label,width,sortable})
const batteries = [col('chargeStatus','充放电状态',120,false),col('batteryPower','储能充放电功率(kW)',190),col('soc','SOC(%)',120),col('soh','SOH(%)',120),col('cellVoltageRange','单体电压极差(V)'),col('cellVoltageMax','单体最高电压(V)'),col('cellVoltageMin','单体最低电压(V)'),col('cellTemperatureRange','单体温度极差(℃)'),col('cellTemperatureMax','单体最高温度(℃)'),col('cellTemperatureMin','单体最低温度(℃)')]
const categoryFields:Record<ReferenceDeviceCategory,DeviceColumn[]> = {
  inverter:[col('configuration','配置状态',150,false),col('architecture','架构',230,false),col('stringDispersion','组串电流离散率(%)',190),col('pvPower','发电功率(kW)'),col('pvTrend','光伏发电趋势',180,false),col('pvDaily','当日光伏发电量(kWh)',200),col('fullPowerHours','当日满发小时(h)'),col('pvTotal','累计光伏发电量(kWh)',200),col('normalization','功率归一化(%)'),col('stringCapacity','实际组串容量(kWp)',190)],
  cabinet:[col('chargeStatus','充放电状态',120,false),col('batteryCurrent','电池电流（A）'),col('acPower','交流有功功率（kW）',200),col('soc','SOC(%)',120),col('soh','SOH(%)',120)],
  pcs:[col('dcPower','总直流功率（kW）',200),col('acPower','总交流有功功率（kW）',200)],
  'battery-cluster':batteries,
  'battery-stack':[...batteries.slice(0,5),col('cellVoltageAverage','单体电压平均值(V)',180),...batteries.slice(5,8),col('cellTemperatureAverage','单体温度均值(℃)',180),...batteries.slice(8)],
  'air-conditioner':[],environment:[],mppt:[],'liquid-cooler':[],meter:[col('configuration','配置状态',150,false),col('application','应用于',120,false),col('installation','安装位置',220,false)],logger:[],ems:[],
}
export function deviceColumns(category:ReferenceDeviceCategory):DeviceColumn[]{return [col('name','名称/SN',210),col('status','状态',120,false),col('stationName','所属场站',160,false),...categoryFields[category],...(['logger','ems'].includes(category)?[]:[col('parent','所属父设备',210,false)]),col('updatedAt','数据更新时间',240)]}
export const statusLabels:Record<string,string>={all:'全部',online:'在线',alarm:'报警',offline:'离线',unknown:'未知'}
export type DeviceFilter={category:ReferenceDeviceCategory;stationId:string;search:string;status:string;substationId?:string}
export function filterDevices(rows:ReferenceDevice[],q:DeviceFilter){const search=q.search.trim().toLowerCase();return rows.filter(r=>r.type===q.category&&(!q.stationId||r.stationId===q.stationId)&&(!q.substationId||r.fields.substationId===q.substationId)&&(!search||`${r.name} ${r.serial}`.toLowerCase().includes(search))&&(q.status==='all'||(q.status==='alarm'?r.alarmAllowed===true&&r.hasAlarm===true:r.status===q.status)))}
export function deviceFacets(rows:ReferenceDevice[]){return {all:rows.length,online:rows.filter(r=>r.status==='online').length,alarm:rows.some(r=>r.alarmAllowed!==true||r.hasAlarm==null)?null:rows.filter(r=>r.hasAlarm===true).length,offline:rows.filter(r=>r.status==='offline').length}}
export function deviceValue(row:ReferenceDevice,key:string):string|number|null {if(key==='name')return `${row.name}\n${row.serial}`;if(key==='stationName')return row.stationName;if(key==='status')return `${statusLabels[row.status]??'未知'} · ${row.alarmAllowed!==true||row.hasAlarm==null?'报警未知':row.hasAlarm?'设备报警 ('+(row.activeAlarmCount??'--')+')':'无设备报警'}`;if(key==='updatedAt')return row.updatedAt;return row.fields[key]??null}
export function deviceCell(row:ReferenceDevice,key:string){const value=deviceValue(row,key);return value==null||value===''?'--':String(value)}
export function sortDevices(rows:ReferenceDevice[],key:string,direction:'asc'|'desc'){return [...rows].sort((a,b)=>{const av=deviceValue(a,key),bv=deviceValue(b,key);if(av==null||av==='')return bv==null||bv===''?0:1;if(bv==null||bv==='')return -1;const numeric=Number.isFinite(Number(av))&&Number.isFinite(Number(bv));return (numeric?Number(av)-Number(bv):String(av).localeCompare(String(bv),'zh-CN',{numeric:true}))*(direction==='asc'?1:-1)})}
export function devicesCsv(rows:ReferenceDevice[],columns:DeviceColumn[]){if(rows.some(r=>!r.exportAllowed))throw new Error('部分场站没有导出权限');const escape=(v:unknown)=>`"${String(v??'').replace(/^[=+@\-\t\r\n]/,"'$&").replace(/"/g,'""')}"`;return '\ufeff'+[[...columns.map(c=>c.label),'采样状态','字段采样时间'],...rows.map(r=>[...columns.map(c=>deviceValue(r,c.key)),'采样记录',columns.filter(c=>r.fieldSamples?.[c.key]).map(c=>`${c.label}: ${r.fieldSamples![c.key].sourceAt??'未知'}`).join('; ')])].map(r=>r.map(escape).join(',')).join('\r\n')}
