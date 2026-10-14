const {test}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path')
test('Chinese API site names and alarms become English, preserve raw values, restore Chinese and reuse cache',{timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}}),calls=[],errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000)
 await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','machine-ui'))
 const settings={language:'English',timezone:'Europe/Berlin'},permissions=['asset.read','asset.edit','alarm.read']
 await page.route('http://127.0.0.1:18090/api/**',async route=>{
  const request=route.request(),p=new URL(request.url()).pathname;let data=[]
  if(p==='/api/auth/me')data={id:'74',name:'接口验证用户',account:'translation@test',role:'integrator',organization:'测试组织',stationIds:['1'],permissions,stationPermissions:{1:permissions},organizationPermissions:{}}
  if(p==='/api/settings'){if(request.method()==='PUT'){const body=request.postDataJSON();settings[body.key]=body.value}data=settings}
  if(p==='/api/stations')data=[{id:1,name:'海岚储能示范站',code:'SIM-SH-001',rated_power_kw:250,capacity_kwh:522,region:'华东',latitude:31.23,longitude:121.47}]
  if(p==='/api/stations/1/alarms')data=[{id:90,title:'RACK-02 冷却回路巡检提醒 46.5°C',severity:'warning',device_name:'电池柜',status:'active',occurred_at:'2026-10-12T01:00:00Z'}]
  await route.fulfill({json:{code:200,data}})
 })
 await page.route('https://api.mymemory.translated.net/get?**',async route=>{
  const req=route.request(),q=new URL(req.url()).searchParams.get('q');calls.push(q);assert.equal(req.headers().authorization,undefined);assert.ok(!q.includes('RACK-02')&&!q.includes('46.5'))
  const translated=q.replaceAll('海岚储能示范站','Hailan Storage Pilot Site').replaceAll('冷却回路巡检提醒','Cooling circuit inspection reminder').replace(/[\u3400-\u9fff]+/g,'Translated text')
  await route.fulfill({json:{responseStatus:200,responseData:{translatedText:translated}}})
 })
 await page.route('https://maps.googleapis.com/maps/api/js?**',route=>route.fulfill({contentType:'application/javascript',body:`window.google={maps:{Map:class{constructor(el){el.textContent='Google Maps test SDK'}addListener(){}setOptions(){}getZoom(){return 4}panTo(){}setCenter(){}setZoom(){}getCenter(){return{lat:50,lng:10}}},Marker:class{constructor(o){window.__lastMarkerTitle=o.title}addListener(){}setMap(){}},SymbolPath:{CIRCLE:0},event:{clearInstanceListeners(){}}}};initializeEmsMap();`}))
 await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8443',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:'Overview',exact:true}).click()
 await page.locator('.overview-ticker').getByText('Hailan Storage Pilot Site',{exact:true}).first().waitFor();await page.locator('.overview-ticker').getByText(/RACK-02 Cooling circuit inspection reminder 46.5°C/).first().waitFor()
 assert.equal(await page.locator('select[aria-label="Select overview site"]').inputValue(),'');await page.locator('select[aria-label="Select overview site"]').selectOption('1');assert.equal(await page.locator('select[aria-label="Select overview site"]').inputValue(),'1')
 await page.waitForFunction(()=>!document.querySelector('[role="status"]')?.textContent?.includes('Translating…'))
 assert.equal(calls.filter(q=>q==='海岚储能示范站').length,1)
 assert.match(await page.locator('.global-user-avatar').innerText(),/^[A-Z]$/);assert.ok(!calls.includes('接'))
 await fs.mkdir(path.resolve(__dirname,'../.figma/display-global'),{recursive:true});await page.screenshot({path:path.resolve(__dirname,'../.figma/display-global/api-english.png')})
 const count=calls.length;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Overview',exact:true}).click();await page.locator('.overview-ticker').getByText('Hailan Storage Pilot Site',{exact:true}).first().waitFor();assert.equal(calls.length,count)
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:/Display & language/}).click();await page.getByLabel('Interface language',{exact:true}).selectOption('简体中文');await page.getByRole('button',{name:'Save preferences',exact:true}).click();await page.getByText('偏好已保存至服务器',{exact:true}).waitFor();await page.getByRole('button',{name:'总览',exact:true}).click();await page.locator('.overview-ticker').getByText('海岚储能示范站',{exact:true}).first().waitFor();assert.deepEqual(errors,[])
 }finally{await browser.close()}
})
