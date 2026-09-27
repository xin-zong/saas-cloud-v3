# Scoped final-fix re-review

Range: `37f6d08..a49ca1702549dfdb6cfed363afaae6d30365894a` (25 changed files). This is the one scoped re-review of F1–F5, not a second whole-branch review. Read the final-fix brief, implementation report, immutable review package and focused evidence. No source/index/branch/deployment mutations, subagents, SSH or redundant test executions. Only this requested report was written.

## Verdicts

**Spec compliance: Not fully compliant.** F1–F4's original behavior is implemented; F5's backend identity and explicit selection policy are implemented, but its chart consumer does not consistently honor the policy. New link persistence introduces a permanent-failure retry regression.

**Task quality: Needs fixes / controller adjudication.** No Critical finding. Two Important residuals below. This verdict does not request another implementation wave; the SDD controller must adjudicate residuals under the final-review rule.

## Prior finding dispositions

| Finding | Disposition | Evidence |
|---|---|---|
| F1 legal alarm clearing | ADDRESSED | Both insert and update now consume `cleared`. The new full-envelope test goes through decoder/reliable acceptance/projection and covers active→cleared, cleared-first and unchanged manual acknowledgement. Actual worker focused transcript: 2/2 successful, zero skips. |
| F2 permanent MQTT poison delivery | ADDRESSED | ACCEPTED/REJECTED/RETRY separates definitive invalid input from transient failure; callback transport-ACKs REJECTED without saved business ACK. Actual persistent-session harness reports valid Kafka/PG progress after invalid input, no invalid saved ACK, legal reliable ACK and no poison redelivery after restart. |
| F3 quiet-device lease renewal | ADDRESSED | Scheduled renewal updates only still-live matching owner/fence under EMS lock, without changing heartbeat/connection; terminal release cannot remove a replacement owner's lease. Controlled PG test passed with zero skips; actual harness observed 35 seconds of device silence at 30-second TTL, preserved fence/reachability, and shutdown release. Fleet-scale throughput remains unmeasured, as disclosed. |
| F4 child link tri-state | ADDRESSED, with introduced Important R1 | Decoder carries Boolean/null and source time, admitted transaction persists period/fence/order, API scopes by authorized current period, UI labels last-reported cabinet state separately. Worker true→false→null/old-order/old-period and API isolation tests passed. New timestamp constraint has the retry problem below. |
| F5 source/archive deduplication | NOT FULLY ADDRESSED | Backend uses point/period/time-kind/time identity and source-first bucket selection before valid/null filtering; actual CH and unit evidence cover equal/different cross-kind values. UI exposes policy text, but chart type selection still mixes excluded archive evidence (R2). |

## Important residuals introduced by this fix range

### R1. New link timestamp constraint creates a permanently retrying fast-lane record

- **Introduced at:** `ems-cloud-api/src/main/resources/db/migration/V16__cabinet_link_current.sql:7`, `source_at_ms bigint CHECK(source_at_ms>=0)`; called by the newly added `TelemetryConsumer.java:87` persistence step.
- **Contract trace:** `TelemetryDecoder.java:94` accepts any signed-long integral source timestamp, including `-1`. Envelope validation likewise imposes no nonnegative bound. A complete otherwise valid `cabinet_30s` with `d.link.ts=-1` therefore reaches `CabinetLinkStore.store`, where PostgreSQL raises `23514`. `TelemetryConsumer.java:101–103` treats every such exception as a transient database failure, rolls back and returns false; its poll loop seeks back to the same offset. Repeating the same immutable input cannot succeed. Subsequent fast records on that partition remain blocked.
- This is a new regression: before this range the link timestamp was range-checked but not written to this stricter column. It does not depend on a schema outage or real hardware registration; an admitted device with an erroneous/pre-epoch timestamp suffices.
- **Wire-contract qualification:** directly checked the manifest's original `05_EMS与云端MQTT交互协议.md`, SHA256 `C00D096A3D4E418A5FCC411C51B03801132F657695E5DB5ECAE5540EC1D93E0D`, §3.3 lines154–155. It defines source UTC milliseconds/null and describes `d.link` as the EMS-observed EMU link; it does not explicitly impose unsigned/nonnegative bounds or explicitly endorse negative real observations. Signed-long acceptance is demonstrable in this application's current decoder, not an explicit external signed-range guarantee. Even if negative time is ruled invalid, the deterministic retry/partition blockage remains a bug.
- **Bounded correction:** either preserve current application acceptance and remove the nonnegative check from this not-yet-deployed V16, or retain the check and add link-specific nonnegative validation producing ProtocolException before SQL (existing invalid-profile diagnosis then commits the definitive outcome). The latter is the smallest stricter-validation correction if the controller rules negative time invalid. Do not blindly swallow all database constraint failures. Cover a negative link timestamp followed by a valid frame and prove the former cannot poison offset progress; preserve null and source/receipt distinction.
- The supplied tri-state tests only use positive timestamps, so their passing results do not cover this trace.

