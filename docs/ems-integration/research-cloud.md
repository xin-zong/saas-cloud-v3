# 云端功能与 EMS 接入映射（只读调研）

日期：2026-09-27。范围：当前工作树 Java API、数据库定义、React API 适配器及 01—08 模块；读取用户提供的 `20260917/05_EMS与云端MQTT交互协议.md`（V0.5）。未实现、未连接 Broker/Kafka/现场数据库、未 SSH、未改动既有脏文件。本次不是视觉修改，未读取 Figma，不声称完成设计核对。本文的新增接口、数据模型和处理流程均为待用户确认的方案。

## 结论

现有系统有站点、设备、点位字典、历史查询、告警业务处理、计划审批、工单及权限基础，但没有已接入 EMS 的证据。`ems-cloud-api/pom.xml` 只有 Web/JDBC/PG/Flyway/认证等依赖，`src` 未找到 MQTT/Kafka/Redis/WebSocket 消费或推送实现。用户明确云端已有 Kafka，应复用其基础设施；这里的结论仅是**本仓库当前 Java 服务没有接入链路**，不推断云环境没有 Kafka。

协议允许的新下行操作只有 `structure.get` 和 `alarm.current.get`；附录 B 另保留独立旧信封 `communication.status.get`。参数写入、模式切换、功率控制、策略发布、XML 下发、固件升级、诊断执行均不在本版开放范围。云端计划审批成功、人工确认告警和工单办结不能转译为设备执行成功。

协议自身有版本状态冲突：开头写告警提供者未接入、返回 `DATA_UNAVAILABLE`，附录 B 及末尾阶段记录写已接入现有 43 条规则但未现场验收；不能择一声称真实设备能力，需与实际部署版本和开发计划对齐。

## 01—08 功能、接口与数据契约矩阵

路径均省略统一 `/api` 前缀。表中“建议”不表示接口已存在。

