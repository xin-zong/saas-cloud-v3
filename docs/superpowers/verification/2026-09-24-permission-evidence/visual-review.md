# T12 visual self-check

This is the implementer's visual self-check, not independent approval. Root/final branch review owns acceptance. No live browser interaction, remote operation or fixture change was performed for this review. Saved real screenshots were viewed with the image tool and compared against the previously inspected16 static prototype references.

## Evidence

- Prototype: `task-12-reference/`,16 images, actual1280×720 and1440×900, dimension assertions recorded in `dimensions.json`.
- Real attempt2: `cutover/permission-t12r2/browser-screenshots/`,20 images: role matrix, organization, long member table, empty grants, grant form, permission preview, two independent grants, target A-edit/B-read, revoke confirmation, same-session revoked target; both sizes. All20 images visually inspected. Root reports workflow PASS, cleanup PASS, retired-login401 PASS; the screenshot/result artifacts remain the real evidence and are not overwritten by mocked follow-up captures.
- Real runner's dimension ledger reports documentWidth equal to each viewport. This excludes document-wide horizontal overflow for captured states; it does not by itself prove every inner scroll region is usable.

## Findings before CSS round3

**Important: member permission preview is clipped and loses matrix spacing.** Both real preview screenshots show a680px-wide dialog with text against the border, inline helper explanations and lower catalog content cut off. Source investigation confirms same-specificity generic `.api-platform .orgv2-modal` is loaded after the intended `.api-platform .member-grant-preview` rule and overrides width/padding/overflow with680px/0/hidden. Shared PermissionMatrix styles in `role-permissions-panel.css` are scoped only to `.role-permissions-panel`, so the member preview misses block helper text, consistent group heading sizing and spacing. This is a concrete defect, not an accepted pixel difference.

**Same override affects revoke/term/leave confirmations.** The real revoke images show title/body against the border, although cancel/confirm controls are visible. They use the same member confirmation class and generic modal conflict. Round3 regression will check actual padding and all action rectangles for all three dialogs at both sizes.

## Other inspected states

- Organization: left tree/right organization and member cards preserve structure and palette. Long tree label truncates within its card; member names/accounts truncate instead of wrapping unpredictably; columns remain within cards. Empty lead is explicit 未配置. No invented child organization or member row.
- Member table/detail: the long target name truncates in the table and is readable in detail. All row actions stay within the table at both sizes. Empty grant state retains header/columns and clear invitation; it does not render a fabricated assignment.
- Grant form: organization selector, absolute expiry and server-authoritative expiry explanation are additions to the prototype. At1280 they increase height so lower actions sit below the screenshot; at1440 cancel/save are visible. This is not evidence of an unreachable footer: real grant saves completed after Playwright scrolled to the action. No fixed-footer/pixel-parity claim is made.
- Two grants: separate role/site/source/expiry rows readable at both sizes; A/B names wrap at1280 without intruding into neighboring columns, remain single-line at1440. Available row actions and role summary preserved.
- Target before revoke: A pencil present, B pencil absent; missing telemetry remains dashes/unknown. After revoke: only B row remains, no held editor or edit pencil; permission-changed banner visible. Both real captures agree with runner's rendered-state/API assertions.
- Role matrix: screenshot is taken after saving and retains the scrolled position, so its top is outside the crop. At1440 its clean disabled footer is visible;1280 crop does not alone prove footer visibility. Successful real save proves action was reachable in the run. Post-save toast overlaps part of the disabled footer at1440; record as nonblocking transient overlay rather than hidden active control.

## Explicit adaptive differences

Prototype role matrix has3 columns at1280 and4 at1440. Implementation has3 columns at both and includes unavailable/scope/historical-code explanations, requiring more vertical scrolling. API connection banner and capability-driven navigation also differ from fixed demo identities. Main sidebar, tab, card, table and station-selection hierarchy/palette are retained; these screenshots do not demonstrate pixel-identical parity.

## Round3 follow-up

Root authorized minimal member-dialog specificity and shared matrix style fixes, with DOM computed-style, actual wheel scrolling to the final platform permission, confirmation-action geometry and marked mocked screenshots at both sizes. No authority/backend change or another real fixture is needed. Results will be appended after RED/GREEN and image inspection; independent scoped review still required.

## Round3 result

RED4/4 reproduced computedpadding0 at both sizes. CSS fix restores preview padding24px/width up to1000px/auto scroll and confirmation padding28px/width up to600px, using scoped specificity; extends the existing shared matrix styling to the member preview. GREEN6/6 includes actual wheel scrolling to the visible final platform item, helper text displayblock, padding/overflow and all confirmation button geometry. Ten screenshots under `task-12-round3-mock/` were individually inspected: readable grouped text, separate explanations, no horizontal clipping, final item reachable and all confirmation actions in bounds. These images are mocked/synthetic catalog evidence and clearly separate from the20 real pre-CSS-fix images. The preview header naturally scrolls out with its body; Escape closes it at the bottom, as verified. No claim of a sticky preview header or pixel parity.

The Important visual defects above are resolved in implementation and affected verification, pending independent scoped review. Existing r2 real authority workflow and cleanup remain passed; no retired fixture was reused. Shared role-panel regression is running; root/final branch review still owns task acceptance.

Shared-style regression completed: role-permissions API UI8/8pass,69.15s; no added role-panel regression found. All round3 evidence is now recorded; independent scoped/final branch review remains the acceptance gate.