### R2. Chart still lets excluded archive evidence suppress a selected source value

- **Introduced contract change:** `EmsTelemetryQueries.java:160–164` now selects source-kind rows while retaining archive rows in `evidence`. `EmsHistory.tsx:22` still feeds this new result into `historyChartNumber` unchanged.
- **Affected consumer:** `ems-cloud-ui/src/api/ems.ts:53–59` sorts **all** evidence and determines the `last` bucket type from its last member; it never filters by `selectedSourceTimeKind`.
- **Concrete input:** same bucket has a valid numeric source observation at t=1000 and an archive null observation at t=2000. The new backend correctly returns `selectedSourceTimeKind='source'`, `value='12.5'`, `quality='valid'`, with both evidence rows. The helper picks the later archive row's null type and returns null, so the chart displays a gap despite the authoritative selected source value and table showing 12.5. A same-timestamp archive null with later receipt has the same result. Before the new policy, backend `last` would also select that archive row; the discrepancy is introduced by this range's policy change.
- **Bounded correction:** filter chart type evidence using the returned `selectedSourceTimeKind` before ordering/validity checks; retain the old behavior only when that field is absent for legacy results. Continue displaying all raw evidence in details. Add a focused helper/UI case containing both actual source and excluded archive rows, including archive null after numeric source. No broader frontend change is needed.
- Current changed browser fixtures supply selection metadata but only one numeric evidence row, so they verify policy text without exercising this mixed-evidence contract.

## Migration, provenance and grant assessment

V16 is a new runner-registered migration; old migrations and CH schemas are unchanged. Period FK supplies EMS/station ownership without redundant station fields, composite PK bounds current state per cabinet, and source/receipt remain distinct. API receives SELECT through the runner's existing broad grant followed by INSERT/UPDATE/DELETE revocation; worker receives SELECT/INSERT/UPDATE. No new raw payload or ownership mutation privilege is added. The store is reached under the existing admission/EMS transaction lock and performs fence/order checks. R1 is the identified migration/decoder inconsistency. Production apply/grant validation remains the controller's rollout responsibility.

## Evidence read and limits

- `final-fix-worker-focused.txt`: 2 tests successful, zero failed/skipped (4859 ms).
- `final-fix-lease-pg.txt`: 1 successful, zero failed/skipped (2500 ms).
- `final-fix-api-all.txt`: 15 successful / 1 failed of 16, zero skips; failure is the reported boxed-Boolean fixture construction NPE. This is not called a green full run.
- `final-fix-api-cabinet.txt`: corrected cabinet API test successful, zero failed/skipped, API_JUNIT_EXIT=0 (5120 ms). Combined with the prior 15 passes, covering cases have green evidence; there was no claimed new full-suite rerun.
- `final-fix-transport-green.txt`: FINAL_FIX_TRANSPORT_PASS and LIVE_EXIT=0, including persistent restart, quiet35s and release. Report explicitly separates this real wall-clock observation from the manipulated PG heartbeat ages.
- Local protocol/ingress/aggregation and synthetic browser/build results are documented in the implementation report; no redundant execution was performed here. Residuals above are deterministic source-contract traces, not claimed newly executed tests.

User four dirty UI files and two untracked documents remain outside the fix commit. No additional broad-review findings were raised. Genuine UUID/site/firmware, authenticated UI, two-site hardware acceptance, formal write-control contract and measured 24-hour capacity remain open external requirements. This code review does not certify production activation or full-goal completion.
