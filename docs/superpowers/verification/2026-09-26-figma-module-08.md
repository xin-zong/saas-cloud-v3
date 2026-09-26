# 08 设置 · Figma 实施验证

日期：2026-09-26。任务基线：33223ae。工作区为隔离分支 codex/figma-all-modules，未修改主目录、后端或数据库。

## 当前设计证据与六项入口映射

本轮使用控制者通过 Figma `get_design_context` 获取的全部 module08-context-*.txt 及对应六张 module08-design-*.png。已逐张读取截图并提取完整界面文本，截图均非空。文件 key `Y0KMYFvalDXgSPnVZ5zG39`，设置设计页 `1077:1794`。该库存无标题包含“克制风格”的重复版；采用较新的 R7，合并 R5 共有交互。

| 节点 | 采用方式 | 系统入口与交互 |
| --- | --- | --- |
| 1101:661 R5-P080 设置 | 由 1146:810 替代并组合 | 设置→个人偏好。账户资料、默认进入、密度、时间范围、记住站点标签及退出全部保留；旧版“设置分类”保留导航可访问名称，R7视觉不重复显示标题。独有内容核对后没有额外业务表单。原实现额外的兼容/重置控件移到可见的“本地兼容配置”，不再使用1px隐藏控件。 |
| 1146:810 R7-P080 个人偏好 | 主版 | 设置→个人偏好。API资料只读取当前身份；演示资料可校验并按账户本地保存；界面偏好真实 GET/PUT；恢复默认保留当前账号身份；分类/全局离开保护。 |
| 1146:962 R7-P081 通知设置 | 主版 | 设置→通知设置。渠道三列、告警/审批/任务范围及免打扰均为真实可持久化偏好；渠道接收选择不冒充已接通消息投递。 |
| 1146:1114 R7-P082 显示与语言 | 主版 | 设置→显示与语言。语言、时区、单位、主题、密度、图表动效、高对比度均持久化；注明全局渲染/报表应用边界。 |
| 1146:1266 R7-P083 登录与安全 | 主版+真实未接通状态 | 设置→登录与安全。账户安全三列、MFA管理方式、设备查看、登录记录时间范围、提醒偏好；管理/设备/记录打开可达说明和真实空态，密码/MFA/退出其他设备保留禁用控件，不伪造服务。 |
| 1934:1121 退出登录确认 | App共享原生模态框 | 页头账户菜单、Sidebar回调、设置退出共用520×320确认框；取消/关闭/Escape保留草稿，确认后进入当前编辑器guard，guard允许后调用原Auth logout。 |

## 保存、草稿和接口边界

API模式仍使用 GET `/settings` 与逐键 PUT `/settings`。写入字段为 defaultEntry/defaultTimeRange/rememberSiteTab/language/timezone/units/theme/density/chartAnimation/highContrast/notificationInApp/notificationEmail/notificationSms/alarmScope/approvalScope/taskScope/quietHours/newDeviceAlert。不写账户资料、密码、MFA、设备或会话状态。

每次保存冻结输入快照并禁用表单。每个 PUT 成功后只更新这个键的 baseline；后续失败保留完整输入及已确认基线，重试只写未确认差异。放弃修改恢复当前 baseline，因此保留已确认值并还原失败字段。成功后不执行会覆盖输入的全量重读；初次GET失败时禁用编辑并提供重试。serverReady表示稳定的加载资格，busy/busyRef单独表示保存中，保存中离开或退出被拒绝。

演示存储为 `enerlution:settings:demo:<user.id>`，API不读任何本地设置。旧无账户键 `enerlution-system-settings-v1` 不自动迁移，因为无法确定所有者；原值不会删除。App按模式与user.id重建设置编辑器，未完成请求通过alive/AbortController避免更新离开后的编辑器。演示姓名/邮箱有非空和格式校验；密码表单禁用且无持久化状态。

所有退出入口顺序为：退出确认→当前编辑器guard→真实logout；如果无草稿直接logout。如果继续编辑、关闭、Escape或保存中，返回false且不调用logout。请求期间logoutPending防止重复触发。取消退出发生在guard之前，绝不预先放弃草稿。原API撤销会话/清token和演示清session逻辑不变。分类和全局导航通过同一设置guard；浏览器离开由beforeunload保护。

消息投递、修改账户资料、真实MFA状态/变更、修改密码、设备及登录历史、撤销其他设备会话均未接通。界面不显示设计样例“正常”“已开启·验证器”“3台”或示例最近登录。界面显示偏好可保存，但全局语言/主题/单位等应用未在本任务新增服务或框架。

## 验证证据

原始日志和实际截图位于仓库忽略目录 `.superpowers/sdd/2026-09-26-all-modules-figma/`；完整命令、退出码、截图绝对路径和最后测试摘要见同目录 task-8-report.md。新增行为测试位于 `tests/all-modules-settings-ui.test.cjs`；既有API/角色退出测试仅补充确认步骤，原session/logout结果断言保留。旧workspace测试使用新的账户键及可见兼容配置入口，保留存储错误、重置和重新载入断言。

最终结果：设置15项全通过，最后身份显示修正3项针对回归通过（共同覆盖当前16项）；相关API/策略guard/工作区9项通过；tsc/build exit0。三宽度15图均白底且无横向溢出。两个role-access旧运维工具标签断言交Task9，原logout/session断言保留。证据详情见task-8-report.md。