| 模块/功能 | 当前接口与行为 | 真实数据来源与接入建议 | 权限与阻塞 |
|---|---|---|---|
| 01 总览：站点状态、功率、SOC、设备/告警计数 | `GET /stations`；前端 `adaptStation` 将功率/SOC设为 NaN、状态 offline、遥测未知；无实时总览接口 | 绑定后的心跳、柜普通测量、告警与结构投影；建议增加站点快照读取，返回每指标来源/时间/质量/空值及聚合覆盖率 | `asset.read` 与按指标对应的 `telemetry.read`/`alarm.read`；不能把心跳正常当全部设备在线；多柜功率/SOC聚合及缺柜规则待确认 |
| 02 资产台账、设备树 | `GET /stations/{id}`、`/devices`、`/topology`；PG `device/device_model/topology_connection` | `structure` 推送和 `structure.get`，绑定 `(emsId,c,type,instance)` 到内部 device ID；保留 EMS UUID/柜 SN/子设备 SN 的不同含义；BMS为逻辑组，BMU可共用SN | `asset.read`；`PUT /stations/{id}` 是云端资料编辑（`asset.edit`+`asset.read`），不改变EMS配置；缺注册/绑定审核、结构版本和位置表 |
| 02 设备实时值/单体分布 | `GET /stations/{id}/points` 只读点位元数据；`stations.ts` 把所有 points.value=null、quality=bad，limits/parameters/operation为空 | 普通30/60秒、EMS60、cell_voltage/cell_temperature；建议 `/stations/{id}/telemetry/latest` 与设备单体快照，按明确点号和位置映射，保留二维位置和 null | `telemetry.read`，设备必须反查站点；结构未知或 cellReady=false 不按默认数量造数组；枚举/点表来源及源实现逐项核实 |
| 02/06 历史曲线 | `GET /points/{id}/history?from&to&minutes` 查 CH，31天、1/5/15/30/60分钟、avg+count、44640条上限 | 真实普通采样和 important_history 经规范化写入；建议保留当前接口数值聚合兼容版本，新增质量/缺口/原始值语义 | `telemetry.read` 经 point→device→station 校验；CH当前只存 Float64，不能承载 null/枚举/数组/质量；普通离线历史不可假定可补 |
| 02 站点开通/配置发布 | StationProvisionPage 本地草稿，绑定和部署服务未接通 | 云端资产绑定流程可独立实现；EMS结构只读用于核验。XML按协议留后续独立契约，首版不下发 | 需明确管理员绑定权限；本地草稿不当发布记录，不能用 `structure.get` 修改拓扑 |
| 02/03 运行计划、模式/约束参数 | `GET /stations/{id}/plans`、`POST /plans`、`/plans/{id}/submit`，保存PG并创建审批 | 当前仅云端计划对象；EMS `cfg.rev/p`可用于只读显示已生效配置；希望实际下发的方案先形成独立 EMS 写操作契约 | `strategy.read/manage`；`strategy.dispatch` 在目录 `available:false`；审批状态没有 execution 含义；未知枚举不按前端模式名称猜映射 |
| 03 电价、市场、收益结算 | `/stations/{id}/tariffs`、`POST /tariffs`；`/market-services`、`/qualifications`、`POST /market-drafts`、取消；`/settlements`、`/settlements/{id}/reviews` | 云端业务数据及外部交易/价格来源；计量可来自指定电表点位但需电量口径、时区、重置/回绕、完整性契约；不能由MQTT连接自动获得市场结算 | `tariff.manage`、`market.read/manage`、`revenue.read/review`；动态电价供应商、独立售电、市场执行未接通；不新增未批准的EMS op |
| 04/02 当前/历史告警 | `GET /stations/{id}/alarms` 读PG alarm；`POST /alarms/{id}/acknowledge` 仅写人工确认；notes 独立 | `alarm_event`、`alarm_current` 及 `alarm.current.get`；事件身份与序号需独立存储，当前列表用于核对，不生成不存在的历史；保留 device.c/type/id 与 sv=null | `alarm.read/handle`；当前表唯一键 `(device_id,code,occurred_at)` 不等于 `(emsId,alarmId,seq)`；人工确认绝不能发业务保存ACK或清设备故障 |
| 04 告警关联趋势、健康、诊断 | 关联趋势/AI根因显示未接通；健康分数仅device_observation字段；远程诊断只存本地草稿 | 后续 alarm_data 完整对象、规范点表、算法与证据来源；先显示实际可得数据和缺失状态，健康评分不能由通信状态推算 | 关联数据协议为目标定义且当前阶段未全部落地；远程诊断执行无op，不能开放 |
| 04 固件 | `GET /stations/{id}/firmware-tasks`只读PG任务；UI只保存文件名/大小/版本本地草稿，执行/停止禁用 | structure 可显示确认过的软件版本；升级上传、签名、兼容性、分发、状态回执须后续独立协议 | 读取`asset.read`；`firmware.upload/upgrade`目录均 unavailable；不能用版本变化捏造升级任务成功 |
| 05 工单、巡检、审批 | `/work-orders` 创建/查询、transition、assignee、events、notes；`/inspections` 创建/完成/取消；`/approvals`、decision | 保留云端业务事务；可引用真实告警、测量和结构快照作为证据；不自动生成EMS命令 | `workorder.read/create/handle/edit`、`inspection.manage`、`approval.review`；禁止自审、行锁与状态检查已存在；内部审批通过仅更新计划/审批状态 |
| 06 分析与报告、审计 | `/stations/{id}/reports/{kind}` 即时CSV；revenue来自结算，operations来自计划，health来自单份最新observation；`/audit`是人工业务审计 | 采样分析经CH；若扩展实际运行报告需新增真实测量投影，不把计划当实际。设备事件审计需单独来源/执行关联 | `report.export`+各业务域读取，`audit.read`；当前health不是健康时序历史；AI分析/排版报告/生成任务未接通 |
| 07 平台管理 | 组织/成员/角色/站点授权等现有PG API | EMS证书登记、唯一UUID、租户/项目/站点绑定、吊销状态建议作为新管理对象；服务消费者只处理已登记设备 | 复用组织及站点作用域，不因设备上报任意emsId/站点就授权；证书Broker ACL和应用绑定双重校验；不得绕过有效授权视图 |
| 08 设置 | `/settings`读写当前用户偏好；账户认证由AuthController单独处理 | 平台个人设置无需EMS；未来EMS配置只读来自cfg.p及rev，写入必须另行批准契约 | 不将界面时区、通知偏好下发为EMS参数；通知投递不等于偏好保存成功 |

## 当前代码需适配的具体断点

