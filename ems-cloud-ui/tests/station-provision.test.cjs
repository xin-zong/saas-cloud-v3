const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const ts = require("typescript")
const source = fs.readFileSync(
  require("node:path").join(
    __dirname,
    "../src/components/station-provision/model.ts",
  ),
  "utf8",
)
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const moduleResult = { exports: {} }
new Function("exports", "module", output)(moduleResult.exports, moduleResult)
const {
  emptyProvision,
  validateBasics,
  validateTopology,
  deploymentStages,
  parseDraft,
} = moduleResult.exports
test("basic information blocks advancing with missing or invalid required values", () => {
  assert.ok(validateBasics(emptyProvision()).length > 0)
  const valid = {
    ...emptyProvision(),
    name: "园区储能站",
    region: "华东",
    address: "工业园",
    ratedPower: "100",
    storageCapacity: "200",
  }
  assert.deepEqual(validateBasics(valid), [])
  assert.ok(validateBasics({ ...valid, ratedPower: "-1" }).length)
})
test("topology validation rejects empty devices and duplicate communication addresses", () => {
  assert.ok(validateTopology([]).length)
  const device = {
    id: "a",
    type: "PCS",
    name: "PCS 1",
    protocol: "Modbus TCP",
    interface: "LAN 1",
    ip: "192.168.1.1",
    port: "502",
    address: "1",
    bus: "交流母线",
    baud: "9600",
    parity: "无校验",
    bits: "8 / 1",
  }
  assert.deepEqual(validateTopology([device]), [])
  assert.ok(
    validateTopology([device, { ...device, id: "b" }]).some((x) =>
      x.includes("冲突"),
    ),
  )
  assert.ok(validateTopology([{ ...device, ip: "999.0.0.1" }]).length)
  for (const interfaceName of ["COM 1", "LAN 1"]) {
    assert.ok(validateTopology([
      { ...device, interface: interfaceName },
      { ...device, id: "b", interface: interfaceName, address: "01", port: "0502", ip: "192.168.001.001" },
    ]).some(x => x.includes("冲突")))
  }
})
test("unconnected backend never reports deployment success", () => {
  assert.ok(deploymentStages.every((x) => x.status === "unavailable"))
  assert.equal(deploymentStages.length, 6)
})
test("corrupt or unrelated local drafts are discarded", () => {
  assert.equal(parseDraft("{"), null)
  assert.equal(parseDraft('{"name":"legacy"}'), null)
  const draft = emptyProvision()
  assert.equal(parseDraft(JSON.stringify(draft)).name, "")
})
test("provision storage separates identity, mode, new stations and existing stations", () => {
  const { provisionDraftKey } = moduleResult.exports
  assert.equal(typeof provisionDraftKey, "function")
  const keys = []
  for (const identity of ["A", "B", "A:api"]) {
    for (const demo of [false, true]) {
      for (const station of [undefined, "12", "13", "new"]) {
        const key = provisionDraftKey(identity, demo, station)
        assert.notEqual(key, "enerlution_station_provision_v1")
        assert.notEqual(key, `enerlution_station_provision_v1_${station}`)
        keys.push(key)
      }
    }
  }
  assert.equal(new Set(keys).size, keys.length)
})
