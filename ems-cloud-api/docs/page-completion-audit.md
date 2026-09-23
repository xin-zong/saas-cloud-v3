# 页面补齐与本地启动验收

日期：2026-09-23。本轮目标：补齐审批操作、平台管理、分析报告等此前缺口，并在本地启动前后端。沿用既定范围：新库、既有电站管理；不接入 EMS，不做外部交易、付款或新站接入。

| 页面/要求 | 本轮落地能力 | 验证依据 |
|---|---|---|
| 审批与待办 | 服务端审批列表、提交人/审核人、通过/驳回及意见、自审和权限限制、状态刷新 | approval-api-ui.test.cjs；privileged_api.py |
| 平台管理 | 授权客户、子组织、成员创建/移动/停用、角色及站点授权、角色权限只读、本人审计 | platform-api-ui.test.cjs；PlatformScopeTest；api_integration.py |
| 分析与报告 | 授权测点、31 天内历史曲线、粒度、缺测空态、采样 CSV 和三类服务端报告 | analytics-api.test.cjs；analytics-ui.test.cjs；ui_real.cjs |
| 结算与站点收益 | 所选期间分页读取全部账目、币种分离、完整核算与收款余额、逐账目复核记录 | settlement-api.test.cjs；RevenueController；浏览器联调 |
| 市场服务 | 真实资格及记录、内部草稿新建/撤回、服务端时段及容量校验 | market-api-ui.test.cjs；privileged_api.py |
| 运维补齐 | 告警关联开单、告警/工单跟进记录、巡检创建/完成/取消 | alarm-order-api-ui.test.cjs；inspection-api-ui.test.cjs；api_integration.py |
| 拓扑 | 仅显示登记设备和真实连接，查询失败不显示空配置 | ApiTopology.tsx；复查 |
| 页面权限 | API 模式以服务端权限决定导航和操作，不再由角色标签硬编码阻止已授权功能 | apiPermissions.ts；上述浏览器测试 |
| 本地运行 | 前端 127.0.0.1:8443，API 127.0.0.1:18090，经 SSH 隧道连接两个新库 | 端口/进程检查、真实登录和双库联调 |

具体实现和限制见 approval-followup.md、platform-followup.md、analytics-followup.md。旧版 frontend-report.md 的未接入清单被本轮对应项目覆盖。

范围边界：没有 EMS 实际采样时实时总览仍为未知；无拓扑连接时不推测线路；固件执行、AI 模型、供应商动态电价、外部交易和付款未接入。审批权限不自动扩大到默认三个角色；服务端仍要求显式 reviewer 授权。安全审计只展示当前账号事件，安全策略不由个人偏好控制。角色权限表只读，防止成员管理员赋予自己没有的权限。

最终验证结果以 progress.md 的本轮验收条目为准。
