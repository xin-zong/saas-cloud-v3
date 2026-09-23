# V7 历史授权迁移与切换

V7 是一次性数据迁移，使用 `database/apply.sql` 的版本登记和事务锁，不启用 Flyway。只允许操作 `ems_cloud_v2_proto`。V1–V5 不变，V6 提供结构；迁移中发现已有新授权或有组织角色时中止，不能覆盖已经开始维护的新模型。

## 保留的语义

旧模型是每个成员的角色集合 × 站点集合。V7 为每条 `user_role` 生成一条长期授权，并把该成员全部旧站点关联到这条授权，保留任意自定义角色，包括实际管理员角色。没有站点也生成授权，站点集合为空，从不解释成通配全部站点。没有角色的成员不凭站点关系取得权限。成员登录信息、启停状态和现有组织不变，管理组织从现有组织初始化。

同一个旧角色按成员实际组织复制；角色名称附加原 ID 后缀，避免旧名称重名或与模板重名。`owner/operator/integrator` 的代码变成 `<原代码>__o<组织ID>__r<旧角色ID>`，其他变成 `legacy__o<组织ID>__r<旧角色ID>`。工作台可以识别前三种前缀，鉴权不得依赖名称或代码前缀。空组织使用 `onull` 的无组织副本；这项明确修正了“保留原角色 ID”的早期描述，原始定义及旧关系保持原样。无组织副本不可通过普通组织角色接口编辑，也不能带来全局组织范围；已有站点能力仍保留。

授予人写 `NULL`，表示历史未知；`valid_from` 是导入事务时间，不是假定的原始授予时间。`valid_until=NULL`。未来新建授权必须写实际操作人。

| 旧有效条件 | 新操作代码 | 范围要求 |
| --- | --- | --- |
| `asset.read` | `customer.read`, `device.health.read` | 原站点集合；客户读取仍按可见站点汇总 |
| `workorder.manage` | `workorder.create`, `workorder.edit`, `workorder.handle` | 原站点集合 |
| `member.manage` | `organization.member.read`, `organization.manage`, `member.manage.profile`, `member.grant.manage` | 授权角色的组织及原有组织分支限制；空站点不扩大站点范围 |
| `asset.edit` 且 `member.manage`，可来自不同角色 | `customer.manage` | 每个符合条件的成员单独补充角色与授权；原站点集合；运行时仍要求客户所有站点均可管理且属于原组织分支 |

旧代码全部保留以便核对，原始 `app_role`、`role_permission`、`user_role`、`user_station` 不修改。新代码无需把粗权限作为新权限的 OR 备用分支；T04/T09 切换后不再使用旧粗粒度写权限作入口。`role.manage` 从不根据 `member.manage` 自动赋予，平台治理初始化需要独立明确选择。`settlement.read`、`dispatch.read/manage`、`invitation.read`、`analytics.history.read` 不从其他业务代码推导。

## 八类默认定义

完整原型定义及规范 code 映射在 [`permission-role-templates.json`](../src/main/resources/permission-role-templates.json)。它记录意图，不是用户授权或绕过目录可用性的白名单。每个组织都初始化以下八个角色，代码 `template_<模板代码>__o<组织ID>`，没有任何现有用户被自动分配模板。

| 模板 | 原型角色 | V7 已可用权限 |
| --- | --- | --- |
| owner | 项目业主 / 资产方 | asset.read, revenue.read, strategy.read, alarm.read, workorder.read, report.export |
| pmo | 项目管理方 / 项目公司 | asset.read, revenue.read, strategy.read, alarm.read, workorder.read, asset.edit, approval.review |
| ems | EMS 运行管理方 | asset.read, revenue.read, strategy.read, alarm.read, workorder.read, strategy.manage |
| om | 运维服务方 | asset.read, strategy.read, alarm.read, alarm.handle, workorder.read, approval.review, report.export |
| epc | EPC / 系统集成方 | asset.read, asset.edit, strategy.read, workorder.read |
| vendor | 设备厂家 | asset.read, alarm.read, workorder.read |
| platform | 平台治理方 | asset.read, asset.edit, revenue.read, strategy.read, strategy.manage, alarm.read, alarm.handle, workorder.read, approval.review, report.export, audit.read |
| readonly | 只读观察员 | asset.read, revenue.read, strategy.read, alarm.read, workorder.read |

