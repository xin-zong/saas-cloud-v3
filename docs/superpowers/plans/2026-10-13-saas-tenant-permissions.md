# SaaS 租户与权限系统重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 不默认启动子代理；只有用户另行要求时才使用 subagent-driven-development。

**Goal:** 按已确认规则替换旧客户、组织权限模型，实现企业隔离、套餐约束、逐角色站点授权和企业入驻管理闭环。

**Architecture:** 在现有 API 内建立租户/权限模块，保留业务资源 ID 与资源级鉴权入口。新模型以企业为唯一租户边界、角色权限与套餐取交集；先扩展和验证，再协调切换并删除旧模型，不将新旧允许结果取并集。

**Tech Stack:** Java 21、现有 Spring Boot/JDBC/Sa-Token、PostgreSQL、ClickHouse、React 19、Vite、JUnit、Node test runner、Playwright。

**Spec:** [2026-10-13-saas-tenant-permissions-design.md](../specs/2026-10-13-saas-tenant-permissions-design.md)

## Global Constraints

- PostgreSQL 严格按三范式建表，所有关系具备外键、唯一性和必要 CHECK 约束。
- 第一版企业之间完全隔离，不提供安装商、服务商跨企业共享站点。
- 保留“角色授权绑定站点范围”；企业管理员覆盖本企业全部站点，包括以后新增的站点。
- 平台统一维护预制角色，企业只读；更新实时生效，企业需要不同权限时创建自定义角色。
- 一个邮箱只归属一个租户；Web/App 共用账号。邮箱规范化后在当前数据中心唯一。
- 删除旧客户和组织模型、目录页面、接口、外键及组织继承鉴权，不在企业内保留旧组织树。
- 邀请和欢迎邮件使用一次性激活链接，用户自行设置密码，不发送明文初始密码。
- 未获新指令前不执行云端数据删除或部署。
- 业务代码实施前使用 using-git-worktrees 建立隔离分支，前端变更前重新读取 Figma 最新对应页面。文档本身不要求启动应用。

## 执行约定与接口

代码根 `ems-cloud-api/src/main/java/com/enerlution/ems`，新租户模块放 `tenant/`，新权限计算放 `auth/`，不把完整实现塞进现有 PlatformController。测试包与实现包对应。

以下为任务之间固定契约，后续任务不能自行改名：

```java
// tenant/TenantContext.java
public record TenantContext(long actorId, long tenantId, String kind, boolean administrator) {}
// auth/CapabilitySnapshot.java
public record CapabilitySnapshot(TenantContext tenant,
    List<MenuNode> menus, Set<String> permissions,
    Map<Long, Set<String>> stationPermissions) {}
// auth/TenantAuthorization.java
public TenantContext context();
public CapabilitySnapshot snapshot(String client); // web | app
public void requireTenantPermission(long targetTenantId, String permission);
public void requireStationPermission(long stationId, String permission);
public List<Long> stationIds(String permission);
// tenant/TenantQueryScope.java
public List<Long> allowedStationIds(String permission, Long requestedTenantId);
```

`MenuNode` 在 T02 定义，包含稳定 ID、client、kind、nameKey、path、permissionCode 和 children。`context()` 必须检查账号激活/启用、租户启用及会话有效。基础个人操作不使用企业业务套餐权限。

测试流程固定为：新增行为用例 → 运行确认失败 → 最小实现 → 相关用例通过 → 复核 diff → 仅提交本任务文件。Java 测试使用本机 Maven/JDK 或项目标准 Maven 命令；首次先安装 `ems-cloud-protocol` 本地依赖，不改项目依赖版本。真实数据库用隔离测试数据库，禁止 public 上执行测试清理 SQL。

## T01：归属清单与有约束的新模型

**Files:** 新建 `ems-cloud-api/database/tenant-migration/preflight.py`、`ownership-map.example.json`、`tests/tenant_schema.sql`；新建 `src/main/resources/db/migration/V19__tenant_permission_schema.sql`。执行前核对迁移最大版本，若 19 已占用则顺延，不覆盖历史迁移。

