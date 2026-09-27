# MQTT 专用监听器实施前核查

日期：2026-09-28。此记录为源码和配置核查，不代表已修改或验收 broker。

- 专用服务 `chuneng-v03-mosquitto.service` 在 8883，1883 旧匿名服务不在修改范围。
- 配置 `/etc/chuneng-cloud-v2/mosquitto-v03/mosquitto.conf` 仍包含旧 HTTP bridge 插件及 synthetic site/tenant 指向 18081。新订阅 worker 上线时必须移除该旧转发路径；对应 `/usr/libexec/chuneng-v03-mosquitto-preflight` 也引用旧插件和 proof key，须同步更新并保留恢复配置。
- 已安装 Mosquitto 开发头文件提供 `mosquitto_client_certificate`、`mosquitto_client_id`、`mosquitto_set_username`。证书返回的 X509 必须释放。
- Mosquitto 2.0.18 的 CONNECT 源码在 `use_identity_as_username=true` 时跳过 basic-auth 插件。因此单纯添加 BASIC_AUTH 回调同时保留原选项不能验证 ClientID；不能以 ACL 拒绝发布代替 CONNECT 身份拒绝。
- 拟在独立临时监听器先验证：保持 require_certificate，关闭 username-as-clientid 重写与 identity-as-username 捷径；basic-auth 插件读取经 TLS 验证的证书 CN，严格比较原 ClientID，拒绝缺失/重复/非法 CN 和不匹配身份，然后将内部 username 设置为受信 CN，供 ACL 使用。设备 UUID 与专用云身份分开处理。不得依赖客户端自报用户名。
- 验证需涵盖有效设备与云证书、无证书/错误 CA、错误 ClientID、伪造 MQTT username、跨 EMS Topic、上下行方向、131072 字节正文与总包限额；先在隔离监听器通过，再切换 8883。
- 现存证书/CA 私钥只留服务器受管目录；本次只核查文件权限和公开 API，没有下载或输出秘密。

依据：[官方 CONNECT 源码（v2.0.18）](https://raw.githubusercontent.com/eclipse-mosquitto/mosquitto/v2.0.18/src/handle_connect.c)、[官方插件 API](https://mosquitto.org/api/files/mosquitto_broker-h.html)。上述插件行为仍需在实际安装版本做运行验证。
