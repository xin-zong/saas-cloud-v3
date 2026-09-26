# 01 总览与共享框架：节点覆盖与验证

设计文件：`Y0KMYFvalDXgSPnVZ5zG39`。2026-09-26 重新读取设计上下文及截图后实施。没有仅凭既有实现或旧截图判定设计。

## 全库存映射

| 节点 | 本轮决策 | 实际入口与保留交互 |
| --- | --- | --- |
| 594:3224 / 1172:26660 immersive-map-dashboard-v3 | selected | 一级导航“总览”→地图总览；白色浮层、站点运营概况、充放电趋势、环境效益、在线容量、能源构成、收益、告警与子系统卡片。区域筛选、站点选择、站点弹层关闭/拖动/详情跳转、实时地图缩放继续可用。 |
| 594:3224 / 1286:2252 immersive-map-dashboard-v3-fullscreen | selected | 总览顶栏沉浸按钮；隐藏全局顶栏和导航，保留区域/站点筛选，追加实时状态条、事件日志、实时指标区域；退出全屏按钮或 Escape 返回。 |
| 594:3224 / 1059:10664 dashboard-optimized | composed | 总览“经营看板”切换入口；保留四项指标、健康分布、区域储能容量、充放量趋势、核心站点区域分布、运维工单、待审批卡片，以及今日/近7天/近30天/自定义、CSV导出、页面定制。旧导航名称由现行共享导航取代，不另建重复业务路由。 |
| 594:3224 / 931:6979 Empty Star | superseded | 页面上独立装饰星形，不属于三张业务画板或交互，不生成业务入口。 |
| 4:2 / 571:163、575:675、577:1253 | selected | 共享展开/收起导航和页面网格；全局顶栏56px，展开176px，收起64px。当前权限决定可见导航，未扩大角色范围。 |
| 498:2 / 518:19 | selected | 共享总览导航图标的组件上下文。其他导航图标直接采用571:163上下文引用的原始SVG。 |

本模块库存只有以上三张业务画板及一项装饰；没有遗漏业务画板或连接箭头。三个业务节点均取得高保真代码和初始截图，没有使用稀疏上下文实施。页面级4:2、498:2调用返回“没有选择节点”后，改用已发现的具体组件节点读取成功，未声称页面级上下文成功。

## 数据与交互边界

- 地图示意底图使用设计原始PNG，并明确标明“不代表站点位置”。不把设计上的站点点位、上海/苏州等示意标签转换成API坐标。切换“实时地图”后沿用Leaflet、现有地图服务和真实经纬度；API缺坐标不生成点。
- 所有API站点来自现有授权过滤结果。看板只读取这些站点已加载的数据；接口缺少储能历史、收益、频率、碳排指标时保留卡片和空态。全屏API事件区注明当前告警快照及事件流未接通。
- 经营看板CSV导出当前授权站点快照，标明统计范围和数据说明，不导出原型收益值或伪造历史数据。单元格做引号与公式前缀处理。
- 页面定制是明确标注的本机布局；键按API/demo模式、账号ID及授权站点集合隔离。支持至少保留一个模块校验、浏览器存储失败、取消/继续编辑/放弃修改、外层离开保护。授权范围变化会取消待决离开并释放导航。
- demo图表仍使用既有演示模型，API不会调用模型生成模拟指标。所有跨模块入口继续调用原有权限和离开保护回调。
- 设计中全权限的8项导航与示例统计值并非每个账号都应看到；截图保留真实角色可见项和当前数据，因此数值/站点数量与设计样例不同。

## 静态资产

本地目录：`ems-cloud-ui/public/figma/overview/`。25个非空文件：3张设计原始PNG、22个SVG。PNG分别用于普通地图、全屏地图和经营看板区域图；三个导出的PNG内容相同，保持各设计槽位的来源记录。未将整页设计截图作为实现素材。

