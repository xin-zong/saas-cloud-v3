# EMS 全点位合成接入验收（2026-09-29）

此资料定义合肥站机柜 1 的协议覆盖测试。所有数值、柜状态和单体布局均为合成测试内容；普通点通过真实 MQTT 接入写入强类型事实，不代表站内真实硬件、运行状态、健康评分或收益。使用新 PostgreSQL `ems_cloud_v2_proto` 和 ClickHouse `ems_cloud_v2_proto_telemetry`，mTLS 端口 8884。

## 来源与数量

准备命令核对 `source-manifest.json` 所列原始目录中的 13 份文件：字节数与 SHA256 全部一致，并核对 catalog 引用来源。来源为 `D:/install/weixin/xwechat_files/wxid_8hvegkl8iuyd22_7fa3/msg/file/2026-09/20260917`；目录外的私有证书不属于协议来源。完整哈希和报文尺寸在 `scripts/ems-simulator/generated/coverage.json`。

目录版本 `ems-v1-profile-20260917`，来源汇总哈希 `2cbcd2f907bb8225a5bc9a3e3006f2fd7956575a36e151cca24dad86adbfd6fc`。运行时读取仓库已有 wire 参考和强类型 catalog；Windows Git 的 CRLF 只做换行归一化后核对源哈希，实际原始来源核对仍严格按字节。

| 对象 | 覆盖 | 语义与类型 |
|---|---:|---|
| cabinet_30s | 241 点 | 六块完整帧，数字/null、20062 四段 uint16 |
| cabinet_60s | 54 点 | 与 30s 无重复，版本点为字符串/null |
| EMS base | 6 点 | 90002—90004 保留 invalid/null/sourceTime=null |
| EMS cfg | 173 项 | `scalar` 快照，9 个预留 null；不创建运行测点 |
| 普通运行映射 | 301 | 295 柜点 + 6 EMS 点 |
| 电压 | 5×32=160 槽 | 1 个 null，单位按协议 V |
| 温度 | 5×16=80 槽 | 1 个 null，单位按协议 ℃ |
| 字典单体预留 | 1000 槽 | 不等于实装数量，不注册成 1000 个普通采样点 |

源结构参考是 5×52/26，而单体参考是 5×32/16。发送器明确使用仓库 `structure-matched-synthetic.json` 的匹配合成布局，只保留机柜 1、去除其测试注释字段、设公共表计为 `[]`。柜内电表保持演示布局 id=1，用途、厂家和 SN 为 null。采用独立合成 `sv=2026092901`，不以新内容复用来源示例 sv=1。`cfg.rev=2026092901` 保持同 rev 内容不变。更换布局/配置内容应先选择未使用版本并审查云端已有版本；重连本身不改变 sv/rev。

900001/900002 告警占位、30001—30115 参数字典和无证据的枚举/写权限不注册为运行点。未知单位在新增 measurement_kind 中为明确空单位；有单位的点只使用 catalog 的 verifiedUnit。默认聚合为 last。电量累计点的合成变化用于复位/间断测试，不当作结算依据。

## 设备映射和数据库脚本

| wire 子系统 | 绑定角色 | 站内测试设备 | 点数 |
|---|---|---|---:|
| emu | emu | 新建 SIM-EMU-01，类别 OTHER，名称标记模拟，无 SN | 21 |
| bms | bms | SIM-BMS-01，device 5，现有 binding 2 | 99 |
| tms | tms | SIM-HVAC-01，device 11 | 21 |
| pvdc | dcdc | SIM-DCDC-01，device 13 | 76 |
| pcs | pcs | SIM-PCS-02，device 4 | 58 |
| grid | meter | SIM-MTR-01，device 8，柜内 local_no=1 | 20 |
| EMS | ems | gateway device 57，现有 binding 1 | 6 |

这张表是此次模拟测点的明确绑定方案，不能据此推断现场厂家或真实硬件实例。其他 PCS、PV、消防、机架、GRID/LOAD 资产没有自动并入此测试。

`generated/bindings.sql` 是完整事务，只对既有新库创建必要测试设备、测点、definition 和 binding。它先校验数据库、EMS UUID、合肥站 station 4、当前 period 2、gateway device 57，再使用与接入服务一致的 EMS advisory lock。既有绑定、类型、单位、目标测点或资产身份发生漂移时抛错并回滚；不关闭旧绑定，不修改历史，不插入配置值/结构/ClickHouse 事实。约束由既有外键、唯一键、排斥约束保持。

保留 `20018→19 (sim_soc)`、`20021→21 (sim_dcVoltage)`、`20023→22 (sim_current)`，以及 `90002—90007→441—446`。配置只增加/核对 `scalar` definitions，值等真实 MQTT EMS 报文进入配置修订。脚本可重复执行：已有匹配源映射直接复用，不新增重复测点或绑定。

