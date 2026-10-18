# Unified device telemetry business chain implementation plan

> Execute in the current isolated worktree with subagent-driven-development and final review.

**Goal:** Existing real device samples use canonical measurement points and the same station, device, history, analysis and alarm workflows as native stations.

**Architecture:** Add an immutable station-bound mapping from existing reference point IDs to measurement_point IDs. A PostgreSQL adapter returns the same typed observation/history shapes as EMS, with original source/receipt times and explicit stale quality. Do not fabricate EMS protocol bindings or write shared ClickHouse. Numeric/text/missing observations remain lossless. Semantic mappings use only verified device fields; ambiguous fields remain ordinary searchable points, not energy flow inputs.

- [x] Add V42 guarded canonical point mapping, exact reviewed semantic mappings, PostgreSQL adapter and tests. Backup new DB before applying migration.
- [x] Connect StationTelemetryService, point history/observations, analysis point directory, and AlarmSampleReader to adapter. Preserve station permissions and source-age/recovery guards.
- [x] Connect energy flow and device/history UI to unified observations. Show last actual values plus timestamps/staleness, no synthetic interpolation. Preserve native station behavior.
- [x] Verify canonical mapping counts and actual rows against source records, endpoints/permissions, historical alarm trigger/recovery in rolled-back tests, and real browser pages. Document remaining genuine data gaps.

Rules: only develop-toyingzhen and ems_cloud_saas_toyingzhen; no reference writes, no production service restarts. No fake samples in business tables. No current alarm from historical readings. Simulation clock only internal tests, never an HTTP parameter.
