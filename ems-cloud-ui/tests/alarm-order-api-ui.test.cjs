const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('API alarm creates linked work order for current user', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'alarm-test'))
  const page = await context.newPage()
  const user = { id: '7', name: '运维人', account: 'ops@test', role: 'operator', organization: '测试', stationIds: ['12'], permissions: ['asset.read', 'alarm.read', 'workorder.read', 'workorder.create','workorder.edit','workorder.handle'] }
  user.stationPermissions = Object.fromEntries(user.stationIds.map(id => [id, [...user.permissions]]))
  user.organizationPermissions = {}
  let orderBody
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.slice(4)
    let data = []
    if (path === '/auth/me') data = user
    else if (path === '/stations') data = [{ id: 12, name: '告警站点', code: 'AL-12' }]
    else if (path === '/stations/12/alarms') data = [{ id: 88, title: '逆变器告警', device_name: 'PCS-01', severity: 'warning', occurred_at: new Date().toISOString() }]
    else if (path === '/work-orders' && request.method() === 'POST') { orderBody = request.postDataJSON(); data = { id: 99 } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) })
  })
  try {
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8443')
    await page.getByRole('button', { name: '资产与站点', exact: true }).click()
    await page.getByText('告警站点', { exact: true }).first().click()
    await page.getByRole('button', { name: '告警信息', exact: true }).click()
    await page.getByRole('button', { name: /^查看 / }).first().click()
    await page.getByRole('button', { name: '基于该告警开单' }).click()
    await page.getByRole('button', { name: '创建工单' }).click()
    await page.locator('.alarm-save-success').filter({ hasText: '工单 99 已由服务器创建' }).waitFor()
    assert.equal(orderBody.stationId, 12)
    assert.equal(orderBody.alarmId, 88)
    assert.equal(orderBody.assignedTo, 7)
    assert.match(orderBody.description, /PCS-01/)
  } finally { await browser.close() }
})
