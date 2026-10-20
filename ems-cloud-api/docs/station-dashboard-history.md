# Station dashboard history capture contract

`GET /api/stations/{station}/dashboard-history?period=day&date=2026-01-01`
uses the existing ApiResponse envelope. Its data contains `available`, `period`,
`date`, `timezone`, `source: "reference-capture"`, `capturedAt`, and raw `payload`.
Both `asset.read` and `telemetry.read` are mandatory. Archived stations return 404.
Missing exact captures return `available: false`, `capturedAt: null`, `payload: null`;
no device, monitor-list, global-dashboard, or mock fallback is applied.

Dates are strict day `YYYY-MM-DD`, month `YYYY-MM`, year `YYYY`, total `YYYY:YYYY`.
Total ranges contain at most 31 years; dates start at 1970 and cannot start in the
future. Latest exact station/period/date capture wins, with capture ID as tie-breaker.
Capture timezone is the explicitly verified source timezone; missing captures use
station profile timezone, which may itself be null.

Run `ems-cloud-api/scripts/import-reference-station-history.py --input PRIVATE.json`
for a local-only preview. `--apply` explicitly writes only to the isolated database
with branch, database, owner, source mapping, and archived station guards. No HTTP
requests are made. Do not commit private capture JSON. The importer module docstring
describes the envelope. `payload` must be the response data object, not its transport
envelope. SHA-256 covers the exact entire input bytes; duplicate JSON keys and
non-finite numbers are rejected. V63 retains append-only captures, including their
source identity, period key, timezone, timestamp, endpoint and evidence hash.

Day response requires `stationStatisticPowerList` and `stationStatisticDay`;
month requires `stationStatisticDayDtoList` and `stationStatisticMonthDto`;
year requires `stationStatisticMonthDtoList` and `stationStatisticYearDto`;
total requires `stationStatisticYearDtoList`, `stationStatisticTotalDto`, and
`stationTotalActual`. Summary DTOs are objects; `stationTotalActual` retains its
original JSON type because its type has not yet been independently confirmed.
Day rows require epoch-second `dateTime` within the explicit date and no later
than capture time. Aggregate row date fields/units have not been independently
verified; they are not inferred or converted. No unit conversion or interpolation
occurs. Captures must be reviewed before applying; preview validates input without
connecting to a database, and therefore cannot verify the live station mapping.

V63 must be reviewed and applied by the guarded migration workflow before this
endpoint is used. This implementation does not apply migrations or restart services.
