import type { MaintenanceStation } from '@/data/stationMaintenance'

export function buildWeekMaintenance(rows: Pick<MaintenanceStation,'alarmsKnown'|'alarms'>[], now: number, days: string[], keyForTime: (timestamp: number) => string) {
  const known = rows.length > 0 && rows.every(row => row.alarmsKnown)
  const alarms = rows.flatMap(row => row.alarms).filter(alarm => !alarm.occurredAt || Date.parse(alarm.occurredAt) <= now)
  const inWeek = (stamp?: string) => !!stamp && Number.isFinite(Date.parse(stamp)) && Date.parse(stamp) <= now && days.includes(keyForTime(Date.parse(stamp)))
  const occurrences = alarms.filter(alarm => inWeek(alarm.occurredAt))
  const recoveries = alarms.filter(alarm => inWeek(alarm.recoveredAt))
  return {
    known, total: known ? occurrences.length : null,
    critical: known ? occurrences.filter(alarm => alarm.severity === 'critical').length : null,
    active: known ? alarms.filter(alarm => alarm.status === 'active').length : null,
    recovered: known ? recoveries.length : null,
    trend: days.map(day => ({day, added: occurrences.filter(alarm => keyForTime(Date.parse(alarm.occurredAt!)) === day).length, recovered: recoveries.filter(alarm => keyForTime(Date.parse(alarm.recoveredAt!)) === day).length})),
  }
}
