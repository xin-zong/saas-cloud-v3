# 权限目录与原型验收矩阵

机器可读的规范目录是 [`src/main/resources/permission-catalog.json`](../src/main/resources/permission-catalog.json)。本表对应 `OrganizationPermissions.tsx` 的六组 38 项，另有八项现存扩展。`code` 是稳定标识；`origin=prototype` 表示原型项，`existing-extension` 表示现有后端能力。`scope=station` 要按操作所属站点判定，`organization` 要按管理组织判定。目录不授予任何角色或成员权限。

`available=true` 仅表示代码已用**相同 code**在至少一个列出的当前接口上执行权限检查；这不保证前端对应按钮、完整业务流程或未来逐条授权已经实现。`current` 的接口和检查均已存在；`planned` 标出需新增独立检查的明确目标接口；`shared-candidate` 仅标出语义可能重叠的现有接口，尚未决定新 code 的检查点，不得把它解释成替换旧 code、增加 OR 检查或增加 AND 检查的实施指令。没有绑定的项不在本期可执行范围内，不应开放选择或显示成已实现。特别是站点接入、真实策略下发、外部邀约和真实固件升级尚未实现。

> T04 已切换到 `requireStationPermission(stationId, code)` 与有效授权查询，权限和站点必须来自同一条当前有效授权。组织作用域来自授权角色的管理组织及子树，不随成员当前组织移动。完整服务和客户端契约见 [联合鉴权说明](permission-grant-authorization.md)。

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
| operations / 运营中心 | 查看收益核算 | `settlement.read` | station | 暂不可用 | `shared-candidate: GET /stations/{id}/settlements` |
| operations / 运营中心 | 查看计划调度 | `dispatch.read` | station | 暂不可用 | `shared-candidate: GET /stations/{id}/plans` |
| operations / 运营中心 | 制定调度计划 | `dispatch.manage` | station | 暂不可用 | `shared-candidate: POST /plans` |
| operations / 运营中心 | 查看响应邀约 | `invitation.read` | station | 暂不可用 | `shared-candidate: GET /stations/{id}/market-services` |
| operations / 运营中心 | 接受响应邀约 | `invitation.accept` | station | 暂不可用 | 无（范围外或待定义） |
| maintenance / 运维中心 | 查看告警 | `alarm.read` | station | 可用 | `current: GET /stations/{id}/alarms` |
| maintenance / 运维中心 | 查看设备健康 | `device.health.read` | station | 暂不可用 | `shared-candidate: GET /stations/{id}/devices` |
| maintenance / 运维中心 | 处理告警 | `alarm.handle` | station | 可用 | `current: POST /alarms/{id}/acknowledge` |
| maintenance / 运维中心 | 转为运维工单 | `alarm.to.workorder` | station | 暂不可用 | `shared-candidate: POST /work-orders` |
| maintenance / 运维中心 | 上传目标固件 | `firmware.upload` | station | 暂不可用 | 无（范围外或待定义） |
| maintenance / 运维中心 | 执行固件升级 | `firmware.upgrade` | station | 暂不可用 | 无（范围外或待定义） |
| workorder / 工单与审批 | 查看工单 | `workorder.read` | station | 可用 | `current: GET /work-orders` |
| workorder / 工单与审批 | 新建工单 | `workorder.create` | station | 可用 | `current: POST /work-orders` |
| workorder / 工单与审批 | 编辑工单 | `workorder.edit` | station | 可用 | `current: PUT /work-orders/{id}/assignee` |
| workorder / 工单与审批 | 处理工单 | `workorder.handle` | station | 可用 | `current: POST /work-orders/{id}/transition` |
| workorder / 工单与审批 | 查看审批 | `approval.read` | station | 可用 | `current: GET /approvals` |
| workorder / 工单与审批 | 审批申请 | `approval.review` | station | 可用 | `current: POST /approvals/{id}/decision` |
| analytics / 分析与报告 | 实时数据分析 | `analytics.realtime.read` | station | 暂不可用 | 无（范围外或待定义） |
| analytics / 分析与报告 | 历史趋势分析 | `analytics.history.read` | station | 暂不可用 | `shared-candidate: GET /points/{id}/history` |
| analytics / 分析与报告 | 生成报告 | `report.generate` | station | 暂不可用 | 无（范围外或待定义） |
| analytics / 分析与报告 | 下载数据 | `report.export` | station | 可用 | `current: GET /stations/{id}/reports/{kind}` |
| platform / 平台管理 | 查看客户 | `customer.read` | station | 可用 | `current: GET /platform/customers` |
| platform / 平台管理 | 管理客户 | `customer.manage` | station | 可用 | `current: PUT /platform/customers/{id}` |
| platform / 平台管理 | 查看组织与成员 | `organization.member.read` | organization | 可用 | `current: GET /platform/organizations` |
| platform / 平台管理 | 管理组织 | `organization.manage` | organization | 可用 | `current: PUT /platform/organizations/{id}` |
| platform / 平台管理 | 管理成员 | `member.manage.profile` | organization | 可用 | `current: PUT /members/{id}` |
| platform / 平台管理 | 配置角色权限 | `role.manage` | organization | 暂不可用 | `planned: PUT /platform/roles/{id}/permissions` |
| platform / 平台管理 | 分配成员权限 | `member.grant.manage` | organization | 暂不可用 | `planned: POST /members/{memberId}/grants` |
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
| workorder / 现有功能扩展 | 旧版工单合并管理 | `workorder.manage` | station | 暂不可用 | `planned: POST /work-orders` |
| platform / 现有功能扩展 | 旧版组织成员合并管理 | `member.manage` | organization | 暂不可用 | `planned: PUT /members/{id}` |

## T04 已实施的显式拆分

`workorder.manage` 已由 `workorder.create`（新建）、`workorder.edit`（更改负责人）、`workorder.handle`（状态转换和处理备注）替代。`member.manage` 已由 `organization.member.read`、`organization.manage`、`member.manage.profile` 分别用于对应读写操作。旧 code 仅保留历史迁移基线，不可在新角色中配置；没有 OR 别名回退。逐条授权与角色配置由 T05/T06 接入后再启用 `member.grant.manage`、`role.manage`。

客户读写检查独立的 `customer.read`、`customer.manage`。读取只汇总当前读权限可见的站点，并附加 `{id,name,code}` 摘要。编辑必须覆盖客户全部站点，每站的 customer.manage 授权自身角色管理组织分支还必须包含该站所属组织；不能跨不同授权拼接站点和组织条件。`can_edit` 使用与写接口相同的判断。

V7 按旧有效能力显式拆分，`customer.manage` 仅从旧 `asset.edit` 与 `member.manage` 的组合迁移，角色名不参与鉴权。V8 仅为新模型中的原审批角色补齐 `approval.read`，保留原始角色权限快照。提交人只要保有记录所属站点的有效权限，仍可看自己的历史申请；其他记录必须有该站 `approval.read`。

资产编辑保持既有返回内容要求：同一目标站需要 `asset.edit` 与 `asset.read`，可以来自该站的不同有效授权。报表同样同时检查目标站的 `report.export` 与数据种类权限（revenue.read / asset.read / strategy.read）。

独立设备健康与告警转工单目前仍不可用：现有设备接口由 `asset.read` 控制，工单新建可附带 alarmId 并由 `workorder.create` 控制。`settlement.read`、`dispatch.read/manage`、`invitation.read`、`analytics.history.read` 等候选关系没有改变旧接口许可条件。策略、市场、电价、遥测、结算复核及巡检仍使用真实已实现的扩展 code。
