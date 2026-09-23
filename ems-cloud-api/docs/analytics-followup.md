# Analytics and reports API-mode follow-up

## Connected UI

- `AnalyticsAiPage` delegates to `ApiAnalyticsPage` in API mode; the original demo implementation remains behind `VITE_DATA_MODE=demo`.
- Both the global analytics page and station run-curve tab use the same authorized point/history UI. It fetches `GET /stations/{id}/points`, then `GET /points/{id}/history?from=&to=&minutes=` for an explicitly selected point, interval, and 1/5/15/30/60-minute granularity. Results are server bucket averages with sample counts. Missing buckets stay missing; a zero is shown only when the API returns zero. No live stream or derived energy/SOC/AI claims are made.
- Data download exports the queried server buckets as CSV with timestamp, point identity, unit, average value, and sample count. It is disabled before a successful nonempty query.
- Report center offers operations, revenue, and health only when the signed-in user has `report.export` plus the corresponding `strategy.read`, `revenue.read`, or `asset.read` permission and the role allows that report type. It calls `GET /stations/{id}/reports/{kind}?from=&to=` with Bearer auth and downloads the returned CSV. A failed request leaves an error in the UI and creates no record or file. A 401 clears only the matching token and dispatches the existing unauthorized event.
- Report CSV is generated directly by the server. There is no report archive/list or preview endpoint, so API mode does not show generated-record status or a fabricated preview.

## Navigation integration

- Parent's `apiRoleConfig` now enables `分析与报告` when `telemetry.read` or an eligible `report.export` combination is present, and `运行曲线` when `telemetry.read` is present. The component also filters its own tabs and report options using signed-in permissions.
- Parent owns final build and real-server E2E with authorized credentials.

## Verification

- `node --test tests/analytics-api.test.cjs`: 2 passed. Covers authorized point/history requests, sparse buckets and actual zero, report Bearer CSV, 403 error without file, and 401 session revocation.
- `node --test tests/analytics-ui.test.cjs`: 1 passed in Edge headless with intercepted API responses. Covers point selection, interval and granularity sent to history, empty result, sampled curve, report CSV download with Bearer authorization, and no second download after a 403. This is mocked browser contract testing, not real database E2E.
- `tsc --noEmit` passed after the concurrent workorder type error was fixed.
