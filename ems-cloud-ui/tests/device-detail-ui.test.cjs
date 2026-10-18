const test=require('node:test'),assert=require('node:assert/strict')
const {chromium}=require('playwright')
const fs=require('node:fs/promises'),path=require('node:path')
test('device types, persistent local configuration, bounded EMS history and true empty states',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000)
  const errors=[],requests=[],writes=[];page.on('pageerror',e=>errors.push(e.message))
  let configuration={version:0,selectedPointIds:[],theoryValues:{}},failSave=false
  const permissions=['asset.read','asset.edit','telemetry.read','alarm.read']
  const user={id:'7',name:'设备验收用户',account:'device@test',role:'operator',organization:'验收组织',stationIds:['12'],permissions,stationPermissions:{'12':permissions},organizationPermissions:{}}
  const sources=['Inverter','Energy Storage Cabinet','PCS','Battery Cluster','Battery Stack','Air Conditioner','Smart Meter','Logger','EMS']
  const devices=sources.map((source_type,i)=>({id:i+1,name:`验收${source_type}`,code:`DEVICE-${i+1}`,serial_number:`SYNTHETIC-${i+1}`,source_type,category:'OTHER',rated_power_kw:0,capacity_kwh:100}))
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','device-test'))
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort())
  await page.route(/^http:\/\/127\.0\.0\.1:1809[01]\/api\//,async route=>{
   const req=route.request(),u=new URL(req.url()),p=u.pathname.slice(4);requests.push(req.url());let data=[]
   if(p==='/auth/me')data=user
   else if(p==='/monitor/templates')data={items:[],selectedId:null}
   else if(p==='/monitor/layout')data={widgets:[],version:0}
   else if(p==='/monitor/history')data={items:[],ranking:[],stationResults:[],unavailable:[],metric:'storagePower',unit:'kW'}
   else if(p==='/alarms/workspace')data={items:[{id:81,device_id:4,title:'验收设备采样告警',severity:'warning',source:'device',occurred_at:'2026-10-17T00:00:00Z',lifecycle:'recovered',acknowledged_at:null}],total:1}
   else if(p.endsWith('/telemetry/snapshot'))data={items:[],presence:null,serverTime:Date.now()}
   else if(p==='/stations')data=[{id:12,name:'设备验收站',code:'SITE-12'}]
   else if(p==='/stations/12/devices')data=devices
   else if(p==='/stations/12/points')data=[{id:31,device_id:4,name:'SOC',unit:'%'}]
   else if(p.endsWith('/space-devices'))data={items:[],total:0}
   else if(p.endsWith('/detail')){const id=Number(p.split('/')[4]);data={type:['inverter','cabinet','pcs','battery-cluster','battery-stack','air-conditioner','meter','logger','ems'][id-1],archive:devices[id-1],points:id===4?[{id:31,name:'SOC',unit:'%'}]:[],configuration,theoryFields:id===4?['loopNum','theorySoh']:[],connections:[],logs:configuration.version?[{id:1,actor_id:7,version:configuration.version,action:'本地设备配置保存',result:'已保存',occurred_at:'2026-10-17T00:00:00Z'}]:[],firmwareRecords:[]}}
   else if(p.endsWith('/reference-samples/history'))data={items:[{source_at:'2026-10-18T08:00:00Z',captured_at:'2026-10-18T09:00:00Z',value:'0',raw_value:'0W',quality:'observed'}]}
   else if(p.endsWith('/reference-samples'))data={items:[{id:501,name:'验收真实零值',unit:'kW',source_at:'2026-10-18T08:00:00Z',captured_at:'2026-10-18T09:00:00Z',value:'0',raw_value:'0W',quality:'observed'},{id:502,name:'验收缺失参数',unit:'V',source_at:'2026-10-18T08:00:00Z',captured_at:'2026-10-18T09:00:00Z',value:null,raw_value:'--',quality:'missing'}]}
   else if(p.endsWith('/realtime'))data={items:[]}
   else if(p.endsWith('/cells'))data={known:false,unknownReason:'no_accepted_layout_or_mapping',values:[]}
   else if(p.endsWith('/configuration')){writes.push(req.postDataJSON());if(failSave)return route.fulfill({status:409,json:{code:409,msg:'配置已更新，请刷新后重试'}});configuration={...req.postDataJSON(),version:configuration.version+1};data=configuration}
   else if(p==='/points/31/history')data=[]
   await route.fulfill({json:{code:0,data}})
  })
  async function open(){await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8444',{waitUntil:'domcontentloaded'});try {await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click();await page.getByRole('button',{name:'列表查询',exact:true}).click();await page.locator('.station-name-button').first().click();await page.getByRole('button',{name:'设备详情',exact:true}).click();await page.getByLabel('设备类型').waitFor()} catch(e){console.log('UI diagnostics:',await page.locator('body').innerText(),errors,requests.slice(-10));throw e}}
  await open()
  await page.getByRole('button',{name:'设备列表视图',exact:true}).click()
  assert.equal(await page.getByRole('table',{name:'设备档案列表'}).locator('tbody tr').count(),9)
  assert.equal(await page.getByRole('table',{name:'设备档案列表'}).locator('tbody tr').first().locator('td').nth(7).innerText(),'0')
  assert.equal(await page.getByRole('button',{name:'导出设备数据',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:/未知\s*9/}).click()
  assert.equal(await page.getByRole('table',{name:'设备档案列表'}).locator('tbody tr').count(),9)
  await page.getByRole('button',{name:'查看设备 验收Battery Cluster',exact:true}).click()
  await page.getByRole('heading',{name:'电池簇档案',exact:true}).waitFor()
  assert.equal(await page.getByLabel('设备类型').locator('option').count(),11)
  await page.getByLabel('设备类型').selectOption('battery-cluster');await page.getByRole('heading',{name:'电池簇档案',exact:true}).waitFor()
  await page.getByRole('tab',{name:'实时参数',exact:true}).click()
  await page.locator('[data-reference-point="501"]').waitFor()
  assert.equal(await page.getByRole('heading',{name:'设备参数',exact:true}).count(),1)
  assert.equal(await page.getByText(/QUDEOX 最近导入参数/).count(),0)
  assert.equal(await page.locator('[data-reference-point="501"] td').nth(1).innerText(),'0')
  assert.equal(await page.locator('[data-reference-point="502"] td').nth(1).innerText(),'未采集')
  await page.getByRole('tab',{name:'历史曲线',exact:true}).click()
  await page.getByText('1 条实际采样，1 条数值采样',{exact:true}).waitFor()
  assert.ok(requests.some(u=>u.includes('/reference-samples/history?')&&u.includes('pointId=501')))
  await page.getByRole('tab',{name:'本地配置',exact:true}).click()
  await page.getByLabel('理论循环次数',{exact:true}).fill('6000');await page.getByLabel('理论 SOH (%)',{exact:true}).fill('80.50')
  await page.getByRole('button',{name:'保存本地配置',exact:true}).click();await page.getByText('本地配置已保存并回读',{exact:true}).waitFor()
  await page.getByRole('tab',{name:'历史曲线',exact:true}).click();await page.getByRole('checkbox',{name:'SOC (%)',exact:true}).check();await page.getByRole('button',{name:'保存参数选择',exact:true}).click()
  await page.getByRole('button',{name:'查询历史',exact:true}).click();await page.getByText('所选范围暂无历史采样',{exact:true}).waitFor()
  assert.ok(requests.some(u=>u.includes('/points/31/history?')&&u.includes('source=ems')&&u.includes('aggregation=last')))
  await open();await page.getByLabel('设备类型').selectOption('battery-cluster');await page.getByRole('heading',{name:'电池簇档案',exact:true}).waitFor();await page.getByRole('tab',{name:'本地配置',exact:true}).click()
  assert.equal(await page.getByLabel('理论循环次数',{exact:true}).inputValue(),'6000')
  failSave=true;await page.getByLabel('理论循环次数',{exact:true}).fill('7000');await page.getByRole('button',{name:'保存本地配置',exact:true}).click();await page.getByText('配置已更新，请刷新后重试',{exact:true}).waitFor();assert.equal(await page.getByLabel('理论循环次数',{exact:true}).inputValue(),'7000')
  await page.getByRole('tab',{name:'实时参数',exact:true}).click();await page.getByRole('heading',{name:'单体电压',exact:true}).waitFor();assert.ok(await page.getByText('暂无测点数据',{exact:true}).count()>0)
  await page.getByRole('tab',{name:'告警',exact:true}).click();await page.getByText('验收设备采样告警',{exact:true}).waitFor();assert.equal(await page.getByRole('cell',{name:'已恢复',exact:true}).count(),1)
  assert.ok(requests.some(u=>u.includes('/alarms/workspace?')&&u.includes('stationId=12')&&u.includes('deviceId=4')));assert.equal(requests.some(u=>u.includes('/workspace/read')),false)
  await page.getByRole('tab',{name:'实时参数',exact:true}).click()
  const directory=path.resolve(__dirname,'../../.local-tools/implementation/device-detail');await fs.mkdir(directory,{recursive:true});await page.screenshot({path:path.join(directory,'battery-cluster-1440.png')})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.equal(writes.length,3);assert.deepEqual(configuration.theoryValues,{loopNum:6000,theorySoh:80.5});assert.deepEqual(errors,[])
 }finally{await browser.close()}
})
