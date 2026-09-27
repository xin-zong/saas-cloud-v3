# Task 9 implementation report

Status: DONE_WITH_CONCERNS. Commit b472d2d. No push or merge.

## Change

Native EMS entry/data panels are composed into all eight existing SaaS modules. The default is a compact source/status/freshness summary. Explicit expansion exposes detailed point evidence, structure, cells, typed history, alarm snapshots/history, safe configuration, ingestion, manual queries and mapping. Existing business layouts remain alongside the EMS surface and retain their own data sources.

Shared adapters preserve exact IDs and decimal/text values as strings, missing values as null, quality, timestamps and provenance. Chart numeric conversion is display-only with gaps for invalid/missing values. History requests explicitly use source=ems; existing history explicitly uses source=legacy. Unknown current alarm state preserves last-known evidence without becoming known-empty. No registration or binding is fabricated. Writes use selected existing physical assets and catalogue points; acknowledgement and terminal execution are distinct.

Visible resources refresh every 10 seconds. Scope replacement, hidden visibility and capability revocation cancel outstanding work, clear current state and reject late resolutions. EMS read/manage/query and existing telemetry/alarm/asset grants gate their respective operations. EMS-only grants expose a platform entry without unrelated business permissions.

## Eight-module entry matrix

| Module | Native entry | Real EMS surface |
| --- | --- | --- |
| 01 Overview | OverviewPage | Online/reachable gateway summary, exact power/SOC/current point values, quality/freshness; expanded current evidence |
| 02 Assets | StationOverviewPage and StationDevicesPage | Station/device gateways, structure, latest point values and selected physical-device cells |
| 03 Operations | OperationsOverviewPage | Actual current operational points and expanded typed telemetry history/curve |
| 04 Maintenance | MaintenanceCenterPage | Current known/unknown alarms, alarm history and ingestion/backfill evidence; business alarm navigation |
| 05 Work orders | WorkOrdersApprovalPage | Actual EMS/business alarm linkage opens an existing linked work order; absent linkage advises existing manual workflow, creates nothing |
| 06 Analysis | ApiAnalyticsPage; StationAnalysisPage source label | Typed EMS history/statistics with explicit aggregation; legacy historical analysis explicitly unverified source |
| 07 Platform | ApiPlatformManagement | Existing physical asset registration and explicit device/point mappings; frozen catalogue identifiers |
| 08 Settings | SystemSettingsPage | Safe read-only effective configuration snapshots and opaque revisions; protocol query evidence |

## Design verification

Current Figma file Y0KMYFvalDXgSPnVZ5zG39 representative nodes: 01 1172:26660; 02 2044:8026, devices 2271:10795, battery 2292:11393; 03 999:661; 04 1036:820; 05 1107:1090; 06 1990:8374; 07 1659:4522; 08 1146:810. Parent retrieved high-fidelity context files before implementation. Implementer fetched current screenshots and inspected all selected representatives. Saved evidence: task9-figma-1.png through task9-figma-8.png, task9-device.png, task9-battery.png.

Final isolated fixture screenshots: task9-fixture-screens/{overview,assets,operations,maintenance,workorders,analysis,platform,settings}.png and corresponding *-expanded.png. All eight default views were visually inspected. The compact revision resolves overview switch overlap and keeps operations KPIs visible. These screenshots use synthetic authorized test fixtures, not the candidate API or production data.

## Verification

Commands ran from ems-cloud-ui using the existing local dependency junction (ignored, not committed):

- node --test tests/ems-api.test.cjs tests/analytics-api.test.cjs tests/ems-ui.test.cjs: final 11 tests, 11 pass, 0 fail, exit 0, 18024ms. Covers exact/null/quality data, scoped authorization, cancellation/late guard, EMS-only navigation, alarm linkage, explicit legacy source, and all eight native UI entries with synthetic API fixtures.
- node node_modules/typescript/bin/tsc --noEmit: exit 0 after compact UI revision.
- node node_modules/vite/bin/vite.js build: final exit 0, built in 1.86s. Existing large-bundle warning remains (8.7MB JS).
- All test files without Playwright/chromium, node --test --test-concurrency=1: 82 tests, 82 pass, exit 0, 5509ms. Log task9-units-final.log.
- Frozen all-modules-analytics-ui test file: first 8 tests passed, ninth navigation timed out before assertions. Unchanged focused rerun --test-name-pattern='module06 API and demo layouts': 1 pass, 0 fail, exit 0, 21740ms. Log task9-analytics-final.log records original run.
- Focused report station permission UI rerun passed 1/1 after no-EMS panels were hidden from unrelated roles.
- git diff --cached --check: passed before commit.

