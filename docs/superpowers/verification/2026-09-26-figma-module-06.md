# 06 分析与报告：设计映射与验证

设计文件：`Y0KMYFvalDXgSPnVZ5zG39`，页面 `4:7`。2026-09-26 本轮七份 `get_design_context(skillNames=figma-design-to-code)` 上下文及七张非空正常截图均已读取、查看。来源为控制者当日保存的 `module06-context-*.txt` / `module06-design-*.png`，不是旧实现截图。没有标题含“克制风格”的重复稿；以 1093/1990 新版工作台为主，1034 两稿保留独有功能。

## 七画板映射

| 节点 | 状态 | 实际入口与保留的独有交互 |
| --- | --- | --- |
| `1093:661` P060 实时分析 | selected | 分析与报告 → 数据分析 → 信号分析 → 实时分析。注册信号搜索、仅显示已选、设备分组、独立信号/曲线选择、叠加/分层/分窗、A/B 游标、相对/绝对时间、平移、缩放、适配、网格、点、X/Y/XY 坐标及通道表、真实 CSV。API 复用 StationAnalysisPage，不再显示旧单点表单。 |
| `1990:8374` P060-H 历史趋势 | selected | 同页 → 历史趋势。开始/结束时间、1/5/15/30/60 分钟粒度、查询、真实空态、读取失败重试。注册 point ID、最多 31 天一段、一年内查询、显式缺口断线沿用。 |
| `1992:21289` P060-S 站点选择展开 | composed | 分析工具栏的站点按钮 → 带搜索输入的列表；按真实授权站点过滤；点击切换、Escape/外部点击关闭；切换重新加载注册信号并清除旧站数据。 |
| `1093:1039` R5-P061 报告中心 | selected | 报告中心 → 报告类型/站点/日期 → 下载 CSV 报告；范围预览保留详情结构；生成历史表保留真实空态。`operations/revenue/health` 已接通，绝不标作全部报告未接通。服务器生成任务、排版正文/预览及历史服务尚未接通。Demo 的既有本地演示报告明确标注演示模式。 |
| `1990:8878` P062 数据下载 | selected | 数据下载 → 站点/设备/CSV/时间范围/粒度 → 参数弹窗（全选、清空、取消、应用）→ 生成文件 → 当前页面本地记录。仅查询所选设备的所选注册测点；生成中、可下载、无数据、失败重试；CSV 值来自真实历史接口。 |
| `1034:10365` trend-analysis | composed | 历史趋势内新增今日/7天/30天/自定义时间、趋势对照摘要（平均功率输出、数据完整度、异常标记、通信中断频率）。原稿可选曲线变量由注册信号浏览器承接，任意功率、SOC、无功、电压、电流、SOH、温度、电量测点只有实际注册后才可查询，不伪造预设变量。均值取首个显示中的 kW 通道；完整度按所选通道和查询粒度计算；缺少异常/通信事件来源时显示未提供。 |
| `1034:10734` events-audit | composed | 数据分析 → 事件审计。日期、事件类型、站点、操作人、结果、日志搜索、重置；九列表格、展开详情、操作前后状态、设备回执、真实 JSON/复制、导出 CSV（Excel 可打开）、分页。GET /audit 只提供当前账户日志；没有把个人日志说成全站审计。缺少快照、设备回执、执行结果、关联告警/工单字段时明确未提供。站点过滤只采用日志明确的 `station=<id>` 字段，不推断指令执行结果。 |

## 数据、权限与状态

- API 与 demo 保持分支隔离；没有新建后台接口、数据库结构或注入 Figma 样例业务数据。
- API 报告须所选站点同时具备 `report.export` 与 `strategy.read`（运营）、`revenue.read`（收益）或 `asset.read`（健康），既有真实 CSV 下载保留。日期检查包括真实日历日期、先后顺序和一年上限；下载错误可直接重试。
- 报告异步请求接入 AbortSignal；站点、类型、时间、账号或权限变化时取消，取得 CSV Blob 后再次检查取消/会话，防止撤权后迟到文件下载。
- 下载组件按账号和资源授权集合隔离；部分撤权使当前测点、弹窗选择、生成中请求和本地下载结果一起失效，保留另一个有权限的站点可用。时间查询条件属于临时筛选，不是持久化编辑器；没有新增无需兑现的“已保存”或草稿。参数弹窗取消不修改已应用选择，故无需把筛选动作注册为跨页面未保存业务编辑。
- 历史接口继续保留真实零值，拒绝 `null` 数值被 `Number(null)` 变为零；未知/无效采样数量不伪造成有效样本。API 通道表标“有效时间点/聚合粒度”，不把区间数当原始样本数或频率。
- X 轴缩放/平移导出当前时间视窗；Y 轴缩放保留完整时间轴；适配恢复全范围。缺口始终断开，不为了截图补线。
- 修复审查 P2：趋势摘要的完整度固定统计完整查询区间（不含结束端点），分子与分母使用同一范围、粒度和所选通道，不随平移/缩放/Y 模式/适配变化。只有匹配当前站点、输入时间、粒度、通道的成功查询才展示百分比；未提交条件显示待查询，加载显示查询中，失败显示不可用，成功空响应允许 0%。功率均值仍明确属于当前视窗。
- 修复审查 P2：审计事件类型恢复多选，实际 `action` 按 OR 匹配，表格与 CSV 使用相同筛选并集。尚未接通的设备事件类别禁用且标注未接通，重置恢复全部真实 action。
- `StationAnalysisPage` 的原有 props 原样保留，只增加可选 `analyticsFeatures` / `stationSelector`。模块 02 不传新选项，页面行为与原选择器保持兼容；分析模块 CSS 全部限制在 `.analytics-ai-page`。

