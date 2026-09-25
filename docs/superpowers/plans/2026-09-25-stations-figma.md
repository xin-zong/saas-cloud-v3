# 02资产与站点 Figma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 按Figma完整实现02资产与站点页面与交互，重复稿优先克制风格。
**Architecture:** 复用现有Station组件及数据权限，资产区独立样式作用域，新增建站状态机及策略/电价子视图。
**Tech Stack:** React19、TypeScript、Vite8、现有Recharts/Leaflet。
**Spec:** `docs/superpowers/specs/2026-09-25-stations-figma-design.md`

## Global Constraints

- Figma文件 `Y0KMYFvalDXgSPnVZ5zG39`，页面`4:3`；获取高保真上下文及截图后才编辑页面。
- 用户已确认前端全流程；未接通EMS部署/下发不可伪装成功；无数据保留布局与空态。
- 子任务互不修改公共App/Sidebar/StationDetail导航，由主代理整合；不修改后端及无关未提交改动。
- 设计参考文本已保存于主目录 `.local-tools/figma-stations/<node-id>.txt`；仍需看对应截图及其余状态上下文。
- 保持现有组件导出/props，不擅自扩展后端协议；新增可选回调交由主代理整合。

### Task 1: 资产区公共框架与站点概览（主代理）
**Files:** App.tsx、Sidebar.tsx、StationDetailPage.tsx，新增资产区样式与overview子组件。
**Interfaces:** 沿用Station、detailTabs、onOpenStation等；资产区标记`data-design-area="stations"`；其余模块保持原样。
- [x] 对照2044:8026及1114:8271提取header/sidebar/workspace布局与本地资产。
- [x] 按56/176/44/48px设计实现资产区框架，概览左右能流/设备卡及上下功率/SOC图。
- [x] 验证站点切换、设备选择、图例和日期/粒度选择及API空态。

### Task 2: 站点入口、编辑与建站前端流程
**Files:** AssetsPage.tsx、StationEditPage.tsx、MapQueryTab.tsx、SmartRulesTab.tsx；可新增`components/station-provision/*`和专用CSS及tests。
**Interfaces:** 保持AssetsPage现有props；StationEditPage原保存回调。无后端的拓扑草稿以明确标记的本地草稿保存，不提交部署假状态。
- [x] 读取全部列表/收藏/地图/智能规则、编辑及2135:8507分区画板；记录所选节点。
- [x] 先补关键交互测试（收藏取消确认、未保存离开、建站步骤校验和未接通发布）并确认失败。
- [x] 按设计更新列表和编辑；实现新建基础信息→拓扑设备配置→校验发布→部署结果，含BMS配置/清空确认/新版本草稿与各真实空态。
- [x] 保留API读写权限，已有保存接口继续使用；未支持动作明确解释不可执行。
- [x] 类型检查、针对测试、截图自检；提交仅本任务文件并写任务报告。

### Task 3: 设备、告警与一次接线图
**Files:** StationDevicesPage.tsx、StationAlarmsPage.tsx、StationSingleLinePage.tsx及对应CSS/数据展示适配/tests。
**Interfaces:** 保留station prop与现有API调用，设备详情页接受可选初始设备ID或事件跳转，告警详情遵循现有权限。
- [x] 读取2271:10795、2274及2292系列、2109:8382/2111:26952、1496:9634全部上下文和截图。
- [x] 以设备类型选择、搜索、告警详情和无数据空态写回归测试。
- [x] 实现克制风格设备目录/档案/额定参数/告警/控制记录；告警表格与分布；CAD接线图与设备联动。
- [x] 验证缺失数据不生成示例状态，权限保持，截图及类型检查；提交任务文件和报告。

### Task 4: 策略运行与电价设置
**Files:** StationStrategyPage.tsx、StationPriceSettingsPage.tsx及策略/电价子组件、专用CSS/tests。
**Interfaces:** 保留station prop和原策略/电价持久化途径；子视图状态在组件内部管理。
- [x] 读取2343:12072分区R10全流程及R9独有管理/AI状态；读取2396:12453、2405:12634、2409:12880、2390:12820、2407:12757。
- [x] 先测方案选择/编辑时段/模式参数校验/模板类型切换/删除确认/未接通下发。
- [x] 实现R10综合概览和编辑，全部基础/覆盖模式及优先级，方案新增/设置/删除/默认配置/AI草案确认；API模式AI不可伪造服务生成。
- [x] 实现电价日历、日模板管理、固定/分时/动态编辑与时段增删校验。
- [x] 类型检查、针对回归和截图；提交任务文件及报告。

### Task 5: 收益、运行曲线与历史分析（主代理）
**Files:** StationRevenuePage.tsx、StationRunCurvePage.tsx、StationAnalysisPage.tsx及对应CSS。
**Interfaces:** 保留既有数据模型，深入分析事件传递station与指标/时间范围。
- [x] 读取2085:8130、1955:7238、1957:7906、973:4108、986:3367上下文及截图。
- [x] 对照设计更新两项收益汇总、收益柱图与明细；三行运行曲线及日期控制。
- [x] 打通深入分析与历史趋势入口；验证导出、粒度、指标、日期及真实空态。

### Task 6: 整体验证、审查与同步
**Files:** 任务验证文档，必要的集成修复。
- [x] 将所有设计状态映射到实际页面入口；检查未覆盖项并补齐。
- [x] 运行tsc、Vite build、受影响前端回归；浏览器核对主要页面与弹窗，留存截图。
- [x] 派发独立审查并解决发现；只同步本任务文件回主工作区，复测8443可访问。
- [x] 更新计划与验证记录，不推送远端。
