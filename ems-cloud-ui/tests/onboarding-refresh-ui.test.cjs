const test = require('node:test'), assert = require('node:assert/strict')
const { chromium } = require('playwright'), fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os')
async function open(page, failCatalog=false) {
 page.setDefaultNavigationTimeout(60000)
 await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','onboarding-refresh'))
 await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//, async route=>{
  const url=new URL(route.request().url());let data=[]
  if(url.pathname==='/api/auth/me')data={id:'7',name:'建站测试',tenantName:'测试企业',tenant:{actorId:7,tenantId:2,kind:'enterprise',administrator:true},menus:[{id:1,client:'web',kind:'page',path:'assets',children:[]}],roleNames:['Admin'],stationIds:[],permissions:['asset.read','asset.edit','asset.create'],stationPermissions:{}}
  if(url.pathname==='/api/provision-models') {
   if(failCatalog)return route.fulfill({status:503,json:{code:503,msg:'目录暂不可用',data:null}})
   data=[{id:1,manufacturer:'Test PCS vendor',name:'PCS-A',category:'PCS'},{id:2,manufacturer:'Test battery vendor',name:'BAT-A',category:'BMS'},{id:3,manufacturer:'Test cooling vendor',name:'HVAC-A',category:'HVAC'}]
  }
  await route.fulfill({json:{code:200,data}})
 })
 await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8445/',{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:/电站管理|资产与站点/,exact:true}).click()
 await page.getByRole('button',{name:'＋ 新增站点',exact:true}).click()
 await page.getByLabel('站点名称 *',{exact:true}).fill('配置差异验证');await page.getByLabel('站点 ID *',{exact:true}).fill('REFRESH')
 await page.getByLabel('所在地区 *',{exact:true}).selectOption('欧洲');await page.getByLabel('详细地址 *',{exact:true}).fill('Berlin')
 await page.getByRole('radio',{name:'光储协同',exact:true}).check();await page.getByRole('button',{name:'下一步',exact:true}).click()
}
test('latest device configuration preserves independent DC PV runtime, catalog types, and communication display',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000)
  await open(page)
  const inspector=page.locator('.unified-inspector')
  const model=inspector.getByLabel('厂家 / 型号',{exact:true}).first()
  await model.selectOption({label:'Test PCS vendor / PCS-A'})
  assert.doesNotMatch(await model.innerText(),/BAT-A/)
  await page.getByRole('button',{name:'配置 光伏 DC/DC 1',exact:true}).click()
  await inspector.getByRole('switch',{name:'运行使能',exact:true}).click()
  await inspector.getByLabel('功率上限（kW）',{exact:true}).fill('88')
  assert.equal(await page.getByRole('button',{name:'配置 光伏 DC/DC 1',exact:true}).count(),1)
  await inspector.getByRole('switch',{name:'配置 DC PV',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'配置 光伏 DC/DC 1',exact:true}).count(),0)
  assert.equal(await inspector.getByLabel('功率上限（kW）',{exact:true}).count(),0)
  await inspector.getByRole('switch',{name:'配置 DC PV',exact:true}).click()
  assert.equal(await inspector.getByLabel('功率上限（kW）',{exact:true}).inputValue(),'88')
  assert.equal(await inspector.getByRole('switch',{name:'运行使能',exact:true}).getAttribute('aria-checked'),'false')
  const toggle=page.getByRole('button',{name:'显示通信标识',exact:true})
  await toggle.click();assert.equal(await page.locator('.unified-node em').count(),0);await toggle.click();assert.ok(await page.locator('.unified-node em').count()>0)
  await page.locator('.unified-library').getByRole('button',{name:'光伏 DC/DC',exact:true}).click()
  await inspector.getByRole('switch',{name:'运行使能',exact:true}).click()
  assert.equal(await page.getByRole('button',{name:'配置 光伏 DC/DC 2',exact:true}).count(),1,'a newly added independent DCDC remains on the canvas when stopped')
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();await page.reload();await page.getByRole('button',{name:'＋ 新增站点',exact:true}).click();await page.getByRole('button',{name:/02.*拓扑与设备/}).click()
  await page.getByRole('button',{name:'配置 光伏 DC/DC 1',exact:true}).click()
  assert.equal(await inspector.getByLabel('功率上限（kW）',{exact:true}).inputValue(),'88')
  for(const width of [1440,1024]) {
   await page.setViewportSize({width,height:960});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
   const dir=path.join(os.tmpdir(),'ems-onboarding-refresh');await fs.mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,`config-${width}.png`),fullPage:true})
  }
  await page.getByRole('button',{name:'展开画布',exact:true}).click();assert.ok(await inspector.getByLabel('功率上限（kW）',{exact:true}).isVisible())
  const canvasRect=await page.locator('.unified-workspace').boundingBox(), inspectorRect=await inspector.boundingBox()
  assert.ok(inspectorRect.x >= canvasRect.x+canvasRect.width-1,'fullscreen canvas and inspector must not overlap')
  await page.screenshot({path:path.join(os.tmpdir(),'ems-onboarding-refresh','fullscreen.png')});await page.keyboard.press('Escape')
  assert.deepEqual(errors,[])
 } finally {await browser.close()}
})
test('catalog failure keeps an editable draft and offers a retry instead of prototype options',{timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {const page=await browser.newPage();await open(page,true)
  await page.getByRole('button',{name:'重试型号目录',exact:true}).click()
  assert.match(await page.locator('.unified-inspector').innerText(),/目录暂不可用/)
  await page.getByRole('button',{name:'保存草稿',exact:true}).click();assert.match(await page.locator('.station-notice').innerText(),/本地草稿已保存/)
 } finally {await browser.close()}
})
