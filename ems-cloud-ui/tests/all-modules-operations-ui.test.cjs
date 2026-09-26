const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const url = process.env.API_PREVIEW_URL || 'http://127.0.0.1:8461'
const artifacts = path.resolve(__dirname, '../.figma/all-modules/03')

async function setup({twoStations=false, devices=false}={}) {
  const browser = await chromium.launch({channel:'msedge', headless:true})
  const context = await browser.newContext({viewport:{width:1440,height:900}, timezoneId:'Asia/Shanghai'})
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token','operations-test'))
  const page = await context.newPage(); page.setDefaultTimeout(12000)
  const writes = [], errors = []
  const user = {id:'3',name:'运营人员',account:'ops@test',role:'integrator',organization:'测试',stationIds:['12'], permissions:['asset.read','strategy.read','strategy.manage','market.read','market.manage','revenue.read'], stationPermissions:{'12':['asset.read','strategy.read','strategy.manage','market.read','market.manage','revenue.read']},organizationPermissions:{}}
  if(twoStations){user.stationIds.push('13');user.stationPermissions['13']=[...user.permissions]}
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort())
  page.on('pageerror',e=>errors.push(e.message))
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const req=route.request(), pathname=new URL(req.url()).pathname.replace(/^\/api/,''); let data=[]
    if(req.method()!=='GET') writes.push(pathname)
    if(pathname==='/auth/me') data=user
    else if(pathname==='/stations') data=[{id:12,name:'运营测试站',code:'O-12',rated_power_kw:100,capacity_kwh:200,status:'online'},...(twoStations?[{id:13,name:'保留权限站',code:'O-13',rated_power_kw:100,capacity_kwh:200,status:'online'}]:[])]
    else if(pathname.endsWith('/devices') && devices) data=[{id:501,name:'真实 PCS A',code:'PCS-A',category:'PCS',communication_status:'online'},{id:502,name:'真实 PCS B',code:'PCS-B',category:'PCS',communication_status:'offline'}]
    else if(pathname==='/stations/12') data={id:12,name:'运营测试站',code:'O-12',rated_power_kw:100,capacity_kwh:200,status:'online'}
    await route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data})})
  })
  try { await page.goto(url,{waitUntil:'domcontentloaded'})
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'运营中心',exact:true}).click() } catch(e) { console.error(await page.locator('body').innerText(),errors);await browser.close();throw e }
  return {browser,page,writes,errors,user}
}

test('API operations preserves unknown data, separates response invitations from market service drafts and fits design widths', async()=>{
  const {browser,page,writes,errors}=await setup()
  try {
    await page.getByRole('heading',{name:'站点运行分布',exact:true}).waitFor()
    await page.getByRole('heading',{name:'站点运营表现',exact:true}).waitFor()
    assert.match(await page.locator('[data-testid="operations-day-revenue"]').textContent(),/--/)
    await fs.mkdir(artifacts,{recursive:true})
    for(const width of [1366,1440,1920]) {
      await page.setViewportSize({width,height:900})
      const box=await page.locator('.workspace-content').boundingBox()
      assert.equal(Math.round(box.x),176); assert.equal(Math.round(box.y),56)
      assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
      await page.screenshot({path:path.join(artifacts,`overview-${width}.png`)})
    }
    await page.getByRole('button',{name:'收益趋势与经营明细',exact:false}).click()
    await page.getByRole('button',{name:'能量',exact:true}).click()
    assert.equal(await page.getByRole('button',{name:'能量',exact:true}).getAttribute('aria-pressed'),'true')
    await page.getByRole('button',{name:'市场响应',exact:true}).click()
    await page.getByText('市场邀约接口尚未接通',{exact:false}).waitFor()
    assert.equal(await page.locator('.market-event-list tbody tr').count(),0)
    await page.getByRole('button',{name:'资源与交付',exact:true}).click()
    await page.getByText('市场价格、实时可用能力及交付采样接口尚未接通。',{exact:false}).waitFor()
    await page.getByRole('button',{name:'返回市场响应',exact:true}).click()
    await page.getByRole('button',{name:'市场服务',exact:true}).click()
    await page.getByRole('heading',{name:'服务资格',exact:true}).waitFor()
    await page.getByRole('button',{name:'新建内部草稿',exact:true}).waitFor()
    assert.deepEqual(writes,[]); assert.deepEqual(errors,[])
  } finally {await browser.close()}
})

