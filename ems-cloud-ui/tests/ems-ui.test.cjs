const test = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')

test('all business entries retain Figma layouts without injected EMS diagnostic panels', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = [], calls = []
  page.on('pageerror', e => errors.push(e.message))
  const permissions = ['asset.read','telemetry.read','alarm.read','workorder.read','workorder.create','strategy.read','customer.read','audit.read','ems.read','ems.query','ems.manage']
  await page.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'layout-regression'))
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const url = new URL(route.request().url()), p = url.pathname.slice(4)
    calls.push(p)
    let data = []
    if (p === '/auth/me') data = { id: '7', name: '布局测试', role: 'owner', stationIds: ['12'], permissions, stationPermissions: { '12': permissions }, organizationPermissions: {} }
    else if (p === '/stations') data = [{ id: 12, name: '测试站点', code: 'TEST' }]
    else if (p === '/settings') data = {}
    else if (p.endsWith('/telemetry/latest')) data = { items: [], total: 0, hasMore: false }
    await route.fulfill({ json: { code: 0, data } })
  })
  await page.goto(process.env.API_PREVIEW_URL || 'http://127.0.0.1:8443', { waitUntil: 'domcontentloaded' })
  const nav = page.getByRole('navigation', { name: '一级导航' })
  const dir = path.resolve(__dirname, '../.figma/remove-ems-panels')
  await fs.mkdir(dir, { recursive: true })
  for (const [name, selector] of [['总览','.overview-map'],['运营中心','.operations-page'],['运维中心','.maintenance-page'],['工单与审批','.work-orders-page'],['分析与报告','.api-analytics-page'],['平台管理','.api-platform'],['设置','.settings-workspace']]) {
    await nav.getByRole('button', { name, exact: true }).click()
    await page.locator(selector).first().waitFor()
    assert.equal(await page.locator('.ems-panel').count(), 0, name)
    assert.equal(await page.getByRole('button', { name: '刷新 EMS', exact: true }).count(), 0)
    await page.screenshot({ path: path.join(dir, name + '.png') })
  }
  await nav.getByRole('button', { name: '资产与站点', exact: true }).click()
  await page.locator('.station-name-button').first().click()
  for (const name of ['站点概览','设备详情']) {
    await page.getByRole('button', { name, exact: true }).click()
    assert.equal(await page.locator('.ems-panel').count(), 0, name)
    await page.screenshot({ path: path.join(dir, name + '.png') })
  }
  assert.equal(calls.some(p => /^\/ems\//.test(p) || /^\/stations\/[^/]+\/ems$/.test(p)), false, 'diagnostic polling is unmounted')
  assert.deepEqual(errors, [])
})
