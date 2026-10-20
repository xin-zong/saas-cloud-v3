const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
function load(name, cache = new Map()) {
  if (cache.has(name)) return cache.get(name)
  const exports = {}
  cache.set(name, exports)
  const filename = path.resolve(__dirname, "../src", name + ".ts")
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  new Function("exports", "require", code)(exports, (dep) =>
    load(
      dep.startsWith("@/")
        ? dep.slice(2)
        : path.posix.normalize(path.posix.join(path.posix.dirname(name), dep)),
      cache,
    ),
  )
  return exports
}
test("manually closed alarm stays historical without invented recovery and no active risk", () => {
  const { buildMaintenanceStation } = load("data/stationMaintenance")
  const now = new Date("2026-10-17T12:00:00Z")
  const row = buildMaintenanceStation(
    {
      id: "9",
      name: "站点",
      maintenance: {
        source: "connected",
        alarms: [
          {
            id: "17",
            title: "温度超限",
            device: "BMS",
            severity: "critical",
            status: "closed",
            occurredAt: "2026-10-17T10:00:00Z",
            closedAt: "2026-10-17T11:00:00Z",
          },
        ],
      },
    },
    now,
  )
  assert.equal(row.alarms.length, 1)
  assert.equal(row.alarms[0].status, "closed")
  assert.equal(row.alarms[0].recoveredAt, undefined)
  assert.equal(row.active.length, 0)
  assert.equal(row.critical, 0)
})
test('minor alarms remain visible in maintenance counts, trend bins and queue',()=>{const m=load('data/stationMaintenance'),now=new Date('2026-10-19T12:00:00Z');const row=m.buildMaintenanceStation({id:'9',name:'Station',manager:'Owner',maintenance:{source:'connected',alarms:[{id:'minor-1',title:'Minor',device:'PCS',severity:'minor',status:'active',occurredAt:'2026-10-19T11:00:00Z'}]}},now);assert.equal(row.active.length,1);assert.equal(row.alarms[0].severity,'minor');const trend=m.maintenanceTrend([row],now);assert.equal(trend.counts.minor,1);assert.equal(trend.total,1);assert.equal(trend.peak.minor,1);assert.equal(m.maintenanceQueue([row],'combined')[0].severity,'minor')});
