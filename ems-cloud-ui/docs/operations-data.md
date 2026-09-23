# 运营中心数据接入

入口为 `src/components/OperationsCenterPage.tsx`，数据模型位于 `src/data/operations.ts`。
页面接收 App 的 `stations`，更新对应站点对象后，筛选、指标、趋势、计划、明细和收益核算同步重算。
当前没有新增后台接口、自动轮询或 EMS 指令下发。

## 站点字段

- 收益复用 `revenueHistory`，`date` 为本地业务日期 `YYYY-MM-DD`。
- `revenueSource`：初始模拟记录为 `demo`；替换真实收益记录时设为 `connected`。
- `operations.samples`：带时间戳的功率及 SOC 采样。
- `operations.plan`：按日期区分的计划时段。
- `operations.marketServices`：市场服务记录，只读展示，不代替申报或结算接口。
- `operations.source`：`connected` 或 `demo`，未指定时已提供的记录按接入数据处理。

```ts
const patch = {
  revenueSource: "connected",
  revenueHistory: [
    { date: "2026-09-10", settled: 1000, pending: 250, est: 50 },
  ],
  operations: {
    source: "connected",
    samples: [
      {
        timestamp: "2026-09-10T08:00:00+08:00",
        load: 500, pv: 100, storage: 200, grid: 200,
        plannedStorage: 190, soc: 65,
      },
    ],
    plan: [
      {
        id: "morning", date: "2026-09-10",
        start: "08:00", end: "12:00", mode: "discharge", power: 200,
      },
    ],
    marketServices: [
      {
        id: "response-1", date: "2026-09-10", name: "需求响应",
        capacity: 200, revenue: 80, status: "已完成",
      },
    ],
  },
};
```

本地预览可使用 `window.__ENERLUTION_DATA__.patchStation("1", patch)` 验证更新。
该方法浅合并站点字段，更新 `operations` 时需传入完整 operations 对象；`samples` 和收益记录是替换，不是追加。
正式接口应调用 App 的站点更新逻辑，而非依赖仅开发环境提供的调试对象。

## 统计口径

- 功率、计划功率和服务容量：kW；能量：kWh；收益：元；SOC：0 至 100。
- 储能功率正值放电、负值充电；电网功率正值购电、负值上网。
- 时间按浏览器本地时区分日；生产环境应统一配置业务时区，时间戳带时区偏移。
- 趋势以 15 分钟桶内平均功率呈现。同时间戳合并，后到字段覆盖旧字段；非法数值为空。
- 无 `operations.samples` 时可复用 `telemetryHistory`。电网功率只在负荷、光伏、储能、发电机均存在时推算，不能把电压当功率。
- 仅缺少 operations 和 telemetryHistory 时生成示例曲线。显式传入 `samples: []` 或 `telemetryHistory: []` 表示无数据，不生成替代曲线。真实数据中未来采样不会显示。
- 组合趋势汇总有曲线的站点并标明覆盖站数；任一参与站点某信号在该桶缺失，该信号断线，不补零。
- 能量为 15 分钟平均功率的梯形积分，属于采样估算，不是结算电表读数。缺少零点数据或中间有缺口时不显示后续累计值。
- SOC 按已知站点储能容量加权；当日优先最新采样 SOC，否则使用当前站点快照。历史日期缺少 SOC 时为空。
- 单站计划偏差为采样中绝对误差之和 / 计划绝对值之和；计划全零或未接入则为空。总览展示各站最大偏差。
- 完整率为当日四个功率信号均有效的桶数 / 应有桶数；今天只统计至当前桶。示例曲线不计完整率。
- 日收益优先求和 settled、pending、est；没有状态金额时使用 amount 或来源金额之和。月份累计截至选定日期，缺少记录显示 `--`，不会生成虚假收益。
- 时段模式为 charge、discharge、standby；结束支持 24:00。重叠计划标记异常，不绘制覆盖的时间线。
- 运行策略页当前本地编辑与运营中心接入计划是不同数据源，尚未接通 EMS 的保存及下发结果回流。

## 计划调度

`OperationsSchedulePage.tsx` 使用 `stationDispatch.ts` 计算计划执行数据，独立于总览筛选。

