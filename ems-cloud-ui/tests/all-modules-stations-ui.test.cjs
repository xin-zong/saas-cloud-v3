const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')
const artifacts = path.resolve(__dirname, '../.figma/all-modules/02')

test('module 02 restrained pages retain usable controls and local assets at three widths', { timeout: 120000 }, async t => {
  await fs.mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(12000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/, route => route.abort())
  await page.addInitScript(() => localStorage.setItem('enerlution-auth-session-v1', JSON.stringify({ userId: 'user-owner-demo' })))
  await page.goto(process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8460', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '资产与站点', exact: true }).click()
  await page.locator('.station-name-button').first().click()
  for (const width of [1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [label, name, selector] of [
      ['站点概览', 'overview', '.station-overview-figma'],
      ['运营收益', 'revenue', '.station-revenue-figma'],
      ['设备详情', 'devices', '.station-devices-page'],
    ]) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.locator(selector).waitFor()
      await page.locator('[data-design-area="stations"] img').evaluateAll(images => Promise.all(images.map(image => image.decode().catch(() => {}))))
      const assets = await page.locator('[data-design-area="stations"] img:visible').evaluateAll(images => images.map(image => {
        const box = image.getBoundingClientRect()
        return { src: new URL(image.src).pathname, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: box.width, height: box.height }
      }))
      for (const asset of assets) {
        assert.ok(asset.naturalWidth > 0 && asset.naturalHeight > 0, `loaded ${asset.src}`)
        assert.ok(asset.width > 0 && asset.height > 0, `visible ${asset.src}`)
        assert.ok((await fs.stat(path.resolve(__dirname, '../public', asset.src.slice(1)))).size > 0)
        assert.ok(Math.abs(asset.width / asset.height - asset.naturalWidth / asset.naturalHeight) < 0.03, `undistorted ${asset.src}`)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.screenshot({ path: path.join(artifacts, `${name}-${width}.png`) })
      await fs.writeFile(path.join(artifacts, `${name}-assets-${width}.json`), JSON.stringify(assets, null, 2))
      if (name === 'revenue') {
        await page.getByRole('button', { name: '年', exact: true }).click()
        await page.getByRole('button', { name: '下一页', exact: true }).scrollIntoViewIfNeeded()
        assert.equal(await page.getByRole('button', { name: '导出', exact: true }).isEnabled(), true)
        await page.locator('.station-revenue-figma').evaluate(element => element.scrollTop = 0)
      }
    }
  }
  assert.deepEqual(errors, [])
})