```powershell
Set-Location -LiteralPath 'D:/projects/ems-cloud-v2.0'
node scripts/ems-simulator/prepare.cjs --source-dir 'D:/install/weixin/xwechat_files/wxid_8hvegkl8iuyd22_7fa3/msg/file/2026-09/20260917'
node --test scripts/ems-simulator/simulator.test.cjs
```

由 controller 在新库应用 `generated/bindings.sql`；先完整执行后 ROLLBACK 验证，再 COMMIT，随后重复一次并比较测点/绑定数量。`verify-bindings.sql` 提供只读覆盖查询。不要连接旧库或变更网关身份/站点。

## 单连接完整发送器

完整自动联调用 `run.cjs`，发送者是 **MQTT.js**，复用个人目录官方 `mqttx-cli@1.10.1` 已安装的 `mqtt@4.3.8`。没有修改官方包，也不声称桌面 MQTTX 正在自动发送全类型。

原因：[MQTTX v1.10.1 发布实现](https://github.com/emqx/MQTTX/blob/v1.10.1/cli/src/lib/pub.ts) 中自定义 generator 只提供 topic/message，随后所有报文使用同一组 `pubOpts.opts`，无逐报文 QoS 和会话重连回调。全部使用 QoS1 会违反心跳、普通及单体 QoS0 契约；多开 CLI 会违反一个 EMS 只有一条连接的规则。

先停止旧官方 CLI，并确认桌面 MQTTX 的同 UUID 连接断开，再启动完整发送器。配置应在个人目录保存，示例只包含证书路径，不包含私钥/证书内容或口令。根代理此次使用 `full-point-config.json`。

```powershell
Copy-Item -LiteralPath 'D:/projects/ems-cloud-v2.0/scripts/ems-simulator/config.example.json' -Destination 'C:/Users/Laptop/Documents/Enerlution-MQTTX-Hefei-Test/full-point-config.json'
node D:/projects/ems-cloud-v2.0/scripts/ems-simulator/run.cjs --config C:/Users/Laptop/Documents/Enerlution-MQTTX-Hefei-Test/full-point-config.json
```

配置字段 `structureVersion/configRevision` 用于独立合成版本，`qualityMode` 为 normal/stale/invalid，`counterResetAfterSeconds` 为可选累计复位测试。接入身份参数不能换到其他站点/EMS；host 为裸 broker 主机、端口只能 8884，TLS 校验开启且最低 TLS1.2。程序只在启动后读取三项证书，内容不写日志、不拷贝入库。

两条精确下行 `down/request`、`down/ack` 均获得 QoS1 SUBACK 后，立即 QoS0 发送 heartbeat，再 QoS1 发布完整 structure。PUBACK 仅代表 MQTT 确认，不声称业务结构已处理；首份单体在连接就绪 25/26 秒之后发送，云端仍负责 sv/当前连接/结构校验。

| 类型 | 首次相对业务就绪时间 | 周期 | QoS |
|---|---:|---:|---:|
| heartbeat | 立即 | 30s | 0 |
| structure | heartbeat 后 | 首次连接，仅此不可变快照 | 1 |
| EMS + cfg | 10s | 60s | 0 |
| cabinet_30s | 15s | 30s | 0 |
| cabinet_60s | 20s | 60s | 0 |
| cell_voltage | 25s | 60s | 0 |
| cell_temperature | 26s | 60s | 0 |
| 只读查询 response | 按请求 | 非周期 | 1 |

retain 恒 false、CleanSession=true、MQTT3.1.1。最多 8 个待发送对象，串行发布，普通报文只保留最新值。单调时钟控制调度/运行时长，墙钟写真实本轮模拟源时间；错过周期不会补发旧普通帧。SOC、总电压、电流、功率和确认单位的累计计数随时间变化，电池功率与电压×电流一致，三相合成功率与总功率一致；其余完整夹具字段保留原 JSON 类型，未知值不补零。

断连后清队列并销毁旧 MQTT.js client，防止库重发旧 QoS1 结构/响应；1—30 秒指数退避后新建唯一 client。每次连接使用新 UUIDv4 connectionId、结构 seq 从 1 开始，程序 uptime 跨连接继续。布局不可变，查询或重发同内容不递增 seq。证书或认证拒绝停止，不降级明文。

支持 `structure.get`、`alarm.current.get` 两个只读查询：按格式/身份→连接→期限→幂等→业务处理验证；缓存最多 32 条，首次受理起 60 秒，同 ID 内容冲突返回 INVALID_REQUEST，容量满 BUSY，旧连接 CONNECTION_MISMATCH，截止时间相等即 REQUEST_EXPIRED。结构回复使用原完整快照；当前告警为未知 `alarms=null`，不假造无告警或恢复。retained/超长/无法关联请求丢弃。没有控制指令，没有可靠告警/历史对象，观察到 ACK 不推进任何未发送对象；结构本身没有业务 ACK。

个人目录运行状态 `ems-fullpoint-status.json` 标记 synthetic 和实际 sender；互斥锁 `ems-fullpoint.lock` 含 PID，不自动删除未验证的旧锁。Ctrl+C、SIGTERM 或新建 `STOP-FULLPOINT` 停止；再次启动前移除停止标志。不能拿原 Python 的 STOP 标志控制该发送器。启动前与 root 的旧发送器交接是必需步骤。

## 官方 MQTTX 单类型场景

`mqttx-scenario.js` 保留官方自定义场景格式，供单类型手工检查。`EMS_SIM_KIND` 支持 heartbeat/structure/ems/cabinet_30s/cabinet_60s/cell_voltage/cell_temperature；结构命令选择全局 QoS1，其他类型选择 QoS0。自动重连关闭，每次启动新连接；同 EMS 完整发送器必须先停。只发某类数据不能独自证明当前心跳、结构和全点接入。

```powershell
$env:EMS_SIM_KIND='cabinet_30s'
node 'C:/Users/Laptop/Documents/Enerlution-MQTTX-Hefei-Test/mqttx-cli/node_modules/mqttx-cli/bin/index.js' simulate --file 'D:/projects/ems-cloud-v2.0/scripts/ems-simulator/mqttx-scenario.js' --count 1 --client-id '4a8be16%i-7ee9-458f-b412-7d256e64eed9' --hostname 120.27.23.229 --port 8884 --protocol mqtts --mqtt-version 3.1.1 --qos 0 --message-interval 30000 --reconnect-period 0 --ca 'C:/Users/Laptop/Documents/Enerlution-MQTTX-Hefei-Test/ca.crt' --cert 'C:/Users/Laptop/Documents/Enerlution-MQTTX-Hefei-Test/client.crt' --key 'C:/Users/Laptop/Documents/Enerlution-MQTTX-Hefei-Test/client.key' --topic 'ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/up/telemetry'
```

CLI 的 `%i` 在 count=1 时还原登记 UUID，generator 再严格核对 clientId。可用 `EMS_SIM_CONNECTION_ID/EMS_SIM_STRUCTURE_VERSION/EMS_SIM_CONFIG_REVISION` 注入审查过的单类型测试会话/版本。

## 验收与证据

离线 Node 测试 9/9 通过，先失败后实现。覆盖完整数量、类型/null/未知时间、5×32/16、帧上限、动态数值一致性/累计复位、QoS/调度、断连不重放、重连 UUID/seq、订阅就绪、只读请求期限/身份/幂等/容量，以及 SQL 生成边界。官方单类型 generator 已离线加载并产生 241 点帧；run.cjs 和 scenario 语法检查通过。最大实际样例字节数以生成 coverage 为准，普通均低于 6144、结构低于 65536。

Root 已反馈：真实新库完整事务 dryrun+ROLLBACK 成功，474 definitions/301 mappings；随后两次 COMMIT 均成功，幂等数量一致。Root 已启动个人目录完整发送器；实际云端观测与浏览器联动验收由 root 继续记录，本文不把离线通过写成云端覆盖已通过。

真实接入核对步骤：

1. 保存新发送器启动时间 start_ms；连续观察至少两轮 60s 数据。用 `verify-observations.sql` 参数 start_ms 查询收到后的事实：241/54/6 个 distinct point，共 301，避免旧采样混入。
2. PostgreSQL 核对 173 配置值（9 null）、新结构 sv 与当前 connectionId、BMU 五行电压 32/温度 16。ClickHouse 单体两类均 5 行且每类 1 null。
3. 原始观测核对 20062 的四段 uint16、版本字符串、EMS 三个未知点的 invalid/null/unknown sourceTime；源时间和接收时间分开。
4. 停发送器超过 90 秒，核对站点/EMS 与已绑定各设备转为离线；恢复后新 connectionId/seq1，旧结构现状不能被复用。
5. 测 qualityMode=stale/invalid 与显式累计复位，前端不补零、不编造运行/收益；多点下载保留精确类型、质量、时间。无权限/撤权的查询仍走现有授权边界。

本批协议未含权威 Modbus 工作簿、枚举源码或现场确认结果，90002—90004、配置106与未知单位保持未确认。真实硬件、真实容量及告警来源验证不由此合成覆盖替代。
