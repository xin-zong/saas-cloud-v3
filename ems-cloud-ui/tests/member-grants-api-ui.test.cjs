const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')
const permission = { code: 'asset.read', name: '查看站点与设备', module: 'asset', scope: 'station', available: true, origin: 'implemented', reason: null }
const role = { id: 41, code: 'ops', name: '运营角色', description: '负责站点日常运营', organizationId: 3, permissionCodes: ['asset.read'], memberCount: 2, canEdit: false, canDelete: false, canAssign: true, reason: null }
const grant = (id, stationId, extra = {}) => ({ id, roleId: 41, roleName: '运营角色', stationIds: [stationId], validFrom: '2026-09-01T00:00:00Z', validUntil: '2026-10-01T00:00:00Z', source: '直接授权', status: 'active', term: '30d', canEdit: true, canRevoke: true, canExpand: true, scopeRestricted: false, periodChangeRequired: false, reason: null, permissionCodes: ['asset.read'], rolePermissions: [permission], stations: [{ id: stationId, name: stationId === 1 ? '一号站' : '二号站' }], ...extra })
async function setup(t, options = {}) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }); t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'grant-test'))
  const page = await context.newPage(); page.setDefaultTimeout(6000)
  const errors = []; page.on('pageerror', error => errors.push(error.message)); t.after(() => assert.deepEqual(errors, []))
  const requests = [], grants = options.grants || [grant(101, 1), grant(102, 2)]
  const roles = options.roles || [role, { ...role, id: 42, name: '组织管理员', permissionCodes: ['organization.member.read'] }]
  let releaseSave, startedSave, failOptions = false
  const pendingSave = new Promise(resolve => { startedSave = resolve })
  let currentUser = { id: '7', name: '授权管理员', account: 'manager', role: 'integrator', organization: '华东', stationIds: [], permissions: options.readOnly ? ['organization.member.read'] : ['member.grant.manage', 'audit.read'], organizationPermissions: {3:['member.grant.manage']} }
  let directoryGate, directoryStarted, omitTarget = false, refreshVersion = 4
  const refreshDirectory = async (loseTarget = false) => {
    omitTarget = loseTarget
    currentUser = {...currentUser, organizationPermissions: {[refreshVersion++]: ['member.grant.manage'], ...(loseTarget ? {} : {3:['member.grant.manage']})}}
    let release, started
    directoryGate = new Promise(resolve => {release = resolve})
    const reached = new Promise(resolve => {started = resolve})
    directoryStarted = started
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await reached
    return () => {directoryGate = null; release()}
  }
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname.slice(4), method = req.method(), body = req.postDataJSON()
    requests.push({ path, method, search: url.search, body })
    let data = [], status = 200, msg = 'ok'
    if (path === '/auth/me') data = currentUser
    else if (path === '/members') { if (directoryGate) { directoryStarted(); await directoryGate } data = [{ id: 8, account: 'alice', display_name: '张三', enabled: true, organization_id: 3, management_organization_id: 3 }, { id: 9, account: 'bob', display_name: '李四', enabled: true, organization_id: 3, management_organization_id: 3 }].filter(member => !omitTarget || member.id !== 8) }
    else if (path === '/platform/organizations') data = [{ id: 3, name: '华东', parent_id: null }, { id: 4, name: '华南', parent_id: null }]
    else if (path === '/platform/roles') { if (url.searchParams.get('organizationId') === '4') { status = 500; msg = '角色目录加载失败' } else data = roles }
    else if (path === '/platform/permissions') data = [{ ...permission, configurable: false }, { ...permission, code: 'organization.member.read', name: '查看组织成员', scope: 'organization', module: 'platform', configurable: false }]
    else if (path === '/members/8/grants' && method === 'GET') { if (options.pauseGrants) await new Promise(resolve => setTimeout(resolve, 500)); if (options.failGrants) { status = 500; msg = '授权列表加载失败' } else data = grants }
    else if (path === '/members/9/grants' && method === 'GET') data = []
    else if (path === '/members/8/grant-options') {
      if (options.pauseOptions) await new Promise(resolve => setTimeout(resolve, url.searchParams.get('term') === '90d' ? 500 : 30))
      if (failOptions) { status = 500; msg = '站点范围加载失败' }
      const current = grants.find(g => g.id === Number(url.searchParams.get('grantId'))), term = url.searchParams.get('term'), pure = url.searchParams.get('roleId') === '42'
      data = { roleId: Number(url.searchParams.get('roleId')), grantId: current?.id ?? null, term, validFrom: current?.term === term ? current.validFrom : '2026-09-23T00:00:00Z', validUntil: term === 'permanent' ? null : current?.term === term ? current.validUntil : '2026-12-22T00:00:00Z', stationSelectionRequired: !pure, canSaveWithoutStations: pure, canExpand: true, reason: null, stations: options.noStations ? [] : [{ id: 1, name: '一号站', selectable: true, reason: null }, { id: 2, name: '二号站', selectable: true, reason: null }] }
      if (options.grantOptions) data = { ...data, ...options.grantOptions }
    } else if (path.startsWith('/members/8/grants') && ['POST', 'PUT', 'DELETE'].includes(method)) {
      if (options.pauseSave) { startedSave(); await new Promise(resolve => { releaseSave = resolve }) }
      if (options.failSave) { status = 409; msg = '授权范围已变化' }
      else {
        const id = Number(path.split('/').at(-1)), index = grants.findIndex(g => g.id === id)
        if (method === 'DELETE') { grants.splice(index, 1); data = null }
        else { data = grant(method === 'POST' ? 103 : id, body.stationIds[0], { ...body, roleName: roles.find(r => r.id === body.roleId).name, stationIds: body.stationIds, stations: body.stationIds.map(id => ({ id, name: id === 1 ? '一号站' : '二号站' })), validUntil: body.term === 'permanent' ? null : body.term === grants[index]?.term ? grants[index].validUntil : '2026-12-22T00:00:01Z' }); if (method === 'POST') grants.push(data); else grants[index] = data }
      }
    } else if (path !== '/audit') { status = 403; msg = `unexpected ${path}` }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ code: status === 200 ? 0 : status, msg, data }) })
  })
  const open = async () => { await page.getByRole('button', { name: '平台管理', exact: true }).click(); await page.getByRole('row').filter({ hasText: '张三' }).getByRole('button', { name: '查看权限' }).click() }
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8445', { waitUntil: 'domcontentloaded', timeout: 60000 }); await open()
  return { page, requests, grants, open, pendingSave, refreshDirectory, releaseSave: () => releaseSave?.(), setFailOptions: value => { failOptions = value } }
}
const grantRow = (page, id) => page.locator(`[data-grant-id="${id}"]`)
const edit = (page, id) => grantRow(page, id).getByRole('button', { name: '编辑' }).click()
const writes = requests => requests.filter(r => ['POST', 'PUT', 'DELETE'].includes(r.method))

