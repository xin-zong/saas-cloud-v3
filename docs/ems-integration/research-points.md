# EMS 点位、样例与云端数据模型核查（只读研究）

核查日期：2026-09-27。状态：设计建议，未实施；没有访问云端、执行 SQL、修改 EMS 或数据库。SQL 只用正则逐条解析 INSERT 文本；9 个 JSON 使用 Node JSON.parse 读取。本文的事实限于下面文件与仓库源码，协议中关于已有 EMS 行为的陈述没有以 EMS 源码或现场数据库复核。

## 1. 来源与边界

源目录：`D:/install/weixin/xwechat_files/wxid_8hvegkl8iuyd22_7fa3/msg/file/2026-09/20260917`。

- `point_catalog(1).sql`：106079 字节，1419 行，SHA256 `dfdf055b53755549962c6ef84e205c47d4399070803e3711cbe0efb6d5f020c5`。
- `telemetry数据库结构说明.md`：2608 字节，SHA256 `c9c57c686b0ab3462b232e57965ebcbd68869cebc8ebc8e457fc34a80c06ea04`。
- `05_EMS与云端MQTT交互协议.md`：重点核查 §3.1—3.5、§6.2、附录 A/C。其引用的 Modbus 工作簿不在本批文件中；本报告不能完成全量单位、枚举、读写权限的权威核定。
- 云端 `ems-cloud-api/src/main/resources/db/migration/V1__identity_assets.sql:53`、`ems-cloud-api/database/clickhouse/V1__telemetry.sql:2`，及实际查询实现 `ems-cloud-api/src/main/java/com/enerlution/ems/business/TelemetryController.java:39`。

SQL 只有 **1 张表、1410 条 INSERT、1410 个唯一点号**；不是 telemetry.db 的完整数据库导出。第 2—8 行只定义 `point_catalog(pointId PK, pointName TEXT NOT NULL, dcValueType INTEGER NOT NULL, archivePolicy INTEGER NOT NULL)`。没有单位、厂家、倍率、寄存器地址、读写标记、枚举定义或协议版本字段。

结构说明描述 4 张表，但后 3 张未包含在 SQL 中：`point_history`（柜号/点号/归档时间联合主键，REAL 值）；`cell_history`（柜号/生命周期/包号/种类/时间联合主键，BLOB 数组）；`operation_history`（operationId/commandName 联合主键，nullable REAL 值及结果码）。不能把文档列出的表当作此次实际数据库已验证结构。文档明确普通历史没有质量、真实采样时间、来源代际，归档时间不等于设备采样时间。

## 2. 字典实算

| 点号范围 | 条数 | 可确认内容 |
|---|---:|---|
| 10001—10041 | 41 | 状态点，全部 dcValueType=0、archivePolicy=3 |
| 20001—20254 | 254 | 普通测量/状态/版本等 |
| 25001—25500 | 500 | bms_cell_voltage_001—500 |
| 25501—26000 | 500 | bms_cell_temperature_001—500 |
| 30001—30115 | 115 | 名称为参数/配置/设定类；仅凭 SQL 不能认定可写 |
| 合计 | 1410 | 前两段的 295 点恰好等于两份机柜 JSON 点号并集 |

按名称前缀统计：EMU 23、BMS 1188、TMS 41、PVDC 79、PCS 59、GRID 20。此前缀归类只是字典命名统计，不等于物理设备实例数。BMS 数量包括 1000 个单体预留槽位。

| 原始编码字段 | 分布 |
|---|---|
| dcValueType | 0:52；1:108；2:1242；3:8 |
| archivePolicy | 0:1000；1:134；2:20；3:256 |

**不能正式解码这两个枚举。** 结构说明 §6 明确编码以 EMS 工程定义为准。本批文件没有枚举声明。样例支持“0 常见于二值状态、1 常见于整数、2 常见于实数、3 常见于字符串”的观察，但不是可部署映射。`20003/20231/20232` 在 SQL 为类型 1，MQTT 却规定字符串/null；`20062` 在 SQL 为类型 1，MQTT 规定四个 uint16 的数组/null。不能用 dcValueType 直接构造 JSON 类型。

archivePolicy=0 恰为 1000 个单体槽位，不能解读成“云端禁存”；它们由独立单体路径上传。政策 1/2/3 也不能直接等同于 30/60 秒上传频率：30 秒 JSON 同时包含政策 1 和政策 3 的点；60 秒也包含政策 2 和政策 3。

