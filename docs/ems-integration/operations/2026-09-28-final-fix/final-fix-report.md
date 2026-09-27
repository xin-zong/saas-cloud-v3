# Final fix wave F1–F5 — implementation and verification

Base: `37f6d08`. Single implementation dispatch; controller owns the one scoped re-review, cloud operations and rollout. No subagents, SSH, deployment mutation, push or main merge performed by this implementation agent. User dirty Header.tsx, OverviewPage.tsx, all-modules-shell.css, all-modules-overview-ui.test.cjs and the two supplied untracked verification documents were preserved.

## Changes

### F1 — legal alarm clearing

`AlarmProjection` now translates the legal wire state `cleared` into `alarm.recovered_at` both when creating a cleared-first business alarm and when updating an active alarm. It never changes manual acknowledgement columns. The impossible `recovered` test input was removed.

`TelemetryProjectionPostgresTest#legalClearedEventsRecoverBusinessWithoutHandlingThem` submits full legal alarm envelopes through WireDecoder, reliable transactional acceptance/ACK outbox, and the business projection. It covers active→cleared and cleared-first. The final version also sets an explicit manual acknowledgement before clearing and checks its exact timestamp survives; cleared-first remains unacknowledged.

### F2 — permanent rejection versus transient transport failure

`MqttIngress.acceptDelivery` returns ACCEPTED, REJECTED or RETRY. Malformed/unsupported decoder input and definitive admission/fence rejection are REJECTED. DB failures, queue overflow and shutdown are RETRY. The old boolean helper remains for existing internal callers/tests.

The actual MQTT callback completes transport acknowledgements for accepted or definitively rejected input; only RETRY throws for persistent-session redelivery. Rejection never enters a queue or creates a saved business ACK. Existing fixed-cardinality diagnostics provide nonsecret bounded categories; raw payloads and exception details are not logged.

`FinalFixTransportLiveCheck` exercises the production worker against an actual isolated broker, Kafka and PostgreSQL, rather than a mock callback: one malformed QoS1 frame, subsequent heartbeat progress, no invalid saved ACK, legal reliable acceptance/ACK, and same-client persistent-session restart without poison redelivery.

### F3 — traffic-independent lease maintenance

A dedicated scheduled executor renews ownership independently of MQTT publications. Interval is min(1 second, one-third lease duration), with a 100 ms lower bound; the default 30-second lease runs every second. GatewayLease scans at most 128 already-owned live rows per call with a fair cursor. Each update obtains the existing per-EMS advisory lock (nonblocking for renewal) and rechecks owner, captured fence, live expiry and active binding. It only changes lease_until, never connection, ingress order, fence or heartbeat. Expired/replaced ownership is never reacquired by renewal.

Shutdown stops the scheduler, rejects new ingress, drains bounded work, and releases only matching owner/fence rows under the EMS lock. The lease authority becomes terminal so later renewal/acquisition cannot revive it. A database outage during release is diagnosed; finite DB lease expiry remains the fail-safe. Cursor UUID sorting is only a batching scan order, never a connection chronology rule.

Controlled PG tests set heartbeat ages to 45 and 91 seconds and move lease expiry around DB current time. They check quiet connection/fence preservation, no fabricated heartbeat freshness, 90-second reachability expiry, expired-owner refusal, takeover and old-owner release isolation. This is simulated time-state evidence. The transport harness separately waits 35 wall-clock seconds without device publications at the default 30-second TTL.

### F4 — cabinet link tri-state and provenance

TelemetryBatch now carries a cabinet-scoped LinkObservation from only `cabinet_30s.d.link`, retaining its Boolean/null online and original Long/null timestamp. No device identity is inferred and cabinet_60s does not manufacture link observations.

New immutable migration `V16__cabinet_link_current.sql` adds a minimal current observation per `(binding_period_id,cabinet_no)`:

- FK period supplies EMS and station provenance, avoiding duplicated ownership columns.
- Cabinet number is constrained to 1–30; online remains nullable Boolean.
- Original source millisecond timestamp is nullable, distinct from original receipt timestamp.
- Ingress generation, positive arbitrary-precision order and arbitrary-precision fence preserve admission/order evidence using existing validated domains.