V7 冻结 T01 时已实现目录子集，未实现条目留在 JSON 定义中待接入，不写入模板 `role_permission`。历史授权的明确拆分与空白模板初始化不同：前者是保持已经存在的操作能力，为即将切换的真实入口准备代码。新组织创建服务也应从这八类定义与当时的可用目录取交集初始化，不自动分配，不自动把后续开放的权限追加到现有角色。

## 只回滚演练

```sh
python database/tests/permission_migration.py --with-v6 --red  # 不含 V7，预期能力缺失失败
python database/tests/permission_migration.py --with-v6        # V6+V7，全事务回滚
python database/tests/permission_migration.py --with-v6 --emit # 输出可审查 SQL，不连接
```

V6 已安装时省略 `--with-v6`；只在 V7 尚未安装的库演练。脚本使用 libpq 环境/密码文件，绝不保存凭据，禁止连接旧库。断言失败时 `ON_ERROR_STOP` 终止，连接关闭会回滚。样本使用负 ID；V7 正常生成角色与授权，PostgreSQL identity 序列即使回滚也可能前进，只产生无业务影响的 ID 空洞，不重设并发序列。

测试添加覆盖自定义重名角色、与模板重名、多组织角色副本、空角色、无角色、无站点、无组织及同时无组织无站点、跨角色客户管理合取的合成数据，再捕获全部真实和合成用户的旧模型。比较所有旧“成员/权限/站点”组合双向差集，并独立核对新操作等价关系、来源/期限、管理归属、无意外治理、每组织八个未分配模板以及旧表不变。SQL 文件为 `database/tests/permission_migration_before.sql` 与 `permission_migration_after.sql`，可由控制者组合在一个 BEGIN/ROLLBACK 中执行。

## 实施、异常中止与恢复

1. 在新业务库导出 `pg_dump --format=custom` 完整备份，以及用户/角色/权限/站点关系基线和迁移版本。备份留在受控服务器目录，权限 0600；不要将密码、用户信息导出或备份提交到仓库。记录备份位置与恢复演练结果。
2. 完成上述只回滚演练与基线核对。任意 SQL 异常、未知版本、原表变化、能力差集、治理新增或现有新模型数据均中止。
3. 构建并验证 T04、T06、T09 和客户端。正式导入前停止经确认的旧 API 进程，防止 V7 快照后旧授权继续写入；不要在旧 API 继续运行时提前提交 V7。停写后重新备份和核对基线，再以管理连接运行 `database/apply.sql`。
4. 部署配套新 API 与客户端，验证登录、实际管理员、三个工作台、无站点配置账户及逐条授权。新代码只写新模型，不做双写，不允许两套授权独立修改。客户端切换后关闭旧 `PUT /members/{id}/grants` 入口；旧表仅作为只读基线，不承担新系统权限判断。
5. V7 只导入数据，不提前删除旧端点或撤销旧 API 数据表写权限。入口退休及旧表应用角色写权限收紧属于协调的应用切换步骤，必须与旧服务停止一起实施。
6. 提交前失败由事务回滚；提交后、尚未发生新授权写入时，停止新服务，用迁移前完整备份恢复新库再恢复匹配旧程序。已经发生新写入时不能简单切回旧表，否则丢失新撤销/授权：继续停写，导出变更和审计，由控制者选择前向修复或完整恢复并明确处理变更。不自动反向同步两套模型。

本迁移本身不保证接口鉴权；T04/T09 必须实现同一条有效授权上的权限与站点交集、组织分支、全部客户站点、委派期限和越权约束。
