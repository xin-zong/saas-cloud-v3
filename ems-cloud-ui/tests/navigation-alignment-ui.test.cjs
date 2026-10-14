const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright')
test('navigation separates enterprise and package configuration, moves settings to account and shares overview cards',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000); page.setDefaultNavigationTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','navigation-alignment'))
 const routes=['overview','assets','operations','maintenance','platform.companies','platform.people','platform.roles','platform.packages','platform.menus','platform.templates']
 await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{const p=new URL(route.request().url()).pathname;let data=[];if(p==='/api/platform/companies')data={items:[],total:0,offset:0,limit:20};if(p==='/api/platform/company-options')data={types:[],tags:[],packages:[]};if(p==='/api/auth/me')data={id:'7',name:'平台用户',tenant:{actorId:7,tenantId:1,kind:'platform',administrator:true},roleNames:['Super Admin'],stationIds:[],permissions:['overview.read','asset.read','alarm.read','strategy.read','revenue.read','menu.manage','package.manage'],stationPermissions:{},menus:routes.map((path,i)=>({id:i+1,client:'web',kind:'page',path,children:[]}))};await route.fulfill({json:{code:200,data}})})
 await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8447/',{waitUntil:'domcontentloaded',timeout:60000})
 const nav=page.getByRole('navigation',{name:'一级导航'})
 assert.equal(await nav.getByRole('button',{name:'运营中心',exact:true}).count(),0);assert.equal(await nav.getByRole('button',{name:'设置',exact:true}).count(),0)
 await nav.getByRole('button',{name:'企业管理',exact:true}).click();assert.equal(await page.locator('.tenant-primary-tabs').getByRole('button',{name:'权限管理',exact:true}).count(),0)
 await page.getByRole('heading',{name:'企业管理',exact:true}).waitFor();if(errors.length)throw new Error(errors.join('\n'))
 await nav.getByRole('button',{name:'套餐权限管理',exact:true}).click();await page.getByRole('button',{name:'菜单管理',exact:true}).click();assert.equal(await page.getByRole('button',{name:'企业信息',exact:true}).count(),0)
 await nav.getByRole('button',{name:'总览',exact:true}).click();await page.getByLabel('模糊搜索总览电站',{exact:true}).fill('Berlin')
 const mapCards=await page.locator('[data-overview-card]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-overview-card')).sort())
 await page.getByRole('button',{name:'经营看板',exact:true}).click();assert.deepEqual(await page.locator('[data-overview-card]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-overview-card')).sort()),mapCards)
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByText('显示与语言',{exact:true}).first().waitFor()
 await nav.getByRole('button',{name:'电站管理',exact:true}).click();await page.getByRole('button',{name:'高级筛选',exact:true}).click();await page.getByLabel('高级筛选规则',{exact:true}).selectOption('fault')
 assert.deepEqual(errors,[])
 }finally{await browser.close()}
})
