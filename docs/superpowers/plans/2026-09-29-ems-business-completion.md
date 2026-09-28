# EMS 业务联动与分析报告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, with task-scoped review and final integration review.

**Goal:** 完成真实 EMS 数据的业务展示、分析、报告和全点位模拟验收，提交并发布 main。
**Architecture:** PostgreSQL 管身份/映射/任务，ClickHouse 管强类型观测；统一查询服务为 REST 与 SSE 供数；前端复用现有组件与权限。
**Tech Stack:** Java21/Spring Boot/PostgreSQL/ClickHouse/MQTTX/React19/TypeScript/Vite。
**Spec:** ../specs/2026-09-29-ems-business-completion-design.md

## Global Constraints

- 工作目录 D:/projects/ems-cloud-v2.0，分支 main；保留既有未提交改动和用户截图。
- 仅使用 ems_cloud_v2_proto 与 ems_cloud_v2_proto_telemetry；禁止使用老业务库、旧 MQTT 1883/8883。
- 约束、外键、唯一键和三范式优先；不把统计结果重复塞进资产表，不把模拟数据写成业务真实结论。
- 现有 permission/站点授权是唯一访问边界；后台任务和 SSE 持续复核授权及会话有效性。
- 缺失、无效、过期、未知单位、位图、文本保留本义；禁止缺值补零或猜测单位/控制权限。

## Task 1: 当前状态与查询服务（controller）
Files: AssetPresence.java; 新增 StationTelemetryService.java、RealtimeTelemetryController.java；AssetController.java 测点目录；TelemetryController.java 原始查询。Frontend App.tsx、api/presence.ts、api/stationRealtime.ts、stationDevices.ts。

- [x] 状态失败测试、当前绑定判定、10秒状态轮询及在线/超时离线真实验证。
- [x] 补齐 GET /stations/{id}/telemetry/snapshot 返回 {items,serverTime,presence}。items 为现有 Observation DTO，并附 deviceId/sourceId/namespace/subsystem 等授权元数据。
- [x] GET /stations/{id}/telemetry/stream?pointIds=19,21 为 Bearer fetch SSE；event:snapshot；data 与 snapshot 一致，可选点限定不超过200，鉴权撤销/会话失效终止，主动暂停/切页断开，资源上限、超时与重连。
- [x] GET /points/{id}/observations?from=ISO&to=ISO&limit=1000&offset=0 返回 {items,hasMore}；源时间半开区间、原始类型不丢精度、授权历史绑定、稳定排序。
- [x] 当前测点目录附加 source、sourceId、valueType、aggregation、device_name；无映射明确 legacy，目录不允许推断所有点都是EMS。
- [x] 用新快照联动设备点值与站点统计，并验证无数据不补零/无重复汇总。
Tests: AssetPresenceTest; 新增 StationTelemetryServiceTest / SSE 生命周期与授权测试；frontend presence/realtime helper tests。

## Task 2: 报告与导出后端（independent implementer）
Files: 新增 AnalysisJobController.java、AnalysisJobService.java、migration V17（已核对最大版本为 V16）；保留 ReportController 兼容接口；对应测试。

接口约定：
```ts
type JobRequest={kind:'operations'|'revenue'|'health'|'telemetry',from:string,to:string,minutes?:number,pointIds?:string[]}
type Job={id:string,stationId:string,kind:string,from:string,to:string,minutes:number|null,status:'pending'|'running'|'completed'|'failed',createdAt:string,completedAt:string|null,error:string|null,pointIds:string[]}
type Preview={job:Job,summary:{label:string,value:string|null,unit?:string}[],sections:{title:string,columns:{key:string,label:string}[],rows:Record<string,unknown>[]}[]}
```
- [x] POST /stations/{id}/analysis-jobs 接受 JobRequest，from/to 必须含偏移、半开区间；GET 同路径分页列表返回 Job[]，kind 可选。
- [x] GET /analysis-jobs/{id} 返回 Preview；GET /analysis-jobs/{id}/download CSV；POST /analysis-jobs/{id}/retry 重试失败任务。
- [x] 规范化任务与选点关系表，状态/时间范围/类型/粒度检查；不可变 JSON/CSV 制品存 PostgreSQL bytea，长度/SHA-256 约束；本地与云端共享读取。原文件目录方案因多实例无法共享制品而在审查后调整。
- [x] telemetry 支持 minutes=0 原始精确值与其他合法粒度 last；报告按现有权限 report.export + 业务读取权限，导出任务须 telemetry.read。持久任务读取再次授权。
- [x] 先写权限、范围、失败记录、CSV、空数据和持久化测试，再实现并验证。

## Task 3: 分析与报告前端（independent implementer）
Files: components/apiAnalytics.ts、StationAnalysisPage.tsx、stationAnalysisData.ts、ApiAnalyticsPage.tsx、AnalyticsDataDownload.tsx，及新辅助模块/测试。不得编辑 App.tsx（controller负责）。

- [ ] 用已确认测点目录自动选择 EMS / legacy 数据源。EMS history 使用允许的 aggregation，默认last，解析强类型返回并保留间断。
- [ ] 接 Task1 SSE，停止时不继续追加、重连恢复、权限改变取消、不伪报采样率。
- [ ] 接 Task2 任务接口完成原始/聚合多点下载及持久记录、重试、报告生成/正文预览/下载。
- [ ] 复用最新 Figma 四画板的现有布局，必要的表单细节按设计上下文，未采样空态；测点显示真实设备名、限制默认曲线数量，文本/位图不强画数值曲线。
- [ ] 测试 source选择、类型/精度、时间窗、暂停/重连、记录隔离、API失败/权限撤销，tsc和build。

## Task 4: 全点位测试资料与模拟器（independent implementer）
Files: scripts/ems-simulator/*（新）；docs/ems-integration/2026-09-29-full-point-test.md；生成 SQL 与接入配置。原有个人证书/口令不入库。

- [ ] 读源协议、catalog、fixture；自动核对295普通点/6EMS点/173配置项，角色映射至合肥站现有设备（必要的EMU独立模拟设备通过约束创建）。
- [ ] 生成可重复执行、事务化 SQL：只为现有新库创建测试设备/测点/definition/binding，保留已有SOC20018→point19等映射。
- [ ] 生成 MQTTX 场景，心跳和30/60秒帧、EMS配置、单体数组/匹配结构分开；可靠结构需要QoS1和严格connectionId/seq，同一EMS不得双客户端连接。
- [ ] 动态SOC/电压/电流/功率/计数器，未知质量和位图保留类型；不向ClickHouse直接插入事实。
- [ ] 单元验证数量/类型/数组维度/时间/一致性，controller执行SQL与证书配置并在云端验证观测覆盖。

## Task 5: 集成、复核与发布（controller + reviewer）
- [ ] Task级差异/报告复核；统一接口与整条数据链，修复发现的问题。
- [ ] 本地/云端DB迁移验证、API&UI构建、权限边界/导出/断线恢复/报告历史浏览器验收。
- [ ] 只stage任务文件，排除个人截图/证书/环境秘密，main提交并push origin/main。
- [ ] 确认线上现有部署路径/服务、备份制品、部署前后端18085，校验hash与健康，配置SSE反代关闭buffering，报告目录持久化。
- [ ] 记录实际commit、release、验证结果与剩余仅真实硬件限制；总目标全部完成前不标完成。
