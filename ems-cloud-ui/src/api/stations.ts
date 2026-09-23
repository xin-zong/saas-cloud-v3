import { api, allRows, type ApiRow } from "./client"

import { adaptStation, adaptOrder, text } from "./adapters"
import { adaptSettlement } from "./settlement"
import { canAccessStation, type AuthUser } from "../auth/roles"

import type { MarketKind } from "../data/stationMarket"

import type { SettlementRecord } from "../data/stationSettlement"

import type { StationDevice } from "../data/stationDevices"

export async function loadStations(user: AuthUser, signal?: AbortSignal) {
  const records = await allRows("/stations", signal)

  const orders = user.permissions.includes("workorder.read")
    ? await allRows("/work-orders", signal)
    : []

  return Promise.all(
    records
      .filter((row) => canAccessStation(user, String(row.id)))
      .map(async (record) => {
        const station = adaptStation(record)

        const allowed = (
          permission: string,
          path: string,
          paginated = false,
        ) =>
          user.permissions.includes(permission)
            ? paginated
              ? allRows(`/stations/${station.id}/${path}`, signal)
              : api<ApiRow[]>(`/stations/${station.id}/${path}`, { signal })
            : Promise.resolve([])

        const today = new Date().toLocaleDateString("en-CA", {
          timeZone: "Asia/Shanghai",
        })

        const from = new Date(Date.now() - 365 * 86400000).toLocaleDateString(
          "en-CA",
          { timeZone: "Asia/Shanghai" },
        )

        const [
          devices,
          alarms,
          points,
          inspections,
          firmware,
          plans,
          services,
          qualifications,
          settlements,
        ] = await Promise.all([
          allowed("asset.read", "devices"),
          allowed("alarm.read", "alarms", true),
          allowed("telemetry.read", "points"),

          allowed("inspection.manage", "inspections", true),
          allowed("asset.read", "firmware-tasks"),

          allowed("strategy.read", `plans?date=${today}`),
          allowed("market.read", "market-services", true),
          allowed("market.read", "qualifications"),
          allowed("revenue.read", `settlements?from=${from}&to=${today}`, true),
        ])

        station.deviceInventory = devices.map(
          (row): StationDevice => ({
            id: text(row.id),
            name: text(row.name),
            code: text(row.code),
            group: text(row.category) || "设备",

            status:
              row.communication_status === "online"
                ? "online"
                : row.communication_status === "offline"
                  ? "offline"
                  : "unknown",
            model: text(row.model_name) || "—",
            serial: text(row.serial_number) || "—",

            firmware: text(row.firmware_version) || "—",
            commissionedAt: text(row.commissioned_at),
            updatedAt: text(row.observed_at),
            latencyMs: null,

            primaryPointId: "",
            points: points
              .filter((p) => text(p.device_id) === text(row.id))
              .map((p) => ({
                id: text(p.id),
                label: text(p.name),
                value: null,
                unit: text(p.unit),
                quality: "bad",
              })),

            trend: [],
            operation: [],
            limits: [],
            parameters: [],
            upstream: "—",
            downstream: "—",
            alarms: [],
            versions: [],
            logs: [],
          }),
        )

        // Missing observations remain unknown; do not label every configured device offline.

        if (
          user.permissions.includes("asset.read") &&
          devices.every((d) => d.communication_status != null)
        )
          station.devices = {
            online: devices.filter((d) => d.communication_status === "online")
              .length,
            fault: 0,
            offline: devices.filter((d) => d.communication_status === "offline")
              .length,
            building: 0,
          }
        station.maintenance = {
          ...station.maintenance,

          alarms: alarms.map((row) => ({
            id: text(row.id),
            title: text(row.title),
            device: text(row.device_name),
            severity: row.severity as "critical" | "warning" | "info",
            status: row.recovered_at ? "recovered" : "active",
            occurredAt: text(row.occurred_at),
            recoveredAt: text(row.recovered_at),
            acknowledged: Boolean(row.acknowledged_at),
          })),

          workOrders: orders
            .filter((row) => text(row.station_id) === station.id)
            .map(adaptOrder),

          inspections: inspections.map((row) => ({
            id: text(row.id),
            title: text(row.title),
            dueAt: text(row.due_at),
            status: row.status as "pending" | "completed" | "cancelled",
            owner: text(row.assigned_to),
            completedAt: text(row.completed_at),
          })),

          firmware: firmware.map((row) => ({
            id: text(row.id),
            device: text(row.device_id),
            currentVersion: text(row.current_version) || "—",
            targetVersion: text(row.target_version),
            status:
              row.status as "pending" | "running" | "succeeded" | "failed",
            updatedAt: text(row.updated_at),
          })),
        }

        const minute = (value: unknown) =>
          `${String(Math.floor(Number(value) / 60)).padStart(2, "0")}:${String(Number(value) % 60).padStart(2, "0")}`

        const numberOrNull = (value: unknown) =>
          value == null ? null : Number(value)

        station.operations = {
          ...station.operations,

          plan: ((plans.find((plan) => plan.status === "approved")?.periods ??
            []) as ApiRow[]).map((row) => ({
            id: text(row.id),
            date: today,
            start: minute(row.start_minute),
            end: minute(row.end_minute),
            mode: row.mode as "charge" | "discharge" | "standby",
            power: Number(row.power_kw),
          })),

          marketServices: services
            .filter((row) =>
              ["confirmed", "running", "completed", "cancelled"].includes(
                text(row.status),
              ),
            )
            .map((row) => ({
              id: text(row.id),
              date: text(row.starts_at).slice(0, 10),
              name: text(row.name),
              capacity: Number(row.capacity_kw),
              revenue: numberOrNull(row.estimated_revenue),
              kind: row.kind as MarketKind,
              status:
                row.status === "completed"
                  ? "已完成"
                  : row.status === "cancelled"
                    ? "已取消"
                    : row.status === "running"
                      ? "执行中"
                      : "待执行",
              delivery: [],
            })),

          market: {
            source: "connected",
            prices: [],
            capacity: null,
            qualifications: qualifications.map((row) => ({
              kind: row.kind as MarketKind,
              status:
                row.status as "valid" | "pending" | "expired" | "suspended",
              validUntil: text(row.valid_until),
              reference: text(row.reference),
            })),
          },

          settlement: {
            source: "connected",
            records: settlements.map(adaptSettlement),
          },
        }

        station.alarmHistory = alarms.map((row) => ({
          id: text(row.id),
          title: text(row.title),
          device: text(row.device_name),
          category: "设备",
          location: "",
          severity: row.severity === "critical" ? "critical" : "warning",
          status: row.recovered_at ? "recovered" : "active",
          occurredAt: text(row.occurred_at),
          recoveredAt: text(row.recovered_at) || undefined,
          metric: { name: "未接入指标", unit: "", threshold: NaN },
          samples: [],
          events: [],
        }))

        station.alerts = station.maintenance
          .alarms!.filter((a) => a.status === "active")
          .map((a) => ({
            msg: a.title,
            time: a.occurredAt || "—",
            level: a.severity === "critical" ? "critical" : "warning",
          }))

        return station
      }),
  )
}
