const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const test = require('node:test')
const { chromium } = require('playwright')
const apiUrl = process.env.API_PREVIEW_URL || 'http://127.0.0.1:8461'
const demoUrl = process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8460'
const artifacts = path.resolve(__dirname, '../.figma/all-modules/01')

// Exercise the current Google iframe contract without real keys, tiles or external calls.
async function mockGoogleBridge(page) {
  await page.route(/\/src\/components\/MapView\.tsx(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text()
    assert.ok(source.includes('import.meta.env.VITE_GOOGLE_MAPS_API_KEY'))
    await route.fulfill({response,body:source.replace('import.meta.env.VITE_GOOGLE_MAPS_API_KEY',JSON.stringify('development-test-key'))})
  })
  await page.route('**/google-map.html', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><div id="markers"></div><output id="zoom"></output><script>
    const notify=(type,data={})=>parent.postMessage({source:'ems-google-map',type,...data},location.origin);
    function render(data){const root=document.getElementById('markers');root.replaceChildren();for(const station of data.stations??[]){const button=document.createElement('button');button.textContent=station.name;button.dataset.lat=String(station.position.lat);button.dataset.lng=String(station.position.lng);button.onclick=()=>notify('select',{id:station.id});root.append(button)}}
    addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.source!=='ems-map-host')return;const{type,data}=event.data;if(type==='handshake')notify('ready');if(type==='initialize'){render(data);notify('loaded');notify('zoom',{zoom:4})}if(type==='update')render(data);if(type==='zoom'){document.getElementById('zoom').textContent=String(data);notify('zoom',{zoom:data>0?5:3})}});notify('ready');
  </script></body></html>`}))
}

async function apiPage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'overview-test'))
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.setDefaultNavigationTimeout(60000)
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/, route => route.abort())
  if(options.googleBridge) await mockGoogleBridge(page)
  const user = { id: '7', name: '总览用户', account: 'overview@test', role: 'owner', organization: '测试组织', stationIds: ['12'], permissions: ['asset.read'], stationPermissions: { '12': ['asset.read'] }, organizationPermissions: {} }
  Object.assign(user, options.user)
  const configuration = {items:[{id:'overview-template',name:'测试看板',cards:['站点运营概况','在线运行容量','能源供应与构成',...(user.permissions.includes('alarm.read')?['当班处置态势','运行健康','异常与告警实时监控']:[])],pinned:false,sortOrder:0,version:0}],selectedId:'overview-template'}
    let layout={widgets:[],version:0}
  await page.route(/^http:\/\/127\.0\.0\.1:1809[01]\/api\//, async route => {
    const p = new URL(route.request().url()).pathname.slice(4)
    if(p === '/monitor/templates') return route.fulfill({json:{code:0,data:configuration}})
      if(p === '/monitor/layout') {
        if(route.request().method()==='PUT'){const body=route.request().postDataJSON();layout={widgets:body.widgets,version:body.expectedVersion+1}}
        return route.fulfill({json:{code:0,data:layout}})
      }
      if(p === '/monitor/stations')return route.fulfill({json:{code:0,data:(options.stations??[{id:'12',name:'授权测试站点',code:'SITE-12'}]).filter(s=>user.stationIds.includes(String(s.id))).map(s=>({...s,id:String(s.id)}))}})
    if(p === '/monitor/templates/overview-template' && route.request().method()==='PUT') { const body=route.request().postDataJSON();configuration.items[0]={...configuration.items[0],name:body.name,cards:body.cards,version:body.expectedVersion+1};return route.fulfill({json:{code:0,data:configuration.items[0]}}) }
    const data = p === '/auth/me' ? user : p === '/stations' ? options.stations ?? [{ id: 12, name: '授权测试站点', code: 'SITE-12', rated_power_kw: 100, capacity_kwh: 200 }, { id: 99, name: '禁止显示站点' }] : []
    await route.fulfill({ json: { code: 0, data } })
  })
  await page.goto(apiUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '总览', exact: true }).click()
  await page.getByRole('button', { name: '地图总览', exact: true }).click()
  return { context, page, refreshUser: async patch => {
    Object.assign(user, patch)
    const refreshed = page.waitForResponse(response => response.url().endsWith('/auth/me'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await refreshed
  } }
}

for (const role of ['operator', 'owner']) test(`overview immersive alarm departure restores navigation for ${role}`, { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    let page
    if (role === 'owner') {
      page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      page.setDefaultTimeout(12000)
      await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/, route => route.abort())
      await page.goto(demoUrl, { waitUntil: 'domcontentloaded' })
      await page.getByLabel('登录账号', { exact: true }).fill('owner@enerlution.cn')
      await page.getByLabel('密码', { exact: true }).fill('Demo@2026')
      await page.getByRole('button', { name: '登录', exact: true }).click()
    } else ({ page } = await apiPage(browser, { user: { role, permissions: ['asset.read', 'alarm.read'], stationPermissions: { '12': ['asset.read', 'alarm.read'] } } }))
    await page.getByRole('button', { name: '沉浸模式（隐藏导航）', exact: true }).click()
    await page.getByRole('button', { name: role === 'operator' ? '进入运维中心' : '查看异常站点', exact: true }).click()
    if (role === 'owner') await page.locator('.station-detail-shell').waitFor()
    else await page.locator('.overview-workspace').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.workspace-shell').getAttribute('data-immersive'), 'false')
    assert.equal(await page.locator('.workspace-sidebar').isVisible(), true)
    assert.equal(await page.locator('.station-global-header').isVisible(), true)
    await page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name: '总览', exact: true }).click()
    await page.getByRole('button', { name: '经营看板', exact: true }).waitFor()
  } finally { await browser.close() }
})

for (const mixed of [false, true]) test(`overview capacity ${mixed ? 'mixed' : 'all-missing'} values remain unknown and export empty numeric cells`, { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const stations = [{ id: 12, name: '容量未知站点', code: 'UNKNOWN', region: '华东' }, ...(mixed ? [{ id: 13, name: '容量已知站点', code: 'KNOWN', region: '华东', rated_power_kw: 100, capacity_kwh: 200 }] : [])]
    const { page } = await apiPage(browser, { stations, user: { stationIds: stations.map(s => String(s.id)), stationPermissions: { '12': ['asset.read'], '13': ['asset.read'] } } })
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    const capacity = page.locator('.overview-shared-card-grid [data-metric="capacity-储能系统"]').locator('..')
    assert.doesNotMatch(await capacity.innerText(), /NaN|Infinity/)
    assert.match(await capacity.innerText(), /—\s*\/\s*—\s*MWh/)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: '数据导出', exact: true }).click()
    const body = await fs.readFile(await (await downloaded).path(), 'utf8')
    assert.doesNotMatch(body, /NaN|Infinity/)
    assert.ok(body.includes('"容量未知站点","UNKNOWN","华东","","",'))
    if (mixed) assert.ok(body.includes('"容量已知站点","KNOWN","华东","100","200",'))
  } finally { await browser.close() }
})

test('overview API: dashboard range validation, honest empty data, customization and scoped export', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser)
    await fs.mkdir(artifacts, { recursive: true })
    await page.screenshot({ path: path.join(artifacts, 'api-map-empty-1440.png'), animations: 'disabled' })
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    await page.getByRole('heading', { name: '平台总览运营看板' }).waitFor()
    assert.equal(await page.getByText('禁止显示站点').count(), 0)
    assert.equal(await page.locator('[data-overview-card="储能充放趋势"]').isVisible(), false)
    await page.getByText('当前授权站点快照；日期选择不改变快照，历史曲线请从站点详情查看。', { exact: true }).waitFor()
    await page.getByRole('button', { name: '自定义', exact: true }).click()
    await page.getByLabel('开始日期', { exact: true }).fill('2026-09-26')
    await page.getByLabel('结束日期', { exact: true }).fill('2026-09-01')
    await page.getByRole('button', { name: '应用时间范围', exact: true }).click()
    await page.getByText('请选择31天内有效日期范围', { exact: true }).waitFor()
    await page.screenshot({ path: path.join(artifacts, 'date-range-validation-1440.png'), animations: 'disabled' })
    await page.getByLabel('结束日期', { exact: true }).fill('2026-09-26')
    await page.getByRole('button', { name: '应用时间范围', exact: true }).click()
    await page.getByRole('button', { name: '页面定制', exact: true }).click()
    await page.getByLabel('在线运行容量', { exact: true }).uncheck()
    await page.getByRole('button', { name: '保存页面布局', exact: true }).click()
    await page.getByText('布局已保存至服务器，地图总览同步更新', { exact: true }).waitFor()
    assert.equal(await page.locator('.overview-shared-card-grid [data-overview-card="在线运行容量"]').isVisible(), false)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: '站点快照导出', exact: true }).click()
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
    await page.getByLabel('在线运行容量', { exact: true }).uncheck()
    await page.getByRole('button', { name: '设置', exact: true }).evaluate(button => button.click())
    await page.getByRole('dialog', { name: '放弃布局修改', exact: true }).waitFor()
    await refreshUser({ permissions: [], stationPermissions: {}, stationIds: [] })
    await page.getByRole('dialog', { name: '放弃布局修改', exact: true }).waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '设置', exact: true }).click()
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
    assert.equal(await page.getByRole('button', { name: '示意底图', exact: true }).count(), 0)
    assert.equal(await page.locator('.overview-map-image').count(), 0)
    assert.equal(await page.getByRole('button', { name: '实时地图', exact: true }).count(), 0)
    await page.locator('[data-map-provider="google"]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.leaflet-container').count(),0)
    if(!await page.locator('iframe[title="Google Maps"]').count()) {
      await page.getByText('Google 地图未配置密钥',{exact:true}).waitFor()
      assert.equal(await page.getByRole('button',{name:'放大地图',exact:true}).isDisabled(),true)
    }
    assert.equal(await page.getByRole('button', { name: '示意底图', exact: true }).count(), 0)
    await page.getByRole('button', { name: '沉浸模式（隐藏导航）', exact: true }).click()
    await page.getByRole('heading', { name: /实时事件日志/ }).waitFor()
    assert.equal(await page.locator('.overview-map-image').count(), 0)
    assert.equal(await page.locator('.map-zoom-controls').isVisible(), true)
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

test('overview customization: rejected server save, cancel/continue and outer navigation guard preserve edits', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser)
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    await page.getByRole('button', { name: '页面定制', exact: true }).click()
    await page.getByLabel('在线运行容量', { exact: true }).uncheck()
    await page.route(/\/api\/monitor\/layout(?:\?|$)/, route => route.request().method()==='PUT'?route.fulfill({status:503,json:{code:503,msg:'模板保存暂不可用'}}):route.fallback())
    await page.getByRole('button', { name: '保存页面布局', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '模板保存暂不可用' }).waitFor()
    await page.screenshot({ path: path.join(artifacts, 'layout-save-failure-1440.png'), animations: 'disabled' })
    assert.equal(await page.getByRole('dialog', { name: '页面定制', exact: true }).isVisible(), true)
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.equal(await page.getByLabel('在线运行容量', { exact: true }).isChecked(), false)
    // Exercise the same navigation callback as keyboard/programmatic shell navigation while an editor is dirty.
    await page.getByRole('button', { name: '设置', exact: true }).evaluate(button => button.click())
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    assert.equal(await page.getByRole('heading', { name: '平台总览运营看板' }).isVisible(), true)
    await page.getByRole('button', { name: '设置', exact: true }).evaluate(button => button.click())
    await page.getByRole('button', { name: '放弃修改', exact: true }).click()
    await page.locator('.settings-workspace').waitFor()
    await page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name: '总览', exact: true }).click()
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    assert.equal(await page.getByRole('heading', { name: '核心站点区域分布', exact: true }).isVisible(), true)
  } finally { await browser.close() }
})

test('map ticker remains visible outside immersion, scrolls and selects scoped stations without covering panels', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser)
    assert.equal(await page.locator('.overview-ticker').isVisible(), true)
    const track = page.locator('[data-ticker-track]')
    await track.waitFor()
    assert.equal(await page.getByText('禁止显示站点').count(), 0)
    const before = await track.evaluate(el => getComputedStyle(el).transform)
    await page.waitForFunction(previous => getComputedStyle(document.querySelector('[data-ticker-track]')).transform !== previous, before)
    for (const width of [1366, 1440, 1920, 760]) {
      await page.setViewportSize({ width, height: 900 })
      const ticker = await page.locator('.overview-ticker').boundingBox()
      const panel = await page.locator('.overview-left').boundingBox()
      assert.ok(ticker.y + ticker.height <= panel.y, `ticker overlaps panel at ${width}`)
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await track.evaluate(el => el.style.animation = 'none')
    await track.getByRole('button').first().click()
    await page.locator('.overview-station-popup').waitFor()
    await fs.mkdir(artifacts, { recursive: true })
    await page.screenshot({ path: path.join(artifacts, 'ticker-restored-1440.png'), animations: 'disabled' })
    await page.getByRole('button', { name: '沉浸模式（隐藏导航）', exact: true }).click()
    assert.equal(await page.locator('.overview-ticker').isVisible(), true)
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.overview-ticker').isVisible(), true)
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    assert.equal(await page.locator('.overview-ticker').count(), 0)
  } finally { await browser.close() }
})

test('immersion entry uses an expand icon and retains accessible toggle', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser)
    const entry = page.getByRole('button', { name: '沉浸模式（隐藏导航）', exact: true })
    assert.equal(await entry.locator('svg.lucide-maximize').count(), 1)
    await entry.click()
    assert.equal(await page.locator('.workspace-shell').getAttribute('data-immersive'), 'true')
    await page.getByRole('button', { name: '← 退出全屏', exact: true }).click()
    assert.equal(await entry.isVisible(), true)
  } finally { await browser.close() }
})


test('overview cards do not clip or overlap controls and view switch stays anchored', { timeout: 90000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser)
    for (const [width, height] of [[1366,768],[1440,900],[1920,1080],[1024,768]]) {
      await page.setViewportSize({ width, height })
      const before = await page.locator('.overview-view-switch').boundingBox()
      await page.getByRole('button', { name: '经营看板', exact: true }).click()
      const after = await page.locator('.overview-view-switch').boundingBox()
      assert.ok(Math.abs(after.x-before.x)<1 && Math.abs(after.y-before.y)<1, 'switch must keep the same position')
      await page.getByRole('button', { name: '地图总览', exact: true }).click()
      const geometry = await page.evaluate(() => {
        const rect = s => { const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right} }
        return { left:rect('.overview-left'),right:rect('.overview-right'),bottom:rect('.overview-bottom'),zoom:rect('.map-zoom-controls'),ticker:rect('.overview-ticker'),panels:['.overview-left','.overview-right'].map(s=>{const e=document.querySelector(s);return {client:e.clientHeight,scroll:e.scrollHeight}}) }
      })
      for (const side of [geometry.left,geometry.right]) {
        assert.ok(side.top>=geometry.ticker.bottom)
        assert.ok(side.bottom<=geometry.bottom.top)
        assert.ok(side.bottom<=geometry.zoom.top || side.right<=geometry.zoom.left || side.left>=geometry.zoom.right)
      }
      assert.ok(geometry.panels.every(p=>p.scroll<=p.client+1),'side cards must not be independently clipped')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
      await fs.mkdir(artifacts,{recursive:true})
      await page.screenshot({path:path.join(artifacts,`layout-stable-${width}.png`),fullPage:true})
    }
  } finally { await browser.close() }
})


test('fullscreen columns, live metrics and events never overlap and exit remains reachable', {timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const {page}=await apiPage(browser)
  await page.getByRole('button',{name:'沉浸模式（隐藏导航）',exact:true}).click()
  for(const [width,height] of [[1366,768],[1920,1080],[1024,768],[760,900]]){
   await page.setViewportSize({width,height})
   const boxes=await page.evaluate(()=>{
    const r=s=>{const b=document.querySelector(s).getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right}}
    return {left:r('.overview-left'),right:r('.overview-right'),live:r('.overview-live-data'),events:r('.overview-events'),bottom:r('.overview-bottom'),ticker:r('.overview-ticker'),exit:r('.overview-exit')}
   })
   assert.ok(boxes.live.top>=boxes.left.top && boxes.live.bottom<=boxes.left.bottom,'metrics must be within left column')
   assert.ok(boxes.events.top>=boxes.right.top && boxes.events.bottom<=boxes.right.bottom,'events must be within right column')
   assert.ok(boxes.left.bottom<=boxes.bottom.top && boxes.right.bottom<=boxes.bottom.top)
   assert.ok(boxes.ticker.bottom<=boxes.left.top && boxes.ticker.bottom<=boxes.right.top)
   assert.ok(boxes.exit.top>=0 && boxes.exit.bottom<=height)
   await page.locator('.overview-content').evaluate(e=>e.scrollTop=e.scrollHeight)
   const exit=await page.locator('.overview-exit').boundingBox()
   assert.ok(exit.y>=0 && exit.y+exit.height<=height)
   await page.locator('.overview-content').evaluate(e=>e.scrollTop=0)
   await fs.mkdir(artifacts,{recursive:true})
   await page.screenshot({path:path.join(artifacts,`fullscreen-refined-${width}.png`)})
  }
  await page.getByRole('button',{name:'← 退出全屏',exact:true}).click()
  await page.getByRole('button',{name:'经营看板',exact:true}).waitFor()
 }finally{await browser.close()}
})

test('dashboard Google map bridge uses scoped coordinates, zoom and station navigation', { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const { page } = await apiPage(browser, { googleBridge:true, stations: [{ id: 12, name: '授权测试站点', code: 'SITE-12', latitude: 31.82, longitude: 117.23 },{id:99,name:'禁止显示站点',code:'DENIED',latitude:10,longitude:10}] })
    await page.getByRole('button', { name: '经营看板', exact: true }).click()
    const map = page.getByRole('region', { name: '核心站点实时地图' })
    const bridge=map.frameLocator('iframe[title="Google Maps"]')
    const marker = bridge.getByRole('button',{name:'授权测试站点',exact:true})
    await marker.waitFor()
    assert.equal(await map.locator('img[src*="imgMapLayer"]').count(), 0)
    assert.equal(await marker.getAttribute('data-lat'),'31.82')
    assert.equal(await marker.getAttribute('data-lng'),'117.23')
    assert.equal(await bridge.getByRole('button',{name:'禁止显示站点',exact:true}).count(),0)
    assert.equal(await map.locator('.leaflet-marker-icon').count(),0)
    await page.waitForFunction(()=>!document.querySelector('[aria-label="核心站点实时地图"] button[aria-label="放大地图"]').disabled)
    await map.getByRole('button', { name: '放大地图' }).click()
    await bridge.locator('#zoom').getByText('1',{exact:true}).waitFor()
    await fs.mkdir(artifacts, { recursive: true })
    await page.screenshot({ path: path.join(artifacts, 'dashboard-map-bridge-mock.png'), animations: 'disabled' })
    await marker.click()
    await page.locator('.station-detail-shell').waitFor()
  } finally { await browser.close() }
})
