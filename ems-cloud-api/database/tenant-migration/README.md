# 租户权限迁移

此目录是 V19—V25 新权限模型的显式切换工具，默认只读预检。旧 V6—V9 组织权限手册是历史资料，不能用于当前租户切换。

- `preflight.py` 检查完整归属、唯一邮箱、受保护管理员；缺少映射立即停止。
- `ownership-map.example.json` 是本次经确认的四账号、三站点映射。源库变化时必须重新核对，不能自行把新增站点分配给管理员。
- `seed.py` 保留已有用户 ID、密码哈希、MFA；建立平台/演示企业、四套餐、预制角色和覆盖角色的新增账号。只有新增账号使用私下提供的 BCrypt 哈希。
- `migrate.py` 先备份，逐版本事务迁移，事务种子回填，再核对所有原资源 ID 和密码指纹。拒绝对已扩展库重放种子。
- `verify.sql` 只输出计数和约束检查，不输出密码、验证码或激活链接。
- `tests/http_acceptance.py` 仅允许本机 18092 的隔离测试 API，会写明确标记的测试企业、邀请、角色、授权和报告任务。使用本机 SMTP 收件箱，不向外发信。

## 运行

Python 需要 `paramiko`；新增测试账号的密码哈希由安全环境设置 `EMS_TENANT_SEED_PASSWORD_HASH`，SSH 密码使用 `EMS_SSH_PASSWORD`。不要写入仓库或命令输出。源库先复制为新的目标库，停止向目标库写入的 API/EMS 服务后执行：

```powershell
python migrate.py --database ems_cloud_saas_refactor_test --mapping ownership-map.example.json --report migration-report.json
# 上一步只读预检。确认数据库、映射、目标写入已停止后才加 --apply。
python migrate.py --database ems_cloud_saas_refactor_test --mapping ownership-map.example.json --report migration-report.json --apply
```

允许隔离库名 `ems_cloud_saas_*_test`。正式目标只允许新库 `ems_cloud_saas_v3`，并且必须加 `--confirmed-live-cutover`。此标志不等于用户验收通过，部署人员仍须遵守验收条件。

SQL 约束和能力测试在 `../tests/tenant_schema.sql`、`../tests/tenant_permissions.sql`，必须使用一次性数据库，测试事务回滚；identity 序列不保证回滚。

真实 HTTP 测试通过 `EMS_TENANT_TEST_SECRETS_FILE` 指定私有 JSON（`password` 字段），`EMS_TENANT_TEST_MAILBOX` 指定仅本机 SMTP sink 的 JSON，`EMS_TENANT_TEST_REPORT` 指定非敏感结果文件。真实外部 SMTP 投递需要另外配置，不能把本机收件箱成功当成外部邮件送达。

恢复步骤见 [rollback.md](rollback.md)，发布和运行配置见 [权限重构切换说明](../../../docs/tenant-permission-cutover.md)。


HTTP 回归通过后，可用同一报告运行 `tests/prepare_business_fixture.py`，仅在固定隔离重构库给验收企业 B 新增站点，不追加角色站点授权；再运行 `tests/two_tenant_business_acceptance.py` 验证管理员未来站点覆盖、双向隔离和跨企业只读边界。准备程序校验测试企业邮箱/名称及数据库，不支持正式数据库目标。
