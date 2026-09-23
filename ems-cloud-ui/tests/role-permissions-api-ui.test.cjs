const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

const entry = (code, name, module, overrides = {}) => ({ code, name, module, scope: 'station', origin: 'implemented', available: true, configurable: true, reason: null, ...overrides })
const catalog = [
  entry('asset.read', '查看站点与设备', 'asset'),
  entry('asset.edit', '编辑站点', 'asset'),
  entry('strategy.read', '查看运行策略', 'asset'),
  entry('operations.read', '查看运营总览', 'operations'),
  entry('alarm.read', '查看告警', 'maintenance'),
  entry('workorder.read', '查看工单', 'workorder'),
  entry('report.export', '生成报告', 'analytics'),
  entry('role.manage', '配置角色权限', 'platform', { scope: 'organization' }),
  entry('pending.feature', '执行固件升级', 'maintenance', { available: false, configurable: false, origin: 'prototype', reason: '后端能力尚未接入' }),
]

async function setup(t, initialRoles = [{ id: 41, code: 'ops', name: '运营角色', description: '运营', organizationId: 3, permissionCodes: ['asset.read'], memberCount: 1, canEdit: true, canDelete: false, canAssign: true, reason: null }], userPermissions = ['role.manage']) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'role-test'))
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  const requests = []
  const roles = initialRoles
  let failSave = false
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.slice(4)
    requests.push({ method: req.method(), path, search: url.search, body: req.postDataJSON?.() })
    let data = []
    let status = 200
    let msg = 'ok'
    if (path === '/auth/me') data = { id: '7', name: '管理员', account: 'manager', role: 'integrator', organization: '华东', stationIds: [], permissions: userPermissions }
    else if (path === '/platform/organizations' && url.searchParams.get('purpose') === 'roles') data = [{ id: 3, name: '华东', parent_id: null }]
    else if (path === '/platform/permissions' && url.searchParams.get('organizationId') === '3') data = catalog
    else if (path === '/platform/roles' && req.method() === 'GET' && url.searchParams.get('organizationId') === '3') data = roles
    else if (path === '/platform/roles' && req.method() === 'POST') {
      const body = req.postDataJSON()
      data = { id: 42, code: 'generated-42', name: body.name, description: body.description, organizationId: 3, permissionCodes: [], memberCount: 0, canEdit: true, canDelete: true, canAssign: true, reason: null }
      roles.push(data)
    } else if (path.match(/^\/platform\/roles\/\d+\/permissions$/) && req.method() === 'PUT') {
      if (failSave) { status = 409; msg = '权限范围已变化' }
      else { data = roles.find(r => path.includes(`/${r.id}/`)); data.permissionCodes = req.postDataJSON().permissionCodes }
    } else if (path === '/platform/roles/41' && req.method() === 'DELETE') { status = 409; msg = '仍有 1 位成员使用该角色' }
    else if (path === '/platform/roles/42' && req.method() === 'DELETE') { roles.splice(roles.findIndex(r => r.id === 42), 1); data = null }
    else if (path === '/stations' || path === '/members' || path === '/roles' || path === '/platform/member-grants' || path === '/platform/role-permissions') { status = 403; msg = `unexpected ${path}` }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : status, msg, data }) })
  })
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8445', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('button', { name: '平台管理', exact: true }).click()
  await page.getByRole('tab', { name: '角色权限' }).waitFor()
  return { page, roles, requests, setFailSave: value => { failSave = value } }
}

test('role.manage alone opens catalog and creates an empty role, then saves and reloads selections', async t => {
  const { page, roles, requests } = await setup(t)
  await page.getByRole('checkbox', { name: '编辑站点', exact: true }).waitFor()
  assert.equal(await page.getByRole('checkbox', { name: '执行固件升级', exact: true }).isDisabled(), true)
  assert.equal(requests.filter(r => r.path === '/stations').length, 0)
  assert.equal(requests.filter(r => ['/members', '/roles', '/platform/member-grants'].includes(r.path)).length, 0)
  await page.getByRole('button', { name: '新增角色' }).click()
  await page.getByRole('dialog').getByLabel('角色名称 *').fill('新建运营')
  await page.getByRole('dialog').getByLabel('角色说明').fill('新角色描述')
  await page.getByRole('button', { name: '创建并配置权限' }).click()
  await page.getByRole('heading', { name: '新建运营' }).waitFor()
  assert.deepEqual(requests.find(r => r.method === 'POST' && r.path === '/platform/roles').body, { name: '新建运营', description: '新角色描述', organizationId: 3 })
  assert.deepEqual(roles[1].permissionCodes, [])
  await page.getByRole('checkbox', { name: '编辑站点', exact: true }).check()
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByText('角色权限已保存').waitFor()
  assert.deepEqual(requests.find(r => r.method === 'PUT' && r.path === '/platform/roles/42/permissions').body, { permissionCodes: ['asset.edit'] })
  await page.reload()
  await page.getByRole('button', { name: '平台管理', exact: true }).click()
  await page.getByRole('button', { name: '新建运营' }).click()
  assert.equal(await page.getByRole('checkbox', { name: '编辑站点', exact: true }).isChecked(), true)
})

