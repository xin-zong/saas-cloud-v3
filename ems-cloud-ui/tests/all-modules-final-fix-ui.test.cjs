const assert = require('node:assert/strict')
const { test } = require('node:test')
const { chromium } = require('playwright')

async function setup(t, { demo = false, inspection = false } = {}) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai' })
  page.setDefaultTimeout(10000)
  const errors = [], writes = []
  page.on('pageerror', error => errors.push(error.message))
  t.after(() => assert.deepEqual(errors, []))
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/, route => route.abort())
  const permissions = ['asset.read', 'market.read', 'market.manage', 'workorder.read', 'inspection.manage']
  const user = { id: '7', name: '回归人员', account: 'regression@test', role: inspection ? 'operator' : 'integrator', stationIds: ['12', '13'], permissions, stationPermissions: { 12: [...permissions], 13: [...permissions] }, organizationPermissions: {} }
  const state = { fail: false, release: null, hold: false }
  await page.addInitScript(demo => {
    if (demo) localStorage.setItem('enerlution-auth-session-v1', JSON.stringify({ userId: 'user-integrator-demo' }))
    else sessionStorage.setItem('enerlution-api-token', 'final-fix-test')
  }, demo)
  // All API calls are intercepted; no test reaches a database.
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname.replace(/^\/api/, '')
    let data = []
    if (request.method() !== 'GET') {
      writes.push({ endpoint, body: request.postDataJSON() })
      if (state.hold) await new Promise(resolve => { state.release = resolve })
      if (state.fail) return route.fulfill({ status: 500, json: { code: 500, msg: '受控保存失败' } })
      data = { id: 55 }
    } else if (endpoint === '/auth/me') data = user
    else if (endpoint === '/stations') data = [12, 13].map(id => ({ id, name: `回归站 ${id}`, code: `REG-${id}`, rated_power_kw: 100, capacity_kwh: 200 }))
    else if (endpoint.endsWith('/qualifications')) data = [{ id: endpoint.includes('/12/') ? 1 : 2, area_id: 9, area_name: '测试区域', kind: 'response', status: 'valid', valid_until: '2099-12-31' }]
    await route.fulfill({ json: { code: 0, data } })
  })
  await page.goto(demo ? process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8460' : process.env.API_PREVIEW_URL || 'http://127.0.0.1:8461', { waitUntil: 'domcontentloaded' })
  return { page, writes, user, state }
}

