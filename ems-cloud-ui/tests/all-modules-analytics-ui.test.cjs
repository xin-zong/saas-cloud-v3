const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')
const evidence = path.resolve(__dirname, '../../.superpowers/sdd/2026-09-26-all-modules-figma')
async function setup(role = 'owner') {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, timezoneId: 'Asia/Shanghai' })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'module06-token'))
  const page = await context.newPage(); page.setDefaultTimeout(12000)
  const permissions = ['asset.read', 'telemetry.read', 'report.export', 'strategy.read', 'revenue.read', 'audit.read']
  const user = { id: '7', name: '分析用户', account: 'analytics@test', role, organization: '测试', stationIds: ['12', '13'], permissions, stationPermissions: { 12: [...permissions], 13: ['asset.read', 'telemetry.read', 'report.export', 'asset.read'] }, organizationPermissions: {} }
  const state = { user, calls: [], failPoints: false, failReport: false, delayReport: null, downloads: [], errors: [] }
  page.on('pageerror', e => state.errors.push(e.message)); page.on('download', d => state.downloads.push(d))
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const url = new URL(route.request().url()), p = url.pathname.slice(4); state.calls.push(url)
    let data = []
    if (p === '/auth/me') data = user
    else if (p === '/stations') data = [{ id: 12, name: '分析甲站', code: 'A12' }, { id: 13, name: '分析乙站', code: 'B13' }]
    else if (/\/stations\/\d+\/points/.test(p)) {
      if (state.failPoints) return route.fulfill({ status: 500, json: { msg: '测点读取失败' } })
      data = p.includes('/12/') ? [{ id: 17, device_id: 4, name: '有功功率', unit: 'kW' }, { id: 18, device_id: 4, name: '电池 SOC', unit: '%' }, { id: 27, device_id: 5, name: '柜内湿度', unit: '%RH' }] : [{ id: 99, device_id: 9, name: '乙站电流', unit: 'A' }]
    } else if (/\/points\/\d+\/history/.test(p)) {
      const time = +new Date(url.searchParams.get('from'))
      data = [{ timestamp: time, value: 0, samples: 1 }, { timestamp: time + Number(url.searchParams.get('minutes')) * 120000, value: 42, samples: 2 }]
    } else if (/\/reports\//.test(p)) {
      if (state.delayReport) await state.delayReport
      if (state.failReport) return route.fulfill({ status: 500, json: { msg: '报告服务暂不可用' } })
      return route.fulfill({ contentType: 'text/csv', body: 'date,amount\n2026-09-20,125\n' })
    } else if (p === '/audit') data = [{ id: 8, actor_id: 7, occurred_at: '2026-09-26T08:00:00Z', action: 'report.export', detail: 'station=12,kind=revenue' }]
    await route.fulfill({ json: { code: 0, data } })
  })
  await page.goto(process.env.API_PREVIEW_URL || 'http://127.0.0.1:8461', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '分析与报告', exact: true }).click()
  return { browser, page, state }
}
test('current multi-signal analysis, searchable station picker and older trend/audit controls are reachable', async () => {
  const { browser, page, state } = await setup()
  try {
    await page.getByRole('tab', { name: '实时分析', exact: true }).waitFor()
    await page.getByLabel('搜索设备或信号').fill('湿度')
    await page.getByText('柜内湿度 · 27', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '分析站点', exact: true }).click()
    await page.getByPlaceholder('搜索站点名称', { exact: true }).fill('乙')
    await page.getByRole('option', { name: '分析乙站' }).click()
    await page.getByText('乙站电流 · 99', { exact: true }).first().waitFor()
    assert.equal(await page.getByText('柜内湿度 · 27', { exact: true }).count(), 0)
    await page.getByRole('tab', { name: '历史趋势', exact: true }).click()
    await page.getByRole('button', { name: '30天', exact: true }).click()
    await page.getByText('平均功率输出', { exact: true }).waitFor()
    await page.getByRole('button', { name: '事件审计', exact: true }).click()
    await page.getByRole('button', { name: '查看事件 8' }).click()
    await page.getByText('操作状态快照', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'COPY JSON' }).waitFor()
    await page.getByLabel('搜索日志编号、操作内容').fill('missing')
    await page.getByText('没有符合筛选条件的审计记录').waitFor()
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await page.getByRole('button', { name: '查看事件 8' }).waitFor()
    assert.deepEqual(state.errors, [])
  } finally { await browser.close() }
})
test('download selects registered points/device, validates range, exports real CSV and clears revoked data', async () => {
  const { browser, page, state } = await setup('operator')
  try {
    await page.getByRole('tab', { name: '数据下载', exact: true }).click()
    await page.getByLabel('下载设备', { exact: true }).selectOption('5')
    await page.getByRole('button', { name: '选择参数', exact: true }).click()
    assert.equal(await page.getByRole('checkbox', { name: /有功功率/ }).count(), 0)
    await page.getByRole('checkbox', { name: /柜内湿度/ }).check()
    await page.getByRole('button', { name: '应用参数', exact: true }).click()
    await page.getByLabel('下载开始时间').fill('2026-08-01T00:00')
    await page.getByLabel('下载结束时间').fill('2026-09-02T00:00')
    await page.getByLabel('数据粒度', { exact: true }).selectOption('5')
    const before = state.calls.length
    await page.getByRole('button', { name: '生成文件', exact: true }).click()
    await page.getByText('可下载', { exact: true }).waitFor()
    const queries = state.calls.slice(before).filter(u => u.pathname.includes('/history'))
    assert.equal(queries.length, 2); assert(queries.every(u => u.pathname === '/api/points/27/history' && u.searchParams.get('minutes') === '5'))
    const wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 CSV', exact: true }).click()
    const csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /柜内湿度/); assert.match(csv, /"0"/); assert.doesNotMatch(csv, /有功功率|电池 SOC/)
    state.user.stationPermissions['12'] = ['asset.read']
    await page.evaluate(() => window.dispatchEvent(new Event('enerlution:permissions-changed')))
    await page.getByLabel('下载站点').selectOption('13')
    assert.equal(await page.getByRole('button', { name: '下载 CSV', exact: true }).count(), 0)
    await page.getByRole('button', { name: '选择参数', exact: true }).click()
    assert.equal(await page.getByRole('checkbox', { name: /柜内湿度/ }).count(), 0)
    await page.getByRole('checkbox', { name: /乙站电流/ }).waitFor()
    assert.deepEqual(state.errors, [])
  } finally { await browser.close() }
})
test('report station permissions, retries, validation and late revoked responses never download', async () => {
  const { browser, page, state } = await setup('integrator')
  try {
    await page.getByRole('tab', { name: '报告中心', exact: true }).click()
    await page.getByLabel('报告站点').selectOption('13')
    assert.deepEqual(await page.getByLabel('报告类型', { exact: true }).locator('option').allTextContents(), ['设备健康报告'])
    await page.getByLabel('报告站点').selectOption('12')
    await page.getByLabel('报告类型', { exact: true }).selectOption('revenue')
    await page.getByLabel('报告开始日期').fill('2026-09-01')
    await page.getByLabel('报告结束日期').fill('2026-09-26')
    state.failReport = true
    await page.getByRole('button', { name: '下载 CSV 报告', exact: true }).click()
    await page.getByRole('alert').getByText('报告服务暂不可用').waitFor()
    state.failReport = false
    const wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 CSV 报告', exact: true }).click(); await wait
    let release; state.delayReport = new Promise(resolve => { release = resolve })
    await page.getByRole('button', { name: '下载 CSV 报告', exact: true }).click()
    await page.getByText('下载中…', { exact: true }).waitFor()
    state.user.stationPermissions['12'] = ['asset.read', 'telemetry.read', 'report.export']
    await page.evaluate(() => window.dispatchEvent(new Event('enerlution:permissions-changed')))
    await page.getByLabel('报告类型', { exact: true }).selectOption('health')
    release(); await page.waitForTimeout(250)
    assert.equal(state.downloads.length, 1)
    assert.deepEqual(state.errors, [])
  } finally { await browser.close() }
})
module.exports = { setup, evidence }

