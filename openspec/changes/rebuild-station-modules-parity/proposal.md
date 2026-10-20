# Proposal

## Why
现有场站实现使用通用卡片、简化表格和硬编码页签替代了参考平台的真实业务结构。已有后端测试通过不能证明布局、数据和交互一致，本变更重新建立逐屏规格与独立验收。

## What Changes
- **BREAKING**：替换当前场站内简化页面和菜单呈现，以同场站的QUDEOX实际页面为准；保留权限体系。
- 明确图库例外：保留main原2D能流和3D图，不重新设计图组件；一次接线图按原功能对应接回，不能擅自将能流图称为电气接线图。
- 用户已允许新库mock，展示数据全部通过数据库与API流转；不再以“持续采集未接通”作为不实现页面布局和本地业务闭环的理由。
- 按模块完成证据、数据模型、接口、页面、交互和截图对账；未核验项明确待办，不以disabled或通用替代认定完成。

## Capabilities

### New Capabilities
- `station-shell`: 场站头部与菜单；新疆截图的9个页签、状态图标、更新时间、关注、刷新、标签，及不同系统组合的菜单差异。
- `station-dashboard`: 数据看板；场景切换、左侧资料、中间保留能流、右侧分类型指标、设备矩阵、规则报警和下方曲线。
- `station-subsites`: 子场站；列表工具栏、光伏/储能列、筛选、创建向导、详情、关联、编辑、删除。
- `station-devices`: 设备及各类型详情；整站/子站范围、十类设备、分类专属列、抽屉/子页和设置，不能用统一详情替代。
- `station-alarms`: 报警；规则/设备、实时/历史、等级、搜索、全字段表和详情处理闭环。
- `station-energy`: 能量管理；实时控制、策略配置、追踪电表、下发日志等已核验结构与本地模拟闭环。
- `station-analysis`: 智能分析；电池健康及已核验光伏分析页面、图表、理论参数、历史。
- `station-logs`: 操作日志；用户、企业、内容、对象、时间、终端、IP及全站跳转。
- `station-settings`: 设置十二个子页；场站信息/基本电费/费率/授权/数据源/偏移/计划/算法/需量/功率因数/收益/License。
- `station-flow-preservation`: 保留main的图；原2D/3D图保留，参考绘图复刻不在本轮范围。
- `station-mock-data`: 新库mock与统一验收；库内mock、统一接口、证据与逐项状态。

### Modified Capabilities
无现有OpenSpec规格；以上是对已有业务的新规格登记，不代表已有业务不存在。

## Impact
前端ReferenceAssetWorkspace及各场站子模块；Spring Boot本地接口；仅新库新增版本化表/seed/读模型；真实设备/参考站不接写操作。main图组件保持原文件。新增OpenSpec目录与验收清单。公共依赖无需为规划变更；OpenSpec CLI 1.14.3仅位于忽略目录.local-tools/openspec-cli。
