const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")

function load(path, cache = new Map()) {
  if (cache.has(path)) return cache.get(path)
  const source = fs.readFileSync(`${__dirname}/../src/${path}.ts`, "utf8").replaceAll("import.meta.env", "{}")
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  cache.set(path, exports)
  new Function("exports", "require", code)(exports, (name) => {
    if (name === "./roles") return load("auth/roles", cache)
    throw new Error(`Unexpected import: ${name}`)
  })
  return exports
}

test("allRows reads 1001 settlement records through every server page", async () => {
  const storage = new Map()
  global.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  global.window = { dispatchEvent() {} }
  const client = load("api/client")
  client.setToken("page-token")
  const offsets = []
  global.fetch = async (url, options) => {
    const request = new URL(url)
    assert.equal(options.headers.Authorization, "Bearer page-token")
    assert.equal(request.pathname, "/api/stations/12/settlements")
    assert.equal(request.searchParams.get("from"), "2025-01-01")
    assert.equal(request.searchParams.get("to"), "2025-12-31")
    assert.equal(request.searchParams.get("limit"), "100")
    const offset = Number(request.searchParams.get("offset"))
    offsets.push(offset)
    return { ok: true, status: 200, json: async () => ({ code: 0, data: Array.from({ length: Math.max(0, Math.min(100, 1001 - offset)) }, (_, index) => ({ id: offset + index + 1 })) }) }
  }
  const rows = await client.allRows("/stations/12/settlements?from=2025-01-01&to=2025-12-31")
  assert.equal(rows.length, 1001)
  assert.equal(rows.at(-1).id, 1001)
  assert.deepEqual(offsets, [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])
})

test("API navigation follows effective permissions, not role demo menus", () => {
  const { apiRoleConfig } = load("auth/apiPermissions")
  const user = (permissions) => ({ id: "7", name: "User", account: "u@test", role: "owner", organization: "", stationIds: ["12"], permissions })
  const none = apiRoleConfig(user([]))
  assert.equal(none.nav.includes("分析与报告"), false)
  assert.equal(none.stationSubNavs.includes("运行曲线"), false)
  const telemetry = apiRoleConfig(user(["telemetry.read"]))
  assert.deepEqual(telemetry.analysisTabs, ["数据分析", "数据下载"])
  assert.equal(telemetry.stationSubNavs.includes("运行曲线"), true)
  assert.equal(telemetry.reportTypes.length, 0)
  const exportOnly = apiRoleConfig(user(["report.export"]))
  assert.equal(exportOnly.nav.includes("分析与报告"), false)
  const revenue = apiRoleConfig(user(["report.export", "revenue.read"]))
  assert.deepEqual(revenue.reportTypes, ["收益报告"])
  assert.deepEqual(revenue.analysisTabs, ["报告中心"])
  assert.equal(revenue.stationSubNavs.includes("运营收益"), true)
  const asset = apiRoleConfig(user(["asset.read"]))
  assert.equal(asset.stationSubNavs.includes("一次接线图"), true)
  assert.equal(apiRoleConfig(user(["revenue.review"])).nav.includes("运营中心"), false)
})
