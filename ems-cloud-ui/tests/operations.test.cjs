const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

// Compile only the pure data modules; no browser or bundler is needed.
function loadDataModule(name) {
  const filename = path.resolve(__dirname, "../src/data", `${name}.ts`)
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText
  const exports = {}
  new Function("exports", "require", source)(exports, (dependency) =>
    loadDataModule(dependency.replace("./", "")),
  )
  return exports
}
const { buildOperationsStation, portfolioPower, powerToEnergy, stationPlan } =
  loadDataModule("operations")
const { dispatchStation, dispatchPortfolio, validateDispatchDraft } =
  loadDataModule("stationDispatch")
const {
  marketStation,
  marketServices,
  marketTimeline,
  validateMarketApplication,
} = loadDataModule("stationMarket")
const {
  settlementRecords,
  settlementTotals,
  buildSettlementAccounts,
  sumSettlementMoney,
  completeSettlementMoney,
  validSettlementRange,
} = loadDataModule("stationSettlement")
const {
  buildMaintenanceStation,
  maintenanceSummary,
  maintenanceTrend,
  maintenanceQueue,
} = loadDataModule("stationMaintenance")
const date = "2026-09-10"
const now = new Date(`${date}T12:00:00`)
const station = {
  id: "1",
  status: "online",
  dataStatus: "connected",
  activePower: 300,
  pvOutput: 1,
  ratedPower: 500,
  storageCapacity: 1,
  soc: 70,
  revenueHistory: [],
}
const sample = (time, values = {}) => ({
  timestamp: `${date}T${time}:00`,
  storage: 100,
  load: 400,
  pv: 100,
  grid: 200,
  ...values,
})

