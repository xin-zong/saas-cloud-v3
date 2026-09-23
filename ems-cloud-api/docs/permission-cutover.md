# 权限切换与验证运行手册

只操作 `ems_cloud_v2_proto`。V1–V5 不修改，不开启 Flyway。此文是可审查的操作步骤，不表示正式迁移、临时账号建立或首位角色管理员已经执行。

## 切换顺序

1. 完成代码审查、Java/SQL 回滚测试和两种模式的 UI 测试。核对新库当前 `schema_migration`；V1–V5 基线使用下面的 `--with-v6` / `--with-migrations` 参数。已安装 V7 的库不能再次执行 V7 一次性导入。
2. 核实旧 API 的 PID、命令行、监听端口后停写；不可只凭历史 PID 停进程。停止后创建新的 `pg_dump -Fc` 备份，0600 保存于受控服务器目录，并用 `pg_restore --list` 验证归档。记录真实新备份路径；仅查找上次备份不算完成备份。
3. 管理连接执行 `psql -X -v ON_ERROR_STOP=1 -d ems_cloud_v2_proto -f database/apply.sql`。该脚本使用同一事务、迁移锁和版本表；重复执行跳过已登记版本。V7 只迁移旧模型一次，V8 安装实时有效权限视图，V9 登记 `role.manage`，不会自动赋予现有账号。
4. 执行 `database/tests/permission_cutover_assertions.sql`。`apply.sql` 最后的 REVOKE 位于 ALL TABLES 的广泛 GRANT **之后**，保证 `user_role` / `user_station` 对应用身份只读；旧表和原角色定义继续保留。
5. 如明确选择补齐尚未分配的默认定义，单独执行 `database/initialize_unassigned_templates.sql`。这不是迁移的隐含副作用。脚本取规范模板与当前可用目录交集，仅追加缺失权限、不删除自定义权限，不建立任何用户授权。任何 `member_grant` 引用（含未来、到期、停用成员）或旧 `user_role` 引用都会排除该角色。迁移锁、治理锁和表锁阻止同时分配。重复执行无新变化、无重复审计。生成器 `python database/generate_template_sync.py` 只写本地 SQL；每次目录变化后重新生成并审查差异。
6. 首位真实角色管理员仍需操作者明确选择账号、组织、可配置能力和期限，另行审查初始化命令。**不运行默认账号提权，不根据 `member.manage` 自动赋予 `role.manage`。** 未作出选择可以启动系统，但没有角色配置入口是预期状态。第 5 步定义中的能力不等于分配给任何成员。
7. Java 21 下运行 `./mvnw.ps1 clean package`；安全取得的运行配置放在仓库外，通过 `./scripts/start-local.ps1 -RuntimeEnvFile <外部配置路径>` 启动配套 API。环境变量和日志不能打印密码、TOTP、Bearer token。API 默认 `127.0.0.1:18090`，启动新实例前确认旧实例已停止。会话只保存身份，重启后重新登录。
8. 把面向用户的原 UI 8443 同步切到本分支 API 模式（`VITE_DATA_MODE=api`、`VITE_API_BASE_URL=http://127.0.0.1:18090/api`）。核实旧 Vite PID/命令行再停止，保留原型独立服务。验证用 8445 保持本分支 API 模式，8446 保持本分支 demo 模式。不能把旧粗权限客户端留在新 API 前。
9. 完成下面的真实 HTTP 专用临时样本验证和确切 ID 清理，再做 T12 最终浏览器验收。服务切换、正式数据变更与真实账号初始化由控制者操作；不能把浏览器 mock 测试算成真实 API 验收。

## 回滚演练与本地测试

```sh
python database/tests/permission_grants.py --with-v6 --emit
python database/tests/permission_migration.py --with-v6 --emit
python database/tests/template_sync.py --with-migrations --red --emit
python database/tests/template_sync.py --with-migrations --emit
```

`--emit` 仅输出完整、有数据库名称保护和 BEGIN/ROLLBACK 的 SQL，供控制者传给服务器 `psql -X -v ON_ERROR_STOP=1`；省略时由脚本调用 psql。模板 RED 明确省略初始化，应报 `unassigned default not synchronized`；GREEN 对比所有保留引用，检查不可用项未加入、无新增授权及重跑幂等性。SQL 失败后连接关闭/显式 ROLLBACK，不能提交失败事务。identity 序列前进不回滚，不为测试重置序列。

Java PG 测试仅在 `EMS_TEST_SCHEMA=ems_permission_tests` 明确启用，并验证库名、schema 和空测试 schema；通过安全环境设置 `EMS_TEST_DB_URL/USER/PASSWORD`。运行 `./mvnw.ps1 test`。未设置环境时 PG 用例显示 skipped，不能当成通过；治理并发用例按照各自固定 schema 清理约定执行。`GrantAuthorizationPostgresTest` 的 DO 块在同一个外层语句时钟下验证 `valid_until` 等于当前时刻必须拒绝、`valid_from` 等于当前时刻允许，不依赖睡眠或后续语句时钟。

在 `ems-cloud-ui` 执行 `node scripts/run-tests.cjs`（或 `pnpm test`）。它发现全部 `tests/*.test.cjs`，顺序运行 API 组和 demo 组，即使一组失败也运行另一组，最后统一返回失败状态。`API_PREVIEW_URL` 默认 `http://127.0.0.1:8445`，`DEMO_PREVIEW_URL` 默认 `http://127.0.0.1:8446`，传给各组的 `PREVIEW_URL` 不同；测试文件串行运行避免多浏览器资源争用。四个 demo 文件固定为：

- `centers-ui.test.cjs`
- `operations-redesign-ui.test.cjs`
- `role-access-ui.test.cjs`
- `workspace-ui.test.cjs`

