import {api} from './client'
import type {MeterTouCell} from '@/data/deviceMeterTou'
export type MeterTouData={items:MeterTouCell[];month:string;direction:'positive'|'negative';timezone:string;unit:'kWh';source:'mock_dataset';mocked:true;intervalMinutes:15}
export function loadMeterTou(station:string,device:string,month:string,direction:'positive'|'negative',exporting=false,signal?:AbortSignal){return api<MeterTouData>(`/stations/${encodeURIComponent(station)}/devices/${encodeURIComponent(device)}/meter-tou?${new URLSearchParams({month,direction,exporting:String(exporting)})}`,{signal})}
