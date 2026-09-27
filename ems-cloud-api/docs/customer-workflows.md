# Customer profiles and station association API

All API routes have `/api` prefix and normal `{code,msg,data}` envelope.

- GET `/platform/customers`: requires `customer.read`; data array of `{id,name,organization_id,organization_name,entity,contact,station_count,stations:[{id,name,code}],can_edit}`. Counts/station identities include only `customer.read` scoped stations. Zero-station customers are visible within organization branches of active station-bearing `customer.read` grants. Technical station data still requires `asset.read`.
- GET `/platform/customers/create-options`: requires `customer.manage`; `{organizations:[{id,name}]}` within branches of active station-bearing customer management grants.
- POST `/platform/customers`: `{name,organizationId,entity?,contact?}`; returns persisted customer `{id,name,organization_id,entity,contact}`. Name required, trim max160, globally unique. Owner required, immutable through profile update. Entity max160; contact max254; trim, blank/null means database NULL.
- PUT `/platform/customers/{id}`: any of `{name?,entity?,contact?}`; omitted fields retained; explicit null name invalid, null/blank profile cleared. Existing name-only callers compatible. Returns persisted row. Unknown fields rejected. Edit requires owner organization and every linked station under corresponding active management grant's station list AND organization branch.
- GET `/platform/customers/options?stationId=N`: requires station `asset.read`. `{can_assign,customers:[{id,name}],current_customer:{id,name}|null,current_customer_restricted}`. Candidates are only fully manageable customers whose owner contains station organization. Assignment requires station asset.read+asset.edit and customer.manage inside management org branch; both old/new customer full governance checked. Asset-only reader sees neither restricted customer name nor identifier through this options API.
- PUT `/stations/{id}`: existing fields plus optional `customerId`; omission preserves association, explicit null clears, positive integral ID assigns. Same-ID submission still requires association authority. Normal station GET/PUT continue returning station row including `customer_id`. Editing unrelated station fields needs no customer permission when customerId omitted.

Permission codes/scope/availability unchanged. No new seeded permissions, no effective_permission view changes. A zero-station customer is supported; an actor with no active customer station capability does not gain new permission.

Verification: full PostgreSQL + unit suite succeeded; focused whitespace regression RED/GREEN verified. Root executes rollback PostgreSQL tests using outside-repository secret handling and empty ems_permission_tests schema. No production data mutation by backend agent.

## Migration and persistence

V10 is registered in the existing `database/apply.sql` versioned transactional runner (Flyway remains disabled). Previous migrations are unchanged. Customer owner is a required organization FK; customer name retains global uniqueness and gains trimmed/nonblank checks; entity/contact are nullable bounded text with trimmed/nonblank checks. The existing station.customer_id FK remains the association.

Legacy ownership is derived only when every associated station has the same non-null organization. Zero-station, mixed-organization and null-organization legacy customers cause V10 to fail, requiring explicit reconciliation rather than a guessed owner. No customer rows are fabricated.

Database triggers reject station/customer organization changes and hierarchy reparenting that would place an associated station outside its customer owner branch. These use the existing governance advisory lock 78291001. API create/edit/association changes use the same lock, retain permission checks after locking, and audit create/edit profile before/after and binding before/after IDs.

Manage-only actors can create or edit authorized profiles and obtain minimal association choices; customer directory GET still requires customer.read. The frontend should gate its normal customer workflow on read plus manage and surface server denial honestly. Standalone visibility does not make stationless grants effective: expired grants, zero-station grants, role labels and unrelated organization branches confer no extra access.

Customer list queries are bounded: one scoped profile query, one manageable-ID query, and one scoped station identity query. The options query computes manageable IDs once and restricts customer candidates using the station organization's ancestor chain. No per-customer authorization SQL loop or cross-request authorization cache remains.

## Verification

On Java21 with the real PostgreSQL rollback schema `ems_permission_tests`, `mvnw.ps1 test` completed with110 tests, zero failures/errors and one skipped opt-in role-directory diagnostic (`EMS_ROLE_DIAGNOSTIC_USER` unset). Customer workflows9/9 and migration rehearsals4/4 executed and passed. A subsequent test exposed directSQL whitespace-only text acceptance; the strengthened V10 CHECK constraints were then verified with all5 CustomerMigrationPostgresTest tests passing, zero skips.

Coverage includes create/reload/profile preservation, blank/null clearing, duplicate and invalid requests, omitted versus explicit-null binding, partial/sibling/cross-organization governance, old/new customer reassociation checks, customer-only versus asset capabilities, dormant/expired grants, audits, FK/profile constraints and organization hierarchy ownership integrity. Legacy migration cases cover empty databases, unambiguous owner backfill, and refusal to guess unlinked/mixed/null ownership.

No prior migration, permission seed, effective-permission view, ClickHouse configuration or station creation/deployment behavior changed. Apply V10 through `database/apply.sql` only after the normal backup and rollout checks; legacy ownership ambiguity intentionally aborts the transaction.
