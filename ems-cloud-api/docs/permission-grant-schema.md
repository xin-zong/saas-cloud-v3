# 逐条授权数据模型（V6）

V6 只扩展结构，不迁移旧授权或启用新的鉴权。V7 负责数据复制、映射和默认模板；T04 负责联合鉴权。规范权限目录见 [permission-catalog.md](permission-catalog.md)。使用 `database/apply.sql` 的 `schema_migration` 版本登记，不修改 V1–V5。

## 关系与约束

| 表 | 字段/候选键 | 含义 |
| --- | --- | --- |
| app_role | 新增 `organization_id`（可空外键）、`description`（可空文本） | 管理组织拥有并编辑角色；原有 `code` 仍全局唯一，接受自定义代码 |
| app_role | 同一非空组织内 `btrim(name)` 唯一；名称去空格后非空 | 不同组织可使用相同名称；旧的无组织角色保留，不视为全局可编辑角色 |
| app_user | 新增 `email varchar(254)`（可空）、`management_organization_id`（可空外键） | 邮箱是独立资料；管理组织是管理责任关系，与现有成员所属组织不同 |
| organization | 新增 `lead_user_id`（可空，引用 app_user） | 负责人关系；跨组织合法性由 T09 事务服务校验 |
| member_grant | `id`；`user_id, role_id, valid_from, valid_until, granted_by` | 一条成员授权；结束时间及历史授予人可空，其他非空；三个实体引用均为真实外键 |
| member_grant_station | 主键 `(grant_id, station_id)` | 一条授权的站点集合；授权删除时级联删除其站点关系，站点删除受外键限制 |

授权的成员、角色、授予人引用均 `ON DELETE RESTRICT`。不能通过删除角色隐式撤销授权；先通过明确的撤销操作处理授权。旧 `user_role`、`user_station` 在 V6 保持不变。成员可拥有多条相同角色但站点/有效期不同的授权，不增加错误的 `(user_id,role_id)` 唯一约束。

历史关系没有记录授予人，V7 应保留 `granted_by=NULL`，不能伪造管理员或成员本人作为历史操作人。这是对最初要求授予人非空的修正；数据库保留真实外键，未知的非空授予人仍会被拒绝。T06 新建授权必须写入实际登录操作人的 ID。响应可从 NULL 推导来源“历史迁移”，从非空推导“直接授权”，不额外保存来源字段。

`app_user.organization_id` 表达成员当前所属组织；`management_organization_id` 表达谁有权管理该成员。移出组织只清空前者，保留后者；因此未分配成员仍在原管理组织内可查找、可重新加入组织，且不会成为全局可见成员。V7 从旧 `organization_id` 初始化管理归属，新建成员必须记录选择的管理范围。无管理归属的旧成员只能通过明确的引导流程归属，普通组织管理接口不得把 NULL 当作所有组织。

这两条关系并非冗余副本：成员可以无所属组织而仍由一个组织管理，也可以由独立的管理组织负责。关系均依赖成员主键，不存在从一个组织字段推导另一个字段的函数依赖。角色组织也不复制到授权；授权通过角色引用取得管理范围。站点名称、组织路径、权限名称、期限标签不存授权快照，保持 3NF。

## 有效期与范围

`valid_from` 和 `valid_until` 使用 `timestamptz`；`valid_until IS NULL` 表示长期。约束为 `valid_until IS NULL OR valid_until > valid_from`。服务端按 `valid_from <= 当前时刻 AND (valid_until IS NULL OR 当前时刻 < valid_until)` 判断，结束时刻本身不再有效。展示统一 Asia/Shanghai。30/90 天是固定天数，一年是该时区中的日历年；由服务端计算结束时间，只保存两个时间点，可表达时再推导界面期限。

配置权限按**该条授权的角色管理组织**限制；角色 NULL 组织不构成所有组织范围。站点权限必须在**同一条有效授权**中同时具有该权限和目标站点，禁止将一个角色权限与另一条授权的站点拼接。空 `member_grant_station` 集合表示没有站点访问权限，不能解释为全部站点。组织层级、可授权站点范围及防越权写入由 T04/T09 服务校验；本迁移只保证引用和行级约束，不声称已具备这些业务校验。

## V7 接口与验证

历史跨组织共用角色应按实际管理组织复制并映射，保留全局唯一代码、权限组合和自定义角色，不能依赖三个演示角色代码。NULL 组织的保留定义不可通过普通角色管理界面编辑；新建及默认模板角色始终属于真实组织。V6 不自行填充角色组织、邮箱、负责人或管理归属，也不生成默认授权。

真实数据库约束用例为 `database/tests/permission_grants.sql`，调用者必须包在 `BEGIN`/`ROLLBACK` 内。便捷入口：

```sh
python database/tests/permission_grants.py
python database/tests/permission_grants.py --with-v6
```

只允许连接 `ems_cloud_v2_proto`；凭据来自 libpq 环境或密码文件。第二个命令在同一事务中排演 V6 和测试，最后回滚；不要在已安装 V6 的库使用第二个命令。测试使用显式负 ID，不推进业务序列。数据库连接中断或测试失败也不会提交变更。
