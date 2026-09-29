# EMS 业务联动发布与验收（待真实账号页面验收）

工作区 `D:/projects/ems-cloud-v2.0`，分支 main。业务库仅 `ems_cloud_v2_proto` / `ems_cloud_v2_proto_telemetry`。

## 状态闭环

2026-09-29 本地 API：合肥站及 BMS 正常在线；停止模拟发送后等待超过 90 秒，设备在线数由 2 变 0，站点显示通信离线；恢复发送后站点恢复通信在线。通信在线不代表设备健康或全部设备接入。

## 全点位模拟入库

- 01:00 前后使用 `scripts/ems-simulator/generated/bindings.sql`，先在真实新库事务内执行并回滚验证，再实际执行两次；两次均成功，保持原 SOC 19、电压 21、电流 22 的物理点编号。
- 普通点 295（30 秒 241、60 秒 54）、EMS 点 6、配置定义 173；新增独立 `[模拟]机柜控制器 EMU-01`。不直接向 ClickHouse 插入遥测事实。
- 已停止旧 MQTTX CLI 发送，同一 EMS UUID 只保留一个 MQTT.js 自动发送连接；复用官方 MQTTX CLI 的 mqtt 依赖和已有 mTLS 证书。PID、日志及证书留在个人运行目录，不提交。
- 实际 ClickHouse 查询确认：最近 90 秒内 cabinet_30s 有 241 个不同物理点，cabinet_60s 有 54 个，ems 有 6 个。
- 单体电压 5 × 32、单体温度 5 × 16 已通过 MQTT 入库；结构版本 `2026092901`。1000 个预留槽位不是实际单体数量。
- PostgreSQL 当前配置版本 `2026092901`，实际配置值 173 项；最近两分钟该绑定无新增遥测诊断异常。
- 三个语义未确认的 EMS 编号 90002–90004 保留 null/invalid；未知单位不补造单位，位图和文本保留类型。

## 已执行检查

- 协议 26 项测试通过。
- API 常规测试 162 项中 64 通过、98 因未配置专用环境跳过，无失败；另外指定环境下报告 PostgreSQL 9 项已实际通过（非跳过）。后续审查修复需重新验证。
- TypeScript 检查通过；SSE 解析/取消、物理点映射与 EMS 历史来源等辅助测试通过。
- 尚未宣称最终发布完成；提交、完整浏览器验收和线上制品核验待完成。

## 最终测试与发布

- 审查发现的历史归属、跨实例制品/任务恢复、证据内存预算、断流新鲜度、业务日期时区、报告完整权限、模拟器锁所有权等问题已修复并复核，无未关闭 P1/P2。
- 最终后端针对性测试 **27/27 通过**，包括真实 PostgreSQL **14 项**，以及 HTTP 4 项、报告单元 4 项、presence 2 项、snapshot 3 项。
- 最终前端：分析/报告单元回归 **19/19**，EMS/presence/SSE/曲线映射 **14/14**，独立浏览器 **13/13**；覆盖暂停、重连、隐藏/可见、断流 91 秒过期、权限撤销、下载/报告、1366/1440/1920 布局。浏览器业务接口使用隔离 mock，不冒充真实登录。
- 模拟器 **11/11**，包含真实退出前持锁、旧退出回调不能删除新所有者锁。当前个人启动/停止脚本已切换完整 MQTT.js 发送器，修复版已重启。
- TypeScript 与前后端生产构建通过；前端仍有既有大 chunk 提示。
- V17 在指定新业务库事务应用成功，角色 ems_proto_app 获得新任务/选点/制品表所需权限。制品为 PostgreSQL bytea，长度与 SHA256 受数据库约束；无需本机共享目录。
- 源码提交：`b3b432521f5c20607147bfd471751236a3fd5780`，已推送 origin/main。
- 发布：`http://120.27.23.229:18085/`，release `main-b3b432521f5c`。
- API：`/opt/ems-cloud-v3/releases/main-b3b432521f5c/ems-cloud-api.jar`；服务 ems-cloud-v3-api，PID 958509，active/running，NRestarts=0。
- API SHA256：`83bdec8dd08d10bf87d61aae39193937c9b3bbdd28c6ebe55d8ab5af86471c7c`。
- Web：`/var/www/ems-cloud-v3/releases/main-b3b432521f5c`；压缩包 SHA256 `078e9b2b7bc5c6eae7b9ff5bbe4fa014d3e6e2a6bed18f57f1648d54347e96d0`。
- 公网 index.html 与引用的 JS/CSS 均逐字节核对本地制品哈希一致。公网 API health=UP；snapshot/stream/jobs 未登录均为 401。公网登录页面无脚本 error。
- Nginx /api/ 已关闭 proxy_buffering/proxy_cache，read_timeout=150s，配置检查成功。另一个既有 18443 localhost 重名 warning 与本次 18085 无关。
- 采集服务 PID 2361095 保持不变；未更改共享 worker current 指针、Kafka 或 MQTT 服务。
- 新 release 中保存 previous-api-override.conf、previous-nginx.conf、previous-web.txt 和 release.json。回退应用时恢复旧 API drop-in、旧 Web 链接和 Nginx 配置，再 daemon-reload/restart API/reload Nginx；新增表为兼容扩展，无需删除模拟数据或任务表。

## 尚待完成

本地 API 已用新制品重启（PID 28996），健康正常；用户会话因内存会话重启而失效。已请求用户在 8443 重新登录。尚未声称真实账号页面上的新 SSE 曲线、报告生成/预览/下载已经验收。受管测试凭据的一次正常登录校验未通过，未重置密码或绕过 MFA。

合成数据验证不替代现场硬件验收。未确认单位/语义的点保持原始类型与空单位；无健康算法、电价或完整能量计量依据时不生成虚假评分/收入/电量结论。

## 2026-09-29 08:44 实际账号验收与补修

- 用户重新登录后，真实页面显示 SSE 已连接；BMS SOC 68.2%、总电压 510.718 V、电流 43.662 A，附实际采样时间和接收时间。
- 运营报告首次生成失败，查明运行角色缺少 telemetry_diagnostic_evidence 的 SELECT。已在新库补齐最小权限，并保存可重复执行的 scripts/analysis-runtime-grants.sql。原任务重试成功，正文展示 241 个 cabinet_30s 测点、54 个 cabinet_60s 测点及接入诊断统计。
- 三项 BMS 原始点位导出任务 completed，CSV 525486 字节；运营报告 CSV 513 字节。实际页面下载按钮触发的 analysis.download 审计已核对。内置浏览器下载事件等待超时，未确认操作系统最终保存位置，不声称已找到本地下载文件。
- 切换离开 SSE 时发现异步 redispatch 缺少 Sa-Token 线程上下文。新增真实嵌入式 HTTP 回归先复现异常，再显式为原上下文过滤器注册 REQUEST/ASYNC/ERROR，保留初始及异步分派两次鉴权。18 项相关测试通过，生产打包通过。
- 早间登录 500 是本地数据库 SSH 隧道进程退出；恢复独立后台隧道（带 keepalive 与重连）后，登录接口恢复正常认证响应，用户已实际登录。未更改用户密码。
- 本轮仅更新后端上下文配置和运行权限，不改变前端制品。截图保存在本地 .local-tools/report-real-preview.png、telemetry-real-export.png。
