# 合肥站 EMS 云端接入指引

更新日期：2026-09-28。面向 EMS 开发、部署及联调人员。

本文对应已部署的独立 MQTT 入口与合肥站登记信息。协议正文以交付包 `references/05_EMS与云端MQTT交互协议.md`（SS-EMS-CLOUD-05 V0.5、JSON v1）为依据；其中旧端口示例由本文的 **8884** 替代。协议中的“目标能力”和合成报文不代表现场固件已经实现或验收通过。

## 2026-09-28 容量补充约定（待接入服务发布启用）

按本次要求，原 6144 字节的所有上行类型提升到 **65536 字节（64 KiB）**，包括心跳、状态、EMS/机柜/单体数据、告警事件、当前告警、重要历史包；所有查询响应（含外层信封）也统一为 65536 字节。structure 原上限不变，alarm_data 保留更大的 131072 字节，下行请求仍为 4096 字节。长度以整个 UTF-8 正文字节数计，包含边界值。

**启用状态：云端源码已修改并通过协议模块测试，本次尚未替换运行中的接入服务。正式发布并联合验证前，EMS 仍按原 6144 字节限制发送原受限类型。** TLS、站点登记和 Topic 权限已配置，不代表容量升级已在线生效。

本补充只覆盖容量，与附件原 V0.5 的 6 KiB 条款冲突时以本补充为准；原协议文件保留原样用于追溯。EMS 侧需要同步调整序列化、发送/接收缓冲区及长度校验，尤其是当前告警查询完整响应。点位完整性、单体维度、每历史包最多 100 行等业务约束不因放宽字节数而取消。

重要历史仍受 16 KiB/秒平均速率限制；若 EMS 限流器将单包大小硬限在 16 KiB，不能直接发送更大包。初期可以保持较小分包；使用大包前须支持累计额度/发送后相应等待，并验证不造成永久排队。不要简单取消限流。

## 1. 连接参数

| 配置 | 值 |
| --- | --- |
| 云端站点 | 合肥站，内部 ID 4，编码 PROTO-001 |
| 永久 EMS UUID / MQTT ClientID / 客户端证书唯一 CN | `4a8be161-7ee9-458f-b412-7d256e64eed9` |
| Broker | `120.27.23.229` |
| TCP 端口 | `8884` |
| 传输 | MQTT over TLS，双向证书认证；不是 HTTP/WebSocket |
| MQTT 版本 | **3.1.1**，不要使用 MQTT 5 |
| TLS | TLS 1.2 / 1.3，验证服务端证书链及 IP SAN |
| 用户名 / 密码 | 不配置；按客户端证书身份认证 |
| CleanSession | `true` |
| Retain | 所有消息均 `false` |
| LWT | 不设置 |
| 连接数量 | 每台 EMS 一个连接；不要让测试客户端与正式程序使用相同 ClientID 同时连接 |

UUID 是永久身份，与 SN、站点名称、柜号不同。升级、重启、主从切换、换 IP 或证书续期不能重新生成 UUID。无需由 EMS 连接 PostgreSQL、ClickHouse 或 Kafka。

## 2. 交付文件与证书

交付目录包含：

| 文件 | 用途 |
| --- | --- |
| `README.md` | 本指引 |
| `CloudMqtt.conf` | 此站的连接配置；初始 `enabled=false`，核对完成后启用 |
| `ca.crt` | 验证云端服务器证书的 CA 公钥证书 |
| `client.crt` | 仅属于本 EMS UUID 的客户端证书 |
| `client.key` | 本 EMS 的私钥，务必仅交给该设备的授权部署人员 |
| `connection-verification.json` | 云端接入准备测试结果；不是 EMS 现场验收记录 |
| `SHA256SUMS` | 交付文件完整性校验清单 |
| `references/` | 协议原文、9 份完整 JSON 格式参考和冻结点位目录 |

客户端证书有效期（UTC）：2026-09-28 13:08:50 至 2027-09-28 13:08:50。其 SHA-256 指纹：

