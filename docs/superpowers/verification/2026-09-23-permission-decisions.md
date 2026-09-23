# 权限改造实施决策记录

按作出顺序保留实施过程中的判断，便于后续复核；测试和切换证据见同目录验收记录。

1. Ruling: User now authorizes implementation after baseline upload; supersedes historical plan-only sentence. No legacy database touched. Scope expansions for actual users still forbidden.

2. Ruling: Isolated worktree is authorized by developer autonomy instructions; no extra confirmation. Skill referenced task-reviewer.md is absent; used existing task-reviewer-prompt.md and code-reviewer.md rubric.

3. Ruling: task-brief script only recognizes English Task N headings; equivalent exact section extraction used for Chinese T01 headings, all task text retained.

4. Ruling: Each enabled catalog row records current or planned enforcement; tests distinguish current bindings from T04/T05 future bindings instead of falsely claiming new endpoints exist in T01.

5. Ruling: Preserve old capability semantics explicitly, including no-site configuration accounts. New granular permissions mapped only where old operations were already possible; governance initialization requires a separate explicit bootstrap command, never blanket integrator grants.

6. Ruling: Add independent management_organization_id to app_user (T02/T03/T09). organization_id is movable/null membership; immutable administrative scope is needed to safely list/re-add unassigned members without exposing other organizations. Distinct relationships satisfy3NF; cost one necessary FK. Legacy no-org/no-owner accounts remain unmanaged, not global.

7. Ruling: analytics.history.read shared endpoint stays non-enforcing candidate too, existing telemetry.read retains history access. No alias replacement in T04. T01 fix2 a5c2413, targettests green.

8. Ruling (supersedes grantor NOT NULL sentence in T02 brief): historical user_role/user_station have no grantor recorded. granted_by must permit NULL for unknown imported grants; current API always sets authenticated actor. NULL issuer identifies historical migration in DTO, no fabricated attribution/no redundant source column. Keep FK for known issuers, valid_from NOT NULL is import-effective timestamp, not historical award time. T02 tests updated accordingly.

9. Ruling T03 null-org legacy member: use non-editable NULL-owned clone legacy__onull__r<ID> rather than literal original role_id, so split-code enrichment cannot mutate retained original role_permission snapshot. Preserve station capabilities, never global organization scope. Three workspace identities use owner/operator/integrator__o<org>__r<oldid> prefixes only as display workspace labels.

10. Ruling T04: device.health.read andalarm.to.workorder remain non-enforcing sharedcandidates because currentpayload/optionalfield endpoints notseparateoperations; actualasset.read/workorder.create retained. auth/mefilterscatalogavailable codes. Approval.read reviewer-onlymapping (newmodelrolesonly) + selfsubmitter/currentstation branch preservesold access, no blanketreadergrant.

11. Ruling asset.edit requires asset.read same targetstation (oldAssetController returned station(id) andthereforeimplicitlyrequiredread); retainconjunctionbeforemutation, documentforUIhints butdon'tautograntread. Independentsame-stationgrantscanprovideconjunctivecapabilities.

12. Ruling T05/T07 organization picker: extend existing organization read with explicit purpose=roles|grants scoped to corresponding capability, preserving default member-read behavior. A child-only role manager must not be blocked by default administrative owner outside role scope; fallback first authorized org, UI sends explicit selected org. Cost if wrong: one small query contract to revise, no privilege widening.

13. Ruling T08 full-permission preview: original button switches to editable role tab, losing form context. Use reusable read-only grouped preview preserving grant draft; no role.manage requirement for assignable-role inspection. Costifwrong: previewinteraction differs intentionally under userform-optimizationauthorization, originalstyle retained.

14. Ruling T06 retained inactive roles: preserve/narrow same-role grant edits may retain inactive rolecodes withfullcurrentscope+governancechecks, withoutrequiringauthorityoverhistorical/permanentunchangedaccess. Newassignment/addstation/extendinterval requiresnormalavailablecode/delegationchecks; no silent sharedrolechanges. Why: T05canAssign is newassignment upperbound, mustnotpreventsafe revocation/narrowing of migratedgrants. Costifwrong: revise narrow-edit classification, no permissionexpansion intended.

15. Ruling T06/T08 pure organization roles: permitzero-site NEWgrants whenroleonlyavailableorganizationcodes(or empty), notonlylegacyzero-site. Otherwiseorg-onlydelegatorcannotassignorg-onlyrole withoutinventingarbitrarysiteaccess. stationSelectionRequiredoptionsfieldguidesUI; anyavailablestationcode requiresnonempty. Costifwrong: tighten zero-site validation, but no wildcardsite semantics ornewDBfield.