**Consumes:** 设计第 1、3、5、10 节，用户确认的旧数据映射。
**Produces:** 新表和约束；预检输出 unmappedUsers、unmappedStations、duplicateEmails、crossTenantReferences，任一非空退出码为 2。

- [ ] 编写事务回滚 SQL 用例：A 企业用户不能成为 B 企业管理员；授予 A 用户的本地角色必须属于 A；站点不得越租户绑定；角色/模板 XOR；邮箱大小写规范化唯一；目录禁止环和五级深度。给每项唯一测试标识，捕获期望 SQLSTATE，未失败则整体失败。
- [ ] 用尚未安装新迁移的隔离数据库运行约束测试，确认失败是缺少新对象；安装迁移后重跑，所有非法写入被数据库拒绝。
- [ ] 按设计建新模型，保留旧运行表供切换前读取；不初始化“全量授权”。填写并审核映射清单后才允许后续数据回填。
- [ ] 验证预检输出：删去一条站点映射时返回 2，完整映射返回 0。只提交新迁移、预检和测试，提交信息 `feat: add constrained tenant authorization schema`。

## T02：菜单、套餐和有效能力计算

**Files:** 新建 `auth/TenantAuthorization.java`、`CapabilitySnapshot.java`、`MenuNode.java`、`tenant/TenantContext.java`；修改 `auth/GrantAuthorization.java`、`PermissionCatalog.java`；新增 `src/main/resources/tenant-menu-catalog.json`；新增 `src/test/java/com/enerlution/ems/auth/TenantAuthorizationPostgresTest.java`。

**Consumes:** T01 schema。
**Produces:** 上述固定接口；数据库查询保证角色与站点来自同一授权，服务端识别当前租户，不信任请求中的身份租户。

- [ ] 创建两企业、一平台、不同角色与站点范围的数据库夹具，验证：A 的运维角色仅绑定合肥、只读角色仅绑定上海时，上海写操作必须拒绝；只读权限即使存在于其他站点也不能拼接。套餐不含告警时 alarm.handle 拒绝。
- [ ] 运行 `mvn -Dtest=TenantAuthorizationPostgresTest test` 确认红灯；实现有效并集/交集及根菜单启停、模板可用性、管理员动态全站范围。
- [ ] 补充多个包重复贡献、单包停用、全包停用、模板脱离套餐、父目录停用、客户端分离、企业管理员访问平台菜单失败等用例；任何名称叫 Super Admin 的自定义角色不得获得管理员特权。
- [ ] 运行目标测试并提交 `feat: enforce tenant package and role station capabilities`。旧有效组织视图此时不删除，也不让业务默认切换半成品新鉴权。

## T03：账号、会话、激活及权限事件

**Files:** 修改 `auth/AuthService.java`、`AuthController.java`、`SessionTokens.java`、`config/AuthConfig.java`；新增 `tenant/ActivationController.java`、`ActivationService.java`、`auth/CapabilityEvents.java`、`src/test/java/com/enerlution/ems/tenant/ActivationHttpTest.java`、`auth/TenantSessionTest.java`。

**Consumes:** T02 context/snapshot；T01 激活、用户状态表。
**Produces:** `/auth/me` 新 DTO；激活 inspect/accept；个人资料/改密接口；提交后通知机制。

- [ ] 用 HTTP 测试验证邀请中账号登录失败、inspect 不消费令牌、accept 两次只有一次成功、过期/撤销令牌失败、旧邀请重发后失效。测试令牌只保存在夹具内，不打印。
- [ ] 运行 `mvn -Dtest=ActivationHttpTest,TenantSessionTest test` 确认失败；实现摘要存储、事务消费、密码强度和现有 BCrypt 字节上限。
- [ ] 验证禁用、租户停用及改密码撤销两个设备会话；改密码必须验证旧密码；权限收回后下一 HTTP 请求失败，已建立事件连接收到变更/关闭。
- [ ] 保留 MFA 和登录限流回归；提交 `feat: add tenant sessions and one-time account activation`。

## T04：企业申请、审批与可靠邮件