```text
14:22:DE:04:17:B6:B8:2E:A5:08:67:3E:FD:E3:A4:9F:7C:DC:F7:90:49:0F:56:E6:51:94:B1:79:7A:62:1B:6A
```

CA SHA-256 指纹：

```text
52:27:96:F9:FD:97:E3:4A:5C:F8:AA:46:CE:2C:FF:A3:57:80:4A:90:E1:A3:2A:6A:14:AC:E0:7F:BB:C2:63:6D
```

当前服务器证书到期日为 **2027-09-16**，云端须在此之前续期；客户端证书须在自身到期前更新。证书续期保留同一 UUID。EMS 时钟须准确，否则会出现“尚未生效/已过期”的 TLS 错误。

设备私钥不提交 Git、不放进日志、不复用到其他设备；通过双方认可的私密文件通道交付整个目录。包内不包含 CA 私钥、云端账户或云端服务私钥。

## 3. EMS 端安装与启用

### 3.1 核对固件和已有身份

EMS 程序应具备 V0.5 报文字段和 `ENABLE_CLOUD_MQTT=1` 构建能力；具体版本及构建由 EMS 开发人员确认。不要在运行中的储能控制系统上直接执行全量重编译。

先读取已有身份：

```sh
cat /var/lib/HYZHEMSV3/identity/ems-id
```

内容必须是 `4a8be161-7ee9-458f-b412-7d256e64eed9` 加换行。该 UUID 由本次接入提供，**不要再运行随机身份初始化来替换它**。若身份缺失、损坏或与此不符，先由 EMS 维护人员核实正式身份，按其受控初始化流程安装已分配身份；不要删除已有身份或自动覆盖。若实际设备属于另一个 UUID，应由双方重新登记和签发，不能只改 ClientID。

### 3.2 安装证书和配置

以下以 EMS 服务实际运行用户为 root 为例，在交付目录内执行；若服务是非 root 用户，请将目录/私钥拥有者设置为该有效运行用户，私钥仍为 0600。所有配置与证书路径须为绝对路径、无符号链接，且不允许组/其他用户写入。

```sh
sha256sum -c SHA256SUMS
install -d -m 0700 /etc/HYZHEMSV3/cloud
install -m 0644 ca.crt /etc/HYZHEMSV3/cloud/ca.crt
install -m 0644 client.crt /etc/HYZHEMSV3/cloud/client.crt
install -m 0600 client.key /etc/HYZHEMSV3/cloud/client.key
openssl verify -purpose sslclient -CAfile ca.crt client.crt
```

备份 `/etc/HYZHEMSV3/CloudMqtt.conf`，将以下键合并到现有文件；保留已有真实 `vendor_*` 配置，不要用空白模板覆盖厂家信息：

```ini
enabled=true
transport=tls
host=120.27.23.229
port=8884
ca_file=/etc/HYZHEMSV3/cloud/ca.crt
cert_file=/etc/HYZHEMSV3/cloud/client.crt
key_file=/etc/HYZHEMSV3/cloud/client.key
```

将配置文件设为 0600，并确保 EMS 运行用户可读取。出站网络需允许 TCP `120.27.23.229:8884`；不需要给 EMS 开放公网入站端口。不要配置 1883、8883 或使用明文降级，不要关闭 TLS 地址校验。

配置和证书不热加载。按现场维护窗口与 EMS 既有流程重启 `ems-app.service`，再查看其日志。本次云端准备未操作现场 EMS，也未验证现场程序是否允许安全重启。

## 4. 全部 Topic（精确名称）

不按柜创建 Topic。柜号通过报文 `c` 表达。只允许发布本机的六个上行 Topic，订阅本机的两个下行 Topic；不可使用通配符订阅其他设备。