const maintenanceInput = (values) => ({
  ...station,
  name: "Test station",
  manager: "Engineer",
  maintenance: { source: "connected", ...values },
})
const maintenanceAlarm = (values) => ({
  id: "a1",
  title: "Temperature high",
  device: "BMS-01",
  severity: "critical",
  status: "active",
  occurredAt: `${date}T11:30:00`,
  acknowledged: false,
  slaDueAt: `${date}T12:15:00`,
  ...values,
})
test("maintenance empty arrays override demo records and preserve zero counts", () => {
  const row = buildMaintenanceStation(
    {
      ...maintenanceInput({
        alarms: [],
        workOrders: [],
        inspections: [],
        firmware: [],
        health: null,
        communication: null,
      }),
      alerts: [],
      devices: { fault: 0, offline: 0 },
      maintenance: {
        source: "demo",
        alarms: [],
        workOrders: [],
        inspections: [],
        firmware: [],
        health: null,
        communication: null,
      },
    },
    now,
  )
  const totals = maintenanceSummary([row], now)
  assert.equal(row.alarms.length, 0)
  assert.equal(totals.critical, 0)
  assert.equal(totals.openOrders, 0)
  assert.equal(totals.unacknowledged, 0)
  assert.equal(row.health, null)
  assert.equal(totals.communication, null)
})
test("maintenance never invents health, work orders or acknowledgment for legacy alarms", () => {
  const row = buildMaintenanceStation(
    {
      ...station,
      alarmHistory: [
        maintenanceAlarm({ acknowledged: undefined, slaDueAt: undefined }),
      ],
    },
    now,
  )
  assert.equal(row.critical, 1)
  assert.equal(row.unacknowledged, null)
  assert.equal(row.earliestSla, null)
  assert.equal(row.ordersKnown, false)
  assert.equal(row.health, null)
  assert.equal(row.communication, null)
  assert.equal(row.demo, false)
  assert.equal(maintenanceSummary([row], now).openOrders, null)
})
test("maintenance normalizes duplicate IDs, ignores invalid/future timestamps and respects recovery time", () => {
  const row = buildMaintenanceStation(
    maintenanceInput({
      alarms: [
        maintenanceAlarm(),
        maintenanceAlarm({ title: "Updated", severity: "warning" }),
        maintenanceAlarm({ id: "bad", occurredAt: "invalid" }),
        maintenanceAlarm({ id: "future", occurredAt: `${date}T13:00:00` }),
        maintenanceAlarm({
          id: "recovery",
          status: "recovered",
          recoveredAt: `${date}T13:00:00`,
        }),
      ],
    }),
    now,
  )
  assert.equal(row.alarms.length, 2)
  assert.equal(row.alarms[0].title, "Updated")
  assert.equal(row.active.length, 2)
  assert.equal(row.critical, 1)
})
test("maintenance trend counts exact rolling 24 hours by event severity, not active snapshot", () => {
  const row = buildMaintenanceStation(
    maintenanceInput({
      alarms: [
        maintenanceAlarm({
          status: "recovered",
          recoveredAt: `${date}T11:45:00`,
        }),
        maintenanceAlarm({
          id: "start",
          severity: "info",
          device: "PCS-01",
          occurredAt: "2026-09-09T12:00:00",
        }),
        maintenanceAlarm({ id: "old", occurredAt: "2026-09-09T11:59:59" }),
        maintenanceAlarm({
          id: "now",
          severity: "warning",
          occurredAt: `${date}T12:00:00`,
        }),
      ],
    }),
    now,
  )
  const trend = maintenanceTrend([row], now)
  assert.equal(trend.total, 3)
  assert.deepEqual(trend.counts, { critical: 1, warning: 1, info: 1 })
  assert.equal(trend.bins[0].info, 1)
  assert.equal(trend.bins[11].warning, 1)
  assert.equal(trend.devices.find((item) => item.name === "BMS").value, 2)
})
test("maintenance summary counts open work orders, due inspections and unacknowledged age", () => {
  const row = buildMaintenanceStation(
    maintenanceInput({
      alarms: [maintenanceAlarm()],
      workOrders: [
        {
          id: "w1",
          title: "Fix",
          status: "processing",
          dueAt: `${date}T12:30:00`,
        },
        {
          id: "w2",
          title: "Done",
          status: "completed",
          dueAt: `${date}T11:00:00`,
        },
        {
          id: "w3",
          title: "Future",
          status: "pending",
          createdAt: `${date}T13:00:00`,
        },
      ],
      inspections: [
        {
          id: "i1",
          title: "Inspect",
          status: "completed",
          dueAt: `${date}T17:00:00`,
          completedAt: `${date}T11:00:00`,
        },
        {
          id: "i2",
          title: "Inspect",
          status: "pending",
          dueAt: `${date}T16:00:00`,
        },
        {
          id: "i3",
          title: "Cancelled",
          status: "cancelled",
          dueAt: `${date}T16:00:00`,
        },
      ],
    }),
    now,
  )
  const totals = maintenanceSummary([row], now)
  assert.equal(totals.openOrders, 1)
  assert.equal(totals.nearDeadline, 1)
  assert.equal(totals.dueToday, 2)
  assert.equal(totals.completedToday, 1)
  assert.equal(totals.oldestUnacknowledged, 30)
  assert.equal(row.earliestSla, new Date(`${date}T12:15:00`).getTime())
})
test("maintenance treats stale/future/out-of-range health and future communication as unknown", () => {
  for (const health of [
    { score: 80, observedAt: "2026-09-08T12:00:00" },
    { score: 101, observedAt: `${date}T11:00:00` },
    { score: 80, observedAt: `${date}T13:00:00` },
  ])
    assert.equal(
      buildMaintenanceStation(maintenanceInput({ health }), now).health,
      null,
    )
  const zero = buildMaintenanceStation(
    maintenanceInput({
      health: { score: 0, observedAt: `${date}T11:00:00` },
      communication: { lastSeenAt: `${date}T13:00:00`, status: "online" },
    }),
    now,
  )
  assert.equal(zero.health, 0)
  assert.equal(zero.communication, null)
  assert.equal(zero.lastSeen, null)
  const stale = buildMaintenanceStation(
    maintenanceInput({
      communication: { lastSeenAt: `${date}T11:30:00`, status: "online" },
    }),
    now,
  )
  assert.equal(stale.communication, "offline")
})
test("maintenance queue SLA order handles overdue and unknown deadlines independently from severity", () => {
  const row = buildMaintenanceStation(
    maintenanceInput({
      alarms: [maintenanceAlarm({ slaDueAt: undefined })],
      workOrders: [
        {
          id: "w1",
          title: "Urgent",
          status: "pending",
          dueAt: `${date}T11:30:00`,
        },
      ],
    }),
    now,
  )
  assert.equal(maintenanceQueue([row], "sla")[0].id, "w1")
  assert.equal(maintenanceQueue([row], "combined")[0].id, "a1")
})
test("maintenance explicit station history overrides seeded alarms, and unknown counts do not become zero", () => {
  const row = buildMaintenanceStation(
    { ...maintenanceInput({}), alarmHistory: [] },
    now,
  )
  assert.equal(row.alarmsKnown, true)
  assert.equal(row.critical, 0)
  const unknown = buildMaintenanceStation(maintenanceInput({}), now)
  assert.equal(maintenanceSummary([row, unknown], now).critical, null)
  assert.equal(maintenanceTrend([row, unknown], now).covered, 1)
})
test("demo maintenance history stays in the past as the wall clock advances", () => {
  const demoStation = {
    ...station,
    name: "Demo station",
    shortName: "Demo",
    code: "DEMO-01",
    manager: "Engineer",
    alerts: [{ msg: "Demo active alarm", time: "15:00", level: "critical" }],
    devices: { online: 1, fault: 0, offline: 0, building: 0 },
    maintenance: { source: "demo" },
  }
  const earlyNow = new Date(`${date}T15:00:00`)
  const lateNow = new Date(`${date}T15:30:00`)
  const early = buildMaintenanceStation(demoStation, earlyNow)
  const late = buildMaintenanceStation(demoStation, lateNow)
  assert.ok(
    early.alarms.every(
      (alarm) => new Date(alarm.occurredAt).getTime() <= earlyNow.getTime(),
    ),
  )
  assert.ok(
    late.alarms.every(
      (alarm) => new Date(alarm.occurredAt).getTime() <= lateNow.getTime(),
    ),
  )
  assert.equal(early.active.length, late.active.length)
  assert.equal(early.critical, late.critical)
})

