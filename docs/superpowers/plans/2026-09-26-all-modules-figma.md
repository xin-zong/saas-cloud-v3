# Figma 01—08 全平台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. One implementation agent at a time, with task reviews.

**Goal:** 对齐全部现有前端页面，补齐八模块中独有业务页面与交互。
**Architecture:** 复用现有React页面和API层，先统一共享框架再逐模块更新，使用模块样式避免无意跨区改动。
**Tech Stack:** React19 / TypeScript / Vite8 / CSS / Recharts / Playwright。
**Spec:** ../specs/2026-09-26-all-modules-figma-design.md

## Global Constraints

- 01 总览 594:3224；02 资产与站点 4:3；03 运营中心 4:4；04 运维中心 4:5；05 工单与审批 4:6；06 分析与报告 4:7；07 平台管理 4:8；08 设置 1077:1794。
- 00 设计库 498:2、导航布局 4:2 是共享外观依据。视觉变更前必须读取对应最新 get_design_context 和截图，不能只靠元数据或旧实现。
- 同一业务优先标题含“克制风格”的设计；否则选完整较新业务版本，旧版独有功能组合到新页面，重复布局不增加重复入口；流程箭头记录为导航关系。
- 逐画板记录 selected / composed / superseded / connector，并指向实际入口、具体交互或替代节点。没有映射的画板不能宣称完成。
- 覆盖三类角色可见页面、列表筛选、详情、表单、确认、校验、保存失败、未保存离开、权限撤销。现有 API 调用和授权语义保持，不扩大权限。
- 用户已批准前端全页面范围：已有接口继续接入；缺少后端的功能保留完整布局、表单和可执行前端交互，明确显示未接通，不伪造成功、收益、发布或执行。可存明确标注的本地草稿，按账号/API-demo模式/业务对象隔离。
- API 数据缺失或失败保留设计布局，用真实空态/错误；数据库模拟数据沿用实际接口，不在 API 前端注入原型假数据。
- 本轮不新增 EMS 接入、数据库迁移或设备命令服务，不更改已入库的模拟数据。
- 保留主工作区原有9个未提交文件。两项前端成员摘要修改已复制到隔离分支作为工作基线；后台文件不动。
- 不运行 oxfmt（既有版本可能破坏内联 TS）；尽量维持原文件格式，组件复用 React/Recharts/现有控件，不新增依赖。
- 在1366/1440/1920宽度核对布局、静态资产位置比例及主要弹窗；类型检查、构建、相关回归与最终全前端回归通过。
- 完成后按既有授权集成本地 main，不推送远端。截图和工具上下文存忽略目录；选用节点、覆盖表和验证记录进入 docs。


