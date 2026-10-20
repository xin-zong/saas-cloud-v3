const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright')
test('incomplete topology cannot download XML and draft recovery remains available',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(60000)
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','export-flow'))
  await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{
   const p=new URL(route.request().url()).pathname
   const data=p==='/api/auth/me'?{id:'7',name:'建站测试',tenantName:'测试企业',tenant:{actorId:7,tenantId:2,kind:'enterprise',administrator:true},menus:[{id:1,client:'web',kind:'page',path:'assets',children:[]}],roleNames:['Admin'],stationIds:[],permissions:['asset.read','asset.edit','asset.create'],stationPermissions:{}}:[]
   await route.fulfill({json:{code:200,data}})
  })
  await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8461/',{waitUntil:'domcontentloaded'})
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click()
  await page.getByRole('button',{name:'＋ 新增站点',exact:true}).click()
  await page.getByLabel('站点名称 *',{exact:true}).fill('XML流程验证');await page.getByLabel('站点 ID *',{exact:true}).fill('XML-FLOW')
  await page.getByLabel('所在地区 *',{exact:true}).selectOption('欧洲');await page.getByLabel('详细地址 *',{exact:true}).fill('Berlin')
  await page.getByRole('button',{name:'下一步',exact:true}).click()
  await page.getByRole('navigation',{name:'建站步骤'}).getByRole('button',{name:/运行参数/}).click()
  assert.equal(await page.locator('.topology-studio').count(),1,'step navigation must not bypass topology validation')
  await page.getByRole('button',{name:'生成 XML',exact:true}).click()
  const preview=page.getByRole('region',{name:'拓扑配置导出'})
  await preview.waitFor();assert.match(await preview.innerText(),/校验未通过/)
  assert.equal(await preview.getByRole('button',{name:'下载拓扑 XML',exact:true}).count(),0)
  const downloadEvent=page.waitForEvent('download')
  await preview.getByRole('button',{name:'下载本地草稿',exact:true}).click()
  const download=await downloadEvent;assert.match(download.suggestedFilename(),/\.json$/)
  await preview.getByRole('button',{name:'返回编辑',exact:true}).click();await preview.waitFor({state:'hidden'})
  await page.getByRole('button',{name:'保存草稿',exact:true}).click()
  assert.match(await page.locator('.station-notice').innerText(),/本地草稿已保存/)
 }finally{await browser.close()}
})
