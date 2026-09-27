# EMS API integration verification

These are isolated synthetic integration tests on the managed PostgreSQL and ClickHouse services, not evidence of a real EMS connection. No production EMS binding was created.

## Verified checkpoints

| Check | Result |
|---|---|
| Expanded API authorization, transfer, snapshots, pagination and cell scope | 13 passed, 0 skipped/failed, 18.839 seconds |
| Typed PostgreSQL/ClickHouse checkpoint | 1 passed, 0 skipped/failed, 6.365 seconds |
| Final typed scenario including latest invalid/null historical `last` | 1 passed, 0 skipped/failed, 6.716 seconds |
| Automatic business alarm projection | 3 passed, 0 skipped/failed, 5.055 seconds |
| Affected telemetry persistence regression against V15 | 5 passed, 0 skipped/failed, 11.655 seconds |
| V15 actual migration runner, safe grants and privileged helper | Passed in a rolled-back transaction; production not upgraded by this rehearsal |

The API13/initial typed checkpoint archive SHA-256 is `ae1b3aa951b915a78877d8454ee1662892ff1ec1f2b0e999d9accab6a23768f4`. The final typed archive is `f2d78978af72750f21ef11d61d54b1eb935714d7bfc233228317228af0048675`. Controller and migration code did not change between those checkpoints; the final change preserves the latest invalid/null sample for historical `last`.

Candidate V15 SHA-256: `7fe1ae5005ba8c54f16708f83f36e78ec7a881f2437dd7dafa9cbd4d95974821`. The rehearsal verifies safe-view reads, denied raw API access, denied worker asset writes, restricted helper execution, pinned search path and rejection of invalid binding periods.

## Review fix 1

Independent review identified prior-connection cell frames being labeled current after a same-revision reconnect, plus final-page alarm pagination reporting more results. Actual regression tests first failed the relevant assertions (one each, no setup errors/skips), then the frozen fix passed:

- API: 14 passed, 20.244 seconds.
- Actual PG/CH reconnect scenario: 1 passed, 6.920 seconds; old connection known, reconnect unknown, legacy null-provenance unknown, new connection frame known.
- Affected ingestion persistence: 5 passed, 11.278 seconds, including the exact admitted connection UUID written by the consumer.

API archive SHA-256: `374e899908cf5e0c670fa7ccf68a2641f7601fbfd21bb0fb72968d8d5a567f15`; worker archive: `0235befc93664c649f08b85dd158d04c93c1bda13174c549c4da700daa1fc126`. All actual tests reported zero failures/skips. Local TypedFact regression separately observed the absent-UUID assertion fail, then five passes.

New ClickHouse V3 adds nullable connection provenance and refreshes the cell view; V1/V2 remain unchanged. Only the isolated `task8_cell` equivalent was upgraded for these tests. Production V3 must precede deployment of the new worker/API. The admission connection comes from validated structure/heartbeat state; the cell wire payload itself has no invented connection field.

## Reviewed rollout

Implementation `379e9b5`, fix `7624829`: independent task review and scoped fix review completed with all findings addressed. Production ClickHouse V3 and PostgreSQL V15 were each applied twice successfully. Counts remained unchanged: 2 stations, 26 devices, 258 points, 30 business alarms, 0 registered EMS gateways; typed observation/cell tables remain empty and 3,559,514 legacy measurement rows are preserved. The recorded privilege checks pass.

The five exact Task8 ClickHouse test tables/views and their test grants were removed after review; the PostgreSQL test schema is empty. Managed audit artifacts remain on the server. Worker/API deployment and real EMS acceptance are subsequent tasks, not claimed by these migration results.

PostgreSQL fixtures use `ems_ingestion_tests` under `ems_ingestion_test`; API/alarm tests roll back. The separately migrated telemetry regression schema was checked for its exact test station/gateway population and cleared afterward. ClickHouse fixtures use only `task8_observation`/`task8_cell` and their views, with unique point and fact IDs. Cleanup follows the task review.

The pre-V15 backup metadata records a checked archive catalog, not a full restore exercise. The local suite's environment-gated skips are not counted as database passes. Earlier dependency packaging and SSH return-channel failures are described in the implementation report; successful results use persisted server transcripts and receipts.
Repository transcripts normalize trailing whitespace and terminal blank lines; the original managed server logs remain unchanged.