### Task 1: 共享框架与01总览
**Files:** ems-cloud-ui/src/components/ 下 App.tsx、Sidebar.tsx、Header.tsx、LeftPanel.tsx、RightPanel.tsx、MapView.tsx、StationGlobalHeader.tsx；新增共享全平台CSS/总览组件；tests/all-modules-overview-ui.test.cjs；docs/superpowers/verification/2026-09-26-figma-module-01.md。
**Design:** 页01，重点节点1172:26660、1059:10664、1286:2252。完整库存的本模块是范围上限，逐画板给出映射，不能只读取重点节点。
**Interfaces:** 共享框架保留 App 的导航/权限/leave guard 回调，桌面 header56、expanded sidebar176/collapsed64；核对4:2实际布局。总览地图/详情浮层/筛选/全屏及不同画板差异必须可达；禁止把原型站点坐标写成API数据。
- [ ] 读取库存本模块、现有文件及最新设计上下文/截图；在验证文档逐项记录选用、组合、替代或连接关系。
- [ ] 针对新增交互编写行为测试，先证实当前缺口；纯样式使用截图核对，不写镜像实现的无效断言。
- [ ] 复用现有props和回调实现布局及全部独有状态；动态业务数据来自原接口；完整实现表单校验、离开保护和错误态。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node --test --test-concurrency=1 tests/all-modules-overview-ui.test.cjs` 和与修改相关的现有测试，使用 API_PREVIEW_URL=8461、DEMO_PREVIEW_URL=8460。
- [ ] 在1366/1440/1920下核对最新设计和实际截图，检查资产尺寸/槽位/本地非空文件；保存证据到忽略目录。
- [ ] 提交本任务文件，报告范围/测试命令与输出/覆盖表/遗留问题；控制者独立审查并处理发现。

### Task 2: 02资产与站点复核更新
**Files:** ems-cloud-ui/src/components/ 下 AssetsPage.tsx、StationDetailPage.tsx、Station*Page.tsx、station-provision/*、strategy/*、tariff/*和对应CSS；tests/all-modules-stations-ui.test.cjs；docs/superpowers/verification/2026-09-26-figma-module-02.md。
**Design:** 页02，重点节点完整库存中02共102画板，克制版2044:8026、2085:8130、2271:10795优先；R10策略与新建站流程继承上一轮。完整库存的本模块是范围上限，逐画板给出映射，不能只读取重点节点。
**Interfaces:** 保持现有 station props、数据接口、标签记忆/溢出、全部编辑leave guard；查设计差异后修改，已对齐的部分记录验证即可，不重复重写。
- [ ] 读取库存本模块、现有文件及最新设计上下文/截图；在验证文档逐项记录选用、组合、替代或连接关系。
- [ ] 针对新增交互编写行为测试，先证实当前缺口；纯样式使用截图核对，不写镜像实现的无效断言。
- [ ] 复用现有props和回调实现布局及全部独有状态；动态业务数据来自原接口；完整实现表单校验、离开保护和错误态。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node --test --test-concurrency=1 tests/all-modules-stations-ui.test.cjs` 和与修改相关的现有测试，使用 API_PREVIEW_URL=8461、DEMO_PREVIEW_URL=8460。
- [ ] 在1366/1440/1920下核对最新设计和实际截图，检查资产尺寸/槽位/本地非空文件；保存证据到忽略目录。
- [ ] 提交本任务文件，报告范围/测试命令与输出/覆盖表/遗留问题；控制者独立审查并处理发现。

### Task 3: 03运营中心
**Files:** ems-cloud-ui/src/components/ 下 OperationsCenterPage.tsx、OperationsSchedulePage.tsx、OperationsMarketPage.tsx、OperationsSettlementPage.tsx、ApiMarketPage.tsx及分拆子组件；tests/all-modules-operations-ui.test.cjs；docs/superpowers/verification/2026-09-26-figma-module-03.md。
**Design:** 页03，重点节点1983:2704、1966:1845、1971:1934/2194/2454、1979:2206/2389/2572/2739、1982:2783；其余库存历史独有交互逐项映射。完整库存的本模块是范围上限，逐画板给出映射，不能只读取重点节点。
**Interfaces:** 保留内部plans/submit和settlements契约；市场邀约不是已有market草稿发布，无法支持的参与/拒绝后端动作明确未接通；所有入口继续按原权限过滤。
- [ ] 读取库存本模块、现有文件及最新设计上下文/截图；在验证文档逐项记录选用、组合、替代或连接关系。
- [ ] 针对新增交互编写行为测试，先证实当前缺口；纯样式使用截图核对，不写镜像实现的无效断言。
- [ ] 复用现有props和回调实现布局及全部独有状态；动态业务数据来自原接口；完整实现表单校验、离开保护和错误态。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node --test --test-concurrency=1 tests/all-modules-operations-ui.test.cjs` 和与修改相关的现有测试，使用 API_PREVIEW_URL=8461、DEMO_PREVIEW_URL=8460。
- [ ] 在1366/1440/1920下核对最新设计和实际截图，检查资产尺寸/槽位/本地非空文件；保存证据到忽略目录。
- [ ] 提交本任务文件，报告范围/测试命令与输出/覆盖表/遗留问题；控制者独立审查并处理发现。

### Task 4: 04运维中心
**Files:** ems-cloud-ui/src/components/ 下 MaintenanceCenterPage.tsx及新maintenance子组件、对应CSS；tests/all-modules-maintenance-ui.test.cjs；docs/superpowers/verification/2026-09-26-figma-module-04.md。
**Design:** 页04，重点节点1000:661、1036:820、1038:1413、1580:2859、1987:1765/2040/2315及库存剩余独有页面。完整库存的本模块是范围上限，逐画板给出映射，不能只读取重点节点。
**Interfaces:** 沿用告警确认、巡检、工单、固件读取接口；执行升级/远程诊断无服务时禁止模拟成功；以实际注册设备身份进入详情，空态保留布局。
- [ ] 读取库存本模块、现有文件及最新设计上下文/截图；在验证文档逐项记录选用、组合、替代或连接关系。
- [ ] 针对新增交互编写行为测试，先证实当前缺口；纯样式使用截图核对，不写镜像实现的无效断言。
- [ ] 复用现有props和回调实现布局及全部独有状态；动态业务数据来自原接口；完整实现表单校验、离开保护和错误态。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node --test --test-concurrency=1 tests/all-modules-maintenance-ui.test.cjs` 和与修改相关的现有测试，使用 API_PREVIEW_URL=8461、DEMO_PREVIEW_URL=8460。
- [ ] 在1366/1440/1920下核对最新设计和实际截图，检查资产尺寸/槽位/本地非空文件；保存证据到忽略目录。
- [ ] 提交本任务文件，报告范围/测试命令与输出/覆盖表/遗留问题；控制者独立审查并处理发现。