1. **连接与观测状态分离。** `AssetController.java:104` 对 `device_observation.observed_at` 采用15分钟离线阈值；协议按每30秒心跳、连续90秒未到标记EMS通信不可达，且没有LWT。两者含义不同。建议独立存ems连接会话/lastHeartbeatAt/connectionId与每设备源观测时间，不能沿用15分钟当协议心跳阈值，也不能由EMS在线覆盖所有子设备状态。
2. **身份不能用SN替代。** V1 schema没有ems_id、柜位、sv、seq或连接字段；device.serial_number有全局唯一约束。协议BMU每柜可共用SN，因此不能把共用SN逐BMU强写该唯一列。需要稳定位置映射，SN仅元数据；多EMS站点、同柜重绑定、替换设备保留历史必须定规则。
3. **类型与质量。** CH V1 `value Float64`、`sampled_at NOT NULL`、`isFinite`禁止协议合法null，没有q、收到时间、结构上下文。EMS配置有枚举/开关/周计划，不全是数值。建议原始信封持久化+类型化规范模型：`valueType`、nullable数值/字符串/布尔/数组、sourceTs可null、receivedAt、sourceQuality、emsId、连接及结构上下文；不造源ts、不补零、不再次应用寄存器倍率。维持有效0。枚举使用确认字典。
4. **聚合语义。** `TelemetryController.java:60` 固定avg(value)和count()，当前对数值有效但不适合枚举、计数器、数组、功率积分/电量差值。q=invalid/stale的选择、空桶/缺测、有效样本数与预计样本数需定义；null不得落成0。`apiAnalytics.ts:4,29`把HistoryBucket.value限定number并过滤null，若新契约返回空桶必须同步改类型/图表缺口，不能仅改数据库。
5. **幂等不是已有revision字段即可满足。** ReplacingMergeTree按(point_id,sampled_at)及revision更换；需要定义有效修正版本来源，不能拿重发时间或全局随机数覆盖正确样本。CH FINAL仅负责现有粒度去重，不满足协议可靠对象去重与冲突拒绝。必须另存协议身份/内容摘要与保存结果。
6. **前端更新不等于当前已实时。** `App.tsx:328`仅user/revision变化加载全部站点；每站并发最多9域请求，非持续遥测。StationDevices每2秒、告警/运维每30秒主要更新本地当前时间，不是取EMS。StationAnalysis实时视图每10秒查询历史，是HTTP聚合轮询且可能按点并发；`stationTelemetryQuery.ts`按名字+单位唯一匹配，多柜同名点会整体跳过。建议稳定semantic key+位置+显式站点聚合映射、增量快照接口；是否保留轮询或SSE待规模确认，不能宣称已有推送。
7. **授权不可只靠菜单。** `GrantAuthorization`每次读DB有效授权，`effective_permission`仅用于入口，资源必须`requireStationPermission`。新读取/查询API先由内部EMS绑定定位站点再校验，消费者凭服务身份+登记映射写入，不接受浏览器直接指定任意MQTT topic。异步请求结果读取也重复核验当前权限，避免授权撤销后仍读取结果。

## 建议的 MQTT—Kafka—存储边界（待确认）

复用云端既有 Kafka：Broker授权上报 → MQTT接入/桥接 → Kafka原始事件 → 校验规范化消费者 → PG当前状态/身份/业务对象、CH数值历史及独立类型化历史。前端继续通过Java授权API访问；不直连Broker。现有API CH账户明确SELECT-only，写入使用单独服务账户，不能放大Web API权限。

Kafka事件建议包含原始topic、原始UTF-8正文、Broker/接入可信身份、receivedAt、messageType、解析状态/错误、内容摘要；保留原文便于重放。按emsId分区有利于单设备顺序但不能替代协议connectionId/seq校验，也不能保证不同topic跨桥接顺序。毒消息隔离有可观察失败原因，未知设备不可自动归属任意租户。Kafka事务不能覆盖PG/CH跨库事务，不能直接承诺端到端exactly-once。

**ACK必须设定明确提交点。** 协议要求完整对象及去重状态可靠一致保存后才`down/ack`，MQTT PUBACK不是该确认。单纯消息进Kafka即ACK是否满足业务定义不能默认；建议首阶段采用可靠inbox+对象与dedupe同事务持久化、outbox产生ACK，CH后续幂等投影。若改为Kafka作为权威可靠对象存储，必须先批准保留/复制/灾备/重放及去重一致性契约，再确定ACK时机。重复同内容重发ACK，身份相同内容不同隔离冲突且不成功ACK。

