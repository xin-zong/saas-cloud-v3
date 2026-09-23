# EMS Cloud API

基于 RuoYi-Vue-Plus 5.6.2 的依赖与基础代码约定进行选择性裁剪适配，使用 Java 21 / Spring Boot / Sa-Token / JDBC。不是完整若依后台的换名副本。保留现有 React 原型；上游来源与许可证见 `docs/upstream.md`、`LICENSE.ruoyi`。

## 数据库

本项目只能使用两个新库：

- PostgreSQL：`ems_cloud_v2_proto`，业务主数据和状态，专用运行账号 `ems_proto_app`。
- ClickHouse：`ems_cloud_v2_proto_telemetry`，测点时间序列，运行账号 `ems_proto_reader` 只读。

旧库未执行任何迁移或写操作。API 配置、SQL 迁移和约束测试均拒绝其他业务库名称。服务器的既有 PostgreSQL 监听设置没有更改，ClickHouse 没有对外开放。

服务端运行配置位于 `/etc/ems-cloud-v2-proto/runtime.env`，权限 0600，仅包含本项目运行身份。源码不保存密码。不要把该文件复制进源码目录或上传版本库。

## 本地运行

1. Java 21 已安装时，在本目录运行 `./mvnw.ps1 clean package`。脚本将校验并下载项目内 Maven，不修改系统配置。
2. 在独立终端建立 SSH 隧道（SSH 自行提示认证）：

```powershell
ssh -N -o ServerAliveInterval=30 -L 15434:127.0.0.1:5432 -L 18125:127.0.0.1:18123 root@120.27.23.229
```

3. 将服务器运行配置安全取得到源码目录以外的位置，然后启动：

```powershell
./scripts/start-local.ps1 -RuntimeEnvFile C:/path-outside-repository/runtime.env
```

API 默认仅绑定 `127.0.0.1:18090`。服务器现有默认 Java 为 17，不能直接运行本项目 Java 21 包；当前采用本地 Java 21 + SSH 隧道联调，尚未安装云端 API 服务。

前端位于相邻 `ems-cloud-ui`，真实 API 模式使用 `VITE_API_BASE_URL=http://127.0.0.1:18090/api`。显式 `VITE_DATA_MODE=demo` 才使用原前端演示模式。具体前端覆盖以 `docs/frontend-report.md` 为准。

在另一个终端启动前端（API 模式）：

```powershell
cd ../ems-cloud-ui
$env:VITE_DATA_MODE='api'
$env:VITE_API_BASE_URL='http://127.0.0.1:18090/api'
pnpm dev --host 127.0.0.1 --port 8443 --strictPort
```

访问 `http://127.0.0.1:8443`。保留 SSH、API、前端三个进程；端口已在使用时先检查现有服务，避免启动重复实例。新增页面覆盖与验收见 `docs/page-completion-audit.md`。重打包前先停止正在使用旧 jar 的本地 API。

## 初始化和迁移

服务器新库已建立。`database/apply.sql` 使用事务、咨询锁和版本表 `schema_migration`，可重跑；V1–V5 已应用，已应用迁移文件不可修改，后续从 V6 开始新增。Flyway 自动运行关闭，避免两个迁移系统重复建表。

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d ems_cloud_v2_proto -f database/apply.sql
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d ems_cloud_v2_proto -f database/tests/constraints.sql
```

ClickHouse 的 `database/clickhouse/V1__telemetry.sql` 仅首次执行；重跑前检查表结构。运行用户不能写遥测。不存在 EMS 上报接口。重复采样按明确递增 revision 修正，查询使用 FINAL 后聚合。

新库中提供两个明确标记“原型验证”的站点、三个测试角色账号：`owner@prototype.local`、`operator@prototype.local`、`integrator@prototype.local`。随机生成的初始密码保存在服务器 `/etc/ems-cloud-v2-proto/bootstrap.env`（0600），不使用前端固定演示密码。未植入真实遥测和收益数据；空数据显示为空。

审批权限不自动赋予三个默认角色。TOTP 支持已配置账号的验证和防重放，绑定入口仍需完善；未配置账号不显示固定验证码假验证。单实例会话保存在内存，重启后需重新登录。

## 验证

```powershell
./mvnw.ps1 test
# 先由安全环境设置 EMS_TEST_PASSWORD（测试账号密码），不要写入脚本
python database/tests/api_integration.py
```

集成脚本针对新库原型样例执行真实写入：创建有 integration 标记的工单、计划、设置并确认样例告警。不会连接旧库。数据库约束脚本在事务结束回滚测试行；identity 序列递增不回滚。

## 业务边界

API 当前提供认证、资产查询/编辑、测点曲线、告警确认/备注、工单分派与流转、巡检、内部计划与审批、电价、市场草稿/记录、结算记录/复核、CSV 报告、成员授权和个人设置等接口。每个接口仍须按前端覆盖清单逐项联调；接口存在不等于整页功能验收完成。

不执行新站接入、EMS/SCADA 协议、设备控制、固件执行、外部市场交易或付款。固件记录只读，计划审批不代表设备执行成功。CSV 报告是底层记录导出，不冒充完整分析报告。审计查询当前限本人事件，不提供跨站组织审计。数据库设计与限制见 `docs/database.md`。
