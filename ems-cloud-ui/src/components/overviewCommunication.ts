import type { Station } from '@/App'

/** API adapters use offline as a presentation placeholder until presence arrives. */
export function overviewCommunication(stations: Station[], demo: boolean) {
  const counts = {online:0,offline:0,unknown:0,building:0,fault:0}
  for (const station of stations) {
    if (station.status === 'building') { counts.building++; continue }
    const communication = station.maintenance?.communication?.status
    const knownOnline = communication === 'online' || station.runStatus === '通信在线'
    const knownOffline = communication === 'offline' || station.runStatus === '通信离线'
    if (knownOnline) counts.online++
    else if (knownOffline) counts.offline++
    else if (demo && (station.status === 'online' || station.status === 'fault')) counts.online++
    else if (demo && station.status === 'offline') counts.offline++
    else counts.unknown++
    if ((knownOnline || demo) && station.status === 'fault') counts.fault++
  }
  return counts
}
