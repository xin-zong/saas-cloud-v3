# Task 2 — customer frontend workflows

Implemented against backend contract `ems-cloud-api/docs/customer-workflows.md`, base `9a444e3`, in isolated customer-workflows worktree. No backend changes, real database writes, deployment success simulation, or forbidden main UI edits.

## Behavior

- Authorized customer.read + customer.manage exposes 新增客户 even in an empty directory. Organization choices come from create-options, with single choice preselected; errors have inline retry. POST returns persisted row, opens its zero-station detail, and directory reload retains entity/contact. Duplicate failure keeps input. Pending refs suppress duplicate writes.
- Profile edit reads entity/contact from API and PUTs trimmed values; blank sends null. Former local profile drafts are neither imported nor deleted. Contract/entitlement editing remains explicitly local only. Create/profile retain keyboard trap, focus restore, dirty leave confirmation and permission refresh behavior. Access generation prevents stale saves/options from repopulating revoked state.
- Station model/adapters include optional string|null customerId. Server can_assign controls searchable/clearable options. Restricted current association displays no customer identity. Changed association is revalidated before PUT; unchanged association omitted, explicit clear null. Failed options retain original binding and allow unrelated fields; revoked dirty association blocks save. App propagates revoked edit failures and uses persisted PUT identity before refresh, preserving rich station data.
- New-site basic-info customer choice includes only readable can_edit customers. It writes only existing account/mode-isolated local draft; restored choice is revalidated, unavailable/revoked choice cleared without cached name disclosure. No station POST/PUT activated.

## Design and evidence

Fresh root-fetched high fidelity contexts and PNGs inspected before implementation: directory 1673:5775, detail 1673:6001, profile 1673:6227, editor 1127:9052, new-site 2136:8507. Existing platform cards/modal/forms and station Field/Asset components reused. New creation composes profile layout as approved. Nine PNGs captured and inspected at 1366/1440/1920 in scratch/screenshots: customer-create, customer-detail, station-customer-selector. No horizontal viewport overflow. Station screenshots await image decode and verify visible editor assets loaded with positive geometry; no new/redrawn asset.

Local checkout initially contained LFS pointers. `git lfs checkout ems-cloud-ui/public` hydrated existing objects. Equipment image SHA256 `03f71463fee8e80b5b436e6544702b58fa67295f223ad340cfd33904ebeec10f` matches HEAD LFS pointer, size1114547. Relevant module02 visual regression subsequently passed. No asset tracked change. Existing detail typography/additional fields and permission-filtered navigation remain repository conventions; no out-of-scope shell edits.

## Commands and raw results

Bundled Node: `C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe` (below NODE). All Playwright uses msedge. API routes at18090 intercepted; APIpreview8471 and demo8472 were already running.

Initial test-driven RED terminal outputs (before implementation):

```
NODE --test ems-cloud-ui/tests/customer-workflows-ui.test.cjs
✖ create empty-directory customer and reload persisted profile without any station (12874.3512ms)
locator.click: Timeout 5000ms exceeded.
waiting for getByRole('button', { name: '新增客户', exact: true })
ℹ tests1 pass0 fail1

NODE --test --test-name-pattern='station association' ems-cloud-ui/tests/customer-workflows-ui.test.cjs
✖ station association explicitly assigns and clears, unchanged fields omit customerId (15464.5845ms)
locator.selectOption: Timeout6000ms exceeded.
waiting for getByLabel('所属客户', { exact: true })
ℹ tests1 pass0 fail1

NODE --test --test-name-pattern='new-site' ems-cloud-ui/tests/customer-workflows-ui.test.cjs
✖ new-site customer association saves only an isolated local draft and revalidates restored choice (12989.3541ms)
locator.selectOption: Timeout6000ms exceeded.
waiting for getByLabel('所属客户', { exact: true })
ℹ tests1 pass0 fail1
```

Each passed individually after its implementation; terminal outputs retained in session. Subsequent full raw log files are in scratch.

