const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")
function load() {
  const calls = [],
    exports = {}
  const compilation = ts.transpileModule(
    fs.readFileSync(`${__dirname}/../src/api/alarmWorkspace.ts`, "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS }, reportDiagnostics: true },
  )
  assert.deepEqual(compilation.diagnostics, [], "API module must parse before contract tests")
  const code = compilation.outputText
  new Function("exports", "require", code)(exports, () => ({
    api: async (path) => {
      calls.push({ path })
      return { items: [], total: 0 }
    },
    send: async (path, method, body) => {
      calls.push({ path, method, body })
      return { id: 17, version: 3 }
    },
  }))
  return { s: exports, calls }
}
test("detail is read-only and read receipts use explicit batch command distinct from acknowledgement", async () => {
  const { s, calls } = load()
  await s.alarmDetail(17)
  assert.deepEqual(calls, [{ path: "/alarms/workspace/17" }])
  await s.markAlarmsRead([17, 18])
  assert.deepEqual(calls[1], {
    path: "/alarms/workspace/read",
    method: "POST",
    body: { ids: [17, 18] },
  })
  await s.handleAlarm({ id: 17, version: 2 }, "close", "现场确认关闭")
  assert.deepEqual(calls[2].body, { expectedVersion: 2, note: "现场确认关闭" })
  assert.equal(calls[2].path, "/alarms/workspace/17/close")
})
test("query keeps server pagination and source/time/read filters and rule toggle preserves version", async () => {
  const { s, calls } = load()
  await s.queryAlarms({
    stationId: "9",
    view: "history",
    source: "rule",
    severity: "info",
    readFlag: "unread",
    offset: 40,
    limit: 20,
    start: "2026-10-01T00:00:00Z",
  })
  const url = new URL(calls[0].path, "http://local")
  for (const [key, value] of Object.entries({
    stationId: "9",
    view: "history",
    source: "rule",
    severity: "info",
    readFlag: "unread",
    offset: "40",
  }))
    assert.equal(url.searchParams.get(key), value)
  await s.toggleAlarmRule({ id: 3, version: 4, enabled: true })
  assert.deepEqual(calls[1], {
    path: "/alarm-rules/3/enabled",
    method: "POST",
    body: { expectedVersion: 4, enabled: false },
  })
})