### Task 5: 05工单与审批
**Files:** ems-cloud-ui/src/components/ 下 WorkOrdersApprovalPage.tsx及新work-orders子组件、对应CSS；tests/all-modules-workorders-ui.test.cjs；docs/superpowers/verification/2026-09-26-figma-module-05.md。
**Design:** 页05，重点节点1107:1090、1108:1532/2100、1746:2814、1750:2930、1759详情系列、1161新建系列、1627/1630/1631/1632办理状态系列、1777/1765筛选。完整库存的本模块是范围上限，逐画板给出映射，不能只读取重点节点。
**Interfaces:** 保留现有 workorder create/edit/handle 与 approval 权限和接口状态语义；不把未支持的补材料/验收等状态伪装成后端已保存；有权限才提交。
- [ ] 读取库存本模块、现有文件及最新设计上下文/截图；在验证文档逐项记录选用、组合、替代或连接关系。
- [ ] 针对新增交互编写行为测试，先证实当前缺口；纯样式使用截图核对，不写镜像实现的无效断言。
- [ ] 复用现有props和回调实现布局及全部独有状态；动态业务数据来自原接口；完整实现表单校验、离开保护和错误态。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node --test --test-concurrency=1 tests/all-modules-workorders-ui.test.cjs` 和与修改相关的现有测试，使用 API_PREVIEW_URL=8461、DEMO_PREVIEW_URL=8460。
- [ ] 在1366/1440/1920下核对最新设计和实际截图，检查资产尺寸/槽位/本地非空文件；保存证据到忽略目录。
- [ ] 提交本任务文件，报告范围/测试命令与输出/覆盖表/遗留问题；控制者独立审查并处理发现。

### Task 6: 06分析与报告
**Files:** ems-cloud-ui/src/components/ 下 AnalyticsAiPage.tsx、ApiAnalyticsPage.tsx、StationAnalysisPage.tsx及新analytics子组件、对应CSS；tests/all-modules-analytics-ui.test.cjs；docs/superpowers/verification/2026-09-26-figma-module-06.md。
**Design:** 页06，重点节点1093:661/1039、1990:8374/8878、1992:21289、1034:10365/10734。完整库存的本模块是范围上限，逐画板给出映射，不能只读取重点节点。
**Interfaces:** 复用注册测点历史查询、动态point ID、31天分段、CSV真实数据；数据下载与报告中心均可进入；没有报告生成服务时显示未接通，保留筛选和详情结构。
- [ ] 读取库存本模块、现有文件及最新设计上下文/截图；在验证文档逐项记录选用、组合、替代或连接关系。
- [ ] 针对新增交互编写行为测试，先证实当前缺口；纯样式使用截图核对，不写镜像实现的无效断言。
- [ ] 复用现有props和回调实现布局及全部独有状态；动态业务数据来自原接口；完整实现表单校验、离开保护和错误态。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node --test --test-concurrency=1 tests/all-modules-analytics-ui.test.cjs` 和与修改相关的现有测试，使用 API_PREVIEW_URL=8461、DEMO_PREVIEW_URL=8460。
- [ ] 在1366/1440/1920下核对最新设计和实际截图，检查资产尺寸/槽位/本地非空文件；保存证据到忽略目录。
- [ ] 提交本任务文件，报告范围/测试命令与输出/覆盖表/遗留问题；控制者独立审查并处理发现。

