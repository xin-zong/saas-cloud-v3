# Cloud EMS Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking. 用户已批准实施，不再询问是否继续。

**Goal:** 实现现有协议的真实 EMS 上行接入、可靠持久化、查询下行及 SaaS 页面接口，并为缺少设备契约的写控制保留明确验收门槛。

**Architecture:** 复用专用 MQTT 8883 与已清理 Kafka；独立 worker，PG 维护业务/可靠对象/outbox，CH 存遥测；现有 API 保留鉴权。协议 Java 库在 API 与 worker 共享，不在 worker 引入整个 Web 应用。

**Tech Stack:** Java 21、Spring Boot 3.5.15、Jackson、JDBC PostgreSQL、Kafka 3.9.1、MQTT 3.1.1、ClickHouse HTTP、React 19 / TypeScript。

**Spec:** `docs/superpowers/specs/2026-09-27-cloud-ems-integration-design.md`

## Global Constraints

- 只使用 `ems_cloud_v2_proto` 和 `ems_cloud_v2_proto_telemetry`，数据库凭据不进 Git/日志；测试使用独立 schema/表，不清空业务数据。
- PK/FK/UNIQUE/CHECK 与 3NF；复用资产、测点、权限。device.serial_number 在 V1 已可空，无需再改 nullable（原研究表述已由源码校正）。
- null 不补零；不再次套倍率；版本字符串及 20062 四段 U16 无损。实时采样时间、历史归档时间、接收时间分开。
- ACK 必须晚于 PG 完整可靠对象、冲突索引、发送 outbox 的同事务提交。CH 异步投影不能作为未保存先 ACK 的借口。
- 当前连接、结构 sv、配置 rev、快照 seq 不混用。旧连接/重放心跳不能刷新在线；未知结构不解码单体。
- 已停用旧 EMS/遥测四服务，不自动恢复；新 Topic 使用 `ems-cloud-v3.ingress.{fast,state,reliable}.v1`，不复建旧测试链路。
- 不覆盖现有 Header/Overview/CSS/test 脏修改。视觉变化前读 Figma；功能数据绑定沿用现有视觉。
- 设备写控制契约缺失不编造命令；实现正式支持的 structure.get、alarm.current.get 并真实验证，不声称控制链路已完成。

## Task 1: 无损协议解析库与 Maven 构建

**Files:** 新增根 `pom.xml`（聚合器）；`ems-cloud-protocol/pom.xml`；`ems-cloud-protocol/src/main/java/com/enerlution/ems/protocol/{ProtocolException,WireMessage,WireDecoder}.java`；对应 `src/test/java/.../WireDecoderTest.java`。不改现有 API POM 的父结构。

**Interfaces:** `WireDecoder.decode(String topic, byte[] payload): WireMessage`；`WireMessage(UUID emsId,String channel,String type,JsonNode body,String canonicalHash)`；规范化 hash 以键排序、数字无损规范化后的树生成，不含接收时间。结构细节/点目录和业务状态校验留在下游专用处理器，decoder 必须校验消息 envelope 与每类必有字段，失败抛 ProtocolException，不暴露原报文。

- [x] 先写测试，用反射 assertDoesNotThrow(Class.forName(...)) 让缺少类型表现为测试失败；添加非法 UUID/Topic、重复键、尾部 JSON、v!=1、type/channel 冲突、无损大整数、哈希键序不敏感的测试。
```java
assertThrows(ProtocolException.class, () -> decoder.decode(topic,
    "{\"v\":1,\"v\":1,\"type\":\"structure\"}".getBytes(UTF_8)));
assertEquals(first.canonicalHash(), reordered.canonicalHash());
```
- [x] 创建聚合器和协议模块的测试依赖，运行 `mvn -pl ems-cloud-protocol test`，保存 RED 证据。
- [x] 实现 strict duplicate detection、尾随 token 拒绝、UTF-8 严格解码/树解析、整数范围、UUIDv4 lowercase、按消息类 6144/65536/131072 byte 限额，最大树深度/字符串/数字长度限制。响应 64KiB，heartbeat/status 同样设上限。只接受 6 个 up Topic；type 缺失只允许协议明确未带 type 的 heartbeat/response/status。
- [x] 定义所有 10 种业务 type 路由及字段形状，禁止 reliable 类型进入普通遥测 Topic；柜号 1—30、版本 1、序号正数、关键 ID/字符串长度、history part/parts/p/data 下标、alarm_event level/state/device 等按源协议校验。查询响应按 ok 区分 data/error。
- [x] GREEN 后在根 `mvn test` 验证现有 API 单元回归，提交本任务文件；保留 JDBC 集成测试未启用的明确标记。

