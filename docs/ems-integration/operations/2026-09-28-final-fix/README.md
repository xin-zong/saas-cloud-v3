# EMS final-fix verification checkpoint

Implementation: `a49ca1702549dfdb6cfed363afaae6d30365894a`, on `codex/ems-device-integration`. This checkpoint is **not deployment approval or full integration acceptance**.

The five original review findings were addressed in one fix wave. Actual isolated PostgreSQL, ClickHouse, MQTT and Kafka checks cover alarm clearing without changing manual acknowledgement, cabinet true/false/null provenance, source/archive aggregation evidence, permanent invalid MQTT input, persistent-session restart, and 35 wall-clock seconds of quiet lease continuity. The API/CH evidence is 15 passing cases plus a separately corrected and passing cabinet case, not a newly executed green full suite. Earlier fixture and ACK-matcher mistakes are documented in the implementation report.

The one scoped re-review found two Important residual issues:

1. V16 rejects negative link timestamps accepted by the decoder, which can permanently retry a fast-lane record. Align the accepted contract and persistence, and verify offset progress with a following valid frame.
2. The history chart type helper still considers excluded archive evidence, which can hide a selected numeric source value. Apply the returned selection kind before type selection and cover mixed evidence.

Both are real deployment blockers for the affected worker/API/UI rollout. The controller retained the branch and surfaced these issues under the SDD final-review cap; no second fix wave or code activation has occurred. V16 remains undeployed. Uploaded a49ca17 artifacts are inactive and must not be activated without resolving these findings.

After verification, the isolated PG schema is empty, the temporary broker on 18887 is stopped, and the three finalfix Kafka topics/exact ACLs/used consumer group and five Task8 ClickHouse objects/grants were removed. The old 1883/8883 listeners and 8883 configuration checksum are unchanged. Production PG remains V15 with 2 stations, 26 devices, 258 points, 30 alarms and zero EMS registrations. Production typed CH tables remain empty; legacy measurement count remains 3,559,514. The existing API preview health is UP. Dedicated production 8884, permanent API and worker remain inactive.

Local Vite is restored at http://127.0.0.1:8443 with the existing SSH API forward. Authenticated user acceptance, genuine gateway/site/firmware facts, formal write-control contract and measured hardware/24-hour observation remain outstanding. Synthetic fixtures are not real-device evidence. No push or main merge was performed; the user's unrelated local changes remain preserved.