test('response draft validates required fields, protects leaving and cannot fabricate a market submission',async()=>{
  const {browser,page,writes,errors}=await setup()
  try {
    await page.getByRole('button',{name:'市场响应',exact:true}).click()
    await page.getByRole('button',{name:'新建本地邀约草稿',exact:true}).click()
    await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'请填写'}).waitFor()
    await page.getByLabel('事件名称',{exact:true}).fill('手动记录的邀约')
    await page.getByRole('dialog',{name:'新建本地邀约草稿'}).getByRole('button',{name:'取消',exact:true}).click()
    await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
    await page.getByRole('button',{name:'继续编辑',exact:true}).click()
    assert.equal(await page.getByLabel('事件名称',{exact:true}).inputValue(),'手动记录的邀约')
    await page.getByLabel('响应日期',{exact:true}).fill('2099-10-01')
    await page.getByLabel('需求容量 kW',{exact:true}).fill('50')
    await page.getByRole('checkbox',{name:'运营测试站',exact:true}).check()
    await page.evaluate(()=>{window.__storageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('enerlution-market-response-events'))throw new Error('storage unavailable');return window.__storageSet.call(this,k,v)}})
    await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'保存失败'}).waitFor()
    await page.evaluate(()=>{Storage.prototype.setItem=window.__storageSet})
    await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
    await page.getByRole('button',{name:'处理邀约',exact:false}).click()
    await page.getByText('可用功率未知',{exact:false}).waitFor()
    assert.equal(await page.getByRole('button',{name:'确认参与',exact:true}).isEnabled(),false)
    await page.getByRole('button',{name:'拒绝邀约',exact:true}).click()
    await page.getByRole('dialog',{name:'拒绝本次邀约'}).waitFor()
    await page.getByRole('button',{name:'确认拒绝',exact:true}).click()
    await page.getByText('拒绝意向草稿 · 未提交',{exact:true}).waitFor()
    assert.deepEqual(writes,[]); assert.deepEqual(errors,[])
  } finally {await browser.close()}
})


test('dispatch tools validate local control proposals and never dispatch device commands',async()=>{
 const {browser,page,writes}=await setup({devices:true})
 try {
  await page.getByRole('button',{name:'策略执行',exact:true}).click()
  await page.getByRole('button',{name:'偏差与交接',exact:true}).click()
  await page.getByLabel('控制对象',{exact:true}).selectOption('501')
  await page.getByLabel('建议运行模式',{exact:true}).selectOption('manual')
  await page.getByLabel('SoC 下限 %',{exact:true}).fill('90')
  await page.getByLabel('SoC 上限 %',{exact:true}).fill('20')
  await page.getByLabel('目标有功功率 kW',{exact:true}).fill('40')
  await page.getByRole('button',{name:'检查并确认',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'SoC'}).waitFor()
  await page.getByLabel('SoC 下限 %',{exact:true}).fill('20')
  await page.getByLabel('SoC 上限 %',{exact:true}).fill('90')
  await page.getByLabel('目标有功功率 kW',{exact:true}).fill('101')
  await page.getByRole('button',{name:'检查并确认',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'额定功率'}).waitFor()
  await page.getByLabel('目标有功功率 kW',{exact:true}).fill('40')
  await page.getByLabel('操作说明',{exact:true}).fill('记录调度建议')
  await page.getByRole('button',{name:'检查并确认',exact:true}).click()
  await page.getByRole('dialog',{name:'确认保存调度建议？'}).waitFor()
  await page.getByRole('button',{name:'保存本地建议',exact:true}).click()
  await page.getByText('本地建议已保存，未下发设备或提交审批。',{exact:true}).waitFor()
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('enerlution-dispatch-notes-v1:api:3:12'))[0])
  assert.equal(saved.deviceId,'501');assert.equal(saved.deviceName,'真实 PCS A');assert.equal(saved.mode,'manual');assert.equal(saved.socMin,20);assert.equal(saved.socMax,90)
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`dispatch-results-${width}.png`)});await page.locator('.operations-page').evaluate(el=>el.scrollTo(0,0));assert.ok(await page.locator('.operations-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.join(artifacts,`dispatch-controls-${width}.png`)})}
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})

