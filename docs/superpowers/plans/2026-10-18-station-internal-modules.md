# 场站内部子模块实施计划（2026-10-18）

目标：仅 develop-toyingzhen / ems_cloud_saas_toyingzhen，融合场站数据、子场站、设备三个入口与业务链路；参考平台只读，不参考 Figma。

- [x] 场站数据：复用已入库场站指标和时间、设备采样及历史入口，缺数留空，持续采集标记未接通。
- [x] 子场站后端：新增 V43 独立实体和设备关联，父站权限继承、版本冲突、父容量约束、先创建再关联；不改变设备原始 station_id。测试越权、跨站设备、重复归属、容量和回滚。
- [x] 子场站前端：列表/筛选、创建/编辑、详情和设备绑定、跳转既有设备详情，错误/无数据状态真实呈现；保留既有站内模块。
- [x] 备份新库、迁移、构建隔离 API、逐项比对 API/新库/页面；独立审查、更新台账、打开交付页面。

依据：docs/reference-platform/function-comparison.json 的 child-station-create-capacity-device-link/referenceSpecification；现有 StationStoredOverview、StationDevicesPage、权限体系。

Ruling：子场站不等同空间，新增独立业务实体；设备仍归父站，子关联只缩小查询范围。父子电量不自动求和，未知计量规则明确留空。参考子站运行创建/关联流程未执行，不能宣称复制了未取得的参考子站数据。
Ruling：本地规则按各子容量不超过已知父容量验证，未知上限显式标注，既不伪造父容量也不宣称已核实所有参考后端规则。充电/MPPT 仅在可证明父能力时开放。
