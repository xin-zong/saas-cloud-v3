const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

async function setup(t, grants, initialStorage = {}) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(storage => {
    sessionStorage.setItem('enerlution-api-token', 'departure-test')
    for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, JSON.stringify(value))
  }, initialStorage)
  const page = await context.newPage()
  page.setDefaultTimeout(5000)
  let user = { id: 'user-A', name: 'Editor', account: 'editor@test', role: 'integrator', organization: 'Test', stationIds: ['12', '13'], permissions: grants, stationPermissions: { 12: grants, 13: grants }, organizationPermissions: {} }
  const writes = []
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.slice(4)
    if (!['GET', 'OPTIONS'].includes(request.method())) writes.push(path)
    const data = path === '/auth/me' ? user : ['/stations', '/stations/options'].includes(path) ? [12, 13].map(id => ({ id, name: `站点${id}`, code: `S-${id}`, rated_power_kw: 100, capacity_kwh: 200 })) : []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) })
  })
  await page.goto(process.env.STATIONS_API_URL || process.env.API_PREVIEW_URL || 'http://127.0.0.1:8451', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('navigation', { name: '一级导航' }).waitFor()
  const refreshUser = async patch => {
    user = { ...user, ...patch }
    const response = page.waitForResponse(r => r.url().endsWith('/auth/me'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await response
  }
  return { page, writes, refreshUser }
}
const primary = (page, name) => page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name, exact: true })
async function dirtyStrategy(page) {
  await page.getByRole('button', { name: '新增策略方案' }).click()
  await page.getByLabel('方案名称', { exact: true }).fill('离开测试')
  await page.getByRole('button', { name: '创建并配置' }).click()
  await page.getByLabel('策略名称').fill('尚未保存的策略')
}
async function dirtyTariff(page) {
  await page.getByRole('button', { name: '日模板管理', exact: true }).click()
  await page.getByRole('button', { name: '＋ 新增模板', exact: true }).click()
  await page.getByLabel('模板名称', { exact: true }).fill('尚未保存的模板')
}

test('strategy-only operations editor guards back, secondary and primary departure', async t => {
  const { page } = await setup(t, ['strategy.read', 'strategy.manage'])
  await primary(page, '运营中心').click()
  const tabs = page.getByRole('navigation', { name: '运营中心二级导航' })
  await tabs.getByRole('button', { name: '策略执行', exact: true }).click()
  await page.getByRole('button', { name: '查看策略' }).first().click()
  await dirtyStrategy(page)
  const dialog = page.getByRole('dialog', { name: '未保存的策略' })
  for (const leave of [() => page.getByRole('button', { name: '返回策略执行' }).click(), () => tabs.getByRole('button', { name: '运营总览' }).click(), () => primary(page, '总览').click()]) {
    await leave()
    await dialog.getByRole('button', { name: '继续编辑' }).click()
    assert.equal(await page.getByLabel('策略名称').inputValue(), '尚未保存的策略')
  }
  await primary(page, '总览').click()
  await dialog.getByRole('button', { name: '放弃修改' }).click()
  await page.locator('.operations-page').waitFor({ state: 'detached' })
})

test('tariff-only operations editor guards station selection, secondary and primary departure', async t => {
  const { page } = await setup(t, ['tariff.read', 'tariff.manage'])
  await primary(page, '运营中心').click()
  const tabs = page.getByRole('navigation', { name: '运营中心二级导航' })
  await tabs.getByRole('button', { name: '电价设置', exact: true }).click()
  await dirtyTariff(page)
  const dialog = page.getByRole('dialog', { name: '未保存的模板' })
  for (const leave of [() => page.getByLabel('电价站点').selectOption('13'), () => tabs.getByRole('button', { name: '运营总览' }).click(), () => primary(page, '总览').click()]) {
    await leave()
    await dialog.getByRole('button', { name: '继续编辑' }).click()
    assert.equal(await page.getByLabel('电价站点').inputValue(), '12')
    assert.equal(await page.getByLabel('模板名称').inputValue(), '尚未保存的模板')
  }
  await page.getByLabel('电价站点').selectOption('13')
  await dialog.getByRole('button', { name: '不保存离开' }).click()
  await page.getByRole('heading', { name: '电价日历' }).waitFor()
  assert.equal(await page.getByLabel('电价站点').inputValue(), '13')
})

for (const kind of ['strategy', 'tariff']) for (const keepRead of [false, true]) test(`${kind} ${keepRead ? 'manage-only' : 'read/manage'} revocation cancels pending navigation and releases subsequent navigation`, async t => {
  const { page, writes, refreshUser } = await setup(t, ['asset.read', `${kind}.read`, `${kind}.manage`])
  await primary(page, '资产与站点').click()
  await page.locator('.station-name-button').first().click()
  await page.getByRole('navigation', { name: '站点二级导航' }).getByRole('button', { name: kind === 'strategy' ? '策略运行' : '电价设置', exact: true }).click()
  await (kind === 'strategy' ? dirtyStrategy(page) : dirtyTariff(page))
  await primary(page, '设置').click()
  await page.getByRole('dialog').waitFor()
  const remaining = keepRead ? ['asset.read', `${kind}.read`] : ['asset.read']
  await refreshUser({ permissions: remaining, stationPermissions: { 12: remaining, 13: remaining } })
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  assert.equal(await primary(page, '资产与站点').getAttribute('aria-current'), 'page')
  await primary(page, '总览').click()
  await page.locator('.station-detail-shell').waitFor({ state: 'detached' })
  await primary(page, '资产与站点').click()
  await page.locator('.station-detail-shell').waitFor()
  assert.deepEqual(writes, [])
  const drafts = await page.evaluate(() => Object.keys(localStorage).filter(key => /enerlution-(strategy|tariff)-workspace/.test(key)).map(key => localStorage.getItem(key)))
  assert.doesNotMatch(JSON.stringify(drafts), /尚未保存的/)
})

