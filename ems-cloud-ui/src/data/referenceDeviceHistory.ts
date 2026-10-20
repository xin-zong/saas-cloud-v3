export type HistoryPoint={id?:unknown;name?:unknown;unit?:unknown;code?:unknown;storageName?:unknown}
export const HISTORY_PRESETS=[['ac','交流分析'],['dc-current','直流电流对比'],['dc-voltage','直流电压对比'],['dc-both','直流电流和电压对比']] as const
export function historySelectionError(ids:number[],points:HistoryPoint[]){
 if(new Set(ids).size!==ids.length)return '不能重复选择参数'
 if(ids.length>12)return '最多选择12个参数'
 if(ids.some(id=>!points.some(p=>Number(p.id)===id)))return '只能选择本设备的参数'
 if(new Set(points.filter(p=>ids.includes(Number(p.id))).map(p=>String(p.unit??'')).filter(Boolean)).size>4)return '最多选择4种单位'
 return ''
}
export function presetPointIds(preset:string,points:HistoryPoint[]){
 return points.filter(p=>{const name=String(p.name??'').replace(/^详情 · /,'');return preset==='ac'?/^(交流电压[RS TUVWABC/]+|交流电流[RS TUVWABC/]+|交流输出频率R|[ABC]相 (?:电压|电流)|A相 频率)$/.test(name):preset==='dc-current'?/^(直流电流PV\d+|MPPT输入电流\d+|PV\d+ 电流)$/.test(name):preset==='dc-voltage'?/^(直流电压PV\d+|MPPT输入电压\d+|PV\d+ 电压)$/.test(name):preset==='dc-both'?/^(直流(?:电流|电压)PV\d+|MPPT输入(?:电流|电压)\d+|PV\d+ (?:电流|电压))$/.test(name):false}).map(p=>Number(p.id)).slice(0,12)
}
export function historyCsv(points:HistoryPoint[],rows:Record<string,unknown>[]){
 const escape=(v:unknown)=>'"'+String(v??'').replace(/^[=+@\-\t\r\n]/,"'$&").replace(/"/g,'""')+'"'
 return '\ufeff'+[['时间',...points.map(p=>`${String(p.name??p.id)}${p.unit?` (${p.unit})`:''}`)],...rows.map(row=>[row.time,...points.map(p=>row[String(p.id)])])].map(row=>row.map(escape).join(',')).join('\r\n')
}

/** Expand only the requested sampling cadence; absent buckets are gaps, never interpolation. */
export function historyGapRows(rows:Record<string,unknown>[],ids:number[],intervalMinutes:number){
 const step=intervalMinutes*60000;if(!Number.isFinite(step)||step<=0)throw new Error('历史采样间隔无效')
 const ordered=rows.filter(row=>Number.isFinite(Date.parse(String(row.time)))).sort((a,b)=>Date.parse(String(a.time))-Date.parse(String(b.time))),result:Record<string,unknown>[]=[]
 const empty=(time:number)=>Object.fromEntries([['time',new Date(time).toISOString()],...ids.map(id=>[String(id),null])])
 for(const row of ordered){const time=Date.parse(String(row.time)),previous=result.at(-1);if(previous)for(let gap=Date.parse(String(previous.time))+step;gap<time&&result.length<3000;gap+=step)result.push(empty(gap));result.push({...empty(time),...row,time:new Date(time).toISOString()})}
 return result
}

/** Recharts supplies this series' currently visible (Brush-clipped) coordinates. */
export function historyIsolatedPoint(points:ReadonlyArray<{x?:number|null;y?:number|null}>|undefined,index:number){
 const valid=(point:{x?:number|null;y?:number|null}|undefined)=>Number.isFinite(point?.x)&&Number.isFinite(point?.y)
 return !!points&&valid(points[index])&&!valid(points[index-1])&&!valid(points[index+1])
}

/** Defaults verified in the source day selector; unknown product ordering is not inferred. */
export function defaultHistoryPointIds(type:string,points:HistoryPoint[]){
 if(type==='inverter')return presetPointIds('ac',points)
 const codes:Record<string,string[]>={pcs:['APo_t1'],meter:['Etdy_pos1','Pt1']}
 return points.filter(p=>type==='battery-cluster'?(['电池容量SOC','SOC'].includes(String(p.name??'').replace(/^详情 · /,''))&&String(p.unit??'')==='%'):(codes[type]??[]).includes(String(p.storageName??p.code??''))).map(p=>Number(p.id)).filter(Number.isFinite)
}
function numericHistoryPoint(p:HistoryPoint){return Number.isFinite(Number(p.id))&&/^(%|V|mV|kV|A|mA|kA|W|kW|MW|Wh|kWh|MWh|Hz|°C|℃|°F|Ω|kΩ|MΩ|Pa|kPa|MPa|bar|h|min|s|d|次|Ah|mAh|rpm|var|kvar|Mvar|varh|kvarh|Mvarh|VA|kVA|MVA)$/.test(String(p.unit??'').trim())}
/** Use only registered numeric measurements with actual source evidence, including exact zero. */
export function observedHistoryPointIds(points:HistoryPoint[],observations:Record<string,unknown>[]){
 const observed=new Set(observations.filter(row=>{const source=typeof row.sourceTime==='number'?row.sourceTime:typeof row.sourceTime==='string'?Date.parse(row.sourceTime):NaN;return (row.quality==='valid'&&row.valueType==='number'||row.quality==='observed'&&row.valueType===undefined)&&(typeof row.value==='number'||typeof row.value==='string'&&row.value.trim()!=='')&&Number.isFinite(Number(row.value))&&Number.isFinite(source)&&source<=Date.now()}).map(row=>String(row.pointId)))
 return points.filter(p=>numericHistoryPoint(p)&&observed.has(String(p.id))).map(p=>Number(p.id))
}
export function initialHistoryPointIds(type:string,points:HistoryPoint[],configured:number[],observed:number[]=[]){
 const defaults=defaultHistoryPointIds(type,points)
 // An actual numeric measurement is useful even when this product has no verified preset.
 // This does not infer a semantic alias (for example parent SOC for a battery pack).
 const firstNumeric=points.find(p=>numericHistoryPoint(p)&&observed.includes(Number(p.id)))??points.find(numericHistoryPoint)
 return (configured.length?configured:defaults.length?defaults:firstNumeric?[Number(firstNumeric.id)]:[]).filter(id=>points.some(p=>Number(p.id)===id))
}

/** Full calendar day until the user selects a narrower Brush window; never adds samples. */
export function historyTimeAxis(start:number,endExclusive:number,rows:Record<string,unknown>[],brush?:{startIndex?:number;endIndex?:number}){
 let low=start,high=endExclusive;
 if(brush&&rows.length&&(Number(brush.startIndex)>0||Number(brush.endIndex)<rows.length-1)){
  const first=Date.parse(String(rows[brush.startIndex??0]?.time)),last=Date.parse(String(rows[brush.endIndex??rows.length-1]?.time));
  if(Number.isFinite(first)&&Number.isFinite(last)){low=first;high=last>first?last:first+60000}
 }
 const ticks:number[]=[];if(Number.isFinite(low)&&Number.isFinite(high)&&high>low){const step=low===start&&high===endExclusive?4*3600000:Math.max(60000,Math.ceil((high-low)/6/60000)*60000);for(let time=low;time<high;time+=step)ticks.push(time);ticks.push(high)}
 return {domain:[low,high] as [number,number],ticks}
}
