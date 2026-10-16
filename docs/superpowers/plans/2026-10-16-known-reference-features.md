# 已明确业务流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 在 develop-toyingzhen 和 ems_cloud_saas_toyingzhen 完整实现已有证据的业务功能，缺失规格单独保留待办。

**Architecture:** 扩展现有 Spring JDBC、数据库权威授权与 React 页面。按独立业务流程逐批交付，不把浏览器草稿或接口声明当成落库闭环；外部控制、诊断算法及收费契约未明确的部分不伪造执行结果。

**Tech Stack:** Java 21 / Spring Boot / PostgreSQL 16 / React 19 / TypeScript / Vite。

**Spec:** docs/reference-platform/public-business-flows.json、function-comparison.json、gap-implementation-plan.json。

## Global Constraints

- 工作区 C:/Users/Laptop/.codex/worktrees/toyingzhen/ems-cloud-v2.0；分支 develop-toyingzhen。
- 唯一迁移目标 ems_cloud_saas_toyingzhen；角色 ems_toyingzhen_owner；执行前同时核验 current_database/current_user。
- 不操作参考平台业务数据，不修改原库、原工作区及线上 API/采集进程，不连接生产消息消费组。
- 新迁移从 V26 起；不修改历史迁移；新库迁移前做独立备份。
- 复用 tenant/client/station 有效权限与审计。所有新增测试账号初始化密码 qwe123!@#，不重置原有账号。
- 第一批最新 Figma 已读取：站点列表 1114:8271（标签管理采用同页表格/弹窗样式作为替代节点，无独立标签画板）；经营看板 1059:10664。保留现有白绿淡色克制风格和组件，不复制参考平台布局。
- 无证明的模块/算法保留范围及具体缺口，不能静默删减整个项目范围。第一批并非全量交付。

## 批次与状态

全量122组流程由 implementation-ledger.json 逐项跟踪。首批为 station-tag-management、dashboard-global-configuration、dashboard-custom-editor-save-boundary 的配置持久化部分；指标计算、模板共享与其他流程继续列入后续批次。

### Task 1: 站点标签服务与新库迁移

**Files:** V26__station_tags.sql；business/StationTagService.java、StationTagController.java；相应 ServiceTest/PostgresTest。

**Interfaces:** GET /api/station-tags?q=&limit=&offset=；POST {name,description}；PUT /{id} {name,description,expectedVersion}；DELETE /{id}?expectedVersion=；GET/PUT /api/stations/{stationId}/tags，PUT {tagIds}。

- [x] 编写测试并观察失败：名称trim/去重、分页、修改版本冲突、跨租户拒绝、站点读写scope、删除关联保护。
- [x] 实现 tenant_id、version 与唯一名称约束；定义管理复用 asset.read/asset.edit，绑定须按站点 tenant/client 权限再次验证。
- [x] 用真实PG回滚测试验证 CRUD、重建服务后读取、关联保护与失败无部分写入。

```java
assertEquals("ems_cloud_saas_toyingzhen", db.queryForObject("select current_database()", String.class));
assertEquals("ems_toyingzhen_owner", db.queryForObject("select current_user", String.class));
```

### Task 2: 私人看板模板与选择持久化

**Files:** V27__monitor_templates.sql；business/MonitorTemplateService.java、MonitorTemplateController.java；相应测试。

**Interfaces:** GET /api/monitor/templates -> {items,selectedId}；POST {name,cards}；PUT /{id} {name,cards,expectedVersion}；PUT /{id}/pin {pinned,expectedVersion}；DELETE /{id}?expectedVersion=；PUT /api/monitor/templates/selection {templateId:null|UUID}。

- [x] 先验证失败：本人/tenant隔离、名称1—50、card白名单/去重、并发版本与选中模板删除回退。
- [x] 保存现有 overviewCards.ts 的卡片标识（现有中文稳定名称）；数据读取仍逐业务授权，模板本身不授予数据权限。
- [x] 模板、个人排序和选择在PG事务内持久化并写审计；不因GET、打开编辑器或关闭页面自动写业务记录。
- [x] 真实PG测试 CRUD、置顶、切换、重登录/重建读取、撤权及失败回滚。共享模板权限尚未取得契约，保留待办，不伪造共享。

### Task 3: 可达页面与真实API闭环

**Files:** api/stationTags.ts、api/monitorTemplates.ts；components/StationTagsPanel.tsx；AssetsPage.tsx；OverviewPage.tsx、OverviewDashboard.tsx；独立测试及最小样式。