for (const kind of ['edit', 'new', 'configuration']) test(`${kind} asset editor guards primary departure`, async t => {
  const { page } = await setup(t, ['asset.read', 'asset.edit'])
  await primary(page, '资产与站点').click()
  if (kind === 'edit') await page.getByRole('button', { name: '编辑站点12', exact: true }).click()
  else if (kind === 'new') await page.getByRole('button', { name: '＋ 新增站点', exact: true }).click()
  else {
    await page.getByRole('button', { name: '站点12更多操作' }).click()
    await page.getByRole('button', { name: /新版本配置草稿|建站配置与进度/ }).click()
    await page.getByRole('button', { name: '1 基础信息' }).click()
  }
  await page.getByLabel('站点名称 *', { exact: true }).fill('未保存站点')
  await primary(page, '总览').click()
  const dialog = page.getByRole('dialog', { name: '未保存的更改' })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '未保存站点')
  await primary(page, '总览').click()
  await dialog.getByRole('button', { name: '不保存离开' }).click()
  await primary(page, '资产与站点').click()
  await page.locator('.station-list-panel').waitFor()
})

test('provision resume ignores unowned legacy drafts and isolates saved drafts between identities and stations', async t => {
  const legacy = { schema: 1, name: '无人归属的旧草稿', code: '', organization: '', region: '', type: '工商业储能', timezone: '', address: '', imageUrl: '', ratedPower: '', storageCapacity: '', devices: [], buses: [], version: 1 }
  const { page, refreshUser } = await setup(t, ['asset.read', 'asset.edit'], { enerlution_station_provision_v1: legacy })
  await primary(page, '资产与站点').click()
  assert.equal(await page.getByRole('button', { name: '继续本地建站草稿' }).count(), 0)
  await page.getByRole('button', { name: '＋ 新增站点', exact: true }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '')
  await page.getByLabel('站点名称 *', { exact: true }).fill('账号A的新站')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByRole('button', { name: '← 返回站点列表' }).click()
  await page.getByRole('button', { name: '继续本地建站草稿' }).waitFor()
  await refreshUser({ id: 'user-B' })
  await primary(page, '资产与站点').click()
  assert.equal(await page.getByRole('button', { name: '继续本地建站草稿' }).count(), 0)
  await page.getByRole('button', { name: '＋ 新增站点', exact: true }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '')
  await page.getByLabel('站点名称 *', { exact: true }).fill('账号B的新站')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await refreshUser({ id: 'user-A' })
  await primary(page, '资产与站点').click()
  await page.getByRole('button', { name: '继续本地建站草稿' }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '账号A的新站')
  await page.getByRole('button', { name: '← 返回站点列表' }).click()
  await page.getByRole('button', { name: '站点12更多操作' }).click()
  await page.getByRole('button', { name: /新版本配置草稿|建站配置与进度/ }).click()
  await page.getByRole('button', { name: '1 基础信息' }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '站点12')
  await page.getByLabel('站点名称 *', { exact: true }).fill('账号A的站点12配置')
  await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await page.getByRole('button', { name: '← 返回站点列表' }).click()
  await page.getByRole('button', { name: '站点13更多操作' }).click()
  await page.getByRole('button', { name: /新版本配置草稿|建站配置与进度/ }).click()
  await page.getByRole('button', { name: '1 基础信息' }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '站点13')
  await refreshUser({ id: 'user-B' })
  await primary(page, '资产与站点').click()
  await page.getByRole('button', { name: '继续本地建站草稿' }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '账号B的新站')
  await page.getByRole('button', { name: '← 返回站点列表' }).click()
  await page.getByRole('button', { name: '站点12更多操作' }).click()
  await page.getByRole('button', { name: /新版本配置草稿|建站配置与进度/ }).click()
  await page.getByRole('button', { name: '1 基础信息' }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '站点12')
  await refreshUser({ id: 'user-A' })
  await primary(page, '资产与站点').click()
  await page.getByRole('button', { name: '站点12更多操作' }).click()
  await page.getByRole('button', { name: /新版本配置草稿|建站配置与进度/ }).click()
  await page.getByRole('button', { name: '1 基础信息' }).click()
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '账号A的站点12配置')
})

test('revoking asset navigation cancels a pending new-station departure even when asset.edit remains', async t => {
  const { page, refreshUser } = await setup(t, ['asset.read', 'asset.edit'])
  await primary(page, '资产与站点').click()
  await page.getByRole('button', { name: '＋ 新增站点', exact: true }).click()
  await page.getByLabel('站点名称 *', { exact: true }).fill('撤权前的新站草稿')
  await primary(page, '设置').click()
  await page.getByRole('dialog', { name: '未保存的更改' }).waitFor()
  await refreshUser({ permissions: ['asset.edit'], stationPermissions: { 12: ['asset.edit'], 13: ['asset.edit'] } })
  await page.locator('.station-provision').waitFor({ state: 'detached' })
  // The role fallback is applied by the shell effect after the revoked editor unmounts.
  await page.waitForFunction(() => document.querySelector('.workspace-nav button[aria-label="总览"]')?.getAttribute('aria-current') === 'page')
  assert.equal(await primary(page, '总览').getAttribute('aria-current'), 'page')
  await primary(page, '设置').click()
  await page.waitForFunction(() => document.querySelector('.workspace-nav button[aria-label="设置"]')?.getAttribute('aria-current') === 'page')
})