for (const member of [false, true]) test(`demo ${member ? 'member account' : 'role description'} keeps sequential typing and focus after cancelling leave`, async t => {
  const { page, writes } = await setup(t, { demo: true })
  await page.getByRole('button', { name: '平台管理', exact: true }).click()
  if (!member) await page.getByRole('tab', { name: '角色权限', exact: true }).click()
  await page.getByRole('button', { name: member ? '新增成员' : '新增角色', exact: true }).click()
  const field = member ? page.getByPlaceholder('请输入账号', { exact: true }) : page.getByLabel('角色说明', { exact: true })
  await field.focus()
  await page.keyboard.type('ABC', { delay: 60 })
  assert.equal(await field.inputValue(), 'ABC')
  assert.equal(await field.evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  assert.equal(await field.evaluate(el => el === document.activeElement), true)
  await page.keyboard.type('DEF', { delay: 60 })
  assert.equal(await field.inputValue(), 'ABCDEF')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await field.waitFor({ state: 'detached' })
  assert.deepEqual(writes, [])
})

test('overview second checkbox keeps keyboard focus and Escape observes the latest dirty layout', async t => {
  const { page, writes } = await setup(t)
  await page.getByRole('button', { name: '总览', exact: true }).click()
  await page.getByRole('button', { name: '经营看板', exact: true }).click()
  await page.getByRole('button', { name: '页面定制', exact: true }).click()
  const check = page.getByRole('dialog', { name: '页面定制', exact: true }).getByRole('checkbox').nth(1)
  await check.focus()
  await page.keyboard.press('Space')
  assert.equal(await check.isChecked(), false)
  assert.equal(await check.evaluate(el => el === document.activeElement), true)
  await page.keyboard.press('Escape')
  await page.getByRole('alertdialog', { name: '放弃布局修改' }).waitFor()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  assert.equal(await check.isChecked(), false)
  await check.focus()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByRole('button', { name: '页面定制', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: '页面定制', exact: true }).waitFor({ state: 'detached' })
  assert.equal(await page.getByRole('alertdialog').count(), 0)
  assert.deepEqual(writes, [])
})

const marketFields = ['服务资格', '事件编号', '服务名称', '开始时间', '结束时间', '承诺容量 kW']
const marketValues = ['1', 'DRAFT-1', 'EXPLICIT-DISCARD', '2099-10-01T10:00', '2099-10-01T11:00', '40']
async function openMarket(page) {
  for (const name of ['运营中心', '市场响应', '市场服务', '新建内部草稿']) await page.getByRole('button', { name, exact: true }).click()
  await page.getByLabel('服务资格', { exact: true }).selectOption('1')
  for (let i = 1; i < marketFields.length; i++) await page.getByLabel(marketFields[i], { exact: true }).fill(marketValues[i])
}
async function assertMarket(page, values) {
  assert.deepEqual(await Promise.all(marketFields.map(name => page.getByLabel(name, { exact: true }).inputValue())), values)
}
for (const crossStation of [false, true]) test(`market explicit discard resets every field on ${crossStation ? 'station switch' : 'same-station reopen'}; continue retains the draft`, async t => {
  const { page, writes } = await setup(t)
  await openMarket(page)
  const attempt = () => crossStation ? page.getByLabel('市场服务站点', { exact: true }).selectOption('13') : page.getByRole('button', { name: '新建内部草稿', exact: true }).click()
  await attempt()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await assertMarket(page, marketValues)
  assert.equal(await page.getByLabel('市场服务站点', { exact: true }).inputValue(), '12')
  await attempt()
  await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  await page.getByLabel('服务名称', { exact: true }).waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '新建内部草稿', exact: true }).click()
  await assertMarket(page, ['', '', '', '', '', ''])
  assert.equal(await page.getByLabel('市场服务站点', { exact: true }).inputValue(), crossStation ? '13' : '12')
  assert.deepEqual(writes, [])
})

test('market failure preserves all fields and dirty guard; success resets all new-draft fields', async t => {
  const { page, writes, state } = await setup(t)
  await openMarket(page)
  state.fail = true
  await page.getByRole('button', { name: '保存内部草稿', exact: true }).click()
  await page.getByRole('alert').waitFor()
  await assertMarket(page, marketValues)
  await page.getByRole('button', { name: '新建内部草稿', exact: true }).click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  state.fail = false
  await page.getByRole('button', { name: '保存内部草稿', exact: true }).click()
  await page.getByLabel('服务名称', { exact: true }).waitFor({ state: 'detached' })
  await page.getByRole('button', { name: '新建内部草稿', exact: true }).click()
  await assertMarket(page, ['', '', '', '', '', ''])
  assert.equal(writes.length, 2)
  assert.deepEqual(writes.map(item => item.endpoint), ['/market-drafts', '/market-drafts'])
  assert.deepEqual(writes[1].body, { stationId: 12, areaId: 9, eventCode: 'DRAFT-1', name: 'EXPLICIT-DISCARD', kind: 'response', startsAt: '2099-10-01T02:00:00.000Z', endsAt: '2099-10-01T03:00:00.000Z', capacityKw: 40 })
})

