# SaaS 权限重构：验收与发布

用户要求先完成前后端并本地验收，通过后才部署云端。用户已确认，2026-10-15 完成 main 推送及云端 18085 更新，使用新库 `ems_cloud_saas_v3`，原业务库保留。本文件保留切换约束与配置说明；实际版本、备份和验证结果见 [云端发布记录](superpowers/verification/2026-10-15-cloud-saas-release.md)。

## 本次实现

企业独立租户；预制角色动态引用；本企业自定义角色；逐角色授权绑定站点及有效期；企业管理员覆盖本企业现有和未来站点；平台跨企业业务读写需要显式权限。所有业务列表、详情、历史测点、报告/分析任务下载和实时订阅执行资源权限校验。菜单控制入口，不能创造不存在的 API 权限。

企业邮箱验证申请、审批/拒绝/进度、管理员和员工一次性激活、重发失效、员工移交与保护管理员、权限包/菜单/模板启停影响、标签、个人资料与密码、Web/App 授权独立、权限变更通知均已接入。旧客户和组织页面/API/表已在新模型退休，旧 URL 返回 410。

## 本地环境

- 前端 `http://127.0.0.1:8447/`，API `http://127.0.0.1:18092/api`。
- PostgreSQL 使用干净验收副本 `ems_cloud_saas_final_test`（真实写入回归使用另一个 `ems_cloud_saas_refactor_test`）；源库 `ems_cloud_v2_proto` 保持原样。
- 原四个 `@prototype.local` 账号、密码、MFA 保留。新增覆盖账号：platform-admin、platform-approval、platform-support、installer、viewer，后缀均为 `@prototype.local`。新增账号密码由私有初始化配置提供，不写入文档。
- 普通原账号和三站点归演示企业；superadmin 归平台，owner 为企业受保护管理员，operator 为 Engineer，integrator 为 Admin。
- 邮件验证使用本机 SMTP sink。此处已经验证真实 SMTP 协议和邮件队列，但没有发送任何外部邮件。验收新申请/邀请时从本机测试收件箱读取邮件，不使用固定验证码。

## 正式发布准备

用户确认本地通过后，备份并把当前真实源数据复制到新库 `ems_cloud_saas_v3`，重新核对完整映射。停止目标库写入后执行 [迁移工具](../ems-cloud-api/database/tenant-migration/README.md)。不能将含验收样本的测试库直接作为正式库。

API/EMS 入库服务必须同时指向新 PostgreSQL 库。ClickHouse 数据与资源 ID 保留，核对实时、历史与映射后恢复入库。权限变更不改变 EMS UUID、测点 ID、绑定时段；不复制或重造遥测历史。

API 必须配置：

- `EMS_DATABASE_NAME=ems_cloud_saas_v3`，匹配的 `EMS_DB_URL`、受限数据库运行身份；保持既有 CH 配置。
- `EMS_TENANT_PUBLIC_URL` 为用户实际访问的前端地址（发布端口 18085），不要使用本地 8447。激活链接只允许配置的受信任地址。
- `EMS_TENANT_MAIL_FROM`、Spring Mail 标准 `SPRING_MAIL_HOST/PORT/USERNAME/PASSWORD`，并按供应商配置 STARTTLS/SSL。`EMS_MAIL_HELO` 可设有效主机名。未配置 SMTP 时申请/邀请接口明确返回不可用，不能显示发送成功。
- 保持原 `EMS_MFA_ENCRYPTION_KEY`，否则旧 TOTP 和新加密税号/邮件载荷不能解密。不得把密钥放入前端或 Git。
- `EMS_TENANT_DATACENTER` 标识当前数据中心。未部署的环境必须显示不可用，不伪装跳转成功。
- 前端 `VITE_API_BASE_URL`、`VITE_GOOGLE_MAPS_API_KEY` 及 Google Places API 和生产域名限制，延续现有 Google 图层配置。地图不可用时保留可编辑的注册四级地址，不伪造定位成功。
- 反向代理 SSE 路由关闭缓冲并允许长连接，正常 API 保持同源/明确 CORS 来源。

执行数据库 `verify.sql`、代表角色登录、双企业隔离、原账号密码/MFA、三个原站点实时/历史/趋势、下载撤权、SMTP 投递/重发和前端入口烟测后，才替换 18085 前端资源。回退见 [恢复手册](../ems-cloud-api/database/tenant-migration/rollback.md)。
