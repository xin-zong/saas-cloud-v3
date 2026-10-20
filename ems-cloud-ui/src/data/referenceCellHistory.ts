import {historyGapRows} from './referenceDeviceHistory'
export type CellHistorySeries={id:string;rows:{time:string;value:string|null}[]}
/** Stored buckets retain their authorized raw evidence; do not discard it for bucket.last. */
export function cellHistorySamples(rows:Record<string,unknown>[],pointId:string,from:number,to:number,bucketNumber:(row:Record<string,unknown>)=>number|null):CellHistorySeries['rows']{
 const samples=new Map<string,string|null>();
 for(const bucket of rows){
  const stored=bucket.sourceType==='stored_device'||bucket.source==='stored_device';
  const evidence=stored?(Array.isArray(bucket.evidence)?bucket.evidence:[]):[bucket];
  for(const item of evidence){
   if(!item||typeof item!=='object')continue;const row=item as Record<string,unknown>;
   if(stored&&(String(row.pointId)!==pointId||row.source!=='stored_device'||row.sourceTimeKind!=='source'))continue;
   const raw=stored?row.sourceTime:row.timestamp??row.time??row.sourceTime;if(raw===null||raw===undefined)continue;
   const time=new Date(raw as string|number);if(!Number.isFinite(time.getTime())||time.getTime()<from||time.getTime()>to)continue;
   const valid=stored?row.quality==='valid'&&row.valueType==='number'&&typeof row.value==='string'&&row.value.trim()!==''&&Number.isFinite(Number(row.value)):bucketNumber(row)!==null;
   const key=time.toISOString(),value=valid?String(row.value):null;
   samples.set(key,samples.has(key)&&samples.get(key)!==value?null:value);
  }
 }
 return [...samples].sort(([a],[b])=>a.localeCompare(b)).map(([time,value])=>({time,value}));
}
export function cellHistoryRows(series:CellHistorySeries[],ids:string[],completePack:boolean):Record<string,unknown>[]{
 const merged=new Map<string,Record<string,unknown>>();
 for(const item of series){if(!ids.includes(item.id))continue;for(const sample of item.rows){const time=Date.parse(sample.time);if(!Number.isFinite(time))continue;const key=new Date(time).toISOString(),row=merged.get(key)??{time:key};row[item.id]=sample.value;merged.set(key,row)}}
 return historyGapRows([...merged.values()],ids.map(Number),15).map(row=>{const values=ids.map(id=>row[id]);const all=completePack&&ids.length>0&&values.every(value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value)));return {...row,average:all?values.reduce<number>((sum,value)=>sum+Number(value),0)/values.length:null}});
}
export async function loadCellSeries<T>(ids:string[],signal:AbortSignal,load:(id:string,signal:AbortSignal)=>Promise<T>):Promise<{id:string;rows:T}[]>{
 const queue=[...new Set(ids)],result:{id:string;rows:T}[]=[];let cursor=0,failure:unknown;
 const group=new AbortController(),abort=()=>group.abort(signal.reason);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 try{await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{try{while(cursor<queue.length){group.signal.throwIfAborted();const id=queue[cursor++];const rows=await load(id,group.signal);group.signal.throwIfAborted();result.push({id,rows})}}catch(error){if(failure===undefined)failure=error;group.abort();throw error}}));return result}catch(error){throw failure??error}finally{signal.removeEventListener('abort',abort)}
}
