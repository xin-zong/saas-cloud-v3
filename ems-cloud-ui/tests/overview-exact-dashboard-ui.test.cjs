const assert=require('node:assert/strict')
const test=require('node:test')
const fs=require('node:fs/promises')
const path=require('node:path')
const {chromium}=require('playwright')
const base=process.env.API_PREVIEW_URL||'http://127.0.0.1:8461'
async function open(browser,width=1440,permissions=['asset.read']){
 const context=await browser.newContext({viewport:{width,height:900}})
 await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','compact-layout-test'))
 const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000)
 const requested=[]
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/,r=>r.abort())
 const station={id:12,name:'授权测试站',code:'REAL-12',region:'华东',rated_power_kw:100,capacity_kwh:200}
 const user={id:'7',name:'布局测试',account:'layout@test',role:'owner',organization:'企业',stationIds:['12'],permissions,stationPermissions:{'12':permissions},organizationPermissions:{}}
 await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{
  const p=new URL(route.request().url()).pathname.slice(4);requested.push(p)
  const data=p==='/auth/me'?user:p==='/stations'?[station]:p==='/work-orders'?[{id:711,station_id:12,title:'真实工单',status:'pending'}]:p==='/approvals'?[{id:812,station_id:12,title:'真实待审批',status:'pending',submitted_at:'2026-10-20T00:00:00Z',requester_name:'测试用户'},{id:999,station_id:99,title:'越权审批',status:'pending'}]:[]
  await route.fulfill({json:{code:0,data}})
 })
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'总览',exact:true}).click()
 await page.getByRole('button',{name:'经营看板',exact:true}).click()
 await page.locator('.compact-dashboard-content').waitFor()
 return {page,context,requested}
}
test('dashboard-optimized exact card geometry and honest empty states at 1440', {timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {const {page,requested}=await open(browser)
 const rect=selector=>page.locator(selector).first().boundingBox()
 const kpi=await rect('.compact-kpi'),health=await rect('.compact-health-row'),trend=await rect('.compact-trend-row'),work=await rect('.compact-work-row')
 assert.equal(kpi.height,105);assert.equal(health.height,186);assert.equal(trend.height,234);assert.equal(work.height,256)
 assert.equal(health.y-(kpi.y+kpi.height),24);assert.equal(trend.y-(health.y+health.height),24);assert.equal(work.y-(trend.y+trend.height),24)
 const cards=await page.locator('.compact-kpi').all();assert.equal(cards.length,4)
 assert.equal((await cards[0].boundingBox()).width,(await cards[3].boundingBox()).width)
 assert.match(await page.locator('.compact-chart-empty').innerText(),/权限|数据/)
 assert.equal(requested.includes('/approvals'),false)
 assert.equal(await page.locator('.compact-kpi strong').first().innerText(),'1')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
 await fs.mkdir(path.resolve(__dirname,'../.figma/overview-exact'),{recursive:true})
 await page.screenshot({path:path.resolve(__dirname,'../.figma/overview-exact/dashboard-1440.png'),fullPage:true})
 }finally{await browser.close()}
})
test('dashboard APIs remain scoped and mobile cards never overflow', {timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {const {page,requested}=await open(browser,1440,['asset.read','workorder.read','approval.read'])
 await page.getByText('真实待审批',{exact:true}).waitFor();assert.equal(requested.includes('/approvals'),true)
 assert.equal(await page.getByText('越权审批',{exact:true}).count(),0)
 await page.setViewportSize({width:390,height:844})
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false)
 await page.screenshot({path:path.resolve(__dirname,'../.figma/overview-exact/dashboard-390.png'),fullPage:true})
 }finally{await browser.close()}
})

 test('real observed history renders curves and follows custom date range', {timeout:90000},async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true})
  try {
   const {page}=await open(browser,1440,['asset.read','telemetry.read'])
   await page.evaluate(async()=>{
    const {default:React}=await import('/node_modules/.vite/deps/react.js')
    const dom=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=dom.createRoot??dom.default.createRoot
    const {default:Compact}=await import('/src/components/CompactOverviewDashboard.tsx')
    const root=document.createElement('div');root.className='overview-dashboard exact-figma-dashboard';root.style.width='1100px';document.body.replaceChildren(root)
    const station={id:'12',name:'真实采样站',region:'华东',status:'offline',runStatus:'通信在线',alerts:[],storageCapacity:200,telemetryHistory:[{timestamp:'2026-10-18T00:00:00Z',values:{storage:-100}},{timestamp:'2026-10-18T01:00:00Z',values:{storage:100}},{timestamp:'2026-10-19T00:00:00Z',values:{storage:-200}},{timestamp:'2026-10-19T01:00:00Z',values:{storage:200}}]}
    const user={id:'7',permissions:['asset.read','telemetry.read'],stationPermissions:{'12':['asset.read','telemetry.read']},stationIds:['12']}
    const app=createRoot(root);window.__chartApp=app;window.__chartReact=React;window.__chartComponent=Compact;window.__chartProps={stations:[station],user,period:'自定义',range:{start:'2026-10-18',end:'2026-10-19'},region:'全球',nav:[],show:()=>true,onOpenStation:()=>{},onNavigate:()=>{}}
    app.render(React.createElement(Compact,window.__chartProps))
   })
   await page.locator('[data-chart="observed-energy-trend"] .recharts-line-curve').first().waitFor()
   assert.equal(await page.locator('[data-chart="observed-energy-trend"] .recharts-line').count(),2)
   assert.equal(await page.getByText('暂无已连接的数据',{exact:true}).count(),0)
   const health=await page.locator('.compact-health-legend').innerText();assert.match(health,/正常运行\s*0 个/);assert.match(health,/状态未知\s*1 个/)
   await page.evaluate(()=>window.__chartApp.render(window.__chartReact.createElement(window.__chartComponent,{...window.__chartProps,range:{start:'2026-10-20',end:'2026-10-20'}})))
   await page.locator('.compact-chart-empty').waitFor()
   assert.equal(await page.locator('[data-chart="observed-energy-trend"]').count(),0)
  }finally{await browser.close()}
 })
