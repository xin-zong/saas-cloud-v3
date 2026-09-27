# Kafka 旧测试数据清理记录

执行日期：2026-09-27；最终核验时间：23:56:19 +08:00。

用户明确授权：现有 Kafka 堆积数据全部属于无用的测试/开发数据，可以直接清除。本授权用于本次清理，不等同于批准尚待确认的 EMS 接入开发方案。

## 结果

- 通过 Kafka 管理接口删除 16 个旧业务 Topic，完整名称见 [删除清单](topics-delete.txt)。未手工删除 Kafka 日志目录或格式化集群。
- 业务 Topic 为 0，消费组为 0，业务分区目录（包括延迟删除目录）为 0。
- 日志目录实际占用由清理前约 2.0 GiB 降至 121958400 字节，约 116.3 MiB；释放约 1.9 GiB。清理前只记录了四舍五入的实际占用，不能给出精确释放字节数。
- 保留 __consumer_offsets、__transaction_state、KRaft 集群元数据、集群 ID、认证与 ACL；保留这些内部信息不代表仍有旧业务积压。
- 完成一次 SASL_SSL 下创建临时 Topic、acks=all 写入、消费并比对原文、删除临时 Topic的验证；最终业务分区目录也已实际回收。
- MQTT、PostgreSQL、ClickHouse 和 SaaS 服务检查为 active。本次没有清理数据库、Redis、MQTT 数据或业务文件。

机器可读证据见 [verification.json](verification.json)；服务原状态见 [services-before.txt](services-before.txt)，原 Topic 配置见 [topics-before.txt](topics-before.txt)。服务器上的操作记录保存在 `/root/kafka-cleanup-20260927`，仅包含核查及操作结果，不含报文备份或凭据。

## 停用旧数据链路

下列四个服务的 Kafka 配置及活动连接指向被清理的旧 test/synthetic Topic，已停止并关闭自启动，避免继续写入或在旧积压上重试：

| 服务 | 清理后状态 |
|---|---|
| chuneng-v2-ems.service | inactive / disabled |
| chuneng-telemetry-processing.service | inactive / disabled |
| chuneng-telemetry-history.service | inactive / disabled |
| chuneng-telemetry-state-projection.service | inactive / disabled |

这是旧服务停用，不是新 EMS 接入已部署。旧 EMS 接入进程现已停止，不能声称旧接入链路仍工作。SaaS 进程仍运行也不代表依赖旧链路的页面还能取得新遥测。

四个服务的程序、环境配置和数据库均保留。如后续决定恢复旧链路，须先按保存的 Topic 配置和明确业务需求重建资源，再恢复服务；直接启动不能恢复已经删除的报文。原 history 服务本来就是 disabled，恢复自启动时应参考原状态而非一律 enable。

## Kafka 可用性处理

清理前 Kafka 的 MemoryHigh=768 MiB、MemoryMax=1 GiB，cgroup 内存压力 some/full 超过 60%，high 事件大量累积；管理接口反复超时。临时提高至 MemoryHigh=1 GiB、MemoryMax=1.5 GiB 后，查询恢复。这是本次超时的重要实测证据，不把单次处理当作未来容量保证。

此前 `/etc/chuneng-cloud-v2/kafka/security/admin.properties` 是失效的旧管理配置。当前成功使用的受管配置为 `/etc/chuneng-cloud-v2/kafka/security/clients/kafka-admin.properties`，认证方式不变，未重置密码。

清空业务后正常重启 Kafka，完成读写验证，并将内存限制恢复到原来的 768 MiB / 1 GiB。最后实测 MemoryCurrent 约 735 MiB，memory.pressure 的 10/60/300 秒值均为 0；重启完成后的观察区间未再出现心跳超时。新接入上线时仍需根据实际容量重新评估，不能据此承诺原资源配置可承载任意规模。

Topic 删除采用官方管理方式：[Kafka 3.9 基本管理操作](https://kafka.apache.org/39/operations/basic-kafka-operations/)。消费组在删除 Topic 后大部分随状态清理消失，最后剩余的一个 cell-history 组通过管理接口明确删除；最终 list-groups 为空，未删除 Kafka 内部 Topic。