| 上行类别 | 云端保存/投影 | 下行边界 |
|---|---|---|
| heartbeat/status | 当前ems连接状态；新connectionId使旧会话现状未知；status辅助 | 无业务ACK；重复response不是心跳 |
| structure | 完整结构快照，当前连接同seq同内容去重、更大seq更新；sv与布局保存 | 无业务ACK；未知sv触发受限structure.get；未知结构依赖普通消息跳过，不强求补传 |
| ems/柜普通/单体 | 合法类型化源值与质量，最新快照+历史；保留null/真实ts | 无业务ACK；普通断网不积压旧值，不伪造历史 |
| alarm_current | 当前连接、柜范围完整快照，空数组=确认无告警，null=未知 | 无业务ACK；必要时alarm.current.get，仅已分配c=1..30；公共设备查询范围仍待确认 |
| alarm_event | `(emsId,alarmId,seq)`身份、完整内容与摘要/结果；映射到业务alarm，恢复不等于人工确认 | 保存成功ACK精确回`type=alarm_event,alarmId,seq`，忙/拒绝按协议错误；无connectionId要求 |
| alarm_data | `(emsId,alarmId)`关联完整对象（seq=null），容量128KiB，独立去重/存储状态 | 独立ACK `type=alarm_data,alarmId,seq:null`，不能用事件ACK代替 |
| important_history | `(emsId,taskId,part)`包及去重状态，完整验收再投影采样 | `type=important_history,taskId,part`ACK，不等于普通采样ACK |

协议容量：下行4096字节，普通/单体6144字节，完整结构及成功结构响应65536字节，alarm_data131072字节。所有retain=false；禁止截断/漏点。Kafka及桥接限制需至少适配这些完整载荷和事件封装开销。结构/告警顺序按协议而非收到时间盲覆盖；源时钟未来值也要保留证据并隔离质量，不能自动当当前值。

## 建议的新只读查询服务边界

可新增云端请求API及结果读取（具体URL待确认），仅允许白名单structure.get、alarm.current.get。调用时映射授权站点→EMS，校验最新心跳公布connectionId，生成UUID id，expiresAtMs默认now+30000；分别params={}和params={c:已分配柜号}。服务保存操作者/权限判断/完整请求/截止时间/结果，向目标精确down/request发布QoS1、retain=false。响应以emsId+id关联，再验证结果携带连接/序列，不把ok:true当写控制执行。

同请求重发保持id及完整语义（含期限），不能只换id自动重做未知结果；新连接使旧请求失效，不离线排队自动补发。EMS32条/60秒连接内缓存、最多8条待处理和5秒本地排队需流控；不把30秒默认截止当保证30秒必回。时钟不可信的只读例外仅按协议执行，云端不扩大到写控制。保留`DATA_UNAVAILABLE`、`BUSY`、`CONNECTION_MISMATCH`、`REQUEST_EXPIRED`等真实状态。旧communication.status.get仅独立兼容，不当新查询信封替代。

## 进入实现前应确认的最小项

- 既有Kafka/Broker桥接归属、授权方式、topic/partition/保留配置、正式TLS监听端口/证书SAN/ACL；不读取或回显凭证。
- 设备注册与站点绑定责任、多EMS/多柜归属，以及点号/语义/枚举与实际部署版本的权威清单；协议已标注的未知项继续null。
- 第一阶段真实可用上报类别。协议设计存在不代表提供者已实现；在线告警RAM队列不能宣传跨重启可靠保存，alarm_data和important_history逐项确认。
- 可靠保存与业务ACK提交点、重放/冲突/灾备策略；聚合值与可用率口径、存储保留期限及预计EMS规模。
- 是否仅落地接入/展示/两个只读查询。所有写控制另出契约和权限/审批/回读/未知结果处理方案，在EMS团队确认前保持不可用。

## 主要源码定位

- `ems-cloud-api/src/main/java/com/enerlution/ems/business/{Asset,Telemetry,Maintenance,Operations,Revenue,Report,Settings}Controller.java`
- `ems-cloud-api/src/main/java/com/enerlution/ems/auth/GrantAuthorization.java`
- `ems-cloud-api/src/main/resources/permission-catalog.json`（strategy.dispatch、firmware.upload/upgrade均available=false）
- `ems-cloud-api/src/main/resources/db/migration/V1__identity_assets.sql`、`V2__maintenance_operations.sql`
- `ems-cloud-api/database/clickhouse/V1__telemetry.sql`、`pom.xml`、`src/main/resources/application.yml`
- `ems-cloud-ui/src/api/adapters.ts`、`stations.ts`；`src/components/apiAnalytics.ts`、`stationTelemetryQuery.ts`、`StationAnalysisPage.tsx`、`StationDevicesPage.tsx`
- `src/components/strategy/InternalPlans.tsx`、`ModeEditor.tsx`、`maintenance/MaintenanceFirmware.tsx`、`MaintenanceWorkbench.tsx`、`station-provision/StationProvisionPage.tsx`（均相对于ems-cloud-ui）

验证方式：只读源码/协议搜索及逐段阅读；未跑运行时测试，因为未实现、未接入现场服务。本报告不作为任何链路已联调或部署成功证明。
