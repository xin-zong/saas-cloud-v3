# Final whole-branch independent review

Review date: 2026-09-24. Immutable range: `541c73c53bf4ff4ec56e925cf0f70055b561839d..45fd7608a628ebb23f6be4ac9695faea06cb07fa`.

## Verdict

**Specification: substantially implemented, with two Important integration gaps. Quality: changes requested. Ready to merge: with fixes, not at the reviewed HEAD.** No Critical finding. The findings below are the consolidated final-review set; they do not reopen the previously resolved T10/T11/T12 reviews.

The implemented model, migration, backend authorization, purpose-specific directories, role/grant/member/organization workflows and capability-driven UI broadly follow the user-derived plan and recorded rulings. The remaining issues are a compatibility endpoint bypassing the new lead-privacy rule and a parent component defeating the grant editor's refresh/draft protections. Neither requires redesigning the model.

## Strengths

- Authorization is derived from active database grants, with the permission and explicit station selected on the same grant. Inclusive start/exclusive end, disabled-user denial, NULL organization ownership and empty station selections have explicit semantics. Navigation unions are separated from station-action maps; independent operations use minimal station identity rather than technical asset access or fabricated measurements.
- Role expansion checks every retained recipient, including future/expired grants and disabled members. Delegation checks authority, target resource and validity horizon, and preserves the same-source branch condition for customer management. Removal/narrowing remains possible without turning historical unavailable permissions into new assignable capabilities.
- Governance writes share a transaction lock and preserve complete per-organization governance horizons. Reparenting checks pre-move authority, affected incoming/outgoing role branches, recipients and selected stations, then checks the resulting state. Member membership and permanent administrative ownership remain separate relationships.
- The schema remains small and normalized: role definitions, individual grants and grant stations are separate relations; periods and source labels are derived, and unknown historical grantors remain NULL. V7 preserves old capability relationships without giving existing users role management. Legacy relations remain historical/read-only, and obsolete aggregate routes fail explicitly rather than forming a second authorization path.
- Template initialization is explicit, catalog-filtered, locked, idempotent and excludes every retained new or legacy role reference. Fixture preparation checks the exact database and collisions; cleanup retires exact identities and removes their grants while preserving audit/history. The cutover documentation distinguishes rehearsal, formal migration, default definitions and the still-unselected first human role manager.
- Verification goes beyond mocked UI success: the recorded JDBC/SQL tests cover expiry, cross-grant/cross-station denial, finite delegation, concurrency and atomicity; the persisted real HTTP/browser ledgers include A-edit/B-read, direct server denial and same-session revocation. Failed first attempts are retained and final layout mocks are clearly labeled. The final CSS scopes and sampled images support the documented adaptive layout rather than an unsupported pixel-parity claim.

## Critical

None identified.

## Important

### I1 — Compatibility organization directory exposes a lead identity the primary directory deliberately redacts

**Location:** `ems-cloud-api/src/main/java/com/enerlution/ems/business/SettingsController.java:81` (route begins at line 76).

`GET /api/organizations` authorizes `organization.member.read` and returns `SELECT o.*` for readable organization rows. V6 adds `organization.lead_user_id`, so this now returns that user ID unconditionally. A readable organization's lead may have an administrative owner outside the reader's permitted branch. The new `/api/platform/organizations` implementation explicitly checks the lead's administrative owner and membership, returning NULL ID/name with `lead_restricted=true` when either is outside scope (`PlatformController.java:60–73`). Calling the compatibility route bypasses that privacy rule and reveals the hidden person-to-organization relationship.

This is not merely a different response shape: it discloses the exact field intentionally protected by the T09 ruling and `directoryMarksNestedManagementRootAndRedactsUnmanageableLead`. The caller needs only legitimate read authority over the organization, not authority over the lead. The fact that the current UI uses the primary route does not prevent direct authenticated requests to the other live endpoint.

**Fix:** use a shared explicit, redacted organization projection, omit lead fields from the compatibility response, or retire the compatibility route if it is no longer required. Avoid `o.*` for a bounded metadata directory. Add a real-controller/JDBC regression that checks both routes with a readable organization and a lead whose management owner is out of scope; also retain the visible-lead case and ordinary organization-directory behavior. No production/remote request was needed to establish the bypass; both source paths and the existing privacy contract were checked.

### I2 — Parent directory refresh silently destroys an editable member-grant draft