test('pan viewport exports only the visible interval and fit restores the full sparse series', async () => {
  const { browser, page } = await setup()
  try {
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await page.getByText('有功功率 · 17', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '平移', exact: true }).click()
    let wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前数据', exact: true }).click()
    let csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /"0"/); assert.doesNotMatch(csv, /"42"/)
    await page.getByLabel('缩放坐标', { exact: true }).selectOption('Y')
    wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前数据', exact: true }).click()
    csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /"42"/)
    await page.getByRole('button', { name: '还原视图', exact: true }).click()
    wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前数据', exact: true }).click()
    csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /"42"/)
  } finally { await browser.close() }
})

test('download validation and point failure retry preserve parameter choices without fabricated results', async () => {
  const { browser, page, state } = await setup()
  try {
    state.failPoints = true
    await page.getByRole('tab', { name: '数据下载', exact: true }).click()
    await page.getByRole('alert').getByText('测点读取失败', { exact: false }).waitFor()
    state.failPoints = false
    await page.getByRole('button', { name: '重试测点读取' }).click()
    await page.getByRole('button', { name: '选择参数', exact: true }).click()
    await page.getByRole('button', { name: '清空', exact: true }).click()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByText('已选 3 项：', { exact: false }).waitFor()
    await page.getByLabel('下载开始时间').fill('2026-09-26T00:00')
    await page.getByLabel('下载结束时间').fill('2026-09-25T00:00')
    const before = state.calls.length
    await page.getByRole('button', { name: '生成文件', exact: true }).click()
    await page.getByRole('alert').getByText('请选择一年内有效时间范围，结束时间须晚于开始时间。').waitFor()
    assert.equal(state.calls.slice(before).filter(u => u.pathname.includes('/history')).length, 0)
    await page.getByRole('tab', { name: '报告中心', exact: true }).click()
    await page.getByLabel('报告开始日期').fill('2024-01-01')
    await page.getByRole('button', { name: '下载 CSV 报告', exact: true }).click()
    await page.getByRole('alert').getByText('请选择一年内有效的报告日期范围。').waitFor()
    assert.equal(state.downloads.length, 0)
  } finally { await browser.close() }
})

