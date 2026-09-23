const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('API inspection creation and cancellation use server state', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'inspection-test'))
  const page = await context.newPage()
  const user = { id: '7', name: '巡检人', account: 'inspect@test', role: 'operator', organization: '测试', stationIds: ['12'], permissions: ['asset.read', 'workorder.read', 'inspection.manage'] }
  user.stationPermissions = Object.fromEntries(user.stationIds.map(id => [id, [...user.permissions]]))
  user.organizationPermissions = {}
  const inspections = []
  let createBody, cancelBody
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.slice(4)
    let data = []
    if (path === '/auth/me') data = user
    else if (path === '/stations') data = [{ id: 12, name: '巡检站点', code: 'IN-12' }]
    else if (path === '/stations/12/inspections') data = inspections
    else if (path === '/inspections' && request.method() === 'POST') {
      createBody = request.postDataJSON()
      inspections.unshift({ id: 55, station_id: 12, title: createBody.title, due_at: createBody.dueAt, assigned_to: 7, status: 'pending' })
      data = { id: 55 }
    } else if (path === '/inspections/55/cancel') {
      cancelBody = request.postDataJSON()
      inspections[0].status = 'cancelled'
      data = null
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) })
  })
  try {
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8443')
    await page.getByRole('button', { name: '工单与审批', exact: true }).click()
    await page.getByRole('button', { name: '我的待办', exact: true }).click()
    await page.getByRole('button', { name: '新建巡检', exact: true }).click()
    await page.getByLabel('巡检标题', { exact: true }).fill('检查消防回路')
    const future = new Date(Date.now() + 2 * 86400000)
    const futureDay = `${future.getFullYear()}-${String(future.getMonth()+1).padStart(2,'0')}-${String(future.getDate()).padStart(2,'0')}`
    await page.getByLabel('巡检计划时间', { exact: true }).fill(`${futureDay}T12:00`)
    await page.getByRole('button', { name: '创建巡检', exact: true }).click()
    await page.getByText('巡检 55 已由服务器创建', { exact: true }).waitFor()
    assert.equal(createBody.stationId, 12)
    assert.equal(createBody.assignedTo, 7)
    await page.getByRole('button', { name: '查看巡检 55', exact: true }).click()
    page.once('dialog', dialog => dialog.accept('计划调整'))
    await page.getByRole('button', { name: '取消巡检', exact: true }).click()
    await page.getByText('巡检已由服务器取消', { exact: true }).waitFor()
    assert.deepEqual(cancelBody, { note: '计划调整' })
  } finally { await browser.close() }
})
