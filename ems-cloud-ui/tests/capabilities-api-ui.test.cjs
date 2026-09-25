const {test} = require('node:test')
const assert = require('node:assert/strict')
const {chromium} = require('playwright')
async function setup(t, user, customize = () => undefined, options = {}) {
  const browser = await chromium.launch({channel:'msedge', headless:true}); t.after(()=>browser.close())
  const context = await browser.newContext({viewport:{width:1440,height:1000}})
  await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','capability-test'))
  const page = await context.newPage(); page.setDefaultTimeout(6000)
  page.on('pageerror',error=>console.error('Browser error:',error.message))
  if(options.clock) await page.clock.install()
  const requests=[]; let current=user
  await page.route('http://127.0.0.1:18090/api/**',async route=>{
    const req=route.request(), url=new URL(req.url()), path=url.pathname.slice(4)
    requests.push({path,method:req.method(),permission:url.searchParams.get('permission')})
    let data=[],status=200,msg='ok'
    if(path==='/auth/me') data=current
    else if(path==='/stations') data=[{id:1,name:'站点 A',code:'A',rated_power_kw:100,capacity_kwh:200},{id:2,name:'站点 B',code:'B',rated_power_kw:100,capacity_kwh:200}]
    else if(path==='/stations/options') data=[1,2].filter(id=>current.stationPermissions?.[id]?.includes(url.searchParams.get('permission'))).map(id=>({id,name:`站点 ${id===1?'A':'B'}`}))
    const custom=await customize({path,req,user:current,setUser:next=>{current=next}})
    if(custom) ({data=data,status=status,msg=msg}=custom)
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,msg,data})})
  })
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8445',{waitUntil:'domcontentloaded',timeout:60000})
  return {page,requests,setUser:next=>{current=next}}
}
const base={id:'7',name:'同一身份',account:'user',role:'integrator',organization:'测试',stationIds:['1','2'],organizationPermissions:{}}
test('selected station telemetry revocation clears history while report context and union remain',async t=>{
  const user={...base,permissions:['telemetry.read','report.export','strategy.read'],stationPermissions:{1:['telemetry.read','report.export','strategy.read'],2:['telemetry.read']}}
  const {page,requests,setUser}=await setup(t,user,({path})=>{
    if(path==='/stations/1/points')return {data:[{id:17,name:'Power',unit:'kW'}]}
    if(path==='/points/17/history')return {data:[{timestamp:Date.now(),value:42,samples:1}]}
  })
  await page.getByRole('button',{name:'分析与报告',exact:true}).click()
  await page.getByRole('option',{name:'Power (kW)'}).waitFor({state:'attached'})
  await page.getByRole('button',{name:'查询历史',exact:true}).click()
  await page.getByText('已读取 1 个采样区间。',{exact:true}).waitFor()
  await page.getByRole('tab',{name:'数据下载',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'导出查询 CSV'}).isEnabled(),true)
  setUser({...user,stationPermissions:{1:['report.export','strategy.read'],2:['telemetry.read']}})
  const refreshed=page.waitForResponse(response=>response.url().endsWith('/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await refreshed;await page.waitForTimeout(250)
  assert.equal(await page.getByLabel('分析站点',{exact:true}).inputValue(),'1')
  assert.equal(await page.getByRole('button',{name:'查询历史',exact:true}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:'导出查询 CSV'}).isDisabled(),true)
  assert.deepEqual(await page.getByLabel('测点',{exact:true}).locator('option').allTextContents(),['暂无授权测点'])
  assert.equal(await page.getByText('共 0 个采样区间',{exact:true}).count(),1)
  await page.getByRole('button',{name:'查询历史',exact:true}).evaluate(button=>button.click())
  assert.equal(requests.filter(request=>request.path==='/points/17/history').length,1)
  await page.getByRole('tab',{name:'报告中心',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'下载 CSV 报告'}).isEnabled(),true)
})

