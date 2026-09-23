// Explicit opt-in real API/browser T12 workflow. Never provisions or cleans the database.
// No API routing/mocks, saved browser state, trace, HAR, or credential logging.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

async function main() {
  assert.equal(process.env.EMS_PERMISSION_LIVE, 'permission-t12', 'Explicit T12 opt-in required')
  const password = process.env.EMS_PERMISSION_TEST_PASSWORD
  assert.ok(password && password.length >= 12 && password.length <= 72, 'Private fixture password required')
  const fixture = JSON.parse(fs.readFileSync(process.env.EMS_PERMISSION_FIXTURE || path.resolve(__dirname, '../../ems-cloud-api/database/tests/permission_browser_fixture.json'), 'utf8'))
  assert.equal(fixture.namespace, 'permission-t12')
  assert.equal(fixture.actorId, 982001)
  assert.equal(fixture.organizationId, 982001)
  assert.deepEqual(fixture.stationIds, [982001, 982002])
  const ui = process.env.PREVIEW_URL || 'http://127.0.0.1:8443'
  const api = (process.env.EMS_TEST_API || 'http://127.0.0.1:18090/api').replace(/\/$/, '')
  for (const address of [ui, api]) {
    const url = new URL(address)
    assert.ok(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.port && !url.username && !url.password && !url.search && !url.hash, 'Only local reviewed services allowed')
  }
  assert.equal(new URL(api).pathname, '/api')
  const resultPath = path.resolve(process.env.EMS_PERMISSION_RESULT || '../.superpowers/sdd/2026-09-23-prototype-permissions/task-12-live/result.json')
  const output = path.resolve(process.env.EMS_PERMISSION_ARTIFACTS || path.join(path.dirname(resultPath), 'browser-screenshots'))
  fs.mkdirSync(path.dirname(resultPath), { recursive: true })
  fs.mkdirSync(output, { recursive: true })
  const ledger = { namespace: fixture.namespace, actorId: fixture.actorId, targetId: null, roleIds: [], grantIds: [], checks: [], screenshots: [], status: 'running' }
  const writeLedger = () => fs.writeFileSync(resultPath, JSON.stringify(ledger, null, 2))
  writeLedger()
  let stage = 'launch', browser
  const pages = []
  const errorNames = []
  const check = text => { ledger.checks.push(text); writeLedger() }
  const setStage = value => { stage = value; ledger.stage = value; writeLedger() }
  async function request(page, method, endpoint, body, expected = 200) {
    const result = await page.evaluate(async ({ api, method, endpoint, body }) => {
      const token = sessionStorage.getItem('enerlution-api-token')
      const response = await fetch(api + endpoint, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      return { status: response.status, data: (await response.json()).data }
    }, { api, method, endpoint, body })
    assert.equal(result.status, expected, `${method} ${endpoint} status`)
    return result.data
  }
  async function actionResponse(page, method, endpoint, action, expected = 200) {
    const waiting = page.waitForResponse(response => response.url() === api + endpoint && response.request().method() === method)
    await action()
    const response = await waiting
    assert.equal(response.status(), expected, `${method} ${endpoint} UI response`)
    return (await response.json()).data
  }
  async function login(account) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' })
    const page = await context.newPage()
    pages.push(page)
    page.setDefaultTimeout(60000)
    page.on('pageerror', error => errorNames.push(error.name))
    await page.goto(ui, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.getByLabel('登录账号', { exact: true }).fill(account)
    await page.getByLabel('密码', { exact: true }).fill(password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.locator('.workspace-sidebar').waitFor()
    return page
  }
  async function screenshots(page, name) {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport)
      assert.deepEqual(page.viewportSize(), viewport)
      const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth }))
      assert.equal(dimensions.width, viewport.width)
      assert.equal(dimensions.height, viewport.height)
      assert.ok(dimensions.documentWidth <= viewport.width + 1, `${name}: document overflow`)
      const file = `${name}-${viewport.width}x${viewport.height}.png`
      await page.screenshot({ path: path.join(output, file) })
      ledger.screenshots.push({ file, ...dimensions })
    }
    writeLedger()
  }
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true })
    setStage('actor identity and fixture bounds')
    const actor = await login(fixture.actorAccount)
    const actorMe = await request(actor, 'GET', '/auth/me')
    assert.equal(Number(actorMe.id), fixture.actorId)
    assert.deepEqual(Object.keys(actorMe.stationPermissions).map(Number).sort(), fixture.stationIds)
    assert.deepEqual(Object.keys(actorMe.organizationPermissions).map(Number), [fixture.organizationId])
    const stations = await request(actor, 'GET', '/stations')
    assert.equal(stations.length, 2)
    for (const station of stations) {
      assert.ok(fixture.stationIds.includes(station.id) && station.code.startsWith('permission-t12-'))
      assert.equal(Number(station.organization_id), fixture.organizationId)
    }
    const initialMembers = await request(actor, 'GET', '/members?purpose=profiles')
    assert.deepEqual(initialMembers.map(member => member.id), [fixture.actorId], 'Fresh isolated fixture required')
    check('Actor isolated to organization982001 and its two fixed stations; no preexisting target')

    setStage('UI creates two roles and saves actual permission matrices')
    await actor.getByRole('button', { name: '平台管理', exact: true }).click()
    await actor.getByRole('tab', { name: '角色权限', exact: true }).click()
    for (const [index, name] of fixture.roleNames.entries()) {
      await actor.getByRole('button', { name: '新增角色', exact: true }).click()
      await actor.getByRole('dialog').getByLabel('角色名称 *').fill(name)
      await actor.getByRole('dialog').getByLabel('角色说明').fill('T12 isolated browser acceptance')
      const role = await actionResponse(actor, 'POST', '/platform/roles', () => actor.getByRole('button', { name: '创建并配置权限', exact: true }).click())
      assert.equal(role.organizationId, fixture.organizationId)
      assert.deepEqual(role.permissionCodes, [])
      ledger.roleIds.push(role.id); writeLedger()
      await actor.getByRole('heading', { name, exact: true }).waitFor()
      await actor.getByRole('checkbox', { name: '查看站点与设备', exact: true }).check()
      if (index === 0) await actor.getByRole('checkbox', { name: '编辑站点', exact: true }).check()
      const saved = await actionResponse(actor, 'PUT', `/platform/roles/${role.id}/permissions`, () => actor.getByRole('button', { name: '保存修改', exact: true }).click())
      assert.deepEqual(saved.permissionCodes.sort(), index === 0 ? ['asset.edit', 'asset.read'] : ['asset.read'])
    }
    await screenshots(actor, 'role-matrix')
    check('Two empty roles created through UI, then real permission matrices saved')

    await actor.getByRole('tab', { name: '组织管理', exact: true }).click()
    await actor.getByText('permission-t12-isolated', { exact: true }).first().waitFor()
    await screenshots(actor, 'organization-tree')
    setStage('UI creates target member')
    await actor.getByRole('tab', { name: '成员管理', exact: true }).click()
    await actor.getByRole('button', { name: '新增成员', exact: true }).click()
    await actor.locator('input[name=name]').fill('permission-t12-目标成员-用于长名称与跨站点独立授权验收的只读观察和编辑角色成员')
    await actor.locator('input[name=account]').fill(fixture.targetAccount)
    await actor.locator('input[name=password]').fill(password)
    await actor.locator('select[name=organizationId]').selectOption(String(fixture.organizationId))
    const member = await actionResponse(actor, 'POST', '/members', () => actor.getByRole('dialog').getByRole('button', { name: '创建', exact: true }).click())
    assert.ok(member.id > 0 && member.id !== fixture.actorId)
    ledger.targetId = member.id; writeLedger()
    const memberRow = actor.getByRole('row').filter({ hasText: fixture.targetAccount })
    await memberRow.waitFor()
    await screenshots(actor, 'member-long-name')
    await memberRow.getByRole('button', { name: '查看权限', exact: true }).click()
    await actor.getByText('暂无授权，可按成员职责分配权限。', { exact: true }).waitFor()
    await screenshots(actor, 'member-empty-grants')

    setStage('UI grants A editor30d and B reader90d independently')
    for (const index of [0, 1]) {
      await actor.getByRole('button', { name: '分配权限', exact: true }).click()
      await actor.getByLabel('业务角色', { exact: true }).selectOption(String(ledger.roleIds[index]))
      await actor.getByLabel('授权期限', { exact: true }).selectOption(index === 0 ? '30d' : '90d')
      await actor.getByLabel(fixture.stationNames[index], { exact: true }).check()
      if (index === 0) {
        await screenshots(actor, 'grant-form')
        await actor.getByRole('button', { name: '查看完整权限', exact: true }).click()
        await screenshots(actor, 'grant-permission-dialog')
        await actor.keyboard.press('Escape')
      }
      const grant = await actionResponse(actor, 'POST', `/members/${member.id}/grants`, () => actor.getByRole('button', { name: '保存授权', exact: true }).click())
      assert.deepEqual(grant.stationIds, [fixture.stationIds[index]])
      assert.equal(grant.roleId, ledger.roleIds[index])
      assert.equal(grant.term, index === 0 ? '30d' : '90d')
      ledger.grantIds.push(grant.id); writeLedger()
      await actor.locator(`[data-grant-id="${grant.id}"]`).waitFor()
    }
    await screenshots(actor, 'two-independent-grants')
    check('Target created through member UI; A edit and B read-only grants have separate roles and terms')

    setStage('target real login, A edit and B read-only')
    const target = await login(fixture.targetAccount)
    const targetMe = await request(target, 'GET', '/auth/me')
    assert.equal(Number(targetMe.id), member.id)
    assert.deepEqual(targetMe.stationPermissions[String(fixture.stationIds[0])].sort(), ['asset.edit', 'asset.read'])
    assert.deepEqual(targetMe.stationPermissions[String(fixture.stationIds[1])], ['asset.read'])
    await target.getByRole('button', { name: '资产与站点', exact: true }).click()
    await target.getByRole('button', { name: `编辑${fixture.stationNames[0]}`, exact: true }).waitFor()
    assert.equal(await target.getByRole('button', { name: `编辑${fixture.stationNames[1]}`, exact: true }).count(), 0)
    await screenshots(target, 'target-A-edit-B-read')
    const stationBody = { name: fixture.stationNames[1], ratedPowerKw: 10, capacityKwh: 20, region: '', address: '' }
    await request(target, 'PUT', `/stations/${fixture.stationIds[1]}`, stationBody, 403)
    await target.getByRole('button', { name: `编辑${fixture.stationNames[0]}`, exact: true }).click()
    await target.getByPlaceholder('请输入详细地址', { exact: true }).fill('permission-t12-browser-verified')
    await actionResponse(target, 'PUT', `/stations/${fixture.stationIds[0]}`, () => target.getByRole('button', { name: '保存到服务器', exact: true }).click())
    const savedStations = await request(target, 'GET', '/stations')
    assert.equal(savedStations.find(station => station.id === fixture.stationIds[0]).address, 'permission-t12-browser-verified')
    check('Target UI saves A station; B has no edit action and actual server PUT returns403')

    setStage('same target session loses A authority after actor revokes grant')
    await target.getByRole('button', { name: `编辑${fixture.stationNames[0]}`, exact: true }).click()
    await target.getByPlaceholder('请输入详细地址', { exact: true }).fill('permission-t12-must-not-save')
    await actor.locator(`[data-grant-id="${ledger.grantIds[0]}"]`).getByRole('button', { name: '撤销', exact: true }).click()
    await screenshots(actor, 'revoke-confirm')
    await actionResponse(actor, 'DELETE', `/members/${member.id}/grants/${ledger.grantIds[0]}`, () => actor.getByRole('button', { name: '确认撤销', exact: true }).click())
    await actionResponse(target, 'PUT', `/stations/${fixture.stationIds[0]}`, () => target.getByRole('button', { name: '保存到服务器', exact: true }).click(), 403)
    // Keep the same live browser/session: explicit focus refresh, never reload or re-login.
    const refreshed = target.waitForResponse(response => response.url() === api + '/auth/me')
    await target.evaluate(() => window.dispatchEvent(new Event('focus')))
    await refreshed
    const after = await request(target, 'GET', '/auth/me')
    assert.equal(Number(after.id), member.id)
    assert.ok(!after.stationPermissions[String(fixture.stationIds[0])]?.includes('asset.edit'))
    assert.deepEqual(after.stationPermissions[String(fixture.stationIds[1])], ['asset.read'])
    await target.getByRole('button', { name: '保存到服务器', exact: true }).waitFor({ state: 'detached' })
    await target.getByPlaceholder('请输入详细地址', { exact: true }).waitFor({ state: 'detached' })
    assert.equal(await target.getByRole('button', { name: `编辑${fixture.stationNames[0]}`, exact: true }).count(), 0)
    assert.equal(await target.getByRole('button', { name: `编辑${fixture.stationNames[1]}`, exact: true }).count(), 0)
    const actorStations = await request(actor, 'GET', '/stations')
    assert.equal(actorStations.find(station => station.id === fixture.stationIds[0]).address, 'permission-t12-browser-verified')
    assert.equal((await request(actor, 'GET', `/members/${member.id}/grants`)).length, 1)
    await screenshots(target, 'target-revoked-same-session')
    check('A revoke causes immediate403 on held edit form; same-session refresh removes held editor and A edit action, B read remains, rejected address not persisted')
    assert.deepEqual(errorNames, [])
    ledger.status = 'passed'
    writeLedger()
    console.log('T12 real browser workflow PASS; identifiers, checks and screenshots saved without credentials')
  } catch (error) {
    ledger.status = 'failed'; ledger.failedStage = stage; ledger.errorType = error.name; writeLedger()
    for (const [index, page] of pages.entries()) {
      try {
        const file = `failure-${index === 0 ? 'actor' : 'target'}.png`
        await page.screenshot({ path: path.join(output, file), timeout: 10000 })
        ledger.screenshots.push({ file, failedStage: stage })
      } catch { /* Preserve original failure if the page has closed. */ }
    }
    writeLedger()
    // Playwright call logs can contain filled values. Deliberately do not print message/stack.
    console.error(`T12 real browser workflow FAILED at stage: ${stage}; ${error.name}. Run reviewed cleanup.`)
    process.exitCode = 1
  } finally {
    for (const page of pages) {
      try { await request(page, 'POST', '/auth/logout') } catch { /* root retires accounts regardless */ }
    }
    await browser?.close()
  }
}

main().catch(error => { console.error(`T12 setup refused: ${error.name}`); process.exitCode = 1 })