test('demo participation blocks insufficient power, protects navigation and labels saved intention as unsubmitted',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Shanghai'})
  await context.addInitScript(()=>{
   localStorage.setItem('enerlution-auth-session-v1',JSON.stringify({userId:'user-integrator-demo'}))
   localStorage.setItem('enerlution-market-response-events-v1:demo:user-integrator-demo',JSON.stringify([{id:'coverage-invite',name:'覆盖邀约',date:'2026-09-19',kind:'response',start:'18:00',end:'20:00',capacity:50,stationIds:['1']}]))
  })
  const page=await context.newPage();page.setDefaultTimeout(12000)
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort())
  await page.goto(process.env.DEMO_PREVIEW_URL||'http://127.0.0.1:8460',{waitUntil:'domcontentloaded'})
  // Isolated component capability fixture: production demo roles deliberately do not grant market operations.
  await page.locator('.workspace-sidebar').waitFor()
  await page.evaluate(async()=>{const {ROLE_CONFIG}=await import('/src/auth/roles.ts');ROLE_CONFIG.integrator.nav=[...ROLE_CONFIG.integrator.nav,'运营中心'];ROLE_CONFIG.integrator.operationsTabs=['运营总览','策略执行','市场服务','收益结算']})
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).click()
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'运营中心',exact:true}).click()
  const tabs=page.getByRole('navigation',{name:'运营中心二级导航'})
  for(const width of [1366,1440,1920]) {
   await page.setViewportSize({width,height:900})
   for(const [tab,file] of [['运营总览','demo-overview'],['策略执行','schedule'],['市场响应','market'],['收益核算','settlement']]) {
    await tabs.getByRole('button',{name:tab,exact:true}).click()
    assert.ok(await page.locator('.operations-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
    await page.screenshot({path:path.join(artifacts,`${file}-${width}.png`)})
    if(tab==='策略执行'){
     await page.getByRole('button',{name:'执行质量',exact:true}).click()
     await page.getByRole('heading',{name:'组合计划与实际执行'}).waitFor()
     await page.screenshot({path:path.join(artifacts,`demo-execution-quality-${width}.png`),fullPage:true})
     await page.getByRole('button',{name:'返回策略执行',exact:true}).click()
    }
   }
  }
  await page.setViewportSize({width:1440,height:900})
  await tabs.getByRole('button',{name:'市场响应',exact:true}).click()
  await page.getByRole('row').filter({hasText:'覆盖邀约'}).getByRole('button',{name:'处理邀约'}).click()
  const checkbox=page.locator('.market-selection input').first()
  await checkbox.uncheck()
  const unchecked=page.locator('img[src$="imgSelectionUncheckedStateDefault.svg"]').first()
  assert.deepEqual(await unchecked.evaluate(el=>[el.clientWidth,el.clientHeight]),[18,18])
  await checkbox.check()
  assert.deepEqual(await page.locator('img[src$="imgSelectionCheckedStateDefault.svg"]').first().evaluate(el=>[el.clientWidth,el.clientHeight]),[18,18])
  const input=page.locator('.market-capacity-input').first()
  await input.fill('25')
  assert.equal(await page.getByRole('button',{name:'确认参与',exact:true}).isEnabled(),false)
  await page.getByText('还需分配 25 kW',{exact:false}).waitFor()
  await page.screenshot({path:path.join(artifacts,'participation-insufficient.png')})
  await tabs.getByRole('button',{name:'策略执行',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).getByRole('button',{name:'继续编辑',exact:true}).click()
  assert.equal(await input.inputValue(),'25')
  await input.fill('50')
  await page.getByRole('button',{name:'确认参与',exact:true}).click()
  const confirmation=page.getByRole('dialog',{name:'确认参与本次响应',exact:true})
  await confirmation.waitFor()
  assert.deepEqual(await confirmation.locator('img[src$="imgIconStatusWarning.svg"]').evaluate(el=>[el.clientWidth,el.clientHeight]),[24,24])
  assert.deepEqual(await confirmation.locator('img[src$="imgIconActionClose.svg"]').evaluate(el=>[el.clientWidth,el.clientHeight]),[18,18])
  await page.screenshot({path:path.join(artifacts,'participation-confirm.png')})
  await confirmation.getByRole('button',{name:'确认参与',exact:true}).click()
  await page.getByText('参与意向草稿 · 未提交',{exact:true}).waitFor()
  await page.screenshot({path:path.join(artifacts,'participation-saved.png')})
 } finally {await browser.close()}
})