| EMS 动作 | 完整 Topic | QoS | 负载 |
| --- | --- | --- | --- |
| 发布 | `ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/up/heartbeat` | 0 | 上线立即发，此后每 30 秒心跳 |
| 发布 | `ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/up/status` | 1 | `connected` / `disconnected` 辅助状态 |
| 发布 | `ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/up/response` | 1 | 云端查询的成功或失败响应 |
| 发布 | `ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/up/telemetry` | 普通/单体 0；结构 1 | `ems`、`cabinet_30s`、`cabinet_60s`、`cell_voltage`、`cell_temperature`、`structure` |
| 发布 | `ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/up/important` | 1 | `important_history`，只用于重要历史补传 |
| 发布 | `ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/up/alarm` | 1 | `alarm_event`、`alarm_current`、`alarm_data` |
| 订阅 | `ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/down/request` | 请求 1 | `structure.get`、`alarm.current.get` 等已约定只读请求 |
| 订阅 | `ems/v1/4a8be161-7ee9-458f-b412-7d256e64eed9/down/ack` | 请求 1 | 告警事件、关联数据、重要历史包的业务保存确认 |

## 5. 首次上线顺序

1. 完成 TLS 握手和 MQTT CONNECT，ClientID 使用永久 UUID。
2. 每次成功连接生成新的随机 UUIDv4 `connectionId`，同次连接保持不变。
3. 精确订阅两个下行 Topic，确认两项 SUBACK 都成功后才进入业务就绪。
4. 立即发送心跳，并按协议发送 `connected` 辅助状态；随后每 30 秒心跳。
5. 上报真实设备结构，并处理云端 `structure.get`。结构中的 `connectionId` 必须与当前心跳一致。
6. 恢复当前 EMS/柜级/单体数据，以及真实当前告警；公平安排已经保存的告警重试与历史补传。
7. 云端根据实际结构补齐机柜、设备及点位绑定，再共同验收页面。现有模拟资产不会自动成为真实设备映射。

心跳格式示例（`connectionId`、`uptimeSeconds` 必须由运行时产生，不能固定复制）：

```json
{"v":1,"emsId":"4a8be161-7ee9-458f-b412-7d256e64eed9","connectionId":"746bc054-9758-41cf-8ae2-cd788b286713","uptimeSeconds":120}
```

`uptimeSeconds` 是云通信线程运行秒数，不是系统开机秒数。心跳、status、response **不带 `type`**；其他业务报文按协议带 `type`。业务报文不擅自增加站点 ID 或重复身份字段；已有 `emsId` 字段必须与 Topic 一致。

云端连续 90 秒无新心跳判通信不可达，不等于电站停机。`status` 不能替代心跳。每次重连都重新双订阅、生成新 `connectionId` 并发当前快照；普通历史不积压重放。

## 6. 数据格式、周期和完整性

正文必须是紧凑 UTF-8 JSON，无 BOM、无重复键、无尾随内容。时间戳使用真实源 UTC 毫秒；无源时间按协议用 `null`，不要用发送时间刷新旧数据。

| `type` | 周期/触发 | 关键要求 | 正文上限 |
| --- | --- | --- | --- |
| `ems` | 每 60 秒，双订阅就绪后首发最新值 | `d.base` 含 6 个已知 EMS 点；`d.cfg` 含同一生效快照的 `rev` 和 173 项配置 | 65536 字节 |
| `cabinet_30s` | 每柜每 30 秒 | `c=1..30`；241 点，6 个设备块及 `d.link` | 65536 字节 |
| `cabinet_60s` | 每柜每 60 秒 | 54 点、6 个设备块，与 30 秒点表不混用 | 65536 字节 |
| `cell_voltage` / `cell_temperature` | 每柜每类每 60 秒 | `c`、`sv`、真实二维矩阵，须与当前可信结构一致 | 每条 65536 字节 |
| `structure` | 上线及快照变化 | `connectionId/seq/sv/d`，真实机柜、身份、厂家和布局 | 65536 字节 |
| `alarm_event` | 事件变化 | `alarmId/seq/device/code/level/state/ts/sv` | 65536 字节 |
| `alarm_current` | 变化/查询 | 当前连接、柜号、清单快照序号 | 65536 字节，查询响应含外层也适用 |
| `important_history` | 断线期间重要历史补传 | 固定 `taskId/part/parts`、每包最多 100 行 | 65536 字节 |
| `alarm_data` | 已实现并确认范围后启用 | 关联首次事件；首次事件 ACK 成功后发送 | 131072 字节 |

