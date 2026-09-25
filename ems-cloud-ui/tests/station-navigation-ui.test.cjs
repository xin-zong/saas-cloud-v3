const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')

test('station tabs remember subnavigation, retain close neighbors, and expose overflow', async t => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'navigation-test'))
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const ids = [11, 12, 13, 14, 15, 16]
  const grants = ['asset.read', 'strategy.read', 'tariff.read', 'revenue.read']
  const permissions = Object.fromEntries(ids.map(id => [id, grants]))
  const user = { id: 'navigation-user', name: 'Navigation', account: 'nav@test', role: 'integrator', organization: 'Test', stationIds: ids.map(String), permissions: grants, stationPermissions: permissions, organizationPermissions: {} }
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const path = new URL(route.request().url()).pathname.slice(4)
    const data = path === '/auth/me' ? user : path === '/stations' ? ids.map(id => ({ id, name: `站点${id}`, code: `T-${id}`, rated_power_kw: 100, capacity_kwh: 200 })) : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) })
  })
  await page.goto(process.env.STATIONS_API_URL || process.env.API_PREVIEW_URL || 'http://127.0.0.1:8451', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('button', { name: '资产与站点', exact: true }).click()
  const open = async id => {
    if (await page.locator('.station-detail-shell').count()) await page.getByRole('button', { name: '站点列表', exact: true }).click()
    await page.locator('.station-name-button').filter({ hasText: `站点${id}` }).click()
  }
  await open(11)
  await page.getByRole('navigation', { name: '站点二级导航' }).getByRole('button', { name: '运营收益' }).click()
  await open(12)
  await page.getByRole('button', { name: '站点11', exact: true }).click()
  assert.equal(await page.getByRole('navigation', { name: '站点二级导航' }).getByRole('button', { name: '运营收益' }).getAttribute('aria-current'), 'page')
  await page.getByRole('button', { name: '站点列表', exact: true }).click()
  await page.locator('.station-name-button').filter({ hasText: '站点11' }).click()
  assert.equal(await page.getByRole('navigation', { name: '站点二级导航' }).getByRole('button', { name: '运营收益' }).getAttribute('aria-current'), 'page')
  for (const id of [13, 14, 15, 16]) await open(id)
  assert.equal(await page.locator('.station-open-tab').count(), 5)
  fs.mkdirSync('test-results/figma-navigation', { recursive: true })
  await page.screenshot({ path: 'test-results/figma-navigation/overflow-1440.png' })
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  await page.getByText('更多站点 · 1').click()
  await page.locator('.station-tabs-overflow').getByRole('button', { name: '站点15' }).click()
  assert.equal(await page.locator('.station-open-tab[data-active="true"]').innerText().then(text => text.includes('站点15')), true)
  await page.getByRole('button', { name: '关闭站点15' }).click()
  assert.equal(await page.locator('.station-open-tab[data-active="true"]').innerText().then(text => text.includes('站点16')), true)
  await page.getByRole('button', { name: '关闭站点16' }).click()
  assert.equal(await page.locator('.station-open-tab[data-active="true"]').innerText().then(text => text.includes('站点14')), true)
  await page.getByRole('button', { name: '关闭站点14' }).click()
  await page.getByRole('button', { name: '关闭站点13' }).click()
  await page.getByRole('button', { name: '关闭站点12' }).click()
  await page.getByRole('button', { name: '关闭站点11' }).click()
  assert.equal(await page.locator('.station-detail-shell').count(), 0)
})
