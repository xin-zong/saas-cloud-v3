# 隔离开发库参考站点导入

仅在 `develop-toyingzhen` 分支、`127.0.0.1:15435` 隧道、`ems_cloud_saas_toyingzhen` 数据库及 `ems_toyingzhen_owner` 账号运行。工具不访问参考网站；输入来自人工只读采集，原始文件须留在忽略目录。

先通过 `scripts/migrate-toyingzhen.py --through 32` 预演，按该迁移工具流程显式 `--apply` 应用 V32。V32 使用项目已有 `schema_migration` 记录，不运行 `database/apply.sql`。V32 只创建 `station_profile` 基础资料和 `station_reference_import` 来源映射表，不改变原有站点约束。

```powershell
python scripts/import-reference-stations.py --input .local-tools/implementation/reference-stations-20261016.json --tenant-id 2 --manager-id 2
```

默认设置数据库事务为只读，仅预览。显式增加 `--apply` 后，全批站点、资料和来源映射在单个事务中提交；任何校验或写入失败都会回滚整批。实施前按隔离库流程备份，实施报告输出保存在忽略目录用于批次审计。

输入 JSON 顶层字段为 `sourceHost`（固定 `ess-cloud-login.qudeox.com`）、带时区的 `capturedAt`、非空 `stations` 数组。每站必填 `sourceId`、`name`、`assetType`（BESS/PV/Wind/Hybrid/Diesel）、真实正数 `ratedPowerKw`、`capacityKwh`；可选 `region`、`address`、`longitude`、`latitude`、`raw`、`profile`。不能以假正数代替未知容量；缺少必填资料会中止导入。

`profile` 可选 `timezone`、`solarCapacityKw`、`gridConnectionDate`、`commissionedOn`、`country`、`province`、`city`、`postcode`、`details`。日期使用 YYYY-MM-DD；未知值留空或 null；光伏容量可为零。其余 profile 属性并入 `details` 对象。`raw` 与整个原始站点对象均保存到 provenance，不用于生成遥测、设备或采集配置。

来源 host 和稳定 sourceId 决定本地站点唯一代码，映射表保存独立内部 ID；同一来源数据重复导入无变化，内容改变只更新此前映射归属的站点和资料。代码碰撞不会自动接管既有站点，不按名称匹配，不删除任何原始站点。内容 hash 不包含顶层采集时间，原始额外字段参与 hash。来源映射只保存最近一次有内容变化的证据；它不是完整历史审计，不自动伪造业务操作人或插入用户审计事件。批次报告由执行者保存在私有目录。

目标 manager 必须是目标企业当前有效管理员且具备 Web `asset.read` 能力；沿用现有租户与权限视图，不创建用户、角色或额外授权。当前隔离测试企业管理员为 user ID 2、tenant ID 2。已有映射不允许改租户；更新时保留本地 manager，避免覆盖人工责任人调整。

运行测试：`python -m unittest discover -s scripts/tests`。测试使用外部数据库替身，不访问或修改任何数据库；真实导入后的数据核验由执行者在隔离库完成。

## 设备清单

设备需要先应用V33（`scripts/migrate-toyingzhen.py --through 33`，备份后再显式`--apply`）。使用 `scripts/import-reference-devices.py --input <私有JSON> --tenant-id 2 --manager-id 2` 默认只读预演，追加`--apply`单事务导入。JSON顶层sourceHost/capturedAt规则同站点，devices数组每项含stationSourceId、type、name、sourceId或serialNumber，以及可选category/manufacturer/model/ratedPowerKw/capacityKwh/raw。未知参数null，不创建假型号，不生成采集连接、实时状态或控制命令。稳定源ID不可见时以type+SN识别；拒绝跨站重归属、SN碰撞或收养未映射设备。

站点更新与业务容量写入共用锁；已存在运行计划或市场分配的站点禁止通过导入降低额定功率。具体迁入结果与未完成范围见 `docs/superpowers/verification/2026-10-16-reference-data-import.md`。
