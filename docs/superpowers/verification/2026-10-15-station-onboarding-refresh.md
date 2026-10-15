# 10 建站流程同步验收

日期：2026-10-15。对比与节点清单见 [实施记录](../plans/2026-10-15-station-onboarding-refresh.md)。

## 对比结论

最新 Figma 仍为四步建站，四模板、基础运行参数、6 个市电充电时段、8 个削峰填谷时段和单/多 EMS 部署反馈主体与上一版记录一致。本次没有历史 Figma 文件快照可用于逐编辑时间比较，因此不将下列原有实现缺口全部称为“今天新增的设计”。

已根据最新节点补齐：

- DCDC 的“配置 DC PV”、运行使能、功率上限、关联 EMU 独立表达。关闭 DC PV 隐藏设备和配置并保留草稿；停止运行保留设备与连线。旧 schema1 的 enabled 含义兼容；独立新增设备显式初始化配置状态。
- 型号由统一文本改为类型对应的目录选择。PCS、电池、计量、光伏、液冷分开过滤；柴油机和可控负载展示厂家/型号联动。新增只读 `GET /api/provision-models` 使用现有 `device_model` 表，需 `asset.create` 或 `asset.edit`。目录为空或某类别不存在时显示真实空态；保留未核验手填草稿，不提供虚假的“已适配”认证。
- EMS 接口类型不再依赖可编辑的物理接口字符串推断；类型切换/删除清理设备引用，新编号寻找未占用值。重新选择 EMS 清理失效接口，EMU 仅能选择相同 EMS 下的有效电池系统。
- 通信标识独立开关；结构节点不再显示“待配置”通信标签。拆分标准柜保留在节点操作区。
- 全屏依据 `3353:15339` 保留节点库、画布和配置面板，增加标题和退出入口；修正 1024 下画布与配置面板叠加。画布自身可滚动，外层无横向溢出。
- 市电时段的最大充电功率文案对齐，补充新增界面英文词条。

## 验证证据

- 前端针对性回归：`node --test --test-concurrency=1 tests/station-provision.test.cjs tests/onboarding-v3-model.test.cjs tests/onboarding-v3-ui.test.cjs tests/station-provision-v2-ui.test.cjs tests/onboarding-refresh-ui.test.cjs`，**28 通过，0 失败，0 跳过**。
- 后端：`mvn -pl ems-cloud-api -am -Dtest=ProvisionModelControllerTest -Dsurefire.failIfNoSpecifiedTests=false test`，**2 通过**，覆盖拒绝无权限读取及创建/编辑权限。
- `tsc --noEmit`、`vite build`、API Maven package 均成功；构建仍有既有的大包体积提示。
- 浏览器使用独立模拟接口验证交互；截图核对 1440、1024 和 1024 全屏，保存于私有临时目录 `ems-onboarding-refresh`。断言包括全屏画布/配置面板不重叠、页面无横向溢出、停止独立 DCDC 不隐藏、保存重载功率不丢失、目录失败可重试及浏览器无异常。
- 独立代码复核发现旧草稿/独立新增 DCDC 停机时隐藏的兼容问题，已补红绿测试并修正；复核确认无剩余阻断项。

## 边界

- 没有修改数据库结构、写入原型型号、调整账号或角色。
- 目录登记不等于协议适配。现有分类没有 DCDC/柴油机/充电桩/可控负载专类记录时保持空态，允许保存未核验设计输入；不将通用 OTHER 型号错误归入这些设备。
- 正式配置发布、EMS 下发和现场自检仍按已确认范围显示未接通，不模拟部署成功；旧端口编辑器、账户级草稿隔离和离开保护保留。
- 本轮为本地实现、构建和隔离浏览器验证；未部署云端，未冒充完成真实 EMS 联调。