- [x] 读取上述最新 Figma 设计及截图；复用 Workspace、Modal、EntryTabs、现有资产与看板样式。
- [x] 资产页增加标签管理入口及站点标签编辑；无权限禁写，失败保留草稿，409可重读，空态不放演示记录。
- [x] 看板支持新建/重命名/置顶/删除/选择模板，显式保存卡片；API模式不再把本地localStorage当服务器成功。
- [x] 测试创建、刷新复读、修改、重命名、删除、错误及撤权，API与demo模式保持区分。

### Task 4: 隔离迁移与验收

- [x] 提供可复用的 `scripts/migrate-toyingzhen.py`（默认只读预演，显式 apply 才执行），校验分支/私有配置/实时库名及角色、逐版本事务和迁移缺口；测试错误目标零DDL及失败回滚。不把私有一次性助手当可交付工具。
- [x] 运行现有API基线测试；保存既有失败，禁止通过重置数据掩盖失败。
- [x] 启动独立15435隧道，验证目标库/用户/迁移版本；备份新库。
- [x] 独立事务依次执行V26、V27并记录schema_migration，失败回滚；重复执行不重复应用。
- [x] 构建并仅启动127.0.0.1:18091与8444；不重启或覆盖线上服务。
- [x] PG真实测试、API正反例、UI持久化与视觉核对均有证据后，更新实施台账；未通过项目保持in-progress。

## 后续批次保留范围

### Task 5: 年度月发电计划配置（第二批）

- [x] 新增 V28、StationGenerationPlanService/Controller 与测试；UI 完成第一批后接入资产站点入口。
- [x] 复用站点 asset.read/asset.edit 和 auditStation；每站点每年一份计划，重复创建409，编辑/删除须 expectedVersion；year 编辑不可变。
- [x] GET/POST /api/stations/{stationId}/generation-plans；GET 可按 year 筛选；PUT/DELETE /{id}。
- [x] DTO {id,stationId,year,months:[{month,plannedKwh,excellentKwh}],version}；新建 {year,months}、更新 {months,expectedVersion}。12个月均须存在且月份唯一，常规值0.01—99999999.99，卓越值可空否则同范围，最多2小数；字符串十进制定点传输，明确使用kWh。
- [x] 当前年按既有站点设计 Asia/Shanghai；新建允许当前年前后20年，旧记录可读取和编辑既有年份；GET 无写入，单据按站点授权。
- [x] 真实 PG 与 HTTP 验证新增/刷新/修改/删除、跨站点拒绝、409及失败回滚。计划完成率算法与预测执行没有明确契约，保持独立待办，不能声称已计算。

站点计量来源/偏移/月发电计划，费率模板及绑定，EMS模板/日历，报表模板/调度，报警规则与通知，经营资产/台账/账单/能源合同，组织/角色/消息/内容/视频/OpenAPI等按逐流程证据继续推进。49条未取得实现路由及2个iframe内部模块保留待办。已有部分能力仍需补齐闭环，不因首批通过而标全量完成。

### Task 6: 站点空间树与设备关联（第三批）

接口前缀裁定：本任务全部空间变更路径均以 `/api/stations/{stationId}` 为前缀；下文 `/spaces/{id}` 均是该站点前缀下的相对路径，不提供全局 `/api/spaces/{id}`。

- [x] 新增 V29、StationSpaceService/Controller、规则/PG 测试、独立 API client 与 StationSpacesPanel；站点更多操作接入“空间管理”。复用现有站点 asset.read/edit、auditStation。
- [x] GET/POST /api/stations/{stationId}/spaces；Space 为 {id,stationId,parentId,name,type,version,deviceCount}，UUID 空间ID、字符串站点ID；POST {parentId:null|UUID,name,type}。类型为已取得枚举10/20/30/40/50/60，名称 trim 后1—80；同父层级名称不分大小写唯一。
- [x] PUT /spaces/{id} {name,expectedVersion} 只重命名；PUT /spaces/{id}/parent {parentId,expectedVersion} 移动；DELETE /spaces/{id}?expectedVersion=。禁止自环/后代环、跨站点父节点；按站点串行树写入并约束数据库，不臆造未知的类型层级限制。仅允许删除无子空间、无关联设备的空叶节点。
- [x] GET /api/stations/{stationId}/space-devices?q=&spaceId=&unassigned=&limit=&offset= 返回 {items,total}，Device 为 {deviceId,name,code,spaceId,spaceName}；分页、搜索、空间及未分配过滤均在服务器按站点执行。
- [x] PUT /spaces/{id}/devices {deviceIds:string[],expectedVersion} 批量添加关联（至少1、最多200、去重）。每台设备只能关联一个同站空间；已关联其他空间时409，须明确解除后重新绑定；同空间重复关联保持可重试。DELETE /spaces/{id}/devices/{deviceId}?expectedVersion= 解除。关联/解除均更新空间版本、原子审计，整批非法设备不产生部分写入。
- [x] UI 树+列表/编辑弹窗复用现有白绿组件；缺少独立空间画板，采用最新 Figma1114:8271 表格/弹窗替代节点，并记录。类型名称须从已取源码 locale 确认；物理画布与空间能耗汇总仍独立待办。
- [x] 真实 PG/HTTP 与浏览器验证建立层级、重命名、移到根/其他节点、环拒绝、检索、设备绑定/解除、关联保护、版本冲突、租户/站点拒绝、草稿及撤权；API GET 不写入。