## Task 2: 点定义和结构解释

**Files:** `ems-cloud-protocol/.../{PointCatalog,PointValue,StructureLayout,TelemetryDecoder}.java`；`src/main/resources/ems-v1-point-catalog.json`；同名测试；`scripts/import-ems-catalog.py`（离线文本解析）。

**Interfaces:** `TelemetryDecoder.decode(WireMessage, StructureLayout)` 返回 typed observation 列表及配置快照；PointValue 保留 JsonNode typed value/quality/source timestamp，不转换未知单位。

- [x] 用 30s/60s 295 点、20062 数组、11 个版本、EMS 6 项与 cfg 173 项编写来源明确的 fixture，独立样例不拼成假站。为不匹配 sv、数组长度、q 与 ts=null 编写拒绝/未知断言。
```java
assertEquals("1.02", version.value().textValue());
assertTrue(missing.value().isNull());
assertEquals(65535, bitmap.value().get(3).intValue());
```
- [x] RED 后实现 SQL INSERT 文本提取、来源 hash、命名空间及 wire 类型覆盖；不执行源 SQL，不将缺失枚举解释为实际规范。
- [x] 普通点 profile 中已知单位/语义才映射 kind，其余源点可保留并标待映射；单体只按匹配布局解释，BMU 槽不创建假物理 SN。
- [x] GREEN，核算导入数量和源文件 hash，提交。

## Task 3: PG 接入关系与权限迁移

**Files:** `ems-cloud-api/src/main/resources/db/migration/V11__ems_ingestion.sql`；`permission-catalog.json`；`src/test/java/com/enerlution/ems/ingestion/IngestionSchemaPostgresTest.java`。V10 已由主分支客户管理占用，且已部署，禁止复用版本号。

**Interfaces:** 迁移定义 ems_gateway、绑定历史/结构/点映射/配置、连接与租约、可靠对象/补传样本身份、query_request、outbox；具体列由 spec 第 6 节的函数依赖裁定。所有使用方按这份迁移读取，不各自建表。

- [x] 在 `ems_ingestion_tests` 独立 schema 中应用 V1—V11；先测试缺少 V11 时失败，再实现。测试重复 EMS/源点、跨站绑定、非法柜号、同版本冲突、无效外键与 value 类型互斥。
```java
assertThrows(DataIntegrityViolationException.class,
    () -> db.update("INSERT INTO ems_gateway(ems_uuid,device_id) VALUES (?,?)", sameUuid, anotherDevice));
```
- [x] 实现关系及所需权限 ems.read/ems.manage/ems.query，按照既有角色/授权规则赋予超级管理员，不用超级管理员特殊旁路替代鉴权。
- [x] 真实 PostgreSQL 执行约束和回滚测试，再在新业务库跑增量迁移；记录版本、校验和、前后行数，禁止执行到旧库。
- [x] GREEN，提交 migration 与测试。

## Task 4: 接入服务与 MQTT→Kafka

**Files:** `ems-cloud-ingestion/pom.xml`、`IngestionApplication.java`、`IngestionProperties.java`、`MqttIngress.java`、`KafkaIngress.java`、`GatewayLease.java`、`application.yml`、transport tests；根聚合器模块列表。

**Interfaces:** transport 使用 Task1 decoder；Kafka envelope 带不可变 receivedAt、ingressEpoch/sequence、消息身份与原始正文。PG 注册信息是 emsId 的允许清单。

