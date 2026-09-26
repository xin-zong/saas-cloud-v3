const {test}=require('node:test')
const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const fs=require('node:fs/promises')
const path=require('node:path')
const url=process.env.API_PREVIEW_URL||'http://127.0.0.1:8461'
const artifacts=path.resolve(__dirname,'../.figma/all-modules/05')
async function setup({withInspection=false,withUnauthorized=false}={}){
 const browser=await chromium.launch({channel:'msedge',headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Shanghai'})
 await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','workorders-test'))
 const page=await context.newPage();page.setDefaultTimeout(8000)
 const permissions=['asset.read','alarm.read','workorder.read','workorder.create','workorder.edit','workorder.handle','inspection.manage','approval.read','approval.review']
 const user={id:'7',name:'办理人',account:'work@test',role:'operator',organization:'测试',stationIds:['12','13'],permissions,stationPermissions:{'12':[...permissions],'13':[...permissions]},organizationPermissions:{}}
 const writes=[],errors=[],orders=[{id:61,station_id:12,title:'真实故障处理',description:'检查真实设备',status:'processing',created_at:new Date().toISOString(),due_at:new Date(Date.now()+3600000).toISOString(),assigned_to:7}]
 const approvals=[{id:22,station_id:12,title:'真实策略申请',status:'pending',submitted_at:new Date().toISOString(),submitter_id:8,plan_id:52,subject_type:'operating_plan'}]
 if(withUnauthorized){
  orders.push({...orders[0],id:99,station_id:99,title:'无权限工单'})
  approvals.push({...approvals[0],id:99,station_id:99,title:'无权限审批'})
 }
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
  else if(p==='/approvals/22/decision'){if(!fail)approvals[0].status=req.postDataJSON().decision;data=null}
  else if(p==='/work-orders/61/transition'){if(!fail)orders[0].status=req.postDataJSON().status;data=null}
  if(fail&&req.method()!=='GET'){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:500,msg:'工单服务暂时不可用'})});return}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data})})
 })
 try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000})
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'工单与审批',exact:true}).click()
 }catch(error){await browser.close();throw error}
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
  await page.getByLabel('补充要求',{exact:true}).fill('本地补充材料要求')
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
test('task orchestration validates and restores fields on discard with station draft isolation',async()=>{
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

// Independent review regressions.
test('review I1 supplement reopens separately and discard restores saved baseline',async()=>{
 const {browser,page,writes}=await setup()
 const open=async()=>{await page.getByRole('button',{name:'审批中心',exact:true}).click();await page.getByRole('button',{name:'办理审批',exact:true}).first().click()}
 try{
  await open()
  await page.getByRole('button',{name:'要求补充',exact:true}).click()
  await page.getByLabel('补充要求',{exact:true}).fill('已保存的本地补充要求')
  await page.getByRole('button',{name:'保存补充要求草稿',exact:true}).click()
  await page.getByRole('button',{name:'工单中心',exact:true}).click();await open()
  assert.equal(await page.getByLabel('本地补充要求草稿',{exact:true}).inputValue(),'已保存的本地补充要求')
  assert.equal(await page.getByLabel('审批意见',{exact:true}).inputValue(),'')
  for(const width of [1366,1440,1920]){
   await page.setViewportSize({width,height:900})
   await page.getByLabel('本地补充要求草稿',{exact:true}).scrollIntoViewIfNeeded()
   await page.screenshot({path:path.join(artifacts,`supplement-restored-${width}.png`)})
  }
  await page.getByLabel('本地补充要求草稿',{exact:true}).fill('应放弃的补充编辑')
  await page.getByRole('button',{name:'工单中心',exact:true}).click()
  await page.getByRole('button',{name:'放弃修改',exact:true}).click();await open()
  assert.equal(await page.getByLabel('本地补充要求草稿',{exact:true}).inputValue(),'已保存的本地补充要求')
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})
for(const prior of ['', '此前保存的巡检基线'])test(`review I2 failed inspection discard restores persisted baseline ${prior||'empty'}`,async()=>{
 const {browser,page,setFail}=await setup({withInspection:true})
 try{
  const key='enerlution-workflow-v1:api:7:12:inspection:55'
  if(prior)await page.evaluate(({key,prior})=>localStorage.setItem(key,JSON.stringify({result:prior,appearance:'正常',communication:'正常',parameters:'正常',files:[]})),{key,prior})
  await page.getByRole('button',{name:'我的待办',exact:true}).click()
  await page.getByRole('button',{name:'查看巡检 55',exact:true}).click()
  for(const label of ['设备外观','通信状态','运行参数'])await page.getByLabel(label,{exact:true}).selectOption('正常')
  await page.getByLabel('巡检记录',{exact:true}).fill('丢弃的失败输入');setFail(true)
  await page.getByRole('button',{name:'提交巡检',exact:true}).click()
  await page.getByRole('button',{name:'确认提交巡检',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'巡检提交失败'}).waitFor()
  assert.equal(await page.getByLabel('巡检记录',{exact:true}).inputValue(),'丢弃的失败输入')
  await page.getByRole('button',{name:'关闭',exact:true}).click()
  await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.getByRole('button',{name:'查看巡检 55',exact:true}).click()
  assert.equal(await page.getByLabel('巡检记录',{exact:true}).inputValue(),prior)
  const stored=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key)
  assert.equal(stored?.result||'',prior)
 }finally{await browser.close()}
})
test('review I3 objects and phase evidence are recoverable with guarded selection and actual account switch',async()=>{
 const {browser,page,user}=await setup()
 const save=async()=>{await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click();await page.getByRole('status').filter({hasText:'本地草稿已保存'}).waitFor()}
 try{
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  await page.getByRole('button',{name:'执行任务',exact:true}).click()
  await page.getByLabel('任务对象',{exact:true}).fill('任务 A')
  await page.getByLabel('当前步骤证据',{exact:true}).fill('A 准备证据')
  await page.getByRole('button',{name:'执行',exact:true}).click()
  assert.equal(await page.getByLabel('当前步骤证据',{exact:true}).inputValue(),'')
  await page.getByLabel('当前步骤证据',{exact:true}).fill('A 执行证据');await save()
  for(const width of [1366,1440,1920]){
   await page.setViewportSize({width,height:900})
   await page.locator('main').evaluate(element=>element.scrollTo(0,0))
   await page.screenshot({path:path.join(artifacts,`execution-object-phase-${width}.png`)})
  }
  const idA=await page.getByLabel('草稿对象',{exact:true}).inputValue()
  await page.getByRole('button',{name:'新建本地草稿',exact:true}).click()
  await page.getByLabel('任务对象',{exact:true}).fill('任务 B')
  await page.getByLabel('当前步骤证据',{exact:true}).fill('B 准备证据');await save()
  const idB=await page.getByLabel('草稿对象',{exact:true}).inputValue();assert.notEqual(idA,idB)
  await page.getByLabel('当前步骤证据',{exact:true}).fill('应放弃的 B 编辑')
  await page.getByLabel('草稿对象',{exact:true}).selectOption(idA)
  await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="当前步骤证据"]')?.value==='A 执行证据')
  await page.getByRole('button',{name:'准备',exact:true}).click()
  assert.equal(await page.getByLabel('当前步骤证据',{exact:true}).inputValue(),'A 准备证据');await save()
  await page.getByLabel('草稿对象',{exact:true}).selectOption(idB)
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="当前步骤证据"]')?.value==='B 准备证据')
  user.id='9';user.name='第二账号';await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.getByRole('button',{name:'第二账号，账户菜单',exact:true}).waitFor()
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'工单与审批',exact:true}).click()
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  await page.getByRole('button',{name:'执行任务',exact:true}).click()
  assert.equal(await page.getByLabel('任务对象',{exact:true}).inputValue(),'')
  assert.equal(await page.getByLabel('草稿对象',{exact:true}).locator('option').filter({hasText:'任务 A'}).count(),0)
  user.id='7';user.name='办理人';await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.getByRole('button',{name:'办理人，账户菜单',exact:true}).waitFor()
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'工单与审批',exact:true}).click()
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  await page.getByRole('button',{name:'执行任务',exact:true}).click()
  await page.getByLabel('草稿对象',{exact:true}).locator('option').filter({hasText:'任务 A'}).waitFor({state:'attached'})
  await page.getByLabel('草稿对象',{exact:true}).selectOption(idA)
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="当前步骤证据"]')?.value==='A 准备证据')
 }finally{await browser.close()}
})
test('review I3 two orchestration templates retain stable independent identities',async()=>{
 const {browser,page}=await setup()
 try{
  await page.getByRole('button',{name:'任务协作',exact:true}).click();await page.getByRole('button',{name:'任务编排',exact:true}).click()
  for(const name of ['模板 A','模板 B']){
   if(name==='模板 B')await page.getByRole('button',{name:'新建本地草稿',exact:true}).click()
   await page.getByLabel('模板名称',{exact:true}).fill(name)
   await page.getByLabel('触发条件',{exact:true}).fill(name+'触发')
   await page.getByLabel('异常分支与闭合条件',{exact:true}).fill(name+'闭合')
   await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click()
   await page.getByRole('status').filter({hasText:'本地草稿已保存'}).waitFor()
  }
  await page.getByLabel('草稿对象',{exact:true}).selectOption({label:'模板 A'})
  await page.waitForFunction(()=>document.querySelector('input[aria-label="触发条件"]')?.value==='模板 A触发')
  assert.equal(await page.getByLabel('异常分支与闭合条件',{exact:true}).inputValue(),'模板 A闭合')
 }finally{await browser.close()}
})
test('review I4 unassigned undated approval is not overdue',async()=>{
 const {browser,page}=await setup()
 try{
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  const metric=label=>page.locator('.wo-workbench aside dl').filter({has:page.getByText(label,{exact:true})}).locator('dd')
  assert.equal(await metric('无人负责').innerText(),'1');assert.equal(await metric('已超时').innerText(),'0')
 }finally{await browser.close()}
})
test('review I5 filtered export retains only authorized results and unknown fields',async()=>{
 const {browser,page}=await setup({withUnauthorized:true})
 try{
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  await page.getByLabel('任务业务域',{exact:true}).selectOption('审批')
  await page.getByLabel('任务阶段',{exact:true}).selectOption('待审批')
  await page.getByLabel('任务责任人',{exact:true}).selectOption('__unassigned')
  await page.getByLabel('任务期限',{exact:true}).selectOption('unknown')
  assert.equal(await page.locator('.wo-task-table tbody tr').count(),1)
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'导出筛选结果',exact:true}).click()
  const csv=await fs.readFile(await (await pending).path(),'utf8')
  assert.match(csv,/22/);assert.match(csv,/真实策略申请/);assert.doesNotMatch(csv,/真实故障处理/)
  assert.doesNotMatch(csv,/无权限/)
  assert.match(csv,/"22","真实策略申请","审批","待审批","","","工单测试站"/)
  await page.getByLabel('任务期限',{exact:true}).selectOption('overdue')
  assert.equal(await page.locator('.wo-task-table tbody tr').count(),0)
 }finally{await browser.close()}
})

