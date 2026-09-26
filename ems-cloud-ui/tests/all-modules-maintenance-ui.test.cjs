const {test}=require('node:test')
const assert=require('node:assert/strict')
const {chromium}=require('playwright')
const fs=require('node:fs/promises')
const path=require('node:path')
const url=process.env.API_PREVIEW_URL||'http://127.0.0.1:8461'
const artifacts=path.resolve(__dirname,'../.figma/all-modules/04')
async function setup({withAlarms=false,historicalInspection=false}={}){
 const browser=await chromium.launch({channel:'msedge',headless:true})
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Shanghai'})
 await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','maintenance-test'))
 const page=await context.newPage();page.setDefaultTimeout(10000)
 const permissions=['asset.read','alarm.read','alarm.handle','workorder.read','workorder.create','inspection.manage']
 const user={id:'7',name:'巡检人',account:'maint@test',role:'operator',organization:'测试',stationIds:['12','13'],permissions,stationPermissions:{'12':[...permissions],'13':[...permissions]},organizationPermissions:{}}
 const writes=[],errors=[],inspections=historicalInspection?[{id:55,title:'历史已完成巡检',due_at:'2020-01-01 12:00:00',assigned_to:7,status:'completed',completed_at:'2020-01-01 13:00:00'}]:[]
 let failCreate=false,failNotes=false,acknowledged=false
 page.on('pageerror',e=>errors.push(e.message))
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort())
 await page.route(u=>u.pathname.startsWith('/api/'),async route=>{
  const req=route.request(),p=new URL(req.url()).pathname.slice(4);let data=[]
  if(req.method()!=='GET')writes.push({path:p,body:req.postDataJSON()})
  if(p==='/auth/me')data=user
  else if(p==='/stations')data=[{id:12,name:'运维测试站',code:'M12',status:'online'},{id:13,name:'保留授权站',code:'M13',status:'online'}]
  else if(p.endsWith('/devices'))data=[{id:501,name:'真实 PCS A',code:'PCS-A',category:'PCS',communication_status:'online',model_name:'EPC-100'},{id:502,name:'真实电池 B',code:'BAT-B',category:'电池',communication_status:'offline'}]
  else if(p.endsWith('/inspections'))data=inspections
  else if(p.endsWith('/alarms')&&withAlarms)data=[{id:88,title:'直流母线过压',device_name:'真实 PCS A',severity:'critical',occurred_at:new Date().toISOString(),acknowledged_at:acknowledged?new Date().toISOString():null}]
  else if(p==='/alarms/88/acknowledge'){acknowledged=true;data=null}
  if(p==='/alarms/88/notes'&&req.method()==='POST'&&failNotes){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:500,msg:'备注服务暂时不可用'})});return}
  if(p==='/inspections'&&req.method()==='POST'){
   if(failCreate){await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:500,msg:'巡检服务暂时不可用'})});return}
   const b=req.postDataJSON();inspections.push({id:55,title:b.title,due_at:b.dueAt,assigned_to:b.assignedTo,status:'pending'});data={id:55}
  }
  await route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data})})
 })
 await page.goto(url,{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'运维中心',exact:true}).click()
 return {browser,page,user,writes,errors,setFail:v=>failCreate=v,setFailNotes:v=>failNotes=v}
}
async function tools(page,name){await page.getByRole('button',{name:'运维工具',exact:true}).click();await page.getByRole('button',{name,exact:true}).click()}

