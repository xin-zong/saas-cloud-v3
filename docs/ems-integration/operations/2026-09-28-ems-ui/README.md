# EMS frontend implementation evidence

Task9 code range: `ffdaf27..d7d12eb` (`b472d2d` implementation, `d7d12eb` history fix). All eight native module entries are wired; the default EMS surface is compact and detailed evidence can be expanded. See the implementation report for the entry/design matrix and exact commands.

Independent review found two important history defects: numeric curves depended on current-page observations, and manual queries lacked hidden-page cancellation. Both were fixed; scoped re-review reports all findings addressed and no new Critical/Important breakage.

## Validation boundaries

- Final affected adapter/component tests: 8 passed; TypeScript and build passed. The implementation report includes commands, timing and RED/GREEN observations.
- Prior non-browser suite: 82 passed before the history fix. The archived unit transcript is labeled accordingly, not represented as a final post-fix full run.
- Frozen affected analytics run: first eight cases passed, ninth navigation timed out before assertions; unchanged focused rerun passed. The transcript and report preserve this distinction.
- Earlier full browser suite overlapped HMR changes and stalled. It was invalidated; there is no full-browser-suite success claim.
- Existing 8.7 MB bundle warning remains.

All screenshots under `fixtures/` are synthetic automated test fixtures, including deliberately extreme exact values. They demonstrate rendering only, not real gateway telemetry or authenticated candidate API acceptance. They were captured after compact layout correction; the subsequent history fix changes typing and cancellation behavior, not these default layouts. Root independently viewed overview, operations, expanded platform and expanded analysis. The implementer inspected all eight defaults against the selected current Figma representatives.

## Actual candidate runtime checks

Root started the current backend on server loopback 18090 and forwarded it to local 18090; Vite runs on local 8443. Unauthenticated station EMS, point-definition and cell routes returned HTTP/code 401 with no data. Login CORS preflight returned 200 for the exact local origin. These checks prove network reachability, auth rejection and CORS only.

The managed bootstrap password did not authenticate the enabled superadmin account. No credential was reset and no session was fabricated. The user has been asked to log in locally; authenticated browser/API acceptance remains pending. Production gateway registrations remain zero because genuine device UUID/site mappings have not been supplied. No fake binding or hardware value was inserted for this task.

Root independently compared the four initial user-dirty files' added/deleted lines with the remaining unstaged changes: all were preserved. No push or main merge was performed for Task9.

Root read-only authorization check used the actual effective_station_permission view (not legacy user_role): superadmin@prototype.local has ems.read, ems.manage and ems.query on both existing station IDs 4 and 5. This verifies stored grants, not an authenticated HTTP session.
