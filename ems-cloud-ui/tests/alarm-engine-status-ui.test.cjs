const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const preview = process.env.ALARM_PREVIEW_URL || 'http://127.0.0.1:8444'

function rule(id, evaluationStatus, evaluationReason) {
  return {
    id, station_id: 9, station_name: '测试站点', name: `规则${id}`,
    object_type: 'DEVICE', device_id: 19, severity: 'warning',
    conditions: [{ fields: [{ code: 'temperature', unit: '°C', cycleType: 'INSTANT', objectType: 'DEVICE' }], algorithm: 'self', period: 3, operator: 'gt', lower: 50, upper: null, statusValue: null, includeLower: false, includeUpper: false }],
    effective_start: 0, effective_end: 1440, recovery_duration: 120,
    solution: '', notification: { needed: false, maxCount: 1, channels: [], recipients: [], recoveryNotice: false },
    enabled: true, version: 1, evaluationStatus, evaluationReason,
    deliveryStatus: 'not_connected',
  }
}

async function setup(t, rules) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  const errors = [], writes = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/, r => r.abort())
  await page.route('**/src/auth/AuthContext.tsx*', r => r.fulfill({ contentType: 'text/javascript', body: 'const user={id:"7",permissions:["alarm.read","alarm.handle","telemetry.read"],stationPermissions:{"9":["alarm.read","alarm.handle","telemetry.read"]}};export function useAuth(){return {user}}' }))
  await page.route('**/src/main.tsx*', async r => {
    const source = await (await r.fetch()).text()
    const react = source.match(/["']([^"']*\/react\.js\?v=[^"']+)["']/)?.[1]
    const dom = source.match(/["']([^"']*\/react-dom_client\.js\?v=[^"']+)["']/)?.[1]
    assert.ok(react && dom)
    await r.fulfill({ contentType: 'text/javascript', body: `import React from '${react}';import ReactDOM from '${dom}';import Component from '/src/components/AlarmRulesPage.tsx';import '/src/index.css';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component,{stations:[{id:'9',name:'测试站点'}]}));` })
  })
  await page.route(url => url.pathname.startsWith('/api/'), async r => {
    const url = new URL(r.request().url())
    const method = r.request().method()
    const reply = data => r.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { code: 0, data, msg: 'ok' } })
    if (method === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization' } })
    if (method !== 'GET') writes.push({ path: url.pathname, body: r.request().postDataJSON() })
    if (url.pathname === '/api/alarm-rules' && method === 'GET') return reply(rules)
    if (url.pathname.endsWith('/enabled')) {
      const selected = rules.find(row => url.pathname === `/api/alarm-rules/${row.id}/enabled`)
      assert.equal(r.request().postDataJSON().expectedVersion, selected.version)
      selected.enabled = false
      selected.version++
      selected.evaluationStatus = 'disabled'
      selected.evaluationReason = '规则已停用，连续检测已重置'
      return reply(selected)
    }
    if (url.pathname === '/api/stations/9/points') return reply([{id:501,device_id:19,code:'stored_device_501',name:'真实设备功率',unit:'kW',source:'ems',sourceType:'stored_device',namespace:'device'},{id:502,device_id:20,code:'stored_device_502',name:'其他设备功率',unit:'W'}])
    if (url.pathname.endsWith('/options')) return reply({ devices: [{ id: 19, name: '测试设备' }], recipients: [] })
    return reply([])
  })
  await page.goto(preview, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '告警规则', exact: true }).waitFor()
  return { page, errors, writes }
}

test('rule rows show independent backend detection statuses and reasons without claiming notification delivery', { timeout: 90000 }, async t => {
  const cases = [
    ['ready', '待检测', '等待首次执行'],
    ['disabled', '检测停用', '检测开关关闭'],
    ['unsupported', '暂不支持', '当前不支持站级汇总'],
    ['waiting', '等待采样', '未绑定唯一测点'],
    ['active', '告警中', '连续超限已触发告警'],
    ['normal', '正常', '最近完整分钟正常'],
    ['unknown', '无法判定', '当前采样无效'],
    ['future_status', '检测状态未知', '新版本状态'],
  ]
  const { page, errors, writes } = await setup(t, cases.map(([status, , reason], i) => rule(i + 1, status, reason)))
  for (const [i, [, label, reason]] of cases.entries()) {
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: `规则${i + 1}`, exact: true }) })
    await row.getByText(`检测：${label}`, { exact: false }).waitFor()
    assert.ok((await row.textContent()).includes(reason))
    assert.ok((await row.textContent()).includes('通知未接通'))
  }
  await page.getByRole('row').filter({ hasText: '规则5' }).getByRole('button', { name: '详情', exact: true }).click()
  const detail = page.getByRole('dialog', { name: '规则详情', exact: true })
  await detail.getByText('检测：告警中', { exact: false }).waitFor()
  assert.ok((await detail.textContent()).includes('连续超限已触发告警'))
  assert.equal(writes.length, 0)
  assert.deepEqual(errors, [])
})

test('rule toggle refreshes backend detection state while preserving separate configuration state', { timeout: 90000 }, async t => {
  const { page, errors, writes } = await setup(t, [rule(1, 'active', '连续超限已触发告警')])
  await page.getByRole('button', { name: '停用', exact: true }).click()
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: '规则1', exact: true }) })
  await row.getByText('检测：检测停用', { exact: false }).waitFor()
  assert.ok((await row.textContent()).includes('已停用配置'))
  assert.ok((await row.textContent()).includes('规则已停用，连续检测已重置'))
  assert.deepEqual(writes, [{ path: '/api/alarm-rules/1/enabled', body: { expectedVersion: 1, enabled: false } }])
  assert.deepEqual(errors, [])
})


test('rule builder selects canonical device point and autofills unit without losing custom fields',{timeout:90000},async t=>{
 const {page,errors,writes}=await setup(t,[rule(1,'waiting','等待新鲜采样')]);
 await page.getByRole('button',{name:'编辑',exact:true}).click();
 const selector=page.getByRole('combobox',{name:'条件1指标1已登记测点',exact:true});await selector.selectOption('stored_device_501');
 assert.equal(await page.getByRole('textbox',{name:'条件1指标1',exact:true}).inputValue(),'stored_device_501');
 assert.equal(await page.getByRole('textbox',{name:'条件1指标1单位',exact:true}).inputValue(),'kW');
 assert.equal(await page.getByRole('combobox',{name:'条件1指标1周期',exact:true}).inputValue(),'INSTANT');
 assert.equal(await selector.locator('option[value="stored_device_502"]').count(),0);
 await page.getByRole('textbox',{name:'条件1指标1',exact:true}).fill('custom_power');
 assert.equal(await page.getByRole('textbox',{name:'条件1指标1',exact:true}).inputValue(),'custom_power');
 assert.equal(writes.length,0);assert.deepEqual(errors,[]);
});
