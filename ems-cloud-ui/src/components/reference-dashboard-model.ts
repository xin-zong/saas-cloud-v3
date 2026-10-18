import type {DashboardCard,DashboardTrend,WorkspaceSite} from '@/api/monitorWorkspace'

export function dashboardRanking(card:DashboardCard|undefined,rows:Pick<WorkspaceSite,'id'|'name'>[],descending:boolean){
 const allowed=new Map(rows.map(row=>[row.id,row]))
 return (card?.ranking??[]).flatMap(rank=>{
  const row=allowed.get(rank.stationId)
  return row&&typeof rank.value==='number'&&Number.isFinite(rank.value)?[{...row,value:rank.value}]:[]
 }).sort((a,b)=>(a.value-b.value)*(descending?-1:1)).slice(0,5)
}
export function dashboardPeriodRecord(card:DashboardCard|undefined,requested:string,kind:'month'|'year'){
 if(!requested)return card
 return card?.trend?.start.slice(0,kind==='month'?7:4)===requested?card:undefined
}
export function dashboardAxisPoints(trend:DashboardTrend){
 const suffix=trend.granularity==='year'?'-01-01':trend.granularity==='month'?'-01':''
 const cursor=new Date(`${trend.start}${suffix}T00:00:00Z`),end=new Date(`${trend.end}${suffix}T00:00:00Z`),length=trend.granularity==='year'?4:trend.granularity==='month'?7:10
 const observed=new Map(trend.points.map(point=>[point.date,point.values])),points:{date:string;[key:string]:string|number|null}[]=[]
 while(cursor<=end&&points.length<366){
  const date=cursor.toISOString().slice(0,length),values=observed.get(date)
  points.push({date,...Object.fromEntries(trend.series.map(key=>[key,values?.[key]??null]))})
  if(trend.granularity==='year')cursor.setUTCFullYear(cursor.getUTCFullYear()+1)
  else if(trend.granularity==='month')cursor.setUTCMonth(cursor.getUTCMonth()+1)
  else cursor.setUTCDate(cursor.getUTCDate()+1)
 }
 return points
}
