# 接入实施准备核验

用户于 2026-09-28 明确批准推荐方案。代码位于 `codex/ems-device-integration`，没有向 main 推送或部署新接入服务。

- 已同步本地 main 的客户管理更新（截至 4f2658a），避免回退已上线功能；数据库 V10 已属于客户资料，因此 EMS 迁移从 V11 开始。
- 准备核验时 PostgreSQL 为 16.15，新业务库 `ems_cloud_v2_proto` 的迁移版本为 1—10；随后 V11 已完成独立测试、角色回滚预演和正式增量执行，见 [迁移记录](2026-09-28-v11-migration/README.md)。
- 已创建专用空 schema `ems_ingestion_tests`，最终 owner 为独立测试角色 `ems_ingestion_test`，撤销 PUBLIC 和生产应用角色对该 schema 的权限。测试角色仅取得测试 schema DDL 与业务库 CONNECT/TEMP；不扩大生产应用权限。V1—V10 已在独立 schema 完整执行并回滚，最后仍为空。
- 通过现有 SSH 隧道 `127.0.0.1:15434` 实测 JDBC：写读精确 decimal `9007199254740993.123456789012345678901234` 值相等；DDL 与数据事务回滚成功，测试 schema 最后仍为空。凭据只从服务器受管配置读入进程环境，没有进入 Git 或测试输出。
- 初始 API 单元基线：97 项中执行 43 项、跳过 54 项受环境条件控制的集成测试，0 failures、0 errors。该结果不代表数据库业务约束或实机联调已经通过。
- 两个站点代码为 PROTO-001、PROTO-002，目前没有 EMS 资产/UUID 绑定。真实 UUID、固件版本及绑定关系仍需事实确认，不把已有模拟设备当成实机。
- Kafka 清理后服务 active；专用 MQTT 仍使用 8883、64KiB 正文上限及既有身份替换行为，这两项尚待按方案改造和验收。服务器已有 Mosquitto 2.0.18 开发头文件及 gcc，可以实现并测试严格客户端身份校验。

本记录为环境准备证据，数据库实施结果见迁移记录；上行接入、ACK、页面和设备查询仍需后续实现与验收。

## Kafka 专用资源

- 创建 `ems-cloud-v3.ingress.fast.v1`、`ems-cloud-v3.ingress.state.v1`、`ems-cloud-v3.ingress.reliable.v1`，每个 3 分区、单副本，保留目标 72 小时且每分区 512 MiB；先达到容量限制时提前清理。验证时 9 个分区末端 offset 均为 0。
- 创建 SCRAM-SHA-512 身份 `ems-cloud-v3-ingestion`，仅有这三个 Topic 的 Read/Write/Describe、`ems-cloud-v3.ingestion.` 前缀消费组权限和幂等生产权限。
- Linux 服务账号 `ems-cloud-v3` 可读 `/etc/ems-cloud-v3/` 下受管配置、凭据和公开 CA。秘密文件为 root:ems-cloud-v3、0640，未进入仓库。
- 新身份实际列举仅能看到三个新 Topic；直接消费 `__consumer_offsets` 返回 `TOPIC_AUTHORIZATION_FAILED` / `TopicAuthorizationException`、处理 0 条，权限负向验证通过。Topic describe 命令将不可见 Topic 报为不存在，不能要求它一定输出显式授权错误；消费工具即使报告授权失败也可能退出 0，因此按异常和消息数判断。
- Kafka CLI 使用已有受保护安装目录，由 root 启动但使用新受限 Kafka 身份；没有扩大旧目录权限。worker 尚未部署，本结果不代表其运行链路已验收。

## 服务身份准备

- PostgreSQL 新身份 `ems_ingestion_worker` 仅取得新业务库 CONNECT、public schema USAGE，尚无业务表权限；表级权限待 V11 审查后按职责授予。运行密码在服务器 `/etc/ems-cloud-v3/database.env`，0640 root:ems-cloud-v3。
- 新 MQTT 云身份 `ems-cloud-v3-ingestion` 与七天有效的独立测试设备证书均通过 `openssl verify -purpose sslclient`。私钥保留服务器；没有改变 broker ACL/监听器，也没有将测试 UUID 绑定真实站点。
- Broker 身份回调和旧 bridge 的后续调整见 [MQTT 核查](2026-09-28-mqtt-readiness.md)。
