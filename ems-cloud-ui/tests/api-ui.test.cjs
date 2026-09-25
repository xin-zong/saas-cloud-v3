const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
test('API login, station scope, server workorder creation, reload and logout', async () => {
  const browser = await chromium.launch({channel:'msedge', headless:true})
  const context = await browser.newContext({viewport:{width:1440,height:1000}})
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const user = {id:'7',name:'真实用户',account:'test@example.test',role:'operator',organization:'测试',stationIds:['12'],permissions:['asset.read','alarm.read','workorder.read','workorder.create','workorder.edit','workorder.handle']}
  user.stationPermissions = Object.fromEntries(user.stationIds.map(id => [id, [...user.permissions]]))
  user.organizationPermissions = {}
  const orders = []
  let created = false, revoked = false
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(4)
    let data = []
    if (path === '/auth/login') data = {requiresMfa:false, token:'test-token', user}
    else if (path === '/auth/me') data = user
    else if (path === '/auth/logout') {revoked = true; data = null}
    else {
      assert.equal(request.headers().authorization, 'Bearer test-token')
      if (path === '/stations') data = [{id:12,name:'服务器站点',code:'REAL-12',rated_power_kw:100,capacity_kwh:200},{id:99,name:'禁止显示站点'}]
      if (path === '/work-orders') {
        if (request.method() === 'POST') {
          const body = request.postDataJSON()
          assert.equal(body.stationId,12)
          assert.equal(body.assignedTo,7)
          created = true
          orders.push({id:61,station_id:12,title:body.title,description:body.description,status:'pending',created_at:new Date().toISOString(),due_at:body.dueAt,assigned_to:7})
          data = {id:61}
        } else data = orders
      }
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,msg:'ok',data})})
  })
  try {
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8443')
    assert.equal(await page.getByText('密码统一为 Demo@2026').count(),0)
    await page.getByLabel('登录账号',{exact:true}).fill('test@example.test')
    await page.getByLabel('密码',{exact:true}).fill('server-only-password')
    await page.getByRole('button',{name:'登录',exact:true}).click()
    await page.getByText('已连接业务服务',{exact:false}).waitFor()
    await page.getByRole('button',{name:'资产与站点',exact:true}).click()
    await page.getByText('服务器站点',{exact:true}).first().waitFor()
    assert.equal(await page.getByText('禁止显示站点').count(),0)
    assert.equal(await page.locator('body').innerText().then(text=>text.includes('NaN')),false)
    await page.getByRole('button',{name:'工单与审批',exact:true}).click()
    await page.getByRole('button',{name:'新建工单',exact:true}).click()
    await page.getByLabel('新建工单标题',{exact:true}).fill('服务端创建测试工单')
    await page.getByLabel('新建工单描述',{exact:true}).fill('真实接口提交测试')
    await page.getByRole('button',{name:'创建工单',exact:true}).click()
    await page.getByText('工单 61 已由服务器创建',{exact:true}).waitFor()
    assert.equal(created,true)
    await page.reload()
    await page.getByText('已连接业务服务',{exact:false}).waitFor()
    await page.getByRole('button',{name:'退出登录',exact:true}).first().click()
    await page.getByRole('button',{name:'登录',exact:true}).waitFor()
    assert.equal(revoked,true)
    assert.deepEqual(errors,[])
  } finally {await browser.close()}
})

