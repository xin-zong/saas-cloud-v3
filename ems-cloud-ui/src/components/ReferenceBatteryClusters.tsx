import {loadReferenceDevices} from '@/api/referenceDevices'
import {adaptReferenceDevice,deviceCell,deviceColumns,sortDevices} from '@/data/referenceDevices'
import {Empty,QueryState,useStationQuery} from './reference-station/shared'
import {useState} from 'react'
export function ReferenceBatteryClusters({stationId,deviceIds}:{stationId:string;deviceIds:string[]}){
 const [sort,setSort]=useState<{key:string;direction:'asc'|'desc'}>({key:'name',direction:'asc'})
 const query=useStationQuery(`stack-clusters:${stationId}:${deviceIds.join(',')}`,signal=>deviceIds.length?loadReferenceDevices(signal,false,stationId,deviceIds):Promise.resolve({items:[],stations:[]}))
 const columns=deviceColumns('battery-cluster').filter(c=>!['stationName','parent','updatedAt'].includes(c.key)),rows=sortDevices((query.data?.items??[]).filter(r=>r.type==='battery-cluster').map(adaptReferenceDevice),sort.key,sort.direction)
 return <article className="rs-panel rd-wide rd-cluster-table"><QueryState {...query}/><div><table><thead><tr>{columns.map(c=><th key={c.key}>{c.sortable?<button onClick={()=>setSort({key:c.key,direction:sort.key===c.key&&sort.direction==='asc'?'desc':'asc'})}>{c.key==='name'?'设备信息':c.label} ↕</button>:c.label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}>{columns.map(c=><td key={c.key}>{deviceCell(row,c.key)}</td>)}</tr>)}</tbody></table></div>{!rows.length&&!query.loading&&<Empty/>}</article>
}
