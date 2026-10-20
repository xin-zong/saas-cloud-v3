/** Verified device-history export: selected day is included, not the five days before it.
 * Keep calendar keys until conversion in the chosen timezone; DST days need not be 24h.
 */
export function historyExportDates(date:string,days:1|5){
 const end=new Date(`${date}T00:00:00Z`)
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(end.getTime())||end.toISOString().slice(0,10)!==date||![1,5].includes(days))throw new Error('请选择有效导出日期')
 const start=new Date(end),until=new Date(end)
 start.setUTCDate(start.getUTCDate()-days+1);until.setUTCDate(until.getUTCDate()+1)
 return {start:start.toISOString().slice(0,10),end:date,until:until.toISOString().slice(0,10)}
}
export function historyExportPointIds(scope:'selected'|'all',selected:number[],points:{id?:unknown}[]){
 const available=points.map(p=>Number(p.id))
 if(available.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(available).size!==available.length)throw new Error('设备参数目录无效')
 if(scope!=='selected'&&scope!=='all')throw new Error('导出范围无效')
 if(scope==='selected'&&(new Set(selected).size!==selected.length||selected.some(id=>!available.includes(id))))throw new Error('只能导出本设备的参数')
 const result=scope==='all'?available:available.filter(id=>selected.includes(id))
 if(!result.length)throw new Error('请选择导出参数')
 return result
}
