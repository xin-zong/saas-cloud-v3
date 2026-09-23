const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(file, cache = {}) {
  file = path.resolve(__dirname, '../src', file)
  if (cache[file]) return cache[file]
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8').replaceAll('import.meta.env', '{}'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const exports = cache[file] = {}
  new Function('exports', 'require', source)(exports, name => load(path.resolve(path.dirname(file), name + '.ts'), cache))
  return exports
}
const user = { role: 'integrator', permissions: ['asset.read', 'asset.edit', 'workorder.create', 'customer.read'], stationIds: ['1', '2'], stationPermissions: {'1':['asset.read','asset.edit'], '2':['asset.read']}, organizationPermissions: {} }
test('station action membership never inherits writable navigation union', () => {
  const { hasStationPermission } = load('auth/apiPermissions.ts')
  assert.equal(hasStationPermission(user, '1', 'asset.edit'), true)
  assert.equal(hasStationPermission(user, '2', 'asset.edit'), false)
  assert.equal(hasStationPermission({...user, stationPermissions: undefined}, '1', 'asset.edit'), false)
})
test('independent customer and create-only workorder capabilities expose their existing pages', () => {
  const { apiRoleConfig } = load('auth/apiPermissions.ts')
  const config = apiRoleConfig({...user, permissions:['customer.read', 'workorder.create']})
  assert.ok(config.platformTabs.includes('客户管理'))
  assert.ok(config.workOrderViews.includes('工单中心'))
  assert.equal(config.nav.includes('资产与站点'), false)
  assert.equal(config.canCreateAlarmOrder, true)
})
test('tariff and approval read capabilities expose independent pages without borrowing review or asset permissions', () => {
  const { apiRoleConfig } = load('auth/apiPermissions.ts')
  const config = apiRoleConfig({...user, permissions:['tariff.manage','approval.read']})
  assert.ok(config.operationsTabs.includes('电价设置'))
  assert.ok(config.workOrderViews.includes('审批中心'))
  assert.equal(config.nav.includes('资产与站点'),false)
})
test('403 signals capability refresh once per request, excludes auth/me, and does not retain stale success', async () => {
  const storage = new Map(), events = []
  global.sessionStorage = { getItem: k => storage.get(k), setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) }
  global.window = { dispatchEvent: e => events.push(e.type) }
  const client = load('api/client.ts')
  client.setToken('one')
  global.fetch = async () => ({ok:false,status:403,json:async()=>({code:403,msg:'禁止'})})
  await assert.rejects(client.api('/stations/1'), /权限已变化/)
  assert.deepEqual(events, ['enerlution:permissions-changed'])
  await assert.rejects(client.api('/auth/me'))
  assert.equal(events.length, 1)
  global.fetch = async () => {client.setToken('two'); return {ok:true,status:200,json:async()=>({code:0,data:'old'})}}
  await assert.rejects(client.send('/members/1', 'PUT', {}), /会话已变化/)
  assert.equal(events.length, 1)
  global.fetch = async () => {client.setToken(null);client.setToken('two');return {ok:true,status:200,json:async()=>({code:0,data:'old'})}}
  await assert.rejects(client.api('/auth/me'), /会话已变化/)
})
