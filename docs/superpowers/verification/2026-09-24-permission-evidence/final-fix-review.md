# Final focused fix re-review

Date: 2026-09-24. Immutable range: `45fd7608a628ebb23f6be4ac9695faea06cb07fa..30dab3191461355c43de9e433b113196ff3277ca`.

**Verdict: approved. I1, I2 and M1 are resolved. No new Critical, Important or Minor finding in this fix scope. The final code-review gate is satisfied; root-owned packaging/restart and runtime verification remain separate operational steps.**

## I1 — Resolved

`OrganizationWorkflows.directory` now owns an explicit `id,name,parent_id` projection plus computed lead/reparent metadata. Both `SettingsController.organizations` and `PlatformController.organizations` call it, retaining their existing permission and purpose checks. The compatibility endpoint no longer uses `o.*`.

The shared helper requires the lead's administrative owner and non-null membership to be in the selected permission's visible organization set before returning either lead ID or name. Otherwise it nulls the ID/name and marks the relationship restricted. Other purposes still omit lead details, and only organization-management purpose computes reparent eligibility. The extraction preserves the primary directory's behavior and does not change migration, grant views or mutation authority.

The new real-controller/JDBC test checks both routes, asserts the hidden ID first, verifies visible lead ID/name and ordinary organization fields, then independently checks an out-of-scope membership. The reported focused three-test GREEN also retains nested-management-root and granular-purpose coverage. This directly addresses the privacy bypass rather than merely masking the field in the UI.

## I2 — Resolved

`MemberOrganizationPanel` keeps the selected `MemberGrantsPanel` mounted during asynchronous directory reload. Its `directoryUser` tracks the exact auth snapshot represented by settled directory membership, so a newly rendered auth snapshot cannot reuse the previous directory as confirmed write eligibility before the effect starts or request completes.

The child now requires parent `accessState=ready`, agreement with the current capability scope, loaded grant data and grant-management eligibility before save/revoke. Background refresh retains the still-authorized draft and its leave guard. Actual target access loss presents an explicit unavailable state and removes the old editable grant data; retained read access without management removes editing. A pending write retains the original child/context until its result arrives, after which the refreshed access state applies. Existing abort and deliberate-navigation guards remain in place.

The three added browser regressions mount the full platform parent-child chain and hold the member-directory response. They cover an unrelated scope addition with draft preservation and save blocking, actual target disappearance, and a pending PUT that remains bound to member 8/grant 101 with exactly one write while navigation is blocked. The tests have explicit 30-second bounds and release their held responses through cleanup. Their assertions address the original lifecycle failure and the principal risks introduced by preserving the mounted child.

## M1 — Resolved

The two guides now describe the final create/profile/membership routes, email support, rejection of any profile `organizationId`, and the narrowly retired combined fields/routes. They remove future-T09/T10 and intermediate-deployment wording, retain current contract/cutover links, and distinguish original grant issuer from editing actor correctly.

## Verification assessed

Read the full nine-file immutable fix diff, implementation report and original I1/I2/M1 findings. No unrelated branch review was reopened, and no code, database, service or production-file change was made by this reviewer.

The evidence supplied for this immutable fix is:

- I1 exact privacy RED, followed by real PostgreSQL **3/3 GREEN**, 41.227 seconds, confirmed by root from Surefire XML.
- Local Java **43 active passes**, **52 opt-in database skips**, zero failures/errors. The skipped tests are not treated as executed passes.
- Integrated parent-refresh **3 RED → 3 GREEN**, followed by the complete affected grant and member/organization browser suites **36/36 passes**, no failures/cancellations/skips, 306.68 seconds.
- TypeScript check and Vite production build passed. The existing chunk-size warning remains the previously tracked nonblocking issue.

I inspected the added tests and their relationship to the fixes; I did not rerun already completed suites or perform remote operations, as requested. The original whole-branch strengths and scope limits remain applicable. No existing account was granted authority, no schema/migration changed, and the pending first-human-role-manager choice remains intentional.

**Readiness: ready from the code-review perspective at `30dab3191461355c43de9e433b113196ff3277ca`.** Record the root's final rebuild/restart/runtime outcome separately before claiming deployment is complete.