test('parent directory refresh retains an authorized grant draft and blocks saves until settled', {timeout:30000}, async t => {
  const {page,requests,refreshDirectory} = await setup(t)
  await edit(page,101); await page.getByLabel('二号站',{exact:true}).check()
  const release = await refreshDirectory(); t.after(release)
  assert.equal(await page.getByLabel('业务角色').count(),1,'Parent refresh must not unmount the editor')
  assert.equal(await page.getByRole('button',{name:'保存授权',exact:true}).isDisabled(),true)
  release()
  await page.waitForFunction(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='保存授权');return b&&!b.disabled})
  assert.equal(await page.getByLabel('二号站',{exact:true}).isChecked(),true)
  await page.getByRole('button',{name:'返回成员权限',exact:true}).click()
  await page.getByRole('heading',{name:'未保存的修改'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  assert.equal(writes(requests).length,0)
})

test('parent directory refresh exposes lost target access and cannot save the old draft', {timeout:30000}, async t => {
  const {page,requests,refreshDirectory} = await setup(t)
  await edit(page,101); await page.getByLabel('二号站',{exact:true}).check()
  const release = await refreshDirectory(true); t.after(release)
  assert.equal(await page.getByLabel('业务角色').count(),1,'Keep draft while authority is being resolved')
  release()
  await page.getByText('当前成员已不在可查看授权的范围内，请返回成员列表。',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'保存授权',exact:true}).count(),0)
  assert.equal(await page.locator('[data-grant-id]').count(),0)
  await page.getByRole('button',{name:'返回成员列表',exact:true}).click()
  assert.equal(await page.getByRole('row').filter({hasText:'张三'}).count(),0)
  assert.equal(writes(requests).length,0)
})