const settlementStation = (records) => ({
  ...station,
  operations: { settlement: { source: "connected", records } },
})
const settlementRecord = (values = {}) => ({
  id: "s1",
  date,
  contract: "contract-1",
  currency: "CNY",
  realized: 100,
  settled: 70,
  pending: 30,
  disputed: 10,
  estimated: 500,
  adjustment: 0,
  income: {
    arbitrage: 60,
    demand: 30,
    response: 20,
    gridServices: 0,
    pv: 0,
    other: 0,
  },
  costs: { purchase: 5, operating: 5, penalty: 0 },
  ...values,
})
const settlementRange = { start: "2026-09-01", end: "2026-09-30" }

test("settlement explicit empty records override demo history", () => {
  const input = {
    ...settlementStation([]),
    revenueSource: "demo",
    revenueHistory: [{ date, settled: 70, pending: 30, est: 500 }],
  }
  assert.deepEqual(settlementRecords(input, date), [])
  assert.deepEqual(
    buildSettlementAccounts([input], settlementRange, "CNY", date),
    [],
  )
})
test("settlement excludes estimates and does not double-count disputed amounts", () => {
  const rows = settlementRecords(
    settlementStation([settlementRecord({ realized: undefined })]),
    date,
  )
  const totals = settlementTotals(rows)
  assert.equal(totals.realized, 100)
  assert.equal(totals.estimated, 500)
  assert.equal(totals.pending, 30)
  assert.equal(totals.disputed, 10)
  const demo = settlementRecords(
    {
      ...station,
      revenueSource: "demo",
      revenueHistory: [{ date, settled: 70, pending: 30, est: 500 }],
    },
    date,
  )
  assert.equal(demo[0].realized, 100)
  assert.equal(demo[0].demo, true)
})
test("settlement cent arithmetic preserves zero, negative adjustments and rounding", () => {
  assert.equal(sumSettlementMoney([0.1, 0.2]), 0.3)
  assert.equal(sumSettlementMoney([1.005]), 1.01)
  assert.equal(sumSettlementMoney([-1.005]), -1.01)
  assert.equal(sumSettlementMoney([0]), 0)
  assert.equal(sumSettlementMoney([null, undefined, NaN]), null)
  assert.equal(completeSettlementMoney([30, null]), null)
  const totals = settlementTotals(
    settlementRecords(
      settlementStation([
        settlementRecord({ realized: 0, adjustment: -10.25 }),
      ]),
      date,
    ),
  )
  assert.equal(totals.realized, 0)
  assert.equal(totals.adjustment, -10.25)
})
test("settlement missing values never become zero or an apparently complete total", () => {
  const rows = settlementRecords(
    settlementStation([
      settlementRecord(),
      settlementRecord({
        id: "s2",
        realized: null,
        settled: null,
        pending: null,
      }),
    ]),
    date,
  )
  assert.equal(settlementTotals(rows).realized, null)
  assert.equal(rows[1].realized, null)
  const history = settlementRecords(
    {
      ...station,
      revenueSource: "connected",
      revenueHistory: [{ date, settled: 10 }],
    },
    date,
  )
  assert.equal(history[0].realized, null)
  assert.equal(history[0].costs.penalty, null)
  assert.equal(history[0].evidence, undefined)
})
test("settlement separates currencies and contracts", () => {
  const input = settlementStation([
    settlementRecord(),
    settlementRecord({ id: "s2", contract: "contract-2" }),
    settlementRecord({ id: "usd", currency: "USD", realized: 999 }),
  ])
  const cny = buildSettlementAccounts([input], settlementRange, "CNY", date)
  assert.equal(cny.length, 2)
  assert.equal(cny[0].totals.realized, 100)
  const usd = buildSettlementAccounts([input], settlementRange, "USD", date)
  assert.equal(usd.length, 1)
  assert.equal(usd[0].totals.realized, 999)
})
test("settlement validates dates, filters recognition period and rejects future entries", () => {
  assert.equal(
    validSettlementRange({ start: "2026-02-30", end: "2026-03-01" }),
    false,
  )
  assert.equal(validSettlementRange({ start: "2026-09-11", end: date }), false)
  assert.equal(
    validSettlementRange({ start: "2024-02-29", end: "2024-02-29" }),
    true,
  )
  const input = settlementStation([
    settlementRecord(),
    settlementRecord({ id: "past", date: "2026-08-31" }),
    settlementRecord({ id: "future", date: "2026-09-11" }),
    settlementRecord({ id: "bad", date: "oops" }),
  ])
  assert.equal(settlementRecords(input, date).length, 2)
  assert.equal(
    buildSettlementAccounts([input], settlementRange, "CNY", date)[0].records
      .length,
    1,
  )
})
test("settlement duplicate ids replace whole records and preserve explicit nulls", () => {
  const rows = settlementRecords(
    settlementStation([settlementRecord(), { id: "s1", date, realized: null }]),
    date,
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].realized, null)
  assert.equal(rows[0].settled, null)
  assert.equal(rows[0].status, "unknown")
})
test("settlement derives statement differences without hiding offsetting mismatches", () => {
  const input = settlementStation([
    settlementRecord({ statementAmount: 125 }),
    settlementRecord({ id: "s2", statementAmount: 75 }),
  ])
  const account = buildSettlementAccounts(
    [input],
    settlementRange,
    "CNY",
    date,
  )[0]
  assert.equal(account.records[0].difference, 25)
  assert.equal(account.totals.difference, 0)
  assert.equal(account.maxDifference, 25)
  const rows = settlementRecords(
    settlementStation([
      settlementRecord({ difference: 0, statementAmount: 125 }),
    ]),
    date,
  )
  assert.equal(rows[0].difference, 0)
})
test("settlement progress requires explicit readiness and uses worst account status", () => {
  const input = settlementStation([
    settlementRecord({
      status: "settled",
      meterComplete: true,
      calculationComplete: true,
    }),
    settlementRecord({ id: "s2", status: "reviewing" }),
  ])
  const account = buildSettlementAccounts(
    [input],
    settlementRange,
    "CNY",
    date,
  )[0]
  assert.equal(account.status, "reviewing")
  assert.equal(account.metered, false)
  assert.equal(account.calculated, false)
  const disputed = buildSettlementAccounts(
    [
      settlementStation([
        settlementRecord({
          status: "disputed",
          meterComplete: true,
          calculationComplete: true,
        }),
      ]),
    ],
    settlementRange,
    "CNY",
    date,
  )[0]
  assert.equal(disputed.metered, true)
  assert.equal(disputed.calculated, true)
  assert.equal(disputed.status, "disputed")
})
test("settlement flags inconsistent balances without rewriting supplied money", () => {
  const account = buildSettlementAccounts(
    [settlementStation([settlementRecord({ realized: 110 })])],
    settlementRange,
    "CNY",
    date,
  )[0]
  assert.equal(account.balanceError, true)
  assert.equal(account.totals.realized, 110)
  const consistent = settlementRecords(
    settlementStation([
      settlementRecord({ realized: 0.3, settled: 0.1, pending: 0.2 }),
    ]),
    date,
  )
  assert.equal(consistent[0].balanceError, false)
})