test('API strategy empty state, draft approval and tariff effective-period creation', async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true})
  const context = await browser.newContext({viewport:{width:1440,height:1100}})
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token','phase2'))
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const errors=[]; page.on('pageerror',e=>errors.push(e.message))
  const user={id:'7',name:'计划用户',account:'plan@test',role:'integrator',organization:'测试',stationIds:['12'],permissions:['asset.read','strategy.read','strategy.manage','tariff.manage']}
  user.stationPermissions = Object.fromEntries(user.stationIds.map(id => [id, [...user.permissions]]))
  user.organizationPermissions = {}
  const plans=[],tariffs=[]
  let submitted=false,tariffPosts=0
  await page.route('http://127.0.0.1:18090/api/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname.slice(4)
    let data=[]
    if(path==='/auth/me') data=user
    else if(path==='/stations') data=[{id:12,name:'计划站点',code:'TEST',rated_power_kw:100,capacity_kwh:200}]
    else if(path==='/stations/12/plans') data=plans
    else if(path==='/plans' && request.method()==='POST') {
      const body=request.postDataJSON();assert.equal(body.stationId,12);assert.deepEqual(body.periods,[{startMinute:0,endMinute:60,mode:'charge',powerKw:25}])
      plans.unshift({id:51,version:1,status:'draft',kind:body.kind,periods:body.periods.map((p,i)=>({id:i+1,start_minute:p.startMinute,end_minute:p.endMinute,mode:p.mode,power_kw:p.powerKw}))}); data={id:51,version:1}
    } else if(path==='/plans/51/submit') {submitted=true;plans[0].status='submitted';data={approvalId:1}}
    else if(path==='/stations/12/tariffs') data=tariffs
    else if(path==='/tariffs') {
      const body=request.postDataJSON();assert.equal(body.validFrom,'2030-01-01');assert.equal(body.validUntil,'2031-01-01');assert.equal(body.periods[0].pricePerKwh,-0.1)
      tariffPosts++;tariffs.push({tariff_id:1,name:body.name,currency:body.currency,valid_from:body.validFrom,valid_until:body.validUntil,periods:body.periods.map(p=>({start_minute:p.startMinute,end_minute:p.endMinute,band:p.band,price_per_kwh:p.pricePerKwh}))});data={id:1}
    }
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,data})})
  })
  try {
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8443')
    await page.getByRole('button',{name:'资产与站点',exact:true}).click(); await page.getByRole('button',{name:'计划站点',exact:true}).first().click()
    await page.getByRole('button',{name:'策略运行',exact:true}).click()
    await page.getByText('该日期暂无计划时段。不会自动生成演示计划。',{exact:true}).waitFor()
    await page.getByRole('button',{name:'新增时段',exact:true}).click()
    await page.getByLabel('计划时段模式',{exact:true}).selectOption('charge')
    await page.getByLabel('计划功率',{exact:true}).fill('25')
    await page.getByRole('button',{name:'保存新版本草稿',exact:true}).click()
    await page.getByRole('button',{name:'提交内部审批',exact:true}).click()
    await page.getByText('已提交内部审批；未向 EMS 下发，未执行',{exact:true}).waitFor()
    assert.equal(submitted,true)
    await page.getByRole('button',{name:'编辑电价',exact:true}).click()
    await page.getByRole('button',{name:'日模板管理',exact:true}).click()
    await page.getByText('服务器暂无电价版本。请新建生效期间并配置时段。',{exact:true}).waitFor()
    await page.getByRole('button',{name:'＋ 新增模板',exact:true}).click()
    await page.getByLabel('模板名称',{exact:true}).fill('新期间测试')
    await page.getByLabel('购电固定价',{exact:true}).fill('-0.1')
    await page.getByRole('button',{name:'保存模板',exact:true}).click()
    await page.getByRole('button',{name:'创建生效期间',exact:true}).click()
    const tariffDialog=page.getByRole('dialog',{name:'创建服务器电价生效期间'})
    await tariffDialog.getByLabel('电价生效日期',{exact:true}).fill('2030-01-01')
    await tariffDialog.getByLabel('电价结束日期',{exact:true}).fill('2031-01-01')
    await tariffDialog.getByRole('button',{name:'创建新生效期间',exact:true}).click()
    await page.getByRole('status').filter({hasText:'新电价生效期间已由服务器创建'}).waitFor()
    await page.getByRole('button',{name:'创建生效期间',exact:true}).click()
    await tariffDialog.getByRole('button',{name:'创建新生效期间',exact:true}).click()
    await tariffDialog.getByRole('alert').filter({hasText:'新电价生效期间与已保存期间重叠'}).waitFor()
    assert.equal(tariffPosts,1);assert.deepEqual(errors,[])
  } finally {await browser.close()}
})
