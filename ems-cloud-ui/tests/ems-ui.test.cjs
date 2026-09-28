const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright')
test('isolated EMS fixture renders exact values and real missing current source in native overview', {timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(30000)
 const permissions=['asset.read','telemetry.read','ems.read'];const user={id:'7',name:'EMS fixture',account:'fixture@test',role:'owner',stationIds:['12'],permissions,stationPermissions:{'12':permissions},organizationPermissions:{}}
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,route=>route.abort()); await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','isolated-ems-fixture'))
 await page.route('http://127.0.0.1:18090/api/**',async route=>{
 const p=new URL(route.request().url()).pathname.slice(4);let data=[]
 if(p==='/auth/me')data=user
 else if(p==='/stations')data=[{id:12,name:'EMS测试站',code:'TEST'}]
 else if(p==='/stations/12/points')data=[{id:'17',device_id:'4',name:'测试精确量',unit:'kW'}]
 else if(p==='/stations/12/telemetry/latest')data={items:[{pointId:'17',value:'9007199254740993.123456789',valueType:'number',quality:'valid',source:'cabinet_30s',sourceTime:null,receivedAt:Date.now(),bindingPeriodId:'9007199254740993',supportedAggregations:['last']}],total:1,hasMore:false}
 await route.fulfill({json:{code:0,data}})
 })
 try{await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8443',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'总览',exact:true}).first().click()
 const panel=page.locator('[data-ems-module="overview"]');await panel.waitFor();await panel.locator('.ems-compact-points b').waitFor();assert.equal(await panel.locator('.ems-compact-points b').innerText(),'9007199254740993.123456789');assert.match(await panel.innerText(),/未注册 EMS/);assert.match(await panel.innerText(),/源时间未知/)
 }finally{await browser.close()}
})