Persistence runs inside the existing admitted, per-EMS locked telemetry transaction. An older fence/order or a different same-fence ingress generation cannot replace current state. Receipt-time admission prevents an old binding-period envelope from entering the new period. Source clock values do not substitute for ingress ordering.

`database/apply.sql` registers V16 exactly once and grants API SELECT only; worker SELECT/INSERT/UPDATE. No V1–V15 or CH migration changed. Production V16 application is owned by the controller and was not performed here.

The authorized current-period structure endpoint returns cabinetLinks even when structure is unknown. Existing EMS detail content renders last-reported cabinet online/offline/unknown and original source/receipt times separately from heartbeat reachability and structure activation. No CSS or unrelated visual changes. Browser evidence is functional synthetic-fixture coverage, not a claim of a new Figma visual comparison.

### F5 — source/archive identity and explicit aggregation policy

Sample identity now includes point, original binding period, source_time_kind and timestamp. Same-kind retransmissions still collapse and same-kind conflicting values remain evidence. Equal numeric timestamps and values never establish source/archive equivalence.

Each bucket chooses source-kind evidence when any exists, otherwise archive-kind evidence (legacy unknown-kind fallback remains for existing input shape). Selection happens before valid/null filtering, so archive values never replace invalid/null source observations. Returned fields disclose selectedSourceTimeKind, selectionPolicy=`prefer_source_per_bucket_else_archive`, excludedEvidenceCount, evidenceConflict and completeness=`unknown`. Existing conflict refers to selected aggregate evidence; conflicts in excluded archive evidence are retained and disclosed without invalidating an otherwise unambiguous source aggregate. All distinct evidence classes remain in evidence and appear in existing history details.

Unit cases cover equal/different source/archive values at identical timestamps, invalid source with valid archive, archive-only fallback, different original periods, and existing same-kind retransmission/conflict behavior. Actual CH coverage adds both equal and different cross-kind timestamps, while retaining existing exact decimal/FINAL dedup and same-kind conflict checks.

## RED/GREEN record

Maven executable: `D:/projects/ems-cloud-v2.0/ems-cloud-api/.tools/apache-maven-3.9.11/bin/mvn.cmd`, Java21. Commands from repo root used `-Dsurefire.failIfNoSpecifiedTests=false` for selected reactor tests.

- F5 RED: `-q -pl ems-cloud-api -am test -Dtest=EmsTelemetryQueriesTest` → 6 tests, 2 failures: missing selection-kind and cross-period false conflict/null result.
- F4 RED: `-q -pl ems-cloud-ingestion -am test -Dtest=TelemetryDecoderTest,IngressTest` → protocol 12 tests, 1 failure: missing link accessor (downstream worker did not run after reactor failure).
- F2 RED: `-q -pl ems-cloud-ingestion -am test -Dtest=IngressTest` → 7 tests, 1 failure: missing tri-state delivery contract.
- F3 RED: same selected worker command after renewal-contract regression → 8 tests, 1 failure: no traffic-independent renewal method.
- F1 actual PG RED: immutable worker archive `3638bfb9c9a0cb346973b78c03ee2e5f4f50d8cfd4394ecd568c5a887e2965e1`, 1 test/1 failure/0 skips: recovered_at remained null after legal cleared. Also exposed a suppressed fixture cleanup FK error; cleanup now deletes ems_alarm_event before reliable_message. See `final-fix-f1-red.txt`; this was not a pristine RED run.
- Local GREEN: `-q -pl ems-cloud-ingestion,ems-cloud-api -am package -Dtest=TelemetryDecoderTest,IngressTest,EmsTelemetryQueriesTest` → protocol12 + ingress8 + API6, all pass/0 skips. Packages include the current protocol JAR; local tests do not replace actual-service tests.
- UI API helpers: `node --test tests/ems-api.test.cjs` equivalent selected combined run → 6 pass. Initial browser run failed because localhost8443 was not listening, not due to assertions. Launched a temporary local-only Vite8444 and reran with API_PREVIEW_URL; 2 browser fixture tests passed, including tri-state labels and returned history policy. Stopped that temporary server.
- Additional targeted lifecycle checks: StartupLifetimeTest1 and DiagnosticsTest6 passed, 0 skips; EmsTelemetryQueriesTest6 rechecked while compiling the corrected API fixture.
- UI build: `node node_modules/vite/bin/vite.js build` → pass; existing >500 kB bundle warning persists.