test('market permission revocation cancels pending leave and clears the discarded draft before restoring access', async t => {
  const { page, writes, user } = await setup(t)
  await openMarket(page)
  await page.getByLabel('市场服务站点', { exact: true }).selectOption('13')
  await page.getByRole('button', { name: '继续编辑', exact: true }).waitFor()
  const refresh = async () => {
    const response = page.waitForResponse(r => r.url().endsWith('/auth/me'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await response
  }
  user.stationPermissions[12] = ['asset.read', 'market.read']
  await refresh()
  await page.getByLabel('服务名称', { exact: true }).waitFor({ state: 'detached' })
  assert.equal(await page.getByRole('button', { name: '继续编辑', exact: true }).count(), 0)
  assert.equal(await page.getByLabel('市场服务站点', { exact: true }).inputValue(), '12')
  user.stationPermissions[12] = [...user.permissions]
  await refresh()
  await page.getByRole('button', { name: '新建内部草稿', exact: true }).click()
  await assertMarket(page, ['', '', '', '', '', ''])
  assert.deepEqual(writes, [])
})

test('inspection failure retains dirty inputs, pending submit cannot repeat, and confirmed success clears navigation guard', async t => {
  const { page, writes, state } = await setup(t, { inspection: true })
  await page.getByRole('button', { name: '工单与审批', exact: true }).click()
  await page.getByRole('button', { name: '我的待办', exact: true }).click()
  await page.getByRole('button', { name: '新建巡检', exact: true }).click()
  const fields = ['巡检标题', '巡检计划时间', '巡检关联设备', '巡检检查内容']
  const values = ['消防回路', '2099-10-01T12:00', 'PCS-1', '检查记录']
  for (let i = 0; i < fields.length; i++) await page.getByLabel(fields[i], { exact: true }).fill(values[i])
  await page.getByLabel('巡检优先级', { exact: true }).selectOption('P1')
  state.fail = true
  await page.getByRole('button', { name: '创建巡检', exact: true }).click()
  await page.getByRole('alert').waitFor()
  assert.deepEqual(await Promise.all(fields.map(name => page.getByLabel(name, { exact: true }).inputValue())), values)
  assert.equal(await page.getByLabel('巡检优先级', { exact: true }).inputValue(), 'P1')
  assert.equal(await page.getByLabel('巡检站点', { exact: true }).inputValue(), '12')
  await page.getByRole('dialog', { name: '新建巡检', exact: true }).getByRole('button', { name: '关闭', exact: true }).last().click()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  state.fail = false
  state.hold = true
  await page.getByRole('button', { name: '创建巡检', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('dialog button[type=submit]')?.disabled)
  assert.equal(writes.length, 2)
  await page.getByLabel('巡检标题', { exact: true }).press('Enter')
  assert.equal(writes.length, 2)
  state.release()
  await page.getByText('巡检 55 已由服务器创建', { exact: true }).waitFor()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('enerlution-workflow-v1:api:7:12:inspection-fields:55')))
  assert.equal(saved.description, '检查记录')
  assert.equal(saved.device, 'PCS-1')
  assert.equal(saved.priority, 'P1')
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }), false)
  await page.getByRole('button', { name: '总览', exact: true }).click()
  await page.getByRole('button', { name: '经营看板', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '放弃修改', exact: true }).count(), 0)
  await page.getByRole('button', { name: '工单与审批', exact: true }).click()
  await page.getByRole('button', { name: '我的待办', exact: true }).click()
  await page.getByRole('button', { name: '新建巡检', exact: true }).click()
  assert.equal(await page.getByLabel('巡检标题', { exact: true }).inputValue(), '')
  assert.equal(await page.getByLabel('巡检关联设备', { exact: true }).inputValue(), '')
  assert.equal(await page.getByLabel('巡检检查内容', { exact: true }).inputValue(), '')
  assert.equal(await page.getByLabel('巡检优先级', { exact: true }).inputValue(), 'P2')
  assert.equal(await page.getByLabel('巡检站点', { exact: true }).inputValue(), '12')
  assert.notEqual(await page.getByLabel('巡检计划时间', { exact: true }).inputValue(), '2099-10-01T12:00')
  assert.equal(writes.length, 2)
  assert.deepEqual(writes[1], { endpoint: '/inspections', body: { stationId: 12, title: '消防回路', dueAt: '2099-10-01T04:00:00.000Z', assignedTo: 7 } })
})
