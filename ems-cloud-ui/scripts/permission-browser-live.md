# T12 opt-in real browser acceptance

Current attempt is `permission-t12r2` (983001/983002). The original `permission-t12` 982xxx attempt was retired after a runner navigation timeout; its two roles and audit remain as history. Never reactivate or reuse it. Role saves now wait for the clean idle UI state after capability refresh, and subsequent mutations wait for their completed dialog/list transition before continuing.

Run only against reviewed local branch services after the root operator provisions the reviewed `ems-cloud-api/database/tests/permission_browser_fixture.sql` with `psql -X`. This is not part of test discovery. It makes real writes in the isolated `permission-t12r2` organization and must never run against ordinary accounts or mock routes.

From `ems-cloud-ui`, run `node scripts/permission-browser-live.cjs` with private environment variables:

- `EMS_PERMISSION_LIVE=permission-t12r2` (mandatory explicit opt-in).
- `EMS_PERMISSION_TEST_PASSWORD` (mandatory private generated fixture password, 12–72 characters). Provisioning separately consumes only `EMS_PERMISSION_TEST_PASSWORD_HASH` through psql `\getenv`.
- `EMS_PERMISSION_FIXTURE` (optional path to checked-in `permission_browser_fixture.json`).
- `PREVIEW_URL` (default `http://127.0.0.1:8443`).
- `EMS_TEST_API` (default `http://127.0.0.1:18090/api`). Both services must be loopback URLs.
- `EMS_PERMISSION_RESULT` (private ignored JSON result path; default `../.superpowers/sdd/2026-09-23-prototype-permissions/task-12-live/result.json`).
- `EMS_PERMISSION_ARTIFACTS` (optional screenshot directory, default `browser-screenshots` beside the result).

The runner checks the exact actor, organization and two stations before creating a target member and two empty roles via UI, saving role permission matrices, and assigning independent A-edit/B-read grants. Separate actor/target browser contexts exercise a real A save, B PUT403, revocation, a held target form PUT403, and focus-triggered capability refresh in the same target session without reload. Ledger IDs are written immediately after each creation. Screenshots assert actual 1280×720 and 1440×900 viewports and document width. Failure screenshots preserve rendered actor/target pages; password inputs remain browser-masked. No storageState, tokens, password values, request bodies, trace or HAR are saved. Only stage/error type are printed on failure because Playwright error stacks can contain filled credentials.

JSON contains `namespace`, `actorId`, `targetId`, `roleIds`, `grantIds`, `checks`, `screenshots`, `status`, `stage`, and on failure `failedStage`/`errorType`. Exit zero plus `status=passed` indicates browser workflow success only; cleanup and root review are separate gates. Screenshot file names/dimensions and checks contain no credentials.

The root operator must run reviewed `permission_browser_cleanup.sql` in a finally path on either success or failure, then verify retired accounts cannot log in. Cleanup disables the exact fixture actor/target, deletes only their grants, and retains accounts/roles/organization/stations/audit as tombstones. Provisioning refuses any namespace collision; never automatically retry, re-enable tombstones, overwrite fixtures, or add authority to existing users. A failed run needs independent diagnosis and an explicitly reviewed new fixture lifecycle before another execution.

The real runner does not replace the API-mode mocked edge-case regressions (focus, unavailable-role narrowing, errors, long identity layout), demo compatibility suite, existing-account read-only checks or prototype visual comparison.
