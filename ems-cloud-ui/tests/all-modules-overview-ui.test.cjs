const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const test = require('node:test')
const { chromium } = require('playwright')
const apiUrl = process.env.API_PREVIEW_URL || 'http://127.0.0.1:8461'
const demoUrl = process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8460'
const artifacts = path.resolve(__dirname, '../.figma/all-modules/01')

async function apiPage(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'overview-test'))
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.setDefaultNavigationTimeout(30000)
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/, route => route.abort())
  const user = { id: '7', name: '总览用户', account: 'overview@test', role: 'owner', organization: '测试组织', stationIds: ['12'], permissions: ['asset.read'], stationPermissions: { '12': ['asset.read'] }, organizationPermissions: {} }
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const p = new URL(route.request().url()).pathname.slice(4)
    const data = p === '/auth/me' ? user : p === '/stations' ? [{ id: 12, name: '授权测试站点', code: 'SITE-12', rated_power_kw: 100, capacity_kwh: 200 }, { id: 99, name: '禁止显示站点' }] : []
    await route.fulfill({ json: { code: 0, data } })
  })
  await page.goto(apiUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '总览', exact: true }).click()
  return { context, page, refreshUser: async patch => {
    Object.assign(user, patch)
    const refreshed = page.waitForResponse(response => response.url().endsWith('/auth/me'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await refreshed
  } }
}

test('overview API: dashboard range validation, honest empty data, customization and scoped export', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser)
    await fs.mkdir(artifacts, { recursive: true })
    await page.screenshot({ path: path.join(artifacts, 'api-map-empty-1440.png'), animations: 'disabled' })
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    await page.getByRole('heading', { name: '平台总览运营看板' }).waitFor()
    assert.equal(await page.getByText('禁止显示站点').count(), 0)
    await page.getByText('暂无储能趋势数据', { exact: true }).waitFor()
    await page.getByRole('button', { name: '自定义', exact: true }).click()
    await page.getByLabel('开始日期', { exact: true }).fill('2026-09-26')
    await page.getByLabel('结束日期', { exact: true }).fill('2026-09-01')
    await page.getByRole('button', { name: '应用时间范围', exact: true }).click()
    await page.getByText('结束日期不能早于开始日期', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(artifacts, 'date-range-validation-1440.png'), animations: 'disabled' })
    await page.getByLabel('结束日期', { exact: true }).fill('2026-09-26')
    await page.getByRole('button', { name: '应用时间范围', exact: true }).click()
    await page.getByRole('button', { name: '页面定制', exact: true }).click()
    await page.getByLabel('核心站点区域分布', { exact: true }).uncheck()
    await page.getByRole('button', { name: '保存页面布局', exact: true }).click()
    await page.getByText('布局已保存至本机', { exact: true }).waitFor()
    assert.equal(await page.getByRole('heading', { name: '核心站点区域分布', exact: true }).count(), 0)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: '数据导出', exact: true }).click()
    const download = await downloaded
    const body = await fs.readFile(await download.path(), 'utf8')
    assert.ok(body.includes('授权测试站点'))
    assert.ok(!body.includes('禁止显示站点'))
    assert.ok(!body.includes('86,420'))
    await page.getByRole('button', { name: '地图总览', exact: true }).click()
    assert.equal(await page.locator('.leaflet-marker-icon').count(), 0, 'API stations without coordinates must not get prototype map markers')
    await page.getByLabel('选择总览站点', { exact: true }).selectOption('12')
    assert.equal((await page.getByRole('dialog', { name: '站点概况' }).innerText()).includes('NaN'), false)
    await page.getByRole('button', { name: '进入站点详情', exact: true }).click()
    await page.locator('.station-detail-shell').waitFor()
  } finally { await browser.close() }
})

test('overview permission revocation cancels a pending layout departure and releases shell navigation', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page, refreshUser } = await apiPage(browser)
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    await page.getByRole('button', { name: '页面定制', exact: true }).click()
    await page.getByLabel('核心站点区域分布', { exact: true }).uncheck()
    await page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name: '设置', exact: true }).evaluate(button => button.click())
    await page.getByRole('alertdialog', { name: '放弃布局修改', exact: true }).waitFor()
    await refreshUser({ permissions: [], stationPermissions: {}, stationIds: [] })
    await page.getByRole('alertdialog', { name: '放弃布局修改', exact: true }).waitFor({ state: 'detached' })
    await page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name: '设置', exact: true }).click()
    await page.locator('.settings-workspace').waitFor()
    assert.equal(await page.getByText('授权测试站点', { exact: true }).count(), 0)
  } finally { await browser.close() }
})

test('overview request failure clears prior station selection and retry restores the authorized data', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser)
    await page.getByLabel('选择总览站点', { exact: true }).selectOption('12')
    const fail = route => route.fulfill({ status: 503, json: { code: 503, msg: '总览测试服务暂不可用' } })
    await page.route(/\/api\/stations(?:\?|$)/, fail)
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '总览测试服务暂不可用' }).waitFor()
    await page.getByText('当前范围暂无授权站点', { exact: true }).waitFor()
    assert.equal(await page.getByRole('dialog', { name: '站点概况' }).count(), 0)
    await page.unroute(/\/api\/stations(?:\?|$)/, fail)
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    await page.getByLabel('选择总览站点', { exact: true }).selectOption('12')
    await page.getByRole('dialog', { name: '站点概况' }).waitFor()
  } finally { await browser.close() }
})

