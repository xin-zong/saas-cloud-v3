# Page completion and local startup

Goal: complete existing prototype management pages with real API behavior, then verify local frontend/backend running together. New databases only; no EMS dispatch, onboarding, external transactions or payments.

Previous turn: progress — new DB migrations and core API/UI tests succeeded. Remaining page gaps explicitly documented in frontend-report.md.

Work ownership and checks:
1. Approval pages: WorkOrdersApprovalPage, permission-based review, server persistence and empty/error behavior. Independent agent.
2. Platform pages: PlatformManagementPage/OrganizationPermissions plus scoped missing platform endpoints. Independent agent.
3. Analysis/download/report pages and station historical curves: independent agent.
4. Root integration: permission-based navigation, settlement adapters/review, market drafts, topology, page gap audit and runtime.
5. Review all changed capabilities; run typecheck/build, meaningful API/UI tests, actual local browser and database integration. Confirm listening services and usable startup documentation.

Shared boundaries: agents do not edit App, Sidebar, common API client/adapters/stations. Root integrates these. Platform backend additions cannot broaden default grants. Existing scope excludes execution and security-policy features requiring external infrastructure; show this boundary explicitly without fake success. Parent rebuilds backend once agent Java edits finish.

Completion requires page-by-page evidence, not only a green build. See follow-up reports for detailed capability/test results.
