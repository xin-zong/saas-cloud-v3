const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path')
test('overview defaults to the requested compact dashboard and switches to the map artboard without a large title',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(60000)
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','exact-design'))
  await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{
   const p=new URL(route.request().url()).pathname,permissions=['asset.read','telemetry.read','alarm.read','revenue.read','workorder.read','approval.read']
   const data=p==='/api/auth/me'?{id:'7',name:'设计验收',role:'owner',permissions,stationIds:[],stationPermissions:{},organizationPermissions:{}}:p==='/api/settings'?{language:'简体中文',theme:'浅色'}:[]
   await route.fulfill({json:{code:200,data}})
  })
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8461/',{waitUntil:'domcontentloaded'})
  const workspace=page.locator('.overview-workspace')
  assert.equal(await workspace.getAttribute('data-overview-view'),'dashboard')
  await page.getByRole('heading',{name:'平台总览运营看板',exact:true}).waitFor()
  assert.equal(await page.getByRole('heading',{name:'能源总览',exact:true}).count(),0)
  const toggle=page.getByRole('group',{name:'总览视图'}),before=await toggle.boundingBox()
  await toggle.getByRole('button',{name:'地图总览',exact:true}).click()
  const map=page.locator('.overview-map');await map.waitFor()
  assert.equal(await page.locator('.energy-overview').count(),0)
  const after=await toggle.boundingBox();assert.ok(Math.abs(before.x-after.x)<1&&Math.abs(before.y-after.y)<1)
  for(const [width,height] of [[1440,900],[1920,1080],[1366,768]]){
   await page.setViewportSize({width,height});const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width}};return {map:rect('.overview-map'),left:rect('.overview-left'),right:rect('.overview-right'),bottom:rect('.overview-bottom'),scroll:document.documentElement.scrollWidth,viewport:innerWidth}})
   assert.ok(geometry.left.bottom<=geometry.bottom.top&&geometry.right.bottom<=geometry.bottom.top,'map side charts must not overlap the bottom cards')
   assert.ok(geometry.scroll<=geometry.viewport)
  }
  await toggle.getByRole('button',{name:'经营看板',exact:true}).click()
  const dir=path.join(require('node:os').tmpdir(),'ems-overview-exact');await fs.mkdir(dir,{recursive:true});await page.screenshot({path:path.join(dir,'dashboard.png'),fullPage:true})
  assert.deepEqual(errors,[])
 }finally{await browser.close()}
})

test('English overview controls do not overlap the title or date actions', {timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000)
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','english-geometry'))
  await page.route(/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{
   const p=new URL(route.request().url()).pathname
   await route.fulfill({json:{code:200,data:p==='/api/auth/me'?{id:'7',name:'Review',role:'owner',permissions:['asset.read'],stationIds:[],stationPermissions:{}}:p==='/api/settings'?{language:'English',theme:'浅色'}:[]}})
  })
  await page.route(/mymemory|fonts\.google/,r=>r.abort())
  await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8461/',{waitUntil:'domcontentloaded'})
  await page.locator('.compact-kpi').first().waitFor();await page.waitForFunction(()=>document.documentElement.lang==='en')
  for(const width of [1440,1366,1280,1024]){
   await page.setViewportSize({width,height:900})
   const bounds=await page.evaluate(()=>{
    const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom}}
    const range=document.createRange();range.selectNodeContents(document.querySelector('.overview-dashboard-heading h1'));const r=range.getBoundingClientRect()
    return {title:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},nav:rect('.overview-header'),actions:rect('.overview-dashboard-actions')}
   })
   const intersects=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y
   assert.equal(intersects(bounds.nav,bounds.title),false,`title at ${width}`);assert.equal(intersects(bounds.nav,bounds.actions),false,`actions at ${width}`)
  }
 }finally{await browser.close()}
})