- [x] 先测未注册身份、未持有租约、过期 fencing、Kafka 失败时无业务 ACK/无无限缓冲。
```java
assertFalse(lease.isOwner(emsId, staleFence));
assertEquals(0, publishedBusinessAcks.size());
```
- [x] 实现 mTLS MQTT 3.1.1 客户端与 Kafka idempotent producer；独立三输入 Topic；每类有界队列，关闭时取消后台任务。生产消费凭据仅由受管文件/环境读取。
- [x] 真实 MQTT/Kafka 独立测试 Topic 完成消费检查；测试数据与业务绑定隔离，结束删除本次测试资源。
- [x] GREEN，构建独立 worker jar，提交。

## Task 5: 可靠保存、告警、补传和 ACK

**Files:** worker `ReliableMessageStore.java`、`ReliableConsumer.java`、`AckOutbox.java`、`AlarmProjection.java`、`HistoryIdentityStore.java`；对应 PostgreSQL/故障注入测试。

**Interfaces:** `ReliableMessageStore.accept(WireMessage, Instant receivedAt)` 提交 PG 事务后返回已保存/重复；业务错误区分 busy/rejected。outbox worker 只读已提交记录，topic/ACK shape 由保存类型派生。

- [x] RED：重复对象再次 ACK；同键不同值整包冲突；跨 taskId 同历史身份冲突；事务回滚无 ACK；提交后发送前进程重启可恢复。
```java
assertEquals(1, reliableCount(key));
assertEquals(0, partialHistoryRows(rejectedPackage));
assertFalse(ackWasPublishedBeforeCommit);
```
- [x] 实现唯一约束与规范 hash 比较，whole-package 原子性；消费者提交 offset 晚于 PG；outbox 重试 ACK 不重复业务事实。
- [x] 告警事件进历史、触发当前清单刷新；null 现状不清空；查询过程中新增事件保留后续刷新代际。
- [x] 真实 PG/Kafka 故障注入 GREEN，提交。

## Task 6: CH typed facts 和投影恢复

**Files:** `ems-cloud-api/database/clickhouse/V2__ems_observation.sql`；worker `ClickHouseWriter.java`、`TelemetryConsumer.java`、`ReliableProjection.java`；集成测试。

**Interfaces:** typed observation 存 point ID、source/receipt/archive time、quality、stable fact ID 与互斥值；单体二维 nullable 元素数组加整体存在标记。API query 使用同一表契约。

- [ ] RED：版本/位图/null roundtrip；重复消费无重复查询结果；补传不覆盖实时最新值；CH 断开时可靠 PG 对象与待投影状态保留。
```java
assertEquals(originalBitmap, historyValue(pointId));
assertEquals(1, factCountAfterReplay(factId));
```
- [ ] 实现 HTTP 有界批写、稳定幂等身份、CH 成功后 offset/投影状态推进，失败重试有退避；不在每个实时点上写 PG EAV。
- [ ] 新库执行 DDL 并使用独立测试表验证后清理测试表；持久化读取权限分离。
- [ ] GREEN，提交。

## Task 7: 连接/结构/配置现状及查询下行

**Files:** worker `ConnectionState.java`、`StructureStore.java`、`ConfigurationStore.java`、`QueryDispatcher.java`、`ResponseConsumer.java`；单元与 PG 测试。

**Interfaces:** gateway current connection 按入口租约代际 + 新鲜心跳切换；query_request 状态 pending/sent/succeeded/failed/expired/unknown；op 白名单 structure.get/alarm.current.get。

- [ ] RED：90秒无新鲜心跳不可达；Kafka 重放/退役连接不接管；同 sv 不同 seq 元信息更新；旧响应/连接变更不能完成新请求。
```java
assertFalse(state.isReachable(clock.instant()));
assertEquals("expired", dispatch(expiredRequest).status());
```
- [ ] 实现 structure/current snapshots、config rev 冲突规则、固定请求ID和deadline、32次/60秒限流与有界队列；无设备写命令默认路由。
- [ ] MQTT 模拟器查询往返及后续实机响应分开验收。
- [ ] GREEN，提交。

