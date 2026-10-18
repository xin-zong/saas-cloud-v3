import type {DashboardTrend,WorkspaceData,WorkspaceSite} from '@/api/monitorWorkspace'
import type {SettlementRecord} from './stationSettlement'

export function sumMetric(items:Pick<WorkspaceSite,'metrics'>[],key:string){
 const values=items.map(r=>r.metrics[key]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v))
 return {value:values.length?values.reduce((a,b)=>a+b,0):null,covered:values.length,total:items.length}
}
// A fleet observation is indivisible: never reuse it after region/search/permission filtering.
export function matchingCapture(data:WorkspaceData|null,ids:string[]){
 return data&&data.total===ids.length&&data.items.length===ids.length&&data.items.every(r=>ids.includes(r.id))?data.dashboardCapture??null:null
}
export function storageSeries(trend?:DashboardTrend){
 if(!trend||trend.granularity!=='day')return []
 const points=new Map(trend.points.map(p=>[p.date,p.values])),rows:{date:string;charge:number|null;discharge:number|null}[]=[]
 const cursor=new Date(trend.start+'T00:00:00Z'),end=new Date(trend.end+'T00:00:00Z')
 while(cursor<=end&&rows.length<366){const date=cursor.toISOString().slice(0,10),v=points.get(date);rows.push({date,charge:typeof v?.chargeEnergy==='number'?v.chargeEnergy/1000:null,discharge:typeof v?.dischargeEnergy==='number'?v.dischargeEnergy/1000:null});cursor.setUTCDate(cursor.getUTCDate()+1)}
 return rows
}
export function revenueGroups(records:SettlementRecord[]){
 const groups=new Map<string,Map<string,number>>()
 for(const r of records){if(!r.currency||!r.calculationComplete||r.status==='disputed'||typeof r.realized!=='number'||!Number.isFinite(r.realized))continue;const dates=groups.get(r.currency)??new Map<string,number>();dates.set(r.date,(dates.get(r.date)??0)+Math.round(r.realized*100));groups.set(r.currency,dates)}
 return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([currency,dates])=>({currency,total:[...dates.values()].reduce((a,b)=>a+b,0)/100,points:[...dates].sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({date,v:v/100}))}))
}
