# Platform management API follow-up

The API-mode platform page now uses persisted organization, member, role, customer, and audit records. The prototype page remains unchanged in explicit demo mode. API mode does not show prototype quotas, contracts, temporary approvals, or security policies because the backend has no persisted facts for them.

## New API contracts

- `GET /api/platform/organizations`: current management organization and descendants, guarded by `member.manage`.
- `POST /api/platform/organizations` and `PUT /api/platform/organizations/{id}`: create a child or rename/reparent within the same branch. The management root cannot be moved. Organization cycle and uniqueness constraints remain database-enforced.
- `GET /api/platform/member-grants`: role IDs and currently visible station IDs for members of the management organization and its descendants. `station_count` reports the full count so the UI prevents saving a partial view over hidden grants.
- Existing `PUT /api/members/{id}/grants` now accepts members in the actor's organization branch. It rejects a member with hidden station grants, self grant edits, roles the caller does not hold, and stations outside the caller's scope.
- `GET /api/platform/role-permissions`: read-only permission rows for caller-held roles. Role editing is not offered because the schema has no role-management authorization separate from `member.manage`.
- `GET /api/platform/customers`: customers linked to accessible stations, with visible station count and `can_edit` scope flag, guarded by `asset.read`.
- `PUT /api/platform/customers/{id}`: renames a customer only when the caller has both `asset.edit` and `member.manage`, and every station for that customer is in the caller's organization branch and station scope. No customer creation or new station onboarding is offered.
- Existing `GET /api/members` now lists the actor's organization branch. `POST /api/members` and `PUT /api/members/{id}` accept `organizationId` within that branch, enabling child organization placement without allowing sibling or parent access. Existing `GET /api/roles` and `GET /api/audit` provide the other screen actions. Audit remains actor-only as implemented by `SettingsController`.

## Integration

`PlatformManagementPage` selects `ApiPlatformManagement` when `VITE_DATA_MODE` is not `demo`. `App.tsx` must expose the platform nav and choose tabs from server permissions: `member.manage` for organization, `asset.read` for customers, and `audit.read` for audit. The parent task owns this integration. The API page uses `Station` IDs supplied by App for station grant choices; only numeric server IDs appear.

Organization and member writes acquire the same transaction advisory lock as the database's organization cycle trigger before branch checks. This keeps a concurrent reparent operation from changing the checked branch before the write. The API never allows a member to move their own account to another organization.

## Verification

`node --test --test-force-exit tests/platform-api-ui.test.cjs` passed (one browser contract test with intercepted API responses). The test covers server rows replacing prototype data, member grant save, child organization creation, member placement in that child, customer edit, and own audit. `PlatformScopeTest` asserts sibling and parent member edits are denied before writes. Parent final TypeScript/build and Maven checks passed; real PostgreSQL/API tests verified child placement and out-of-scope rejection. Audit uses allRows pagination, not a truncated 200-row view. See progress.md for final results.
