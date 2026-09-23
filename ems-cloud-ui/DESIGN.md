# Workspace Design System

## Phase One Scope

The shared application shell, primary navigation, station secondary navigation,
basic controls, station revenue page and system settings page use this foundation.
Operations (including schedule, market and settlement), maintenance, work orders
and approvals, and analytics / AI now share its headers, tabs, semantic colors,
type scale, control sizes and responsive section layouts. Remaining business
pages retain their local layouts but inherit the same green foundation. Local
page CSS must not override the shared sidebar or live-preview tool.

## Source of Truth

- `src/styles/workspace.css`: semantic tokens, shell and shared control styles.
- `src/components/ui/Workspace.tsx`: Button, PageHeader, Badge, Select and Switch.
- `src/components/StationRevenuePage.tsx`: data-heavy analysis page reference.
- `src/components/SystemSettingsPage.tsx`: grouped form page reference.
- `src/components/operations-center.css`: shared operational controls and tables.
- `src/components/AnalyticsAiPage.tsx`: station data analysis guide page.
- `src/components/GlobalAiDrawer.tsx`: global floating AI drawer available across pages.

## Foundations

| Role | Token / Value |
| --- | --- |
| Workspace background | `--ui-bg: #edf3ef` |
| Content surface | `--ui-surface: #ffffff` |
| Soft surface | `--ui-surface-soft: #fbfdfb` |
| Subtle surface | `--ui-subtle: #f4f8f5` |
| Divider | `--ui-border: #d8e3dc` |
| Main text | `--ui-text: #1d2f2a` |
| Secondary text | `--ui-muted: #61716b` |
| Primary action | `--ui-primary: #176b5d` |
| Selected state | `--ui-selected: #eaf5ef` |
| Success | `--ui-success: #16734b` |
| Warning | `--ui-warning: #925c0b` |
| Danger | `--ui-danger: #c02e36` |
| Chart emphasis | `--ui-chart-primary: #2f7c6a` |
| Chart comparison | `--ui-chart-secondary: #6e978a` |
| Chart supporting series | `--ui-chart-tertiary: #9aafa6` |
| Panel shadow | `--ui-shadow-panel: 0 10px 26px rgb(28 55 48 / 9%)` |
| Base control height | 36px |
| Control corner radius | 4px |
| Primary navigation | 184px expanded, 56px collapsed |
| Page inset | 20px desktop, 16px narrow screens |

Use the existing Inter / Noto Sans SC / system Chinese font stack. Page titles
are 20px, section titles 16px, body and controls 14px, metadata 12px. Letter
spacing is zero. Use tabular numerals for aligned metrics and numeric columns.

## Color Discipline

The product uses a restrained green operations-console theme: pale green page
backgrounds, white data surfaces, deep green active states and green-gray chart
marks. Green identifies active navigation, primary actions and selected controls;
it is not a per-category decoration.

- KPI values use `--ui-text`, including counts of alerts and items awaiting action.
- Charts use the shared muted green-gray tokens. Distinguish overlapping series
  with solid, dashed and dotted lines as well as color. Legends match the marks.
- Normal workflow statuses use neutral chips. Red and amber are reserved for
  small, labeled exception indicators, overdue times and validation feedback.
- Do not tint whole warning rows or assign different colors to every metric,
  revenue source, cost category or progress stage. Pending amounts and zero
  adjustments are ordinary values, not errors; reconciliation differences remain
  highlighted.
- Overview uses a softened green-tinted map base, white floating panels and a
  dark green station detail card. If map tiles fail to load, the page must still
  read as the same green operations surface rather than a blank white area.
- Keep global success / warning / danger tokens intact for feedback states. Do
  not change data models to impose presentation colors.

## Layout and Components

- Keep primary navigation available on every business page. At narrow widths,
  use the icon rail with accessible names and tooltips instead of hiding it.
- Organize pages as header, scope/filter toolbar, content and supporting detail.
- Use unframed sections with dividing rules; avoid nested cards and decorative
  shadows. Reserve framed surfaces for dialogs and genuinely framed tools.
- Use one primary command per action group, Lucide icons for tools, segmented
  controls for modes, selects for option sets and switches for binary values.
- Give every form control a programmatic accessible name. Keep keyboard focus
  visible and describe status in text as well as color.
- Reflow section grids on narrow screens. Tables may scroll inside their own
  container; the overall page must not acquire horizontal overflow.
- Use native modal dialogs for confirmation and date ranges. Support Escape,
  cancel and visible validation errors without silently changing committed state.

## Data and Interaction Boundaries

- Revenue metrics, trend and detail rows derive from `buildStationRevenueModel`.
  Preserve the station update bridge and existing calendar-range semantics.
- Revenue source selection scopes the composition section only. The primary
  time-range control scopes the whole revenue page.
- Charts use Recharts, fixed responsive heights, consistent legends and semantic
  series colors. Tooltips and rendered marks must fit desktop and mobile widths.
- Settings persist locally under `enerlution-system-settings-v1`. Saving stores
  `{ settings, savedAt }`; legacy flat values remain readable. Local persistence
  does not apply preferences to a backend, device, theme or localization service.
- Distinguish saved state, unsaved changes, defaults and storage errors. Restoring
  defaults modifies the draft; persistence requires an explicit save.
- The development-only live-preview status is collapsible. Its HMR connection,
  update count, data simulation and reload controls remain available.
  On narrow screens it sits at the bottom of the navigation rail to keep page
  actions accessible.
- Operations and maintenance retain their existing data models, filters, chart
  controls, CSV exports, dialogs and record drilldowns.
- Approval decisions and notes are local previews; agreement does not dispatch
  a command to devices. Closing detail clears the current selection.
- Analytics risk scores are local rules, not predicted failure probabilities.
  The guide page uses current station snapshots and routes into station-level
  analysis, revenue, alarm, device and strategy details. The global AI drawer is
  local only: no AI backend, strategy dispatch or work-order creation is
  connected. Missing historical data must not be replaced by fabricated charts
  or savings claims.

## Verification

Run `npx tsc --noEmit`, `npm run build` and `node --test tests/operations.test.cjs`.
With Playwright available in the environment, run
`node --test tests/workspace-ui.test.cjs` against the existing Vite server at
`http://localhost:8443/` (override with `PREVIEW_URL`). Browser tests use isolated
storage and save screenshots under `.figma/stage-one/`.
Run `node --test tests/centers-ui.test.cjs` for the four migrated centers and
operations subpages; screenshots are saved under `.figma/centers/`. The visual
regression checks assert the green background, green-gray charts and neutral
metric text.

Check 1440, 1280, 1024, 390 and 320px widths, navigation expansion, date validation,
live data updates, chart tooltip bounds, CSV export, settings persistence and
errors, approval details and AI input / snapshot updates. Future page migrations
should reuse this foundation rather than add
another local palette, control system or global navigation override.
