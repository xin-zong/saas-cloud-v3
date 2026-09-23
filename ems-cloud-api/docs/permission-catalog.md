# 权限目录与原型验收矩阵

机器可读的规范目录是 [`src/main/resources/permission-catalog.json`](../src/main/resources/permission-catalog.json)。本表对应 `OrganizationPermissions.tsx` 的六组 38 项，另有八项现存扩展。`code` 是稳定标识；`origin=prototype` 表示原型项，`existing-extension` 表示现有后端能力。`scope=station` 要按操作所属站点判定，`organization` 要按管理组织判定。目录不授予任何角色或成员权限。

`available=true` 仅表示代码已用**相同 code**在至少一个列出的当前接口上执行权限检查；这不保证前端对应按钮、完整业务流程或未来逐条授权已经实现。`current` 的接口和检查均已存在；`planned` 是现存接口需要改用新 code，或 T05/T06 已明确的新接口。没有绑定的项不在本期可执行范围内，不应开放选择或显示成已实现。特别是站点接入、真实策略下发、外部邀约和真实固件升级尚未实现。

> 当前 `AccessControl.requirePermission` 和 `requireStation` 分开判定。目录中的站点作用域是目标模型，不代表现有接口已按同一条授权同时检查权限与站点。T04 将完成联合判定；配置界面在此之前不得将未来 code 当成已授权能力。

## 原型权限（38）

| 模块 / 页面入口 | 原型名称 | 稳定 code | 作用域 | 当前状态 | 对应接口 |
| --- | --- | --- | --- | --- | --- |
| asset / 资产与站点 | 查看站点与设备 | `asset.read` | station | 可用 | `current: GET /stations/{id}` |
| asset / 资产与站点 | 新建站点 | `asset.create` | organization | 暂不可用 | 无（范围外或待定义） |
| asset / 资产与站点 | 编辑站点 | `asset.edit` | station | 可用 | `current: PUT /stations/{id}` |
| asset / 资产与站点 | 删除站点 | `asset.delete` | station | 暂不可用 | 无（范围外或待定义） |
| asset / 资产与站点 | 查看运营收益 | `revenue.read` | station | 可用 | `current: GET /stations/{id}/settlements` |
| asset / 资产与站点 | 查看运行策略 | `strategy.read` | station | 可用 | `current: GET /stations/{id}/plans` |
| asset / 资产与站点 | 编辑运行策略 | `strategy.manage` | station | 可用 | `current: POST /plans` |
| asset / 资产与站点 | 下发运行策略 | `strategy.dispatch` | station | 暂不可用 | 无（范围外或待定义） |
| operations / 运营中心 | 查看运营总览 | `operations.read` | station | 暂不可用 | 无（范围外或待定义） |
| operations / 运营中心 | 查看收益核算 | `settlement.read` | station | 暂不可用 | `planned: GET /stations/{id}/settlements`<br>现有检查：`revenue.read` |
| operations / 运营中心 | 查看计划调度 | `dispatch.read` | station | 暂不可用 | `planned: GET /stations/{id}/plans`<br>现有检查：`strategy.read` |
| operations / 运营中心 | 制定调度计划 | `dispatch.manage` | station | 暂不可用 | `planned: POST /plans`<br>现有检查：`strategy.manage` |
| operations / 运营中心 | 查看响应邀约 | `invitation.read` | station | 暂不可用 | `planned: GET /stations/{id}/market-services`<br>现有检查：`market.read` |
| operations / 运营中心 | 接受响应邀约 | `invitation.accept` | station | 暂不可用 | 无（范围外或待定义） |
| maintenance / 运维中心 | 查看告警 | `alarm.read` | station | 可用 | `current: GET /stations/{id}/alarms` |
| maintenance / 运维中心 | 查看设备健康 | `device.health.read` | station | 暂不可用 | 无（范围外或待定义） |
| maintenance / 运维中心 | 处理告警 | `alarm.handle` | station | 可用 | `current: POST /alarms/{id}/acknowledge` |
| maintenance / 运维中心 | 转为运维工单 | `alarm.to.workorder` | station | 暂不可用 | 无（范围外或待定义） |
| maintenance / 运维中心 | 上传目标固件 | `firmware.upload` | station | 暂不可用 | 无（范围外或待定义） |
| maintenance / 运维中心 | 执行固件升级 | `firmware.upgrade` | station | 暂不可用 | 无（范围外或待定义） |
| workorder / 工单与审批 | 查看工单 | `workorder.read` | station | 可用 | `current: GET /work-orders` |
| workorder / 工单与审批 | 新建工单 | `workorder.create` | station | 暂不可用 | `planned: POST /work-orders`<br>现有检查：`workorder.manage` |
| workorder / 工单与审批 | 编辑工单 | `workorder.edit` | station | 暂不可用 | `planned: PUT /work-orders/{id}/assignee`<br>现有检查：`workorder.manage` |
| workorder / 工单与审批 | 处理工单 | `workorder.handle` | station | 暂不可用 | `planned: POST /work-orders/{id}/transition`<br>现有检查：`workorder.manage` |
| workorder / 工单与审批 | 查看审批 | `approval.read` | station | 暂不可用 | `planned: GET /approvals` |
| workorder / 工单与审批 | 审批申请 | `approval.review` | station | 可用 | `current: POST /approvals/{id}/decision` |
| analytics / 分析与报告 | 实时数据分析 | `analytics.realtime.read` | station | 暂不可用 | 无（范围外或待定义） |
| analytics / 分析与报告 | 历史趋势分析 | `analytics.history.read` | station | 暂不可用 | `planned: GET /points/{id}/history`<br>现有检查：`telemetry.read` |
| analytics / 分析与报告 | 生成报告 | `report.generate` | station | 暂不可用 | 无（范围外或待定义） |
| analytics / 分析与报告 | 下载数据 | `report.export` | station | 可用 | `current: GET /stations/{id}/reports/{kind}` |
| platform / 平台管理 | 查看客户 | `customer.read` | organization | 暂不可用 | `planned: GET /platform/customers`<br>现有检查：`asset.read` |
| platform / 平台管理 | 管理客户 | `customer.manage` | organization | 暂不可用 | `planned: PUT /platform/customers/{id}`<br>现有检查：`asset.edit + member.manage` |
| platform / 平台管理 | 查看组织与成员 | `organization.member.read` | organization | 暂不可用 | `planned: GET /platform/organizations`<br>现有检查：`member.manage` |
| platform / 平台管理 | 管理组织 | `organization.manage` | organization | 暂不可用 | `planned: PUT /platform/organizations/{id}`<br>现有检查：`member.manage` |
| platform / 平台管理 | 管理成员 | `member.manage.profile` | organization | 暂不可用 | `planned: PUT /members/{id}`<br>现有检查：`member.manage` |
| platform / 平台管理 | 配置角色权限 | `role.manage` | organization | 暂不可用 | `planned: PUT /platform/roles/{id}/permissions`<br>现有检查：`member.manage (read-only role-permissions endpoint)` |
| platform / 平台管理 | 分配成员权限 | `member.grant.manage` | organization | 暂不可用 | `planned: POST /members/{memberId}/grants`<br>现有检查：`member.manage (coarse PUT /members/{id}/grants)` |
| platform / 平台管理 | 查看安全审计 | `audit.read` | organization | 可用 | `current: GET /audit` |

