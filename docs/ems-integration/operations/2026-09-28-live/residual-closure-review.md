# R1/R2 bounded closure review

Reviewed `b23b582..96df15d33b5e5573c146b6fb650bd07fb892e011` (five files), `residual-fix-report.md` and `residual-pg.txt`. This check follows the user's explicit continuation authorization and is limited to the two residual contracts. No broad review, test rerun, source change, subagent or deployment operation. Only this requested report was written.

## Dispositions

**R1 — ADDRESSED.** `TelemetryDecoder.java` now rejects negative cabinet-link timestamps with `ProtocolException` before constructing the link observation. Null and zero remain valid; generic ordinary-source timestamp behavior is unchanged. The existing `TelemetryConsumer` invalid-profile branch records bounded diagnostic evidence, commits and returns true, allowing the poll loop to commit that input offset instead of repeatedly hitting V16's constraint. V16 is unchanged. The actual isolated PG transcript reports 1 successful test, zero failed/skipped, 4177 ms. The test checks no database-failure counter, no fact/current-link write for the rejected frame, and successful current-link/fact progress for the next valid frame. This is real PG plus synthetic fact-sink evidence, not a newly executed Kafka test. The stricter link-only validation is the explicitly selected resolution of the previously documented wire signed-range ambiguity.

**R2 — ADDRESSED.** `historyChartNumber` now filters evidence by `selectedSourceTimeKind` before sorting or deciding numeric type whenever that property is present. Only an absent property uses legacy behavior. Present-but-invalid kinds produce no numeric plot instead of falling back to excluded evidence. Authoritative backend value/quality and conflict/reset checks are preserved; the original evidence array remains intact for details. Focused test cases cover later/same-time archive null, excluded archive text for numeric aggregates, archive selection, invalid source without archive substitution, invalid selector and absent-field legacy behavior. The implementation report records 7/7 helper tests passing and a successful UI build.

## Verdict

**Spec compliance for R1/R2: compliant. Task quality for this bounded correction: approved.** No concrete new regression was established in the five-file diff. Both residuals from the prior scoped review are closed; no additional fix/review loop is requested.

This approval is limited to these source contracts. Production artifact packaging/activation, migration/grant validation and the unchanged hardware, authenticated UI and 24-hour acceptance requirements remain with the controller and are not certified by this check.