## 验证

工作目录 `ems-cloud-ui`，Node 固定使用 `C:/Users/Laptop/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`。

| 命令（`node` 代表上述绝对路径） | 结果 | 原始日志 |
| --- | --- | --- |
| `node --test --test-concurrency=1 tests/all-modules-analytics-ui.test.cjs tests/analytics-api.test.cjs tests/analytics-ui.test.cjs tests/station-analysis-regressions.test.cjs`，API/PREVIEW=8461，DEMO=8460 | 13/13 通过 | `task6-final-tests.log` |
| `node --test --test-concurrency=1 tests/centers-ui.test.cjs tests/stations-figma-shell-ui.test.cjs tests/all-modules-stations-ui.test.cjs`，PREVIEW/DEMO=8460，API=8461 | 7/7 通过（含子测试） | `task6-shared-regressions.log` |
| `node --test --test-concurrency=1 tests/stations-figma-shell-ui.test.cjs`，最终共享组件再次验证 | 2/2 通过 | `task6-shared-final.log` |
| `node --test --test-name-pattern="selected station telemetry revocation" tests/capabilities-api-ui.test.cjs`，PREVIEW=8461 | 1/1 通过 | `task6-capability-regression.log` |
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 | `task6-tsc.log` |
| `node node_modules/vite/bin/vite.js build` | exit 0；已有大 chunk 提示 | `task6-build.log` |

原始日志均在忽略目录 `.superpowers/sdd/2026-09-26-all-modules-figma/`。先失败后实现的证据：`task6-red.log`（缺实时工作台、设备选择、报告站点）；`task6-data-red.log`（null 被转为 0）；`task6-pan-red.log`（缺平移控件）。对应功能都纳入最终通过测试。

审查修复轮的 `task6-fix-red.log` 记录三个预期失败：平移后完整度 100%→50%、未提交时间变化仍显示旧百分比、缺少多选控件。`task6-fix-green.log` 记录三项定向回归通过；最终覆盖套件另包含实际拖动 Brush 缩放，检查完整度仍为 100%，视窗时间点已经减少。新增实际截图 `task6-fix-completeness-1440.png` 与 `task6-fix-audit-filter-1440.png` 已人工查看，前者是专用于完整度回归的完整桶 fixture，后者展示两种真实 action 多选及未接通类别禁用。

修复轮最终证据：上述四文件覆盖命令 16/16（`task6-fix-final-tests.log`）；最后快捷日期分钟精度校正后，以 `--test-name-pattern='review '` 重跑模块测试 3/3（`task6-fix-final-focused.log`，含今日快捷查询）；共享 `tests/stations-figma-shell-ui.test.cjs` 2/2（`task6-fix-shared.log`）；`tsc --noEmit` exit 0（`task6-fix-tsc.log`）。本轮未扩大到全仓测试，未改变后台和原有共享图表 props。

旧 `analytics-ui` / `capabilities-api-ui` 只把旧“单点表单”选择器迁移到新的工作台/下载配置，保留稀疏数据、真实报告、403 不造文件、部分站点撤权、既有报告权限等业务断言。

## 视觉与资产证据

最终截图也在上述忽略目录，文件名为 `task6-<场景>-<宽度>.png`：

- 宽度：1366、1440、1920，高度均 900。
- 场景：`api-live`、`api-history`、`api-download`、`api-reports`、`station-picker`、`parameters`、`audit-detail`、`demo-live`（共 24 张）。
- `task6-asset-geometry.json` 保存各宽度的面板坐标、宽高及可见资产自然/实际尺寸。页面横向溢出检查通过；窄宽图表工具自然换行，长通道/历史页可纵向滚动。
- 新下载资产 `/figma/analytics/search.svg` 来自本轮 `1093:661` 的 `imgIconSearch`，本地非空，SVG 根尺寸 16×16；用于信号浏览器搜索槽与站点弹出框搜索槽；三宽自然/渲染尺寸均 16×16，无缩放畸变。共享品牌/导航资产继续使用模块 01 已实现的共享外壳；图表、信号色点和勾选状态属于实时数据/交互呈现，不把设计截图或样例曲线作为页面图片。
- 人工检查了当前设计七张图与实际三宽主要页面、站点弹层、下载参数弹窗和审计展开；修复初轮全局旧绿色 `!important` 背景覆盖和图表按钮空白。最终分析工作区白底，1440 的信号面板 276px，1366 缩为 250px，保持右侧图表可操作。
- API fixture 故意只有稀疏有效点及间隔缺口，默认关闭“点”时孤立点之间不出现连接线；这是验证缺口语义的证据，不是用设计样例曲线填数据。Demo 保留明确标识的示例曲线。生成历史无接口，所以实际截图是空表而不是 Figma 中四条示例记录。