test('maintenance retains every composed workbench and unknown analytical data at three widths',async()=>{
 const {browser,page,writes,errors}=await setup()
 try{
  await fs.mkdir(artifacts,{recursive:true})
  for(const width of [1366,1440,1920]){
   await page.setViewportSize({width,height:900})
   for(const tab of ['运维总览','告警事件','设备健康','固件升级']){
    await page.getByRole('navigation',{name:'运维中心二级导航'}).getByRole('button',{name:tab,exact:true}).click()
    if(tab==='运维总览')await page.getByText('今日到期巡检',{exact:true}).waitFor()
    await page.locator('main').evaluate(el=>el.scrollTo(0,0))
    assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
    await page.screenshot({path:path.join(artifacts,`${tab}-${width}.png`)})
   }
  }
  await tools(page,'巡检管理')
  await page.getByRole('columnheader',{name:'检查项进度',exact:true}).waitFor()
  for(const width of [1366,1440,1920]){
   await page.setViewportSize({width,height:900})
   for(const [name,heading] of [['巡检管理','本月巡检完成率'],['备件管理','快速出入库申请'],['维修工单','平均响应时间'],['远程诊断','诊断记录'],['维护计划','未来 7 天待执行任务'],['健康分析','场站设备类型健康热力分布']]){
    await page.getByRole('button',{name,exact:true}).click();await page.getByText(heading,{exact:true}).waitFor()
    await page.locator('main').evaluate(el=>el.scrollTo(0,0))
    assert.ok(await page.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1))
    await page.screenshot({path:path.join(artifacts,`${name}-${width}.png`)})
   }
  }
  assert.match(await page.locator('.maintenance-workbench').innerText(),/评分.*未接通/)
  await page.getByRole('button',{name:'远程诊断',exact:true}).click()
  const asset=page.locator('img[src="/figma/maintenance/search.svg"]')
  await asset.evaluate(el=>el.decode())
  const geometry=await asset.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight}))
  assert.equal(geometry.width,geometry.naturalWidth);assert.equal(geometry.height,geometry.naturalHeight)
  await fs.writeFile(path.join(artifacts,'asset-geometry.json'),JSON.stringify(geometry,null,2))
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[])
 }finally{await browser.close()}
})

test('spare request validates, protects outer navigation, isolates drafts and reports storage failure',async()=>{
 const {browser,page,writes,user}=await setup()
 try{
  await tools(page,'备件管理')
  await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'请填写'}).waitFor()
  await page.getByLabel('备件名称 / 规格',{exact:true}).fill('BMS 板卡 / V3')
  await page.getByLabel('申请数量',{exact:true}).fill('2')
  await page.getByLabel('经办备注',{exact:true}).fill('现场更换申请')
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  await page.evaluate(()=>{window.oldSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('enerlution-maintenance-drafts'))throw Error('full');return window.oldSet.call(this,k,v)}})
  await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'保存失败'}).waitFor()
  await page.evaluate(()=>Storage.prototype.setItem=window.oldSet)
  await page.getByRole('button',{name:'检查并保存本地草稿',exact:true}).click()
  await page.getByRole('status').filter({hasText:'本地草稿已保存'}).waitFor()
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('enerlution-maintenance-drafts-v1:api:7:12:spares')))
  assert.equal(saved[0].quantity,'2');assert.equal(saved[0].part,'BMS 板卡 / V3')
  assert.equal(saved[0].mode,undefined,'inventory drafts must not include unrelated diagnostic controls')
  await page.getByLabel('工具站点',{exact:true}).selectOption('13')
  assert.equal(await page.getByText('现场更换申请',{exact:true}).count(),0)
  await page.getByLabel('工具站点',{exact:true}).selectOption('12')
  await page.getByLabel('经办备注',{exact:true}).fill('尚未保存')
  user.stationPermissions['12']=[]
  await page.evaluate(async()=>{const {refreshAfterForbidden}=await import('/src/api/client.ts');await refreshAfterForbidden()})
  await page.getByText('当前站点权限已撤销，请重新选择授权站点。',{exact:true}).waitFor()
  assert.equal(await page.getByRole('dialog').count(),0)
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})

test('inspection uses real create API and keeps form on server error',async()=>{
 const {browser,page,writes,setFail}=await setup()
 try{
  await tools(page,'巡检管理');await page.getByRole('button',{name:'创建巡检任务',exact:true}).click()
  await page.getByLabel('巡检标题',{exact:true}).fill('检查消防回路')
  await page.getByLabel('计划时间',{exact:true}).fill('2099-10-01T12:00')
  setFail(true);await page.getByRole('button',{name:'创建服务器巡检',exact:true}).click()
  await page.getByRole('dialog',{name:'创建巡检任务'}).getByRole('alert').filter({hasText:'巡检服务暂时不可用'}).waitFor()
  assert.equal(await page.getByLabel('巡检标题',{exact:true}).inputValue(),'检查消防回路')
  setFail(false);await page.getByRole('button',{name:'创建服务器巡检',exact:true}).click()
  await page.getByRole('status').filter({hasText:'服务器已创建巡检'}).waitFor()
  assert.deepEqual(writes.at(-1),{path:'/inspections',body:{stationId:12,title:'检查消防回路',dueAt:'2099-10-01 12:00:00',assignedTo:7}})
 }finally{await browser.close()}
})

