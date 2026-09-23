# Final review fix wave — implementation report

Base: `45fd7608a628ebb23f6be4ac9695faea06cb07fa`. Scope: final-review I1, I2 and M1 only. This is the implementer's report; final independent scoped review and root-owned API restart remain separate gates.

Implementation commit: `30dab3191461355c43de9e433b113196ff3277ca` (nine task files). This ignored report is left in the SDD workspace; no scratch file was force-added. Post-commit status contains only root-owned plan/verification/evidence work.

## Changes

- I1: `SettingsController` and `PlatformController` now share the explicit `OrganizationWorkflows.directory` projection. Both retain the caller's purpose-specific organization rows and `id/name/parent_id` option fields. The compatibility read route now supplies the same nullable lead ID/name and restriction flag as the primary read route. Either an out-of-branch administrative owner or an out-of-branch/null membership hides the lead. Reparent flags remain purpose-specific. No permission, SQL authorization view, migration or write behavior changed.
- I2: `MemberOrganizationPanel` keeps an open grant panel mounted while its directory refreshes. The parent binds settled directory eligibility to the exact auth snapshot that loaded it, preventing old directory membership from enabling mutations before the new request finishes. The child blocks save/revoke until parent authority and its own scope agree. Still-authorized drafts and their unsaved-leave guard survive. Actual target access loss shows an explicit unavailable message and clears the editable data; loss of grant-management with retained read access removes editing. Pending requests retain the original member/editor until their result arrives, then apply the refreshed access state. Existing abort handling rejects late parent directory responses and existing leave guards still govern deliberate navigation.
- M1: the two API guides now describe the final split create/profile/membership contracts, email support, rejection of every profile `organizationId` field, and 410 only for retired combined fields/routes. New grants use the actor as issuer; edits preserve the issuer and audit the actual editor. The obsolete future-T09/T10/intermediate-deployment wording is removed and current lifecycle/cutover references retained.

## RED/GREEN evidence

### Real PostgreSQL (executed by root with private credentials)

Sanitized command: bundled Python `D:/projects/ems-cloud-v2.0/.local-tools/test-permission-jdbc.py '<selector>'`. The existing launcher injects private `EMS_TEST_*` values only into its child; no values are recorded here. Fixture guards require `ems_cloud_v2_proto`, empty `ems_permission_tests`, schema-only search_path and rollback cleanup.

- RED selector `MemberOrganizationPostgresTest#compatibilityDirectoryUsesSameScopedLeadProjection`: session 26393, 1 test / 1 failure / 0 errors / 0 skips, 12.95 s. Initial ordering first detected missing visible lead-name parity. Root requested the hidden-ID assertion first to isolate I1 precisely.
- Exact privacy RED, same selector after assertion reorder and before production edits: session 22327, 1 test / 1 failure / 0 errors / 0 skips, 12.75 s. `/api/organizations` hidden `lead_user_id.isNull()` expected true, actual false.
- GREEN selector `MemberOrganizationPostgresTest#compatibilityDirectoryUsesSameScopedLeadProjection+directoryMarksNestedManagementRootAndRedactsUnmanageableLead+granularDirectoriesExposeOnlyPurposeFieldsWithinBothScopes`: session 91713, **3 tests / 0 failures / 0 errors / 0 skips**, 41.227 s, confirmed by root from Surefire XML. This covers both read routes, owner/membership lead privacy, visible leads, ordinary organization rows, original nested-root behavior and other purpose directories.
- Root local API command, API working directory: `$env:MAVEN_OPTS='-Xmx256m'; & ./mvnw.ps1 -q test`. Session 4336 exit 0: **43 active tests pass; 52 opt-in database tests skipped; 95 total, 0 failures/errors**. Skips are not claimed as executed passes.

### Integrated API-mode browser (all API requests mocked)

The existing full platform harness mounts `ApiPlatformManagement` → `MemberOrganizationPanel` → `MemberGrantsPanel`. New tests change `/auth/me` organization scopes, trigger browser focus and hold the parent member-directory response. They do not test a standalone child and perform no real business writes.

Command from `ems-cloud-ui`: `node --test --test-name-pattern='parent directory refresh' tests/member-grants-api-ui.test.cjs`.

- RED session 25304: **3 tests, 3 expected failures**, 32.22 s. Benign scope change, target disappearance and pending write each found the editor unmounted (`业务角色` count 0 vs 1).
- First implementation run: 2 passes; pending test reached a harness locator for an organization tab unavailable to this grant-only actor. Corrected that navigation assertion to the actor's existing audit tab; product code was not changed to grant extra access.
- GREEN session 63801: **3/3 pass**, 28.60 s. Authorized additional-station selection and leave prompt survive; save is disabled while the directory is held. Disappeared target cannot save/view old grants. Held PUT remains tied to member 8/grant 101 and prevents navigation until resolved, with exactly one request.
- Affected full suites command: `node --test --test-concurrency=1 tests/member-grants-api-ui.test.cjs tests/platform-api-ui.test.cjs`; session 98145 **exit 0, 36 tests / 36 passes / 0 failures / 0 cancelled / 0 skipped**, 306683.6566 ms (306.68 s). This comprises 24 grant tests plus 12 member/organization tests, covering existing true navigation/draft guards, late member responses, pending writes, readonly purpose scopes, modal focus and visual assertions, unavailable-role narrowing and member lifecycle integration.

### Static/build checks

- `node node_modules/typescript/bin/tsc --noEmit`: session 28285, exit 0.
- `node node_modules/vite/bin/vite.js build`: exit 0, 3.77 s, 3057 modules; existing >500 kB chunk warning remains. `npm run build` could not start because npm was absent from PATH, so the exact Vite build executable from the package script was used.
- `git diff --check`: exit 0. Git emitted normal LF/CRLF checkout warnings.

## Boundaries and remaining gates

No remote operation or process change was performed by the implementer. No production data, migration, existing user authorization, retired fixture or first-human-manager choice was changed. Root-owned plan/verification/evidence files are excluded from staging. Broad unaffected UI/PG suites are not rerun. This wave does not claim another real fixture-browser workflow; existing successful T12 r2 evidence remains unchanged. Root will perform independent scoped review before rebuilding/restarting the local API.