test('revoked market manage permission closes drafts and removes local action entry',async()=>{
 const {browser,page,user,writes}=await setup()
 try {
  await page.getByRole('button',{name:'市场响应',exact:true}).click()
  await page.getByRole('button',{name:'新建本地邀约草稿',exact:true}).click()
  await page.getByLabel('事件名称',{exact:true}).fill('撤权草稿')
  user.permissions=user.permissions.filter(p=>p!=='market.manage')
  user.stationPermissions['12']=user.permissions
  const refresh=page.waitForResponse(r=>r.url().endsWith('/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await refresh
  await page.getByRole('dialog',{name:'新建本地邀约草稿'}).waitFor({state:'detached'})
  assert.equal(await page.getByRole('button',{name:'新建本地邀约草稿',exact:true}).count(),0)
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})



test('internal market draft protects main tabs and shared-header logout',async()=>{
 const {browser,page,writes}=await setup()
 try {
  await page.getByRole('button',{name:'市场响应',exact:true}).click()
  await page.getByRole('button',{name:'市场服务',exact:true}).click()
  await page.getByRole('button',{name:'新建内部草稿',exact:true}).click()
  await page.getByLabel('服务名称',{exact:true}).fill('尚未保存的内部草稿')
  await page.getByRole('button',{name:'策略执行',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).getByRole('button',{name:'继续编辑'}).click()
  assert.equal(await page.getByLabel('服务名称',{exact:true}).inputValue(),'尚未保存的内部草稿')
  await page.getByRole('button',{name:'运营人员，账户菜单',exact:true}).click()
  await page.getByRole('button',{name:'退出登录',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).getByRole('button',{name:'继续编辑'}).click()
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})


test('partial station revocation cancels a pending leave and resets the selected invitation draft',async()=>{
 const {browser,page,user,writes}=await setup({twoStations:true})
 try {
  await page.getByRole('button',{name:'市场响应',exact:true}).click()
  await page.getByRole('button',{name:'新建本地邀约草稿',exact:true}).click()
  await page.getByLabel('事件名称',{exact:true}).fill('双站草稿')
  await page.getByLabel('运营测试站',{exact:true}).check()
  await page.getByLabel('保留权限站',{exact:true}).check()
  await page.getByRole('dialog',{name:'新建本地邀约草稿'}).getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  user.stationPermissions['12']=user.stationPermissions['12'].filter(p=>p!=='market.manage')
  const refresh=page.waitForResponse(r=>r.url().endsWith('/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refresh
  await page.getByRole('dialog',{name:'新建本地邀约草稿'}).waitFor({state:'detached'})
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor({state:'detached'})
  await page.getByRole('button',{name:'新建本地邀约草稿',exact:true}).click()
  assert.equal(await page.getByLabel('事件名称',{exact:true}).inputValue(),'')
  assert.equal(await page.getByLabel('保留权限站',{exact:true}).isChecked(),false)
  assert.equal(await page.getByLabel('运营测试站',{exact:true}).count(),0)
  await page.getByRole('dialog',{name:'新建本地邀约草稿'}).getByRole('button',{name:'取消',exact:true}).click()
  user.stationPermissions['12'].push('market.manage')
  let refreshed=page.waitForResponse(r=>r.url().endsWith('/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refreshed
  await page.getByRole('button',{name:'新建本地邀约草稿',exact:true}).click()
  await page.getByLabel('运营测试站',{exact:true}).check()
  await page.getByLabel('保留权限站',{exact:true}).check()
  await page.getByLabel('事件名称',{exact:true}).fill('双站确认')
  await page.getByLabel('需求容量 kW',{exact:true}).fill('20')
  await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
  await page.getByRole('row').filter({hasText:'双站确认'}).getByRole('button',{name:'处理邀约'}).click()
  await page.getByRole('button',{name:'拒绝邀约',exact:true}).click()
  await page.getByRole('dialog',{name:'拒绝本次邀约'}).waitFor()
  user.stationPermissions['12']=user.stationPermissions['12'].filter(p=>p!=='market.manage')
  refreshed=page.waitForResponse(r=>r.url().endsWith('/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refreshed
  await page.getByRole('dialog',{name:'拒绝本次邀约'}).waitFor({state:'detached'})
  assert.equal(await page.getByRole('button',{name:'返回事件列表',exact:true}).count(),0)
  await page.getByRole('row').filter({hasText:'双站确认'}).getByRole('button').last().click()
  assert.equal(await page.getByRole('button',{name:'拒绝邀约',exact:true}).count(),0)
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})

test('aggregate execution quality retains range, missing-data metrics and cross-station detail',async()=>{
 const {browser,page,writes}=await setup({twoStations:true})
 try {
  await page.getByRole('button',{name:'策略执行',exact:true}).click()
  await page.getByRole('button',{name:'执行质量',exact:true}).click()
  await page.getByRole('heading',{name:'组合计划与实际执行',exact:true}).waitFor()
  await page.getByRole('heading',{name:'跨站执行明细',exact:true}).waitFor()
  assert.match(await page.locator('[data-testid="execution-coverage"]').textContent(),/0 \/ 2/)
  assert.match(await page.locator('[data-testid="execution-mae"]').textContent(),/--/)
  await page.getByLabel('执行开始日期',{exact:true}).fill('2026-09-20')
  await page.getByLabel('执行结束日期',{exact:true}).fill('2026-09-19')
  await page.getByRole('alert').filter({hasText:'时间范围'}).waitFor()
  await page.getByLabel('执行结束日期',{exact:true}).fill('2026-09-26')
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('.operations-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.join(artifacts,`execution-quality-${width}.png`),fullPage:true})}
  await page.getByRole('button',{name:'返回策略执行',exact:true}).click()
  await page.getByRole('button',{name:'偏差与交接',exact:true}).click()
  await page.getByLabel('控制对象',{exact:true}).waitFor()
  assert.equal(await page.getByLabel('控制对象',{exact:true}).isEnabled(),false)
  await page.getByLabel('目标有功功率 kW',{exact:true}).fill('10')
  await page.getByLabel('操作说明',{exact:true}).fill('无设备不能保存功率建议')
  await page.getByRole('button',{name:'检查并确认',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'设备'}).waitFor()
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})
