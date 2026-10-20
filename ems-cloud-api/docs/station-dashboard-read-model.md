# Station dashboard dataset v1

`GET /api/stations/{station}/dashboard-view?substationId=<optional UUID>` returns a typed page model in the normal `ApiResponse.data` wrapper. This batch configures station 21 (新疆261机柜) only. Other stations return `configured:false`, canonical identity, actual equipment and authorized alarm data; they do not inherit this station's modules or mock measurements.

V51 creates `station_dashboard_read_model`; it contains no seed and refuses any database/role other than `ems_cloud_saas_toyingzhen` / `ems_toyingzhen_owner`. `database/seed_station_dashboard_v1.py --apply` uses the ignored local guarded connection helper, resolves the existing station uniquely, and inserts immutable dataset `station-dashboard-xinjiang261-v1` version 1. Replaying is a no-op; conflicting payloads require a new reviewed version. `--rollback` deletes only this exact dataset version. Keep V51 schema and canonical records. Run with the explicit installed Python runtime and psycopg, never against old databases.

The mock identity/date/capacity, menus/scenes, states and metric values are read from JSONB and decoded into Java records. The database stores a fixed source time, `2026-10-18T23:30:00+08:00`; refreshing never advances it. `datasetId`, `datasetVersion`, `mocked` and metric `status` retain provenance. These values are not collected telemetry and never enter real measurement or alarm detection tables.

| JSONB → API field | Meaning |
| --- | --- |
| `sourceTime` | Fixed screenshot sample time, requires telemetry permission |
| `modules`, `scenes` | Verified station-specific page configuration |
| `communicationState`, `alarmState`, `batteryState` | Separate online / normal / discharging mock states |
| `panels[].metrics[].value` | Numeric values, including zero; unknowns remain null |
| `flow` | grid 0.5, load 1.3, PCS 0.8, MPPT 0, battery 1.4 kW |
| battery panel | SOC 93%, SOH 97.5%, power 1.4kW, daily charge/discharge 34/35kWh, capacity 261kWh, available charge/discharge 18.7/242.5kWh |

`asset.read` is mandatory before any database read. Without `telemetry.read`, panels are empty, flow/sourceTime/communication/operating/battery state are null. Without `alarm.read`, alarm state and total are null, alarm items empty. Both granted permissions are rechecked before returning. Unknown/foreign/archived child IDs are rejected; child scopes never reuse whole-station energy values.

Equipment matrix cells come from unarchived canonical devices and current database observations, grouped by the existing DeviceDetailRules canonical type and status. Observations outside the existing 90-second freshness window are unknown. Unrecognized type/category maps to the existing `other` key. Without telemetry permission, every equipment status is `unknown` while asset counts and device IDs remain visible. Alarm data is the five most recent actual active rule alarms, with total, filtered by effective station ownership and optional child membership; reading creates no receipt or acknowledgment.

Verification: seven Java tests cover asset denial before DB access, telemetry/alarm redaction, zero vs null and fixed source time, foreign child rejection, permission revocation, fresh equipment status redaction, and canonical type/category fallback. Live guarded transaction checks replayed the seed twice (one row), tested rollback with a savepoint, and compared full-row hashes/counts for station, station_profile, device, measurement_point, reference_device_sample, device_observation and alarm before/after. All unchanged, including 3,683 original samples. Private verification report: `.local-tools/implementation/dashboard-v51-verification.json`. Pre-migration backup: `/var/lib/postgresql/ems_cloud_saas_toyingzhen-pre-v51-dashboard-20261018.dump`.

Limits: this batch has no invented equipment statuses/counts or alarms, no image asset, no PV station dataset, no unverified curve/history or child aggregation. Only fields evidenced by the supplied fixture are populated; missing daily grid/load energy stays null. HTTP/UI acceptance remains a separate check after the isolated API is restarted.
