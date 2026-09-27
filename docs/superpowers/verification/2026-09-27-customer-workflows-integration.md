# Customer workflow integration

## Scope and entry points

- Platform management → Customer management → New customer: persist name, owner organization, entity and contact; customers may exist before any station is linked.
- Customer detail → Edit profile: persist profile fields and display authorized associated stations.
- Assets and stations → Edit station → Customer: associate or clear a customer when permitted; unchanged association is omitted from unrelated edits.
- New-site basic information: customer selection is an isolated local draft only. Station deployment and contract activation remain unconnected.

The user-approved scope and API contract are recorded in the implementation plan and `ems-cloud-api/docs/customer-workflows.md`. Fresh Figma nodes: 1673:5775, 1673:6001, 1673:6227, 1127:9052, 2136:8507.

## Verified before rollout

- Real PostgreSQL rollback suite: 110 tests, zero failures/errors, one separately opt-in role-directory diagnostic skipped. Subsequent strengthened migration checks: 5 passed, zero skipped.
- Frontend initial failures (wrong preview environment, short navigation waits and unhydrated LFS assets) were retained in evidence and corrected; final scoped test results are in the frontend verification document.
- Task1 independent review approved. Task2 stale customer-options responses after capability changes were fixed and verified by two held-response regressions. Final cross-layer review found string customer IDs on the wire; numeric serialization and a strict mock fixed it. Both scoped re-reviews approved, with no open blocker.
- The six pre-existing main-worktree dirty files are preserved by SHA-256 checks. No unrelated map/header modifications are included in this branch.

## Rollout status

Completed on 2026-09-28 (Asia/Shanghai):

- Backup: `/var/backups/ems-cloud-v2-proto/customer-v10-20260927T160932Z.dump`, created with restrictive permissions and checked with `pg_restore --list`.
- Stopped old API, applied V10 through `database/apply.sql` in one transaction, and confirmed version10. Only `ems_cloud_v2_proto` changed; old databases and ClickHouse were untouched.
- Restarted local API on18090 from the reviewed build. Health returned200/UP, unauthenticated customer access returned401. Live jar SHA-256 matches the reviewed package: `1B003B9E82C48C61405D3CE64872A4657AD7909E8876714436D54CB4670F34C0`.
- Fast-forward merged through4f2658a to local main. All six original dirty-file hashes remained identical; no remote push.
- Main-worktree customer workflows:7/7 passed, zero skipped; final typecheck and production build exit0. These UI tests intercept API traffic and do not represent authenticated production writes.
- Post-migration database:2 original stations,0 customers; test schema has0 tables/functions. No fabricated customer data remains.
- Evidence is archived locally under `.figma/customer-workflows/evidence`; original API jar is retained in `.figma/customer-workflows/runtime-backup` for rollback. These artifacts are excluded locally from Git.

The managed initial password did not authenticate the current superadmin account (one HTTP401, no retries or reset). The user was asked to log in after deployment for a real UI write check. No valid user session was provided during this run, so authenticated live customer creation/save remains for user acceptance; real PostgreSQL rollback tests and intercepted UI tests are distinguished above.

## Decisions retained

1. Implement the approved customer/profile/association scope without activating station deployment or contract services. Those services require a later backend iteration.
2. Give each customer one owning organization and retain all-station governance checks. Future multi-owner customer sharing requires a migration and revised access rules.
