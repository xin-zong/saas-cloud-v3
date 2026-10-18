import {api} from './client'
import type {ReferenceDevice} from '@/data/referenceDevices'
export type ReferenceDevicesData={items:ReferenceDevice[];stations:{id:string;name:string}[]}
export const loadReferenceDevices=(signal?:AbortSignal,exporting=false,stationId='',deviceIds?:string[])=>api<ReferenceDevicesData>(`/monitor/devices${exporting?'/export-data':''}?${new URLSearchParams({...stationId?{stationId}:{},...deviceIds?{deviceIds:deviceIds.join(',')}:{}})}`,{signal})
