const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{chromium}=require('playwright')
test('reference package can be loaded, edited, saved and downloaded as matching draft-2 XML',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000)
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','reference-export'))
  await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{
   const data=new URL(route.request().url()).pathname==='/api/auth/me'?{id:'7',name:'建站测试',tenantName:'测试企业',tenant:{actorId:7,tenantId:2,kind:'enterprise',administrator:true},menus:[{id:1,client:'web',kind:'page',path:'assets',children:[]}],roleNames:['Admin'],stationIds:[],permissions:['asset.read','asset.edit','asset.create'],stationPermissions:{}}:[]
   await route.fulfill({json:{code:200,data}})
  })
  await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8461/',{waitUntil:'domcontentloaded',timeout:60000})
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click()
  await page.getByRole('button',{name:'＋ 新增站点',exact:true}).click()
  await page.getByRole('button',{name:'载入工商业参考示例',exact:true}).click()
  await page.getByRole('button',{name:'下一步',exact:true}).click()
  await page.getByRole('button',{name:'生成 XML',exact:true}).click()
  const preview=page.getByRole('region',{name:'拓扑配置导出'})
  await preview.getByRole('button',{name:'预览 XML →',exact:true}).click()
  const xml=await preview.locator('pre').innerText(),expected=await fs.readFile(path.join(__dirname,'fixtures/topology-industrial-reference/siteTopology.industrial-reference.xml'),'utf8')
  const [actualTree,expectedTree]=await page.evaluate(([a,b])=>{
   function tree(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid XML');const walk=n=>({tag:n.tagName,attrs:Object.fromEntries([...n.attributes].map(a=>[a.name,a.value]).sort()),children:[...n.children].map(walk).sort((a,b)=>a.tag==='Endpoint'&&b.tag==='Endpoint'?0:(a.tag+(a.attrs.id??a.attrs.nodeRef??'')).localeCompare(b.tag+(b.attrs.id??b.attrs.nodeRef??'')))});return walk(doc.documentElement)}
   return [tree(a),tree(b)]
  },[xml,expected])
  assert.deepEqual(actualTree,expectedTree)
  const event=page.waitForEvent('download');await preview.getByRole('button',{name:'下载拓扑 XML',exact:true}).click();const download=await event
  assert.match(download.suggestedFilename(),/\.xml$/);assert.equal(await fs.readFile(await download.path(),'utf8'),xml)
  await preview.getByRole('button',{name:'返回编辑',exact:true}).click()
  await page.getByRole('button',{name:'保存草稿',exact:true}).click()
  const saved=await page.evaluate(()=>Object.entries(localStorage).find(([k])=>k.startsWith('enerlution_station_provision_v1:'))?.[1])
  assert.ok(saved);assert.equal(JSON.parse(saved).topologyMeta.revision,'1')
  const dir=path.join(require('node:os').tmpdir(),'ems-topology-oct20');await fs.mkdir(dir,{recursive:true});await page.waitForFunction(()=>[...document.images].every(img=>img.complete&&img.naturalWidth>0));assert.equal(await page.locator('.topo-actions img,.topo-card-body>img,.topo-library img').evaluateAll(images=>images.length>10&&images.every(img=>{const rect=img.getBoundingClientRect(),style=getComputedStyle(img);return img.naturalWidth>0&&rect.width>0&&rect.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&style.opacity!=='0'})),true);await fs.writeFile(path.join(dir,'reference-icon-geometry.json'),JSON.stringify(await page.locator('.topo-actions img,.topo-card-body>img,.topo-library img').evaluateAll(images=>images.map(img=>({src:img.getAttribute('src'),naturalWidth:img.naturalWidth,box:{width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height},display:getComputedStyle(img).display,opacity:getComputedStyle(img).opacity}))),null,2));await page.screenshot({path:path.join(dir,'reference-topology.png'),fullPage:true})
 }finally{await browser.close()}
})
