const {test}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright')
const url=process.env.API_PREVIEW_URL||'http://127.0.0.1:8461'
async function setup(t,{installer=false,dark=false,cards}={}){
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close())
 const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:dark?'dark':'light'});page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000)
 await page.addInitScript(cards=>{sessionStorage.setItem('enerlution-api-token','stylized-regression');if(cards&&!localStorage.getItem('enerlution-overview-cards-v2:api:7:12'))localStorage.setItem('enerlution-overview-cards-v2:api:7:12',JSON.stringify(cards))},cards)
 const permissions=['asset.read','telemetry.read','alarm.read','ems.read','asset.create']
 const user={id:'7',name:'回归用户',account:'review@test.invalid',role:'operator',roleNames:installer?['Installer']:['Engineer'],permissions,stationIds:['12'],stationPermissions:{12:permissions},organizationPermissions:{}}
 await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{const path=new URL(route.request().url()).pathname.slice(4);const data=path==='/auth/me'?user:path==='/settings'?{language:'简体中文',timezone:'Asia/Shanghai',theme:'跟随系统'}:path==='/stations'?[{id:12,name:'未知通信站点',code:'UNKNOWN'}]:[];return route.fulfill({json:{code:0,data}})})
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|api\.mymemory\.translated\.net/,r=>r.abort());await page.goto(url,{waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'一级导航',exact:true}).getByRole('button',{name:'总览',exact:true}).click();await page.locator('.energy-overview').waitFor();return page
}
test('installer selected delivery cards render in the default overview and saved choices hide them',async t=>{
const cards=['建站与接入进度','设备接入概况','交付就绪度','能源供应与构成','子系统可用性与出力'];const page=await setup(t,{installer:true,cards})
for(const card of cards)assert.equal(await page.locator(`.energy-overview [data-overview-card="${card}"]`).isVisible(),true,card)
await page.getByRole('button',{name:'经营看板',exact:true}).click();await page.getByRole('button',{name:'页面定制',exact:true}).click();await page.getByLabel('建站与接入进度',{exact:true}).uncheck();await page.getByRole('button',{name:'保存页面布局',exact:true}).click();await page.getByRole('button',{name:'地图总览',exact:true}).click();assert.equal(await page.locator('[data-overview-card="交付就绪度"]').isVisible(),true);assert.equal(await page.locator('[data-overview-card="建站与接入进度"]').isVisible(),false);await page.reload();await page.getByRole('option',{name:'未知通信站点',exact:true}).waitFor({state:'attached'});await page.locator('.energy-overview [data-overview-card="建站与接入进度"]').waitFor({state:'hidden'});assert.equal(await page.locator('[data-overview-card="建站与接入进度"]').isVisible(),false)
})
test('unknown station communication remains separate from confirmed offline',async t=>{
const page=await setup(t);const counts=await page.locator('.energy-overview-metrics').innerText();assert.match(counts,/离线 0/);assert.match(counts,/未知 1/)
})
test('system dark theme reaches the shell and new overview and maintenance surfaces',async t=>{
const page=await setup(t,{dark:true});const colors=await page.evaluate(()=>{const css=e=>getComputedStyle(document.querySelector(e));return {theme:document.documentElement.dataset.theme,root:getComputedStyle(document.documentElement).getPropertyValue('--ui-bg').trim(),shell:css('.workspace-shell').getPropertyValue('--ui-bg').trim(),overview:css('.overview-workspace').backgroundColor,heading:css('.energy-overview-heading').backgroundColor,text:css('.energy-overview').color}});assert.equal(colors.theme,'system');assert.equal(colors.shell,colors.root);assert.notEqual(colors.overview,'rgb(255, 255, 255)');assert.notEqual(colors.heading,'rgb(255, 255, 255)');assert.notEqual(colors.text,'rgb(29, 29, 31)');await page.screenshot({path:'.figma/stylized-overview-dark.png'});await page.locator('.overview-content').evaluate(e=>e.scrollTop=e.scrollHeight);await page.screenshot({path:'.figma/stylized-role-cards-dark.png'});
await page.getByRole('navigation',{name:'一级导航',exact:true}).getByRole('button',{name:'运维中心',exact:true}).click();await page.locator('.stylized-maintenance-metrics').waitFor();assert.notEqual(await page.locator('.stylized-maintenance-metrics > div').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');await page.screenshot({path:'.figma/stylized-maintenance-dark.png'});await page.emulateMedia({colorScheme:'light'});assert.equal(await page.locator('.workspace-shell').evaluate(e=>getComputedStyle(e).getPropertyValue('--ui-bg').trim()),'#fff')
})

test('operator selected duty and health cards are present',async t=>{const cards=['当班处置态势','运行健康'];const page=await setup(t,{cards});for(const card of cards)assert.equal(await page.locator(`.energy-overview [data-overview-card="${card}"]`).isVisible(),true,card)})
