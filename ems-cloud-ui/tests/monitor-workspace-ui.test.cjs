const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises')
const {chromium}=require('playwright')
const preview=process.env.API_PREVIEW_URL||'http://127.0.0.1:8444'
async function setup(browser){
 const context=await browser.newContext({viewport:{width:1366,height:900}})
 await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','monitor-ui-test'))
 const page=await context.newPage();page.setDefaultTimeout(18000)
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
   const facets=summary(filtered)
   if(q.get('communication')&&q.get('communication')!=='all')filtered=filtered.filter(r=>r.communication===q.get('communication'))
   if(q.get('scene')&&q.get('scene')!=='all')filtered=filtered.filter(r=>r.scene===q.get('scene'))
   data={items:filtered,total:filtered.length,limit:50,offset:0,summary:summary(filtered),facets,rules:{counts:[],recent:[]},preferences:state.preference,options:{regions:['华东'],siteTypes:['商业'],tags:[]},sourceMode:'capture',serverTime:'2026-10-18T00:00:00Z'}
   if(state.dashboard&&q.get('includeDashboard')==='true'&&q.get('scope')==='imported')data.dashboardCapture={summary:{...summary(filtered),totals:Object.fromEntries(Object.entries({pvTotal:912340,storageTotalCharged:78900,storageTotalDischarged:90100,storageEfficiency:100}).map(([key,value])=>[key,{value,covered:2,total:2,complete:true}])),storageCapacity:1160},cards:{pvPeak7:{verified:true,value:null,ranking:[{stationId:'12',value:21.35}]}},sourceUpdatedAt:'2026-10-18T03:13:44Z',capturedAt:'2026-10-18T04:00:00Z',sourceHost:'ess-cloud-login.qudeox.com'}
  }
  else if(p.endsWith('/space-devices'))data={items:[],total:0}
  if(data?.dashboardCapture)data.dashboardCapture.cards.pvPeak7.trend={start:'2026-10-11',end:'2026-10-17',granularity:'day',method:'ui-tooltip',observedAt:'2026-10-18T03:50:00Z',series:['metric'],points:[{date:'2026-10-11',values:{metric:0}},{date:'2026-10-12',values:{metric:null}},{date:'2026-10-13',values:{metric:3.79}}]}
  if(data?.dashboardCapture)data.dashboardCapture.cards.pvPeakMonth={verified:true,value:9,ranking:[],trend:{...data.dashboardCapture.cards.pvPeak7.trend,start:'2026-10-01',end:'2026-10-31'}}
  if(data?.dashboardCapture)data.dashboardCapture.cards.pvPeak7.trend.points.splice(1,1) // a missing date must remain a visible gap, not a cross-date line
  await route.fulfill({json:{code:0,data}})
 })
 await page.goto(preview,{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).click()
 return {page,state}
}
async function assets(page){await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click();await page.getByRole('button',{name:'Alpha站',exact:true}).waitFor()}
test('overview status navigation, source labels, server watchlist and same-filter CSV form a closed flow',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page}=await setup(browser)
  await page.getByRole('heading',{name:'运营场站概况',exact:true}).waitFor()
  await page.getByRole('button',{name:/全部设备离线场站/}).click()
  const region=page.getByRole('region',{name:'场站运行列表'})
  await region.getByRole('button',{name:'Beta站',exact:true}).waitFor();assert.equal(await region.getByRole('button',{name:'Alpha站',exact:true}).count(),0)
  await page.getByRole('button',{name:'清除全部筛选',exact:true}).click();await region.getByRole('button',{name:'Alpha站',exact:true}).waitFor()
  await page.getByLabel('搜索监控场站').fill('Beta');await page.waitForFunction(()=>document.querySelectorAll('.monitor-table tbody tr').length===1)
  await page.getByRole('button',{name:'关注Beta站',exact:true}).click();await page.getByText('关注站点已保存至服务器',{exact:true}).waitFor()
  await page.reload({waitUntil:'domcontentloaded'});await assets(page)
  await page.getByRole('button',{name:'我的关注',exact:true}).click();await page.getByRole('button',{name:'取消关注Beta站',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Alpha站',exact:true}).count(),0)
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出筛选场站',exact:true}).click();const file=await download;const text=await fs.readFile(await file.path(),'utf8');assert.ok(text.includes('Beta站'));assert.ok(!text.includes('Alpha站'));assert.ok(text.includes('已导入快照'))
 }finally{await browser.close()}
})

