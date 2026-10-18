const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises')
const {chromium}=require('playwright')
const preview=process.env.API_PREVIEW_URL||'http://127.0.0.1:8444'
async function setup(browser){
 const context=await browser.newContext({viewport:{width:1366,height:900}})
 await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','monitor-ui-test'))
 const page=await context.newPage();page.on("pageerror",e=>console.error(e.stack));page.setDefaultTimeout(18000)
 const permission=['asset.read','asset.edit','telemetry.read','alarm.read','report.export']
 const user={id:'7',name:'验收',account:'monitor@test',role:'owner',organization:'验收组织',stationIds:['12','13'],permissions:permission,stationPermissions:{12:permission,13:permission},organizationPermissions:{}}
 const state={preference:{settings:{},watchedStationIds:[],version:0},rejectNext:false,dashboard:false}
 const sites=[{id:'12',name:'Alpha站',code:'A',region:'华东',address:'地址A',scene:'Hybrid',communication:'online',currentCommunication:'unknown',imported:true,alarmCount:0,telemetryAllowed:true,alarmAllowed:true,capturedAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-16T23:55:00Z',source:'reference_capture',siteType:'商业',productionStatus:'running',chargeStatus:'idle',tags:[],metrics:{pvPower:0,pvCapacity:100,pvTotal:0,storagePower:100,storageCapacity:200,storageSoc:0,storageSoh:98}},{id:'13',name:'Beta站',code:'B',region:'华东',address:'地址B',scene:'BESS',communication:'offline',currentCommunication:'unknown',imported:true,alarmCount:0,telemetryAllowed:true,alarmAllowed:true,capturedAt:'2026-10-17T00:00:00Z',updatedAt:'2026-10-16T23:55:00Z',source:'reference_capture',siteType:'商业',productionStatus:'running',chargeStatus:'charging',tags:[],metrics:{storagePower:50,storageCapacity:100,storageSoc:50,storageSoh:96}}]
 const summary=rows=>({total:rows.length,online:rows.filter(r=>r.communication==='online').length,offline:rows.filter(r=>r.communication==='offline').length,partial:0,connecting:0,unknown:0,alarmSites:0,alarmUnknown:0,PV:0,BESS:rows.filter(r=>r.scene==='BESS').length,Hybrid:rows.filter(r=>r.scene==='Hybrid').length,totals:{pvTotal:{value:0,covered:1,total:rows.length,complete:false},storageTotalCharged:{value:null,covered:0,total:rows.length,complete:false},storageTotalDischarged:{value:null,covered:0,total:rows.length,complete:false},storageEfficiency:{value:null,covered:0,total:rows.length,complete:false}},pvCapacity:100,storagePower:150,storageCapacity:300,captureSites:rows.length,latestCapturedAt:'2026-10-17T00:00:00Z'})
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort())
 await page.route(/^http:\/\/127\.0\.0\.1:1809[01]\/api\//,async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.slice(4),q=url.searchParams;let data=[]
  if(p==='/auth/me')data=user
  else if(p==='/stations')data=sites.map(r=>({id:Number(r.id),name:r.name,code:r.code,region:r.region,asset_type:r.scene}))
  else if(p==='/alarms/workspace')data={items:[],total:0,limit:20,offset:0}
  else if(p==='/monitor/history')data={items:[],ranking:[],stationResults:[],unavailable:[]}
  else if(p==='/monitor/templates')data={items:[],selectedId:null}
  else if(p==='/monitor/layout')data={widgets:[],version:0}
  else if(p==='/monitor/workspace/preferences'){
   if(req.method()==='PUT'){
    const body=req.postDataJSON()
    if(state.rejectNext){state.rejectNext=false;state.preference.version++;return route.fulfill({status:409,json:{code:409,msg:'配置已更新，草稿仍可保留'}})}
    if(body.expectedVersion!==state.preference.version)return route.fulfill({status:409,json:{code:409,msg:'版本冲突'}})
    state.preference={settings:body.settings,watchedStationIds:body.watchedStationIds,version:body.expectedVersion+1}
   }
   data=state.preference
  }
  else if(p==='/monitor/workspace'||p==='/monitor/workspace/export-data'){
   let filtered=sites.map(r=>({...r,watched:state.preference.watchedStationIds.includes(r.id)}))
   if(q.get('search'))filtered=filtered.filter(r=>r.name.includes(q.get('search')))
   if(q.get('watched')==='true')filtered=filtered.filter(r=>r.watched)
   if(q.get('stationId'))filtered=filtered.filter(r=>r.id===q.get('stationId'))
   const facets=summary(filtered)
   if(q.get('communication')&&q.get('communication')!=='all')filtered=filtered.filter(r=>r.communication===q.get('communication'))
   if(q.get('scene')&&q.get('scene')!=='all')filtered=filtered.filter(r=>r.scene===q.get('scene'))
   data={items:filtered,total:filtered.length,limit:50,offset:0,summary:summary(filtered),facets,rules:{counts:[],recent:[]},preferences:state.preference,options:{regions:['华东'],siteTypes:['商业'],tags:[]},sourceMode:'capture',serverTime:'2026-10-18T00:00:00Z'}
   if(state.dashboard&&q.get('includeDashboard')==='true'&&q.get('scope')==='imported')data.dashboardCapture={summary:{...summary(filtered),totals:Object.fromEntries(Object.entries({pvTotal:912340,storageTotalCharged:78900,storageTotalDischarged:90100,storageEfficiency:100}).map(([key,value])=>[key,{value,covered:2,total:2,complete:true}])),storageCapacity:1160},cards:{pvPeak7:{verified:true,value:null,ranking:[{stationId:'12',value:21.35}]}},sourceUpdatedAt:'2026-10-18T03:13:44Z',capturedAt:'2026-10-18T04:00:00Z',sourceHost:'ess-cloud-login.qudeox.com'}
  }
  else if(p.endsWith('/profile'))data={timezone:'Europe/Madrid',solarCapacityKw:100,gridConnectionDate:'2026-03-26',commissionedOn:null,country:'Spain',province:null,city:null,postcode:null}
  else if(p.endsWith('/space-devices'))data={items:[],total:0}
  if(data?.dashboardCapture)data.dashboardCapture.cards.pvPeak7.trend={start:'2026-10-11',end:'2026-10-17',granularity:'day',method:'ui-tooltip',observedAt:'2026-10-18T03:50:00Z',series:['metric'],points:[{date:'2026-10-11',values:{metric:0}},{date:'2026-10-12',values:{metric:null}},{date:'2026-10-13',values:{metric:3.79}}]}
  if(data?.dashboardCapture)data.dashboardCapture.cards.pvPeakMonth={verified:true,value:9,ranking:[],trend:{...data.dashboardCapture.cards.pvPeak7.trend,start:'2026-10-01',end:'2026-10-31'}}
  if(data?.dashboardCapture)data.dashboardCapture.cards.pvPeak7.trend.points.splice(1,1) // a missing date must remain a visible gap, not a cross-date line
  if(data?.dashboardCapture)data.dashboardCapture.cards.storageEfficiencyMonth={verified:true,value:100,ranking:[],chargeEnergy:7240,dischargeEnergy:10590,trend:{start:'2026-10-01',end:'2026-10-31',granularity:'day',method:'ui-tooltip',observedAt:'2026-10-18T03:50:00Z',series:['chargeEnergy','dischargeEnergy'],points:[{date:'2026-10-01',values:{chargeEnergy:0,dischargeEnergy:123.45}},{date:'2026-10-03',values:{chargeEnergy:456.78,dischargeEnergy:null}}]}}
  await route.fulfill({json:{code:0,data}})
 })
 await page.goto(preview,{waitUntil:'domcontentloaded',timeout:60000})
 await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).click()
 return {page,state,user}
}
async function assets(page){await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click();await page.getByRole('button',{name:'Alpha站',exact:true}).waitFor()}
test('substation saves before binding, survives conflicts and rejects foreign detail',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page}=await setup(browser),writes=[];let rows=[],foreign=false,conflict=false
  const devices=[{deviceId:'d1',name:'本站设备',code:'D1',substationId:null,substationName:null},{deviceId:'d2',name:'其他子站设备',code:'D2',substationId:'other',substationName:'其他子站'}]
  await page.route(/\/api\/stations\/12\/substation/,async route=>{const req=route.request(),p=new URL(req.url()).pathname;let data=[]
   if(p.endsWith('/substation-capabilities'))data={systems:['pv','storage'],solarCapacityKw:100}
   else if(p.endsWith('/substation-devices'))data=devices
   else if(req.method()==='POST'){writes.push('create');data={...req.postDataJSON(),id:'child',stationId:'12',version:0,deviceIds:[],deviceCount:0,state:'pending_devices'};rows=[data]}
   else if(req.method()==='PUT'){writes.push('bind');if(conflict)return route.fulfill({status:409,json:{code:409,msg:'版本冲突'}});devices[0].substationId='child';data={...rows[0],version:1,deviceIds:['d1'],deviceCount:1,state:'ready'};rows=[data]}
   else if(p.endsWith('/child'))data={...rows[0],stationId:foreign?'13':'12'}
   else data=rows
   await route.fulfill({json:{code:0,data}})
  })
  await assets(page);await page.getByRole('button',{name:'Alpha站',exact:true}).click();await page.getByRole('navigation',{name:'站点二级导航'}).getByRole('button',{name:'子场站',exact:true}).click()
  await page.getByRole('button',{name:'新增子场站',exact:true}).click();await page.getByLabel('子场站名称',{exact:true}).fill('新子场站');await page.getByLabel('光伏',{exact:true}).check();await page.getByLabel('光伏装机容量（kWp）',{exact:true}).fill('10')
  assert.deepEqual(writes,[]);await page.getByRole('button',{name:'保存资料并关联设备'}).click();await page.getByRole('heading',{name:'第二步 · 新子场站关联设备'}).waitFor();assert.deepEqual(writes,['create'])
  assert.equal(await page.getByLabel(/其他子站设备/).isDisabled(),true);await page.getByLabel(/本站设备/).check();conflict=true;await page.getByRole('button',{name:'确认设备关联'}).click();await page.getByRole('alert').filter({hasText:'版本冲突'}).waitFor();assert.equal(await page.getByLabel(/本站设备/).isChecked(),true)
  conflict=false;await page.getByRole('button',{name:'确认设备关联'}).click();await page.getByRole('button',{name:'查看设备',exact:true}).waitFor();await page.getByRole('button',{name:'返回子场站列表'}).click();devices[0].substationId=null;await page.getByRole('button',{name:'刷新列表',exact:true}).click();await page.getByRole('button',{name:'详情',exact:true}).click();await page.getByRole('button',{name:'查看设备',exact:true}).waitFor();await page.getByRole('button',{name:'返回子场站列表'}).click();await page.getByRole('button',{name:'关联设备',exact:true}).click();await page.getByRole('heading',{name:'第二步 · 新子场站关联设备'}).waitFor();assert.equal(await page.getByLabel(/本站设备/).isChecked(),true,'fresh detail membership survives stale candidate list');await page.getByRole('button',{name:'返回子场站列表'}).click();foreign=true;await page.getByRole('button',{name:'详情',exact:true}).click();await page.getByRole('alert').filter({hasText:'不属于当前场站'}).waitFor()
 }finally{await browser.close()}
})

