# 监控 Task 1 实施记录

工作区：`develop-toyingzhen`，基线 `33c69b1`。本任务未连接数据库、未启停进程、未访问参考平台。

设计依据：最新 Figma 文件 `Y0KMYFvalDXgSPnVZ5zG39`。总览页 `594:3224` 直接获取上下文返回未选中节点；随后通过元数据定位并成功读取经营看板 `1059:10664`（dashboard-optimized）的完整上下文及截图。该总览页未发现标题含“克制风格”的重复看板；地图替代节点为 `1172:26660`。站内概览选用 `2044:8026`（P021 · 站点概览 · 克制风格探索），已读取最新上下文及截图。沿用现有组件和已有本地 Figma 资产；没有把设计示例数值作为业务数据。

## 接口与数据契约

- `GET /api/monitor/stations`：当前 `asset.read` 和客户端权限范围，按业务场景、通信、名称/编码/区域筛选。通信仅取当前 EMS 绑定和权威心跳，未采到心跳为 unknown；不把设备清单导入当连接事实。返回设备数、额定功率、储能容量和独立光伏装机容量供范围统计。缺光伏装机保留 null。
- `GET /api/monitor/history`：最多100个显式站点、31天、5/15/30/60分钟。授权必须含每站 `asset.read` 与 `telemetry.read`，导出还须 `report.export`。复用 `TelemetryController.history` 的原归属绑定与历史撤权校验，读取前后再次检查站点权限。当前指标为柜级明确协议 PV20107、储能20024，单位必须 kW，唯一映射才读；多柜/多映射不猜测站点聚合。
- 历史为每桶末次采样，无效质量/冲突置 null。排行为有效功率桶的算术平均，明确不是发电量、充放电量或能效。前端逐桶补 null，零值有效，禁止跨缺失桶连线。排行 Top5/更多最多100站，升降序及站点跳转；当前日期、指标和站点范围可导出 CSV，并由服务端重新校验导出权限。
- 全局预计站点采样桶上限50000，返回结果另设保守8MiB字节预算；超限413要求缩小范围，不静默截断。
- `GET/PUT /api/monitor/layout`：默认或选定私人模板的服务端布局；V34 新增个人12列 x/y/w/h 结构，按租户/人/模板隔离，模板复合外键级联删除，版本冲突返回409，禁止越界/重复/重叠模块，保存写审计。既有 V27 模板 CRUD/pin/选择继续复用。
- 总览场景/通信筛选同时作用地图和看板；日期只影响实测历史，当前资产与通信统计清晰标明为快照。站内概览的日视图接入同一历史导出与功率排行。

## 证据边界

扫描明确记录 PR 的辐照度/修正规则、峰值小时容量口径、计划完成率实际量及权重、储能效率计量边界、利用率时长单位和算法均未知。仓库没有权威电量日汇总。没有用功率桶积分伪造这些电量/比率；页面显示空态和具体原因。多柜功率汇总、月年电量、历史电量字段选择与四种单位、周月年效率/PR/计划排行仍须真实计量映射或算法依据，不能标作已完成参考等价功能。

## 验证记录

- 已观察监控查询/布局规则的缺生产类编译 RED（同时存在其他并行子任务缺类信息）；后续 Maven 交根任务串行执行，避免共享 target 竞争。
- 新增前端 `monitor-query.test.cjs` 先失败（缺模块），实现后与 `station-telemetry-query.test.cjs` 共6项通过。
- TypeScript 全量检查早期通过两轮；最后一轮仅报共享 `api/stations.ts` 的并行告警 closed 类型及 optional maintenance 错误，已交根任务与对应实施者整合；未擅改共享文件。根任务最终构建和实际隔离 HTTP/浏览器验收为独立阶段。
- 根任务已确认预算回归 RED 为 expected413 / actual403；随后增加预算实现，等待根任务串行 GREEN。controller 导出权限参数及 CSV 转义两项已通过。
- P1 独立审查指出：监控给定 B 站后复用全 point 历史会把用户有读取权的 A 站原事实重标为 B，可能借 B 的导出权导出 A 历史。新增 `MonitorFactStationScopeTest` 实测 RED：3项中 read/export 两项 expected1 / actual2，原 point API 合约一项通过。随后在 `TelemetryController` 增加仅内部使用的 `stationHistory`，固定 EMS，按请求原站点绑定过滤事实 period，读后重验也保留同一原站点条件；原 `/points/{id}/history` 保持读取全部有权原 period 的合约。监控改调用 scoped 方法，并适配现有 mock。无数据库结构变更，待根任务统一 GREEN。
- 新增 `MonitorQueryServiceTest`、`MonitorQueryControllerTest`、`MonitorLayoutServiceTest`；`MonitorLayoutPostgresTest` 仅在显式新库测试环境开启，先校验数据库/owner，使用临时 schema 和回滚事务。实施子任务未运行 PG。

- Root最终验收：后端272项（231执行通过/41跳过/0失败）、本批前端19项、tsc/Vite/后端打包退出0；49次真实HTTP及页面保存/读回通过。预算/原站点归属回归已GREEN，结果见 docs/reference-platform/verification-2026-10-17-monitor-device-alarm.md。
