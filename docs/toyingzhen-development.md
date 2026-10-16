# develop-toyingzhen 独立开发环境

本分支的程序和后续数据库结构改造统一使用云端 PostgreSQL `ems_cloud_saas_toyingzhen`。2026-10-16 从 `ems_cloud_saas_v3` 的一致性快照完整复制；不切换线上 API 或采集配置。

## 数据与权限

- 专用登录角色 `ems_toyingzhen_owner` 拥有新库对象，可在新库做 DDL/DML；无超级用户、建库、创建角色或复制权限。
- PostgreSQL 为该新角色增加独立 HBA 规则：只允许连接新库，拒绝连接其他库。未变更原库表数据和权限，未停止源库连接。
- 恢复未复制原库角色 ACL，避免生产运行角色获得新库写权限。业务数据、密码哈希、MFA 数据保留源快照内容，不重置测试账号密码。
- 云端私有配置：`/etc/ems-cloud-toyingzhen/database.env`（0600）；完整核对记录：同目录 `clone-report.json`。本机 API 私有配置为 `ems-cloud-api/.env`，前端为 `ems-cloud-ui/.env.local`，均被 Git 忽略。
- ClickHouse 未复制，API 使用既有只读身份查询历史。新库没有生产采集器持续写入，因此采集状态是复制时的快照。不要运行共用生产 MQTT/Kafka 消费组的本分支采集服务；若后续需要采集写入，先配置独立消息链路及遥测库。

## 本机启动

在工作区根目录打开独立终端：

```powershell
./scripts/start-toyingzhen-tunnel.ps1
```

隧道绑定本机回环地址：PG `15435 -> 5432`、ClickHouse `18126 -> 18123`。不要复用旧工作区的环境文件和 15434 端口配置。

构建 API 后启动（Maven 可使用本机已安装版本或 `ems-cloud-api/mvnw.ps1`）：

```powershell
mvn -pl ems-cloud-api -am package -DskipTests
./ems-cloud-api/scripts/start-local.ps1 -RuntimeEnvFile ./ems-cloud-api/.env
```

API 绑定 `127.0.0.1:18091`。启动脚本校验库名、专用账号及连接地址；数据库守卫检查有效 JDBC 配置，默认仅接受新库。配置错误时中止，不回退原库。

前端使用当前工作区 `.env.local` 指向 `http://127.0.0.1:18091/api`，在 `ems-cloud-ui` 运行 `pnpm dev --host 127.0.0.1 --port 8444 --strictPort`。

## 后续结构改造

新增迁移文件到 `ems-cloud-api/src/main/resources/db/migration/`，沿用新库 `schema_migration` 已应用版本向后递增。迁移前备份新库；事务内先校验 `current_database() = 'ems_cloud_saas_toyingzhen'`，成功后记录版本。Flyway 自动迁移保持关闭。

不要执行历史 `ems-cloud-api/database/apply.sql`：该脚本针对旧库，包含已经退役的实体和生产角色授权。不要运行旧生产部署或切库脚本。

## 初次复制验证

- 导出的同一只读快照用于 `pg_dump` 和逐表数据指纹；恢复后全部 100 张表的行数及排序行哈希一致，共 4,149 行。
- 恢复后有 488 个约束、178 个索引、45 个序列；新账号建表、插入、回滚通过，连接源库被 HBA 拒绝。
- 源库和恢复库的结构导出一致（排除独立所有者/ACL，并规范化 PostgreSQL 恢复后等价的数组类型转换写法）；45 个序列的 `last_value`、`is_called` 与备份中的设置全部一致。迁移记录 V1—V25 保留。
- 复制完成时线上 API/采集 PID、启动时间和环境文件列表未变。
- 一致性源备份：`/var/lib/postgresql/ems_cloud_saas_toyingzhen-source-20261015T161719Z.dump`。时间戳为 UTC，北京时间为 2026-10-16。
- API Maven 回归：137 项，96 执行通过、41 条件跳过、0 失败；协议模块 26 项通过。数据库守卫包含 10 项测试，验证新库接入和误连旧库时的拒绝行为。
- 本机 `18091/api/health` 返回 `UP`；云端 `pg_stat_activity` 确认本机 API 的 10 个 JDBC 连接全部位于新库、使用专用角色。线上健康检查返回 `UP`，API/采集进程及启动时间复核未变。

## 新功能迁移与验收

迁移工具为 `scripts/migrate-toyingzhen.py`，依赖见 `scripts/requirements-toyingzhen.txt`。默认预演，例如 `python scripts/migrate-toyingzhen.py --through 29`；在新库备份完成后才显式加 `--apply`。工具核验当前分支、私有环境配置和实时数据库/角色，逐版本事务执行，拒绝缺失或异常迁移记录，不执行历史生产授权脚本。

当前已验收迁移为V26—V29，涵盖站点标签、个人看板模板、年度月计划及站点空间/设备关联。详细测试和待办见 `docs/superpowers/verification/2026-10-16-known-reference-features.md` 与 `docs/reference-platform/implementation-ledger.json`。报表模板V30正在实施，尚未列为已验收。