**Files:** 新建 `tenant/CompanyApplicationController.java`、`CompanyApplicationService.java`、`EmailChallengeService.java`、`MailDeliveryService.java`、`MailDeliveryWorker.java`、`TenantMailProperties.java`；新增 `tenant/CompanyApplicationHttpTest.java`、`CompanyApprovalConcurrencyTest.java`、`MailDeliveryTest.java`；增加邮件模板资源及环境配置示例。

**Consumes:** T01 申请/邮件表；T03 激活服务。
**Produces:** public 邮箱验证/申请/进度接口，platform 审批列表/详情/approve/reject。审批相关权限码 `company.application.read`、`company.application.review`。

- [ ] 编写用例：未验证邮箱不可提交/查进度，A 验证上下文不可查 B；Pending/Approved 和已有账号邮箱不可重复，Rejected 可创建新申请；两次并发 approve 只产生一个企业、管理员和欢迎邮件事件。
- [ ] 运行 `mvn -Dtest=CompanyApplicationHttpTest,CompanyApprovalConcurrencyTest,MailDeliveryTest test` 确认失败；实现锁行、409 已处理、必填拒绝原因、至少一个套餐与事务幂等。
- [ ] 实现可配置真实邮件传输与有界退避重试；供应商错误不得伪装“已发送”。测试传输失败不回滚已批准企业、不重复创建，重试不重复产生激活账号。队列中的激活载荷受保护，日志不含原始链接令牌。
- [ ] 核对企业字段、多选、电话国家码、地址四字段和申请时间线，提交 `feat: implement verified company onboarding and approval`。

## T05：平台菜单、权限包及预制角色管理

**Files:** 新建 `tenant/MenuManagementController.java`、`MenuManagementService.java`、`PermissionPackageController.java`、`PermissionPackageService.java`、`RoleTemplateController.java`、`RoleTemplateService.java`；新增对应 `tenant/PermissionConfigurationHttpTest.java`。

**Consumes:** T02 权限目录与能力重算；T03 提交后事件。
**Produces:** platform menus/packages/templates CRUD、排序、启停和影响预览。权限码分别 `menu.manage`、`package.manage`、`role.template.manage`。

- [ ] 测试企业身份不能调用平台配置；企业包不可选 Platform；目录循环/跨客户端/超四级/非法页面路径/不存在的接口权限码拒绝；自定义菜单不能创造后端能力。
- [ ] 运行 `mvn -Dtest=PermissionConfigurationHttpTest test` 确认失败；实现只允许已注册 route/permission 的配置、模块选择和半选投影。
- [ ] 测试包停用影响预览数正确、模板修改后既有成员下一请求变化、重复引用去重、企业无法修改预制模板。
- [ ] 运行验证并提交 `feat: manage tenant packages menus and shared role templates`。

## T06：企业、员工、角色与站点授权管理

**Files:** 新建 `tenant/CompanyController.java`、`CompanyService.java`、`PeopleController.java`、`PeopleService.java`、`TenantRoleController.java`、`TenantRoleService.java`、`TenantGrantController.java`、`TenantGrantService.java`；修改 `business/RoleController.java`、`MemberController.java`、`MemberGrantController.java`、`auth/GrantDelegation.java`；新增 `tenant/TenantGovernanceHttpTest.java`。

**Consumes:** T01—T05，逐条授权及模板资格。
**Produces:** 企业 profile/people/roles/grants 与平台 companies 管理，权限码 `company.profile.read/manage`、`company.people.read/manage`、`company.role.manage`、`company.grant.manage`、`company.read/manage`。

- [ ] 测试 A 管理员不能读取/改动 B 的人员、角色、站点；A 角色可与全局模板同名但不能与 A 自定义角色重名；改角色实时生效；企业角色不能保存套餐外权限；普通角色管理员不能给自己或已有角色成员添加超出可委派权限/站点/期限的能力。
- [ ] 运行 `mvn -Dtest=TenantGovernanceHttpTest test` 确认失败；实现唯一管理员保护、邀请/重发、字段级编辑控制、至少一个企业包及标签生命周期。
- [ ] 测试禁用负责人时站点同事务移交、失败整体回滚、无候选人管理员兜底、不能跨企业移交；负责人变更不自动授予权限。禁用和删除立即撤销会话，历史工单和审计引用仍可读。
- [ ] 验证租户普通管理权限与站点集合独立，提交 `feat: implement tenant people roles and scoped grants`。

