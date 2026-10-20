import {api} from './client'
export type DashboardMetric={key:string;label:string;unit:string;period:string|null;value:number|null;status:'mocked'|'missing'|'captured'}
export type DashboardPanel={key:string;label:string;metrics:DashboardMetric[]}
export type DashboardFlow={gridKw:number|null;loadKw:number|null;pcsKw:number|null;mpptKw:number|null;batteryKw:number|null}
export type DashboardEquipment={type:string;status:string;count:number;deviceIds:string[]}
export type StationDashboardView={stationId:string;configured:boolean;datasetId:string|null;datasetVersion:number|null;mocked:boolean;sourceTime:string|null;timezone:string|null;name:string;address:string|null;commissionedOn:string|null;ratedPowerKw:number|null;capacityKwh:number|null;solarCapacityKw?:number|null;imageUrl?:string|null;modules:string[];scenes:string[];communicationState:string|null;operatingState:string|null;alarmState?:string|null;batteryState?:string|null;telemetryAvailable:boolean;panels:DashboardPanel[];flow:DashboardFlow|null;equipment:DashboardEquipment[];equipmentAlarms?:DashboardEquipment[];alarmsAvailable:boolean;alarms:{id:string|number;title:string;severity:string;occurredAt:string;deviceName:string|null}[];alarmTotal:number|null}
export function loadStationDashboard(stationId:string,signal?:AbortSignal,substationId?:string){return api<StationDashboardView>(`/stations/${encodeURIComponent(stationId)}/dashboard-view${substationId?`?substationId=${encodeURIComponent(substationId)}`:''}`,{signal})}