test('firmware reads registered devices and validates a real local file without simulating execution',async()=>{
 const {browser,page,writes}=await setup()
 try{
  await page.getByRole('button',{name:'固件升级',exact:true}).click()
  await page.getByRole('row').filter({hasText:'真实 PCS A'}).getByRole('radio').check()
  await page.getByLabel('选择固件文件',{exact:true}).setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('invalid')})
  await page.getByRole('alert').filter({hasText:'.bin'}).waitFor()
  await page.getByLabel('选择固件文件',{exact:true}).setInputFiles({name:'pcs.bin',mimeType:'application/octet-stream',buffer:Buffer.from('firmware bytes')})
  await page.getByLabel('目标版本',{exact:true}).fill('v2.0')
  await page.getByLabel('升级说明',{exact:true}).fill('验证升级方案')
  await page.getByRole('button',{name:'保存升级草稿',exact:true}).click()
  await page.getByRole('status').filter({hasText:'未上传固件、未下发升级'}).waitFor()
  assert.equal(await page.getByRole('button',{name:'开始升级',exact:true}).isEnabled(),false)
  assert.match(await page.locator('.maintenance-upgrade-progress').innerText(),/—/)
  await page.getByRole('button',{name:'设备健康',exact:true}).click()
  const row=page.getByRole('row').filter({hasText:'PCS-A'}).filter({hasText:'运维测试站'});await row.getByRole('button',{name:'查看详情',exact:true}).click()
  await page.getByRole('heading',{name:'PCS-A · 真实 PCS A',exact:true}).waitFor()
  assert.equal(await page.getByText('96.8%',{exact:true}).count(),0)
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`PCS-detail-${width}.png`)})}
  await page.getByRole('button',{name:'返回设备列表',exact:true}).click()
  await page.getByRole('row').filter({hasText:'BAT-B'}).filter({hasText:'运维测试站'}).getByRole('button',{name:'查看详情',exact:true}).click()
  await page.getByRole('heading',{name:'BAT-B · 真实电池 B',exact:true}).waitFor()
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`BAT-detail-${width}.png`)})}
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})

test('inspection edit is explicitly a local amendment and never creates a duplicate server task',async()=>{
 const {browser,page,writes}=await setup()
 try{
  await tools(page,'巡检管理');await page.getByRole('button',{name:'创建巡检任务',exact:true}).click()
  await page.getByLabel('巡检标题',{exact:true}).fill('已有巡检')
  await page.getByLabel('计划时间',{exact:true}).fill('2099-10-01T12:00')
  await page.getByRole('button',{name:'创建服务器巡检',exact:true}).click()
  await page.getByRole('row').filter({hasText:'55'}).getByRole('button',{name:'编辑',exact:true}).click()
  await page.getByRole('dialog',{name:'编辑巡检本地补充'}).waitFor()
  assert.equal(await page.getByRole('button',{name:'创建服务器巡检',exact:true}).count(),0)
  await page.getByLabel('巡检类型',{exact:true}).selectOption('专项巡检')
  await page.getByLabel('检查项清单',{exact:true}).fill('消防联锁\n温控状态')
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`inspection-form-${width}.png`)})}
  await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
  await page.getByRole('dialog',{name:'编辑巡检本地补充'}).getByRole('status').waitFor()
  assert.equal(writes.length,1)
 }finally{await browser.close()}
})