test('review I3 legacy API draft recovery excludes demo namespace and exception drafts stay separate',async()=>{
 const {browser,page}=await setup()
 try{
  await page.evaluate(()=>{
   localStorage.setItem('enerlution-workflow-v1:api:7:12:tasks:执行任务',JSON.stringify({draft:{object:'旧版任务',stage:'执行',evidence:'旧版执行证据'}}))
   localStorage.setItem('enerlution-workflow-v1:demo:7:12:tasks:执行任务:default',JSON.stringify({draft:{object:'不应显示的 DEMO 任务',stage:'执行',phaseEvidence:{执行:'DEMO 证据'}}}))
  })
  await page.getByRole('button',{name:'任务协作',exact:true}).click()
  await page.getByRole('button',{name:'执行任务',exact:true}).click()
  assert.equal(await page.getByLabel('任务对象',{exact:true}).inputValue(),'旧版任务')
  assert.equal(await page.getByLabel('当前步骤证据',{exact:true}).inputValue(),'旧版执行证据')
  assert.equal(await page.getByLabel('草稿对象',{exact:true}).locator('option').filter({hasText:'DEMO'}).count(),0)
  await page.getByRole('button',{name:'异常待接管',exact:true}).click()
  for(const name of ['异常 A','异常 B']){
   if(name==='异常 B')await page.getByRole('button',{name:'新建本地草稿',exact:true}).click()
   await page.getByLabel('异常任务编号',{exact:true}).fill(name)
   await page.getByLabel('接管责任人',{exact:true}).fill(name+'负责人')
   await page.getByLabel('异常原因及复核意见',{exact:true}).fill(name+'原因')
   await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click()
   await page.getByRole('status').filter({hasText:'本地草稿已保存'}).waitFor()
  }
  await page.getByLabel('草稿对象',{exact:true}).selectOption({label:'异常 A'})
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="异常原因及复核意见"]')?.value==='异常 A原因')
  assert.equal(await page.getByLabel('异常任务编号',{exact:true}).isDisabled(),true)
 }finally{await browser.close()}
})