其余文件（包括 `analytics-ui.test.cjs`、浏览器无关单元测试、完整平台管理测试）都进入 API 组，不跳过。Windows 可直接使用已安装的 Node 可执行文件，无需 npx 下载。

## 专用真实 API 样本与清理

先审查 `database/tests/permission_api_fixture.sql` 和 `permission_api_cleanup.sql`，再由控制者批准样本生命周期。准备脚本只使用固定 981001–981008 区间中的明确 ID，碰撞即中止，创建两个隔离顶层组织、两个站点、六个 `permission-t11-*` 账号及专用角色/授权；不更改任何既有账号授权。没有真实业务记录、遥测或模拟收益。临时治理权限只属于这批样本，不是首位真实管理员初始化。

操作者生成临时强密码及 BCrypt hash，只通过安全环境分别提供 `EMS_PERMISSION_TEST_PASSWORD` / `EMS_PERMISSION_TEST_PASSWORD_HASH`。psql 的 `\getenv` 读取 hash，不把密码或 hash写进仓库、命令行参数或日志。fixture SQL 需要管理员连接；脚本本身不连接数据库。提交后立即运行 HTTP 脚本：到期样本在准备后的 90 秒失效，脚本要求首次登录时仍有效、最多等待 180 秒；若错过，停止并明确审查仅该专用 grant ID 的期限调整，不自动重复准备或修改真实授权。

```sh
# 环境由控制者私有启动器设置，下面不包含秘密值。
# EMS_PERMISSION_FIXTURE 指向 database/tests/permission_api_fixture.json
# EMS_PERMISSION_RESULT 指向仓库外或 ignored scratch 下的结果文件
python database/tests/permission_api.py
```

manifest 支持控制者指定明确临时 ID/账号，脚本验证命名空间、身份和站点标记后才发写请求。它记录实际创建角色/授权的精确 ID，不记录秘密。验证内容包含角色新建/重复编辑/权限更新/删除、逐条授权新建/编辑/撤销、越站拒绝、失败后授权数量不变、同一登录会话的撤销与实际到期、NULL-owner 空站点历史授权不产生组织或站点通配、有限期限操作者不能通过编辑角色扩张长期授权，以及两个永久治理者并发减少权限只有一个成功、另一个 409。

成功或失败都由控制者执行精确清理脚本：再次确认六组 ID/account 匹配，拒绝发现样本授予非样本成员的异常；停用这六个账号，删除它们的授权及其级联站点关系。保留账号、角色定义、组织、站点和全部审计记录作为不可混淆的已退役验证历史，避免 audit FK 或授权 JSON 历史丢失。API 已成功撤销/删除的记录可从结果 ledger 对照；失败中断遗留的角色只保留定义，不产生有效权限。清理后验证六个账号 enabled=false、无 member_grant、会话不可再访问，并删除私有临时密码。绝不按模糊名称批量删除，不删除审计，不重置业务序列。

## 审计和兼容边界

沿用 `audit_event(actor_id,action,occurred_at,detail)`，未添加冗余业务字段。应用账号只能插入审计，不能更新/删除。角色、授权、成员、组织写入与审计处于同一事务；授权/治理错误不能留下半条授权或成功审计。

| 写操作 | action / 内容 |
| --- | --- |
| 角色创建、编辑、删除 | `role.create/edit/delete`，对象 ID，名称及编辑前后描述 |
| 角色权限变更 | `role.permissions`，对象 ID、added/removed |
| 授权新增、编辑、撤销 | `member.grant.create/edit/revoke`，memberId、before/after，角色、站点、期限和来源 |
| 成员创建、删除 | `member.create/delete`，精确 user ID |
| 成员档案、停用/恢复 | `member.edit`，memberId、before/after 的 display_name/email/enabled；不查询或序列化密码、验证码 |
| 成员组织归属 | `member.organization`，memberId、前后 organization_id、清空负责人关系的组织 ID |
| 组织创建、编辑、父级/负责人调整 | `organization.create/edit`，organizationId、前后 name/parent_id/lead_user_id、清空负责人关系的组织 ID |
| 显式模板初始化 | `permission.templates.sync`，NULL actor 表示数据库操作，列出实际追加的 roleId/code |

旧 `PUT /members/{id}/grants`、`GET /platform/member-grants`、`GET /platform/role-permissions` 在本次切换退役：已认证返回 410，未认证 401；新成员请求包含旧 roleIds/stationIds 也返回 410。前端使用组织角色与逐条成员授权 API，无运行期聚合读取调用；旧表只供迁移对照和保留历史，不存在新旧授权双写或备用鉴权分支。单个授权若范围不完整，仍遵守现有整条脱敏规则。

## 失败恢复与已知工具噪声

提交前异常由事务回滚。提交后先停写、保留全部新授权/撤销与审计，优先前向修复；备份只恢复到隔离实例/隔离数据库用于核对，由操作者验证无数据损失后制定进一步恢复方案。**不要直接对活动新库做 destructive restore，不要重新启用旧授权写入口。** 即使旧表仍在，一旦新授权发生变化，直接恢复旧 API 会复活已撤销权限或遗漏新授权；没有完成差异核对与匹配客户端/服务版本前不能恢复对外服务。不提供自动反向双写或自动回滚授权脚本。

Mockito 在当前 Java 21 测试运行中可能提示动态 attach / CDS；这属于既有测试工具配置噪声，不表示授权失败。Vite 既有大 chunk 警告属于打包大小提示；本任务不通过提高阈值或无关拆包隐藏警告。每次报告应给出真实退出码、通过/跳过数量，并单独注明这些 minor，不能把失败用例当作噪声接受。