test('remote diagnostics validates bounds and maintenance calendar preserves an isolated local plan',async()=>{
 const {browser,page,writes}=await setup()
 try{
  await tools(page,'远程诊断');await page.getByRole('button',{name:'真实 PCS A PCS-A',exact:true}).click()
  await page.getByRole('button',{name:'配置参数',exact:true}).click()
  await page.getByLabel('SOC 下限 %',{exact:true}).fill('90');await page.getByLabel('SOC 上限 %',{exact:true}).fill('20')
  await page.getByLabel('诊断说明',{exact:true}).fill('检查温度上报')
  await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
  await page.getByRole('dialog',{name:'远程诊断配置'}).getByRole('alert').filter({hasText:'SOC上下限'}).waitFor()
  await page.getByLabel('SOC 下限 %',{exact:true}).fill('20');await page.getByLabel('SOC 上限 %',{exact:true}).fill('90')
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`diagnostics-form-${width}.png`)})}
  await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
  await page.getByRole('dialog',{name:'远程诊断配置'}).getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('button',{name:'维护计划',exact:true}).click();await page.getByRole('button',{name:'创建维护计划',exact:true}).click()
  await page.getByLabel('计划标题',{exact:true}).fill('电池预防维护')
  await page.getByLabel('设备 / 系统',{exact:true}).selectOption('502')
  await page.getByLabel('计划时间',{exact:true}).fill('2099-10-01T12:00')
  await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
  await page.getByRole('dialog',{name:'创建维护计划'}).getByRole('button',{name:'取消',exact:true}).click()
  await page.getByLabel('维护月份',{exact:true}).fill('2099-10')
  await page.getByRole('button',{name:'电池预防维护 · 本地',exact:true}).click()
  await page.getByRole('dialog',{name:'运维记录详情'}).waitFor()
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})

test('alarm workbench retains real acknowledgment and notes with honest diagnosis evidence',async()=>{
 const {browser,page,writes}=await setup({withAlarms:true})
 try{
  await page.getByRole('button',{name:'告警事件',exact:true}).click()
  await page.getByRole('heading',{name:'智能 AI 根因诊断',exact:true}).waitFor()
  await page.getByRole('button',{name:'确认告警',exact:true}).click()
  await page.getByRole('button',{name:'已确认',exact:true}).waitFor()
  assert.equal(await page.locator('.maintenance-status-flow span').filter({hasText:'处理中'}).getAttribute('data-active'),'false')
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.locator('main').evaluate(el=>el.scrollTo(0,0));await page.screenshot({path:path.join(artifacts,`alarm-populated-${width}.png`)})}
  await page.getByRole('button',{name:'更多操作',exact:true}).click()
  await page.getByLabel('运维跟进备注',{exact:true}).fill('现场检查直流采样')
  await page.getByRole('button',{name:'保存备注',exact:true}).click()
  await page.getByText('跟进备注已保存至服务器',{exact:true}).waitFor()
  assert.deepEqual(writes.map(w=>w.path),['/alarms/88/acknowledge','/alarms/88/notes'])
 }finally{await browser.close()}
})


test('review discard resets all shared forms and new inspection does not inherit an edit',async()=>{
 const {browser,page}=await setup({historicalInspection:true})
 try{
  await tools(page,'维护计划')
  for(const [tool,open,label] of [['维护计划','创建维护计划','计划标题'],['巡检管理','创建巡检任务','巡检标题'],['维修工单','工单扩展草稿','工单标题'],['远程诊断','配置参数','诊断说明']]){
   await page.getByRole('button',{name:tool,exact:true}).click()
   if(tool==='远程诊断')await page.getByRole('button',{name:'真实 PCS A PCS-A',exact:true}).click()
   await page.getByRole('button',{name:open,exact:true}).click()
   await page.getByLabel(label,{exact:true}).fill('DISCARD-REVIEW')
   await page.getByRole('button',{name:'取消',exact:true}).click()
   await page.getByRole('button',{name:'放弃修改',exact:true}).click()
   await page.getByRole('button',{name:open,exact:true}).click()
   assert.equal(await page.getByLabel(label,{exact:true}).inputValue(),'',tool)
   await page.getByRole('button',{name:'取消',exact:true}).click()
  }
  await page.getByRole('button',{name:'巡检管理',exact:true}).click()
  await page.getByRole('row').filter({hasText:'55'}).getByRole('button',{name:'编辑',exact:true}).click()
  await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('button',{name:'创建巡检任务',exact:true}).click()
  assert.equal(await page.getByLabel('巡检标题',{exact:true}).inputValue(),'')
  assert.equal(await page.getByLabel('计划时间',{exact:true}).inputValue(),'')
 }finally{await browser.close()}
})