test('overview uses persisted source dashboard totals and restores prototype card sections',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page,state}=await setup(browser);state.dashboard=true
  await page.getByRole('button',{name:'刷新数据看板',exact:true}).click()
  await page.getByText('QUDEOX 看板原始汇总',{exact:true}).waitFor()
  const totals=await page.locator('.monitor-energy-totals').innerText()
  for(const value of ['912.34','78.9','90.1','100'])assert.ok(totals.includes(value),value)
  assert.ok(totals.includes('来源看板原值'));assert.ok(!/2\s*\/\s*2/.test(totals),'source fleet totals do not prove per-station coverage')
  assert.ok((await page.locator('.monitor-ranking').first().innerText()).includes('21.35'))
  await page.getByLabel('满发小时真实趋势',{exact:true}).getByRole('button',{name:'查看数据明细',exact:true}).click()
  const table=page.getByRole('table',{name:'满发小时趋势数据明细',exact:true})
  await table.waitFor();assert.match(await table.innerText(),/2026-10-11\s+0/);assert.match(await table.innerText(),/2026-10-12\s+—/);assert.match(await table.innerText(),/3\.79/)
  const card=page.locator('.monitor-metric-card').first()
  await card.getByRole('button',{name:'本月',exact:true}).click();assert.equal(await card.getByLabel('满发小时统计月份').inputValue(),'2026-10')
  await card.getByRole('button',{name:'满发小时上一周期',exact:true}).click();await card.getByText(/所选周期尚未采集/).waitFor();assert.equal(await card.locator('.monitor-trend-chart').count(),0)
  await card.getByRole('button',{name:'返回已采集周期',exact:true}).click();await card.locator('.monitor-trend-chart').waitFor()
  await card.getByRole('button',{name:'本年',exact:true}).click();await card.getByText('该周期趋势尚未采集',{exact:true}).waitFor()
  await page.getByRole('button',{name:'经营看板',exact:true}).click()
  await page.locator('.overview-shared-card-grid').waitFor()
  assert.equal(await page.getByRole('region',{name:'个人看板布局',exact:true}).count(),0)
  assert.equal(await page.locator('.overview-shared-bottom').count(),1)
 }finally{await browser.close()}
})
test('column settings retain draft on conflict, refresh version and persist after reload',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page,state}=await setup(browser);await assets(page)
  await page.getByRole('button',{name:'场站显示列设置',exact:true}).click();const dialog=page.getByRole('dialog',{name:'监控显示设置'})
  const capacity=dialog.getByRole('checkbox',{name:'光伏装机容量',exact:true});await capacity.uncheck();state.rejectNext=true
  await dialog.getByRole('button',{name:'保存显示设置',exact:true}).click();await dialog.getByRole('alert').getByText('配置已更新，草稿仍可保留',{exact:true}).waitFor();assert.equal(await capacity.isChecked(),false)
  await dialog.getByRole('button',{name:'刷新版本，保留草稿',exact:true}).click();await dialog.getByText('已刷新版本，显示草稿保留；请核对后保存',{exact:true}).waitFor();assert.equal(await capacity.isChecked(),false)
  await dialog.getByRole('button',{name:'保存显示设置',exact:true}).click();await dialog.waitFor({state:'detached'})
  await page.reload({waitUntil:'domcontentloaded'});await assets(page)
  assert.equal(await page.getByRole('columnheader',{name:/光伏装机容量/}).count(),0)
  await page.getByRole('button',{name:'查看储能字段',exact:true}).click();await page.getByRole('columnheader',{name:/整站SOH/}).waitFor()
  await page.getByLabel('场站数据来源').selectOption('current')
  await page.getByRole('button',{name:'场站显示列设置',exact:true}).click()
  await dialog.getByLabel('默认数据来源').selectOption('capture')
  await dialog.getByRole('button',{name:'保存显示设置',exact:true}).click();await dialog.waitFor({state:'detached'})
  assert.equal(await page.getByLabel('场站数据来源').inputValue(),'capture')
 }finally{await browser.close()}
})
