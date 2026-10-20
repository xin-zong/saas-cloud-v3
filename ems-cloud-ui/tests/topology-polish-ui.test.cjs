
const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path')
test('polished production topology keeps cabinet layout, selection, true 100% zoom and cancel-before-exit behavior',{timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1080}});page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','topology-polish'))
  await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{
   const p=new URL(route.request().url()).pathname
   const data=p==='/api/auth/me'?{id:'7',name:'拓扑验收',tenantName:'测试企业',tenant:{actorId:7,tenantId:2,kind:'enterprise',administrator:true},menus:[{id:1,client:'web',kind:'page',path:'assets',children:[]}],roleNames:['Admin'],stationIds:[],permissions:['asset.read','asset.edit','asset.create'],stationPermissions:{}}:p==='/api/settings'?{language:'简体中文',theme:'跟随系统'}:[]
   await route.fulfill({json:{code:200,data}})
  })
  await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8461/',{waitUntil:'domcontentloaded'})
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click()
  await page.getByRole('button',{name:'＋ 新增站点',exact:true}).click()
  await page.getByLabel('站点名称 *',{exact:true}).fill('拓扑交互验收');await page.getByLabel('站点 ID *',{exact:true}).fill('EDIT-TEST');await page.getByLabel('所在地区 *',{exact:true}).selectOption('欧洲');await page.getByLabel('详细地址 *',{exact:true}).fill('Berlin')
  await page.getByRole('radio',{name:'工商业储能',exact:true}).check();await page.getByRole('button',{name:'下一步',exact:true}).click();await page.locator('.topology-studio').waitFor()
  const reset=page.getByRole('button',{name:'重置缩放',exact:true});await reset.click();assert.equal((await reset.innerText()).trim(),'100%');await page.waitForFunction(()=>Math.abs(new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.topo-scene')).transform).a-1)<.001)
  const cab=await page.locator('.topo-cabinet').boundingBox()
  for(const name of ['储能 PCS 1','电池系统 1']){
   const rect=await page.getByRole('button',{name:'配置 '+name,exact:true}).boundingBox();assert.ok(rect.x>=cab.x&&rect.x+rect.width<=cab.x+cab.width&&rect.y>=cab.y&&rect.y+rect.height<=cab.y+cab.height,name+' must remain inside cabinet '+JSON.stringify({rect,cab}))
  }
  const search=page.getByLabel('搜索设备或结构',{exact:true});await search.fill('不存在的节点');await page.getByText('未找到匹配节点',{exact:true}).waitFor();await search.fill('');await page.getByRole('button',{name:'适应画布',exact:true}).click()
  const battery=page.getByRole('button',{name:'配置 电池系统 1',exact:true});await battery.click();await page.getByLabel('设备名称',{exact:true}).first().waitFor()
  const dir=path.resolve(__dirname,'../.figma/topology-polish');await fs.mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,'editor-1440.png'),fullPage:true,animations:"disabled"})
  const canvas=page.locator('.topo-viewport');await canvas.click({position:{x:8,y:8}});assert.equal(await page.locator('.topo-card.selected').count(),0)
  await battery.click();const before=await battery.boundingBox();await page.mouse.move(before.x+before.width/2,before.y+20);await page.mouse.down();await page.mouse.move(before.x+before.width/2+28,before.y+40,{steps:5});await page.mouse.up();const moved=await battery.boundingBox();assert.ok(moved.x-before.x>20)
  await page.keyboard.press('Control+z');assert.ok(Math.abs((await battery.boundingBox()).x-before.x)<2);await page.keyboard.press('Control+y');assert.ok((await battery.boundingBox()).x-before.x>20)
  const grid=page.getByRole('button',{name:'配置 公共电网 1',exact:true});await grid.focus();for(let i=0;i<16;i++)await page.keyboard.press('Shift+ArrowRight');await page.setViewportSize({width:1366,height:1080});await page.waitForTimeout(100)
  const fitted=await canvas.boundingBox(),currentGrid=await grid.boundingBox();assert.ok(currentGrid.x>=fitted.x&&currentGrid.x+currentGrid.width<=fitted.x+fitted.width,'resizing must fit latest moved nodes')
  await page.getByRole('button',{name:'展开画布',exact:true}).click();const dialog=page.getByRole('dialog',{name:'拓扑全屏编辑'});await dialog.waitFor()
  await page.locator('[data-port="ac"]').first().click();await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true,'first Escape cancels connection without leaving fullscreen');assert.equal(await page.locator('.topo-wires path[stroke-dasharray="5 4"]').count(),0)
  await page.screenshot({path:path.join(dir,'editor-fullscreen.png'),fullPage:true,animations:"disabled"});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
  for(let i=0;i<17;i++)await page.keyboard.press('Control+z');await page.setViewportSize({width:1920,height:1080});await page.getByRole('button',{name:'适应画布',exact:true}).click();await battery.click();await page.screenshot({path:path.join(dir,'editor-1920.png'),fullPage:true,animations:"disabled"})
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:path.join(dir,'editor-dark.png'),fullPage:true,animations:"disabled"});assert.notEqual(await page.locator('.topo-inspector .ems-interface').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(232, 241, 238)');await page.emulateMedia({colorScheme:'light'});await page.getByRole('button',{name:'校验',exact:true}).click();await page.locator('.topo-issue-group').first().waitFor();assert.ok(await page.locator('.topo-issue-group').count()<await page.locator('.topo-issue').count());await page.screenshot({path:path.join(dir,'editor-validation.png'),fullPage:true,animations:"disabled"});await page.getByRole('button',{name:'通信拓扑',exact:true}).click();await page.getByRole('button',{name:'通信节点',exact:true}).waitFor();assert.equal(await page.locator('.topo-library').getByRole('button',{name:'新增 EMS',exact:true}).count(),1);await page.screenshot({path:path.join(dir,'editor-communication.png'),fullPage:true,animations:"disabled"});assert.deepEqual(errors,[])
 }finally{await browser.close()}
})