16. Ruling dependencycorrection T06/T07/T08: minimal /members?purpose=grants scopedtargetdirectory needed for independentgrant-onlyoperator; omitprofileextras/defaultreadunchanged. T07 mustwireplatformnav granularcodesbefore T10 orrole.manage-onlybrowsercannotreachnewpanel. Costifwrong: two smallread/routingcontracts movingearlier, no writeauthority orDBexpansion. RootconfirmedcurrentSettingsController49 andapiPermissions63 mismatch.

17. Ruling T06readscope: organization.member.read/member.grant.manage inspection authorizes in-branch grantmetadata evenzeroactorstationselection; doesnotgrantassetdata orwrite. Out-of-branch roleowner/member/stationredactswholegrant. Sharedorgscopehelper factoredfromrequireScope; mutationstillrequiresownexplicitstationcapabilities. Costifwrong: adjustmetadata visibility contract; no operationalpermissionsadded. Rootwaitingdirectory+readRED testsfreeze beforefullclassrun. T07noassetreadloadStations earlyempty prerequisite added toavoidunrelated403banner.

18. Ruling T09unassignedcreate: CreateDTO optionalmanagementOrganizationId added(noDBfield). Nonnullmembershipdefaultsadministrativeownertoexplicitselectedorg; nullmembershiprequiresexplicitmanagementOrganizationId via scoped管理组织picker; separateownerifprovidedmustalsobeauthorized. Why: prototype未分配组织stillneedsboundedmanagementownership; neverglobalorfirst-visibleimplicitowner. Costifwrong: adjustcreateform/requestcontract, no permissionexpansion orschemaoverhead.

19. Ruling T09hiddenlead edit: computedlead_restricted true redacts id/name; omittedleadUserId preserves, explicitnull clears, numbervalidates. UIprotectedkeepoption forcurrentunselectablelead, name-onlysaveomitsfield. Why: privacyredactionmustnotbeinterpretedasemptyfieldand silentlycleared; authorizedorgmanagerexplicitassignmentchangeallowed. Costifwrong: adjustDTO/formcontract, no DBfield orprivilegeexpansion.

20. Ruling: T10 minimal GET /stations/options?permission=<available STATION catalogue code> returns exact active per-code {id,name} only; validate missing/unknown/unavailable/org-only400 and no-grant403/consistentdocumentedempty. Why: workorder/inspection/otherstationcapabilities mustremainusable withoutasset.read, existingloadStationscouplesfullinventory. Costifwrong: smallendpoint/clientcontextcontract adjustment; noDBfield/migration/technicaldataexposure. Frontend mustnotadaptminimalidentities into fake0technicalmetrics orassetdetailrights. Workordercreateoptions exactcreatecapabilitydistinctreadsites. /root/capability_integration implementingT10base1369d6e(rootdocsfb467b6).

21. Ruling: T10strategy-onlyreuseexistingstrategyviewwithin运营中心 with返回策略执行; tariff.manage-onlygetsAPI-only运营中心→电价设置 tab+minimalexactauthorizedstationpicker, reuseexistingtariffcomponent. Why: independentbackendtariff.read/writecapabilitymustbeusablewithoutasset.read; originaltarifflivesonlyassetdetail. Userallowsfunctionalnavadjustmentwithprototypevisualstructure. Costifwrong: smallAPI-onlysecondarynavigationplacementrevision; noDB/schema/newbusinessdata orpermissionbroaden. Assetreadexistingstationtarifftabretained, demoROLE_CONFIGunchanged. Do notexpandhandle/edit-onlyreadrights; explicitbackendreadconjunctionsremain.

22. T11 committed289a22d; independent review dispatched existing /root/review_capability_integration with task11-only package after spawn failed agent thread limit reached. Ruling: reuse an independent completed reviewer for T11 when fresh thread creation is unavailable — same independent review gate retained, no implementer self-review — cost if wrong: prior-task context may bias reviewer, mitigated explicit scope and final branch review. Root changed-class MemberOrganization15 JDBC2661 running; code frozen. Live lifecycle helper ASTchecked only; no service/DBpermanentactions.

23. Ruling: T12 reuses completed /root/individual_grants implementation seat because harness freshagent limit persists — new boundedbrief/report/taskscope and independent reviewer preserve separation — cost if wrong: oldcontext influence, mitigated explicit noT06rework and finalreview. RootCUA existingowner/operator/integrator authenticated read-only; owner assets/detail/revenue/report, operator maintenance/health/firmware/workorders/approvals/todos, integratorasset2sites/platformcustomersempty. Found APIfirmware fabricatedPCS01..04/path0% despiteunconnected; sentT12concreteregressionfix preservinglayout/demo. CUAproto3viewportstuck499x632; agentmustuseverifiedPlaywright1280/1440 referencecapture, rootlive4actually1280.