TDD observations: exact adapter/request/generation tests initially failed with missing implementations; EMS-only platform navigation and alarm linkage initially failed; explicit legacy source initially failed; native overview boundary was absent before wiring. All were subsequently green. Later compact visual changes were verified by the existing fixture tests and screenshots, not claimed universally test-first.

An earlier canonical grouped full suite overlapped source/HMR changes and stalled; it was stopped and invalidated. Its early permission/layout failures led to the concrete no-EMS-panel fix. It is not reported as a passing suite or as unrelated baseline failures. Bounded affected suites were run on frozen code instead.

## Actual candidate API and limitations

Parent operates candidate API http://127.0.0.1:18090/api and Vite http://127.0.0.1:8443. Live unauthenticated gateway/catalog/cells requests returned 401; login CORS preflight returned 200. Managed bootstrap credentials did not authenticate; user login is pending in parent-owned visible browser. No authenticated actual browser network/data acceptance has passed. No auth context or route mocks were presented as real API evidence.

Current registered EMS count is zero. No real EMS UUID, physical mapping, power/SOC, cells or alarm value was invented to overcome this empty state. End-to-end authenticated empty-state acceptance and real hardware/query execution remain for Task10/live acceptance. Synthetic fixtures verify rendering and contracts only.

The report does not claim operational hardware freshness, gateway ACK/terminal execution or successful real mapping writes. Manual query polling and mapping paths are implemented; their actual success requires authorized genuine gateways/assets.

## User working tree preservation

Initial user diff was saved as task9-user-before.patch. Header.tsx, all-modules-shell.css and all-modules-overview-ui.test.cjs were untouched and unstaged. OverviewPage.tsx staged content was reconstructed from HEAD plus only the owned EMS import/prop/entry; user's map/ticker hunks remain unstaged. Both user untracked verification documents remain untracked. No unrelated source, backend, infrastructure or secret changes were committed.

## Review round 1 fixes (base b472d2d)

Both Important findings in task9-review1.md are addressed. EmsHistory now reads authoritative pointMappings/supportAggregations from each genuine gateway structure, keyed by station scope and gateway identity; permitted operations no longer depend on the current observation page. Historical chart type is derived from the bucket's original evidence. Last buckets select evidence using the backend sourceTime/receivedAt ordering; statistics use valid non-null typed samples. Text, missing evidence, conflict/reset and invalid quality remain chart gaps. Exact values remain unchanged in the table. Latest refresh cannot change the historical bucket type.

Manual history lifecycle now cancels its request generation, clears pending/result state and rejects late publication when document visibility becomes hidden. New queries are prevented while hidden. Existing scope/input/capability cancellation remains.

Focused tests use isolated synthetic fixtures only: point201 is absent from latest page (total201, hasMore true), point202 has a null latest type/value, and both return valid typed numeric historical curves. Mapped definitions approve avg independently of latest. The component test starts deferred history, dispatches hidden visibilitychange, checks pending cleared, releases the response, and verifies no curve is published. Production/authenticated browser acceptance remains pending.

Exact RED/GREEN evidence:

- RED: `node --test ems-cloud-ui/tests/ems-api.test.cjs` from repository root: 5 pass, 1 fail, exit1, 1480ms; `historyChartNumber is not a function` for typed historical evidence regression.
- GREEN unit after implementation: same command: 6 pass, 0 fail, exit0, 645ms.
- Visibility mutation RED: temporarily removed only the EmsHistory visibility listener, preserving the fixed file in ignored task9-history-fixed.tsx; `node --test --test-name-pattern='all eight native' ems-cloud-ui/tests/ems-ui.test.cjs`: 0 pass, 1 fail, exit1, 21611ms. Query remained pending after hidden; expected query button was absent. Restored the listener before final verification.
- Final GREEN: `node --test ems-cloud-ui/tests/ems-api.test.cjs ems-cloud-ui/tests/ems-ui.test.cjs` from root: 8 pass, 0 fail, exit0, 20241ms. Includes deferred component lifecycle rejection and both historical-only/null-current curves.
- `node node_modules/typescript/bin/tsc --noEmit` from ems-cloud-ui: exit0.
- `node node_modules/vite/bin/vite.js build` from ems-cloud-ui: exit0, 2.62s. Existing 8.7MB bundle warning retained.

Intermediate fixture setup failures (missing test point options; waiting for native option visibility/value attribute) and an incomplete textual replacement caught by TypeScript were corrected. They are not claimed as product behavioral RED evidence. No full suite rerun, backend mutation, user dirty edit or new visual design occurred in this round.
