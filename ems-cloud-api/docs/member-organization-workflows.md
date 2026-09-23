# Member and organization workflows

All paths have `/api` prefix. Writes run in one transaction under advisory lock `78291001`; authorization is rechecked under that lock.

- `POST /members`: `{account,name,password,email?,organizationId,managementOrganizationId?}`. Password is required (12–72 characters); accounts normalize to lowercase. Returns `{id}`. Creates an enabled account and **no grants**. A non-null explicitly selected membership defaults administrative ownership to that organization. If `organizationId` is null, an explicit authorized `managementOrganizationId` is required (400 if omitted). Both supplied organizations require `member.manage.profile`; ownership never defaults to the first directory item. The old `roleIds` / `stationIds` creation fields return 410.
- `PUT /members/{id}`: `{name,email?,enabled}`. Requires `member.manage.profile` on both administrative owner and non-null membership. Account is immutable. An `organizationId` field, including explicit null, returns 400; use the separate membership endpoint. Self-disable returns 409. Disabling must preserve every existing complete governance horizon.
- `PUT /members/{id}/organization`: `{organizationId:number|null}`. The field is mandatory; null explicitly removes membership. Requires `organization.manage` on administrative owner, old membership, and non-null destination. A self-move returns 409. Changes only `organization_id`: administrative ownership, role ownership and all grants remain unchanged. Clears organization lead pointers when the member no longer belongs to that organization's descendant branch. The same guard/lock protects this operation.
- `DELETE /members/{id}`: requires `member.manage.profile` on owner and membership. Self-delete returns 409. Any schema-local foreign-key reference (including cascading references), retained grant/grantor references, or structured grant-create/edit/revoke history targeting the exact numeric `memberId` returns 409 and suggests disabling. No operational or audit rows are deleted. Legacy free text is never cast wholesale to JSON or matched by loose ID substrings. Unreferenced accounts may be deleted; deletion is audited by the actor.

Membership is independent of administrative ownership. An unassigned member is visible only if their retained management owner is within the selected directory capability's scope.

## Purpose-scoped read context

`GET /members?purpose=read|profiles|organizations|grants` defaults to `read`. Each directory requires its corresponding permission on **both** management owner and current non-null membership. All return `id,account,display_name,enabled,organization_id,management_organization_id`; only `read` and `profiles` return `email`. They never return grant metadata.

| Purpose | Capability | Use |
| --- | --- | --- |
| read | organization.member.read | member directory and grant read entry |
| profiles | member.manage.profile | editable profile directory |
| organizations | organization.manage | eligible existing members and leads |
| grants | member.grant.manage | target selection for independent grant flow |

`GET /platform/organizations` retains the member-reader directory. `purpose=profiles|organizations|roles|grants` requires the corresponding profile, organization, role or grant capability. Basic fields remain `id,name,parent_id`. Member-reader and organization-management directories expose `lead_user_id,lead_name` only when both member ownership and membership are visible for that purpose; otherwise both are null and `lead_restricted=true`. Other purposes return null lead fields. `can_reparent` is authoritative for the organization-management directory: false for direct active organization-management role roots and roots whose parent is not manageable. The frontend loads each write capability's scoped organization directory independently, so a broad read grant cannot enable writes outside a narrower management grant.

## Organization changes

`POST /platform/organizations` accepts `{name,parentId,leadUserId?}`. The parent must be explicitly selected and manageable. A new organization has no members, so any non-null lead is rejected with a prompt to add members first. It initializes the eight role **definitions** from the single canonical `permission-role-templates.json`, intersecting template codes with the available catalog/database permissions. No account receives those roles automatically.

`PUT /platform/organizations/{id}` accepts `{name,parentId,leadUserId}`. Null/omitted parent preserves the current parent (including an invisible parent above the operator's management root). Omitted `leadUserId` preserves the existing relationship; explicit null clears it; a number requests validated assignment. The UI keeps hidden or unselectable current leads through an explicit protected keep choice, so a name-only edit never clears an unseen lead. A newly assigned lead must be an enabled, manageable member whose membership is in this organization or its descendants. Management roots cannot move; self/descendant cycles fail with an actionable error.

Reparenting computes current and proposed role-owner descendant closures **before changing the parent edge**. It checks retained grants owned by the moved subtree and grants whose owner scope changes, including receiving and former ancestor roles, even if expired, future, or assigned to disabled members. Each affected grant must be wholly manageable (role owner, member owner/membership, selected stations). Newly added organization scopes require the actor's pre-move capabilities and expiry coverage; the move cannot authorize itself through newly widened roles. The customer-management hybrid receives its same-source station check too. After the change it rechecks affected scopes, clears only lead relationships valid before and made invalid by this move, and preserves existing complete governance horizons. Pre-existing unrelated invalid pointers remain intact, even on a former ancestor. Failure rolls everything back.

## UI

The organization tree and two white cards remain; the member table retains name/account, organization, role, station, status and action columns. Missing grant summaries display `— / 详情中查看`, never inferred zero grants or zero sites. Dedicated grant and role panels remain authoritative.

Member profile, membership and organization dialogs are 620px wide with two columns. Creation adds a required initial password because no invitation service exists; unassigned creation shows an explicit management-owner picker. Create succeeds before the separate `现在分配权限` action. Organization actions support searchable existing-member selection, legal lead choices, removal confirmation, and reference-conflict errors. Forms protect unsaved changes through the shared parent leave-guard contract and lock writes/navigation while saving.

Customer maintenance in the historical combined browser fixture remains a T10 migration item. Member/organization assertions in `platform-api-ui.test.cjs` now use these actual granular contracts; grant assertions live in the existing independent grant suite.