## Task 8: API 读模型、授权与管理入口

**Files:** API `business/EmsController.java`、`business/TelemetryController.java`、`business/EmsTelemetryQueries.java`；协议库依赖；`EmsControllerPostgresTest.java`、typed history tests。

**Interfaces:** spec 第10节的 /api/stations/{id}/ems、/ems/{id}/{structure,configuration,queries,ingestion-status}、/stations/{id}/telemetry/latest、/devices/{id}/cells；复用 AccessControl.requireStationPermission。

- [ ] RED：跨站读取/注册/查询拒绝；撤权后的 query 结果轮询拒绝；输入非法 op、超限时间窗/聚合拒绝。
```java
mvc.perform(get("/api/ems/"+outsideId+"/structure")).andExpect(status().isForbidden());
```
- [ ] 实现 DTO 中 value/quality/sourceTime/receivedAt、真实空态；typed history 按 avg/min/max/last/delta 白名单，旧 Float64 历史兼容不冒充实测。
- [ ] PG/API 集成验证超级管理员权限目录及其他角色授权边界，提交。

## Task 9: SaaS 01—08 实际数据和交互

**Files:** `ems-cloud-ui/src/services/` 现有 API adapter、`src/components/Station*`、`OverviewPage.tsx`、运维/分析/设置对应页面；精确修改文件按现有入口确认；`ems-cloud-ui/AGENTS.md` 为约束。

**Interfaces:** 消费 Task8 API；实际数据来源标识、null/quality 未知、快照/响应时间；可见页10秒刷新及旧请求取消。

- [ ] 先读现有 frontend AGENTS 与对应 Figma 页面截图，记录节点；写适配层测试：null 不变0、字符串版本不变数值、晚响应不覆盖、新数据需站点授权。
```typescript
assert.equal(adaptObservation({value: null, quality: 'invalid'}).value, null);
```
- [ ] 逐项接通 spec 第11节矩阵：站点树/实时点/单体/当前和历史告警/配置只读/结构与告警查询/补传状态。保留布局及真实空态。
- [ ] 未定义写控制显示未接通，不返回模拟成功；计划、审批、人工告警确认与设备执行/保存 ACK 分开。
- [ ] 单元/构建/浏览器真实点击和网络响应验收，提交本轮文件时保留原有用户修改。

## Task 10: 云端部署、实机和完整目标验收

**Files:** worker `deploy/` 服务单元、配置示例、迁移/启动脚本；`docs/ems-integration/operations/` 部署及验收证据。

- [ ] 核实已授权服务器真实 EMS 身份、固件和证书能力；创建专用服务权限/Topic/PG写入/CH写入账号，不打印私钥/密码。MQTT payload/packet 限额与 CN 校验按 spec 实测。
- [ ] 部署 worker，按站点资产事实绑定真实 EMS；没有明确对应关系时不猜测绑定，继续完成其他可验证功能。
- [ ] 对两站点核验实机数据、断线重连、补传、重复告警、下行查询和页面结果；24小时容量以实际观测报告，不用模拟器冒充。
- [ ] 正式写契约提供后扩展对应命令、权限、前置条件、执行/生效状态并实机验收。若尚未提供，明确此项未完成，保持全目标未完成状态。
- [ ] 全分支审查、完整必要测试、数据库升级验证、无凭据检查；不自动合并/推送 main。用户已授权的实现与部署继续推进，无需重复批准。

## 验证入口

当前 Maven 可用命令：`D:/projects/ems-cloud-v2.0/ems-cloud-api/.tools/apache-maven-3.9.11/bin/mvn.cmd`。在本工作树根执行 reactor 测试；API JDBC 集成通过显式环境变量接入独立测试 schema。首次 baseline 为 `ems-cloud-api` 下 `mvn -q test`，结果记录在执行 ledger。

具体外部环境依赖（实机 UUID/固件、写控制契约）在 Task10 核实；不影响 Task1—9 的受控测试与实现。完整目标达成需要全部相关实机证据，不能以单元测试替代。