### Task 7: 报表模板接通现有生成、预览和下载（第四批）

本项目采用现有 AnalysisJobService 的真实报告字段目录，不能冒充参考平台未取得的后台动态字段；本批不实现新指标算法、自动调度或外部投递。模板功能必须接入真实报告任务，不能只做独立 CRUD。

- [x] 新增 V30、ReportTemplateService/Controller 与规则/受保护PG测试；只扩展现有 AnalysisJobService 的可选模板参数和不可变快照。模板仍不授予数据权限，生成/预览/下载逐次复用现有 report.export 和各报告类型站点权限；不启用当前不可用的 report.generate。
- [x] GET /api/report-templates?kind=&timeType= 返回 Template[]；GET /api/report-template-fields?kind= 返回 {schemaVersion:1,timeTypes:[{code,label}],fields:[{code,label,group,locked,linkRef:string[]}]}。kind 限 operations/revenue/health，项目周期 day/month/year/range 表示日期选择方式，保留既有报告时间范围上限，不声称实现未知累计聚合。
- [x] Template 为 {id:string,name,kind,timeType,origin:'system'|'custom',fields:string[],schemaVersion:1,version}。系统模板提供每种报告/周期的默认字段配置且不可修改；自定义按 actor+tenant 隔离、总数最多10、名称 trim1—50不分大小写唯一，新增/改名/另存均事务与审计。
- [x] POST /api/report-templates {name,kind,timeType,fields}；PUT /{id} {name,timeType,fields,expectedVersion}（kind 不变）；DELETE /{id}?expectedVersion=；POST /{id}/clone {name,expectedVersion}。克隆明确生成私人模板，不修改系统模板。
- [x] 字段目录仅覆盖已有报告真实 Summary、Section/Column 及必要的站点/时段/生成时间元信息；白名单、必选字段与 linkRef 依赖在服务器校验，UI 自动保留必选项并处理联动。未知参考字段继续待办，不用示例指标填充。
- [x] 既有 JobRequest 增加可选 templateId、expectedTemplateVersion；同时给出或同时省略。模板与 kind 匹配，版本变化409；本批模板请求不接受额外 pointIds，原无模板请求保持原行为。创建时将模板版本、字段、名称保存为 analysis_job 的不可变 JSON 快照；历史无快照任务保持原输出。生成正文、预览和CSV均使用同一快照过滤字段，删除/修改模板不破坏已有任务及重试。
- [x] ApiAnalyticsPage 报告中心接入模板选择与管理/另存，day/month/year/range 控件转换为现有 ISO 半开时间范围；历史记录与预览展示任务快照模板名。复用当前白绿组件；实施前读取 Figma4:7 中最新对应报告画板及截图，优先克制版本，记录选定节点。
- [x] 测试名称/容量/系统只读/另存/字段依赖/所有权/409/失败保留草稿；真实HTTP创建模板→生成报告→预览与CSV一致→删除模板后历史仍可读/下载；撤权后仍拒绝报告数据。所有数据只入新库。

### Task 8: 自账户姓名编辑的现有功能闭环修复

仅完善 shell-basic-info 已明确的姓名子流程，不将头像、联系方式或单位转换标为完成。姓名长度继续兼容当前项目1—120合同，不静默收紧历史资料；复用现有 GET/PUT /api/me/profile、审计与身份刷新，不增加账号或变更密码。

