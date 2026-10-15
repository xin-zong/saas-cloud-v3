const test = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs/promises')
const path = require('node:path')
const preview = process.env.API_PREVIEW_URL || 'http://127.0.0.1:8445/'
const permissions = ['asset.read','alarm.read','workorder.read','workorder.create','workorder.edit','workorder.handle','inspection.manage']
async function setup(browser, { role = 'Engineer', readonly = false } = {}) {
 const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Shanghai' })
 await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'maintenance-entry-test'))
 const page = await context.newPage(); page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000)
 const caps = readonly ? ['asset.read','alarm.read','workorder.read'] : [...permissions]
 const user = { id:'7',name:'巡检办理人',account:'maintenance@test.local',tenant:{actorId:7,tenantId:2,kind:'enterprise',administrator:false},roleNames:[role],stationIds:['12'],permissions:caps,stationPermissions:{'12':caps},menus:['assets','maintenance','workorders'].map((p,i)=>({id:i+1,client:'web',kind:'page',path:p,children:[]})) }
 const inspections = [], writes = [], errors = []
 let fail = false
 page.on('pageerror', e => errors.push(e.message))
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|api\.mymemory\.translated\.net/, r => r.abort())
 await page.route(u => u.pathname.startsWith('/api/'), async route => {
  const req=route.request(), p=new URL(req.url()).pathname.slice(4); let data=[]
  if(req.method()!=='GET')writes.push({path:p,body:req.postDataJSON()})
  if(p==='/auth/me') data=user
  else if(p==='/stations') data=[{id:12,name:'巡检测试站',code:'INSPECT-12',status:'online'}]
  else if(p.endsWith('/devices')) data=[{id:501,name:'测试变流器',code:'PCS-01',category:'PCS',communication_status:'online'}]
  else if(p==='/work-orders') data=[{id:61,station_id:12,title:'已有维修工单',status:'processing',created_at:new Date().toISOString(),due_at:new Date(Date.now()+3600000).toISOString(),assigned_to:7}]
  else if(p==='/stations/12/inspections') data=inspections
  else if(p==='/inspections') {
   if(fail){await route.fulfill({status:500,json:{code:500,msg:'巡检创建失败，请重试'}});return}
   const b=req.postDataJSON();inspections.push({id:55,station_id:b.stationId,title:b.title,due_at:b.dueAt,assigned_to:b.assignedTo,status:'pending'});data={id:55}
  } else if(p==='/inspections/55/complete') {inspections[0].status='completed';data=null}
  await route.fulfill({json:{code:200,data}})
 })
 await page.goto(preview,{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation',{name:'一级导航'}).waitFor()
 return {context,page,user,writes,errors,setFail:v=>fail=v}
}
async function openOrders(page) {
 await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'工单与审批',exact:true}).click()
 await page.getByRole('button',{name:'巡检与检修',exact:true}).click()
}
test('maintenance tools and descendants are absent regardless of role name', {timeout:180000}, async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  for(const role of ['Super Admin','Platform Admin','Approval Manager','Support Agent','Enterprise Admin','Admin','Engineer','Installer','Viewer']) {
   const {context,page,errors}=await setup(browser,{role})
   await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click()
   await page.locator('.electric-management-tabs').getByRole('button',{name:'运维总览',exact:true}).click()
   await page.locator('.maintenance-tabs').waitFor()
   assert.equal(await page.getByRole('button',{name:'运维工具',exact:true}).count(),0,role)
   assert.equal(await page.locator('.maintenance-workbench,.maintenance-tool-nav').count(),0,role)
   assert.equal(await page.locator('.maintenance-tabs').getByRole('button',{name:'告警事件',exact:true}).count(),1)
   assert.deepEqual(errors,[]);await context.close()
  }
 } finally {await browser.close()}
})
test('inspection queue creates a persisted task and completes the same task without maintenance tools', {timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const {page,writes,errors}=await setup(browser)
  await openOrders(page)
  await page.getByRole('button',{name:'新建巡检',exact:true}).click()
  await page.getByLabel('巡检标题',{exact:true}).fill('入口合并巡检')
  await page.getByRole('button',{name:'创建巡检',exact:true}).click()
  await page.getByText('巡检 55 已由服务器创建',{exact:true}).waitFor()
  const row=page.locator('.work-orders-sub-table tr').filter({hasText:'入口合并巡检'})
  await row.getByRole('button',{name:'处理工单',exact:true}).click()
  for(const label of ['设备外观','通信状态','运行参数'])await page.getByLabel(label,{exact:true}).selectOption('正常')
  await page.getByLabel('巡检记录',{exact:true}).fill('现场检查完成')
  await page.getByRole('button',{name:'提交巡检',exact:true}).click()
  await page.getByRole('button',{name:'确认提交巡检',exact:true}).click()
  await page.getByText('巡检已由服务器确认完成',{exact:true}).waitFor()
  assert.deepEqual(writes.map(w=>w.path),['/inspections','/inspections/55/complete'])
  assert.equal(writes[0].body.stationId,12);assert.equal(writes[0].body.assignedTo,7)
  assert.match(writes[1].body.note,/现场检查完成/);assert.deepEqual(errors,[])
 } finally {await browser.close()}
})
test('inspection create failures retain input and station permission revocation removes create access', {timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const {page,user,writes,setFail}=await setup(browser)
  await openOrders(page);await page.getByRole('button',{name:'新建巡检',exact:true}).click()
  await page.getByLabel('巡检标题',{exact:true}).fill('失败后保留')
  setFail(true);await page.getByRole('button',{name:'创建巡检',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'巡检创建失败'}).waitFor()
  assert.equal(await page.getByLabel('巡检标题',{exact:true}).inputValue(),'失败后保留')
  user.stationPermissions['12']=user.permissions.filter(p=>p!=='inspection.manage')
  user.permissions=[...user.stationPermissions['12']]
  const refreshed=page.waitForResponse(r=>r.url().endsWith('/api/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refreshed
  await page.getByRole('dialog',{name:'新建巡检',exact:true}).waitFor({state:'detached'})
  assert.equal(await page.getByRole('button',{name:'新建巡检',exact:true}).count(),0)
  assert.deepEqual(writes.map(w=>w.path),['/inspections'])
 } finally {await browser.close()}
})
test('due inspection shortcut opens the central inspection queue and readonly users keep order access', {timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const {context,page}=await setup(browser)
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click()
  await page.locator('.electric-management-tabs').getByRole('button',{name:'运维总览',exact:true}).click()
  await page.getByTestId('maintenance-inspections').click()
  await page.getByRole('button',{name:'巡检与检修',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'巡检与检修',exact:true}).getAttribute('aria-pressed'),'true')
  await page.getByRole('button',{name:'新建巡检',exact:true}).waitFor()
  const dir=path.join(process.env.TEMP,'ems-maintenance-entry');await fs.mkdir(dir,{recursive:true})
  for(const width of [1440,1024]){
   await page.setViewportSize({width,height:900})
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   await page.screenshot({path:path.join(dir,`inspection-queue-${width}.png`),fullPage:true})
  }
  await context.close()
  const readonly=await setup(browser,{role:'Viewer',readonly:true})
  await readonly.page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'工单与审批',exact:true}).click()
  await readonly.page.locator('.work-orders-orders-panel tbody tr').filter({hasText:'已有维修工单'}).getByRole('button',{name:'查看详情',exact:true}).click()
  await readonly.page.locator('.wo-full-detail').waitFor()
  assert.match(await readonly.page.locator('.wo-full-detail').innerText(),/已有维修工单/)
  assert.equal(await readonly.page.getByRole('button',{name:'新建巡检',exact:true}).count(),0)
 } finally {await browser.close()}
})
