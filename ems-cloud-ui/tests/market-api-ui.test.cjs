const {test}=require('node:test')
const assert=require('node:assert/strict')
const {chromium}=require('playwright')
test('market drafts persist through API and withdrawal is not external cancellation',async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 const context=await browser.newContext({viewport:{width:1500,height:1100}})
 await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','market-test'))
 const page=await context.newPage();page.setDefaultTimeout(12000)
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 let records=[],saved=null,cancelled=false
 const user={id:'3',name:'市场人员',account:'market@test',role:'owner',organization:'测试',stationIds:['12'],permissions:['asset.read','market.read','market.manage']}
 await page.route('http://127.0.0.1:18090/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.slice(4);let data=[]
  if(path==='/auth/me')data=user
  else if(path==='/stations')data=[{id:12,name:'市场测试站',code:'M-12',rated_power_kw:100,capacity_kwh:200}]
  else if(path==='/stations/12/qualifications')data=[{id:1,area_id:9,area_name:'测试区域',kind:'response',status:'valid',valid_until:'2099-12-31'}]
  else if(path==='/stations/12/market-services')data=records
  else if(path==='/market-drafts'&&request.method()==='POST'){
   assert.equal(request.headers().authorization,'Bearer market-test');saved=request.postDataJSON()
   records=[{id:50,event_code:saved.eventCode,name:saved.name,starts_at:saved.startsAt,ends_at:saved.endsAt,capacity_kw:saved.capacityKw,status:'draft'}];data={id:50,status:'draft'}
  } else if(path==='/market-drafts/50/cancel'){cancelled=true;records[0].status='withdrawn';data=null}
  await route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data})})
 })
 try{
  await page.goto('http://127.0.0.1:8443')
  await page.getByRole('button',{name:'运营中心',exact:true}).click()
  await page.getByRole('button',{name:'市场服务',exact:true}).click()
  await page.getByText('暂无服务记录',{exact:true}).waitFor()
  await page.getByRole('button',{name:'新建内部草稿',exact:true}).click()
  await page.getByLabel('服务资格',{exact:true}).selectOption('1')
  await page.getByLabel('事件编号',{exact:true}).fill('UI-001')
  await page.getByLabel('服务名称',{exact:true}).fill('测试内部草稿')
  await page.getByLabel('开始时间',{exact:true}).fill('2026-10-01T10:00')
  await page.getByLabel('结束时间',{exact:true}).fill('2026-10-01T11:00')
  await page.getByLabel('承诺容量 kW',{exact:true}).fill('40')
  await page.getByRole('button',{name:'保存内部草稿',exact:true}).click()
  await page.getByRole('cell',{name:'内部草稿',exact:true}).waitFor()
  assert.equal(saved.stationId,12);assert.equal(saved.areaId,9);assert.equal(saved.capacityKw,40)
  await page.getByRole('button',{name:'撤回草稿',exact:true}).click()
  await page.getByRole('cell',{name:'已撤回草稿',exact:true}).waitFor()
  assert.equal(cancelled,true);assert.deepEqual(errors,[])
 } finally{await browser.close()}
})