## Actual-service checkpoints

The controller holds credentials and controls resource/schema setup and cleanup. Isolated broker18887, finalfix Kafka topics/groups, ems_ingestion_tests PG schema and task8 CH tables are synthetic test resources, not registered hardware.

Copied GREEN checkpoint: worker `d9ddd17b46196bd39eb0593ff220bd96b66565fd9eb7c9c65723c3f5030810ca`; API `246de15f13915e2eeb63b2f29f0fab0ef3cf1455f5688d0d03e9d62e458f3038`.

- Actual F3 controlled PG regression: 1 pass, 0 skip (`final-fix-lease-pg.txt`).
- Actual first worker checkpoint: F1 passed; F4 passed tri-state/order assertions then its synthetic period-close fixture correctly hit the existing child-binding guard. Fixed fixture closes point bindings, device bindings, then period; no production guard changed.
- Actual first API/CH checkpoint: 15/16 pass, 0 skip, including CH. New F4 API fixture hit Java ternary null auto-unboxing before checking API output; test-only boxed Boolean correction subsequently compiled and copied for the final isolated rerun.
- Refreshed actual worker archive `b0f0302564a561137f398e759b322b77afb359215d650a4742b757862dbecf53`: F1 manual-ack preservation and F4 tri-state/old-ingress/old-period tests both pass, 0 skips, 4859 ms (`final-fix-worker-focused.txt`).
- Corrected API archive `e5cd31d6a9d56ee92af157f039481efa71f4c57ad4ae3c15f3bb1cca35634d09`: explicit boxed Boolean fixture; corrected cabinet API test passed, 0 skips, 5120 ms. Together with the prior 15 passed API/CH tests, all 16 have passed against actual services.
- First actual transport run passed invalid-frame diagnosis, no invalid business ACK, subsequent heartbeat through Kafka/PG, and the 35-second wall-clock quiet lease/fence/reachability assertions. It then failed a test-only ACK matcher that searched for an invented `saved` status string; the actual wire success ACK contains type/identity and no error. Controller inspected PG: exactly one reliable_message and saved_ack outbox `sent` with one attempt. Corrected callback now parses the real no-error down/ack contract and separately matches the legal alarm identity/sequence. Production code did not change. Final actual rerun PASS from refreshed test archive `037b2d6e3f6760dae61e8d1ef80db19c7d2f6fd1c007152e0eb5eadd9e7b8927`: invalid QoS1 consumed, valid Kafka/PG progress, no invalid saved ACK, legal durable ACK, persistent-session restart without poison redelivery, observed wall-clock quiet35s live fence, shutdown release. See `final-fix-transport-green.txt`.

## Remaining acceptance and operational limits

No claims about real gateway UUID/site/firmware, authenticated user manual verification, two-site hardware behavior, formal write-control protocols, 24-hour capacity or complete historical sampling. DB-time manipulation is explicitly distinguished from wall-clock quiet observation. Renewal is bounded and prevents silent traffic-cadence expiration, but this wave is not a new measured fleet-capacity benchmark. No activation/merge approval is implied; the controller's scoped re-review, V16 migration review and operational rollout remain separate.

## Final handoff

All five findings are implemented together. Required targeted local checks and actual PG/CH/MQTT/Kafka checks have passed; no conditional skip was counted as an actual pass. The 25 owned source/test/migration/UI files form one scoped commit; report and controller transcripts remain in this ignored SDD workspace. The original four dirty UI files and two untracked user documents remain outside the commit. Source/targets are frozen for the controller's one scoped re-review. No additional broad test run requested or performed.

Owned commit: a49ca1702549dfdb6cfed363afaae6d30365894a (base37f6d08). Commit verification leaves only the exact original user dirty/untracked files.
