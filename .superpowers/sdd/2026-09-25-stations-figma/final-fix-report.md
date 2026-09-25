# Consolidated final fix wave

Base: `6126817`. Worktree: `D:/projects/ems-cloud-v2.0/.worktrees/figma-stations`.

The root completed the unchanged baseline before granting write access: API 151/151 and demo 14/14, exit 0. This worker performed the single consolidated fix wave for all four P2 findings, without subagents or visual redesign.

## Changes

1. **All mounted editor entry paths participate in departure confirmation.** App keeps separate station-detail, asset-entry, and operations guard refs because AssetsPage stays mounted while hidden. Primary navigation selects the active surface's guard, and opening a station also consults it. Operations secondary tabs, strategy-only back navigation, and tariff-only station selection share the registered editor guard. Edit, new-station, and existing-station configuration pages register their existing confirmation dialogs. Existing platform guard and server writes/permission checks remain intact.
2. **Provision storage and resume discovery share a scoped key.** `provisionDraftKey` includes API/demo mode, escaped identity, and a distinct new/existing-station context. ProvisionEditor remounts on that context key. App already remounts AuthenticatedApp by identity. Legacy global/station-only keys are neither read nor migrated, and are not deleted. Resume only discovers the current identity/mode's new-station draft.
3. **Pending leave requests have an explicit lifecycle.** `useEditorLeaveGuard` owns a single pending promise, uses the latest dirty/permission values, and settles it with `false` on permission loss or editor unmount. Dirty updates do not unregister the guard or drop its resolver. Strategy/tariff confirmation actions explicitly settle it; validation failures keep the dialog/editor open. Thus permission-driven removal cancels the stale destination and releases the sidebar transition lock. A related proven edge is covered: loss of asset navigation with asset.edit retained now disables the new-entry surface via its existing permission path, unmounting and cancelling its pending guard. Ordinary hidden asset navigation behavior is retained.
4. **Strategy UI URL selection follows test configuration.** All three page.goto calls use the correct DEMO_PREVIEW_URL/API_PREVIEW_URL with the existing standalone 8450/8451 fallbacks. A test executes the real goto argument expressions with distinct configured origins and a conflicting generic PREVIEW_URL, then checks fallback behavior.

## Regression evidence

All commands below ran in `D:/projects/ems-cloud-v2.0/.worktrees/figma-stations/ems-cloud-ui` using the bundled Node executable. Browser scenarios use headless msedge and sequential Node test execution. Network writes occur only against Playwright route mocks.

### Red tests before implementation

```powershell
& 'C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-concurrency=1 tests/editor-departure-ui.test.cjs
```

Output: `tests 8; pass 0; fail 8; exit 1`. Strategy/tariff revocation left later primary navigation locked; edit/new/configuration failed to show a departure dialog; legacy global data exposed Resume. The two operations fixtures initially omitted `/stations/options`, the documented endpoint for identities without asset.read. After correcting that mock, the focused operations rerun confirmed both actual missing-dialog failures:

```powershell
& 'C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-concurrency=1 --test-name-pattern='operations editor' tests/editor-departure-ui.test.cjs
```

Output: `tests 2; pass 0; fail 2; exit 1`, each timing out waiting for the unsaved-dialog continue action after the original code had already departed.

```powershell
& 'C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-concurrency=1 tests/station-provision.test.cjs tests/strategy-preview-urls.test.cjs
```

Output: `tests 6; pass 4; fail 2; exit 1`. Missing scoped-key helper and hardcoded actual destinations 8450/8451 instead of the configured mode URLs.

The additional hidden new-entry permission case was also observed failing before its one-conjunct fix:

```powershell
& 'C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-concurrency=1 --test-name-pattern='revoking asset navigation' tests/editor-departure-ui.test.cjs
```

Output: `tests 1; pass 0; fail 1; exit 1`. `.station-provision` remained mounted and hidden after asset.read was revoked while asset.edit remained.

### Green covering batch

```powershell
$env:API_PREVIEW_URL='http://127.0.0.1:8451'; $env:DEMO_PREVIEW_URL='http://127.0.0.1:8450'; & 'C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-concurrency=1 tests/editor-departure-ui.test.cjs tests/station-provision.test.cjs tests/strategy-preview-urls.test.cjs tests/station-navigation-ui.test.cjs tests/strategy-outer-guard.test.cjs tests/tariff-ui.test.cjs tests/station-entry-ui.spec.cjs tests/strategy-ui.test.cjs
```

```text
ℹ tests 25
ℹ suites 0
ℹ pass 25
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 233392.3985
exit 0
```

Coverage includes strategy-only back/secondary/primary departure; tariff-only station selector/secondary/primary departure; edit/new/configuration primary departure; strategy/tariff full and manage-only permission revocation; account A/B new-draft resume; existing-station 12/13 and account A/B configuration isolation; rejection of legacy unowned drafts; API/demo/new/existing storage-key isolation; configured URL selection; original entry validation/save, station tabs, strategy workflows, tariff calendar/template/save/validation/server contracts, and prior external-mode/date/currency regressions.

### Final focused lifecycle follow-up and existing platform guard

After the final asset permission conjunct, the following command reruns the related revocation cases (also asserting no unsaved local content or server write was persisted) and the existing platform sidebar guard test. Unrelated green suites were not repeated.

```powershell
$env:PREVIEW_URL='http://127.0.0.1:8451'; $env:API_PREVIEW_URL='http://127.0.0.1:8451'; & 'C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' --test --test-concurrency=1 --test-name-pattern='revocation|revoking asset navigation|main sidebar asks' tests/editor-departure-ui.test.cjs tests/role-permissions-api-ui.test.cjs
```

```text
ℹ tests 6
ℹ suites 0
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 62906.2426
exit 0
```

### Final type and whitespace checks

```powershell
& 'C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' node_modules/typescript/bin/tsc --noEmit
```

Output: empty; exit 0 after the final source change.

`git diff --check` passed. Git emitted only the repository's LF-to-CRLF working-copy notices. No oxfmt, backend changes, API contract changes, visual changes, pushes, or edits to the root's main-workspace role/member work were performed. The root's independently edited verification document is excluded from this worker's commit. Root owns the subsequent scoped re-review, build, and integration verification.
