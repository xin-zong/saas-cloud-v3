const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')

async function setup(t, noWebGL = false, emptyApi = false) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  if (emptyApi) {
    page.on('pageerror', e => console.error('API 3D browser error:', e.message))
    page.on('console', m => { if (m.type() === 'error') console.error('API 3D console:', m.text()) })
  }
  page.setDefaultTimeout(15000)
  await page.addInitScript(({ noWebGL }) => {
    localStorage.setItem('enerlution-auth-session-v1', JSON.stringify({ userId: 'user-owner-demo' }))
    if (noWebGL) {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return type.includes('webgl') ? null : original.call(this, type, ...args)
      }
    }
  }, { noWebGL })
  if (emptyApi) {
    await page.addInitScript(() => sessionStorage.setItem('enerlution-api-token', '3d-empty-test'))
    await page.route('http://127.0.0.1:18090/api/**', async route => {
      const request = route.request()
      assert.equal(request.method(), 'GET', 'view switching must not write data')
      const url = new URL(request.url())
      let data = []
      if (url.pathname === '/api/auth/me') data = { id: '7', name: '只读用户', role: 'integrator', stationIds: ['1'], permissions: ['asset.read', 'telemetry.read'], stationPermissions: { 1: ['asset.read', 'telemetry.read'] } }
      if (url.pathname === '/api/stations') data = [{ id: 1, name: '无遥测站点', code: 'EMPTY', rated_power_kw: 100, capacity_kwh: 200 }]
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, msg: 'ok', data }) })
    })
  }
  await page.goto(emptyApi ? (process.env.API_PREVIEW_URL || 'http://127.0.0.1:8443') : (process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8460'))
  await page.getByRole('button', { name: '资产与站点', exact: true }).click()
  await page.locator('.station-name-button').first().click()
  await page.getByRole('button', { name: '站点概览', exact: true }).click()
  return page
}

test('overview switches between device diagram and interactive 3D, preserving selection and metrics', { timeout: 120000 }, async t => {
  const page = await setup(t)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const card = page.getByRole('region', { name: '站点能流图' })
  const metrics = await card.locator('.station-flow-value > span').allTextContents()
  await card.getByRole('button', { name: '3D', exact: true }).click()
  await card.locator('canvas').waitFor()
  await card.getByRole('button', { name: '查看电池3D设备' }).waitFor()
  const names = ['电网', '光伏', '负荷', 'PCS', '电池']
  for (let i = 0; i < names.length; i++) {
    const label = card.getByRole('button', { name: `查看${names[i]}3D设备` })
    assert.ok((await label.textContent()).replace(/\s/g, '').includes(metrics[i].replace(/\s/g, '')))
  }
  await card.getByRole('button', { name: '查看PCS3D设备' }).click()
  assert.equal(await page.locator('.station-device-types').getByRole('button', { name: 'PCS', exact: true }).getAttribute('aria-pressed'), 'true')
  const dir = path.resolve(__dirname, '../.figma/station-overview-3d')
  await fs.mkdir(dir, { recursive: true })
  for (const width of [1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({ path: path.join(dir, `3d-${width}.png`) })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  const tower = card.getByRole('button', { name: '查看电网3D设备' })
  const beforeRotate = await tower.boundingBox()
  const canvas = await card.locator('canvas').boundingBox()
  await page.mouse.move(canvas.x + 100, canvas.y + 250)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 200, canvas.y + 250, { steps: 12 })
  await page.mouse.up()
  await page.waitForFunction(x => Math.abs(document.querySelector('[aria-label="查看电网3D设备"]').getBoundingClientRect().x - x) > 5, beforeRotate.x)
  const beforeZoom = await tower.boundingBox()
  await page.mouse.wheel(0, 120)
  await page.waitForFunction(y => Math.abs(document.querySelector('[aria-label="查看电网3D设备"]').getBoundingClientRect().y - y) > 2, beforeZoom.y)
  await card.getByRole('button', { name: '设备图', exact: true }).click()
  assert.equal(await card.locator('canvas').count(), 0)
  await card.getByRole('button', { name: '查看PCS设备' }).waitFor()
  assert.equal(await page.locator('.station-device-types').getByRole('button', { name: 'PCS', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.screenshot({ path: path.join(dir, 'diagram.png') })
  assert.deepEqual(errors, [])
})

test('API station without telemetry keeps all 3D values empty and allows read-only viewing', { timeout: 60000 }, async t => {
  const page = await setup(t, false, true)
  await page.getByRole('button', { name: '3D', exact: true }).click()
  for (const name of ['电网', '光伏', '负荷', 'PCS', '电池']) {
    const label = page.getByRole('button', { name: `查看${name}3D设备` })
    await label.waitFor()
    assert.ok((await label.textContent()).includes('--'))
    await label.click()
    await page.getByLabel('选择概览设备').getByText(`暂无${name}设备`).waitFor({ state: 'attached' })
  }
  assert.equal(await page.getByText('编辑布局', { exact: true }).count(), 0)
  assert.doesNotMatch(await page.locator('.station-energy-card').innerText(), /NaN|undefined/)
})

test('unavailable WebGL shows a recoverable message and retains 2D switch', { timeout: 60000 }, async t => {
  const page = await setup(t, true)
  await page.getByRole('button', { name: '3D', exact: true }).click()
  await page.getByText('3D 暂不可用，请切换回设备图查看。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '设备图', exact: true }).click()
  await page.getByRole('button', { name: '查看电池设备' }).waitFor()
})
