# T01 权限目录交付报告

## 变更

- 新增后端资源 `permission-catalog.json`：38 个原型操作、8 个未被原型操作覆盖的现有扩展，稳定 code、模块、组织/站点作用域、页面入口、可用标志及 current/planned 接口绑定。
- 新增 `docs/permission-catalog.md` 作为页面验收矩阵，明确旧 `workorder.manage`、`member.manage` 拆分和 `customer.manage` 原有 `asset.edit AND member.manage` 联合条件。文档注明自定义角色及 `super_admin` 均需纳入后续迁移基线，不在本任务授予新权限。
- 新增目录合同测试，核对 38 项完整性、code 唯一、现有 V3 code 保留、可用项的同 code 控制器检查。

## 红绿验证

- 红：先添加 `PermissionCatalogTest`，执行 `./mvnw.ps1 -q -Dtest=PermissionCatalogTest test`，三个测试均因缺少 JSON 目录而失败。
- 绿：添加目录后目标测试通过；扩充结构和现有 code 完整性断言后再次通过。
- 全量：`./mvnw.ps1 -q test` 通过；Surefire 8 份报告，共 37 项，0 失败、0 错误、0 跳过。控制台有既有 Mockito/ByteBuddy 动态 agent 和预期数据源 guard 日志。

## 提交与后续注意

提交：本报告与上述三个 T01 文件在同一提交中；准确哈希以 `git log -1` 为准。

`available=true` 仅证明现有 route 至少有一次精确 code 检查，不证明现有旧授权已具备逐条角色加站点的联合判定。planned 路由尚未绑定新 code；空绑定项的功能本期范围外或尚未定义。T02—T04 应以此目录为目标，但角色/成员授权迁移必须依现有有效能力逐用户对照，不按角色名推断，也不能从单独的 `asset.edit` 派生 `customer.manage`。
