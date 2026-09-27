# Task4 actual transport verification

Server Java21 ran `TransportLiveCheck` against PostgreSQL `ems_cloud_v2_proto` in the isolated `ems_ingestion_tests` schema, loopback mTLS MQTT port18885, and three temporary Kafka topics `ems-cloud-v3.test.task4-20260928.{fast,state,reliable}.v1`.

The archive SHA256 was `5aad8b868f3a11ad76d2e3ad7a420d9a86f8b37d600bfe444ddad750ba3347ec`. Exit code was 0; `live-result.txt` ends with `TASK4_LIVE_PASS`. Checks covered registered/active binding admission, competing lease rejection, expired numeric fencing, real messages in all three lanes, envelope identity/timing/raw content, and absence of a business saved ACK.

The public business schema and production ingress topics received no fixtures. The final local constructor-failure cleanup and null-SQLState handling changes were subsequently tested locally; this log identifies the exact earlier runtime artifact, not an unsupported final-artifact claim. Task4 independent review remains the completion gate.