test('read-only parent hides writes and switching parent clears draft',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
 const {page,user}=await setup(browser)
 user.stationPermissions['13']=['asset.read'];await page.route(/\/api\/stations\/\d+\/substation/,route=>route.fulfill({json:{code:0,data:route.request().url().endsWith('capabilities')?{systems:['pv']}:[]}}))
 await assets(page);await page.getByRole('button',{name:'Alpha站',exact:true}).click();await page.getByRole('navigation',{name:'站点二级导航'}).getByRole('button',{name:'子场站',exact:true}).click();await page.getByRole('button',{name:'新增子场站',exact:true}).click();await page.getByLabel('子场站名称',{exact:true}).fill('不可泄漏草稿')
 await page.getByRole('button',{name:'站点列表',exact:true}).click();await page.getByRole('button',{name:'Beta站',exact:true}).click();await page.getByRole('navigation',{name:'站点二级导航'}).getByRole('button',{name:'子场站',exact:true}).click();await page.getByRole('heading',{name:'Beta站 · 子场站'}).waitFor();assert.equal(await page.locator('input[value="不可泄漏草稿"]').count(),0)
 await page.reload();await assets(page);await page.getByRole('button',{name:'Beta站',exact:true}).click();await page.getByRole('navigation',{name:'站点二级导航'}).getByRole('button',{name:'子场站',exact:true}).click();await page.getByRole('heading',{name:'Beta站 · 子场站'}).waitFor();assert.equal(await page.getByRole('button',{name:'新增子场站',exact:true}).count(),0)
 }finally{await browser.close()}
})

test('station data distinguishes stored capture from continuous acquisition and preserves zero metrics',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{const {page}=await setup(browser);await page.route('**/api/stations/12/telemetry/snapshot',route=>route.fulfill({json:{code:0,data:{items:[{pointId:'p1',value:0,valueType:'number',quality:'valid',sourceTime:Date.now(),sourceType:'stored_device'}],serverTime:Date.now(),presence:null}}}));await assets(page);await page.getByRole('button',{name:'Alpha站',exact:true}).click();await page.getByRole('navigation',{name:'站点二级导航'}).getByRole('button',{name:'场站数据',exact:true}).click();await page.getByText('连续采集未接通：当前为已入库设备采样。',{exact:true}).waitFor();assert.match(await page.locator('[data-metric="storageSoc"]').innerText(),/0/);await page.getByLabel('采样开始日期',{exact:true}).fill('2026-10-01');await page.getByRole('heading',{name:'实测功率趋势与排行'}).waitFor();assert.equal(await page.getByRole('button',{name:'导出所选历史'}).count(),1)
 }finally{await browser.close()}
})