完整点号、分块、数组类型和报文见 `references/`。目前云端柜级普通帧按冻结目录校验，必须传完整 241/54 点；EMS 已知 6 点和配置 173 项同样不能只上传少数示例点。未知值使用 JSON `null`，不能删点凑容量。消防等点位按点表所属块发送，不另造 `up/fire` 等 Topic。

数值已经是工程值，不再次缩放；有效 0 保留。版本点为字符串或 null；点 20062 为源顺序四个 U16 整数数组或整体 null，不能压成浮点/64 位数字。`q=valid/stale/invalid` 仅描述数据质量。保留缺失单体的位置，整组无效使用 `values=null,q=invalid`；不得伪造全零矩阵。

`cfg.rev`、`sv`、`connectionId+seq` 分别表示配置版本、结构版本、连接内快照顺序。相同快照序号必须对应相同内容。当前告警 `alarms=null` 表示未知，`alarms=[]` 才表示已确认无活动告警。结构中的未知列表 null 与已确认无安装的空数组也不同。

参考 JSON 全部为合成格式样例，不能直接发布到合肥站。特别是原结构示例与原单体示例的 BMU 尺寸不一致，不能成套当作现场数据；须按真实设备生成彼此一致的 `sv` 和矩阵。没有实现的能力反馈未实现，不制造成功报文。参数 30115 等目录项不等于允许写入的控制命令。

## 7. 下行查询与响应

当前只读操作为 `structure.get`（`params={}`）和 `alarm.current.get`（`params={"c":实际柜号}`）。参数写入、启停、功率控制、复位和 XML 下发尚未开放，不自行扩展 op。

以下查询由云端在 `down/request` 发出，字段必须使用本次真实值：

```json
{"v":1,"emsId":"4a8be161-7ee9-458f-b412-7d256e64eed9","connectionId":"746bc054-9758-41cf-8ae2-cd788b286713","id":"86b37ef7-828f-4c52-b178-6952685c7618","op":"structure.get","expiresAtMs":1790601000000,"params":{}}
```

上例时间仅演示字段；云端实际使用有效截止时间（通常发起后 30 秒）。EMS 按“格式/身份 → 当前连接 → 截止时间 → 幂等 → 业务”检查，当前时间等于截止时间也算过期。只读时钟异常例外和队列等待上限按原协议 §4 处理。每连接最多 32 条受理缓存、保留 60 秒；同 ID 同内容回原结果，同 ID 不同内容报错，不重复执行。

在 `up/response` 返回同一 `id`：成功为 `{"v":1,"emsId":"…","id":"…","ok":true,"data":完整structure或alarm_current对象}`，其中省略号必须替换为实际值；`data` 不能是字符串或只返回局部字段。失败示例：

```json
{"v":1,"emsId":"4a8be161-7ee9-458f-b412-7d256e64eed9","id":"86b37ef7-828f-4c52-b178-6952685c7618","ok":false,"error":{"code":"DATA_UNAVAILABLE","message":"Structure is not available"}}
```

失败响应不带 `data`，成功响应不带 `error`。未能取得真实数据时返回明确失败，不拿默认结构或空清单冒充实际结果。结构查询成功响应含外层最多 65536 字节，下行请求最多 4096 字节。

## 8. 业务 ACK 与补传

只有以下对象等待 `down/ack`，成功格式如下（UUID/序号均匹配原对象）：

