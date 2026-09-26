const {test}=require('node:test')
const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const fs=require('node:fs/promises')
const path=require('node:path')
const url=process.env.API_PREVIEW_URL||'http://127.0.0.1:8461'
const artifacts=path.resolve(__dirname,'../.figma/all-modules/05')
async function setup({withInspection=false}={}){
 const browser=await chromium.launch({channel:'msedge',headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Shanghai'})
 await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','workorders-test'))
 const page=await context.newPage();page.setDefaultTimeout(8000)
 const permissions=['asset.read','alarm.read','workorder.read','workorder.create','workorder.edit','workorder.handle','inspection.manage','approval.read','approval.review']
 const user={id:'7',name:'办理人',account:'work@test',role:'operator',organization:'测试',stationIds:['12','13'],permissions,stationPermissions:{'12':[...permissions],'13':[...permissions]},organizationPermissions:{}}
 const writes=[],errors=[],orders=[{id:61,station_id:12,title:'真实故障处理',description:'检查真实设备',status:'processing',created_at:new Date().toISOString(),due_at:new Date(Date.now()+3600000).toISOString(),assigned_to:7}]
 const approvals=[{id:22,station_id:12,title:'真实策略申请',status:'pending',submitted_at:new Date().toISOString(),submitter_id:8,plan_id:52,subject_type:'operating_plan'}]
 const inspections=withInspection?[{id:55,station_id:12,title:'真实专项巡检',status:'pending',due_at:new Date(Date.now()+3600000).toISOString(),assigned_to:7}]:[]
 let fail=false
 page.on('pageerror',e=>errors.push(e.message))
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort())
 await page.route(u=>u.pathname.startsWith('/api/'),async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.slice(4);let data=[]
  if(req.method()!=='GET')writes.push({path:p,body:req.postDataJSON()})
  if(p==='/auth/me')data=user
  else if(p==='/stations')data=[{id:12,name:'工单测试站',code:'W12',status:'online'},{id:13,name:'保留授权站',code:'W13',status:'online'}]
  else if(p.endsWith('/devices'))data=[{id:501,name:'真实 PCS',code:'PCS-A',category:'PCS',communication_status:'online'}]
  else if(p==='/work-orders')data=req.method()==='GET'?orders:{id:62}
  else if(p==='/approvals')data=approvals
  else if(p==='/stations/12/inspections')data=inspections
  else if(p==='/inspections/55/complete'){if(!fail)inspections[0].status='completed';data=null}
  else if(p==='/approvals/22/decision'){approvals[0].status=req.postDataJSON().decision;data=null}
  else if(p==='/work-orders/61/transition'){if(!fail)orders[0].status=req.postDataJSON().status;data=null}
  if(fail&&req.method()!=='GET'){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:500,msg:'工单服务暂时不可用'})});return}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data})})
 })
 await page.goto(url,{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'工单与审批',exact:true}).click()
 return {browser,page,user,writes,errors,setFail:v=>fail=v}
}
test('create dialog protects Escape and outer navigation and discards actual values',async()=>{
 const {browser,page,writes}=await setup()
 try{
  await page.getByRole('button',{name:'新建工单',exact:true}).click()
  await page.getByLabel('新建工单标题',{exact:true}).fill('未保存内容')
  await fs.mkdir(artifacts,{recursive:true})
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`create-${width}.png`)})}
  await page.keyboard.press('Escape')
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  assert.equal(await page.getByLabel('新建工单标题',{exact:true}).inputValue(),'未保存内容')
  await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.getByRole('button',{name:'新建工单',exact:true}).click()
  assert.equal(await page.getByLabel('新建工单标题',{exact:true}).inputValue(),'')
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})
test('acceptance is a scoped local draft and never completes the server work order',async()=>{
 const {browser,page,writes}=await setup()
 try{
  await page.getByRole('button',{name:'查看详情',exact:true}).first().click()
  await fs.mkdir(artifacts,{recursive:true})
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.locator('main').evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`detail-${width}.png`)})}
  await page.getByRole('button',{name:'处理工单',exact:true}).click()
  await page.getByLabel('处理结果',{exact:true}).fill('已检查，申请验收')
  await page.getByRole('button',{name:'提交验收',exact:true}).click()
  await page.getByRole('dialog',{name:'提交工单处理结果？'}).waitFor()
  await fs.mkdir(artifacts,{recursive:true})
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`acceptance-confirm-${width}.png`)})}
  const geometry=await page.locator('img[src="/figma/work-orders/warning.svg"]').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight}))
  assert.deepEqual(geometry,{width:24,height:24,naturalWidth:24,naturalHeight:24})
  const closeGeometry=await page.getByRole('dialog',{name:'提交工单处理结果？'}).locator('img[src="/figma/work-orders/close.svg"]').evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight}))
  assert.deepEqual(closeGeometry,{width:18,height:18,naturalWidth:18,naturalHeight:18})
  await fs.writeFile(path.join(artifacts,'asset-geometry.json'),JSON.stringify(geometry,null,2))
  await page.getByRole('button',{name:'保存验收草稿',exact:true}).click()
  await page.getByRole('status').filter({hasText:'验收草稿已保存'}).waitFor()
  assert.deepEqual(writes,[])
  const draft=await page.evaluate(()=>JSON.parse(localStorage.getItem('enerlution-workflow-v1:api:7:12:order:61')))
  assert.equal(draft.result,'已检查，申请验收')
  assert.equal(await page.getByText('已提交验收',{exact:true}).count(),0)
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  await page.getByRole('heading',{name:'全部任务',exact:true}).waitFor()
 }finally{await browser.close()}
})
test('module05 screenshot geometry at three widths and composed task workbenches',async()=>{
 const {browser,page,errors}=await setup()
 try{
  await fs.mkdir(artifacts,{recursive:true})
  await page.getByText('SLA 负载',{exact:true}).click()
  const sla=page.locator('.work-orders-sla')
  assert.equal(await sla.getByText('— · 服务器未提供工单等级',{exact:true}).count(),3)
  assert.equal(await sla.getByText('1/1',{exact:true}).count(),0)
  await page.setViewportSize({width:1440,height:900})
  await page.screenshot({path:path.join(artifacts,'sla-unknown-1440.png')})
  await page.getByText('SLA 负载',{exact:true}).click()
  for(const width of [1366,1440,1920]){
   await page.setViewportSize({width,height:900})
   await page.screenshot({path:path.join(artifacts,`queue-${width}.png`)})
   assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
  }
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  for(const name of ['全部任务','执行任务','异常待接管','任务编排','消息中心','协作与交接']){
   await page.getByRole('button',{name,exact:true}).click()
   await page.getByRole('heading',{name,exact:true}).waitFor()
   for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`${name}-${width}.png`)});assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1))}
  }
  assert.deepEqual(errors,[])
 }finally{await browser.close()}
})
test('approval notes protect outer navigation; supplement remains local and actual decision uses operating-plan API',async()=>{
 const {browser,page,writes}=await setup()
 try{
  await page.getByRole('button',{name:'审批中心',exact:true}).click()
  await page.getByRole('button',{name:'办理审批',exact:true}).first().click()
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.locator('main').evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`approval-${width}.png`)})}
  await page.getByLabel('审批意见',{exact:true}).fill('请补充策略依据')
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  await page.getByRole('button',{name:'要求补充',exact:true}).click()
  await page.getByRole('button',{name:'保存补充要求草稿',exact:true}).click()
  await page.getByRole('status').filter({hasText:'补充要求草稿已保存'}).waitFor()
  assert.deepEqual(writes,[])
  await page.getByRole('button',{name:'同意',exact:true}).click()
  await page.getByRole('dialog',{name:'批准这项申请？'}).waitFor()
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`approval-confirm-${width}.png`)})}
  await page.getByRole('button',{name:'确认批准',exact:true}).click()
  await page.getByText('审批已由服务器确认通过',{exact:true}).waitFor()
  assert.deepEqual(writes,[{path:'/approvals/22/decision',body:{decision:'approved',note:'请补充策略依据'}}])
 }finally{await browser.close()}
})
test('server create failure retains all fields and protects close',async()=>{
 const {browser,page,writes,setFail}=await setup()
 try{
  setFail(true)
  await page.getByRole('button',{name:'新建工单',exact:true}).click()
  await page.getByLabel('新建工单标题',{exact:true}).fill('服务器失败保留工单')
  await page.getByLabel('新建工单描述',{exact:true}).fill('保留所有输入')
  await page.getByRole('button',{name:'创建工单',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'工单服务暂时不可用'}).waitFor()
  assert.equal(await page.getByLabel('新建工单描述',{exact:true}).inputValue(),'保留所有输入')
  await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  setFail(false)
  await page.getByRole('button',{name:'创建工单',exact:true}).click()
  await page.getByText('工单 62 已由服务器创建',{exact:true}).waitFor()
  await page.getByText('来源、设备和等级已另存本地草稿，未提交服务器',{exact:true}).waitFor()
  assert.equal(writes.length,2)
  assert.equal(writes[1].body.stationId,12)
 }finally{await browser.close()}
})
test('inspection checklists submit supported result notes and preserve draft on failure',async()=>{
 const {browser,page,writes,setFail}=await setup({withInspection:true})
 try{
  await page.getByRole('button',{name:'我的待办',exact:true}).click()
  await page.getByRole('button',{name:'查看巡检 55',exact:true}).click()
  await page.getByRole('button',{name:'提交巡检',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'请填写巡检记录'}).waitFor()
  for(const label of ['设备外观','通信状态','运行参数'])await page.getByLabel(label,{exact:true}).selectOption('正常')
  await page.getByLabel('巡检记录',{exact:true}).fill('检查完成')
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.locator('main').evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`inspection-${width}.png`)})}
  setFail(true)
  await page.getByRole('button',{name:'提交巡检',exact:true}).click()
  await page.getByRole('button',{name:'确认提交巡检',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'巡检提交失败'}).waitFor()
  assert.equal(await page.getByLabel('巡检记录',{exact:true}).inputValue(),'检查完成')
  await page.getByRole('button',{name:'关闭',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  setFail(false)
  await page.getByRole('button',{name:'提交巡检',exact:true}).click()
  await page.getByRole('button',{name:'确认提交巡检',exact:true}).click()
  await page.getByText('巡检已由服务器确认完成',{exact:true}).waitFor()
  assert.deepEqual(writes.map(w=>w.path),['/inspections/55/complete','/inspections/55/complete'])
  assert.match(writes[1].body.note,/设备外观：正常；通信状态：正常；运行参数：正常。检查完成/)
 }finally{await browser.close()}
})
test('partial permission revocation cancels pending leave and removes inaccessible detail',async()=>{
 const {browser,page,writes,user}=await setup()
 try{
  await page.getByRole('button',{name:'查看详情',exact:true}).first().click()
  await page.getByRole('button',{name:'处理工单',exact:true}).click()
  await page.getByLabel('处理结果',{exact:true}).fill('权限变更前尚未保存')
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  user.stationIds=['13'];user.stationPermissions={'13':[...user.permissions]}
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor({state:'hidden'})
  await page.getByLabel('处理结果',{exact:true}).waitFor({state:'hidden'})
  assert.equal(await page.locator('main.work-orders-page').count(),1)
  await page.getByRole('button',{name:'新建工单',exact:true}).click()
  assert.equal(await page.getByLabel('新建工单站点',{exact:true}).inputValue(),'13')
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})
test('task orchestration validates and restores fields on discard with account and station draft isolation',async()=>{
 const {browser,page,writes}=await setup()
 try{
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  await page.getByRole('button',{name:'任务编排',exact:true}).click()
  await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'请填写'}).waitFor()
  await page.getByLabel('模板名称',{exact:true}).fill('新任务模板')
  await page.getByLabel('触发条件',{exact:true}).fill('每日上午检查')
  await page.getByLabel('异常分支与闭合条件',{exact:true}).fill('失败转人工复核后关闭')
  await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('enerlution-workflow-v1:'))throw Error('full');return window.originalSetItem.call(this,k,v)}})
  await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'保存失败'}).waitFor()
  assert.equal(await page.getByLabel('模板名称',{exact:true}).inputValue(),'新任务模板')
  await page.evaluate(()=>Storage.prototype.setItem=window.originalSetItem)
  await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click()
  await page.getByRole('status').filter({hasText:'本地草稿已保存'}).waitFor()
  await page.getByLabel('模板名称',{exact:true}).fill('放弃的模板修改')
  await page.getByRole('button',{name:'消息中心',exact:true}).click()
  await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.getByRole('heading',{name:'消息中心',exact:true}).waitFor()
  await page.getByRole('button',{name:'任务编排',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('input[aria-label="模板名称"]')?.value==='新任务模板')
  assert.equal(await page.getByLabel('模板名称',{exact:true}).inputValue(),'新任务模板')
  await page.getByLabel('业务站点',{exact:true}).selectOption('13')
  await page.waitForFunction(()=>document.querySelector('input[aria-label="模板名称"]')?.value==='')
  assert.equal(await page.getByLabel('模板名称',{exact:true}).inputValue(),'')
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})
