# 证据登记

## 本次用户截图
- `codex-clipboard-db684177-7d90-43ce-9a4d-738914a00024.png`：SHA256 `a54a84c6dbcaa040fab9b21311c1266f2ada8f41c05bf908968c558077b85e77`；当前本地偏差截图，不可当作目标。
- `codex-clipboard-81ae3fee-0b79-4216-96bb-e14263f62dc1.png`：SHA256 `1395d233133392ff1a7c6da73ad784913a61201a0699d0e2d5735e88a0afe478`；目标参考截图，新疆261机柜储能看板；仅证明可见首屏。
截图保留在用户原Temp文件；含业务资料，不复制进Git。后续每张截图记录同站、同屏、尺寸与时间。截图中的状态不能当作所有站点显示规则。

## 既有本地证据（未重新访问参考站）
- `.local-tools/implementation/qudeox-inventory/inventory.json`：逐屏清单，包含来源与限制。
- `.local-tools/implementation/qudeox-inventory-monitor.json`：功能/字段/handler与未核验边界。
- `.local-tools/qudeox-scan/site-*.txt`：既有实屏文本，多数为较早英文场景，不能直接当作本次中文同站验收。
- `.local-tools/implementation/qudeox-inventory/audit-site-*.png`：既有中文截图，具体文件和站点需逐模块绑定。
- `.local-tools/qudeox-scan/public-modules/`：公开静态源码，只能证明结构/handler，不能证明操作成功或后端规则。
- `controls.json`：从既有站内/设备清单抽取逐控件任务，每项保留unknowns，全部重置为未验收，不自动提升证据等级。

## main保留基线
- main commit：`8cfcc30b466022632c60f29f353a84575757138c`。
- `ems-cloud-ui/src/components/EnergyFlowDiagram.tsx`
- `ems-cloud-ui/src/components/EnergyFlow3D.tsx`
- 本次 `git diff main -- <以上两文件>` 输出为空。接回入口仍是待实施任务，此事实不代表当前页面已经使用它们。

## 访问限制
参考站绝不提交业务写操作、切换自动保存设置、处理告警或发送设备指令。能量管理与未知外域容器存在自动写入/认证风险，继续离线核对。未看到的页面写“未核验”，不得凭当前本地实现猜测。