- `operations.dispatch` 可提供 `{ planType: "dayAhead" | "intraday", version: "V24" }`。缺少类型按日前计划处理，缺少版本显示未提供；示例单独标注。
- 优先使用采样的 `plannedStorage`，否则根据当日计划时段计算目标功率。跨 15 分钟桶的切换按时间占比加权；不完整覆盖保持为空，不视为待机。
- 偏差 = 实测功率减目标功率。目标为 0 时不除以 0，表格显示有符号功率偏差。
- 默认以 1 小时展示，支持 15 / 30 分钟；聚合桶任一子时段缺失则保持为空。统计始终按底层 15 分钟时段计算。
- MAE 为绝对误差均值，RMSE 为均方根误差；累计偏差为匹配时段误差乘 0.25 小时之和，缺失时段不计入。
- 当前组合偏差和曲线只汇总有计划站点，覆盖数与可运营站点数同时展示。参与站点任意一个缺失采样时组合偏差为空。
- 当日只展示当前时段及此前的实测值，不展示未来实测值；历史表格使用末次实测所在时段；未来计划显示首段目标，不伪造执行结果。
- 本地关注阈值为偏差绝对值大于 max(1 kW, 目标绝对值的 5%)。这是预览判断规则，不是后台告警事件或持续时间判定。
- 新建和 JSON 导入校验站点、日期、额定功率、时段范围、待机功率和重叠。计划草稿保存在 `enerlution-dispatch-drafts-v1`，不会覆盖运行计划或下发设备。
- 交接备注及已阅状态保存在 `enerlution-dispatch-handover-v1`，按日期区分，仅本浏览器可见。数值或时段变化产生新的待阅记录；已阅不会消除实际偏差。

## 市场服务

`OperationsMarketPage.tsx` 使用 `stationMarket.ts`，保留原有 `operations.marketServices` 的兼容性。
价格、可用能力和交付采样均为独立输入，不用站点储能功率冒充实际服务交付。

```ts
operations: {
  source: "connected",
  market: {
    source: "connected",
    portfolio: "工商业组合 A",
    area: "华东 · CN",
    qualifications: [
      { kind: "response", status: "valid", validUntil: "2026-12-31", reference: "DR-001" },
    ],
    capacity: {
      timestamp: "2026-09-10T14:30:00+08:00",
      up: 820, down: 600, occupied: 200, durationHours: 2.1,
      constraint: "",
    },
    prices: [
      { timestamp: "2026-09-10T14:00:00+08:00", price: 620 },
      { timestamp: "2026-09-10T14:15:00+08:00", price: 640 },
    ],
  },
  marketServices: [
    {
      id: "station-service-1", eventId: "DR-20260910-1",
      date: "2026-09-10", kind: "response", name: "需求响应",
      start: "14:00", end: "16:00", capacity: 500,
      revenue: 1600, status: "执行中",
      delivery: [
        { timestamp: "2026-09-10T14:00:00+08:00", power: 450 },
        { timestamp: "2026-09-10T14:15:00+08:00", power: 470 },
      ],
    },
  ],
}
```

- 服务类型为 `response`（需求响应）、`arbitrage`（日前套利）、`reserve`（备用容量）、`vpp`。
- 资格状态为 `valid`、`pending`、`expired`、`suspended`；有效期按服务日期判断。资格管理当前仅保存本地核验备注，不改变真实资格。
- `capacity.up/down` 为已扣除占用、安全预留后的净可用功率，单位 kW；`occupied` 只用于展示，不再次扣减。`durationHours` 为输入方向可保证的持续时间，保守地对上、下调共用。
- 能力快照必须属于所选服务日。当日真实快照超过 15 分钟或站点离线时，可用功率为空；历史快照不被当前离线状态覆盖。未来服务日需接入有效能力预测，当前示例不生成未来可用能力。
- 相同市场区域、服务日、`eventId` 和时段的多站记录合并成一项服务，其容量及收益为各站分配额；无 `eventId` 的旧记录按单站服务展示。已取消服务不计承诺及预计收益。
- 市场价格单位元/MWh，可以为负；同时间戳的跨站相同价格去重，不相加。不一致或无效观测使对应 15 分钟桶为空；桶内合法观测取平均。多市场区域不混合画价格，应先选定区域。
- 交付功率按 15 分钟桶平均后跨站求和；任意参与站点缺失时，该时段组合交付为空。未来采样忽略。备用容量不被当成实际功率交付曲线。
- 今日承诺为当前时段承诺之和，历史及未来服务日展示全天峰值承诺。预计收益不是结算金额。可用能力按有快照的合格站点汇总并标明覆盖数量。
- 缺少整个 `operations` 时展示明确标注的示例；显式空 `marketServices: []`、`prices: []`、`qualifications: []` 和 `capacity: null` 不生成替代数据。
- 申报新服务只保存本地草稿，校验有效资格、能力、时段、可持续时间以及已有同方向草稿的重叠总容量，不发起真实市场交易或提交申报。
- 本地存储键：`enerlution-market-applications-v1` 和 `enerlution-market-qualification-notes-v1`。没有跨浏览器同步、后台审核或结算接口。