test('cancel restores draft; failed save keeps it; switching role asks before discarding and in-use deletion explains why', async t => {
  const { page, roles, requests, setFailSave } = await setup(t, [
    { id: 41, code: 'ops', name: '运营角色', description: '运营', organizationId: 3, permissionCodes: ['asset.read'], memberCount: 1, canEdit: true, canDelete: false, canAssign: true, reason: null },
    { id: 43, code: 'audit', name: '审计角色', description: '审计', organizationId: 3, permissionCodes: [], memberCount: 0, canEdit: true, canDelete: true, canAssign: true, reason: null },
  ])
  await page.getByRole('checkbox', { name: '编辑站点', exact: true }).check()
  await page.getByRole('button', { name: '取消修改' }).click()
  assert.equal(await page.getByRole('checkbox', { name: '编辑站点', exact: true }).isChecked(), false)
  assert.equal(requests.filter(r => r.method === 'PUT').length, 0)
  await page.getByRole('checkbox', { name: '编辑站点', exact: true }).check()
  setFailSave(true)
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByText('权限范围已变化').waitFor()
  assert.equal(await page.getByRole('checkbox', { name: '编辑站点', exact: true }).isChecked(), true)
  await page.getByRole('button', { name: '审计角色' }).click()
  await page.getByRole('heading', { name: '未保存的修改' }).waitFor()
  await page.getByRole('button', { name: '继续编辑' }).click()
  assert.equal(await page.getByRole('checkbox', { name: '编辑站点', exact: true }).isChecked(), true)
  await page.getByRole('button', { name: '删除当前角色' }).click()
  await page.getByRole('button', { name: '放弃修改' }).click()
  await page.getByRole('heading', { name: '该角色仍有成员使用' }).waitFor()
  assert.equal(requests.filter(r => r.method === 'DELETE').length, 0)
  assert.deepEqual(roles[0].permissionCodes, ['asset.read'])
})

test('leaving the parent tab can save the draft; a server deletion conflict keeps the role visible', async t => {
  const role = { id: 41, code: 'ops', name: '运营角色', description: '运营', organizationId: 3, permissionCodes: ['asset.read'], memberCount: 0, canEdit: true, canDelete: true, canAssign: true, reason: null }
  const { page, roles, requests } = await setup(t, [role], ['role.manage', 'audit.read'])
  assert.equal(await page.getByRole('checkbox', { name: '资产与站点全部权限' }).evaluate(input => input.indeterminate), true)
  await page.getByRole('checkbox', { name: '编辑站点', exact: true }).check()
  await page.getByRole('button', { name: '安全审计', exact: true }).click()
  await page.getByRole('heading', { name: '未保存的修改' }).waitFor()
  await page.getByRole('button', { name: '继续编辑' }).click()
  assert.equal(await page.getByRole('checkbox', { name: '编辑站点', exact: true }).isChecked(), true)
  await page.getByRole('button', { name: '安全审计', exact: true }).click()
  await page.getByRole('button', { name: '保存并离开' }).click()
  await page.getByRole('button', { name: '组织权限', exact: true }).click()
  await page.getByRole('checkbox', { name: '编辑站点', exact: true }).waitFor()
  assert.equal(await page.getByRole('checkbox', { name: '编辑站点', exact: true }).isChecked(), true)
  assert.deepEqual(requests.find(r => r.method === 'PUT' && r.path === '/platform/roles/41/permissions').body, { permissionCodes: ['asset.read', 'asset.edit'] })
  await page.getByRole('button', { name: '删除当前角色' }).click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.getByRole('heading', { name: '该角色仍有成员使用' }).waitFor()
  assert.equal(roles.length, 1)
  assert.equal(requests.filter(r => r.method === 'DELETE' && r.path === '/platform/roles/41').length, 1)
})

test('saved permission outside current upper bound can be removed without allowing a new addition', async t => {
  const role = { id: 41, code: 'ops', name: '运营角色', description: '运营', organizationId: 3, permissionCodes: ['asset.read', 'pending.feature'], memberCount: 0, canEdit: true, canDelete: true, canAssign: true, reason: null }
  const { page, requests } = await setup(t, [role])
  assert.equal(await page.getByRole('checkbox', { name: '执行固件升级', exact: true }).isDisabled(), false)
  await page.getByRole('checkbox', { name: '执行固件升级', exact: true }).uncheck()
  assert.equal(await page.getByRole('checkbox', { name: '执行固件升级', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByText('角色权限已保存').waitFor()
  assert.deepEqual(requests.find(r => r.method === 'PUT' && r.path === '/platform/roles/41/permissions').body, { permissionCodes: ['asset.read'] })
})