async function openApprovalWithSupplementBaseline(page){
 await page.evaluate(()=>localStorage.setItem('enerlution-workflow-v1:api:7:12:supplement:22',JSON.stringify({note:'此前已保存的补充基线'})))
 await page.getByRole('button',{name:'审批中心',exact:true}).click()
 await page.getByRole('button',{name:'办理审批',exact:true}).first().click()
 await page.getByLabel('本地补充要求草稿',{exact:true}).fill('应保留的未保存补充编辑')
 await page.getByLabel('审批意见',{exact:true}).fill('独立服务器审批意见')
}
test('review R1 failed decision retains unsaved supplement and server note over saved local baseline',async()=>{
 const {browser,page,writes,setFail}=await setup()
 try{
  await openApprovalWithSupplementBaseline(page);setFail(true)
  await page.getByRole('button',{name:'同意',exact:true}).click()
  await page.getByRole('button',{name:'确认批准',exact:true}).click()
  await page.getByRole('status').filter({hasText:'工单服务暂时不可用'}).waitFor()
  assert.equal(await page.getByLabel('本地补充要求草稿',{exact:true}).inputValue(),'应保留的未保存补充编辑')
  assert.equal(await page.getByLabel('审批意见',{exact:true}).inputValue(),'独立服务器审批意见')
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('enerlution-workflow-v1:api:7:12:supplement:22')).note),'此前已保存的补充基线')
  await page.getByRole('button',{name:'工单中心',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  assert.equal(await page.getByLabel('本地补充要求草稿',{exact:true}).inputValue(),'应保留的未保存补充编辑')
  assert.deepEqual(writes,[{path:'/approvals/22/decision',body:{decision:'approved',note:'独立服务器审批意见'}}])
 }finally{await browser.close()}
})
test('review R1 successful decision retains unrelated dirty supplement with explicit local save afterwards',async()=>{
 const {browser,page,writes}=await setup()
 try{
  await openApprovalWithSupplementBaseline(page)
  await page.getByRole('button',{name:'同意',exact:true}).click()
  await page.getByRole('button',{name:'确认批准',exact:true}).click()
  await page.getByText('审批已由服务器确认通过',{exact:true}).waitFor()
  assert.equal(await page.getByLabel('本地补充要求草稿',{exact:true}).inputValue(),'应保留的未保存补充编辑')
  await page.getByRole('button',{name:'工单中心',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  await page.getByRole('button',{name:'保存本地补充草稿',exact:true}).click()
  await page.getByRole('button',{name:'保存补充要求草稿',exact:true}).click()
  await page.getByRole('status').filter({hasText:'补充要求草稿已保存'}).waitFor()
  await page.getByRole('button',{name:'工单中心',exact:true}).click()
  await page.getByRole('button',{name:'审批中心',exact:true}).click()
  await page.getByRole('button',{name:'查看详情',exact:true}).first().click()
  assert.equal(await page.getByLabel('本地补充要求草稿',{exact:true}).inputValue(),'应保留的未保存补充编辑')
  assert.equal(writes.length,1)
 }finally{await browser.close()}
})
test('review R1 actual approval permission revocation cancels pending leave and clears unsaved editor',async()=>{
 const {browser,page,user,writes}=await setup()
 try{
  await openApprovalWithSupplementBaseline(page)
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  user.stationPermissions['12']=user.stationPermissions['12'].filter(permission=>permission!=='approval.review')
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor({state:'hidden'})
  await page.getByLabel('本地补充要求草稿',{exact:true}).waitFor({state:'hidden'})
  assert.equal(await page.locator('main.work-orders-page').count(),1)
  user.stationPermissions['12']=[...user.permissions]
  const restored=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/me')
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await restored
  await page.getByRole('button',{name:'办理审批',exact:true}).first().click()
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="本地补充要求草稿"]')?.value==='此前已保存的补充基线')
  assert.equal(await page.getByLabel('本地补充要求草稿',{exact:true}).inputValue(),'此前已保存的补充基线')
  assert.equal(await page.getByLabel('审批意见',{exact:true}).inputValue(),'')
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})
