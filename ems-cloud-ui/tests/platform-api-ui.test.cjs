const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('API platform shows scoped records and persists member grants and customer edits', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'platform-test'))
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.setDefaultNavigationTimeout(60000)
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const user = { id: '7', name: '管理员', account: 'manager', role: 'integrator', organization: '华东', stationIds: ['12'], permissions: ['asset.read', 'asset.edit', 'member.manage', 'audit.read'] }
  const orgs = [{ id: 3, name: '华东', parent_id: 99 }]
  const members = [{ id: 9, account: 'real.member', display_name: '真实成员', enabled: true, organization_id: 3 }]
  const customer = { id: 5, name: '真实客户', station_count: 1, can_edit: true }
  const requests = []
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname.slice(4)
    if (path !== '/auth/me') assert.equal(req.headers().authorization, 'Bearer platform-test')
    requests.push(`${req.method()} ${path}`)
    let data = []
    if (path === '/auth/me') data = user
    else if (path === '/stations') data = [{ id: 12, name: '真实站点', code: 'S12', rated_power_kw: 100, capacity_kwh: 200 }]
    else if (path === '/members') {
      if (req.method() === 'POST') {
        const body = req.postDataJSON()
        assert.equal(body.organizationId, 4)
        members.push({ id: 10, account: body.account, display_name: body.name, enabled: true, organization_id: 4 })
        data = { id: 10 }
      } else data = members
    }
    else if (path === '/platform/organizations') {
      if (req.method() === 'POST') { orgs.push({ id: 4, name: req.postDataJSON().name, parent_id: 3 }); data = { id: 4 } }
      else data = orgs
    }
    else if (path === '/platform/organizations/3' && req.method() === 'PUT') {
      // The backend requires the managed root's own id, even when its real parent is invisible.
      assert.deepEqual(req.postDataJSON(), { name: '华东', parentId: 3 })
      data = null
    }
    else if (path === '/roles') data = [{ id: 2, code: 'integrator', name: '安装服务商' }]
    else if (path === '/platform/role-permissions') data = [{ role_id: 2, code: 'member.manage', name: '组织成员管理' }]
    else if (path === '/platform/member-grants') data = [{ member_id: 9, role_ids: [2], station_ids: [12], station_count: 1 }]
    else if (path === '/members/9/grants' && req.method() === 'PUT') {
      assert.deepEqual(req.postDataJSON(), { roleIds: [2], stationIds: [12] })
      data = null
    }
    else if (path === '/platform/customers') data = [customer]
    else if (path === '/platform/customers/5' && req.method() === 'PUT') {
      assert.deepEqual(req.postDataJSON(), { name: '更新客户' })
      customer.name = '更新客户'; data = null
    }
    else if (path === '/audit') data = [{ id: 1, actor_id: 7, action: 'customer.edit', occurred_at: '2026-09-23T00:00:00Z', detail: 'customer=5' }]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, msg: 'ok', data }) })
  })
  try {
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8443')
    await page.getByText('已连接业务服务', { exact: false }).waitFor()
    await page.getByRole('button', { name: '平台管理', exact: true }).click()
    await page.getByRole('button', { name: '组织权限', exact: true }).click()
    await page.getByText('真实成员', { exact: true }).waitFor()
    assert.equal(await page.getByText('王凯', { exact: true }).count(), 0)
    await page.getByRole('button', { name: '查看权限' }).click()
    await page.getByRole('button', { name: '保存授权' }).click()
    await page.getByText('授权已保存').waitFor()
    await page.getByRole('tab', { name: '组织管理' }).click()
    await page.getByRole('button', { name: '编辑组织', exact: true }).click()
    assert.equal(await page.locator('select[name=parentId]').isDisabled(), true)
    assert.equal(await page.locator('select[name=parentId]').inputValue(), '3')
    await page.getByRole('dialog').getByRole('button', { name: '保存', exact: true }).click()
    await page.getByText('组织已更新').waitFor()
    await page.getByRole('button', { name: '新增子组织' }).click()
    await page.locator('input[name=name]').fill('新组织')
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
    await page.getByRole('button', { name: '华东 / 新组织', exact: true }).waitFor()
    await page.getByRole('tab', { name: '成员管理' }).click()
    await page.getByRole('button', { name: '新增成员' }).click()
    await page.locator('input[name=name]').fill('子组织成员')
    await page.locator('select[name=organizationId]').selectOption('4')
    await page.locator('input[name=account]').fill('child.member')
    await page.locator('input[name=password]').fill('test-password-long')
    await page.getByRole('dialog').getByLabel('安装服务商').check()
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
    await page.getByText('子组织成员', { exact: true }).waitFor()
    await page.getByRole('button', { name: '客户管理', exact: true }).click()
    await page.getByText('真实客户', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '编辑客户' }).click()
    await page.locator('input[name=name]').fill('更新客户')
    await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
    await page.getByText('更新客户', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '安全审计', exact: true }).click()
    await page.getByText('customer.edit').waitFor()
    assert(requests.includes('PUT /members/9/grants'))
    assert(requests.includes('POST /platform/organizations'))
    assert(requests.includes('PUT /platform/organizations/3'))
    assert(requests.includes('POST /members'))
    assert(requests.includes('PUT /platform/customers/5'))
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
