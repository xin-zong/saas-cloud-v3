# Task4 MQTT→Kafka worker transport

Status: implementation/build and root-coordinated real server transport check passed. Production admission/deployment and hardware validation remain later-task scope.

## Owned changes and contracts

Independent Java21 Boot worker `ems-cloud-ingestion`, root aggregator module entry, no API/web dependency; protocol Task1 WireDecoder reused without modification. V11 schema unchanged. PG allowlist requires registered gateway and current active binding. Lease is in connection_state, advisory transaction lock uses hashtextextended(ems_uuid::text,78291029), numeric arbitrary-precision fencing increments on expired/new ownership, live renewal retains token. Every arrival and immediately-before-send publication checks current database owner/fence/expiry/binding. UUID epochs are identity only; downstream must check fencing again before domain persistence.

Envelope keeps exact raw UTF8 body/topic, EMS identity, decoded type/channel, canonical hash, immutable arrival timestamp, ingressEpoch, numeric sequence/fence. Protocol message identities remain in exact raw body. Type routing: ordinary EMS/cabinet/cell→fast, structure/current-alarm/heartbeat/status/response→state, important-history/alarm-event/alarm-data→reliable. Three bounded queues, one pump per lane, at most3pending callbacks, producer8MiB buffer,1s max.block,10s delivery timeout, acks=all/idempotence. Close rejects work, clears queues, resolves callbacks false, cancels pumps, closes MQTT/producer. PG runtime/query waits5s, cancel signal2s.

Managed env/files only for credentials. MQTT3.1.1 mTLS with trusted CA/client certificate PKCS8 key, TLS hostname verification, QoS1 persistent session. No business publish/ACK code exists. MQTT PUBACK signifies bounded ingress acceptance; Kafka failure cannot falsely signal persistence. Reliable device business retry continues until later domain actor persists/sends saved ACK; fast telemetry can be lost during failure.

## RED/GREEN evidence

Local Maven3.9.11/Java21; focused `mvn -pl ems-cloud-ingestion -am test`.

- Missing transport behavior: after compilable minimal skeleton,3tests failed assertions,0errors (unregistered/unowned rejection, overflow, stale fence/Kafka failure). Implemented transport path and verified3GREEN. Corrected an initially invalid heartbeat fixture against existing Task1 fixture shape (`v`, `uptimeSeconds`).
- Type-based lane correction: structure/current-alarm test failed expected STATE vs actual FAST; switch on decoded type gave4GREEN.
- Close cancellation: pending completion test failed isDone expected true; explicit pending tracking/resolution gave5GREEN.
- Producer callback bound: fourth pending publish failed immediate-completion assertion; explicit3callback bound gave6GREEN.
- Constructor lifetime self-review: missing managed TLS file test failed because Kafka producer thread remained alive; validate TLS before producer allocation and close MQTT on producer construction failure gave7GREEN. Nullable SQLState retry predicate also corrected without changing retry policy.
- Latest independent `mvn -f ems-cloud-ingestion/pom.xml package` exited0 with7tests,0failures/0errors. Protocol installed once independently; resulting executable jar contains no API dependency.

## Root live verification handoff

Exact fixture/config/server Java21 command in task-4-live.md. Tested archive `ems-cloud-ingestion/target/task4-live.zip` SHA256 `5AAD8B868F3A11AD76D2E3AD7A420D9A86F8B37D600BFE444DDAD750BA3347EC`, no secrets. Root executed server Java21 and reported exit0; inspected downloaded safe evidence `docs/ems-integration/operations/2026-09-28-transport/live-result.txt` ending `TASK4_LIVE_PASS lease_unknown competing_owner stale_fence mqtt_mtls kafka_consumed no_business_ack close`. Standalone TransportLiveCheck verified actual unknown/unbound rejection, competing lease, numeric expiry/stale fence, real mTLS MQTT messages consumed from all3isolated Kafka topics with identity/time/order/raw body and no business ACK. Root owns isolated schema/broker/topics/ACL/groups cleanup and the evidence file; this commit excludes root-owned evidence. Final post-live startup-failure cleanup/null-SQLState edits were locally reverified with7tests, authorized by root, and do not change the passing live success path. Added WARN test Logback configuration avoids verbose standalone future runs.

## Scope and concerns

No production listener deployment, strict ClientID/CN enforcement or actual hardware validation claimed. Task10 owns production listener admission/replacement. Business actors, queries, observations, saved ACKs, ClickHouse and business processing belong to later tasks. PG check and Kafka send cannot be one atomic transaction; downstream authoritative fencing is mandatory. No real station binding or business topic receives test data. Dirty UI files and root-owned deploy/mqtt files are excluded from Task4 commit.

## Fix round1 — transport failure observability (base72dc010)

Review Important identified erased failure outcomes in MQTT admission, Kafka publication and pump waits. Added shared fixed-cardinality LongAdder counters for decoder rejection, admission rejection (registration/current-binding/lease grant denial), database exception, queue overflow, stale fence, producer failure and pump exception/timeout. Accepted arrivals and broker-acknowledged publications have separate success counters; shutdown rejection is benign and does not generate outage warnings. No raw body/topic, identity, throwable or credential is retained by diagnostics.

MQTT/Kafka callbacks only increment bounded reason counters. Existing worker pumps emit aggregate reason/count WARN at most once per30seconds across all three lanes, and only when failures increased. This introduces no scheduler, unbounded queue, event list or callback logging. `IngestionWorker.diagnostics()` returns an immutable snapshot for runtime callers. Failed adapter results retain their specific diagnostic; the pump does not double-count those false results as generic exceptions. Pending timeout is classified as PUMP_FAILURE; interrupted shutdown is not classified as failure.

RED: `mvn -f ems-cloud-ingestion/pom.xml test -q` yielded13tests,6failures,0errors after minimal diagnostics placeholders (all required counters remained0; warning remained absent). GREEN: same module `package -q` exited0 with13tests,0failures/0errors, including six new DiagnosticsTest cases covering decoder/admission vs acceptance/overflow, MQTT PG failure vs decoder error, Kafka PG failure vs producer error, stale fencing/producer error vs publication success, actual pump pending timeout vs completed success, and1000repeated failures coalesced into rate-limited safe warning snapshots. Original7tests still pass. No infrastructure rerun needed for this diagnostics-only fix; root already preserves the actual transport success evidence and owns cleaned temporary resources. Root-owned MQTT prerequisite commit72dc010, deployment files, evidence files, V11 and UI files remain untouched.
