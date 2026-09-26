const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")

function loadModule(path, cache = new Map()) {
  if (cache.has(path)) return cache.get(path)
  const source = fs.readFileSync(`${__dirname}/../src/${path}.ts`, "utf8").replaceAll("import.meta.env", "{}")
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  cache.set(path, exports)
  new Function("exports", "require", code)(exports, (name) => {
    if (name === "@/api/client") return loadModule("api/client", cache)
    throw new Error(`Unexpected import: ${name}`)
  })
  return exports
}

function setup() {
  const storage = new Map()
  const events = []
  global.sessionStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) }
  global.window = { dispatchEvent: (event) => events.push(event.type) }
  return { ...loadModule("components/apiAnalytics"), client: loadModule("api/client"), events }
}

test("missing values never become zero and report date validation rejects impossible or oversized ranges", async () => {
  const service = setup()
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 0, data: [
    { timestamp: 1000, value: null, samples: 2 }, { timestamp: 2000, value: 0, samples: 1 },
    { timestamp: 3000, value: 3, samples: null }, { timestamp: 4000, value: 4, samples: 0 },
  ] }) })
  const rows = await service.loadHistory('17', new Date(0), new Date(5000), 1)
  assert.deepEqual(rows, [{ timestamp: 2000, value: 0, samples: 1 }])
  await assert.rejects(service.downloadServerReport('12', 'health', '2026-02-30', '2026-03-02'), /有效/)
  await assert.rejects(service.downloadServerReport('12', 'health', '2024-01-01', '2026-03-02'), /一年/)
})

test("authorized point metadata and sparse history preserve actual buckets", async () => {
  const service = setup()
  service.client.setToken("token")
  const urls = []
  global.fetch = async (url, options) => {
    urls.push(String(url))
    assert.equal(options.headers.Authorization, "Bearer token")
    if (String(url).includes("/points/17/history")) return { ok: true, status: 200, json: async () => ({ code: 0, data: [{timestamp: 1760000000000, value: 0, samples: 2}, {timestamp: 1760000900000, value: 5.5, samples: 1}] }) }
    return { ok: true, status: 200, json: async () => ({ code: 0, data: [{id: 17, device_id: 4, name: "有功功率", unit: "kW"}] }) }
  }
  const points = await service.loadPoints("12")
  assert.deepEqual(points, [{ id: "17", device_id: "4", name: "有功功率", unit: "kW" }])
  const rows = await service.loadHistory("17", new Date("2025-10-09T00:00:00Z"), new Date("2025-10-10T00:00:00Z"), 15)
  assert.deepEqual(rows.map((row) => row.value), [0, 5.5])
  assert.equal(rows.length, 2)
  assert.match(urls[1], /minutes=15/)
  assert.match(service.historyCsv(points[0], rows), /有功功率/)
  await assert.rejects(service.loadHistory("17", new Date("2025-01-01"), new Date("2025-03-01"), 15), /31 天/)
})

test("server report uses bearer CSV and surfaces errors without a fake file", async () => {
  const service = setup()
  service.client.setToken("token")
  let saves = 0
  global.URL.createObjectURL = () => { saves++; return "blob:test" }
  global.URL.revokeObjectURL = () => {}
  global.document = { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) }
  global.window.setTimeout = () => {}
  global.fetch = async (url, options) => {
    assert.match(String(url), /stations\/12\/reports\/revenue\?from=2025-01-01&to=2025-01-31/)
    assert.equal(options.headers.Authorization, "Bearer token")
    return { ok: true, status: 200, headers: { get: () => "text/csv;charset=UTF-8" }, blob: async () => new Blob(["date,amount\n"]) }
  }
  await service.downloadServerReport("12", "revenue", "2025-01-01", "2025-01-31")
  assert.equal(saves, 1)
  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ msg: "无权导出" }) })
  await assert.rejects(service.downloadServerReport("12", "revenue", "2025-01-01", "2025-01-31"), /无权导出/)
  assert.deepEqual(service.events, ["enerlution:permissions-changed"])
  assert.equal(saves, 1)
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ msg: "会话失效" }) })
  await assert.rejects(service.downloadServerReport("12", "revenue", "2025-01-01", "2025-01-31"), /会话失效/)
  assert.equal(service.client.getToken(), null)
  assert.deepEqual(service.events, ["enerlution:permissions-changed", "enerlution:unauthorized"])
})