## T07：01—08 业务资源与数据出口接入

**Files:** 新建 `tenant/TenantQueryScope.java`；修改 `business/DomainSupport.java`、`PlatformController.java`、`SettingsController.java`、`AssetController.java`、`EmsController.java`、`StationDesignController.java`、`MaintenanceController.java`、`OperationsController.java`、`MarketController.java`、`RevenueController.java`、`ReportController.java`、`TelemetryController.java`、`RealtimeTelemetryController.java`、`StationTelemetryService.java`、`EmsTelemetryQueries.java`、`AnalysisJobService.java`、`AnalysisJobController.java`；新增 `tenant/TenantBusinessIsolationTest.java`、`TenantDataEgressTest.java`。

**Consumes:** T02 鉴权及 T06 业务归属。
**Produces:** 所有业务资源使用 TenantQueryScope；保留持久化资源 ID 和既有业务端点。

- [ ] 为列表、详情、更新、汇总、工单受理、策略审批、EMS 查询、遥测历史、分析任务和文件下载建立 A/B 租户负例；未知/越租户 ID 不能暴露资源详情。
- [ ] 运行 `mvn -Dtest=TenantBusinessIsolationTest,TenantDataEgressTest test` 确认失败；从持久化资源追溯站点，替换旧组织分支 SQL，所有列表/统计/CH 查询使用授权 ID 集合。
- [ ] 验证平台 read 没有 write 时控制操作失败；仅跨租户权限但无业务权限也失败。任务执行、结果领取、下载及持续订阅在撤权后拒绝，个人中心仍可使用。
- [ ] 做旧模型引用检索并逐项登记，运行相关业务回归，提交 `refactor: enforce tenant isolation across business and telemetry APIs`。

## T08：登录、注册、申请进度、激活与个人中心前端

**Files:** 修改 `ems-cloud-ui/src/App.tsx`、`auth/AuthContext.tsx`、`auth/apiPermissions.ts`、`components/LoginPage.tsx`、`components/SystemSettingsPage.tsx`、`components/Header.tsx`、`components/StationGlobalHeader.tsx`；新增 `api/tenant.ts`、`tenant/types.ts`、`tenant/RegistrationPage.tsx`、`ApplicationProgressPage.tsx`、`ActivationPage.tsx`、`PersonalCenterPage.tsx`、`TenantRouteGuard.tsx`；新增 `tests/tenant-onboarding-ui.test.cjs`。

**Consumes:** T03/T04 API 契约。真实仅开放当前已部署环境；地图洲别不影响登录域名。
**Produces:** 新 DTO 驱动导航与基础账号流程，无权限统一页及实时能力重载。

- [ ] 先读取 Figma 设置/平台相关最新页面，记录画板、PRD 新流程入口及设计差异；若设计没有流程，沿共享组件补齐并明确记录，不声称已有对应画板。
- [ ] Playwright 用可控 API 验证三阶段注册、多选、Google Places 地址字段、验证码后进度、激活前不可访问业务、一次性密码设置、真实不可用环境禁选、403 路由；先运行确认失败再实现。
- [ ] 导航改为稳定键与服务端有效菜单；保留全局语言/时区/谷歌地图；基础个人中心不受套餐裁剪。Web/App 同账号契约不等于开发原生 App。
- [ ] 运行 `node --test tests/tenant-onboarding-ui.test.cjs`、`tsc --noEmit`、`vite build` 并按 Figma 核对，提交 `feat: add tenant onboarding activation and account UI`。

## T09：平台与企业管理前端，移除旧客户组织入口

