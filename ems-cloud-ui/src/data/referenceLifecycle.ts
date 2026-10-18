export type RelatedParty={type:string;name:string;phone:string;email:string;company:string}
export type StationDraft={name:string;address:string;region:string;country?:string;province?:string;city?:string;timezone:string;longitude:string|number;latitude:string|number;systems:string[];siteType:string;relatedParties:RelatedParty[];solarCapacityKw?:string|number|null;ratedPowerKw?:string|number|null;capacityKwh?:string|number|null;commissionedOn?:string;gridConnectionDate?:string;voltageLevelKv?:string|number|null;moduleAzimuth?:string|number|null;moduleTilt?:string|number|null;generationAccount?:string;solarConsumptionMode?:string;solarGridStatus?:string;storageGridStatus?:string}
export type DeviceDraft={name:string;serial:string;stationId:string;type:string;model?:string;manufacturer?:string;ratedPowerKw?:string|number|null;capacityKwh?:string|number|null}
export const emptyStationDraft:StationDraft={name:'',address:'',region:'',timezone:'',longitude:'',latitude:'',systems:[],siteType:'commercial',relatedParties:[]}
const text=(v:unknown)=>String(v??'').trim()
function capacities(value:Record<string,unknown>,errors:Record<string,string>){for(const key of ['solarCapacityKw','ratedPowerKw','capacityKwh'])if(text(value[key])&&(!Number.isFinite(Number(value[key]))||Number(value[key])<0))errors[key]='请输入大于或等于 0 的数值'}
export function validateStationDraft(value:StationDraft):Record<string,string>{
 const errors:Record<string,string>={};for(const key of ['name','address','region','timezone'] as const)if(!text(value[key]))errors[key]='此项必填';
 for(const [key,max] of [['longitude',180],['latitude',90]] as const)if(!text(value[key])||!Number.isFinite(Number(value[key]))||Math.abs(Number(value[key]))>max)errors[key]=`请输入 -${max} 至 ${max} 的坐标`;
 if(!value.systems?.some(s=>s==='PV'||s==='BESS'))errors.systems='请至少选择光伏系统或储能系统';
 if(!['residential','commercial','ground'].includes(value.siteType))errors.siteType='请选择场站类型';
 if(text(value.timezone))try{new Intl.DateTimeFormat('en',{timeZone:value.timezone}).format()}catch{errors.timezone='请输入有效的 IANA 时区'}
 if(value.relatedParties?.some(p=>text(p.email)&&!/^\S+@\S+\.\S+$/.test(p.email)))errors.relatedParties='关联方邮箱格式不正确';
 for(const key of ['voltageLevelKv','moduleAzimuth','moduleTilt'] as const)if(text(value[key])&&!Number.isFinite(Number(value[key])))errors[key]='请输入有效数值';
 capacities(value,errors);for(const key of ['ratedPowerKw','capacityKwh'] as const)if(text(value[key])&&Number(value[key])<=0)errors[key]='请输入大于 0 的数值';return errors
}
export function validateDeviceDraft(value:DeviceDraft):Record<string,string>{const errors:Record<string,string>={};for(const key of ['name','serial','stationId'] as const)if(!text(value[key]))errors[key]='此项必填';if(!['inverter','cabinet','pcs','battery-cluster','battery-stack','air-conditioner','meter','logger','ems'].includes(value.type))errors.type='请选择设备类型';capacities(value,errors);return errors}
export function lifecyclePayload<T extends StationDraft|DeviceDraft>(draft:T){const result:Record<string,unknown>={...draft};for(const key of ['longitude','latitude','solarCapacityKw','ratedPowerKw','capacityKwh','voltageLevelKv','moduleAzimuth','moduleTilt'])if(key in result)result[key]=text(result[key])?Number(result[key]):null;for(const key of ['commissionedOn','gridConnectionDate'])if(key in result)result[key]=result[key]||null;return result}
export type CoordinateDms={degrees:string;minutes:string;seconds:string}
export function coordinateToDms(value:string|number):CoordinateDms{
 if(String(value).trim()===''||!Number.isFinite(Number(value)))return {degrees:'',minutes:'0',seconds:'0'};
 const numeric=Number(value),negative=numeric<0||Object.is(numeric,-0),totalSeconds=Math.round(Math.abs(numeric)*3600*1000000)/1000000;
 const degrees=Math.floor(totalSeconds/3600),minutes=Math.floor((totalSeconds-degrees*3600)/60),seconds=Number((totalSeconds-degrees*3600-minutes*60).toFixed(6));
 return {degrees:(negative?'-':'')+degrees,minutes:String(minutes),seconds:String(seconds)}
}
export function dmsToCoordinate(value:CoordinateDms,max:number):number|null{
 if(!/^[+-]?\d+$/.test(value.degrees.trim())||!/^\d+$/.test(value.minutes.trim())||!/^\d+(?:\.\d+)?$/.test(value.seconds.trim()))return null;
 const d=Number(value.degrees),m=Number(value.minutes),s=Number(value.seconds);if(!Number.isFinite(d)||!Number.isFinite(m)||!Number.isFinite(s)||m>=60||s>=60)return null;
 const absolute=Math.abs(d)+m/60+s/3600;if(absolute>max)return null;return Number(((value.degrees.trim().startsWith('-')?-1:1)*absolute).toFixed(7))
}