test('review completed inspection supplement preserves historical due date without creating a schedule',async()=>{
 const {browser,page,writes}=await setup({historicalInspection:true})
 try{
  await tools(page,'巡检管理')
  await page.getByRole('row').filter({hasText:'55'}).getByRole('button',{name:'编辑',exact:true}).click()
  await page.getByLabel('检查项清单',{exact:true}).fill('补录消防联锁检查')
  await page.getByRole('button',{name:'保存本地草稿',exact:true}).click()
  await page.getByRole('dialog',{name:'编辑巡检本地补充'}).getByRole('status').waitFor()
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('enerlution-maintenance-drafts-v1:api:7:12:inspection')))
  assert.equal(saved[0].due,'2020-01-01T12:00');assert.equal(saved[0].inspectionId,'55')
  await page.getByLabel('检查项清单',{exact:true}).fill('discard after saved baseline')
  await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.getByRole('row').filter({hasText:'55'}).getByRole('button',{name:'编辑',exact:true}).click()
  assert.equal(await page.getByLabel('检查项清单',{exact:true}).inputValue(),'补录消防联锁检查')
  await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('button',{name:'创建巡检任务',exact:true}).click()
  await page.getByLabel('巡检标题',{exact:true}).fill('非法新排期');await page.getByLabel('计划时间',{exact:true}).fill('2020-01-01T12:00')
  await page.getByRole('button',{name:'创建服务器巡检',exact:true}).click()
  await page.getByRole('dialog',{name:'创建巡检任务'}).getByRole('alert').filter({hasText:'晚于当前时间'}).waitFor()
  assert.deepEqual(writes,[])
 }finally{await browser.close()}
})

test('review alarm notes guard close Escape outer navigation and browser leave through errors and revocation',async()=>{
 const {browser,page,user,writes,setFailNotes}=await setup({withAlarms:true})
 try{
  await page.getByRole('button',{name:'告警事件',exact:true}).click()
  await page.getByRole('button',{name:'更多操作',exact:true}).click()
  const note=page.getByLabel('运维跟进备注',{exact:true})
  await note.fill('UNSAVED-REVIEW')
  await page.getByRole('button',{name:'关闭运维明细',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  assert.equal(await note.inputValue(),'UNSAVED-REVIEW')
  await page.getByRole('button',{name:'固件升级',exact:true}).evaluate(el=>el.click())
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`alarm-note-leave-${width}.png`)})}
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  assert.equal(await note.inputValue(),'UNSAVED-REVIEW')
  await page.keyboard.press('Escape')
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),true)
  setFailNotes(true);await page.getByRole('button',{name:'保存备注',exact:true}).click()
  await page.getByText('备注服务暂时不可用',{exact:true}).waitFor();assert.equal(await note.inputValue(),'UNSAVED-REVIEW')
  // Native dialog makes the underlying navigation inert; dispatch its real click handler to exercise the registered App guard.
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).evaluate(el=>el.click())
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  setFailNotes(false);await page.getByRole('button',{name:'保存备注',exact:true}).click()
  await page.getByText('跟进备注已保存至服务器',{exact:true}).waitFor()
  assert.equal(await note.inputValue(),'')
  await note.fill('discard explicitly');await page.getByRole('button',{name:'关闭运维明细',exact:true}).click()
  await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.getByRole('button',{name:'更多操作',exact:true}).click();assert.equal(await note.inputValue(),'')
  await note.fill('switch to another editor')
  await page.getByRole('button',{name:'固件升级',exact:true}).evaluate(el=>el.click())
  await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.getByRole('dialog',{name:'运维记录明细'}).waitFor({state:'detached'})
  await page.getByLabel('目标版本',{exact:true}).fill('still protected')
  await page.getByRole('button',{name:'告警事件',exact:true}).click()
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.getByRole('button',{name:'更多操作',exact:true}).click();assert.equal(await note.inputValue(),'')
  await note.fill('revoke pending')
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).evaluate(el=>el.click())
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor()
  for(const id of ['12','13'])user.stationPermissions[id]=user.stationPermissions[id].filter(x=>x!=='alarm.handle')
  await page.evaluate(async()=>{const {refreshAfterForbidden}=await import('/src/api/client.ts');await refreshAfterForbidden()})
  await page.getByRole('dialog',{name:'放弃未保存修改？'}).waitFor({state:'detached'})
  assert.equal(await note.inputValue(),'');assert.equal(await note.isDisabled(),true)
  assert.equal(await page.locator('.maintenance-page').count(),1)
  assert.equal(await page.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented}),false)
  assert.equal(writes.length,2)
 }finally{await browser.close()}
})
