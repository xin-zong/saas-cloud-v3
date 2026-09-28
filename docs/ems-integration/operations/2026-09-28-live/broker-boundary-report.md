# Mosquitto packet-boundary compatibility correction

Scope: bounded repository correction authorized by controller; base96df15d. No SSH, cloud mutation, restart, Java/package/sourceUI change or subagents. Actual new8884 restart/release and boundary retest remain root-owned; old8883 must stay untouched. Existing dirty fourUI files/two docs preserved.

Root actual test discovered complete PUBLISH147456 and147457 both accepted with configured147456. Verified primary source https://raw.githubusercontent.com/eclipse-mosquitto/mosquitto/v2.0.18/lib/packet_mosq.c:line476 compares remaining_length+1 to max_packet_size, omitting the three Remaining Length encoding bytes near this threshold. CONNECT has a separate remaining_length>100000 rejection at449, so CONNECT tests cannot substitute for PUBLISH acceptance.

Changed strict.conf to configured147453 with clear2.0.18-specific comment, preserving approved fullpacket147456 and payload131072. Preflight queries the exact service binary `/usr/sbin/mosquitto -h`, requires exact version2.0.18 and fails with remeasure instruction on unknown/different version. Operations guide explains measured adjustment, independent CONNECT bound and pending root live147456/+1 proof. No protocol limit was increased.

Owned changed files:
- ems-cloud-ingestion/deploy/mqtt/strict.conf
- ems-cloud-ingestion/deploy/preflight.sh
- ems-cloud-ingestion/deploy/test-deployment.cjs
- docs/ems-integration/operations/2026-09-28-deployment/README.md

RED: `node --test ems-cloud-ingestion/deploy/test-deployment.cjs` before fix:exit1,7pass/2fail,3389.5008ms. Config expected147453 but got147456; installed version guard missing. GREEN same command after fix:exit0,9pass/0fail,3673.9586ms. Covers adjusted complete packet arithmetic plus unchanged payload, executes actual Bash version-guard function with accepted2.0.18 multiline banner and rejected2.0.19/2.0.180/2.1.0/empty/unknown, retains prior seven tests including shell parsing. `git diff --check`exit0. Arithmetic/source tests are not actual broker acceptance; root will prove actual packet147456 delivery/147457 rejection.

Self-review: exact binary path matches unit, strict version boundary rejects misleading version prefixes, error explicitly requires remeasurement; no legacy broker configuration or role change. Preflight still requires free8884 as a pre-start check; root running dedicated broker must perform guard/config validation and controlled dedicated restart rather than treat preflight as permission to stop legacy listeners. No migration or frozen backend hash changes. Owned commit `a8330f8` — Correct Mosquitto 2.0.18 full packet boundary;4files/36insertions/1deletion,commitexit0,cached whitespaceexit0. Review range96df15d..a8330f8.

## Actual help-status fix

Controller's actual preflight showed installed Mosquitto2.0.18 `-h` emits the expected version banner but returns3. Previous command substitution treated any nonzero status as failure before validating the version. Added `check_mosquitto_binary`: captures status safely under errexit, accepts only0/3, then validates the same exact2.0.18 banner; all other statuses fail even with a plausible banner. No packet/ACL/service/Java change. Source preflight and focused test only; root owns server file refresh/preflight/restart.

RED `node --test ems-cloud-ingestion/deploy/test-deployment.cjs`:exit1,8pass/2fail,3242.4003ms; handler absent and production wiring missing. GREEN same command:exit0,10pass/0fail,5386.819ms. New test executes actual handler with a shell helper returning0/3 and valid multiline banner (accepted),0/3+invalid/empty banner (rejected),1/2/4/127+valid banner (rejected), under `set -euo pipefail`. All previous tests retained. `git diff --check` and cached whitespacecheck exit0. Actual server preflight remains root evidence, not substituted by helper tests. Owned follow-up commit `4390ae5` — Handle Mosquitto help status in deployment preflight;2files/22insertions/3deletions,commitexit0.