## 现有扩展（8）

| 模块 / 页面入口 | 功能 | 稳定 code | 作用域 | 当前状态 | 对应接口 |
| --- | --- | --- | --- | --- | --- |
| asset / 现有功能扩展 | 查看遥测点与历史 | `telemetry.read` | station | 可用 | `current: GET /points/{id}/history` |
| maintenance / 现有功能扩展 | 巡检管理 | `inspection.manage` | station | 可用 | `current: POST /inspections` |
| operations / 现有功能扩展 | 电价管理 | `tariff.manage` | station | 可用 | `current: POST /tariffs` |
| operations / 现有功能扩展 | 查看市场服务与资质 | `market.read` | station | 可用 | `current: GET /stations/{id}/market-services` |
| operations / 现有功能扩展 | 管理内部市场草稿 | `market.manage` | station | 可用 | `current: POST /market-drafts` |
| operations / 现有功能扩展 | 复核收益结算 | `revenue.review` | station | 可用 | `current: POST /settlements/{id}/reviews` |
| workorder / 现有功能扩展 | 旧版工单合并管理 | `workorder.manage` | station | 可用 | `current: POST /work-orders` |
| platform / 现有功能扩展 | 旧版组织成员合并管理 | `member.manage` | organization | 可用 | `current: PUT /members/{id}` |

## 粗粒度旧权限的显式拆分

`workorder.manage` 目前检查 `POST /work-orders`、`PUT /work-orders/{id}/assignee`、`POST /work-orders/{id}/transition`、`POST /work-orders/{id}/notes`。目标分别是 `workorder.create`、`workorder.edit`、`workorder.handle`（状态转换和处理备注）。旧 code 在切换前继续作为现有扩展保留，不可同时把它解释成三个新 code 的授权。

`member.manage` 目前检查组织读写、成员创建/编辑、旧版 `PUT /members/{id}/grants`、角色权限只读接口，以及设置中的成员/组织/角色列表。目标拆成 `organization.member.read`（读取组织与成员）、`organization.manage`（组织写操作）、`member.manage.profile`（成员资料写操作）、`role.manage`（角色及权限配置）和 `member.grant.manage`（逐条分配/撤销）。`GET /platform/role-permissions` 现在只读，不能被当成“配置角色权限”已实现。客户读写另拆 `customer.read` 和 `customer.manage`；现有读接口检查 `asset.read`，写接口同时检查 `asset.edit` 与 `member.manage`。

迁移映射必须按**现有有效权限组合**对照，而非按 `owner` / `operator` / `integrator` 角色名推断；自定义角色和 `super_admin` 也要纳入 T03 基线。`workorder.manage` 的旧有效操作对应上述三项新 code，`member.manage` 的旧有效操作对应组织、成员资料和旧版授权写操作；历史上没有角色写接口，不能仅凭它自动授予 `role.manage`。旧版成员授权能力到 `member.grant.manage` 的迁移还需与逐条授权的目标成员、站点、有效期范围一并校验。`customer.manage` 旧能力要求 `asset.edit` **且** `member.manage` 同时有效；仅有其中之一的用户不得取得新 code。目录本身不执行迁移或增加任何授权，具体数据对照留给 T03。

`approval.read` 的当前列表依靠 SQL 过滤而无独立 `requirePermission`，故仍标为 planned；`approval.review` 有明确检查。`report.export` 绑定现有报告下载接口；原型的“生成报告”另列 `report.generate`，现有接口不等于生成任务。`market.manage` 只代表内部草稿，不是外部市场交易。

目录中的 planned 路由是目标检查位置，并未在 T01 改动控制器或数据库。可用项的测试会核对当前路由上确实出现相同 code 的后端检查；无接口项必须保持 `available=false`。