| 槽位 | 原始文件与尺寸 | 调用位置 |
| --- | --- | --- |
| 品牌、全屏按钮 | map/imgBrandMark.svg 24×24；imgFullscreenIcon.svg 16×16 | Header |
| 主导航、收起 | navigation/ 共9个SVG；总览24×24，其余20×20 | Sidebar；按权限筛选，不拉伸原始尺寸 |
| 区域/站点下拉、概况进入 | map/imgChevronDown.svg 10×10；imgChevronRight.svg 16×16 | OverviewPage选择控件背景、LeftPanel按钮 |
| 环境效益 | imgLeaf / imgFlame / imgTrees.svg，各20×20 | LeftPanel对应指标 |
| 地图图例 | imgEllipse12 / 13 / 14 / 15.svg，各8×8 | MapView故障/在线/离线/建设中 |
| 导出、定制 | dashboard/imgDownload.svg、imgEdit.svg，各14×14 | OverviewDashboard工具条 |
| 地理示意图 | map/imgGeographicMapBackground.png；fullscreen/imgMapCanvas.png；dashboard/imgMapLayer.png | 原图按设计背景槽位cover，保留比例 |

原型中的图表路径、进度段和示例点位不是线上数据素材；使用既有Recharts与真实/演示模式隔离的数据驱动图表。用户头像取实际账号首字，不使用原型人物照片。

## 共享集成契约

- App根保持 `workspace-shell`；新增 `workspace-content` 是唯一第二列内容容器，位于顶栏下方。全局样式只共享网格尺寸、导航和普通顶栏；未修改02业务CSS的绿色变量。
- 02继续使用既有 `StationGlobalHeader`（本任务没有修改该组件）及站点页样式；其他模块使用Header。Header的 `showImmersive` 仅在总览为真。
- Sidebar保留 `navItems / activeNav / onNavChange / collapsed / onCollapse / user / onLogout` 原有接口和App中的串行pending guard。旧侧栏品牌/账号区不再显示；退出入口在全局顶栏或站点账号菜单。
- OverviewPage接收授权stations、user、nav、immersive、onOpenStation、onNavigate、registerLeaveGuard和requestLeave。选中站点由ID从最新授权集合派生，不缓存越权对象。
- 所有总览面板、弹窗和主题规则位于 `.overview-*`；蓝色图表/示意控制只属于01，未修改全局 `--ui-primary` 或02的绿色业务样式。

## 验证记录

本轮使用独立worktree的API8461/demo8460，浏览器均msedge headless，测试并发1；没有调用旧8450/8451或主工作区8443作为本轮验收目标。

- 新行为测试先确认缺少经营看板入口；后续拖动偏移与授权范围变化的pending导航问题分别有独立失败记录，再修复。
- 相关回归包括三类角色、站点框架、API空态/遥测、策略/电价/建站编辑离开、权限撤销、API登录/创建/重载。
- 三张设计均保存最新原始截图；普通/全屏/经营看板在1366、1440、1920宽度有渲染截图；API空态、自定义日期错误和本机存储失败有补充截图。
- 工具上下文、截图、资产元数据和实际渲染几何证据都在忽略目录，不进入提交。完整命令、结果及最终提交见同任务忽略报告 `.superpowers/sdd/2026-09-26-all-modules-figma/task-1-report.md`。

经营看板的Figma截图实际导出为1440×1029（超出原库存900高的内容），页面采用可滚动内容区；普通/全屏设计为1440×900。接口缺失指标、角色差异、示意/真实地图切换均是明确的数据边界，不冒充原型数据已上线。

最终验证：`node node_modules/typescript/bin/tsc --noEmit` 无诊断、退出0；`node node_modules/vite/bin/vite.js build` 2534模块、2.15秒完成，保留既有大包警告。`node --test --test-concurrency=1 tests/all-modules-overview-ui.test.cjs tests/stations-figma-shell-ui.test.cjs tests/editor-departure-ui.test.cjs tests/api-ui.test.cjs` 在API8461/demo8460下20/20通过，0失败，179.163秒。新总览5项、站点2项、编辑离开11项、API2项均覆盖到。

`PREVIEW_URL=http://127.0.0.1:8460 node --test --test-concurrency=1 tests/role-access-ui.test.cjs` 三类角色3/3通过，0失败，36.239秒。以上最终浏览器验证合计23/23通过。`git diff --check`退出0。
