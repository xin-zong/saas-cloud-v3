# EMS cloud deployment — 2026-09-28

The user explicitly authorized continuing the two residual corrections and deployment. Both residuals are closed in `96df15d`; bounded review is included here. Deployment compatibility changes are `a8330f8` and `4390ae5`. No push or main merge was performed; unrelated user edits remain untouched.

## Running release

`/opt/ems-cloud-v3/current` selects `/opt/ems-cloud-v3/releases/ems-4390ae5`.

| Artifact | SHA256 |
|---|---|
| API | `282c6bbf83edfa65d5c541588f7114497b9fd7e10d84f82d1712efa39c22d72a` |
| Worker | `d8bff9f66df58602fd0dd7d4db90a29d1b935b88f330da5e6d468a817baefe4e` |
| Identity plugin | `78c6b8933dfd8acbdd06edc91cbb04fb955a14de88a5b136d06a92d4f9b43187` |

Both Java archives were force-packaged and their embedded protocol JAR bytes independently matched the current protocol artifact. Normal incremental packaging had left an old protocol dependency inside the API archive; that candidate was replaced before the final deployment. Earlier staging directories remain inactive evidence, not rollback recommendations.

The dedicated MQTT8884, ingestion worker and API services are running and enabled. API binds only127.0.0.1:18090; health returnsUP, both8443 CORS origins match, and unauthenticated station access returns401. Worker managed PostgreSQL and ClickHouse connections passed. Both Kafka consumer groups areStable with one member; service restart counters were0 at the recorded snapshot. This is short operational observation, not a24-hour capacity claim.

Ruling: enable the permanent API alongside the worker/broker after the technical service, database, authentication-boundary and CORS checks, so a reboot retains the deployed endpoint. Authenticated human/browser acceptance remains explicitly pending; enabling the unit does not certify that acceptance. This supersedes the earlier preparation guide's enable-after-manual-acceptance sequencing only.

## Database and isolation

The new business database `ems_cloud_v2_proto` was backed up on the server before V16. The backup catalog was verified; a full restore was not performed. V16 and its grants passed a transaction/rollback rehearsal, then the normal migration runner applied it. API link-table privileges are SELECT only; worker SELECT/INSERT/UPDATE, noDELETE.

After deployment:2stations,26devices,258points,30alarms,0EMS gateways and0cabinet links. New typed CH facts remain0; the legacy measurement table remains3,559,514rows. Old1883/8883 listener PIDs and old8883 configuration SHA are unchanged. Test PG schema is empty; prior temporary Kafka/CH resources were removed. Broker probes used explicit disposable certificate identity/ACL without registration or a running worker; cloud-only ACL was restored before worker start. The temporary negative-CN private key/certificate were deleted on the server.

## Verified corrections and broker limits

- Negative cabinet-link timestamps now become diagnosed, definitive invalid input. ActualPG test proves no database retry failure or fact write for that frame and successful processing of the following valid frame. This checks the consumer's offset-commit disposition, not a new actualKafka offset test.
- The history chart selects types from the chosen source-time kind; excluded archive null/text cannot suppress a selected numeric source value. Protocol13tests, UIhelper7tests, actualPG1test and UIbuild passed. Earlier actualMQTT/Kafka/PG evidence remains in the final-fix checkpoint.
- All13 controlled broker checks passed: mTLS, CN/originalClientID identity, MQTT3.1.1-only, username spoofing isolation, channel permissions, payload131072/131073 and complete packet147456/147457 boundaries. External TCP8884 was reachable from the workstation; certificate/hostname and authenticated handshake checks used server-side public-IP routing. No external real-device handshake is claimed.
- Mosquitto2.0.18 counts incoming remaining_length+1, excluding the3Remaining-Length bytes at this boundary; configured147453 therefore enforces the approved147456-byte full packet ceiling. The preflight pins the measured version and accepts its actual help exit3 only with the exact version banner. [Version-specific primary source](https://raw.githubusercontent.com/eclipse-mosquitto/mosquitto/v2.0.18/lib/packet_mosq.c).
- The initial giantCONNECT test was invalid for this purpose because that broker separately caps CONNECT remaining length at100000. The final harness uses normal CONNECT then a PUBLISH with a legal-sized payload and a long forbidden topic. Its transportPUBACK measures packet acceptance, not ACL delivery or a business savedACK.

## Still required for full acceptance

Genuine EMS UUID-to-site/device mapping, firmware and certificate capability, formal control-write contract, authenticated browser review, two-site hardware/reconnect/backfill/query evidence and measured24-hour operation are not supplied/completed. No synthetic UUID was registered. Control writes without an agreed contract remain unavailable rather than simulating success. The whole goal is therefore not complete.

Local preview is http://127.0.0.1:8443 via a local SSH API forward. It is a development process, not an installed cloud frontend service. User login was requested without asking for their password; no credential reset or session fabrication occurred. Browser automation could not read the existing tab because its tool timed out, so it supplies no new authenticated UI evidence.

Evidence text files normalize trailing whitespace for readability; source logs and receipts remain in the plan workspace/server. No credentials or private keys are included.
