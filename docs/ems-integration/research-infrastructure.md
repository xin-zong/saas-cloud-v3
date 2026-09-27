# 云端接入基础设施核查（2026-09-27，只读）

> 后续状态：用户随后明确授权清除旧 Kafka 测试/开发数据，23:56 已完成清理及读写验证。以下保留原只读核查快照；当前状态以 [清理记录](operations/2026-09-27-kafka-cleanup/README.md) 为准。Kafka 已恢复管理访问，16 个旧业务 Topic 已删除，旧接入/遥测四个服务已停用。当前有效管理配置为 `/etc/chuneng-cloud-v2/kafka/security/clients/kafka-admin.properties`。

服务器 120.27.23.229；SSH 使用用户已提供授权。本轮未改配置、未重启服务、未创建 Topic、未读取业务库旧数据、未执行 EMS 资料 SQL。

## Kafka
- chuneng-v2-kafka.service 正在运行：Kafka 3.9.1，单节点 KRaft broker/controller。
- 业务 listener 与 advertised listener：SASL_SSL 127.0.0.1:19094；controller 127.0.0.1:19093。
- 默认 partitions=3、replication.factor=1、min.insync.replicas=1；offsets/transaction state 同样单副本。禁止自动建 Topic。
- 默认 log.retention.hours=72，同时 log.retention.bytes=536870912（每分区512MiB）；保留受两者共同限制，不能承诺总能保留72小时。
- 管理配置真实路径为 /etc/chuneng-cloud-v2/kafka/security/admin.properties。测试配置为 /etc/chuneng/telemetry-test-support/kafka-client.properties，声明 SASL_SSL/SCRAM-SHA-512；未输出其认证内容。
- 当前管理 metadata 查询失败，既有测试身份 list-groups 亦失败。23:27 附近 service journal 显示 KRaft Broker->Controller heartbeat RPC 超时。Topic/消费者现状未成功取得，不能认定不存在 Topic 或服务已健康。
- 最初19092探测端口不符实际配置，已中止；使用正确19094和已找到的管理配置后仍失败。未把首次路径/端口错误当成Kafka故障依据。

## MQTT
- 1883：既有 mosquitto.service，allow_anonymous=true；不得作为本项目生产接入口，也不在此轮修改。
- 8883：chuneng-v03-mosquitto.service；TLS1.2配置、require_certificate=true、allow_anonymous=false、use_identity_as_username=true、use_username_as_clientid=true。
- 服务端证书SAN包含IP120.27.23.229，有效期2026-09-16至2027-09-16；配置与证书存在不等于EMS实机TLS1.2/1.3及ACL联调已通过。
- use_username_as_clientid是将ClientID改为证书身份，不能据此声称严格拒绝原始ClientID不匹配。协议如要求拒绝不匹配，需认证钩子/插件补验并实测。
- 当前payload message_size_limit=65536、max_packet_size=73728；不足以容纳协议131072字节alarm_data。后续建议payload上限131072、总包上限留topic/header余量（例如147456），应用再按类别6/64/128KiB限额；下行仍4096。
- persistence=false。不得依靠当前Broker离线会话保存代替告警/补传的应用ACK和可靠保存。
- 设备ACL为证书username范围内6个up写和2个down读。仅发现一个cloud-query身份，拥有一台EMS的heartbeat/response读与request写；不具备完整云端telemetry/important/alarm消费及ack发送权限。

## 共存与资源
- 已有旧版EMS ingestion、SaaS、遥测processing/history/state-projection、Flink1.20.3、Redis、Keycloak等服务运行；源码工作树的新Spring Boot应用没有相应Kafka/MQTT依赖。
- 本轮快照：内存总约15GiB，available约6.1GiB；根盘总99GiB，可用约37GiB（快照值，非容量保证）。
- 新业务仍只使用 ems_cloud_v2_proto 与 ems_cloud_v2_proto_telemetry。优先复用基础设施，独立新Topic命名空间/消费组/凭据；不接入旧合成数据Topic，不清理旧资源，不借用旧运行账号。