test('parent directory refresh keeps the pending grant request in its original member context', {timeout:30000}, async t => {
  const {page,requests,refreshDirectory,pendingSave,releaseSave} = await setup(t,{pauseSave:true})
  t.after(releaseSave)
  await edit(page,101); await page.getByLabel('二号站',{exact:true}).check()
  await page.getByRole('button',{name:'保存授权',exact:true}).click(); await pendingSave
  const release = await refreshDirectory(true); t.after(release)
  assert.equal(await page.getByLabel('业务角色').count(),1,'Pending editor must not be unmounted by refresh')
  release()
  await page.getByText('正在加载…',{exact:true}).waitFor({state:'detached'})
  assert.equal(await page.getByLabel('业务角色').count(),1)
  assert.equal(await page.getByRole('button',{name:'返回成员权限',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'安全审计',exact:true}).click()
  assert.equal(await page.getByLabel('业务角色').count(),1)
  releaseSave()
  await page.getByText('当前成员已不在可查看授权的范围内，请返回成员列表。',{exact:true}).waitFor()
  assert.deepEqual(writes(requests).map(r=>[r.method,r.path]),[['PUT','/members/8/grants/101']])
})

for (const viewport of [{width:1280,height:720},{width:1440,height:900}]) {
  test(`grant preview is padded, separates explanations and scrolls to final permission at ${viewport.width}`, async t => {
    const catalog=['asset','operations','maintenance','workorder','analytics','platform'].flatMap(module=>Array.from({length:9},(_,index)=>({...permission,code:`${module}.fixture${index}`,module,name:module==='platform'&&index===8?'平台末项检查':`${module}权限选项${index}`,available:false,reason:'功能暂不可用；此处保留完整权限说明以供成员查看。'})))
    const {page}=await setup(t,{grants:[grant(101,1,{permissionCodes:[catalog[0].code],rolePermissions:catalog})]})
    await page.setViewportSize(viewport)
    await grantRow(page,101).getByRole('button',{name:'查看角色权限',exact:true}).click()
    const dialog=page.getByRole('dialog')
    if(process.env.GRANT_SCREENSHOTS){fs.mkdirSync(process.env.GRANT_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.GRANT_SCREENSHOTS}/mock-preview-top-${viewport.width}.png`})}
    const geometry=await dialog.evaluate(e=>({padding:parseFloat(getComputedStyle(e).paddingLeft),overflow:getComputedStyle(e).overflowY,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth}))
    assert.ok(geometry.padding>=20,`Dialog padding ${geometry.padding}`)
    assert.equal(geometry.overflow,'auto')
    assert.ok(geometry.scrollHeight>geometry.clientHeight,'Long catalog must have a scrollable body')
    assert.ok(geometry.scrollWidth<=geometry.clientWidth+1,'Permission dialog must not overflow horizontally')
    assert.equal(await dialog.locator('.orgv2-check-grid small').first().evaluate(e=>getComputedStyle(e).display),'block')
    await dialog.hover();await page.mouse.wheel(0,10000)
    await page.waitForFunction(()=>{const e=document.querySelector('.member-grant-preview');return e.scrollTop+e.clientHeight>=e.scrollHeight-2})
    const final=dialog.getByRole('checkbox',{name:'平台末项检查',exact:true})
    const position=await final.evaluate(e=>{const r=e.getBoundingClientRect(),d=e.closest('[role=dialog]').getBoundingClientRect();return {top:r.top,bottom:r.bottom,dialogTop:d.top,dialogBottom:d.bottom}})
    assert.ok(position.top>=position.dialogTop&&position.bottom<=position.dialogBottom,'Final platform permission must be visible after wheel scrolling')
    if(process.env.GRANT_SCREENSHOTS)await page.screenshot({path:`${process.env.GRANT_SCREENSHOTS}/mock-preview-bottom-${viewport.width}.png`})
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(),0)
  })

  test(`grant confirmation dialogs keep padded content and reachable actions at ${viewport.width}`, async t=>{
    const {page}=await setup(t)
    await page.setViewportSize(viewport)
    async function check(name){
      const dialog=page.getByRole('dialog')
      const geometry=await dialog.evaluate(e=>{const r=e.getBoundingClientRect();return {padding:parseFloat(getComputedStyle(e).paddingLeft),top:r.top,bottom:r.bottom,width:e.clientWidth,scrollWidth:e.scrollWidth}})
      assert.ok(geometry.padding>=20,`${name} padding ${geometry.padding}`)
      assert.ok(geometry.top>=0&&geometry.bottom<=viewport.height)
      assert.ok(geometry.scrollWidth<=geometry.width+1)
      for(const button of await dialog.getByRole('button').all()){
        const r=await button.boundingBox();assert.ok(r.y>=geometry.top&&r.y+r.height<=geometry.bottom,'Confirmation action must fit in dialog')
      }
      if(process.env.GRANT_SCREENSHOTS){fs.mkdirSync(process.env.GRANT_SCREENSHOTS,{recursive:true});await page.screenshot({path:`${process.env.GRANT_SCREENSHOTS}/mock-${name}-${viewport.width}.png`})}
      await page.keyboard.press('Escape')
    }
    await grantRow(page,101).getByRole('button',{name:'撤销',exact:true}).click();await check('revoke')
    await edit(page,101);await page.getByLabel('授权期限').selectOption('90d')
    await page.getByRole('button',{name:'保存授权',exact:true}).click();await check('term')
    await page.getByRole('button',{name:'返回成员权限',exact:true}).click();await check('leave')
  })
}

test('individual grant IDs survive edit, refresh and revoking only one same-role grant', async t => {
  const { page, requests, open } = await setup(t)
  await edit(page, 101); await page.getByLabel('二号站', { exact: true }).check()
  if (process.env.GRANT_SCREENSHOTS) { fs.mkdirSync(process.env.GRANT_SCREENSHOTS, { recursive: true }); await page.screenshot({ path: process.env.GRANT_SCREENSHOTS + '/grant-edit-top.png' }); await page.getByRole('button', { name: '保存授权', exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: process.env.GRANT_SCREENSHOTS + '/grant-edit-actions.png' }) }
  await page.getByRole('button', { name: '保存授权', exact: true }).click()
  await grantRow(page, 101).getByText('一号站、二号站').waitFor()
  assert.deepEqual(writes(requests)[0], { path: '/members/8/grants/101', method: 'PUT', search: '', body: { roleId: 41, stationIds: [1, 2], term: '30d' } })
  assert.ok(requests.some(r => r.path.endsWith('grant-options') && r.search.includes('grantId=101')))
  await edit(page, 102); assert.equal(await page.getByLabel('二号站', { exact: true }).isChecked(), true)
  await page.getByRole('button', { name: '取消', exact: true }).click(); assert.equal(writes(requests).length, 1)
  await edit(page, 102); await page.getByLabel('一号站', { exact: true }).check(); await page.getByLabel('二号站', { exact: true }).uncheck(); await page.getByRole('button', { name: '保存授权', exact: true }).click(); await grantRow(page, 102).getByText('一号站', { exact: true }).waitFor()
  assert.deepEqual(writes(requests)[1].body, { roleId: 41, stationIds: [1], term: '30d' }); assert.equal(writes(requests)[1].path, '/members/8/grants/102')
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }); await open(); await grantRow(page, 102).waitFor(); assert.equal(await page.locator('[data-grant-id]').count(), 2)
  await grantRow(page, 101).getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByRole('dialog').getByText('一号站、二号站', { exact: true }).waitFor()
  await page.getByRole('button', { name: '确认撤销' }).click(); await grantRow(page, 101).waitFor({ state: 'detached' })
  assert.equal(await grantRow(page, 102).count(), 1); assert.equal(writes(requests)[2].path, '/members/8/grants/101'); await grantRow(page, 102).getByText('一号站', { exact: true }).waitFor()
  assert.equal(requests.filter(r => ['/stations', '/roles', '/platform/member-grants'].includes(r.path)).length, 0)
  assert.ok(requests.some(r => r.path === '/members' && r.search === '?purpose=grants'))
})

test('readonly embedded grants show restrictions, historical permissions and zero-site organization scope', async t => {
  const { page, requests } = await setup(t, { readOnly: true, grants: [grant(101, 1, { canEdit: false, canRevoke: false, source: '历史迁移', permissionCodes: ['old.permission', 'pending.feature'], rolePermissions: [{ ...permission, code: 'pending.feature', name: '固件升级', available: false, origin: 'prototype', reason: '暂未接入后端' }] }), grant(102, 2, { stationIds: [], stations: [], canEdit: false, canRevoke: false }), grant(103, 1, { scopeRestricted: true, roleId: null, roleName: null, stationIds: [], stations: [], validFrom: null, validUntil: null, term: null, source: null, status: 'restricted', canEdit: false, canRevoke: false, permissionCodes: [], rolePermissions: [], reason: '超出当前管理范围' })] })
  await grantRow(page, 103).getByText('超出当前管理范围').waitFor()
  assert.equal(await page.getByRole('button', { name: '分配权限', exact: true }).count(), 0)
  await grantRow(page, 101).getByRole('button', { name: '查看角色权限' }).click(); await page.getByRole('dialog').getByLabel('old.permission').waitFor()
  assert.equal(await page.getByRole('dialog').getByLabel('old.permission').isDisabled(), true)
  assert.equal(await page.getByRole('dialog').getByLabel('固件升级').isDisabled(), true); await page.getByRole('dialog').getByText('暂未接入后端').waitFor()
  await page.getByRole('button', { name: '关闭权限详情' }).click()
  await grantRow(page, 102).getByText('组织管理范围').waitFor()
  assert.equal(requests.filter(r => ['/platform/roles', '/platform/permissions', '/stations'].includes(r.path)).length, 0)
})

test('in-page create preserves draft through matrix and navigation; pure organization role saves zero sites', async t => {
  const { page, requests } = await setup(t)
  await page.getByRole('button', { name: '分配权限', exact: true }).click()
  await page.getByLabel('业务角色').selectOption('42'); await page.getByText('按角色所属组织及下级组织生效，不授予任何站点权限').waitFor()
  await page.getByRole('button', { name: '查看完整权限' }).click(); assert.equal(await page.getByRole('dialog').getByLabel('查看组织成员', { exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '关闭权限详情' }).click(); assert.equal(await page.getByLabel('业务角色').inputValue(), '42')
  await page.getByRole('button', { name: '安全审计', exact: true }).click(); await page.getByRole('heading', { name: '未保存的修改' }).waitFor(); await page.getByRole('button', { name: '继续编辑' }).click()
  await page.getByRole('button', { name: '保存授权', exact: true }).click(); await grantRow(page, 103).waitFor()
  assert.deepEqual(writes(requests)[0].body, { roleId: 42, stationIds: [], term: 'permanent' })
})

test('same term shows original expiry while changed term requires confirmation and uses saved expiry', async t => {
  const { page, requests } = await setup(t)
  await edit(page, 101); await page.getByText('原截止时间保持不变').waitFor(); await page.getByText('2026/10/01 08:00:00', { exact: false }).waitFor()
  await page.getByLabel('授权期限').selectOption('90d'); await page.getByText('重新起算', { exact: false }).first().waitFor()
  await page.getByRole('button', { name: '保存授权', exact: true }).click(); await page.getByRole('heading', { name: '确认重新起算授权期限' }).waitFor(); assert.equal(writes(requests).length, 0)
  await page.getByRole('button', { name: '确认并保存' }).click(); await grantRow(page, 101).getByText('2026/12/22 08:00:01', { exact: false }).waitFor()
})

test('pending save locks leave dialog and member context until original grant response arrives', async t => {
  const { page, pendingSave, releaseSave, requests } = await setup(t, { pauseSave: true })
  t.after(releaseSave)
  await edit(page, 101); await page.getByLabel('二号站', { exact: true }).check()
  await page.getByRole('button', { name: '安全审计', exact: true }).click(); await page.getByRole('button', { name: '保存并离开' }).click(); await pendingSave
  assert.equal(await page.getByRole('button', { name: '放弃修改' }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: '继续编辑' }).isDisabled(), true)
  assert.equal(await page.getByLabel('角色所属组织').isDisabled(), true)
  assert.equal(await page.getByRole('heading', { name: '未保存的修改' }).count(), 1)
  releaseSave(); await page.getByRole('heading', { name: '我的审计日志' }).waitFor(); assert.equal(writes(requests).length, 1)
})

test('failed options and organization loads cannot reuse stale station selections or roles', async t => {
  const { page, requests, setFailOptions } = await setup(t)
  await edit(page, 101); await page.getByLabel('二号站', { exact: true }).waitFor(); setFailOptions(true)
  await page.getByLabel('授权期限').selectOption('90d'); await page.getByText('站点范围加载失败').waitFor(); assert.equal(await page.getByRole('button', { name: '保存授权', exact: true }).isDisabled(), true)
  await page.getByLabel('角色所属组织').selectOption('4'); await page.getByText('角色目录加载失败').waitFor(); assert.equal(await page.getByLabel('业务角色').locator('option[value="41"]').count(), 0)
  assert.equal(writes(requests).length, 0)
})



test('active navigation preserves the current grant draft and sidebar cancellation retains selections', async t => {
  const { page, requests } = await setup(t)
  await edit(page, 101); await page.getByLabel('二号站', { exact: true }).check()
  await page.getByRole('button', { name: '组织权限', exact: true }).click()
  assert.equal(await page.getByLabel('二号站', { exact: true }).isChecked(), true)
  await page.getByRole('tab', { name: '成员管理', exact: true }).click()
  assert.equal(await page.getByLabel('二号站', { exact: true }).isChecked(), true)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('heading', { name: '未保存的修改' }).waitFor()
  await page.getByRole('button', { name: '继续编辑' }).click()
  assert.equal(await page.getByLabel('二号站', { exact: true }).isChecked(), true)
  await page.getByRole('button', { name: '返回成员权限', exact: true }).click()
  await page.getByRole('button', { name: '放弃修改' }).click(); await grantRow(page, 101).waitFor()
  assert.equal(writes(requests).length, 0)
})

test('historical custom term cannot save without explicit supported term and confirmation', async t => {
  const { page, requests } = await setup(t, { grants: [grant(101, 1, { term: 'custom', periodChangeRequired: true, status: 'expired' })] })
  await grantRow(page, 101).getByText('已过期').waitFor(); await edit(page, 101)
  assert.equal(await page.getByLabel('授权期限').inputValue(), 'custom')
  assert.equal(await page.getByRole('button', { name: '保存授权', exact: true }).isDisabled(), true)
  assert.equal(requests.some(r => r.path.endsWith('grant-options') && r.search.includes('term=custom')), false)
  await page.getByLabel('授权期限').selectOption('30d'); await page.getByLabel('二号站', { exact: true }).waitFor()
  await page.getByRole('button', { name: '保存授权', exact: true }).click()
  await page.getByRole('heading', { name: '确认重新起算授权期限' }).waitFor()
  await page.getByRole('button', { name: '继续编辑' }).click(); assert.equal(writes(requests).length, 0)
})

test('late preview cannot replace latest selection; failed writes keep the draft', async t => {
  const { page, requests } = await setup(t, { pauseOptions: true, failSave: true })
  await edit(page, 101); await page.getByLabel('二号站', { exact: true }).check()
  await page.getByLabel('授权期限').selectOption('90d'); await page.getByLabel('授权期限').selectOption('permanent')
  await page.getByText('截止时间（北京时间）：').waitFor(); await new Promise(resolve => setTimeout(resolve, 600))
  await page.getByRole('button', { name: '保存授权', exact: true }).click(); await page.getByRole('button', { name: '确认并保存' }).click()
  await page.getByRole('dialog').getByText('授权范围已变化').waitFor(); await page.getByRole('button', { name: '继续编辑' }).click()
  assert.equal(await page.getByLabel('授权期限').inputValue(), 'permanent'); assert.equal(await page.getByLabel('二号站', { exact: true }).isChecked(), true)
  assert.equal(writes(requests)[0].body.term, 'permanent')
})

test('empty grants, unavailable roles and unavailable stations have explicit non-writable states', async t => {
  const { page, requests } = await setup(t, { grants: [], roles: [{ ...role, canAssign: false, reason: '权限超出上限' }] })
  await page.getByText('暂无授权，可按成员职责分配权限。').waitFor()
  await page.getByRole('button', { name: '分配权限', exact: true }).click(); await page.getByText('暂无可授予角色').waitFor()
  assert.equal(await page.getByLabel('业务角色').locator('option[value="41"]').evaluate(option => option.disabled), true)
  assert.equal(await page.getByRole('button', { name: '保存授权', exact: true }).isDisabled(), true); assert.equal(writes(requests).length, 0)
})

test('no eligible stations blocks a station role and capture prototype layout at 1280', async t => {
  const { page } = await setup(t, { noStations: true })
  if (process.env.GRANT_SCREENSHOTS) { fs.mkdirSync(process.env.GRANT_SCREENSHOTS, { recursive: true }); await grantRow(page, 101).waitFor(); await page.screenshot({ path: process.env.GRANT_SCREENSHOTS + '/grant-overview.png', fullPage: true }) }
  await page.getByRole('button', { name: '分配权限', exact: true }).click(); await page.getByLabel('业务角色').selectOption('41')
  await page.getByText('暂无可授权站点').waitFor(); assert.equal(await page.getByRole('button', { name: '保存授权', exact: true }).isDisabled(), true)
  if (process.env.GRANT_SCREENSHOTS) await page.screenshot({ path: process.env.GRANT_SCREENSHOTS + '/grant-form.png', fullPage: true })
})


test('direct pending write blocks main navigation and member return until saved', async t => {
  const { page, pendingSave, releaseSave } = await setup(t, { pauseSave: true }); t.after(releaseSave)
  await edit(page, 101); await page.getByLabel('二号站', { exact: true }).check(); await page.getByRole('button', { name: '保存授权', exact: true }).click(); await pendingSave
  assert.equal(await page.getByRole('button', { name: '返回成员权限', exact: true }).isDisabled(), true)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  assert.equal(await page.getByLabel('二号站', { exact: true }).isChecked(), true)
  releaseSave(); await grantRow(page, 101).getByText('一号站、二号站').waitFor()
})

test('late member grant response cannot populate another member detail', async t => {
  const { page } = await setup(t, { pauseGrants: true })
  await page.getByRole('button', { name: '返回成员列表', exact: true }).click()
  await page.getByRole('row').filter({ hasText: '李四' }).getByRole('button', { name: '查看权限' }).click()
  await page.getByRole('heading', { name: '李四', exact: true }).waitFor()
  await new Promise(resolve => setTimeout(resolve, 550))
  assert.equal(await page.locator('[data-grant-id]').count(), 0)
  await page.getByText('暂无授权，可按成员职责分配权限。').waitFor()
})

test('grant list load failure is explicit and exposes no stale row actions', async t => {
  const { page, requests } = await setup(t, { failGrants: true })
  await page.getByText('授权列表加载失败').waitFor(); assert.equal(await page.locator('[data-grant-id]').count(), 0)
  assert.equal(await page.getByText('暂无授权，可按成员职责分配权限。').count(), 0)
  assert.equal(await page.getByRole('button', { name: '分配权限', exact: true }).count(), 0)
  assert.equal(writes(requests).length, 0)
})

test('grant dialogs focus safe action, contain keyboard traversal and restore their trigger', async t => {
  const { page } = await setup(t)
  const previewTrigger = grantRow(page, 101).getByRole('button', { name: '查看角色权限' })
  await previewTrigger.click()
  const close = page.getByRole('button', { name: '关闭权限详情' })
  assert.equal(await close.evaluate(e => e === document.activeElement), true, 'preview initially focuses its close action')
  await page.keyboard.press('Tab')
  assert.equal(await close.evaluate(e => e === document.activeElement), true)
  await page.keyboard.press('Shift+Tab')
  assert.equal(await close.evaluate(e => e === document.activeElement), true)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 0)
  assert.equal(await previewTrigger.evaluate(e => e === document.activeElement), true)
  const revokeTrigger = grantRow(page, 101).getByRole('button', { name: '撤销', exact: true })
  await revokeTrigger.click()
  const cancel = page.getByRole('dialog').getByRole('button', { name: '取消', exact: true })
  assert.equal(await cancel.evaluate(e => e === document.activeElement), true, 'destructive confirmation focuses cancel')
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.getByRole('button', { name: '确认撤销' }).evaluate(e => e === document.activeElement), true)
  await page.keyboard.press('Tab')
  assert.equal(await cancel.evaluate(e => e === document.activeElement), true)
  await page.keyboard.press('Escape')
  assert.equal(await revokeTrigger.evaluate(e => e === document.activeElement), true)
  await edit(page, 101)
  await page.getByLabel('授权期限').selectOption('90d')
  const save = page.getByRole('button', { name: '保存授权', exact: true })
  await save.click()
  assert.equal(await page.getByRole('button', { name: '继续编辑' }).evaluate(e => e === document.activeElement), true)
  await page.keyboard.press('Escape')
  assert.equal(await save.evaluate(e => e === document.activeElement), true)
  const back = page.getByRole('button', { name: '返回成员权限', exact: true })
  await back.click()
  assert.equal(await page.getByRole('button', { name: '继续编辑' }).evaluate(e => e === document.activeElement), true)
  await page.keyboard.press('Shift+Tab')
  assert.equal(await page.getByRole('button', { name: '保存并离开' }).evaluate(e => e === document.activeElement), true)
  await page.keyboard.press('Escape')
  assert.equal(await back.evaluate(e => e === document.activeElement), true)
})

test('pending grant dialog retains keyboard focus while every action is disabled', async t => {
  const { page, pendingSave, releaseSave } = await setup(t, { pauseSave: true, failSave: true })
  t.after(releaseSave)
  await edit(page, 101)
  await page.getByLabel('二号站', { exact: true }).check()
  await page.getByRole('button', { name: '返回成员权限', exact: true }).click()
  await page.getByRole('button', { name: '保存并离开' }).click()
  await pendingSave
  await page.keyboard.press('Tab')
  assert.equal(await page.getByRole('dialog').evaluate(e => e.contains(document.activeElement)), true)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 1, 'busy operation cannot be dismissed')
  releaseSave()
  await page.getByRole('dialog').getByText('授权范围已变化').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 0)
})

test('unavailable existing role can narrow with canExpand false while added stations remain unavailable', async t => {
  const retained = grant(101, 1, { canExpand: false, stationIds: [1, 2], stations: [{ id: 1, name: '一号站' }, { id: 2, name: '二号站' }], permissionCodes: ['asset.read', 'workorder.manage'], reason: '角色含暂不可用权限，只能保留或缩小已有授权' })
  const { page, requests } = await setup(t, { grants: [retained], roles: [{ ...role, canAssign: false, permissionCodes: retained.permissionCodes, reason: retained.reason }], grantOptions: { canExpand: false, stations: [{ id: 1, name: '一号站', selectable: true, reason: null }, { id: 2, name: '二号站', selectable: true, reason: null }, { id: 3, name: '三号站', selectable: false, reason: '仅可缩小已有授权' }] } })
  await edit(page, 101)
  await page.getByLabel('三号站', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('业务角色').inputValue(), '41')
  assert.equal(await page.getByLabel('三号站', { exact: true }).isDisabled(), true)
  await page.getByLabel('二号站', { exact: true }).uncheck()
  await page.getByRole('button', { name: '保存授权', exact: true }).click()
  await grantRow(page, 101).getByText('一号站', { exact: true }).waitFor()
  assert.deepEqual(writes(requests), [{ path: '/members/8/grants/101', method: 'PUT', search: '', body: { roleId: 41, stationIds: [1], term: '30d' } }])
})