for(const invalidation of ['mutation','403'])test(`${invalidation} invalidation waits for a post-invalidation snapshot after held focus refresh`,async t=>{
  const user={...base,permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit'],2:['asset.read']}}
  const revoked={...user,permissions:['asset.read'],stationPermissions:{1:['asset.read'],2:['asset.read']}}
  let hold=false,release,started,invalidated
  const waiting=new Promise(resolve=>{started=resolve}),committed=new Promise(resolve=>{invalidated=resolve})
  const {page,requests}=await setup(t,user,async({path,req,setUser})=>{
    if(path==='/auth/me' && hold){hold=false;started();await new Promise(resolve=>{release=resolve});return {data:user}}
    if(path==='/members/8' && req.method()==='PUT'){setUser(revoked);invalidated();return invalidation==='403'?{status:403,msg:'权限已收回'}:{data:null}}
  })
  await page.getByRole('button',{name:'资产与站点',exact:true}).click()
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor()
  const baseline=requests.filter(request=>request.path==='/auth/me').length
  hold=true
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await waiting
  const save=page.evaluate(async()=>{const {send}=await import(performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/api/client.ts'));try{await send('/members/8','PUT',{enabled:false})}catch(error){if(error.status!==403)throw error}})
  await committed;await page.waitForTimeout(100);release();await save
  assert.equal(requests.filter(request=>request.path==='/auth/me').length,baseline+2)
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor({state:'detached'})
})

test('workorders load without asset.read and create choices contain only create-authorized stations',async t=>{
  const user={...base,permissions:['workorder.read','workorder.create'],stationPermissions:{1:['workorder.read','workorder.create'],2:['workorder.read']}}
  let created
  const {page,requests}=await setup(t,user,({path,req})=>{
    if(path==='/work-orders' && req.method()==='GET')return {data:[{id:91,station_id:2,title:'独立工单',description:'独立描述',status:'pending',assigned_to:7,created_at:new Date().toISOString(),due_at:new Date(Date.now()+86400000).toISOString()}]}
    if(path==='/work-orders' && req.method()==='POST'){created=req.postDataJSON(); return {data:{id:92}}}
  })
  await page.getByRole('button',{name:'工单与审批',exact:true}).click()
  await page.getByRole('row').filter({hasText:'独立工单'}).waitFor()
  await page.getByRole('button',{name:'新建工单',exact:true}).click()
  const dialog=page.getByRole('dialog',{name:'新建工单'})
  assert.deepEqual(await dialog.getByLabel('新建工单站点').locator('option').allTextContents(),['站点 A'])
  assert.equal(await dialog.getByText('NaN kW',{exact:true}).count(),0)
  assert.equal(await dialog.getByLabel('新建工单设备').inputValue(),'')
  await dialog.getByLabel('新建工单标题').fill('独立新工单')
  await dialog.getByLabel('新建工单描述').fill('无需资产读取')
  await dialog.getByRole('button',{name:'创建工单',exact:true}).click()
  await page.getByText('工单 92 已由服务器创建',{exact:true}).first().waitFor()
  assert.equal(created.stationId,1)
  assert.equal(created.assignedTo,null)
  assert.equal(requests.some(x=>x.path==='/stations' || /\/devices$/.test(x.path)),false)
})
test('A editable B read-only uses per-station buttons with identical identity label', async t=>{
  const {page}=await setup(t,{...base,permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit'],2:['asset.read']}})
  await page.getByRole('button',{name:'资产与站点',exact:true}).click()
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'编辑站点 B',exact:true}).count(),0)
})
test('strategy-only readers open existing strategy controls without asset detail and B cannot borrow A management',async t=>{
  const user={...base,permissions:['strategy.read','strategy.manage'],stationPermissions:{1:['strategy.read','strategy.manage'],2:['strategy.read']}}
  const {page,requests}=await setup(t,user)
  await page.getByRole('button',{name:'运营中心',exact:true}).click()
  await page.getByRole('button',{name:'策略执行',exact:true}).click()
  await page.getByRole('row').filter({hasText:'站点 B'}).getByRole('button',{name:'查看策略'}).click()
  await page.getByRole('button',{name:'新增时段',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'新增时段',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'返回策略执行',exact:true}).click()
  await page.getByRole('row').filter({hasText:'站点 A'}).getByRole('button',{name:'查看策略'}).click()
  assert.equal(await page.getByRole('button',{name:'新增时段',exact:true}).isDisabled(),false)
  assert.equal(requests.some(x=>x.path==='/stations'),false)
})
test('tariff-only capability opens existing price settings for its authorized station',async t=>{
  const user={...base,permissions:['tariff.manage'],stationPermissions:{1:['tariff.manage']}}
  const {page,requests}=await setup(t,user)
  await page.getByRole('button',{name:'运营中心',exact:true}).click()
  await page.getByRole('button',{name:'电价设置',exact:true}).click()
  await page.getByRole('heading',{name:'电价日历',exact:true}).waitFor()
  await page.getByRole('button',{name:'日模板管理',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'＋ 新增模板',exact:true}).isDisabled(),false)
  assert.deepEqual(await page.getByLabel('电价站点').locator('option').allTextContents(),['站点 A'])
  assert.equal(requests.some(x=>x.path==='/stations'),false)
})
test('customer-only reads server station summaries and obeys can_edit, then 403 refresh removes stale write',async t=>{
  const user={...base,permissions:['customer.read','customer.manage'],stationPermissions:{1:['customer.read','customer.manage']}}
  const {page,requests}=await setup(t,user,({path,req,setUser})=>{
    if(path==='/platform/customers') return {data:[{id:11,name:'独立客户',station_count:1,can_edit:true,stations:[{id:1,name:'客户站点 A',code:'CA'}]},{id:12,name:'只读客户',station_count:1,can_edit:false,stations:[{id:2,name:'客户站点 B',code:'CB'}]}]}
    if(path==='/platform/customers/11' && req.method()==='PUT'){setUser({...user,permissions:['customer.read'],stationPermissions:{1:['customer.read']}});return {status:403,msg:'客户权限已收回'}}
  })
  await page.getByRole('button',{name:'平台管理',exact:true}).click()
  const row=page.getByRole('row').filter({hasText:'独立客户'})
  await row.getByRole('button',{name:'查看',exact:true}).click()
  await page.getByRole('dialog',{name:'客户详情'}).getByText('客户站点 A',{exact:true}).waitFor()
  await page.getByRole('button',{name:'关闭客户详情'}).click()
  assert.equal(await page.getByRole('row').filter({hasText:'只读客户'}).getByRole('button',{name:'编辑客户',exact:true}).isDisabled(),true)
  const beforeMutation=requests.filter(x=>x.path==='/auth/me').length
  await row.getByRole('button',{name:'编辑客户',exact:true}).click()
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'权限已变化'}).first().waitFor()
  assert.equal(await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).isDisabled(),true)
  assert.equal(requests.filter(x=>x.path==='/stations').length,0)
  assert.equal(requests.filter(x=>x.path==='/auth/me').length,beforeMutation+1)
})
test('focus refresh applies revoked capability without redundant workspace data reloads',async t=>{
  const user={...base,permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit'],2:['asset.read']}}
  const {page,requests,setUser}=await setup(t,user)
  await page.getByRole('button',{name:'资产与站点',exact:true}).click()
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor()
  const initialLoads=requests.filter(x=>x.path==='/stations').length
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(300)
  assert.equal(requests.filter(x=>x.path==='/stations').length,initialLoads)
  setUser({...user,permissions:['asset.read'],stationPermissions:{1:['asset.read'],2:['asset.read']}})
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor({state:'detached'})
})
test('concurrent successful authorization mutations coalesce refresh and revoke visible actions',{timeout:45000},async t=>{
  const user={...base,permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit'],2:['asset.read']}}
  let changed=false,release,started,refreshCount=0
  const waiting=new Promise(resolve=>{started=resolve})
  const {page,requests}=await setup(t,user,async ({path,req})=>{
    if(path==='/members/8' && req.method()==='PUT'){changed=true;return {data:null}}
    if(path==='/auth/me' && changed){
      refreshCount++
      if(refreshCount===1){started();await new Promise(resolve=>{release=resolve})}
      return {data:{...user,permissions:['asset.read'],stationPermissions:{1:['asset.read'],2:['asset.read']}}}}
  })
  await page.getByRole('button',{name:'资产与站点',exact:true}).click()
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor()
  const baseline=requests.filter(x=>x.path==='/auth/me').length
  const save=page.evaluate(async()=>{const {send}=await import(performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/api/client.ts'));return Promise.all([send('/members/8','PUT',{enabled:false}),send('/members/8','PUT',{enabled:false})])})
  await waiting; await page.waitForTimeout(150);release();await save
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor({state:'detached'})
  // Both responses may invalidate before the first snapshot, or the later response
  // may require one trailing snapshot. Never hold that necessary trailing request.
  assert.ok(refreshCount>=1 && refreshCount<=2,`Unexpected refresh count: ${refreshCount}`)
  assert.equal(requests.filter(x=>x.path==='/auth/me').length,baseline+refreshCount)
})
test('old session refresh cannot overwrite a newer login capability snapshot',async t=>{
  const user={...base,permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit'],2:['asset.read']}}
  let hold=false,release,started
  const waiting=new Promise(resolve=>{started=resolve})
  const {page}=await setup(t,user,async({path,req})=>{
    if(path==='/auth/me' && hold && req.headers().authorization==='Bearer capability-test'){started();await new Promise(resolve=>{release=resolve});return {data:user}}
    if(path==='/auth/me' && req.headers().authorization==='Bearer newer-session')return {data:{...user,id:'8',permissions:['customer.read'],stationPermissions:{1:['customer.read']}}}
  })
  await page.getByRole('button',{name:'资产与站点',exact:true}).waitFor()
  hold=true
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await waiting
  await page.evaluate(async()=>{const {setToken}=await import(performance.getEntriesByType('resource').map(entry=>entry.name).find(url=>new URL(url).pathname==='/src/api/client.ts'));setToken('newer-session');window.dispatchEvent(new Event('focus'))})
  await page.getByRole('button',{name:'平台管理',exact:true}).waitFor()
  release();await page.waitForTimeout(250)
  assert.equal(await page.getByRole('button',{name:'资产与站点',exact:true}).count(),0)
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('enerlution-api-token')),'newer-session')
})
test('bounded timer refreshes other administrator changes',async t=>{
  const user={...base,permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit'],2:['asset.read']}}
  const {page,setUser}=await setup(t,user,undefined,{clock:true})
  await page.getByRole('button',{name:'资产与站点',exact:true}).click()
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor()
  setUser({...user,permissions:['asset.read'],stationPermissions:{1:['asset.read'],2:['asset.read']}})
  await page.clock.fastForward(60001)
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).waitFor({state:'detached'})
})
test('organization map changes refresh role scope even when navigation union is unchanged',async t=>{
  const user={...base,stationIds:[],permissions:['role.manage'],stationPermissions:{},organizationPermissions:{1:['role.manage']}}
  const {page,setUser}=await setup(t,user,({path,req,user:current})=>{
    const org=Number(Object.keys(current.organizationPermissions)[0])
    if(path==='/platform/organizations')return {data:[{id:org,name:`组织 ${org}`,parent_id:null}]}
    if(path==='/platform/roles')return {data:[{id:org,name:`角色 ${org}`,organizationId:org,permissionCodes:[],memberCount:0,canEdit:true,canDelete:true}]}
    if(path==='/platform/permissions')return {data:[{code:'asset.read',name:'查看站点',module:'asset',scope:'station',available:true,configurable:true}]}
  })
  await page.getByRole('button',{name:'平台管理',exact:true}).click()
  await page.getByRole('button',{name:'角色 1'}).waitFor()
  await page.getByRole('checkbox',{name:'查看站点',exact:true}).check()
  setUser({...user,organizationPermissions:{1:['role.manage'],3:['organization.member.read']}})
  const refreshed=page.waitForResponse(response=>response.url().includes('/platform/roles?'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await refreshed
  assert.equal(await page.getByRole('checkbox',{name:'查看站点',exact:true}).isChecked(),true)
  setUser({...user,organizationPermissions:{2:['role.manage']}})
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await page.getByRole('button',{name:'角色 2'}).waitFor()
  assert.equal(await page.getByRole('button',{name:'角色 1'}).count(),0)
})

test('API firmware empty state retains structure without invented devices, path or progress', async t => {
  const user={...base,role:'operator',permissions:['asset.read','alarm.read'],stationPermissions:{1:['asset.read','alarm.read'],2:['asset.read','alarm.read']}}
  const {page}=await setup(t,user)
  await page.getByRole('button',{name:'运维中心',exact:true}).click()
  await page.getByRole('button',{name:'固件升级',exact:true}).click()
  await page.getByRole('heading',{name:'目标固件',exact:true}).waitFor()
  assert.equal(await page.locator('.maintenance-firmware-layout').getByText(/PCS-0[1-4]|EPC-100|pcs_firmware\.bin/).count(),0)
  assert.equal(await page.locator('.maintenance-upgrade-progress b').innerText(),'—')
  assert.equal(await page.getByRole('button',{name:'上传固件',exact:true}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:'开始升级',exact:true}).isDisabled(),true)
  assert.equal(await page.getByRole('heading',{name:'升级进度',exact:true}).count(),1)
  assert.equal(await page.getByRole('columnheader',{name:'连接状态',exact:true}).count(),1)
})

test('API health preserves missing observations and offline status without invented diagnostic counts', async t => {
  const user={...base,role:'operator',permissions:['asset.read','alarm.read'],stationPermissions:{1:['asset.read','alarm.read'],2:['asset.read','alarm.read']}}
  const {page}=await setup(t,user,({path})=>path==='/stations/1/devices'?{data:[{id:77,code:'PCS-real',name:'真实设备未知',category:'储能变流器',communication_status:null},{id:78,code:'PCS-offline',name:'真实设备离线',category:'储能变流器',communication_status:'offline'}]}:undefined)
  await page.getByRole('button',{name:'运维中心',exact:true}).click()
  await page.getByRole('button',{name:'设备健康',exact:true}).click()
  const unknown=page.getByRole('row').filter({hasText:'1-77'})
  await unknown.waitFor()
  assert.equal(await unknown.getByText('未知',{exact:true}).count(),1)
  assert.equal(await unknown.getByText('在线',{exact:true}).count(),0)
  assert.equal(await unknown.getByText('0',{exact:true}).count(),0)
  const offline=page.getByRole('row').filter({hasText:'1-78'})
  assert.equal(await offline.getByText('离线',{exact:true}).count(),1)
  for(const [id,status] of [['1-77','未知'],['1-78','离线']]){
    await page.getByRole('row').filter({hasText:id}).getByRole('button',{name:'查看详情',exact:true}).click()
    const current=page.locator('.maintenance-health-device-head dl > div').filter({has:page.getByText('当前状态',{exact:true})})
    assert.equal(await current.locator('dd').innerText(),status)
    assert.equal(await page.locator('.maintenance-health-detail').getByText(/无未恢复故障|在线/).count(),0)
    await page.getByRole('button',{name:'返回设备列表',exact:true}).click()
  }
})

test('revoked station authority closes the held editor after focus refresh in the same session', async t=>{
  const user={...base,permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit'],2:['asset.read']}}
  const {page,setUser}=await setup(t,user)
  await page.getByRole('button',{name:'资产与站点',exact:true}).click()
  await page.getByRole('button',{name:'编辑站点 A',exact:true}).click()
  await page.getByPlaceholder('请输入详细地址',{exact:true}).fill('unsaved revoked address')
  setUser({...user,permissions:['asset.read'],stationPermissions:{2:['asset.read']}})
  const refreshed=page.waitForResponse(response=>response.url().endsWith('/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
  await refreshed
  await page.getByRole('button',{name:'保存到服务器',exact:true}).waitFor({state:'detached'})
  assert.equal(await page.getByRole('button',{name:'编辑站点 A',exact:true}).count(),0)
  assert.equal(await page.getByRole('button',{name:'编辑站点 B',exact:true}).count(),0)
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('enerlution-api-token')),'capability-test')
})
