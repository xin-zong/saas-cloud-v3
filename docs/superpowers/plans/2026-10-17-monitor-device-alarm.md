# 监控、设备详情与告警 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** 将扫描已明确的监控、设备详情与告警读写业务接入现有权限体系和隔离新库，完成页面/API/持久化验证。

**Architecture:** 延伸 Spring JDBC 和现有 React 页面，复用 telemetry、device、alarm 等权威数据。已有查询优先复用；新增状态建立版本化表及审计，不以原型/mock值冒充采样。参考平台不执行任何操作。

**Tech Stack:** Java21 / Spring Boot / PostgreSQL16 / React / TypeScript。
**Spec:** docs/reference-platform/public-business-flows.json 与 implementation-ledger.json 中 monitor/dashboard/device/alarm 对应流程，结合本计划有证据边界。

## Global Constraints
- 唯一工作区 C:/Users/Laptop/.codex/worktrees/toyingzhen/ems-cloud-v2.0，develop-toyingzhen，基线33c69b1。
- 唯一写库 ems_cloud_saas_toyingzhen / ems_toyingzhen_owner / 127.0.0.1:15435；原库、原工作区和线上进程不操作。
- 参考平台只读，本次尽量使用既有扫描材料；不打开会自动写提示/已读的页面。
- 不启动共享MQTT/Kafka消费者，不向真实设备或外部通知渠道发命令。
- 新增迁移V34监控、V35设备、V36告警；由根代理备份、审阅并按顺序实际应用，实施者不写库。
- 按现有tenant/client/station权限校验；read、acknowledge、人工关闭、自动恢复等语义区分。
- 修改页面前读取对应最新Figma设计上下文及截图，记录节点或替代节点，沿用白绿淡色现有组件。
- 未明确算法/参数/固件/外部命令不能伪造成功；记录具体待办，但已明确本地状态及查询不能留在浏览器草稿。
- 采用有意义失败测试→实现→回归；原始参考数据、凭据和测试配置不提交。

## Tasks
### Task 1: 监控
Owner: monitor实现子任务。范围为全局/站内查询与配置缺口：授权站点过滤、PV/储能场景/通信状态、真实统计和趋势/排名/历史导出，已有个人模板的服务端配置缺口。逐项核对扫描证据及现有聚合，不在缺失采样时制造数值。
- [x] 输出已明确接口/字段/聚合及缺口对应清单。
- [x] 添加规则、权限和PG相关失败测试，完成API与必要V34持久化。
- [x] 页面和真实数据源接通，空态、加载失败、筛选及导出闭环。
- [x] 定向测试、Figma与浏览器验证，记录实际完成/待办。

### Task 2: 设备详情
Owner: device实现子任务。范围为九类目录、分类详情/档案、参数选择、历史曲线、连接关系、已明确本地配置与设备日志读取；未知硬件控制与固件下发不能实现为假成功。
- [x] 核对分类schema与已有协议/telemetry字段；定义可校验接口及V35。
- [x] 先失败测试，补后端读取/配置持久化、权限与审计。
- [x] 更新StationDevicesPage及data适配，复用页面风格。
- [x] 持久回读、重登录、越权和历史范围测试。

### Task 3: 告警
Owner: alarm实现子任务。范围为全局/站内实时与历史查询、规则/设备来源、过滤分页、详情、个人已读（不同于确认）、确认/备注/人工关闭等已明确处置和规则配置。
- [x] 核对扫描与原alarm模型，定义生命周期、权限/审计及V36。
- [x] 先失败测试，完成服务端规则/条件校验与持久化；与本项目数据可用性匹配的检测不得伪造告警或外部送达。
- [x] 规则管理和实时/历史页接通，操作后回读与历史可追踪。
- [x] 状态冲突、跨租户/站点/客户端、只读与撤权测试。

### Task 4: 整合与验收
Owner: root。负责共享导航/聚合适配冲突、库备份与迁移、整合构建、实际隔离API验收、重登录回读、独立审查修复、更新台账与简明交付记录。
- [x] 审阅迁移与边界，备份新库后应用。
- [x] 后端/前端相关回归；构建后只重启隔离API。
- [x] 新库真实HTTP与页面验收，临时测试记录清理/审计证据保留。
- [x] 独立审查、修复、提交；不把未知/未验证范围标完成。
