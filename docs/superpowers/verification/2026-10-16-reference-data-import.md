# 参考基础数据迁入验收（2026-10-16）

## 结果与未完成范围

本次补齐此前遗漏的参考账号可见站点与设备基础数据。唯一目标 `ems_cloud_saas_toyingzhen`，已应用 V32/V33。新增7站、48设备，原3站保留，站点总数10。此处计数来自真实新库和API，不是UI mock。

仅迁入基础档案与设备所属关系；历史采样、告警、收益/结算、电价、报告业务数据未在本批迁移，实时采集与控制也未接入。原功能全量待办继续有效，不能将本批视为完整平台复刻。设备无观测记录，UI通信/功率/SOC等保持未知或空态。

## 真实执行与证据

- 8444进程命令为隔离工作树内Vite，分支 `develop-toyingzhen`，`VITE_API_BASE_URL=http://127.0.0.1:18091/api`。最终UI PID35624/API PID33072；原18090 API PID4896保持运行。
- 参考平台只读读取当前登录账号的站点列表及7份Site info。设备逐类别完整第一页：Inverter7、PCS6、Battery Cluster7、Battery Stack7、Smart Meter14、Logger7；Energy Storage Cabinet/Air Conditioner/EMS为空。
- 源站点ID和可见设备SN作为稳定身份；不复制账户、权限、连接密码或控制配置。地址/地区/坐标矛盾原样保留，未猜测厂家/型号/额定参数。
- private `reference-stations-20261016.json` / `reference-devices-20261016.json` 保存脱离凭据的采集结果，执行报告与验收脚本在 `.local-tools/implementation`。不提交业务原始数据。
- 首次apply结果7站insert、48设备insert。重复apply7站和48设备全部unchanged，未新增重复记录。
- guarded PG核验逐站名称、地址、功率、储能容量、坐标；API逐站核验时区、并网日、光伏容量、设备名称/SN/类别与关系。26次真实HTTP检查通过，包含未登录401和无站点权限403、旧站无profile返回null、设备无provenance泄露、无新遥测记录。

## 新库备份

远端备份仅新库，权限0600：

- `/var/lib/postgresql/ems_cloud_saas_toyingzhen_before_v32_20261016.dump`（746305字节）。
- `/var/lib/postgresql/ems_cloud_saas_toyingzhen_before_v33_20261016.dump`（754729字节，包含已导入7站）。

## 代码验证与页面核对

- Python scripts/tests：29项通过，涵盖只读预演、库/角色/分支/权限护栏、幂等、SN与映射碰撞、整批回滚、降低功率保护及错误脱敏。测试替身不等于真实PG证据；真实执行见上述另列项。
- Java定向5项通过：StationProfileServiceTest3、AssetReferenceDevicesTest2；Maven package成功。
- 前端station-profile2项通过，Vite生产构建通过。
- Figma最新1127:10085已读取设计上下文与截图；基础档案复用现有Field/grid，无CSS改动。
- 8444实际开发账号页面已核对10站列表、HONGOS LANAVA地址/100kW/215kWh/Europe-Madrid/光伏120/2026-03-26档案，以及7个所属设备和原序列号。实时值保持真实空态。
- 独立审查发现重复导入下调功率绕过运行计划/市场承诺保护，已使用容量锁78291001和已有业务依赖拒绝降低策略；定向复核通过，未留阻断项。

## 查看入口

`http://127.0.0.1:8444/` → 电站管理 → 列表查询。行末更多 → 查看站点信息，可看真实地址、容量和档案；点站点名称 → 设备详情，可看已导入设备及SN。沿用本地开发账号，不使用参考账号登录本项目。
