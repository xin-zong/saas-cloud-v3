# API latency implementation and verification plan

> Execute each scoped change with behavioral regression tests and an independent review before release.

Goal: reduce actual cloud API and page loading latency while keeping authorized data, null values, source times, and mutation behavior intact.

Scope: `develop-toyingzhen`, database `ems_cloud_saas_toyingzhen`, independent cloud 18086/18091. No reference platform writes, original database changes, ingestion activation, or production service restart.

- [x] Measure 13 representative public API routes before changes, two serial samples each; save private results. Slow paths: workspace 6.4–9.2s; station21 points 3.8–4.0s.
- [x] Inspect actual PostgreSQL plans and request thread stacks. Confirm repeated sample-quality scans and ClickHouse all-point reads; exclude JIT and network transfer as the principal cause.
- [x] Back up the isolated database with a verified custom dump and restore listing; preserve production process/release baseline.
- [x] Apply guarded V67 index `(point_id,quality)` after migration preview. Recheck original directory SQL with EXPLAIN: approximately16ms, index-only scans, original history type semantics preserved.
- [x] Replace global Reference page hydration with authorized directory loading; stop unrelated full-station telemetry polling. Preserve legacy full hydration mode. Test cancellation, account change, and permission scope changes.
- [x] Share initial day history and identical storage statistics within the current component tree; retain independent period controls and loading/error states. No global result/permission cache.
- [x] Push selected device IDs into SQL before limits; load telemetry only for returned devices. Replace quadratic mapping lookup with a point index, preserving ambiguity.
- [x] Complete native monitor point restriction and fresh batched permission scopes. Include all active mappings of selected points for ambiguity detection; validate permissions again after loading.
- [x] Finish independent review; run TypeScript, targeted frontend behavior tests, API/protocol package, permission and query-scope regressions.
- [x] Build a new frozen release, verify artifact hashes and migration identity, and activate only the independent service.
- [x] Repeat the same public API measurements; compare saved business payloads after excluding server clock fields. Verify unauthorized and out-of-scope access still fail.
- [x] Open deployed dashboard/site/device flows, verify charts and independent storage period controls, and retain the page for the user.

Evidence lives in ignored `.local-tools/implementation/perf-*` and per-release build output. Report measured route timings separately from SQL execution timings and mocked request budgets; do not claim load-test percentiles from two samples.


Verification results (2026-10-20):

- Released `toyingzhen-20261020-r5`, source SHA256 `0a0c31713c2f9ee575a863332137a75ee6cb9c51e01676cffa934404bb61c094`. Final source fingerprint matches frozen bundle. Dedicated runtime/migration67/hash checks and production baseline passed after activation.
- Same 13 public routes measured twice before/after, all200. Workspace6.41–9.16s→0.56–1.16s; station21points3.76–4.02s→0.53–0.79s. These are small serial observations including public transfer, not load-test percentiles.
- Device list identity-encoding remains1.34–1.62s in the serial benchmark; separate normal gzip measurement was0.91s/44.8KB versus uncompressed641.7KB. Server-only loopback0.62–0.77s. Gzip was already enabled; do not attribute this compression ratio to a newly implemented change.
- Six saved business payloads are exactly equal before/after except serverTime. Three unauthenticated endpoints401 and viewer export403 rechecked. Original timestamps/null/zero fields retained.
- Root TypeScript check and34 targeted frontend tests passed; delegated82 related frontend checks and45 backend targeted checks passed (overlapping suites are not added as independent coverage). Frozen package: API525 total,364 executed passed,161 environment-gated integration checks skipped; protocol26 passed; deployment tooling tests andVite build passed. Existing large frontend chunk warning remains.
- Independent review found and fixed the cross-source mapping ambiguity case: choose target point IDs, then preserve all their current mappings; duplicate mappings still prevent a valid monitored value. No permission allow-cache introduced. Active-user/client/expiry and post-load revocation checks remain authoritative.
- Actual cloud browser: login, station list, Xinjiang storage history and both statistical cards loaded; changing efficiency to month left utilization atweek, then restoredweek. Inverter7rows and battery-cluster8rows displayed with unchanged known/missing fields and no page alerts. Browser evidence: perf-r5-ui-private.json. Page retained for the user.
- Isolated DB backup beforeV67: verified custom dump and pg_restore listing. Only additive index and migration metadata changed; no source records rewritten, no ClickHouse changes, no ingestion activation. Original production release/PID/start-time baseline unchanged.
