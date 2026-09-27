### Spec Compliance

- ❌ Issues found: historical numeric curves incorrectly depend on the current observation’s type (`ems-cloud-ui/src/components/EmsHistory.tsx:15`, `:20`); manual history requests do not follow the required hidden-page cancellation rule (`EmsHistory.tsx:19`).
- ✅ All eight native entry points are present: OverviewPage:36; StationOverviewPage:203 / StationDevicesPage:719; OperationsOverviewPage:38; MaintenanceCenterPage:1644; WorkOrdersApprovalPage:1570; ApiAnalyticsPage:61; ApiPlatformManagement:29; SystemSettingsPage:830. The package is additive EMS integration, without unrelated workflow redesign.
- ⚠️ Authenticated actual browser/API acceptance remains pending user login, as explicitly disclosed in task-9-report.md. Synthetic screenshots and fixtures are not live acceptance. Latest Figma inspection and visual overlap correction are controller/implementer evidence, not independently established by this immutable code diff.

### Strengths

- Exact decimal values, identifiers, nulls and quality survive the adapter; chart conversion is explicitly finite and presentation-only (`src/api/ems.ts:9`, `:16`). Tests cover unsafe-integer-sized IDs, opaque revisions, null and invalid quality (`tests/ems-api.test.cjs:17`).
- Scoped authorization gates station reads before any network request, and request generations prevent superseded or revoked work from publishing (`src/api/ems.ts:20`, `:37`). Resource keys include user, station and current grants; the polling hook cancels on scope replacement, hidden visibility and capability events (`EmsPanel.tsx:23`; `useEmsResource.ts:12`).
- Unknown current alarms retain last-known evidence with explicit wording; only known snapshots with zero members show known-empty (`EmsPanel.tsx:87`, `:94`). Original levels and business-link permissions remain visible/separate (`EmsPanel.tsx:104`).
- Mapping bodies and catalogue fields match the actual backend DTOs and frozen definitions; exact asset/binding/source IDs remain strings (`EmsManagement.tsx:23`, `:27`, `:29`, `:30`). Read-query operations/parameters and pending/sent polling match the server contract (`EmsPanel.tsx:111`, `:115`). Undefined configuration writes are disabled; manual business actions are explicitly distinguished from device ACK (`EmsPanel.tsx:92`, `:116`).

### Issues

#### Critical (Must Fix)

- None identified.

#### Important (Should Fix)

1. **Historical charts incorrectly disappear when the latest sample is absent or null.** `ems-cloud-ui/src/components/EmsHistory.tsx:15–20` selects type and aggregation metadata exclusively from the first 200 latest observations, then passes that current type into every historical bucket. A mapped numeric point outside that page, one with only historical data, or a numeric point whose latest valueType is null yields `unknown`/`null`, so `chartNumber` discards every otherwise valid historical numeric value. The exact table remains, but the required historical curve is incorrectly blank; a subsequent latest refresh can also alter an already queried curve. Use the returned historical evidence/type contract for each bucket and authoritative mapped definition metadata for allowed aggregation, rather than treating the latest value’s type as historical schema. Add a focused fixture with valid numeric history and absent/null latest data, including a point beyond the first latest page. Backend evidence checked: `EmsTelemetryQueries.java:175–180` returns bucket quality and typed original evidence.

2. **Manual historical requests continue publishing after the page becomes hidden.** `ems-cloud-ui/src/components/EmsHistory.tsx:19–21` cancels on scope/input/capability changes but never handles `visibilitychange`. Starting a slow historical query and hiding the browser leaves it active, and its response publishes while hidden. This differs from the task’s visible-page/old-request cancellation requirement and the report’s blanket hidden-visibility cancellation claim. Apply the same visibility-aware cancellation/generation rule used by `useEmsResource.ts:17–23`, and verify a delayed manual-history response cannot publish after hiding. The existing cancellation unit test only exercises the generic request gate; it does not exercise this component lifecycle (`tests/ems-api.test.cjs:38`).

#### Minor (Nice to Have)

- The build report retains an existing 8.7 MB bundle warning; this is acknowledged baseline noise, not evidence of a new Task9 blocker. No clean-console claim should be made.

### Assessment

**Task quality:** Needs fixes.

**Reasoning:** The native wiring, exact-data handling and explicit EMS contracts are sound, but history rendering and hidden-page cancellation have concrete gaps in required behavior. Authenticated live acceptance remains a separate outstanding gate.

**Review checks:** Read the immutable package; recovered truncated middle portions from the same package, without rereading changed implementation files except the focused work-order call-site contract check. No git mutation, test rerun, source edit or dirty-user-file edit performed. Named outside-diff checks: EmsController query/mapping/alarm DTO and permission contract; PointCatalog definition field names; EmsTelemetryQueries historical bucket type/evidence contract; WorkOrdersApprovalPage detail key call sites (confirmed plain order ID is correct). Report file is the sole authorized write.
