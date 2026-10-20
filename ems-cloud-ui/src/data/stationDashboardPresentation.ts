import type {StationDashboardView,DashboardPanel,DashboardMetric} from '@/api/stationDashboard'
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{}
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null
export function presentDashboard(view:Pick<StationDashboardView,'panels'|'capacityKwh'|'ratedPowerKw'|'solarCapacityKw'>,supplement:unknown,totalPayload:unknown):DashboardPanel[]{
 if(!supplement)return view.panels
 const data=obj(supplement),flow=obj(data.flow),summary=obj(data.summary),solar=obj(data.solar),total=obj(obj(totalPayload).stationStatisticTotalDto)
 const metric=(key:string,label:string,value:unknown,unit='kWh',period:string|null=null):DashboardMetric=>({key,label,value:num(value),unit,period,status:num(value)===null?'missing':'mocked'})
 const wh=(v:unknown)=>num(v)===null?null:num(v)!/1000
 const storage=view.panels.find(p=>['storage','battery'].includes(p.key)),health=null
 const soc=num(flow.batterySoc),cap=num(view.capacityKwh)
 return [
 {key:'solar',label:'光伏',metrics:[metric('power','发电功率',flow.solarKw??flow.mpptKw,'kW'),metric('normalization','功率归一化',solar.normalizationPercent,'%'),metric('dailyProduction','当日光伏发电量',wh(summary.generationValue)),metric('totalProduction','累计光伏发电量',solar.totalKwh)]},
 {key:'battery',label:'储能',metrics:[metric('soc','整站SOC',soc,'%'),metric('soh','SOH',health,'%'),metric('power','储能充放电功率',flow.batteryKw,'kW'),metric('capacity','储能装机容量',cap),metric('dailyCharge','充电量',wh(summary.chargeValue),'kWh','day'),metric('dailyDischarge','放电量',wh(summary.dischargeValue),'kWh','day'),metric('totalCharge','充电量',wh(total.chargeValue),'kWh','total'),metric('totalDischarge','放电量',wh(total.dischargeValue),'kWh','total'),metric('availableCharge','可充电量',soc===null||cap===null?null:cap*(1-soc/100)),metric('availableDischarge','可放电量',soc===null||cap===null?null:cap*soc/100)]},
 {key:'load',label:'用电',metrics:[metric('power','用电功率',flow.loadKw,'kW'),metric('dailyUse','当日用电量',wh(summary.useValue)),metric('totalUse','累计用电量',wh(total.useValue))]},
 {key:'grid',label:'电网',metrics:[metric('power','电网功率',flow.gridKw,'kW'),metric('dailyExport','当日并网量',wh(summary.gridValue)),metric('dailyBuy','当日购电量',wh(summary.buyValue)),metric('totalExport','累计并网量',wh(total.gridValue)),metric('totalBuy','累计购电量',wh(total.buyValue))]}
 ]
}

export function dashboardTimestamp(value:string|null|undefined,timezone:string|null|undefined){
 if(!value||!timezone)return '—'
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '—'
 try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'}).formatToParts(date),get=(key:string)=>parts.find(p=>p.type===key)?.value??'';return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} ${get('timeZoneName').replace('GMT','UTC')}`}catch{return '—'}
}
