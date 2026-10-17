import { api, send } from "./client"
import type { Condition } from "@/data/alarmRules"
export type AlarmRow = {
  id: number
  station_id: number
  station_name: string
  device_id: number
  device_name: string
  code: string
  title: string
  severity: "critical" | "warning" | "info"
  source: "device" | "rule"
  occurred_at: string
  effective_recovered_at: string | null
  closed_at: string | null
  acknowledged_at: string | null
  lifecycle: "active" | "recovered" | "closed"
  version: number
  read_flag: boolean
  notes?: {
    id: number
    body: string
    created_at: string
    author_name: string
  }[]
  events?: {
    id: number
    action: string
    note: string
    occurred_at: string
    actor_name: string | null
  }[]
  sampleStatus?: string
  samples?: {
    pointId: number
    bindingPeriodId: number
    sourceTime: string
    value: number
    quality: string
    sourceTimeKind: string
  }[]
}
export type AlarmQuery = {
  stationId?: string
  view?: string
  source?: string
  severity?: string
  deviceId?: string
  readFlag?: string
  query?: string
  start?: string
  end?: string
  limit?: number
  offset?: number
}
export function queryAlarms(query: AlarmQuery) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") params.set(key, String(value))
  return api<{
    items: AlarmRow[]
    total: number
    limit: number
    offset: number
  }>(
    `/alarms/workspace?${params}`,
  )
}
export const alarmDetail = (id: number) =>
  api<AlarmRow>(`/alarms/workspace/${id}`)
export const markAlarmsRead = (ids: number[]) =>
  send("/alarms/workspace/read", "POST", { ids })
export const handleAlarm = (
  row: Pick<AlarmRow, "id" | "version">,
  action: string,
  note: string,
) =>
  send(`/alarms/workspace/${row.id}/${action}`, "POST", {
    expectedVersion: row.version,
    note,
  })
export type Notification = {
  needed: boolean
  maxCount: number
  channels: string[]
  recipients: number[]
  recoveryNotice: boolean
}
export type AlarmRuleDraft = {
  stationId: number
  name: string
  objectType: "STATION" | "DEVICE"
  deviceId: number | null
  severity: string
  conditions: Condition[]
  effectiveStart: number
  effectiveEnd: number
  recoveryDuration: number
  solution: string
  notification: Notification
  expectedVersion: number
}
export type AlarmRuleRow = {
  id: number
  station_id: number
  station_name: string
  name: string
  object_type: "STATION" | "DEVICE"
  device_id: number | null
  severity: string
  conditions: Condition[]
  effective_start: number
  effective_end: number
  recovery_duration: number
  solution: string
  notification: Notification
  enabled: boolean
  version: number
  evaluationStatus: string
  evaluationReason: string
  evaluationLastAt?: string | null
  evaluationRuleVersion?: number | null
  evaluationConsecutive?: number | null
  evaluationActiveAlarmId?: number | null
  deliveryStatus: string
}
export const listAlarmRules = (stationId?: string) =>
  api<AlarmRuleRow[]>(
    `/alarm-rules${stationId ? `?stationId=${stationId}` : ""}`,
  )
export const saveAlarmRule = (draft: AlarmRuleDraft, id?: number) =>
  send<AlarmRuleRow>(
    id ? `/alarm-rules/${id}` : "/alarm-rules",
    id ? "PUT" : "POST",
    draft,
  )
export const toggleAlarmRule = (
  row: Pick<AlarmRuleRow, "id" | "version" | "enabled">,
) =>
  send<AlarmRuleRow>(`/alarm-rules/${row.id}/enabled`, "POST", {
    expectedVersion: row.version,
    enabled: !row.enabled,
  })
export const deleteAlarmRule = (row: Pick<AlarmRuleRow, "id" | "version">) =>
  send(`/alarm-rules/${row.id}`, "DELETE", { expectedVersion: row.version })
export const alarmRuleHistory = (id: number) =>
  api<{
    id: number
    action: string
    version: number
    occurred_at: string
  }[]>(
    `/alarm-rules/${id}/history`,
  )
export const alarmRuleOptions = (stationId: number) =>
  api<{
    devices: {
      id: number
      name: string
    }[]
    recipients: {
      id: number
      display_name: string
    }[]
  }>(`/alarm-rules/options?stationId=${stationId}`)
