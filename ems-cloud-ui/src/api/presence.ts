import type { Station } from '../App'
export type Presence = { stationId: string; status: 'online' | 'offline' | null; unavailable?: boolean; devices: {id:string;status:'online'|'offline'|null;observedAt?:string|null}[] }
export function mergePresence(stations: Station[], rows: Presence[]): Station[] {
  const byStation=new Map(rows.map(row=>[row.stationId,row]))
  return stations.map(station=>{
    const row=byStation.get(station.id)
    if(!row)return station
    const byDevice=new Map(row.devices.map(device=>[device.id,device]))
    const inventory=(station.deviceInventory??[]).map(device=>{
      const state=byDevice.get(device.id)
      return state?{...device,status:state.status??'unknown' as const,updatedAt:state.observedAt??device.updatedAt}:device
    })
    const lastSeenAt=row.devices.map(d=>d.observedAt).filter((at):at is string=>!!at).sort().at(-1)
    return {...station,status:row.status??'offline',runStatus:row.status==='online'?'通信在线':row.status==='offline'?'通信离线':'通信未知',deviceInventory:inventory,
      dataStatus:row.devices.length&&!row.unavailable?'partial' as const:station.dataStatus,
      maintenance:station.maintenance?{...station.maintenance,communication:row.status?{status:row.status,lastSeenAt}:null}:station.maintenance,
      devices:{...station.devices,online:inventory.filter(d=>d.status==='online').length,offline:inventory.filter(d=>d.status==='offline').length}}
  })
}