全量 **1410 个点的单位字段缺失，读写属性字段缺失**。不能从 `_enable`、`_limit`、30000 段推导控制权限。当前 MQTT 契约 §1/§2 明确首版不开放参数修改、设备控制或 XML 配置下发；`cfg.p` 是当前生效配置快照。后续若开展写入需独立契约、权限与审计。

## 3. JSON 交叉核对

| 文件简名/type | 实算内容 | 原文件字节 | JSON.parse 后紧凑字节 |
|---|---|---:|---:|
| EMS / ems | 6 运行点 +173 配置项；配置 9 null | 4038 | 1805 |
| 机柜30秒 / cabinet_30s | 241 点 | 5573 | 2878 |
| 机柜60秒 / cabinet_60s | 54 点 | 1832 | 1019 |
| 单体电压 / cell_voltage | 5×32=160 槽，1 null | 1253 | 1015 |
| 单体温度 / cell_temperature | 5×16=80 槽，1 null | 504 | 346 |
| 设备结构 / structure | 2 柜，公共布局 5 BMU，52/26 槽 | 2315 | 1073 |
| 故障事件 / alarm_event | 单个事件 | 273 | 194 |
| 故障关联 / alarm_data | 601 行×2 列=1202 槽，3 null | 11690 | 7680 |
| 重要补传 / important_history | 4 点号、10 条稀疏历史记录 | 482 | 315 |

紧凑值由 `Buffer.byteLength(JSON.stringify(JSON.parse(file)))` 取得，只是本次样例重序列化大小，不是最大合法载荷或线上吞吐测量；浮点字面量格式归一化可能与生产序列化器不同。

| 子系统 | 30s | 60s | 合计 |
|---|---:|---:|---:|
| emu | 16 | 5 | 21 |
| bms | 85 | 14 | 99 |
| tms | 19 | 2 | 21 |
| pvdc | 54 | 22 | 76 |
| pcs | 51 | 7 | 58 |
| grid | 16 | 4 | 20 |
| 总计 | 241 | 54 | 295 |

两个机柜文件全部点号存在 SQL，彼此无重复，并集完整覆盖 10001—10041 与 20001—20254。30 秒示例：238 个数值、`20062` 一个数组、`20086/20126` 两个 null。60 秒示例：43 个数值、9 个字符串、`20003/20071` 两个 null（两者也是版本点）；11 个版本点包括 `20003/20071/20103/20176/20177/20178/20231/20232/20233/20234/20235`。

**必须先处理的参考不一致：** 设备结构文件 `d.clusterLayout.bms` 给出 bmuCount=5、voltCount=52、tempCount=26，sv=1；单体文件同为 sv=1 却实际 5×32、5×16。协议 §3.4 也仍描述后者。因此这三份文件不能作为同一 EMS/sv 的一致联调样本。不能擅自补齐数组、改结构，或把两种容量混为现场实配。真正接入时按已解析且匹配的结构校验，不匹配隔离并记录原因。

结构只列柜 1/2；重要补传示例 c=3，告警关联点也引用柜 3。各文件是独立合成示例，不能自动当作同一项目的完整设备树。

EMS 6 个运行编号为 90002—90007，全部不在 SQL；173 配置项同样不在 SQL，不能与 30001—30115 当作同一编号空间。协议 §3.2 明确 90002—90004 的实际映射仍待确认，90005—90007 已确认编号与含义，但示例数据仍为合成。配置 106 单位未核定，9 个 null 是预留配置，不是采样失败。

alarm_data 的两个编号 900001/900002 不在 SQL，协议 §5.2 明确只是占位，禁止注册为正式测量点。其 601 行来自 start 到 start+600×1000 的闭区间 10 分钟网格；不能直接用 600 行估算。1202 槽中 3 null，包含整行 null，不能补零。

## 4. 重要补传集合

协议附录 A.3 的 Markdown 表重新解析得到 **114 个点**，均存在 SQL：30 秒抽取 60 点、60 秒抽取 14 点、变化/起始参考 40 点。其 archivePolicy 恰对应 1:60、2:14、3:40；这只是本集合对应关系，不意味着全字典同政策都应补传。SQL 的政策 1 有 134 点、政策 2 有20点，均大于已选子集。

114 点单位统计：% 1、V 13、A 12、kW 18、无单位标记“—”38、℃ 3、kVar 12、kVA 3、kWh 14。这里单位来自协议附录，不是 SQL；最终仍需核查其指向的权威工作簿。不同累计/日电量口径不要按相似名称合并。

重要补传样例点号为 `[10003,20012,20018,20062]`，`data` 是 `[相对毫秒偏移, p索引, typed value]` 的 10 条记录，不是 10×4 个值。变化点区间外起始参考不应当成区间内新故障，普通曲线与故障事件必须独立。

