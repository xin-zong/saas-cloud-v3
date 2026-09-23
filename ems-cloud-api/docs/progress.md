# Implementation progress

2026-09-23. Approved scope: docs/design/backend-scope.md. User specifically requires NEW databases only.

- New PostgreSQL ems_cloud_v2_proto and ClickHouse ems_cloud_v2_proto_telemetry created through SSH. Legacy schemas only inspected, never written. Runtime users ems_proto_app / ems_proto_reader; secrets only /etc/ems-cloud-v2-proto/*.env (0600).
- PostgreSQL migrations V1–V5 applied; replay and constraint tests passed. 40 business tables + schema_migration. ClickHouse measurement_sample created; empty after exact test-row cleanup. Final server check confirmed migration versions 1–5, zero temporary reviewer roles and zero telemetry rows.
- Backend foundation uses selective RuoYi v5.6.2 conventions/dependencies, no full upstream schema. Final Maven package passed with 32 tests, zero failures/errors.
- Real API integration: 47 checks passed including final export permission/market-capacity fixes. Coverage: grant isolation, auth/logout, workorder states, concurrent plan versions, inspection completion, tariff overlap/nulls, member creation/disable/scope, settlement read and revenue export.
- Separate privileged integration passed: actual approval permission still cannot self-approve; independent approval succeeds and cannot be decided twice; adjacent market commitments use simultaneous peak capacity; power reduction below commitments is rejected. Internal cancellation produces withdrawn state. Temporary reviewer grants removed.
- Real CH test: revisions deduplicate before average (10->12 plus20 gives16/count2). Test interval inspected empty before insertion; exact inserted point/time window deleted afterwards.
- Real Edge browser: logged in using private prototype credentials, saw only granted station, refreshed authenticated session, no page errors.
- Frontend final verification: 47 tests, tsc and production build passed; existing layouts retained. Strategy draft/version/internal submission, tariff effective periods and inspection completion connected. Browser contract tests use intercepted responses; do not confuse them with real DB tests. Current detailed inventory: docs/frontend-report.md.
- Review found and fixed old-DB guard, missing-param status, null period validation, completed-inspection NULL, audit visibility, future payments, operations report permission, multiline CSV formula escaping, market concurrency peak and asset power market commitments. Reviewer rechecked fixes without remaining blockers within reviewed scope. Final read queries suppress future alarms/recovery and stale health; stale communication is offline after 15 minutes. Production bundle remains large (about 8.9 MB uncompressed JS).

Local preview uses native SSH tunnels 15434->5432 and18125->18123, API18090, Vite8443. Runtime currently local Java21; server has Java17. No cloud API service installed, no old service restarted, no network exposure changed.

## Page completion and local startup — verified 2026-09-23

The previously listed page gaps are now connected within the agreed existing-station management scope: approval decisions/todos; scoped customers, child organizations, member placement/enablement/grants/role-permission display and own audit; measurement history/downloads and server report export; settlement pagination/currencies/balances/reviews; market internal drafts; inspection creation/cancellation and alarm-linked workorders; follow-up notes and recorded device topology. Full inventory and boundaries: page-completion-audit.md and the three follow-up reports.

- Final backend package: 34 JUnit tests, zero failures/errors.
- Frontend: 57-test combined suite passed serially; 3 additional pagination/navigation/settlement tests passed (60 distinct tests). A final targeted six-test rerun covered the changed paginated pages. TypeScript and production build passed. The first concurrent browser run timed out during navigation under combined load; serial execution passed. Bundle-size warning remains (~8.76 MB JS).
- Final real API integration: 78 checks passed, including member moves into child organizations, out-of-scope rejection, notes persistence, inspection cancellation state and assignee enforcement, pagination and new-database reads/writes.
- Separate privileged checks passed: enriched approval identity fields, self-review denial, independent decision, terminal-state conflict, approval/market pagination, peak capacity and asset capacity guard. Temporary reviewer grants removed by the wrapper.
- Real PostgreSQL settlement pagination fixture returned distinct pages and a terminal empty page; its two records and contract were deleted in finally. No legacy DB writes.
- Real Edge UI passed login, authorized station isolation, ClickHouse empty query, CSV report download, scoped customer page, recorded topology, session restore and no browser runtime errors. Screenshots inspected. Tests use real API/new DBs; separate mocked browser tests cover write payloads and error states.
- Local API is running on 127.0.0.1:18090 (GET /api/health returns UP); frontend serves HTTP 200 on 127.0.0.1:8443. Native SSH tunnels retain ports 15434 and 18125. No cloud deployment or changes to old services.

Execution boundaries remain unchanged: internal plans do not execute devices; market drafts do not submit transactions; no payment or firmware execution. Missing telemetry remains unknown. Role permissions are not automatically broadened; audit visibility is actor-only. All runtime credentials stay outside source.