## 收益核算

`OperationsSettlementPage.tsx` 使用 `stationSettlement.ts`。核算记录通过 `operations.settlement` 接入；变更站点数据后，指标、收入构成、进度、明细及已打开抽屉会同步重算。

```ts
operations: {
  source: "connected",
  settlement: {
    source: "connected",
    records: [
      {
        id: "invoice-20260910-001", date: "2026-09-10",
        contract: "CONTRACT-001", service: "需求响应", currency: "CNY",
        status: "disputed", realized: 1000, pending: 400, settled: 600,
        disputed: 100, estimated: 2000, adjustment: 0,
        statementAmount: 1025,
        income: {
          arbitrage: 600, demand: 300, response: 100, gridServices: 100,
          pv: 0, other: 0,
        },
        costs: { purchase: 50, operating: 30, penalty: 20 },
        meterComplete: true, calculationComplete: true,
        disputeReason: "需求响应基线待复核",
        evidence: {
          reference: "EVIDENCE-001", meterKwh: 1000,
          baselineKwh: 1100, pricePerKwh: 0.5,
          rule: "计量及合同规则", instruction: "DR-001", performance: "待复核",
        },
      },
    ],
  },
}
```

- `date` 是已入账收益的确认日，不是未来服务日或结算付款日。只统计所选范围内截至今天的合法日期记录；同一站点同一 `id` 以最后一条完整记录覆盖，非字段合并。
- 日为今天，周为周一至周日，月为完整自然月；自定义日期支持任意合法范围。历史范围的第一项指标显示期末日已实现，不伪称今日数据。
- 按站点、合同、币种分组；不同币种单独展示，不换汇、不混算。状态、搜索筛选同步作用于指标、图表、进度、表格及导出。
- 已实现优先使用 `realized`。仅省略该字段且 `settled`、`pending` 均已知时，用两者合计推导；显式 `null` 始终未知。`estimated` 不计入已实现；`disputed` 为账目中争议的金额，不再次叠加到收入或待结算。
- 金额按主货币单位输入，保留正负值及明确的零，按分四舍五入后累加。任一参与记录缺少某项金额，该项合计显示 `--`，不把已知部分冒充完整总额。
- `income` 是扣除所列成本前的收入分项：峰谷套利、需量节省、需求响应、电网服务、光伏及其他。`costs` 正值表示扣减；`adjustment` 正值增加、负值减少收入。对账关系为收入合计减成本合计加调整等于已实现。无该类收入或成本应显式传 `0`，缺失表示未知，不据此计算占比或核算差额。
- 差异优先使用 `difference`，否则为 `statementAmount - realized`。缺少对账金额时不假设差异为零。差异优先排序按单条账目最大绝对差异，避免正负抵销掩盖问题。已实现与已结算、待结算之和不一致时，抽屉和表格提示核验，不擅改金额。
- 状态为 `metered`、`calculated`、`reviewing`、`settled`、`disputed` 或 `unknown`。合同内存在争议、复核、未知状态时优先显示，全部记录已结算才显示已结算。计量齐备及初算完成须合同内全部记录显式传入对应完成标记；进度的单位为合同，不是站点。
- 有 `operations.settlement.records` 时不再读取旧收益数据，包括空数组。缺少该对象时兼容 `revenueHistory` 的已结算、待结算与预估，不将来源分项或 `amount` 自动当成已实现。
- 仅 `source: "demo"` 或兼容历史的 `revenueSource: "demo"` 使用示例账目，页面明确标注。示例中的结算分配、成本、收入构成、状态及差异不代表真实业务；真实来源不补造证据、成本或金额。
- 证据抽屉展示核算账目、计量/基线/规则/执行证据，并支持 CSV 导出。复核备注按合同和筛选日期范围保存在 `enerlution-settlement-review-notes-v1`；仅本机可见，不提交后台审核、不变更结算状态、不执行付款。
