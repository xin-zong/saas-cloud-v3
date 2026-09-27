# Typed facts and projection verification

Implementation: `938e3d1`. Independent task review approved; no Critical/Important findings.

- Actual PostgreSQL: 5 tests, 0 failures/errors/skips (61.08 seconds).
- Server Java21 harness: actual PG/Kafka/ClickHouse failure/recovery, exact bitmap/null, FINAL replay deduplication and current-layout nullable cells passed. FAST offsets stayed pending until ClickHouse succeeded. See `live-result.txt` and frozen archive identity in `verification-candidate.json`.
- CH constraints were tested first in isolated tables. Initial complex OR constraint exceeded CH24.8 CNF expansion; independent slot constraints fixed this. Final production DDL SHA is in `ch-production.json`.
- V13 PostgreSQL runner/grants passed a ROLLBACK rehearsal, then applied twice successfully. Public data remains 2 stations, 26 devices, 258 points, 0 registered real EMS gateways. Worker-only diagnostic/demand grants and API denial verified.
- ClickHouse V2 applied twice in `ems_cloud_v2_proto_telemetry`; existing prototype `measurement_sample` was preserved. Dedicated local writer has INSERT only on the two new fact tables, with server-managed credentials.
- Temporary Kafka topic/group/ACL, CH test tables/grants, PG fixtures and server harness archives were cleaned. Production Kafka topics were retained.

The worker service is not yet deployed; Task7 state/query handlers and Task8 APIs remain. Simulated protocol verification does not establish real EMS compatibility. `pre-v13-backup.json` verifies backup archive listing, not a full restore drill.
