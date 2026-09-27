### Finding Verdicts

- **Historical numeric curves disappear when latest data is absent/null** — **ADDRESSED**. `ems-cloud-ui/src/api/ems.ts:53–60` derives chart eligibility from each historical bucket’s typed evidence and retains null/conflict/reset/quality gaps. `ems-cloud-ui/src/components/EmsHistory.tsx:16–19` uses mapped definition permissions for aggregation, and `:22` no longer references current observations for plot type. `EmsPanel.tsx:46` supplies genuine gateway identities instead of latest values. Added fixtures cover both a point absent from the current page and a null-current point, requiring an actual rendered curve (`tests/ems-ui.test.cjs:50`); helper tests also reject numeric-looking text (`tests/ems-api.test.cjs:57`).
- **Manual history does not cancel when the page becomes hidden** — **ADDRESSED**. `ems-cloud-ui/src/components/EmsHistory.tsx:21` cancels the generation and clears results/pending state on hidden visibility, with listener cleanup; `:23` prevents starting another hidden query. The deferred component fixture checks pending-state removal and no curve after releasing the late response (`tests/ems-ui.test.cjs:51–53`). The appended report documents a visibility-listener mutation RED followed by restored GREEN.

### New Breakage in the Fix Diff

- None identified.

### Out-of-Scope Observations

- Authenticated live browser/API acceptance remains pending and is not established by the synthetic fixture tests. This is the existing external acceptance boundary, not a reopened fix finding.

### Verdict

**Fix round:** All findings addressed, no new Critical/Important breakage.

**Checks:** Reviewed immutable `b472d2d..d7d12eb` package and appended fix report. One focused outside-diff contract read confirmed `EmsController.java:99–103` provides string `measurement_point_id` and mapped `supportedAggregations` through the authorized structure route. Report records final focused tests 8/8, TypeScript exit 0 and build exit 0; existing bundle warning remains disclosed. No tests rerun, git commands, source changes, or user-dirty-file changes; this report is the sole authorized write.
