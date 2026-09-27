# V11 接入模型迁移验证

仅执行于新业务库 `ems_cloud_v2_proto`。代码：`a2257d4`、修正 `ffb1c4a`。

迁移 SHA256：`96e940fb49e2844dded36086e68513853eab453f6860cd0c0afbb01b155af4a9`。

- 独立 PostgreSQL schema 执行 V1—V11：5 个测试方法、47 个约束拒绝场景，全部通过并回滚；权限目录 5 项测试通过。
- 两轮审查后修正服务权限、失败响应保存和换站版本复用。版本内容与各站点接收采用记录分开；BMU 物理归属复用有效期绑定，不复制到布局。
- 完整 `database/apply.sql` 在 public 事务中预演，切换真实 worker/API 角色验证写入和拒绝边界，最后回滚。测试资产未持久化；正常 identity 序列可能留下间隔。
- 正式执行从版本 10 升至 11，再次运行结果一致。站点 2、设备 26、测点 258、客户 0、告警 30 的行数保持不变；权限增加 3 项、超级管理员关联增加 3 项。详情见 [前后验证](verification.json) 和 [权限核验](privileges.json)。
- Worker 可写接入布局、版本采用记录和查询，不能更新业务资产。API 可读状态汇总和心跳指定列，不能读原始可靠对象、ACK outbox 或 fencing token。
- 目前注册 EMS 数量为 0。未绑定实机、未部署 worker，本记录不能作为 EMS 接入或上下行联调完成证据。

迁移前备份位于服务器 `/var/backups/ems-cloud-v3/ems_cloud_v2_proto-pre-v11-20260927T164411Z.dump`，0600 root，287653 字节，SHA256 `353657659b9a38ce0e5ec14364724b80b315aa0ec0f8a5b5b091addb5141daee`。已验证 pg_restore 目录可读取，未声称完成全库恢复演练。

运行日志：[首次执行](apply-first.txt)、[幂等重跑](apply-second.txt)。凭据和备份内容没有进入 Git。

下游事务仍须遵守迁移中的每 EMS 锁顺序、提交后 ACK、用户查询重查权限，以及自动只读查询的有效绑定和租约校验。数据库测试不能替代这些服务行为验证。