**Files:** 修改 `components/ApiPlatformManagement.tsx`、`PlatformManagementPage.tsx`；新增 `tenant/CompanyApprovalsPage.tsx`、`PermissionPackagesPage.tsx`、`MenuManagementPage.tsx`、`RoleTemplatesPage.tsx`、`CompaniesPage.tsx`、`CompanyProfilePage.tsx`、`PeoplePage.tsx`、`TenantRolesPage.tsx`、`MemberGrantsPanel.tsx`；退休 `PlatformCustomersPanel.tsx`、`OrganizationPermissions.tsx` 及组织专用导航/样式；新增 `tests/tenant-management-ui.test.cjs`。

**Consumes:** T05/T06/T08。平台与企业使用一个前端应用。
**Produces:** PRD 5.2—5.5 可用页面及按钮表单，已授权的逐角色站点范围配置。

- [ ] 读取 Figma 最新平台管理、共享布局和必要新页面；编写审批 409、拒绝原因、套餐影响确认、预制角色只读、同名来源标签、员工重发与移交、管理员不可禁用等交互用例，运行确认失败。
- [ ] 使用现有 Workspace 表单/弹层实现页面；套餐内目录父子半选、Web/App 切换、套餐外项不出现、停用影响提示与保存错误保留表单内容。
- [ ] 删除旧客户/组织路由与接口调用，不保留换名后的组织树；无数据保持真实空态，不提供假审批、假邮件成功或假地区切换。
- [ ] 运行 `node --test tests/tenant-management-ui.test.cjs tests/display-preferences.test.cjs tests/timezone-boundaries.test.cjs`、类型检查、构建和目标页面截图核对，提交 `feat: replace legacy organization UI with tenant administration`。

## T10：迁移演练、协调切换与旧模型最终删除

**Files:** 新增 `database/tenant-migration/migrate.py`、`verify.sql`、`rollback.md`、`src/main/resources/db/migration/V20__tenant_permission_backfill.sql`、`V21__retire_legacy_organization_customers.sql`、`docs/tenant-permission-cutover.md`；删除不再使用的 `business/CustomerWorkflows.java`、`OrganizationWorkflows.java` 及组织专属服务；修改旧权限文档标明已退休。

**Consumes:** T01 已确认并通过预检的完整映射；T02—T09 已通过验收的同版本前后端。
**Produces:** 唯一运行权限模型；旧客户、组织及其关联正式删除；可恢复的备份/映射/验证报告。

- [ ] 在现有库备份的隔离副本中记录站点/设备/测点/EMS 绑定 ID 和行数；执行预检，不完整映射必须退出；不得使用 `DROP ... CASCADE` 隐式删除未知业务对象。
- [ ] 先回填 tenant/user/station 与经过审核的授权映射，核对普通成员迁移前后逐站点有效能力；不复制客户、组织权限、不把旧 integrator 直接当新企业类型。
- [ ] 新前后端协调切换后执行清理迁移，删除旧表、外键列、组织视图与组织客户专用触发器，旧接口返回 410。直接查询 `to_regclass('organization')`、`to_regclass('customer')` 应为 NULL，运行代码旧模型 SQL 引用为零。
- [ ] 至少两个企业完成跨租户负例和管理员正例，核对 CH 历史及上海拓扑 ID 未变；演练冻结写入、恢复备份和旧产物。不经数据对账不能覆盖切换后的新写入。
- [ ] 运行后端全量测试、前端实际 API/演示环境各自的相关测试、生产构建；整理邮件提供商、Google Places、可用域名的部署配置清单。没有真实邮件配置时标明部署阻塞，不模拟发送。
- [ ] 提交 `refactor: retire legacy customers and organizations after tenant cutover`。实际云端切换需届时指令，端口保持 18085；部署前再次备份、保留旧发布、上线后验证登录/菜单/业务/隔离/资源哈希。

## 完成判定

不是“权限页面能打开”就算完成。全部 PRD 正文功能、七项确认决策、两企业隔离、逐条角色站点约束、套餐与模板实时收回、会话及数据出口撤权、真实邮件闭环、旧客户组织实际删除及回退演练都要有测试证据。缺少邮件/部署配置或归属映射时准确报告对应限制，不将尚未执行的步骤勾为完成。
