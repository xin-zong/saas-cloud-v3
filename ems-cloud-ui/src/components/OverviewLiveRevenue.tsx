import {Area,AreaChart,ResponsiveContainer,Tooltip,XAxis} from 'recharts'
import type {Station} from '@/App'
import {revenueGroups} from '@/data/overviewLive'
import {metricText} from '@/api/monitorWorkspace'
export default function OverviewLiveRevenue({stations}:{stations:Station[]}){
 const records=stations.flatMap(s=>s.operations?.settlement?.records??[]),groups=revenueGroups(records)
 return <><p style={{fontSize:10,color:'#76857f'}}>近一年已计算净收益 · 按币种分别汇总 · 不含争议或未完成计算的记录</p>{groups.length?groups.map(g=><div key={g.currency}><strong data-metric={'revenue-'+g.currency}>{metricText(g.total)} {g.currency}</strong><div style={{height:48}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={g.points}><XAxis dataKey="date" hide/><Tooltip formatter={v=>`${metricText(Number(v))} ${g.currency}`}/><Area type="linear" dataKey="v" stroke="#2f875a" fill="#e5f2eb" isAnimationActive={false}/></AreaChart></ResponsiveContainer></div><details><summary style={{fontSize:11}}>收益明细（{g.currency}）</summary><div style={{maxHeight:100,overflow:'auto'}}>{g.points.map(p=><div key={p.date} style={{fontSize:11}}>{p.date}：{metricText(p.v)} {g.currency}</div>)}</div></details></div>):<p role="status" style={{fontSize:11,color:'#76857f'}}>当前授权范围近一年无可用收益记录（未采集、无权限或未完成计算）；不按电量估算</p>}</>
}