test("explicit empty input never receives synthetic values", () => {
  const row = buildOperationsStation(
    { ...station, operations: { samples: [], plan: [] } },
    date,
    now,
  )
  assert.equal(row.storage, null)
  assert.equal(row.day.total, null)
  assert.equal(row.deviation, null)
  assert.equal(row.completeness, 0)
  assert.equal(row.demo, false)
  assert.equal(row.plan.periods.length, 0)
  assert.ok(row.power.every((p) => p.storage === null))
})
test("local preview follows snapshot values and does not claim actual completeness", () => {
  const row = buildOperationsStation(station, date, now)
  const updated = buildOperationsStation(
    { ...station, activePower: 400 },
    date,
    now,
  )
  assert.equal(row.storage, 300)
  assert.equal(row.completeness, null)
  assert.equal(row.demo, true)
  assert.notEqual(row.power[1].storage, updated.power[1].storage)
})
test("date selection and revenue total preserve zero and negative amounts", () => {
  const history = [
    { date, amount: 0, peakValley: 100 },
    { date, amount: -50 },
    { date, settled: 100, pending: 25, est: 5, amount: 999 },
    { date: "2026-09-09", amount: 20 },
    { date: "2026-09-11", amount: 1000 },
    { date: "2026-08-31", amount: 999 },
  ]
  const row = buildOperationsStation(
    { ...station, revenueHistory: history },
    date,
    now,
  )
  assert.equal(row.day.total, 80)
  assert.equal(row.month.total, 100)
  assert.equal(row.day.settled, 100)
})
test("samples normalize duplicate timestamps, discard future values, and recompute deviation", () => {
  const row = buildOperationsStation(
    {
      ...station,
      operations: {
        samples: [
          sample("00:15", { storage: 200, plannedStorage: 200, soc: 60 }),
          sample("00:00", { storage: 100, plannedStorage: 80 }),
          { timestamp: `${date}T00:15:00`, soc: 65 },
          sample("23:00", { storage: 999 }),
          { timestamp: "invalid", storage: 1000 },
        ],
      },
    },
    date,
    now,
  )
  assert.equal(row.storage, 200)
  assert.equal(row.soc, 65)
  assert.equal(row.power[1].load, 400)
  assert.ok(Math.abs(row.deviation - (20 / 280) * 100) < 1e-8)
  assert.ok(Math.abs(row.completeness - (2 / 49) * 100) < 1e-8)
})
test("invalid signal remains a gap and missing station is never summed as zero", () => {
  const a = buildOperationsStation(
    {
      ...station,
      operations: {
        samples: [sample("00:00"), sample("00:15", { load: NaN })],
      },
    },
    date,
    now,
  )
  const b = buildOperationsStation(
    { ...station, operations: { samples: [sample("00:00")] } },
    date,
    now,
  )
  const portfolio = portfolioPower([a, b])
  assert.equal(portfolio[0].load, 800)
  assert.equal(portfolio[1].storage, null)
  assert.equal(portfolio[1].load, null)
})
test("energy integrates the actual power and stops at gaps", () => {
  const power = [0, 15, 30, 45].map((minute) => ({
    minute,
    load: 100,
    pv: 40,
    storage: -20,
    grid: 80,
  }))
  const energy = powerToEnergy(power)
  assert.equal(energy[2].load, 50)
  assert.equal(energy[2].storage, -10)
  power[1].load = null
  const gaps = powerToEnergy(power)
  assert.equal(gaps[1].load, null)
  assert.equal(gaps[3].load, null)
  assert.equal(gaps[3].pv, 30)
})
test("telemetry grid calculation includes generation and rejects voltage as power", () => {
  const row = buildOperationsStation(
    {
      ...station,
      telemetryHistory: [
        {
          timestamp: `${date}T00:00:00`,
          values: {
            load: 500,
            pv: 100,
            storage: 100,
            generator: 50,
            gridVoltage: 400,
          },
        },
      ],
    },
    date,
    now,
  )
  assert.equal(row.power[0].grid, 250)
  const missing = buildOperationsStation(
    {
      ...station,
      telemetryHistory: [
        {
          timestamp: `${date}T00:00:00`,
          values: { load: 500, gridVoltage: 400 },
        },
      ],
    },
    date,
    now,
  )
  assert.equal(missing.power[0].grid, null)
})
test("plans select date, reject invalid periods, and identify overlaps", () => {
  const period = {
    id: "a",
    date,
    start: "00:00",
    end: "06:00",
    mode: "charge",
    power: 100,
  }
  const result = stationPlan(
    {
      ...station,
      operations: {
        plan: [
          period,
          { ...period, id: "b", start: "05:00", end: "07:00" },
          { ...period, id: "c", start: "bad" },
          { ...period, id: "d", date: "2026-09-11" },
        ],
      },
    },
    date,
  )
  assert.equal(result.periods.length, 2)
  assert.equal(result.overlap, true)
})