协议 §6.2 提醒旧历史 INT64→double 可能已经损失宽位图低位；这是文档风险描述，本次未验证 EMS 写入代码。不能在云端通过拆分旧 double 恢复已丢精度，也不能无损宣称历史全量覆盖。`point_history.value REAL` 不具备表示任意 64 位位图的精度保障。

## 5. 现有云端真实实现与缺口

PostgreSQL V1：`device` 依 station 与 model，唯一 `(station_id,code)`，SN 全局 unique；`device_model.category` 只接受 BMS/BESS/PCS/HVAC/MTR/FSS/PV/OTHER；`measurement_kind(code,name,unit)` 与 `measurement_point(id,device_id,kind_code,code)`，后者唯一 `(device_id,code)`。设备维度已有站点归属和权限关联，必须复用，不能在遥测包任意指定租户/站点。

当前 ClickHouse V1 `measurement_sample(point_id UInt64, sampled_at DateTime64(3), value Float64, revision UInt64)`，value 非 nullable 且要求 finite；`ReplacingMergeTree(revision)` 按 `(point_id,sampled_at)` 替换。不能保存 null、字符串、数组、质量、接收时间、未知源时间、结构版本或原始消息身份。

实际 `TelemetryController.history` 先从 PG 点→设备获取 station，然后执行 `telemetry.read` 检查；查询使用 FINAL，全部 `avg(value)` 聚合且 count()，最多31天，1/5/15/30/60分钟。此实现不能直接适用于状态枚举/累计电量/版本/位图；需要基于指标语义选择 avg/min/max/last/delta，并区分有效样本数和上报次数。ClickHouse DDL 注释说服务无外部写端点、runtime SELECT-only，但部署权限未连接验证；本文仅确认读取的控制器实现。

## 6. 最小关系模型建议（待批准，非迁移）

保持资产和站点为权威维度、ClickHouse 为事实存储。以下是逻辑关系，不承诺具体 DDL；如果既有后续迁移已有等价实体应复用，避免并行第二套资产表。

1. `ems_gateway(ems_uuid PK, device_id UNIQUE FK)`：EMS 本体复用 device，站点经 device 派生，不复制 station/tenant 名称。认证凭据单独受控。topic emsId 与此身份绑定，不信任 payload 自报归属。
2. `ems_structure_revision(ems_uuid, sv, layout_hash, ...; PK(ems_uuid,sv))` 及结构实例/布局关系：`ems_cluster(ems_uuid,c, cabinet_device_id)`，`ems_device_binding(ems_uuid,c,device_role,local_id,device_id)`。公共表计需明确公共作用域，不能借柜0混同真实柜号。物理身份沿用 device，角色和源局部号属于映射表；更换设备必须保留有效期/结构版本与历史绑定。约束应确保同 EMS 同角色/位置在同一结构只有一绑定。
3. `protocol_point_definition(catalog_version,namespace,source_point_id, name, wire_type, unit/kind FK, ...)` 和 `ems_point_binding(source_binding, definition FK, measurement_point_id FK)`：协议点定义与设备实例测点分离。业务 kind 决定单位与聚合语义，避免在每个实例重复抄单位/名称。catalog 与 wire 规范版本独立于 sv 和 cfg.rev；三种版本不可混用。
4. `ems_config_revision(ems_uuid,cfg_rev,received_at,content_hash)` + `ems_config_value(revision FK,config_definition FK, typed_value)`：完整配置快照按 rev 幂等保存、相同rev内容冲突单列异常；173 配置不强行变成每30秒 numeric samples。9 个 null 保留“预留/未配置”语义。可保留原始 JSON 作为取证载荷，但不能以一个大 JSON 替代全部可查询规范化关系。
5. 结构二维布局可用 `ems_bmu_layout(ems_uuid,sv,bmu_no,bmu_type,voltage_count,temperature_count)` 表达。示例共同布局可以复用 layout 实体；不要在每条单体样本复制设备名称、厂家、站点等维度。SN 缺失是未知，不生成假SN，也不以SN作为唯一接入键。

这套分解的关键函数依赖：EMS身份→所属device；(EMS,柜号/角色/局部号/有效版本)→物理device；定义版本/命名空间/源点号→值类型与指标语义；测点实例→device+定义。样本只保存实例标识和观测信息。ClickHouse 宽列用于分析事实，不要求把海量事实再分解为 PG EAV 热写表；3NF 重点约束持久业务维度。