- [x] 查看最新Figma设置1077:1794中账户资料实际画板context与截图，记录替代/选用节点；沿用现有克制风格。
- [x] 初次读取完成前禁止编辑/提交，防止迟到读取覆盖输入；保存/失败保留正确草稿和错误状态，成功重读资料及全局身份，文案仅描述姓名。
- [x] 将姓名dirty与保存中状态注册到设置页已有离开guard；关闭/导航明确保留或放弃，不自动写入。
- [x] 浏览器验证刷新回读、空白验证、读取/写入失败保留草稿、导航保护及切换账户不继承草稿；后端既有姓名接口不变时不为UI改动新增无意义镜像测试。

### Task 9: 手工购电模板版本与站点绑定闭环

只实现 fixed/tou 单一购电配置。外部/自动/阶梯、独立售电、基本电费、工作日、按月小时导入仍TODO；不调用外部服务，不修改或重算任何结算金额。当前账单没有费率FK，不冒充已取得费率核算来源。现有策略概览从 GET stations/{id}/tariffs 读取，必须保持该消费者可见当前有效绑定。

- [x] 新增V31及TariffTemplate/Binding服务、控制器和规则/受保护PG测试。模板身份按actor tenant隔离，复用已实现tariff.manage（库管理requirePermission；绑定逐站requireStationPermission并检查站点与模板同tenant）；不启用tariff.read。
- [x] GET/POST /api/tariff-templates；GET/PUT/DELETE /{uuid}。DTO {id,name,currency,pricingMode:'fixed'|'tou',periods:[{startMinute,endMinute,band,pricePerKwh:string}],version}。POST无version；PUT全配置+expectedVersion；DELETE?expectedVersion为归档。name trim1—50、当前租户未归档名称大小写不敏感唯一；currency沿用[A-Z]{3}。每次更新创建新不可变价格版本（已有tariff/period作为载体），已绑定版本价格/名称不变；归档不解绑历史，不能再绑定。
- [x] 价格为严格JSON十进制字符串，绝对值≤99999999.999999、最多6位小数，允许0/负数（兼容当前负价规则），输出统一6位。时段整数分钟1—96组，排序后无缝覆盖[0,1440)，band沿用peak/flat/valley/superPeak；fixed须单个全天flat。拒绝未知字段/无效版本及输入，不将数值JSON静默舍入。
- [x] GET/POST /api/stations/{sid}/tariff-bindings，GET可includeInactive=true。Binding {id:string,stationId:string,templateId:string|null,templateVersion:number|null,name,currency,pricingMode:'fixed'|'tou'|null,periods,validFrom,validUntil,active:boolean,version}；遗留未归属模板的绑定保留null身份。POST {templateId,expectedTemplateVersion,validFrom,validUntil}。PUT /{bindingId} {validFrom,validUntil,expectedVersion}仅改日期；DELETE?expectedVersion明确解除（active=false，不删记录）。结束日不含，允许单日[D,D+1)，UI明确标注，不复制参考未知日期边界。
- [x] GET /stations/{sid}/tariff-bindings/{bindingId}/history 返回按version排序的Binding[]，冻结每次有效期和解除状态。为station_tariff增加active/version/可空模板版本关联，初始旧数据不猜tenant、不转入模板库。保留旧绑定初始历史；新建/日期编辑/解除都保留不可变历史。数据库约束模板版本载体及绑定身份不可变、同站active日期不重叠；更新旧GET只返回active，旧POST默认active仍受同一排斥约束。所有写与审计原子化，每站串行绑定写入。
- [x] 历史保护裁定：本批新建/改期validFrom须≥Asia/Shanghai明天；改期/解除还要求绑定原validFrom≥上海明天（包括legacy），已生效/过去的绑定只读并返回409。Binding额外返回modifiable:boolean给UI禁用，写入时服务器仍复核。已生效绑定的未来截断/替换语义尚未明确，独立TODO；不将此子集标为整个绑定流程完成。
- [x] 新API模式TariffWorkspace使用服务器模板/绑定管理（可独立新组件），替换把本机模板保存当主要功能的路径；demo原演示保留。支持模板新建/编辑/归档、绑定/日期编辑/解除、历史与服务器刷新。失败/409/撤权保留草稿并给恢复路径，跨站导航与保存中保护复用现有guard。外部/售电/日历草稿等未落库能力明确待办，不假发布。
- [x] 修改样式前读取Figma运营4:4中实际电价页面最新context+screenshot并记录节点，沿用克制白绿。规则/PG/HTTP/浏览器覆盖负价和六位精度、跨租户、重复/版本/重叠拒绝、改模板不改绑定、改期/解除历史可读、旧GET兼容及结算金额未动。