const dispatchPeriod = {
  id: "p",
  date,
  start: "00:00",
  end: "24:00",
  mode: "discharge",
  power: 100,
}
test("dispatch aligns measured and planned samples and computes exact error metrics", () => {
  const row = dispatchStation(
    {
      ...station,
      operations: {
        plan: [dispatchPeriod],
        samples: [
          sample("00:00", { storage: 120 }),
          sample("00:15", { storage: 40 }),
        ],
      },
    },
    date,
    new Date("2026-09-11T12:00:00"),
  )
  const model = dispatchPortfolio([row], 15)
  assert.equal(row.current.delta, -60)
  assert.equal(model.mae, 40)
  assert.equal(model.rmse, Math.sqrt(2000))
  assert.equal(model.energy, -10)
  assert.equal(model.worst.minute, 15)
  assert.equal(model.completeness, (2 / 96) * 100)
})
test("dispatch does not fill missing measurements or use future samples", () => {
  const row = dispatchStation(
    {
      ...station,
      operations: {
        plan: [dispatchPeriod],
        samples: [sample("00:00"), sample("23:00", { storage: 1000 })],
      },
    },
    date,
    now,
  )
  assert.equal(row.current.actual, null)
  assert.equal(row.current.delta, null)
  assert.equal(row.status, "数据缺失")
  assert.equal(row.points[92].actual, null)
  const model = dispatchPortfolio([row], 60)
  assert.equal(model.grouped[0].actual, null)
  assert.equal(model.grouped[0].delta, null)
})
test("dispatch samples can supply signed target independently from the schedule", () => {
  const row = dispatchStation(
    {
      ...station,
      operations: {
        samples: [sample("12:00", { storage: -40, plannedStorage: -50 })],
        plan: [],
      },
    },
    date,
    now,
  )
  assert.equal(row.current.planned, -50)
  assert.equal(row.current.delta, 10)
  assert.equal(row.percent, 20)
  assert.equal(row.hasPlan, true)
})
test("dispatch weights transitions inside a fifteen minute bucket", () => {
  const row = dispatchStation(
    {
      ...station,
      operations: {
        samples: [],
        plan: [
          { ...dispatchPeriod, end: "00:05", mode: "charge", power: 60 },
          { ...dispatchPeriod, id: "p2", start: "00:05", power: 120 },
        ],
      },
    },
    date,
    now,
  )
  assert.equal(row.points[0].planned, 60)
})
test("dispatch preserves empty plans and marks conflicts", () => {
  const row = dispatchStation(
    { ...station, operations: { samples: [], plan: [] } },
    date,
    now,
  )
  assert.equal(row.hasPlan, false)
  assert.equal(dispatchPortfolio([row]).mae, null)
  const conflict = dispatchStation(
    {
      ...station,
      operations: {
        samples: [],
        plan: [dispatchPeriod, { ...dispatchPeriod, id: "other" }],
      },
    },
    date,
    now,
  )
  assert.equal(conflict.status, "计划冲突")
  assert.equal(conflict.hasPlan, false)
})
test("future dispatch has targets but no execution samples", () => {
  const row = dispatchStation(
    { ...station, operations: { samples: [], plan: [dispatchPeriod] } },
    date,
    new Date("2026-09-09T12:00:00"),
  )
  assert.equal(row.status, "待执行")
  assert.equal(row.current.planned, 100)
  assert.equal(row.current.actual, null)
  assert.equal(dispatchPortfolio([row]).completeness, null)
})
test("draft validation rejects overlapping, invalid and over-rated plans", () => {
  const draft = {
    stationId: station.id,
    date,
    kind: "dayAhead",
    periods: [dispatchPeriod],
    note: "test",
  }
  assert.equal(validateDispatchDraft(draft, [station]).periods[0].power, 100)
  assert.throws(
    () =>
      validateDispatchDraft(
        { ...draft, periods: [dispatchPeriod, dispatchPeriod] },
        [station],
      ),
    /重叠/,
  )
  assert.throws(
    () =>
      validateDispatchDraft(
        { ...draft, periods: [{ ...dispatchPeriod, power: 501 }] },
        [station],
      ),
    /上限/,
  )
  assert.throws(
    () => validateDispatchDraft({ ...draft, date: "2026-02-30" }, [station]),
    /日期/,
  )
  assert.throws(
    () =>
      validateDispatchDraft(
        { ...draft, periods: [{ ...dispatchPeriod, mode: "standby" }] },
        [station],
      ),
    /待机/,
  )
  assert.throws(
    () => validateDispatchDraft({ ...draft, stationId: "missing" }, [station]),
    /站点/,
  )
})