test('module06 API and demo layouts and asset slots at 1366, 1440 and 1920', { timeout: 120000 }, async () => {
  const { browser, page, state } = await setup()
  try {
    const geometry = []
    async function capture(name, width) {
      await page.locator('.analytics-ai-page img').evaluateAll(images => Promise.all(images.map(i => i.decode().catch(() => {}))))
      const assets = await page.locator('.analytics-ai-page img:visible').evaluateAll(images => images.map(i => { const b = i.getBoundingClientRect(); return { src: new URL(i.src).pathname, width: b.width, height: b.height, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight } }))
      for (const asset of assets) {
        assert(asset.naturalWidth > 0 && asset.width > 0)
        assert.equal(asset.width, asset.naturalWidth); assert.equal(asset.height, asset.naturalHeight)
        assert((await fs.stat(path.resolve(__dirname, '../public', asset.src.slice(1)))).size > 0)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      geometry.push({ name, width, assets, panels: await page.locator('.analytics-ai-page, .analysis-workspace, .analysis-signal-browser, .analysis-trends, .analysis-channels').evaluateAll(es => es.map(e => { const b=e.getBoundingClientRect(); return { class: e.className, x:b.x, y:b.y, width:b.width, height:b.height } })) })
      await page.screenshot({ path: path.join(evidence, `task6-${name}-${width}.png`) })
    }
    for (const width of [1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.getByRole('tab', { name: '数据分析', exact: true }).click()
      await page.getByRole('button', { name: '信号分析', exact: true }).click()
      await page.getByRole('tab', { name: '实时分析', exact: true }).click()
      await page.getByText('有功功率 · 17', { exact: true }).first().waitFor()
      await capture('api-live', width)
      await page.getByRole('button', { name: '分析站点', exact: true }).click()
      await capture('station-picker', width)
      await page.keyboard.press('Escape')
      await page.getByRole('tab', { name: '历史趋势', exact: true }).click()
      await page.getByRole('button', { name: '7天', exact: true }).click()
      await capture('api-history', width)
      await page.getByRole('button', { name: '事件审计', exact: true }).click()
      await page.getByRole('button', { name: '查看事件 8' }).click()
      await capture('audit-detail', width)
      await page.getByRole('tab', { name: '数据下载', exact: true }).click()
      await capture('api-download', width)
      await page.getByRole('button', { name: '选择参数', exact: true }).click()
      await capture('parameters', width)
      await page.getByRole('button', { name: '取消', exact: true }).click()
      await page.getByRole('tab', { name: '报告中心', exact: true }).click()
      await capture('api-reports', width)
    }
    await fs.writeFile(path.join(evidence, 'task6-asset-geometry.json'), JSON.stringify(geometry, null, 2))
    assert.deepEqual(state.errors, [])
    const demo = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await demo.addInitScript(() => localStorage.setItem('enerlution-auth-session-v1', JSON.stringify({ userId: 'user-owner-demo' })))
    await demo.goto(process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8460', { waitUntil: 'domcontentloaded' })
    await demo.getByRole('button', { name: '分析与报告', exact: true }).click()
    for (const width of [1366, 1440, 1920]) {
      await demo.setViewportSize({ width, height: 900 })
      await demo.getByRole('tab', { name: '实时分析', exact: true }).waitFor()
      await demo.screenshot({ path: path.join(evidence, `task6-demo-live-${width}.png`) })
      assert.equal(await demo.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    }
    await demo.close()
  } finally { await browser.close() }
})