test('isolated EMS fixture exercises all eight native entries, unknown alarms, typed history and read-only revision', {timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(30000)
 const permissions=['asset.read','telemetry.read','alarm.read','workorder.read','workorder.create','strategy.read','customer.read','audit.read','ems.read','ems.query','ems.manage']
 const user={id:'7',name:'EMS fixture',account:'fixture@test',role:'owner',stationIds:['12'],permissions,stationPermissions:{'12':permissions},organizationPermissions:{}}
 let releaseHistory;let deferHistory=false;
 const ems='8edace35-bd18-4b75-9712-ce424eed2ca5',calls=[];const fs=require('node:fs/promises'),path=require('node:path'),screens=path.resolve(__dirname,'../../.superpowers/sdd/2026-09-28-cloud-ems-integration/task9-fixture-screens');await fs.mkdir(screens,{recursive:true})
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,route=>route.abort())
 await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','isolated-ems-fixture'))
 await page.route('http://127.0.0.1:18090/api/**',async route=>{
 const url=new URL(route.request().url()),p=url.pathname.slice(4);calls.push(p);let data=[]
 if(p==='/auth/me')data=user
 else if(p==='/stations')data=[{id:12,name:'EMS测试站',code:'TEST'}]
 else if(p==='/settings')data={}
 else if(p==='/stations/12/ems')data=[{ems_uuid:ems,device_id:'4',binding_period_id:'9007199254740993',reachable:true,last_fresh_heartbeat:new Date().toISOString()}]
 else if(p==='/stations/12/points')data=[{id:'17',device_id:'4',name:'测试精确量',unit:'kW'},{id:'201',name:'仅历史数值',unit:'kW'},{id:'202',name:'最新为空数值',unit:'kW'}]
 else if(p==='/stations/12/devices')data=[{id:'4',name:'测试电池',category:'储能',code:'BMS-01'}]
 else if(p==='/stations/12/telemetry/latest')data={items:[{pointId:'17',value:'9007199254740993.123456789',valueType:'number',quality:'valid',source:'cabinet_30s',sourceTime:null,receivedAt:Date.now(),bindingPeriodId:'9007199254740993',supportedAggregations:['last']},{pointId:'202',value:null,valueType:null,quality:'invalid'}],total:201,hasMore:true}
 else if(p.endsWith('/structure'))data={known:false,unknownReason:'no_current_connection_structure',cabinetLinks:[{cabinet_no:1,online:true,source_time_ms:'1789353000123',received_at:'2026-09-28T00:00:00Z'},{cabinet_no:2,online:false,source_time_ms:null},{cabinet_no:3,online:null,source_time_ms:null}],deviceMappings:[{id:'55',scope:'cabinet',cabinet_no:1,role:'bms',local_no:'1',device_id:'4'}],pointMappings:[{measurement_point_id:'201',value_type:'number',supportedAggregations:['last','avg']},{measurement_point_id:'202',value_type:'number',supportedAggregations:['last','avg']}]}
 else if(p==='/devices/4/cells')data={known:false,unknownReason:'no_accepted_cell_observation',values:[]}
 else if(p.endsWith('/configuration'))data={known:true,revision:'0007',receivedAt:'2026-09-28T00:00:00Z',values:[{source_id:'9007199254740997',value:'FW-001',value_type:'text',semanticStatus:'unconfirmed_unit_and_enum'}]}
 else if(p.startsWith('/ems/')&&p.endsWith('/alarms'))data=url.searchParams.get('scope')==='history'?[]:{known:false,snapshots:[{cabinet_no:1,known:false,unknownReason:'current_alarm_list_unknown_last_known_only',alarms:[{alarm_id:'retained-001',code:'88',level:null,levelLabel:'等级未知'}]}],unsupportedScope:'ems_public_current_query'}
 else if(p.endsWith('/ingestion-status'))data={savedEvidence:[],diagnostics:[],refreshDemand:[],consumerLag:null,historyCompleteness:null}
 else if(p==='/points/201/history'||p==='/points/202/history'){if(deferHistory)await new Promise(r=>releaseHistory=r);data=[{timestamp:Date.now()-60000,value:'12.5',quality:'valid',source:'ems',aggregation:'last',selectedSourceTimeKind:'source',selectionPolicy:'prefer_source_per_bucket_else_archive',excludedEvidenceCount:1,evidenceConflict:false,evidence:[{valueType:'number',value:'12.5',quality:'valid',sourceTimeKind:'source'}]},{timestamp:Date.now(),value:'14.5',quality:'valid',source:'ems',aggregation:'last',selectedSourceTimeKind:'source',selectionPolicy:'prefer_source_per_bucket_else_archive',excludedEvidenceCount:1,evidenceConflict:false,evidence:[{valueType:'number',value:'14.5',quality:'valid',sourceTimeKind:'source'}]}]}
 else if(p==='/points/17/history')data=[{timestamp:Date.now(),value:null,quality:'invalid',source:'ems',aggregation:'last',selectedSourceTimeKind:'source',selectionPolicy:'prefer_source_per_bucket_else_archive',excludedEvidenceCount:1,evidenceConflict:false,evidence:[{pointId:'17',value:null,quality:'invalid',sourceTime:null}]}]
 else if(p==='/ems-point-definitions')data={catalogVersion:'test-only',definitions:[]}
 await route.fulfill({json:{code:0,data}})
 })
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
 await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8443',{waitUntil:'domcontentloaded'})
 const nav=page.getByRole('navigation',{name:'一级导航'})
 for(const [label,module] of [['总览','overview'],['运营中心','operations'],['运维中心','maintenance'],['工单与审批','workorders'],['分析与报告','analysis'],['平台管理','platform'],['设置','settings']]){
 await nav.getByRole('button',{name:label,exact:true}).click();const panel=page.locator(`[data-ems-module="${module}"]`);await panel.waitFor();await panel.locator('.ems-summary').waitFor();await page.screenshot({path:path.join(screens,module+'.png'),animations:'disabled'});await panel.getByRole('button',{name:'展开 EMS 详情'}).click()
 if(module==='operations'){await panel.getByRole('button',{name:'查询 EMS 历史'}).click();await panel.locator('td').filter({hasText:'invalid / ems'}).waitFor();await panel.getByText('查看源证据',{exact:true}).first().click();assert.match(await panel.innerText(),/prefer_source_per_bucket_else_archive/);assert.match(await panel.innerText(),/采样完整度未知/);
 for(const id of ['201','202']){await panel.getByLabel('EMS 历史测点').selectOption(id);await panel.getByLabel('EMS 聚合').locator('option').filter({hasText:'avg'}).waitFor({state:'attached'});await panel.getByRole('button',{name:'查询 EMS 历史'}).click();await panel.locator('.ems-chart .recharts-line-curve').waitFor()}
 await panel.getByLabel('EMS 历史测点').selectOption('201');deferHistory=true;await panel.getByRole('button',{name:'查询 EMS 历史'}).click();await page.waitForFunction(()=>document.querySelector('.ems-history-controls button')?.textContent.includes('查询中'));while(!releaseHistory)await page.waitForTimeout(10);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'))});
 assert.equal(await panel.getByRole('button',{name:'查询 EMS 历史',exact:true}).isDisabled(),false);releaseHistory();await page.waitForTimeout(100);assert.equal(await panel.locator('.ems-chart').count(),0);await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'))});deferHistory=false;
 }
 if(module==='maintenance'){await panel.getByText(/柜 1 · 通信 在线/).waitFor();assert.match(await panel.innerText(),/柜 2 · 通信 离线/);assert.match(await panel.innerText(),/柜 3 · 通信 未知/);assert.match(await panel.innerText(),/1789353000123/);await panel.getByText('retained-001',{exact:true}).waitFor();assert.match(await panel.innerText(),/最后已知/);assert.match(await panel.innerText(),/等级未知/);assert.match(await panel.innerText(),/包数不能证明/)}
 if(module==='settings'){await panel.getByText(/FW-001/).waitFor();assert.match(await panel.innerText(),/0007/);assert.equal(await panel.getByRole('button',{name:'写入 EMS 配置未接通'}).isDisabled(),true)}
 await page.screenshot({path:path.join(screens,module+'-expanded.png'),animations:'disabled'})
 }
 await nav.getByRole('button',{name:'资产与站点',exact:true}).click();await page.locator('.station-name-button').first().click();await page.locator('[data-ems-module="assets"]').waitFor();await page.getByRole('button',{name:'设备详情',exact:true}).click();await page.locator('[data-ems-module="assets"]').getByRole('button',{name:'展开 EMS 详情'}).click();await page.locator('[data-ems-module="assets"]').getByText('no_accepted_cell_observation',{exact:true}).waitFor()
 await page.screenshot({path:path.join(screens,'assets-expanded.png'),animations:'disabled'});await page.locator('[data-ems-module="assets"]').getByRole('button',{name:'收起 EMS 详情'}).click();await page.screenshot({path:path.join(screens,'assets.png'),animations:'disabled'});assert(calls.some(p=>p.endsWith('/ingestion-status')));assert(calls.includes('/points/17/history'));assert.deepEqual(errors,[])
 }finally{await browser.close()}
})