**Location:** `ems-cloud-ui/src/components/MemberOrganizationPanel.tsx:480` (conditional mounting of `MemberGrantsPanel` at line 483); triggering load at lines 89–90 and effect dependency at line 172.

The directory effect reloads whenever `user` changes. `load()` sets `loading=true` before awaiting directory responses, while the entire grant-panel child is rendered only under `!loading`. Thus any changed `/auth/me` snapshot unmounts the grant panel, even when the selected member/grant remains fully editable. When the request finishes, the fresh child starts with `draft=null`. Its own scoped-refresh preservation, pending-write guard and unsaved-leave logic cannot protect state after its parent has removed it.

**Concrete reproduction (executed in this review):** using the full existing mocked API platform harness on preview 8445, open member 8 / grant 101, check the additional station, then add an unrelated organization to the actor's grant-management map while retaining the original organization and all existing authority. Dispatch browser focus. `/auth/me` refreshes, the editor disappears into the saved grant list, no unsaved-change prompt appears, and no write request occurs. The selected grant remains editable. The single inline reproduction completed in 7.90 seconds and explicitly asserted this defective outcome; it is evidence of the bug, not a passing product behavior. All API requests were intercepted; no file, real API or database mutation was performed.

**Fix:** keep the grant editor mounted during background directory refresh and coordinate refreshed target/action eligibility with the child's preservation logic. Disable mutation until refreshed authority is known, preserve a still-authorized draft, and explicitly handle actual loss of target access. A pending write must retain its original context until its result is resolved. Add an integrated platform regression for a changed scope with unchanged target authority, plus a held write during refresh and an actual target-scope loss. The current grant tests hold navigation/save responses but return an unchanged auth snapshot, so they do not cover this parent-child lifecycle failure.

## Minor

### M1 — Final API documentation retains superseded intermediate contracts

**Location:** `ems-cloud-api/docs/permission-grant-authorization.md:34`; related stale statement at `ems-cloud-api/docs/member-organization-workflows.md:39`.

The authorization guide still says member lifecycle is a subsequent task, labels this an intermediate backend that must not be deployed alone, and describes profile updates as `{name,enabled,organizationId?}` with only changed membership rejected. The final implementation includes lifecycle/membership workflows, supports email, and rejects any supplied `organizationId` in profile updates. The member/organization document likewise calls customer fixture migration a remaining T10 item although T10–T12 are complete. These statements can mislead an API consumer or operator reading the final branch.

**Fix:** rewrite these sentences around the final endpoints and explicitly limit 410 to the retired combined grant fields/routes; retain historical phase details only when clearly labeled historical. Link to the current member/organization and cutover contracts.

## Scope, verification and limits

- Reviewed the final brief, user-derived plan and recorded rulings, immutable diff across backend authorization/controllers, schema/migrations, cutover/fixture tools, frontend capability/session behavior, admin forms, tests and evidence. Focused source lookups were limited to confirming the two named findings and exact line references. No branch/index/production-file mutation or additional agent was used.
- Independently executed only the single fully mocked focus-refresh reproduction described in I2. Broad Java/UI suites and remote operations were not repeated, as instructed. Recorded results reviewed include API 117/117, demo 16/16, subsequent affected CSS 6+8, TypeScript/build, the separately executed real JDBC/SQL evidence, T11's five HTTP groups and T12's five successful real-browser groups. The 51 locally skipped PG tests are not counted as executed passes.
- Reviewed the saved real-browser and HTTP ledgers, cleanup reporting, preserved first-attempt failure, layout findings and explicitly marked mock evidence. Visually sampled the real 1280 two-independent-grants capture and final mocked 1280 preview-bottom capture; did not independently replay all screenshot workflows or claim to inspect every image. Existing root/scoped-review visual verification remains part of the recorded evidence.
- The unresolved first human role-manager choice is intentional and must not be fixed by an automatic grant. Existing Mockito/CDS and large-chunk warnings remain nonblocking tracked tool/build issues. Documented matrix-column and scroll-footer differences are accepted scope decisions, not new findings.

## Recommended final gate

Address I1 and I2 in one focused round, update M1, and independently review that diff. Run only the meaningful affected backend privacy and integrated frontend refresh regressions, then record the actual results and final readiness. The existing broad verification need not be repeated solely because of this review; the new tests should cover the missing cross-route and parent-child integration boundaries.
