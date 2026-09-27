import type { Station } from '../App'
import type { ApiRow } from './client'
import type { MaintenanceWorkOrder } from '../data/stationMaintenance'
export const text = (value: unknown) => value == null ? '' : String(value)
const numeric = (value: unknown) => value == null || value === '' ? NaN : Number(value)
export function adaptStation(row: ApiRow): Station {
  return {
    customerId: row.customer_id == null ? null : text(row.customer_id),
    id: text(row.id), name: text(row.name), shortName: text(row.name), code: text(row.code),
    status: 'offline', runStatus: '遥测未知', x: 50, y: 50,
    devices: {online: NaN, fault: NaN, offline: NaN, building: NaN},
    activePower: NaN, ratedPower: numeric(row.rated_power_kw), loadRate: NaN, pvOutput: NaN,
    storageCapacity: numeric(row.capacity_kwh), soc: NaN, generator: NaN,
    alerts: [], alarmHistory: [], telemetryHistory: [], deviceInventory: [],
    operations: {source: 'connected', samples: [], plan: [], marketServices: [], market: {source: 'connected', qualifications: [], prices: [], capacity: null}, settlement: {source: 'connected', records: []}},
    maintenance: {source: 'connected', alarms: [], workOrders: [], inspections: [], firmware: [], approvals: [], health: null, communication: null},
    type: text(row.asset_type) || '—', region: text(row.region), project: '', address: text(row.address),
    lng: text(row.longitude), lat: text(row.latitude), mode: '—', runtime: '—', revenue: '—',
    revenueHistory: [], revenueSource: 'connected', imageUrl: '', dataStatus: 'disconnected', updateTime: '—', updateSub: '资产已连接；遥测未接入',
    manager: '', email: '', phone: '', role: '', remark: text(row.remark),
  }
}
export function adaptOrder(row: ApiRow): MaintenanceWorkOrder {
  return {id: text(row.id), title: text(row.title), description: text(row.description), status: row.status as MaintenanceWorkOrder['status'], owner: text(row.assigned_to), createdAt: text(row.created_at), dueAt: text(row.due_at)}
}
