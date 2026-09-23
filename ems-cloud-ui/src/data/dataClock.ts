import type { Station } from "@/App"
import { operationsDate } from "./operations"

const toTime = (value?: string | null) => {
  const time = value ? Date.parse(value) : NaN
  return Number.isFinite(time) ? time : null
}

const pushTime = (values: number[], value?: string | null) => {
  const time = toTime(value)
  if (time !== null) values.push(time)
}

export function latestTelemetryTimestamp(station: Station) {
  const values: number[] = []
  station.telemetryHistory?.forEach((sample) => pushTime(values, sample.timestamp))
  station.operations?.samples?.forEach((sample) => pushTime(values, sample.timestamp))
  return values.length ? Math.max(...values) : null
}

export function latestStationTimestamp(station: Station) {
  const values: number[] = []

  const telemetry = latestTelemetryTimestamp(station)
  if (telemetry !== null) values.push(telemetry)

  Object.values(station.operations?.market?.capacityByDate ?? {}).forEach(
    (capacity) => pushTime(values, capacity?.timestamp),
  )
  pushTime(values, station.operations?.market?.capacity?.timestamp)
  station.operations?.marketServices?.forEach((service) => {
    service.delivery?.forEach((point) => pushTime(values, point.timestamp))
  })

  pushTime(values, station.maintenance?.updatedAt)
  station.maintenance?.alarms?.forEach((alarm) => {
    pushTime(values, alarm.occurredAt)
    pushTime(values, alarm.recoveredAt)
  })
  station.maintenance?.workOrders?.forEach((order) => {
    pushTime(values, order.createdAt)
  })
  station.maintenance?.inspections?.forEach((inspection) => {
    pushTime(values, inspection.completedAt)
  })
  station.maintenance?.firmware?.forEach((firmware) =>
    pushTime(values, firmware.updatedAt),
  )
  station.maintenance?.approvals?.forEach((approval) =>
    pushTime(values, approval.submittedAt),
  )
  pushTime(values, station.maintenance?.health?.observedAt)
  pushTime(values, station.maintenance?.communication?.lastSeenAt)

  station.alarmHistory?.forEach((alarm) => {
    pushTime(values, alarm.occurredAt)
    pushTime(values, alarm.recoveredAt)
    alarm.events.forEach((event) => pushTime(values, event.at))
  })
  station.deviceInventory?.forEach((device) => {
    pushTime(values, device.updatedAt)
    device.trend.forEach((point) => pushTime(values, point.at))
    device.alarms.forEach((alarm) => pushTime(values, alarm.at))
    device.versions.forEach((version) => pushTime(values, version.at))
    device.logs.forEach((log) => pushTime(values, log.at))
  })

  return values.length ? Math.max(...values) : null
}

export function stationDataNow(station: Station) {
  return new Date(latestStationTimestamp(station) ?? Date.now())
}

export function stationsDataNow(stations: Station[]) {
  const values = stations
    .map(latestStationTimestamp)
    .filter((value): value is number => value !== null)
  return new Date(values.length ? Math.max(...values) : Date.now())
}

export function dateRangeEndingAt(end: Date, days: number) {
  const start = new Date(end)
  start.setDate(start.getDate() - Math.max(0, days - 1))
  return { start: operationsDate(start), end: operationsDate(end) }
}

export function stationDataDate(station: Station) {
  return operationsDate(stationDataNow(station))
}

export function stationsDataDate(stations: Station[]) {
  return operationsDate(stationsDataNow(stations))
}
