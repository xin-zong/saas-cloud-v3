# Bounded residual R1/R2 fix report

Base: `b23b582`. User/controller explicitly authorized continuing with the two residuals from `docs/ems-integration/operations/2026-09-28-final-fix/final-fix-rereview.md`. This is a bounded correction, not a reopened whole-branch review. No subagents, cloud/SSH operations, credentials, push or merge performed here.

## R1: negative cabinet link timestamp

Confirmed that the generic signed-long timestamp decoder accepted -1 while the V16 cabinet link table requires nonnegative timestamps. The existing fast consumer would therefore return false on deterministic SQL constraint failure and retry the same offset.

Kept V16 unchanged, as directed. Added a link-specific check immediately after timestamp conversion in TelemetryDecoder. Negative link timestamps now raise ProtocolException before persistence; TelemetryConsumer's existing invalid_profile path retains bounded evidence, commits the definitive outcome and returns true. No blanket SQL-constraint swallowing or generic timestamp policy change.

Tests:

- `TelemetryDecoderTest#negativeLinkTimeIsDefinitivelyInvalidWithoutChangingOtherTimestampRules`: negative link rejected; null preserved; zero allowed; a negative ordinary BMS source timestamp remains accepted under the existing separate contract.
- `TelemetryProjectionPostgresTest#negativeLinkTimestampIsDiagnosedThenValidFrameCanProgress`: exercises a full decoded cabinet frame against real PostgreSQL and a synthetic fact sink. The bad frame must return the poll loop's consumable disposition, retain invalid_profile evidence, produce no DB-failure counter, no fact and no current link. The following valid frame must be accepted and produce its current link and fact. This tests the same accept result used by offset commit; it is not claimed as a new actual Kafka broker run.

## R2: selected history evidence in chart conversion

Confirmed historyChartNumber sorted all retained evidence even when the backend selected a single source-time kind. A later excluded archive null could therefore suppress a valid source numeric aggregate.

When selectedSourceTimeKind is present, the helper now filters type evidence to matching sourceTimeKind before ordering and numerical checks. Only a truly absent field retains legacy behavior. Raw evidence remains unchanged for detail display; authoritative backend value/quality and conflict/reset guards remain unchanged.

Focused helper regression includes excluded archive null later than source, archive null at the same timestamp with a later receipt, avg/min/max/delta with excluded archive text, selected archive evidence, selected null source without archive substitution, missing/invalid selected kind, and the legacy absent-field fallback.

## RED/GREEN evidence

- RED protocol: Maven selected TelemetryDecoderTest → 13 tests, 1 expected failure: negative link input did not throw ProtocolException.
- RED UI: `node --test tests/ems-api.test.cjs` → 7 tests, 1 expected failure: selected numeric source chart value was null instead of 12.5.
- GREEN Maven: `-q -pl ems-cloud-ingestion -am package -Dtest=TelemetryDecoderTest -Dsurefire.failIfNoSpecifiedTests=false` → 13 protocol tests passed, zero failures/skips, worker test classes compiled and current protocol JAR/worker package generated.
- GREEN UI: same selected helper command → 7/7 passed, zero skips.
- UI production build: `node node_modules/vite/bin/vite.js build` passed; only the pre-existing >500 kB chunk warning remains. No broader UI/browser test rerun.
- `git diff --check` passed; only repository CRLF notices.
- Actual isolated PostgreSQL targeted result: 1 PASS, 0 skips, 4177 ms from immutable worker test archive `c8e5e23073d8664171a7d6fc55cdccdf3cde49cb1d09befe5012cc27d19689fe`, including current protocol JAR. See `residual-pg.txt`. The initial server runner setup lacked the JUnit launcher and failed before any test ran; controller added the 1.12.1 launcher helper and the actual targeted run passed. The assertions confirmed consumable invalid-profile diagnosis/no DB failure/no fact, then valid frame current-link/fact progress.

## Ownership and handoff

Only five owned source/test files changed. No migration file changed. The four original user-dirty UI files and two untracked verification documents are preserved. Root owns managed credentials, actual-resource setup/cleanup, deployment and operational verification. Source/targets were frozen after packaging for root's immutable test copy. No new general review or broad test loop requested. Real hardware, authenticated manual UI and measured 24-hour acceptance limitations remain unchanged.

Both residuals are now implemented and targeted verification is green. Source is frozen for controller release packaging; no further review loop is requested. Root will package the final reactor so every release embeds the current protocol.

Owned commit: 96df15d33b5e5573c146b6fb650bd07fb892e011. Post-commit status contains only the original four dirty UI files and two untracked user documents.
