# 独立验收环境邮件接通

仅适用于 `ems-cloud-toyingzhen-api.service`、18086 前端及 `ems_cloud_saas_toyingzhen`。不得修改原服务、原库、现有加密密钥或公开访问地址。

默认不配置 SMTP，入驻申请和申请进度的邮箱验证会明确显示不可用。`GET /api/public/environments` 的 `mailAvailable`、`registrationAvailable` 表示配置是否齐备，不代表供应商已经接收邮件，更不代表收件箱送达。

## 私有配置

凭据仅放入 `/etc/ems-cloud-toyingzhen/runtime.env` 的私有文件，不放聊天、前端、Git 或日志。配置变更不由构建脚本自动执行。保持文件 root 所有、权限 0600，先验证独立部署保护条件和队列数量，再由明确授权的操作应用。

可选邮件配置必须整组提供；完全不提供时兼容现有禁用模式：

- `SPRING_MAIL_HOST`：SMTP 主机名，不带协议、路径或凭据。
- `SPRING_MAIL_PORT`：供应商提供的端口。
- `SPRING_MAIL_USERNAME`、`SPRING_MAIL_PASSWORD`：SMTP 用户名、应用授权密码。
- `EMS_TENANT_MAIL_FROM`：供应商授权的发件邮箱。
- `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true`。
- `SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY=true`。
- STARTTLS：`SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true`、`SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_REQUIRED=true`、`SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE=false`。
- 或隐式 TLS：上述三个值依次为 `false`、`false`、`true`。
- 可选 `EMS_MAIL_HELO`：合法主机名。

部署验证只允许这组已知邮件键，拒绝任意 Spring 属性、明文认证、可选降级 STARTTLS、关闭服务端身份校验或改变隔离库和访问地址。不会开放 `ssl.trust=*`。当前私有文件按受限直写格式读取；包含引号、反斜杠、换行或首尾空白的值应先采用经过审查的配置序列化方案，不能手工拼接 shell 命令绕过校验。

## 请求与状态

- 发送验证码返回 `challengeId`、`mailStatus=pending`、`expiresInSeconds=600`、`resendAfterSeconds=60`。入队不等于投递成功。
- `POST /api/public/registration/email-challenges/status` 接受当前 `challengeId` 与邮箱，只返回 `mailStatus`、`expiresAt`，不返回验证码、验证上下文、邮件载荷或供应商错误。邮箱不匹配和请求不存在统一返回 404。
- 状态为 `pending`、`sending`、`sent`、`failed`、`cancelled` 或 `expired`。`sent` 仅表示 SMTP 提交成功；系统未接入供应商投递回执。
- 服务器按邮箱通过事务级数据库锁执行 60 秒重发间隔；旧的未验证验证码失效，已验证上下文保留原有效期。现有 10 分钟邮箱/IP 限流、验证码最多 5 次尝试继续生效。
- 单体进程的 IP/邮箱计数器仍是进程内限流；跨进程重发间隔由数据库保证。验证码成功验证后的申请上下文仍沿用原始 10 分钟到期时间，超时需重新验证。

队列每 5 秒运行，最多尝试 5 次并退避重试。投递前重新核验验证码及激活链接是否过期、撤销、使用或不再适用；失效邮件转为 `cancelled`。SMTP 提交与数据库状态确认不能组成同一事务，进程在提交后崩溃仍可能重复投递，不能承诺恰好一次送达。

独立 Nginx 覆盖客户端传入的 `X-Forwarded-For`，API 只信任本机回环反向代理，避免所有用户共享 127.0.0.1 限流桶；不得放宽为信任任意来源的转发头。

## 验证边界

单元测试使用模拟 SMTP，不向外发信。真实投递验收需在用户提供供应商配置、指定收件地址后单独执行，并区分入队、SMTP 接受和用户实际收信三个结果。未取得真实供应商配置前，保留“邮件未配置”，不绕过邮箱验证，也不制造投递成功。