## 中文决策摘要与判断错误时的代价

1. 上传基线后继续执行已列出的实施计划，不操作旧库。 **若判断错误：**如果理解偏差，需要重新界定实施范围。
2. 采用独立工作树；缺失的审查模板使用同目录现有模板替代。 **若判断错误：**需要调整工作树组织或审查记录。
3. 中文 T01 等任务标题用等价分段提取，保留任务全文。 **若判断错误：**需要重新校对任务边界。
4. 权限目录区分已经实现与计划接入的接口。 **若判断错误：**需要修正目录状态与测试绑定。
5. 迁移保留原访问语义，首位角色管理员单独初始化。 **若判断错误：**可能需要业务方重新确认旧权限映射或初始化步骤。
6. 成员管理归属与可移动的成员组织关系分别保存。 **若判断错误：**增加一个必要外键；若业务定义不同，需要迁移关系。
7. 历史趋势候选权限暂不独立生效，保留现有 telemetry.read。 **若判断错误：**后续独立接口实现时需调整映射。
8. 历史授权没有已知授予人时允许 NULL，不伪造来源。 **若判断错误：**如以后补齐历史事实，需要回填来源。
9. 无组织的历史角色使用不可编辑的 NULL 归属副本。 **若判断错误：**增加迁移角色副本，后续归属整理需显式处理。
10. 设备健康、告警转工单候选项保持不可用，审批查看保留原有可见范围。 **若判断错误：**接口拆分后需重新绑定候选权限。
11. 站点编辑继续要求同站点的查看权限，两者可来自不同有效授权。 **若判断错误：**若产品要允许盲写，需要修改这一契约。
12. 角色与授权的组织选择器按用途读取各自可管理组织。 **若判断错误：**需要维护额外的查询用途契约。
13. 完整权限改用只读预览弹窗，保留授权表单草稿。 **若判断错误：**与原型跳转交互存在差异，可按反馈调整。
14. 含停用能力的旧角色允许安全缩减授权，扩张仍严格校验。 **若判断错误：**需要维护缩减与扩张的分类规则。
15. 纯组织权限和空角色可以授予零站点，零站点不表示全部站点。 **若判断错误：**若业务禁止此种授权，需要收紧校验。
16. 将独立授权对象目录和细粒度导航提前实现。 **若判断错误：**计划执行顺序改变，接口仍需整体维护。
17. 组织成员查看权限可检查范围内授权元数据，越界整条隐藏。 **若判断错误：**如可见性要求变化，需要修改元数据读取规则。
18. 创建未分配组织的成员时，要求显式管理组织。 **若判断错误：**表单与创建契约比原型多一个必要选择。
19. 负责人因权限不可见时，省略字段表示保留，显式空值才清除。 **若判断错误：**需要维护省略与空值的不同语义。
20. 提供按具体权限读取最小站点身份的接口，避免依赖资产读取。 **若判断错误：**增加一个小型接口契约。
21. 独立策略与电价权限通过运营中心复用现有页面。 **若判断错误：**二级导航位置可能需要按用户反馈调整。
22. 新代理创建达到限制后，T11 复用已经完成工作的独立审查者。 **若判断错误：**存在旧上下文影响判断的可能，由限定范围和最终审查补偿。
23. 同一限制下，T12 复用已完成工作的实现代理并独立复审。 **若判断错误：**存在旧上下文影响判断的可能，由新任务简报和审查补偿。
24. 并发刷新测试只暂停首个响应，并为等待设置超时；允许晚到写入引发必要的第二次刷新，保留旧快照失效的精确回归。 **若判断错误：**测试可能减弱对并发错误的辨识能力，由原有精确用例和独立复审补偿。

原始补充裁定：Ruling: T12 grouped concurrency harness may hold only the first auth snapshot and must bound every deferred wait; allow the legitimate trailing refresh already required by T10 instead of assuming one network ordering — production invalidation epoch intentionally schedules a second refresh for late writes — cost if wrong: concurrency test could become less discriminating, mitigated exact stale-snapshot regressions and independent scoped review.
25. 真实浏览器首次验收失败且完成清理后，后续使用全新隔离编号，不复活已有测试身份，保留失败证据。 **若判断错误：**新测试库会多保留一组停用测试记录。
26. 授权表单增加组织和到期信息后，保留正常纵向滚动中的页脚，明确记录与原型差异，不宣称固定页脚或像素一致。 **若判断错误：**需调整页脚固定方式，同时避免遮挡站点选项。