test('overview demo: design shell, map modes, fullscreen exit and responsive evidence', { timeout: 60000 }, async () => {
  await fs.mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    page.setDefaultTimeout(12000)
    await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/, route => route.abort())
    await page.goto(demoUrl, { waitUntil: 'domcontentloaded' })
    await page.getByLabel('登录账号', { exact: true }).fill('owner@enerlution.cn')
    await page.getByLabel('密码', { exact: true }).fill('Demo@2026')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByRole('button', { name: '经营看板', exact: true }).waitFor()
    const firstStation = await page.getByLabel('选择总览站点', { exact: true }).locator('option').nth(1).getAttribute('value')
    await page.getByLabel('选择总览站点', { exact: true }).selectOption(firstStation)
    const popup = page.getByRole('dialog', { name: '站点概况' })
    const beforeDrag = await popup.boundingBox()
    await page.mouse.move(beforeDrag.x + 50, beforeDrag.y + 25)
    await page.mouse.down()
    await page.mouse.move(beforeDrag.x + 90, beforeDrag.y + 45)
    await page.mouse.up()
    const afterDrag = await popup.boundingBox()
    assert.ok(Math.abs(afterDrag.x - beforeDrag.x - 40) < 2, 'drag must preserve the pointer offset instead of jumping to an edge')
    await page.getByRole('button', { name: '关闭站点概况', exact: true }).click()
    await page.getByLabel('选择总览站点', { exact: true }).selectOption(firstStation)
    for (const width of [1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      const box = await page.locator('.workspace-sidebar').boundingBox()
      assert.equal(box.width, 176); assert.equal(box.y, 56)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: path.join(artifacts, `map-${width}.png`), animations: 'disabled' })
      const broken = await page.locator('img:visible').evaluateAll(images => images.filter(img => !img.complete || !img.naturalWidth).map(img => img.src))
      assert.deepEqual(broken, [])
      const geometry = await page.locator('img:visible').evaluateAll(images => images.filter(img => img.src.includes('/figma/overview/')).map(img => { const r = img.getBoundingClientRect(); return { file: new URL(img.src).pathname, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, width: r.width, height: r.height } }))
      for (const asset of geometry.filter(a => a.file.endsWith('.svg'))) { assert.equal(asset.width, asset.naturalWidth, asset.file); assert.equal(asset.height, asset.naturalHeight, asset.file) }
      await fs.writeFile(path.join(artifacts, `asset-geometry-${width}.json`), JSON.stringify(geometry, null, 2))
    }
    await page.getByRole('button', { name: '收起导航', exact: true }).click()
    assert.equal((await page.locator('.workspace-sidebar').boundingBox()).width, 64)
    await page.getByRole('button', { name: '展开导航', exact: true }).click()
    await page.getByRole('button', { name: '示意底图', exact: true }).click()
    await page.getByText('示意底图不代表站点位置', { exact: true }).waitFor()
    await page.getByRole('button', { name: '实时地图', exact: true }).click()
    await page.locator('.leaflet-container').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '示意底图', exact: true }).click()
    await page.getByRole('button', { name: '沉浸模式（隐藏导航）', exact: true }).click()
    await page.getByRole('heading', { name: /实时事件日志/ }).waitFor()
    for (const width of [1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: path.join(artifacts, `fullscreen-${width}.png`), animations: 'disabled' })
    }
    await page.keyboard.press('Escape')
    await page.locator('.workspace-sidebar').waitFor({ state: 'visible' })
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    for (const width of [1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: path.join(artifacts, `dashboard-${width}.png`), animations: 'disabled' })
    }
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})

test('overview customization: rejected storage, cancel/continue and outer navigation guard preserve edits', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser)
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    await page.getByRole('button', { name: '页面定制', exact: true }).click()
    await page.getByLabel('核心站点区域分布', { exact: true }).uncheck()
    await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('enerlution-overview-layout-')) throw new Error('quota'); return original.call(this, key, value) } })
    await page.getByRole('button', { name: '保存页面布局', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '无法保存至本机' }).waitFor()
    await page.screenshot({ path: path.join(artifacts, 'layout-save-failure-1440.png'), animations: 'disabled' })
    assert.equal(await page.getByRole('dialog', { name: '页面定制', exact: true }).isVisible(), true)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.equal(await page.getByLabel('核心站点区域分布', { exact: true }).isChecked(), false)
    // Exercise the same navigation callback as keyboard/programmatic shell navigation while an editor is dirty.
    await page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name: '设置', exact: true }).evaluate(button => button.click())
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.equal(await page.getByRole('heading', { name: '平台总览运营看板' }).isVisible(), true)
    await page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name: '设置', exact: true }).evaluate(button => button.click())
    await page.getByRole('button', { name: '放弃修改', exact: true }).click()
    await page.locator('.settings-workspace').waitFor()
    await page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name: '总览', exact: true }).click()
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    assert.equal(await page.getByRole('heading', { name: '核心站点区域分布', exact: true }).isVisible(), true)
  } finally { await browser.close() }
})