### Task 7: 07平台管理
**Files:** ems-cloud-ui/src/components/ 下 PlatformManagementPage.tsx、MemberOrganizationPanel.tsx、MemberGrantsPanel.tsx、RolePermissionsPanel.tsx及子组件/CSS；tests/all-modules-platform-ui.test.cjs；docs/superpowers/verification/2026-09-26-figma-module-07.md。
**Design:** 页07，重点节点1995/1999/2002/2004/2006/2007/2012/2016新权限系列优先；客户1673:5775/6001/6227/6453；审计1673:9495/9720；其余独有临时授权/审批规则/安全策略/通知/API集成/配置须映射。完整库存的本模块是范围上限，逐画板给出映射，不能只读取重点节点。
**Interfaces:** 保留多授权范围、角色上限、只读角色、并发保存与权限撤销保护，保留复制的成员摘要基线；缺少接口的独有设计展示真实未接通表单，不能创建权限或伪造保存。
- [ ] 读取库存本模块、现有文件及最新设计上下文/截图；在验证文档逐项记录选用、组合、替代或连接关系。
- [ ] 针对新增交互编写行为测试，先证实当前缺口；纯样式使用截图核对，不写镜像实现的无效断言。
- [ ] 复用现有props和回调实现布局及全部独有状态；动态业务数据来自原接口；完整实现表单校验、离开保护和错误态。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node --test --test-concurrency=1 tests/all-modules-platform-ui.test.cjs` 和与修改相关的现有测试，使用 API_PREVIEW_URL=8461、DEMO_PREVIEW_URL=8460。
- [ ] 在1366/1440/1920下核对最新设计和实际截图，检查资产尺寸/槽位/本地非空文件；保存证据到忽略目录。
- [ ] 提交本任务文件，报告范围/测试命令与输出/覆盖表/遗留问题；控制者独立审查并处理发现。

### Task 8: 08设置
**Files:** ems-cloud-ui/src/components/ 下 SystemSettingsPage.tsx、App.tsx退出回调（最小变更）及settings子组件/CSS；tests/all-modules-settings-ui.test.cjs；docs/superpowers/verification/2026-09-26-figma-module-08.md。
**Design:** 页08，重点节点1146:810/962/1114/1266、1934:1121；1101:661旧版独有交互映射。完整库存的本模块是范围上限，逐画板给出映射，不能只读取重点节点。
**Interfaces:** 保留已有设置存储/重置/错误反馈；新增项明确本地或未接通；密码与MFA变更无接口时不伪造；退出确认走真实onLogout并保持草稿保护与安全退出逻辑。
- [ ] 读取库存本模块、现有文件及最新设计上下文/截图；在验证文档逐项记录选用、组合、替代或连接关系。
- [ ] 针对新增交互编写行为测试，先证实当前缺口；纯样式使用截图核对，不写镜像实现的无效断言。
- [ ] 复用现有props和回调实现布局及全部独有状态；动态业务数据来自原接口；完整实现表单校验、离开保护和错误态。
- [ ] 运行 `node node_modules/typescript/bin/tsc --noEmit`、`node --test --test-concurrency=1 tests/all-modules-settings-ui.test.cjs` 和与修改相关的现有测试，使用 API_PREVIEW_URL=8461、DEMO_PREVIEW_URL=8460。
- [ ] 在1366/1440/1920下核对最新设计和实际截图，检查资产尺寸/槽位/本地非空文件；保存证据到忽略目录。
- [ ] 提交本任务文件，报告范围/测试命令与输出/覆盖表/遗留问题；控制者独立审查并处理发现。

### Task 9: 全量验收与集成
**Files:** 完整覆盖清单、总验证文档、必要集成修复。
**Interfaces:** 八模块逐画板映射汇总；三角色、API/demo运行模式、App共享导航与编辑离开保护。
- [ ] 汇总262画板映射，确认没有未处理业务设计；已被新版本替代的节点注明对应版本和理由。
- [ ] 运行完整前端测试 scripts/run-tests.cjs，tsc、Vite build；核对三角色入口与主要页面截图。
- [ ] 独立全分支审查；一次集中修复与范围复审。
- [ ] 保护主工作区未提交修改，按既有授权本地集成main并复测；不推送远端。
- [ ] 更新验证文档和完成状态，明确未接通后端与范围限制。