```json
{"v":1,"type":"alarm_event","alarmId":"9eeb2c93-0d74-4bda-9186-e47e6ae199fb","seq":1}
{"v":1,"type":"alarm_data","alarmId":"9eeb2c93-0d74-4bda-9186-e47e6ae199fb","seq":null}
{"v":1,"type":"important_history","taskId":"41e7de04-f361-4790-9d61-7d5e1aa6674c","part":1}
```

三行是三个独立 JSON 对象示例，不是一个消息。成功 ACK 不含 `ok`、`connectionId`。失败在相应对象字段上增加 `"error":"busy"` 或 `"error":"rejected"`。收到匹配成功 ACK 才推进对象进度；MQTT PUBACK 只证明 Broker 收包，不能替代业务 ACK。

未确认重试须保持对象身份与完整内容；同身份同内容可重新确认，不同内容视为冲突。发送成功通知起等待 10 秒，最多追加 3 次（共 4 次），之后暂停 60 秒；busy 暂停 60 秒，rejected 暂停待修正。不对 ACK 再发业务 ACK。

普通数据、结构、单体、心跳、当前告警清单不等待业务 ACK。重要历史每台 EMS 跨柜一次只等待一包，最多 5 包/秒且 16 KiB/秒，重试也计入限额；固定选数、taskId、分包及 parts，不能因重启重新拼成不同内容。当前 EMS 固件对告警持久化、alarm_data 和 SSD 补传的实际支持须逐项确认，不能承诺尚未验证的断电不丢数据。

## 9. 分阶段联调与故障定位

| 阶段 | EMS 提供/操作 | 云端核对 | 通过条件 |
| --- | --- | --- | --- |
| 连接 | 固件版本、准确时钟、身份、证书与配置 | CN/ClientID、双订阅 | 登录和两个精确订阅成功 |
| 在线 | 立即心跳及连续 30 秒周期 | 当前连接和最近心跳 | 合肥站可观察在线；断开超过 90 秒转不可达 |
| 结构 | 真实柜号、设备、布局、SN/版本与 structure | 快照及设备/点位映射 | 查询响应和主动推送一致；无虚构身份 |
| 数据 | 真实完整 EMS/30s/60s/单体帧 | 入库、单位、实时值和历史页面 | EMS 本地与云端值/时间/质量逐项相符 |
| 告警/补传 | 在约定隔离条件下验证事件和固定历史包 | 业务 ACK、去重、当前清单与关联 | 重复不增业务记录，失败不误确认；现场真实告警不可人为触发危险动作 |
| 稳定性 | 按现场许可执行断网重连与运行观察 | 旧连接隔离、恢复、延迟 | 完成双方记录的验收后再宣布正式接入 |

常见定位：TCP 超时先查 EMS 出站网络；TLS 失败核对系统时钟、CA、证书/私钥匹配、IP SAN；MQTT 拒绝核对 3.1.1 与 CN=ClientID；订阅失败核对 UUID 和精确 Topic；有连接却不在线核对双订阅后是否真正发心跳。数据拒绝核对 JSON 类型、完整点表、容量、当前结构 sv 及设备映射。不要通过关闭证书校验或伪造数据掩盖错误。

给云端的联调反馈至少包含：固件版本/commit、UTC 时间、EMS UUID、connectionId、实际 Topic、QoS/retain、脱敏后的原始报文、错误日志以及真实柜数与 BMU 布局；不附私钥。测点精确单位、厂家枚举和未知点映射仍需双方确认。

## 10. 本次云端准备结果

- 已登记本 UUID → 合肥站，并签发设备专用客户端证书。
- 已配置六上行发布、两下行订阅的精确 ACL；其他既有权限保留。
- 已从开发电脑通过公网 `120.27.23.229:8884` 完成 TLS 1.3、服务端身份校验、MQTT 3.1.1 登录和两项 QoS 1 SUBACK 验证。
- 准备测试没有发布心跳、遥测或告警，因此不代表真实 EMS 已上线，也不代表数据入库/现场验收完成。
- 接下来由 EMS 侧安装证书配置、核对固件并发起真实连接；云端根据真实结构完成设备点位映射及联合验收。