1. Initial focused command with API_PREVIEW_URL8471, DEMO_PREVIEW_URL8472: `NODE --test ems-cloud-ui/tests/customer-workflows-ui.test.cjs ems-cloud-ui/tests/all-modules-platform-ui.test.cjs ems-cloud-ui/tests/capabilities-api-ui.test.cjs ems-cloud-ui/tests/station-provision.test.cjs ems-cloud-ui/tests/capabilities.test.cjs`. `task2-focused-green.log` is intentionally preserved despite its name:44tests26pass18fail.16fail were wrong capabilities PREVIEW_URL default8445,2 explicit reload inherited5/6s timeout. No assertions weakened; reload uses existing navigation60000ms and proper env set.
2. PREVIEW_URL8471 `NODE --test ems-cloud-ui/tests/capabilities-api-ui.test.cjs`: `task2-capabilities-green.log`,16/16 pass,0fail. Customer-only403, organization scope change, focus/timer/revocation/editor closure covered.
3. API_PREVIEW_URL8471 DEMO_PREVIEW_URL8472 `NODE --test ems-cloud-ui/tests/station-entry-ui.spec.cjs ems-cloud-ui/tests/all-modules-stations-ui.test.cjs`: `task2-station-regressions.log`, station entry3/3 pass; initial module02 failure was LFS pointer. After hydration, module02 passed in `task2-workflows-final.log`.
4. `NODE --test ems-cloud-ui/tests/customer-workflows-ui.test.cjs ems-cloud-ui/tests/all-modules-stations-ui.test.cjs`: `task2-workflows-final.log`,5pass1fail. Station reopen assertion saw legitimate loading text before options settled; added wait for actual select, retained empty-value assertion. Final targeted station1/1 in `task2-station-association-final.log`.
5. API_PREVIEW_URL/PREVIEW_URL8471 DEMO_PREVIEW_URL8472 `NODE --test --test-name-pattern='customer' ems-cloud-ui/tests/all-modules-platform-ui.test.cjs ems-cloud-ui/tests/capabilities-api-ui.test.cjs ems-cloud-ui/tests/customer-workflows-ui.test.cjs`: `task2-customer-final.log`,10/10 pass0fail. Includes all5 new workflow cases, failure/dirty/keyboard/entitlement and customer403 cases. Fixture fields updated to persisted contract. Original permission assertions retained.
6. `NODE --test --test-name-pattern='station association' ems-cloud-ui/tests/customer-workflows-ui.test.cjs`: `task2-assets-final.log`,1/1 pass0fail after decode and asset geometry checks. Includes assign, clear, reload, omission, revoked dirty binding, restricted identity, unrelated save and options503.
7. `NODE ems-cloud-ui/node_modules/typescript/bin/tsc --noEmit -p ems-cloud-ui/tsconfig.json`: final exit0; `task2-typecheck-final.log`.
8. From ems-cloud-ui: `NODE node_modules/vite/bin/vite.js build`: `task2-build-final.log`,exit0,2557 modules, built1.73s. Existing large-chunk advisory remains.
9. `git diff --check`: no whitespace errors (line-ending advisory only).

Oxfmt0.2 formatting made touched workflow readable but removed inline type separators incorrectly; corrected separators and verified final tsc/build. Original main dirty paths were never touched. Root plan remains unstaged. Root independently reviews before deployment.

## Limits

No backend/API production smoke in this task. Requires backendV10 contract during rollout. New-site/deployment and contract/entitlement remain clearly local drafts by approved scope. No unresolved contract blocker.


## Review fix round 1 — delayed customer options after revocation

Reviewer P2 reproduced on base c317eef: unversioned retry requests could restore old customer names/can_assign after customer-only capability refresh, while asset access kept editors mounted. Added a monotonic request epoch to both customer loaders, including retry and station save-time lookups. Permission effect cleanup/unmount invalidates all requests; stale success/error/finally cannot overwrite current options, error or loading state. Stale station save-time lookup throws before PUT. New-site no-read state explicitly settles loading/error and retains cleared choices. No unrelated refactor.

Deterministic regression holds a retry response, revokes only customer capability through auth focus refresh, waits for restricted station/current disabled draft state, then releases the old response and waits for it to finish plus React frames. Both assert no old customer name, preserved restricted/disabled authority and zero writes. Initial fixture-count approach exposed effect retries rather than the intended failure and is preserved in task2-revoked-options-red.log; corrected explicit held-request fixture reproduces both actual stale-name failures.

Command: `NODE --test --test-name-pattern='delayed customer retry' ems-cloud-ui/tests/customer-workflows-ui.test.cjs`.

Raw RED (`task2-revoked-options-red-final.log`):
```
✖ station delayed customer retry cannot restore names after customer-only revocation (6822.3281ms)
✖ new-site delayed customer retry cannot restore names after customer-only revocation (6231.3409ms)
ℹ tests 2
ℹ pass 0
ℹ fail 2
AssertionError [ERR_ASSERTION]: 1 !== 0
actual:1 expected:0 — old customer option remained visible
```
Raw GREEN (`task2-revoked-options-green.log`):
```
✔ station delayed customer retry cannot restore names after customer-only revocation (6811.1184ms)
✔ new-site delayed customer retry cannot restore names after customer-only revocation (6447.5954ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
ℹ duration_ms 13659.3702
```
`NODE ems-cloud-ui/node_modules/typescript/bin/tsc --noEmit -p ems-cloud-ui/tsconfig.json`: exit0, task2-fix-typecheck.log (`tsc exit=0`).
From ems-cloud-ui, `NODE node_modules/vite/bin/vite.js build`: exit0, task2-fix-build.log,2557 modules, built2.01s; existing chunk advisory unchanged. Prior broader suites intentionally not repeated for this scoped async correction. Root confirmed reviewer has no additional findings before fix commit.