function marketFixture(overrides = {}) {
  return {
    ...station,
    name: "Market station",
    project: "P",
    region: "East",
    code: "S1",
    operations: {
      market: {
        source: "connected",
        area: "East",
        portfolio: "A",
        qualifications: [
          { kind: "response", status: "valid", validUntil: "2026-12-31" },
        ],
        capacity: {
          timestamp: `${date}T12:00:00`,
          up: 200,
          down: 100,
          occupied: 50,
          durationHours: 2,
        },
        prices: [{ timestamp: `${date}T11:00:00`, price: 500 }],
      },
      marketServices: [
        {
          id: "r",
          eventId: "shared-event",
          date,
          kind: "response",
          name: "需求响应",
          start: "11:00",
          end: "13:00",
          capacity: 100,
          revenue: 200,
          status: "执行中",
          delivery: [{ timestamp: `${date}T11:00:00`, power: 80 }],
        },
      ],
    },
    ...overrides,
  }
}
test("market explicitly empty data remains empty instead of generating examples", () => {
  const row = marketStation(
    { ...station, operations: { marketServices: [], market: {} } },
    date,
    now,
  )
  assert.equal(row.demo, false)
  assert.equal(row.services.length, 0)
  assert.equal(row.capacity, null)
  assert.equal(marketServices([row]).length, 0)
  assert.ok(
    marketTimeline([row], [], date, now).every(
      (p) => p.actual === null && p.price === null,
    ),
  )
})
test("market qualifications expire and stale capacity cannot support applications", () => {
  const source = marketFixture()
  source.operations.market.qualifications[0].validUntil = "2026-09-09"
  assert.deepEqual(marketStation(source, date, now).validKinds, [])
  source.operations.market.capacity.timestamp = `${date}T11:00:00`
  const stale = marketStation(source, date, now)
  assert.equal(stale.capacity.up, null)
  assert.equal(stale.constraint, "能力数据已过期")
})
test("market groups the same event without adding its market price twice", () => {
  const a = marketStation(marketFixture(), date, now),
    b = marketStation(marketFixture({ id: "2" }), date, now)
  const services = marketServices([a, b])
  assert.equal(services.length, 1)
  assert.equal(services[0].capacity, 200)
  assert.equal(services[0].revenue, 400)
  const point = marketTimeline([a, b], services, date, now)[44]
  assert.equal(point.price, 500)
  assert.equal(point.actual, 160)
  assert.equal(point.committed, 200)
})
test("market delivery is not station storage and does not fill missing members", () => {
  const source = marketFixture({ activePower: 9999 })
  const a = marketStation(source, date, now)
  const other = marketFixture({ id: "2" })
  other.operations.marketServices[0].delivery = []
  const b = marketStation(other, date, now)
  assert.equal(
    marketTimeline([a], marketServices([a]), date, now)[44].actual,
    80,
  )
  assert.equal(
    marketTimeline([a, b], marketServices([a, b]), date, now)[44].actual,
    null,
  )
})
test("market prices support negative prices and ignore conflicting observations", () => {
  const source = marketFixture()
  source.operations.market.prices = [
    { timestamp: `${date}T11:00:00`, price: -100 },
    { timestamp: `${date}T11:05:00`, price: 300 },
  ]
  const a = marketStation(source, date, now)
  assert.equal(marketTimeline([a], [], date, now)[44].price, 100)
  const other = marketFixture({ id: "2" }),
    b = marketStation(other, date, now)
  assert.equal(marketTimeline([a, b], [], date, now)[44].price, null)
})
test("market future delivery is excluded and cancelled commitments do not count", () => {
  const source = marketFixture()
  source.operations.marketServices[0].delivery = [
    { timestamp: `${date}T12:15:00`, power: 50 },
  ]
  const row = marketStation(source, date, now)
  assert.equal(
    marketTimeline([row], marketServices([row]), date, now)[49].actual,
    null,
  )
  source.operations.marketServices[0].status = "已取消"
  const cancelled = marketStation(source, date, now)
  assert.equal(marketServices([cancelled])[0].capacity, null)
  assert.equal(
    marketTimeline([cancelled], marketServices([cancelled]), date, now)[44]
      .committed,
    null,
  )
})
test("market historical capacity is date scoped and not overwritten by current offline state", () => {
  const source = marketFixture({ status: "offline" })
  assert.equal(
    marketStation(source, date, new Date("2026-09-11T12:00:00")).capacity.up,
    200,
  )
  assert.equal(marketStation(source, "2026-09-09", now).capacity, null)
})
test("market applications validate qualification, duration, capacity and overlapping drafts", () => {
  const rows = [marketStation(marketFixture(), date, now)]
  const draft = {
    stationId: "1",
    date,
    kind: "response",
    direction: "up",
    start: "14:00",
    end: "15:00",
    capacity: 100,
    note: "",
  }
  assert.equal(validateMarketApplication(draft, rows).capacity, 100)
  assert.throws(
    () => validateMarketApplication({ ...draft, capacity: 201 }, rows),
    /容量/,
  )
  assert.throws(
    () => validateMarketApplication({ ...draft, end: "18:00" }, rows),
    /时长/,
  )
  assert.throws(
    () => validateMarketApplication({ ...draft, kind: "reserve" }, rows),
    /资格/,
  )
  assert.throws(
    () =>
      validateMarketApplication({ ...draft, capacity: 150 }, rows, [
        { ...draft, id: "saved" },
      ]),
    /重叠/,
  )
  assert.equal(
    validateMarketApplication(
      { ...draft, start: "15:00", end: "16:00", capacity: 150 },
      rows,
      [{ ...draft, id: "saved" }],
    ).capacity,
    150,
  )
})
