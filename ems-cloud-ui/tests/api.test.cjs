const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(name) {
  const source = ts.transpileModule(fs.readFileSync(`${__dirname}/../src/api/${name}.ts`, 'utf8').replaceAll('import.meta.env', '{}'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = {}
  new Function('exports', 'require', source)(exports, (name) => load(name.replace('./', '')))
  return exports
}
test('missing telemetry remains unknown and all demo fallback sources are closed', () => {
  const station = load('adapters').adaptStation({ id: 12, name: '真实站', rated_power_kw: '100', capacity_kwh: '200' })
  assert.equal(station.id, '12')
  assert.equal(station.ratedPower, 100)
  assert.ok(Number.isNaN(station.soc))
  assert.ok(Number.isNaN(station.activePower))
  assert.deepEqual(station.telemetryHistory, [])
  assert.deepEqual(station.revenueHistory, [])
  assert.equal(station.operations.source, 'connected')
  assert.equal(station.maintenance.source, 'connected')
})
test('planning preserves empty server schedules and rejects overlap and excessive power', () => {
  const planning = load('planning')
  assert.deepEqual(planning.planPeriods([]), [])
  assert.deepEqual(planning.planPeriods([{id:1,start_minute:0,end_minute:60,mode:'charge',power_kw:'25'}]), [{id:'1',start:'00:00',end:'01:00',mode:'charge',power:25}])
  assert.throws(() => planning.validatePlan([{id:'1',start:'00:00',end:'02:00',mode:'charge',power:50},{id:'2',start:'01:00',end:'03:00',mode:'discharge',power:10}], 100), /重叠/)
  assert.throws(() => planning.validatePlan([{id:'1',start:'00:00',end:'02:00',mode:'charge',power:101}], 100), /额定/)
  assert.throws(() => planning.validatePlan([], 100), /至少/)
})
test('client attaches token, unwraps data, clears unauthorized session and rejects business errors', async () => {
  const storage = new Map()
  global.sessionStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }
  global.window = { dispatchEvent() {} }
  const client = load('client')
  client.setToken('secret')
  global.fetch = async (_url, init) => { assert.equal(init.headers.Authorization, 'Bearer secret'); return { ok: true, status: 200, json: async () => ({code: 0, data: [1]}) } }
  assert.deepEqual(await client.api('/stations'), [1])
  global.fetch = async () => ({ok: false, status: 401, json: async () => ({code: 401, msg:'会话失效'})})
  await assert.rejects(client.api('/stations'), /会话失效/)
  assert.equal(client.getToken(), null)
  global.fetch = async () => ({ok: true, status: 200, json: async () => ({code: 409, msg:'冲突'})})
  await assert.rejects(client.api('/stations'), /冲突/)
})