建议设备映射：柜=BESS、PCS=PCS、TMS=HVAC、计量=MTR、BMS=BMS；PVDC 是否 PV 或独立 DC/DC 类型、EMU/EMS 是否新类别或 OTHER，需要产品/资产规则决定。结构 `dcdc` 对应遥测 `pvdc`、`bmu` 身份与 `bms` 遥测之间不能仅靠名称自动合并；grid 是经EMU转发的电网侧量，须核实真实表计/测量边界。通信路径不是物理归属。

## 7. 样本存储建议

保留 Float64 表作为经校验的有限连续数值查询路径，新增或重构 typed observation 事实：显式值类型，互斥的 nullable float/int/string/uint16-array 存储槽，quality、source_ts nullable、received_at、source（live/backfill）、原始消息身份与结构/字典版本关联。不要把 bool、状态、缺失一律转 double。类型互斥约束和协议定义校验需在接入实现中测试；具体 ClickHouse 类型和键需批准后验证。

20062 保存四段原顺序整数，不拼成 JS Number 或 Float64。11 个版本值按字符串/null，不解析成小数。源 ts 为 null 时原样留空，received_at 独立保存；不伪造设备采样时间。相同真实源时间重复上报不等于新观测，要避免把持续 stale 的重发误作新样本。实时和补传重合以定义的同一观测键去重；不能盲目“后到覆盖先到”，旧REAL历史不能覆盖无损实时位图。

质量 valid/stale/invalid 与数值是否 null、设备在线/健康是独立维度。协议的 link.online 三态无法无损落入既有 device_observation 的 online/offline 二态，需增加未知表达或独立来源状态；不能把 null 算离线。禁止空值补零。累计量、状态/枚举应分别做增量/末值等业务聚合。

单体事实单独按 `(EMS/c,sv,kind,source_ts,...)` 保存二维 Array(Array(Nullable(number))) 或 BMU号/位置明确的长表；保留整体 values=null 与个别槽null的区别，数组长度必须匹配结构。未知sv隔离或缓冲有界保存，获取结构后再解释，不套旧结构。电压已为 V、0.001 V 精度；温度已为℃、1℃精度，不再次套寄存器倍率。温感位置不能一律当作电芯序号。1000个 SQL 槽位只是最大槽容量，不等于每柜装1000传感器。

## 8. 容量：从真实样例与频率推导

每天86400秒，30秒周期2880次，60秒周期1440次。假设全天在线、完整周期上报；这是设计负载，不是保证可入库的有效样本数。

- 普通点：241×2880=694080，54×1440=77760，合计 **771840 点值槽/柜/日**（平均8.933槽/秒）。30柜 **23155200/日**。11个版本也计入槽数量，不能把全部771840当作 Float64 行。
- 普通报文数：2880+1440=4320/柜/日。加两种60秒单体=7200/柜/日；30柜216000条/日，平均2.5条/秒，不含EMS、心跳、结构、告警、历史补传与重试。
- 单体展开：样例160+80=240槽，每日345600；结构参考260+130=390槽，每日561600；协议上限500+500=1000槽，每日1440000。与普通点合计分别1117440、1333440、2211840槽/柜/日。三者是互斥容量情景，不能拿结构不一致的样例声称实配。
- 若以整组数组存储，单体只有2880组/柜/日，组内元素数仍决定存储与查询成本。null槽保留位置，也计入物理数组容量。
- 样例紧凑正文：2878×2880+1019×1440=**9756000 bytes/柜/日**；再加(1015+346)×1440=1959840，合计**11715840 bytes/柜/日**。30柜351475200 bytes/日。仅JSON正文，不含MQTT/TLS/TCP/索引/副本/WAL/压缩/ACK/重试；不能据此直接给磁盘配置。
- 重要补传“固定采样”理论槽量60×2880+14×1440=192960/柜/日，另40个变化点取决于真实变化次数及起始参考；没有固定总行数。历史缺行不补null。与live重复须去重，不额外算全部114点每30秒。
- alarm_data 样例601×2=1202槽、7680紧凑字节，是事件触发独立负载；正式按绑定点数P估算601×P槽/次，事件频率、实际窗口及空缺需现场确认。不能把两个占位点的大小外推成全点位故障载荷上界。

## 9. 批准前待确认的输入

权威点位工作簿及枚举源码、字典版本和单位/倍率；设备型号/厂家字典与dcdc/pvdc、bmu/bms、grid的真实绑定；修正同sv不同布局的参考；90002—90004、配置106等待定项；历史无损链与旧精度损失处置；配置rev与结构sv持久身份边界；累计量聚合与实时/历史冲突优先级。以上不阻塞保留原始载荷和制定验证用例，但在确认前不能声称完整语义映射已完成或开放写控制。
