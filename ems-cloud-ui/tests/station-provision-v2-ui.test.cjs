const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright')
test('legacy multiport draft is preserved and editable through the compatibility editor',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(12000); page.setDefaultNavigationTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  sessionStorage.setItem('enerlution-api-token','legacy-draft-test')
  const fields={model:'',rating:'',voltage:'',protocol:'',interface:'LAN 1',ip:'',port:'502',address:'1',bus:'',baud:'9600',parity:'无校验',bits:'8 / 1'}
  const port={id:'P01',interface:'LAN-1',protocol:'Modbus TCP',role:'服务端 / 从站',ip:'192.168.1.11',port:'502',address:'1',version:'old-v1',targets:['ems/P01']}
  const devices=[{...fields,id:'pcs',type:'PCS',name:'旧 PCS',code:'PCS-OLD',ports:[port,{...port,id:'P02',interface:'CAN-BMS-1',protocol:'CAN',ip:'',version:'old-can',targets:['ems/P02']}]},{...fields,id:'ems',type:'EMS',name:'旧 EMS',code:'EMS-OLD',ports:[{...port,ip:'',targets:[]},{...port,id:'P02',interface:'CAN-BMS-1',protocol:'CAN',ip:'',targets:[]}]}]
  localStorage.setItem('enerlution_station_provision_v1:api:7:new',JSON.stringify({schema:1,template:'自定义空白拓扑',name:'旧草稿测试',code:'OLD-DRAFT',organization:'',region:'欧洲',type:'工商业储能',timezone:'Europe/Berlin',address:'Berlin',imageUrl:'',ratedPower:'',storageCapacity:'',devices,buses:[],connections:[],version:3}))
 })
 await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{let data=[];if(new URL(route.request().url()).pathname==='/api/auth/me')data={id:'7',name:'旧草稿测试',tenantName:'测试企业',tenant:{actorId:7,tenantId:2,kind:'enterprise',administrator:true},menus:[{id:1,client:'web',kind:'page',path:'assets',children:[]}],roleNames:['Admin'],stationIds:[],permissions:['asset.read','asset.edit'],stationPermissions:{}};await route.fulfill({json:{code:200,data}})})
 await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8447/',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click();await page.getByRole('button',{name:'继续本地建站草稿',exact:true}).click();await page.getByRole('button',{name:'下一步',exact:true}).click()
 await page.getByRole('button',{name:'编辑旧草稿通信端口',exact:true}).click();await page.getByRole('button',{name:'通信关系',exact:true}).click();await page.getByRole('button',{name:'配置 旧 PCS',exact:true}).click()
 assert.equal(await page.getByLabel('P01 设备 IP 地址',{exact:true}).inputValue(),'192.168.1.11');assert.equal(await page.getByLabel('P02 协议类型',{exact:true}).inputValue(),'CAN')
 await page.getByLabel('P01 设备 IP 地址',{exact:true}).fill('192.168.1.12');await page.getByRole('button',{name:'返回统一拓扑画布',exact:true}).click();await page.getByRole('button',{name:'保存草稿',exact:true}).click()
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('enerlution_station_provision_v1:api:7:new')))
 const pcs=saved.devices.find(n=>n.id==='pcs');assert.equal(pcs.ports[0].ip,'192.168.1.12');assert.equal(pcs.ports[1].protocol,'CAN');assert.equal(pcs.ports[1].version,'old-can');assert.equal(saved.version,3);assert.deepEqual(errors,[])
 }finally{await browser.close()}
})
