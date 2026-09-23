# EMS backend implementation plan

**Goal:** Implement the approved prototype modules with a normalized PostgreSQL system of record and ClickHouse telemetry.
**Spec:** docs/design/backend-scope.md
**Architecture:** Java 21 modular monolith, selectively adapted RuoYi-Vue-Plus v5.6.2 foundations, Spring Boot 3.5.15, Sa-Token 1.45.0, JDBC and versioned migrations. Existing React UI retained.

## Global constraints

- Only NEW databases `ems_cloud_v2_proto` and `ems_cloud_v2_proto_telemetry`; never modify legacy databases.
- No credentials in source, documentation or committed files.
- Third normal form, real FK/unique/not-null/check constraints, no unnecessary fields.
- No EMS integration, new-station onboarding, device execution, payments or real market submission.
- Unknown measurements stay unknown. Permissions enforced server-side on every station-related operation.

## Tasks

- [ ] 1. Database: migrations in `src/main/resources/db/migration`, CH DDL in `database/clickhouse`, constraint regression SQL in `database/tests`. Verify empty new databases first. Run regression tests against new databases before/after migration; FK, duplicate code, negative capacity and overlapping time ranges must be rejected.
- [ ] 2. Foundation: `pom.xml`, `src/main/java/com/enerlution/ems/common`, `auth`, configuration and tests. API envelope `{code,msg,data}`; `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`; public user has string id/name/account/role/organization/stationIds/permissions. Hash passwords, deny disabled accounts and invalid credentials; revoke logout; persist scope in relational grants. Write tests before auth behavior.
- [ ] 3. Assets/maintenance: authorized station/device/point queries; alarm acknowledgement; work-order/inspection lifecycle and typed approval relationships. Persist state and audit in one transaction; test unauthorized stations, invalid transitions, concurrency and rollback.
- [ ] 4. Operations: tariff intervals, plan versions and periods, market records, settlement lines and reviews. Test overlap and capacity limits, positive/negative monetary adjustments, currencies, date boundaries and missing telemetry.
- [ ] 5. Telemetry/reports/settings: deduplicated history with time bounds and point authorization, report export and preference persistence. Never derive settlement energy from estimated telemetry without labelling it.
- [ ] 6. Frontend integration: API client, async authentication, server station data, persistence for prototype actions; explicit demo mode only. Typecheck/build, existing business tests and API-mode browser checks.
- [ ] 7. Review and delivery: independent code review, real new-database integration tests, migration replay, credential scan, startup/readme and accurate capability inventory.

## Execution decisions

- Current API folder is newly initialized on `feat/ems-backend`; there was no existing git history or checkout to isolate.
- Database/schema work and remote verification are owned by primary agent. Foundation implementation may run as an independent subtask with exact schema/API contracts, following subagent-driven-development.
- Keep PostgreSQL local-only. Create a dedicated runtime role limited to the new database. Administrative migration occurs through SSH. Do not change postgres peer authentication or external port exposure.
- Keep runtime secrets in a root-controlled server file outside source; local integration configuration is ignored and credentials are never echoed.
- Upstream is pinned to commit `8136a0191a2258c0e1b36a8146a1c5ebc070c139`. Copy only needed foundation code with provenance; do not import the upstream schema or distributed/tenant stack.
