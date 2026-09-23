# 运维中心数据接入

入口为一级导航「运维中心」。`MaintenanceCenterPage.tsx` 展示总览、告警事件、巡检检修、设备健康和固件任务；`stationMaintenance.ts` 负责标准化、统计、24 小时聚合和 SLA 排序。

## 站点接口

在 `Station.maintenance` 中提供数据。时间戳建议携带时区，金额不涉及此模块，健康度为 0 至 100。

```ts
maintenance: {
  source: "connected",
  updatedAt: "2026-09-11T11:59:00+08:00",
  alarms: [
    {
      id: "ALM-001", title: "PCS 直流过压", device: "PCS-01",
      category: "设备", severity: "critical", status: "active",
      occurredAt: "2026-09-11T11:30:00+08:00",
      acknowledged: false, slaDueAt: "2026-09-11T12:15:00+08:00",
      owner: "张工程师",
    },
  ],
  workOrders: [
    {
      id: "WO-2847", title: "现场故障处理", status: "pending",
      createdAt: "2026-09-11T11:40:00+08:00",
      dueAt: "2026-09-11T12:30:00+08:00", owner: "张工程师",
      alarmId: "ALM-001", description: "核对保护记录及设备状态",
    },
  ],
  inspections: [
    {
      id: "INSP-001", title: "储能舱安全巡检", status: "pending",
      dueAt: "2026-09-11T17:00:00+08:00", owner: "张工程师",
    },
  ],
  health: { score: 84, observedAt: "2026-09-11T11:59:00+08:00" },
  communication: { lastSeenAt: "2026-09-11T11:59:00+08:00", status: "online" },
  firmware: [
    {
      id: "FW-001", device: "PCS-01", currentVersion: "V3.8.2",
      targetVersion: "V3.8.3", status: "pending",
      updatedAt: "2026-09-11T10:00:00+08:00",
    },
  ],
}
```

## 状态与口径

- 默认统计非建设中的站点。责任范围按站点筛选，负责人按 `station.manager` 筛选，不等同于登录用户权限。尚无登录用户的待办接口，因此控件为「仅看待处理」，不声称已识别“我的”任务。
- 风险口径为实时告警 + SLA、实时告警、SLA 优先。告警口径的队列只含活动告警；SLA 口径按截止时间排序，待处理筛选限定一小时内到期或已超时的站点；组合口径涵盖告警、工单、今日未完成巡检、通信异常及低于 80 的健康评分。
- `alarms` 优先于 `station.alarmHistory`。显式空数组表示无记录，不生成示例；缺失表示未接入。告警级别为 `critical`（严重）、`warning`（重要）、`info`（一般）；状态为 `active`、`recovered`。
- 同站点、同类记录的同一 `id` 最后一条完整替换，非字段合并。未来发生的告警、未来创建的工单不计当前数据；非法时间不作为图表或 SLA 的依据。未来恢复时间不会提前使告警恢复。
- 严重告警为当前活动严重告警数。未确认告警仅按 `acknowledged: false` 统计，缺失确认标记不视为未确认；最长未确认时长从发生时间计算。站点未提供确认信息时，组合未确认数显示 `--`。
- 24 小时趋势按过去 24 小时滚动窗口、2 小时桶统计新增事件，包括后来恢复的事件；不把当前活动告警数当成新增事件数。图表按已接入历史的站点统计，并显示覆盖数量，缺少历史时不展示虚构曲线。设备来源按设备名中的 BMS/BESS/RACK、PCS、HVAC、MTR、FSS 分组，其余归其他。
- 工单状态为 `pending`、`processing`、`completed`、`cancelled`。「处理中工单」包括待接单和处理中的未关闭工单；临近或超时为剩余时间不超过一小时。审批流、接受工单、关闭工单的后台操作尚未接通。
- 巡检状态为 `pending`、`completed`、`cancelled`；已完成可提供 `completedAt`。今日到期按本地日期匹配 `dueAt`，包含今日已完成任务，排除已取消任务；完成率为今日已完成 / 今日到期。未来完成时间不提前计入完成。
- SLA 来自告警 `slaDueAt` 或未关闭工单的 `dueAt`，不使用自设级别超时阈值代替真实合同规则。时间流逝每 30 秒重算，负值显示超时。已恢复告警和已结束工单不参与最早 SLA。
- 健康度仅使用有效且 24 小时内的 `health.score`，保留有效的 0，过期、未来或越界的评分显示 `--`。健康覆盖指具有有效评分的站点数，不代表设备在线率。
- 通信明确离线时显示异常；有合法 `lastSeenAt` 时，超过 15 分钟标记通信异常。未来通信时间无效；未接入最近通信时不凭设备功率推测在线。
- 固件状态为 `pending`、`running`、`succeeded`、`failed`，仅展示接入任务与版本，没有执行升级、回滚或设备参数下发。
- 各个计数在参与站点缺少该领域数据时保持 `--`；真实零记录显示 0。页脚显示告警及工单的接入站点覆盖数。

## 交互与边界

- 修改 `Station.maintenance` 后，指标、堆叠柱图、设备来源条形图、优先队列、列表及打开的明细会重新计算。开发预览可用 `window.__ENERLUTION_DATA__.patchStation(id, { maintenance: ... })` 验证；它是浅合并，传入 `maintenance` 时须保留仍需要的字段。
- 工单入口进入一级「工单与审批」，可按站点或具体工单定位。站点告警入口进入「资产与站点 → 告警信息」；显式接入的运维告警同步在该页显示。如需测点曲线、阈值及处理记录，在 `alarmHistory` 中提供相同 `id` 的详细证据，缺少时保持无测点数据，不补造数值。
- `source: "demo"` 才生成跨站示例，初始演示站点已显式启用。示例健康评分、SLA、工单和任务不代表实际业务。正式接入须改为 `source: "connected"`，不保留示例标记。
- 跟进备注按站点、记录类型和编号保存在 `enerlution-maintenance-notes-v1`，仅本机有效，不改变告警确认、工单、巡检或升级状态。现有站点告警页新建工单仍是独立本地草稿，未冒充正式工单。
- 站点、事件、巡检、工单和固件列表支持 CSV 导出，按当前筛选结果生成；明细支持单条导出。没有后台鉴权、审批或外部通知行为。
