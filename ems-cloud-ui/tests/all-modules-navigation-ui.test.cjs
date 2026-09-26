const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { test } = require('node:test')
const { chromium } = require('playwright')

const all = ['总览', '资产与站点', '运营中心', '运维中心', '工单与审批', '分析与报告', '平台管理', '设置']
const profiles = {
  owner: {
    permissions: ['asset.read', 'revenue.read', 'telemetry.read', 'report.export'],
    api: ['总览', '资产与站点', '运营中心', '运维中心', '分析与报告', '设置'],
    demo: ['总览', '资产与站点', '运营中心', '分析与报告', '设置'],
  },
  operator: {
    permissions: ['asset.read', 'alarm.read', 'workorder.read', 'workorder.create', 'inspection.manage', 'telemetry.read', 'report.export'],
    api: ['总览', '资产与站点', '运维中心', '工单与审批', '分析与报告', '设置'],
    demo: ['总览', '资产与站点', '运维中心', '工单与审批', '分析与报告', '设置'],
  },
  integrator: {
    permissions: ['asset.read', 'asset.edit', 'alarm.read', 'workorder.read', 'organization.member.read', 'role.manage', 'tariff.manage'],
    api: ['总览', '资产与站点', '运营中心', '运维中心', '工单与审批', '平台管理', '设置'],
    demo: ['总览', '资产与站点', '运维中心', '工单与审批', '平台管理', '设置'],
  },
}
const artifacts = path.resolve(__dirname, '../.figma/all-modules/09')
async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => [...document.images].filter(image => image.getBoundingClientRect().width > 0).every(image => image.complete))
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, images: [...document.images].filter(image => image.getBoundingClientRect().width > 0).map(image => ({ src: image.getAttribute('src'), width: image.naturalWidth })) }))
  assert.ok(geometry.scroll <= geometry.width + 1, `${name}: document overflow`)
  assert.deepEqual(geometry.images.filter(image => !image.width), [], `${name}: unloaded visible image`)
  await page.screenshot({ path: path.join(artifacts, `${name}.png`), animations: 'disabled' })
  await fs.writeFile(path.join(artifacts, `${name}.json`), JSON.stringify(geometry, null, 2))
}

for (const mode of ['api', 'demo']) for (const [role, profile] of Object.entries(profiles)) {
  test(`shared navigation ${mode}/${role}: scoped entries, settings leave guard and logout`, { timeout: 180000 }, async t => {
    await fs.mkdir(artifacts, { recursive: true })
    const browser = await chromium.launch({ channel: 'msedge', headless: true })
    t.after(() => browser.close())
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.setDefaultTimeout(10000)
    const errors = [], writes = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/, route => route.abort())
    if (mode === 'api') {
      await page.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'navigation-fixture'))
      await page.route('http://127.0.0.1:18090/api/**', async route => {
        const request = route.request(), endpoint = new URL(request.url()).pathname.slice(4)
        if (request.method() !== 'GET') writes.push(endpoint)
        let data = []
        if (endpoint === '/auth/me') data = { id: `navigation-${role}`, account: `${role}@fixture.test`, name: `验收 ${role}`, role, organization: '验收夹具', stationIds: ['1'], permissions: profile.permissions, stationPermissions: { 1: profile.permissions }, organizationPermissions: { 1: profile.permissions } }
        else if (endpoint === '/stations') data = [{ id: 1, name: '授权验收站', code: 'VERIFY-1', rated_power_kw: 100, capacity_kwh: 200 }]
        else if (endpoint === '/stations/options') data = profile.permissions.includes(new URL(request.url()).searchParams.get('permission')) ? [{ id: 1, name: '授权验收站' }] : []
        else if (endpoint === '/settings') data = {}
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 0, msg: 'ok', data }) })
      })
    }
    await page.goto(mode === 'api' ? process.env.API_PREVIEW_URL || 'http://127.0.0.1:8461' : process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8460', { waitUntil: 'domcontentloaded', timeout: 60000 })
    if (mode === 'demo') {
      await page.getByLabel('登录账号', { exact: true }).fill(`${role}@enerlution.cn`)
      await page.getByLabel('密码', { exact: true }).fill('Demo@2026')
      await page.getByRole('button', { name: '登录', exact: true }).click()
      if (role !== 'owner') {
        await page.getByLabel('动态验证码', { exact: true }).fill('246810')
        await page.getByRole('button', { name: '完成验证', exact: true }).click()
      }
    }
    const nav = page.getByRole('navigation', { name: '一级导航', exact: true })
    await nav.waitFor()
    assert.deepEqual(await nav.getByRole('button').allTextContents(), profile[mode])
    for (const forbidden of all.filter(item => !profile[mode].includes(item))) assert.equal(await nav.getByRole('button', { name: forbidden, exact: true }).count(), 0)
    for (const [index, label] of profile[mode].entries()) {
      const button = nav.getByRole('button', { name: label, exact: true })
      await button.click()
      await page.waitForFunction(label => document.querySelector('.workspace-nav [aria-current="page"]')?.getAttribute('aria-label') === label, label)
      await page.locator('.workspace-content').waitFor()
      await capture(page, `${mode}-${role}-${index}-1440`)
    }
    await page.getByRole('button', { name: '收起导航', exact: true }).click()
    assert.equal(await nav.getByRole('button').count(), profile[mode].length)
    await page.getByRole('button', { name: '展开导航', exact: true }).click()
    for (const width of [1366, 1920]) { await page.setViewportSize({ width, height: 900 }); await capture(page, `${mode}-${role}-settings-${width}`) }
    await page.getByRole('button', { name: '紧凑', exact: true }).click()
    await nav.getByRole('button', { name: '总览', exact: true }).click()
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '紧凑', exact: true }).getAttribute('aria-pressed'), 'true')
    await page.locator('.settings-logout').click()
    await page.getByRole('dialog', { name: '退出登录？' }).getByRole('button', { name: '取消', exact: true }).click()
    assert.equal(await page.getByRole('button', { name: '紧凑', exact: true }).getAttribute('aria-pressed'), 'true')
    assert.deepEqual(writes, [])
    await page.locator('.settings-logout').click()
    await page.getByRole('dialog', { name: '退出登录？' }).getByRole('button', { name: '退出登录', exact: true }).click()
    await page.getByRole('button', { name: '放弃修改', exact: true }).click()
    await page.getByLabel('登录账号', { exact: true }).waitFor()
    const session = await page.evaluate(mode => mode === 'api' ? sessionStorage.getItem('enerlution-api-token') : localStorage.getItem('enerlution-auth-session-v1'), mode)
    assert.equal(session, null)
    assert.deepEqual(writes, mode === 'api' ? ['/auth/logout'] : [])
    assert.deepEqual(errors, [])
  })
}
