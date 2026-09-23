# 数据字典与规范化说明

业务库为 `ems_cloud_v2_proto`；全部业务表在 public，V6 后 42 张业务表另加迁移版本表。ClickHouse 新库 `ems_cloud_v2_proto_telemetry` 只有一张测点事实表。逐条授权、组织管理归属及 V7 数据迁移契约见 [授权模型](permission-grant-schema.md)。

## 表、候选键与字段用途

下表中 id 为代理主键；复合关系主键明确列出。外键引用的名称、账号、设备型号信息不重复存储在关系表。详细类型、空值、约束以迁移 SQL 为准。

| 表 | 主键/其他候选键 | 非键字段用途 |
| --- | --- | --- |
| organization | id；parent_id+name（NULL 不重复） | 组织名称、父级、可空负责人引用，支持组织树，禁止自环与祖先环 |
| app_user | id；account | 展示名、BCrypt 密码、所属组织、独立管理组织、可空邮箱、启用状态；不存明文凭据 |
| app_role | id；code；非空管理组织内 btrim(name) | 业务角色名称、说明、管理组织引用 |
| member_grant | id | 成员、角色、起止时刻、授予人；结束可空表示长期，结束晚于开始 |
| member_grant_station | grant_id+station_id | 单条授权的站点集合；空集合无站点权限 |
| permission | code | 权限展示名 |
| user_role | user_id+role_id | 用户到角色多对多，无冗余字段 |
| role_permission | role_id+permission_code | 角色到功能权限多对多 |
| user_station | user_id+station_id | 用户可访问站点，多值关系独立存储 |
| user_totp | user_id | 加密绑定密钥和最后已消费时间计数器，防重放 |
| customer | id；name | 客户主体名称 |
| station | id；code | 名称、客户/组织/负责人引用、额定功率、容量、资产类型、地区、地址和坐标 |
| device_model | id；manufacturer+name | 型号名称、厂商、设备分类；不复制进设备记录 |
| device | id；station_id+code；非空 serial_number | 电站引用、型号引用、设备名、序列号 |
| measurement_kind | code | 测量含义与单位；同一种测量单位不复制进每条采样 |
| measurement_point | id；device_id+code | 设备引用与测量种类引用；不重复存 station_id |
| topology_connection | source_device_id+target_device_id | 设备连接，无冗余名称 |
| device_observation | device_id | 最新观测时间、通信、健康、固件版本，独立观测事实 |
| audit_event | id | 操作者、动作、发生时间、必要事件描述；禁止修改/删除 |
| user_preference | user_id+preference_key | 单项个人设置值；不用于权限、凭据或安全策略 |
| alarm | id；device_id+code+occurred_at | 标题、级别、发生/恢复/确认/SLA时间、确认人；不复制电站 |
| alarm_note | id | 告警、作者、内容、创建时间 |
| work_order | id | 站点、标题、描述、状态、创建人、负责人、创建/截止/完成时间 |
| work_order_alarm | work_order_id+alarm_id | 工单与告警关联，避免重复设备站点字段 |
| work_order_event | id | 工单、操作者、状态动作、必要说明、发生时间 |
| inspection | id | 站点、标题、截止日期、负责人、状态、完成时间、完成结果 |
| firmware_task | id | 设备、目标版本、状态、更新时间，仅外部任务记录展示 |
| operating_plan | id；station_id+service_date+version | 站点、服务日、版本、计划类型、状态、创建者/时间 |
| plan_period | id；plan_id+start_minute（排斥约束保证不重复） | 所属计划、开始/结束分钟、模式、目标功率 |
| tariff | id | 电价方案名称、币种 |
| tariff_period | id；tariff_id+start_minute | 方案、时段、峰平谷档位、单位电价 |
| station_tariff | id；station_id+valid_from | 站点与电价方案的有效期关系 |
| approval | id | 标题、申请人/审批人、状态、提交/处理时间、意见；工单或计划两个真实外键必须恰有一个 |
| market_area | id；code | 市场区域名称 |
| market_qualification | id；station_id+area_id+kind | 资格状态、有效期、凭证编号 |
| market_service | id；area_id+event_code | 服务名称/类别/起止/状态；不复制市场区域名 |
| market_allocation | service_id+station_id | 单站承诺容量、独立预计收益；不存组合汇总 |
| contract | id；code | 客户、合同币种 |
| settlement_record | id；reference | 站点、合同、确认日、状态、外部对账单金额、预计金额、计量/初算齐备标记 |
| settlement_line | id；record_id+category | 收入、成本和调整分项；已实现合计从分项计算 |
| settlement_payment | id；reference | 账目、实际结算金额与付款日期，仅记录不执行付款 |
| settlement_review | id | 账目、复核人、意见、创建时间 |

## 约束边界

- 所有多值关联拆为表，不以 JSON 或逗号字符串存权限、站点、计划时段。
- 金额使用 numeric；功率、能量单位为 kW/kWh。计划 power_kw 存非负幅值，模式决定方向；遥测储能功率正放负充。
- 电价和计划使用左闭右开时段，1440 表示当天结束；电价有效期结束日不含在范围内。数据库排斥约束拒绝并发重叠。
- 普通 CHECK 不跨表校验。计划不得超额定功率、工单关联告警必须同站、负责人必须有站点权限，当前在服务事务内校验；不能声称任意直接 SQL 导入均具备这些保证。
- topology_connection 的两个设备当前尚无同站数据库约束，读取接口只返回同站连接；拓扑写入接口未开放。
- 工单与审批用行锁和预期状态控制竞争；计划版本生成与额定功率变更锁住同一电站行。
- 业务历史记录默认不物理删除。关系从属明确的用户授权、TOTP、个人设置和计划明细才使用级联删除。
- NULL 表示未知，0 表示已知零。未接入收益和测点时，不生成假数据或持久化推导汇总。

## ClickHouse

`measurement_sample` 的逻辑键是 `(point_id,sampled_at)`；`value` 为该测点该时刻观测值，`revision` 用于修正版本，不存可从测点确定的设备或电站编号。由于 ClickHouse 不保证唯一性/外键，数据库能力不能与 PostgreSQL 等同。

受控管理导入需要先验证 PostgreSQL 测点存在，再保证相同测点时刻的修正版本严格递增。同版本重复写入必须值相同；当前没有开放写入 API。查询总是 FINAL 后再聚合，因此不能依赖后台合并时间。实时业务账号只读。

迁移版本表不存业务属性。当前迁移使用人工版本不可变约定，还没有 SQL 内容校验和检查；发生迁移编辑时应补新版本，不修改历史文件。
