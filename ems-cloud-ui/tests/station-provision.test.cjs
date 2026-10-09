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
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
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
    code: "SITE-NEW", organization: "测试组织",
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

test('new templates supply distinct editable topologies and preserve blank choice', () => {
 const {buildTemplate} = moduleResult.exports
 assert.equal(typeof buildTemplate, 'function')
 const solar=buildTemplate('光储协同'), storage=buildTemplate('工商业储能'), charging=buildTemplate('光储充')
 assert.ok(solar.devices.some(d=>d.type==='光伏'))
 assert.ok(!storage.devices.some(d=>d.type==='光伏'))
 assert.ok(charging.devices.some(d=>d.name.includes('充电')))
 assert.equal(buildTemplate('自定义空白拓扑').devices.length,0)
 assert.ok(solar.connections.length>0)
 assert.notEqual(solar.devices[0].id,buildTemplate('光储协同').devices[0].id)
})
test('graph validation rejects dangling edges, invalid meter references and missing communication targets', () => {
 const {validateGraph,buildTemplate}=moduleResult.exports
 assert.equal(typeof validateGraph,'function')
 const d={...emptyProvision(),...buildTemplate('光储协同')}
 const meter=d.devices.find(d=>d.type==='电表');meter.gridId='missing'
 d.connections.push({id:'broken',from:'missing',to:d.devices[0].id,kind:'AC'})
 assert.ok(validateGraph(d).some(e=>e.includes('并网点')))
 assert.ok(validateGraph(d).some(e=>e.includes('失效')))
})

test('legacy draft migration retains device communication settings and bus relationships',()=>{
 const d=emptyProvision();delete d.connections;delete d.template;d.buses=['交流母线'];d.devices=[{id:'old',type:'PCS',name:'旧设备',protocol:'Modbus TCP',interface:'LAN 1',ip:'192.168.1.7',port:'502',address:'1',bus:'交流母线',baud:'9600',parity:'无校验',bits:'8 / 1'}]
 const migrated=parseDraft(JSON.stringify(d));assert.equal(migrated.devices.find(d=>d.id==='old').ports[0].ip,'192.168.1.7');assert.equal(migrated.connections.length,1);assert.equal(migrated.devices.filter(d=>d.type==='EMS').length,1);assert.deepEqual(parseDraft(JSON.stringify(migrated)),migrated)
})
test('communication protocol mismatch and dangling targets cannot pass validation',()=>{
 const {createDevice,validateGraph}=moduleResult.exports
 const a=createDevice('PCS',1), b=createDevice('EMS',1);a.ports=[{id:'P01',interface:'COM-1',protocol:'Modbus TCP',role:'服务端 / 从站',ip:'192.168.1.1',port:'502',address:'1',version:'',targets:[`${b.id}/P99`]}];const errors=validateGraph({...emptyProvision(),devices:[a,b]});assert.ok(errors.some(e=>e.includes('接口与协议')));assert.ok(errors.some(e=>e.includes('目标端口失效')))
})
