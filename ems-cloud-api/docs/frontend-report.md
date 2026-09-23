# Frontend integration report

Implemented in ems-cloud-ui only, plus this report. Original sidebar, map, assets, maintenance, workorder and settings page shells retained. API mode is default; VITE_DATA_MODE=demo explicitly restores prototype mode. VITE_API_BASE_URL defaults to http://127.0.0.1:18090/api. Vite is running on http://127.0.0.1:8443 (process exec session 6259).

## Connected

- Login POST /auth/login; challenge/MFA POST /auth/mfa; restore exclusively through GET /auth/me; token in sessionStorage. No demo account shortcuts or fixed MFA hint in API mode. POST /auth/logout attempted before local session removal. Unauthorized responses clear matching current session. Numeric user/station identifiers normalized to strings; server supplies permissions and station scope.
- Authorized station pagination GET /stations, scope filtered again on client. On account change the authenticated component unmounts, old requests abort and previous station state disappears. Manual refresh reloads server state. Errors shown instead of retaining stale station data. All real stations have explicit empty telemetry/revenue/device/alarm collections and connected operations/maintenance sources to prevent prototype fallback generation.
- Permission-gated per-station devices, points (metadata only, not telemetry), alarms (paginated), inspections (server cap 200), firmware tasks (server cap 200). Missing observations remain unknown; device status supports unknown. Alarm history and maintenance rows adapted. Alarm acknowledgement in existing maintenance event details sends POST /alarms/{id}/acknowledge and refreshes server data.
- Existing workorder center reads paginated server workorders. Existing create modal posts station/title/description/numeric assignee/deadline. State transitions send expectedStatus/status/note and refresh, preserving conflict errors. Detail supports numeric reassignment PUT and GET event history. API mode bypasses local demo orders/status overrides. Assignment IDs must be known by operator; there is no member picker yet.
- Existing station edit page saves actual supported fields using PUT /stations/{id}: name, ratedPowerKw, capacityKwh, region, address, longitude, latitude. Unsupported fields disabled and explicitly explained. New-station and local draft controls disabled. Save waits for server response; error remains in edit dialog.
- Existing settings page GET /settings; PUT each changed allowed scalar preference; rereads persisted server values. Supported keys: defaultEntry, defaultTimeRange, rememberSiteTab, language, timezone, units, theme, density, chartAnimation, highContrast. This is preference storage, not enforcement/application of all those settings. Security and notification controls and account profile changes are disabled; no claim that stored preferences enforce security.
- Operations center retained with current-day plans (only latest approved plan targets, never executed telemetry), market services (confirmed/running/completed/cancelled only; draft/submitted excluded), qualifications, and trailing-year settlements (server max 1000 records). All permission gated. Explicit connected market/settlement data defeats fallback seeding. Settlement maps record identity/status/currency/contract/statement/estimate/category lines/readiness only; realized/paid/pending balances remain unknown rather than fabricated.
- Overview retains map/cards, with configured asset capacities and unknown telemetry/energy/revenue. API station coordinates come from server only, no demo id-based coordinate fallback. Environment labeled test and unknown communication shown as unknown in ticker/map.

## Not connected / limitations

- No real telemetry, ClickHouse series, power/SOC/health/energy flow, prices or available market capacity UI adapter yet. Empty series and unknown labels, not fabricated zero readings. Internal Station.status uses offline sentinel for missing telemetry because original union lacks unknown; primary API status labels show unknown and maintenance communication remains null.
- Station overview API panel shows verified asset identity/capacity and unknown telemetry within original station tabs; prototype flow diagram is withheld. Detailed revenue, strategy, tariff and electrical topology tabs disabled. Existing strategy implementation generates cloneSegments even when supplied plan is explicitly empty; therefore it must not be re-enabled before removing those fallbacks. Server tariffs/topology not loaded by this integration.
- Analytics/reports, platform/member administration nav explicitly disabled with server-not-connected reason. Global AI and live demo data simulation unavailable in API mode. Assets smart-view editor disabled. Favorites/filter selections remain local UI preferences; server data are not synthesized from them.
- Inspection and firmware records read, but execution/completion/upgrade mutations not connected. Firmware buttons disabled. Inspection transition handler returns explicit unavailable message. Approvals/review decisions and review notes not connected. No server inspection creation UI. No upload or real firmware dispatch.
- Alarm-to-workorder shortcut in station detail disabled; create actual workorder in center instead (alarmId link not currently exposed). Maintenance notes/settlement review notes disabled. Alarm follow/visibility and filter controls are local UI view state.
- Workorder source/device/priority controls retain prototype modal layout; modal explicitly states these fields are not saved. Server orders do not invent a device; numeric assignee is shown. Priority visual is existing client deadline heuristic, not backend priority. Event timestamps use returned created_at when present.
- Settlement realized/settled/pending/payment totals and review history are not fully adapted; unknown amounts remain unknown. Dashboard revenue history remains empty despite settlement records being available in settlement page. Service execution telemetry is not loaded. Current-day plan loader does not fetch selected historical/future dates automatically.
- Most business data load is all-or-nothing: any authorized endpoint error displays error and clears station state. Missing permission skips request and banner identifies permission-scoped loading, but all per-module empty states do not yet distinguish no-permission from no-rows. No invented permission successes; server enforcement remains authoritative.
- Demo-specific browser suites were not run against API mode (their fixtures depend on demo passwords). API MFA implemented but not independently browser-tested here; parent owns real credentials and real server E2E. No Java/Maven or backend code modified.

