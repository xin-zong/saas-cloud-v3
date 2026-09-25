# Task 4 strategy implementation report

Scope: strategy only. Tariff pages/assets/model were implemented separately by the root agent. This task imports StationPriceSettingsPage for the overview edit-price entry and onOpenStrategy return. Shared api-ui.test.cjs/capabilities-api-ui.test.cjs include the root-authored tariff assertion changes, committed together with authorization from root.

## Current design evidence

Current Figma contexts and screenshots fetched and inspected during this task, file Y0KMYFvalDXgSPnVZ5zG39:

- R10 overview 2343:12073; editor 2353:12784; arbitrage 2353:13122; demand 2461:13070.
- Dynamic price 2486:12681; PV self-consumption 2486:13064; capacity 2486:13447; backup 2486:13842; frequency 2486:14235; VPP 2486:14630; AGC 2486:15019; peak 2486:15411; AVC 2486:15804; priority 2486:16197.
- R9 unique interactions: create 1324:6562; settings 1324:6755; delete plan 1324:6948; edit slot 1324:7118; delete slot 1324:7460; default 1334:7162; renewable smoothing 1417:8996; AI panel 1317:7951; AI preview/confirm 1317:8441; inserted draft 1317:8945.

Screenshots are visual targets, not implementation assets. Current contexts are cached in ignored .figma/strategy. Downloaded original SVGs are public/figma/strategy. Shell assets are owned by the existing shared workspace. Strategy icons, radio markers, switches, modal divider, mode divider and knob retain their intrinsic root geometry.

## Behavior and routes

Assets & stations -> station -> 策略运行: R10 price/timeline overview, select local preview, create/edit/delete local strategy, price settings entry. Strategy cards deliberately say local preview rather than claim hardware activation. Operations -> 策略执行 -> 查看策略 remains available for strategy-only identities without asset.read.

Editor: name/description, settings, weekday-based slots, all base/overlay pages, advanced switch, enabled-condition checkboxes, drag and keyboard priority ordering, editable charge/discharge periods and enable toggles, default settings, confirmed slot/plan deletion, local save, unsaved return/cancel guard, scoped browser persistence. Read-only mode disables mutation. Auth refresh revocation closes mutation dialogs and disables saving.

AI drawer: API mode clearly reports service unavailable and disables generation. Demo mode offers explicitly named local rule preview, not a claimed AI response or revenue prediction. A preview copies the current plan, accepts explicit reserve SOC, displays differences, and only inserts a separate local plan after confirmation. Original plan remains unchanged.

## Real data and backend boundaries

- Browser drafts scoped by data mode, user ID, station ID. No cloud/EMS activation represented by local save or selected card.
- Existing server POST /plans and POST /plans/:id/submit retained in InternalPlans; internal approval never represents device execution. Existing charge/discharge/standby day-plan editor remains distinct from unsupported advanced-mode drafts.
- No AI, VPP, AGC, peak dispatch, AVC or EMS dispatch API exists in this frontend contract. External modes remain visible with honest unconnected states, and cannot be enabled/saved as connected modes.
- Overview loads authorized current-date purchase tariffs only. No valid date price means an empty chart; independent sale price has no API and is labelled unconnected. No Figma sample prices are presented as online data.
- Demo initial plan copies actual demo station delivery-plan rows; no invented R10 sample strategy names or schedule rows.
- Explicit local weekday conflicts, bounded parameter values, recovery thresholds, charge/discharge overlap and power limits are validated.
- Shared App/StationDetail navigation lifecycle was not changed; root owns outer navigation guards and last-subnav restoration work.

## Verification

Runtime: C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe, v24.19.0. Browser: Playwright channel msedge, headless. Demo8450/API8451. No oxfmt; formatting uses ephemeral pnpm dlx prettier@3.6.2, without project dependency changes.

- Tests first: strategy-model test initially failed for absent model; strategy-ui initially failed for missing R10 overview.
- strategy-model.test.cjs: 4 passing tests (weekday overlap boundaries; mode/period limits; unavailable dispatch and immutable order; persistence recovery).
- strategy-ui.test.cjs: 2 passing flows (all R10 mode pages and local management/AI confirmation/persistence; API invalid values, overlap, unavailable AI, auth revocation and zero network writes for local configuration).
- API strategy shared test passed: exact 25kW charging payload, server draft creation, submit internal approval, tariff creation and overlapping-period rejection.
- Strategy-only capability shared test passed: station B read-only, station A editable, no asset-list request.
- TypeScript noEmit passed after final implementation/formatting.
- Screenshots: ignored ems-cloud-ui/.figma/strategy; overview/editor1440, all base and overlay modes, priority, API readonly, editor1366/1920. Compared layout with fetched Figma and corrected modal dimensions/placement, parameter fields, asset geometry, and checkboxes. 1366/1920 document-width overflow assertions passed.
- Full shared api-ui.test.cjs + capabilities-api-ui.test.cjs: 18/18 passing (PREVIEW_URL=http://127.0.0.1:8451), including workorders, strategy, tariff, capability mutation/focus/timer refresh, firmware and device health regressions.