## Verification

- pnpm install --frozen-lockfile passed using bundled pnpm. No dependency changes.
- node --test --test-force-exit tests/api.test.cjs tests/operations.test.cjs tests/api-ui.test.cjs: 45 tests passed (42 existing pure business tests, 2 new client/adapter tests, 1 new Edge headless UI contract test).
- New UI test explicitly INTERCEPTS API responses; it validates real-mode login UI, Bearer headers, unauthorized station suppression, asset no-NaN output, existing create modal payload and refreshed workorder, restore via me and logout request. This is mocked API contract testing, NOT real database E2E.
- node node_modules/typescript/bin/tsc --noEmit passed.
- node node_modules/vite/bin/vite.js build passed. Existing large bundle warning remains (~8.95 MB JS, ~1.29 MB gzip).
- Parent separately reported real browser login + station data + session reload passed; that evidence is parent-owned, not represented as this agent's mocked test evidence.
- No commits, screenshots, node_modules or dist added to source control. Workspace is not a Git repository, so status/commit cannot be checked here; generated dist/node_modules are locally present and ignored by existing rules.

## Phase 2 — strategy, tariff and inspection completion

This section supersedes the matching phase-1 unsupported-feature bullets above.

### Newly connected

- Strategy detail tab re-enabled. API mode renders a bounded daily-plan editor using the original strategy page shell, card/header/button styles and timeline, rather than the unsupported weekly optimization/AI/simulation flows. Date selector GET /stations/{id}/plans?date=; actual server versions selectable, including draft/submitted/approved/rejected with explicit labels. No rows means no plan, no cloneSegments or generated presets.
- Strategy save POST /plans creates a NEW server version with stationId, selected date, dayAhead/intraday kind, and explicit startMinute/endMinute/mode/powerKw periods. Client validates time parsing, overlap, nonnegative/finite power and station rated-power bound. Server validation remains authoritative. Save rereads versions. Existing versions are never overwritten.
- Strategy submit POST /plans/{id}/submit is enabled only for an unmodified server draft. UI explicitly says internal approval and not dispatched/executed by EMS. Server failures remain visible and do not set success state. Controls gated by strategy.read / strategy.manage.
- Tariff detail tab re-enabled using the existing tariff configuration/table layout. GET /stations/{id}/tariffs retrieves actual versions. Missing tariffs means empty periods, not default 0.32/0.68/1.08 price fixtures or localStorage records. Version selector and new-effective-period control are present.
- Tariff save POST /tariffs sends stationId/name/currency/validFrom/validUntil/periods. validUntil explicitly exclusive; UI checks overlap against loaded periods and server remains authoritative for races. Each save creates a new effective period and never claims to overwrite an existing tariff. Full-day contiguous period validation remains; negative prices permitted in API mode; peak/flat/valley/superPeak supported. Reads and writes require tariff.manage. Rereads after success.
- Existing inspection detail now offers Complete for pending server inspections and POST /inspections/{id}/complete {note}, prompting for result and refreshing station data after confirmed success. Cancel remains disabled; no invented processing state or local status override in API mode. Error and server assignment enforcement retained.

### Phase 2 remaining limits

- No EMS/device execution or dispatch, simulation, AI optimizer, weekly recurrence, SOC override priorities, or runtime enforcement. API strategy is a date-scoped plan definition plus internal approval submission; approvals themselves still need separate review integration.
- Changing/save/submitting strategy reloads that detail page's server versions. Other App-level operation snapshots update on the existing global Refresh, not automatic cross-module invalidation.
- Tariff dynamic supplier connections and separate buy/sell channels are unsupported; dynamic supplier and sell tab disabled in API mode. The single server tariff uses the existing primary table. Billing-method selector fixed to period-based definition. New period must not overlap any saved effective period. Editing retrieved values creates a new version only after nonoverlapping dates are chosen.
- Inspection creation/cancellation/reassignment are still unconnected. Completion prompt and endpoint are implemented but this phase did not separately browser-test inspection completion.

### Phase 2 verification

- Added pure planning test: explicit empty plans preserved; row adapter conversion; overlap, missing periods and over-rated power rejected.
- Added Edge headless API-contract test with intercepted mock responses: empty strategy state, create draft request payload, internal submit, empty tariff state, negative price/new effective period payload, successful refresh and duplicate-period rejection without second POST. NOT real database E2E.
- Targeted five API tests passed, TypeScript noEmit passed, production build passed (same large-bundle warning).
- Full API + existing business tests now 47 total (42 existing pure business tests, 3 API/adapter tests, 2 mocked UI contract tests).
