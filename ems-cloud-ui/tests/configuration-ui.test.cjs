const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')
const preview = process.env.API_PREVIEW_URL || 'http://127.0.0.1:8444'
async function setup(browser) {
 const context = await browser.newContext({viewport:{width:1280,height:900}})
 await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','configuration-test'))
 const page=await context.newPage(); page.setDefaultTimeout(12000); page.setDefaultNavigationTimeout(60000)
 const state={tags:[],assigned:[],items:[],selectedId:null,failTag:false,failLayout:false,writes:[]}
 const user={id:'7',name:'配置测试用户',account:'configuration@test',role:'operator',organization:'验收组织',stationIds:['12'],permissions:['asset.read','asset.edit'],stationPermissions:{'12':['asset.read','asset.edit']},organizationPermissions:{}}
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort())
 await page.route(/^http:\/\/127\.0\.0\.1:1809[01]\/api\//,async route=>{
  const req=route.request(),url=new URL(req.url()),p=url.pathname.slice(4),method=req.method(),body=req.postDataJSON()
  let data=[]
  const reply=(status,msg)=>route.fulfill({status,json:{code:status,msg}})
  if(method!=='GET')state.writes.push({p,method,body})
  if(p==='/auth/me') data=user
  else if(p==='/stations')data=[{id:12,name:'授权测试站点',code:'SITE-12',region:'华东'}]
  else if(p==='/stations/12/space-devices')data={items:[],total:0}
  else if(p==='/station-tags'&&method==='GET')data=state.tags
  else if(p==='/station-tags'&&method==='POST'){if(state.failTag)return reply(409,'标签名称已存在');const tag={id:'tag-1',...body,version:0};state.tags.push(tag);data=tag}
  else if(p==='/station-tags/tag-1'&&method==='PUT'){if(state.failTag)return reply(409,'标签版本已变化');const tag={id:'tag-1',name:body.name,description:body.description,version:body.expectedVersion+1};state.tags=[tag];data=tag}
  else if(p==='/station-tags/tag-1'&&method==='DELETE'){if(state.assigned.length)return reply(409,'标签仍关联站点');state.tags=[];data=null}
  else if(p==='/stations/12/tags'){if(method==='PUT')state.assigned=body.tagIds;data=state.tags.filter(t=>state.assigned.includes(t.id))}
  else if(p==='/monitor/templates'&&method==='GET')data={items:state.items,selectedId:state.selectedId}
  else if(p==='/monitor/templates'&&method==='POST'){const item={id:'template-1',...body,pinned:false,sortOrder:0,version:0};state.items.push(item);data=item}
  else if(p==='/monitor/templates/selection'){state.selectedId=body.templateId;data=null}
  else if(p==='/monitor/templates/template-1'&&method==='PUT'){if(state.failLayout)return reply(409,'模板版本已变化');data={...state.items[0],name:body.name,cards:body.cards,version:body.expectedVersion+1};state.items=[data]}
  else if(p==='/monitor/templates/template-1/pin'){data={...state.items[0],pinned:body.pinned,version:body.expectedVersion+1};state.items=[data]}
  else if(p==='/monitor/templates/template-1'&&method==='DELETE'){state.items=[];state.selectedId=null;data=null}
  await route.fulfill({json:{code:0,data}})
 })
 await page.goto(preview,{waitUntil:'domcontentloaded'})
 await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).click()
 await page.getByRole('button',{name:'经营看板',exact:true}).waitFor()
 return {page,context,state,user}
}
async function assets(page){await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click()}
async function close(page){await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click()}
async function template(page){await page.getByRole('button',{name:'私人看板模板',exact:true}).click();await page.getByRole('button',{name:'新建模板',exact:true}).click();await page.getByLabel('模板名称',{exact:true}).fill('我的运营模板');await page.getByRole('button',{name:'保存模板',exact:true}).click();await page.getByRole('button',{name:'选择我的运营模板',exact:true}).click();await close(page)}
test('tags CRUD, server reload, conflict draft, station assignment and unlink delete', {timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page,state}=await setup(browser);await assets(page)
  await page.getByRole('button',{name:'标签管理',exact:true}).click()
  await page.getByText('暂无标签',{exact:true}).waitFor()
  await page.getByRole('button',{name:'新增标签',exact:true}).click()
  await page.getByLabel('标签名称',{exact:true}).fill('重点站点');await page.getByLabel('标签说明',{exact:true}).fill('重点维护')
  state.failTag=true
  await page.getByRole('button',{name:'保存标签',exact:true}).click()
  await page.getByRole('alert').getByText('标签名称已存在',{exact:true}).waitFor()
  assert.equal(await page.getByLabel('标签名称',{exact:true}).inputValue(),'重点站点')
  state.failTag=false
  await page.getByRole('button',{name:'刷新标签（保留草稿）',exact:true}).click()
  await page.getByRole('button',{name:'保存标签',exact:true}).click()
  await page.getByRole('button',{name:'编辑重点站点',exact:true}).click()
  await page.getByLabel('标签名称',{exact:true}).fill('优先站点')
  await page.getByRole('button',{name:'保存标签',exact:true}).click()
  await page.getByRole('button',{name:'编辑优先站点',exact:true}).waitFor();await close(page)
  await page.getByRole('button',{name:'授权测试站点更多操作',exact:true}).click()
  await page.getByRole('button',{name:'站点标签',exact:true}).click()
  await page.getByRole('checkbox',{name:'优先站点',exact:true}).check()
  await page.getByRole('button',{name:'保存站点标签',exact:true}).click();await page.getByText('站点标签已保存',{exact:true}).waitFor();assert.deepEqual(state.assigned,['tag-1']);await close(page)
  await page.reload();await assets(page)
  await page.getByRole('button',{name:'授权测试站点更多操作',exact:true}).click();await page.getByRole('button',{name:'站点标签',exact:true}).click()
  await page.getByRole('checkbox',{name:'优先站点',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox',{name:'优先站点',exact:true}).isChecked(),true)
  await fs.mkdir(path.join(__dirname,'../.figma/configuration'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../.figma/configuration/mock-tags-persisted-1280.png'),animations:'disabled'})
  await page.getByRole('checkbox',{name:'优先站点',exact:true}).uncheck();await page.getByRole('button',{name:'保存站点标签',exact:true}).click();await page.getByText('站点标签已保存',{exact:true}).waitFor();await close(page)
  await page.getByRole('button',{name:'标签管理',exact:true}).click();await page.getByRole('button',{name:'删除优先站点',exact:true}).click();await page.getByRole('button',{name:'确认删除标签',exact:true}).click();await page.getByText('暂无标签',{exact:true}).waitFor()
  assert.deepEqual(state.tags,[])
 }finally{await browser.close()}
})
test('private template create rename pin server selection and async layout conflict preserve draft', {timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page,state}=await setup(browser);await template(page)
  await page.getByRole('button',{name:'经营看板',exact:true}).click()
  await page.getByRole('button',{name:'页面定制',exact:true}).click()
  assert.equal(await page.getByRole('checkbox',{name:'收益概览',exact:true}).count(),0)
  await page.getByRole('checkbox',{name:'在线运行容量',exact:true}).uncheck()
  for(const name of ['私人看板模板','刷新看板模板']) {
   await page.getByRole('button',{name,exact:true}).evaluate(button=>button.click())
   await page.getByRole('dialog',{name:'放弃布局修改',exact:true}).waitFor()
   await page.getByRole('button',{name:'继续编辑',exact:true}).click()
   assert.equal(await page.getByRole('checkbox',{name:'在线运行容量',exact:true}).isChecked(),false)
  }
  state.failLayout=true
  await page.getByRole('button',{name:'保存页面布局',exact:true}).click();await page.getByText('模板版本已变化',{exact:true}).waitFor()
  assert.equal(await page.getByRole('checkbox',{name:'在线运行容量',exact:true}).isChecked(),false)
  state.failLayout=false;state.items[0].version++
  await page.getByRole('button',{name:'刷新版本（保留卡片草稿）',exact:true}).click()
  await page.getByText('已刷新模板版本；卡片草稿已保留，请核对后保存',{exact:true}).waitFor()
  await page.getByRole('button',{name:'保存页面布局',exact:true}).click();await page.getByText('布局已保存至服务器，地图总览同步更新',{exact:true}).waitFor()
  assert.equal(state.items[0].cards.includes('在线运行容量'),false)
  const local=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('enerlution-overview-cards')));assert.deepEqual(local,[])
  await page.getByRole('button',{name:'私人看板模板',exact:true}).click();await page.getByRole('button',{name:'重命名我的运营模板',exact:true}).click();await page.getByLabel('模板名称',{exact:true}).fill('运行简报');await page.getByRole('button',{name:'保存模板',exact:true}).click();await page.getByRole('button',{name:'置顶运行简报',exact:true}).click();await page.getByRole('button',{name:'取消置顶运行简报',exact:true}).waitFor();await close(page)
  await page.reload();await page.getByRole('option',{name:'★ 运行简报',exact:true}).waitFor({state:'attached'});assert.equal(await page.getByLabel('看板模板',{exact:true}).inputValue(),'template-1')
  await page.getByRole('button',{name:'经营看板',exact:true}).click();assert.equal(await page.locator('.overview-shared-card-grid [data-overview-card="在线运行容量"]').isVisible(),false)
  await fs.mkdir(path.join(__dirname,'../.figma/configuration'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../.figma/configuration/mock-templates-persisted-1280.png'),animations:'disabled'})
  await page.getByRole('button',{name:'私人看板模板',exact:true}).click();await page.getByRole('button',{name:'删除运行简报',exact:true}).click();await page.getByRole('button',{name:'确认删除模板',exact:true}).click();await page.getByText('暂无私人模板，新建后可保存页面布局。',{exact:true}).waitFor();await close(page)
  assert.equal(await page.getByLabel('看板模板',{exact:true}).inputValue(),'')
 }finally{await browser.close()}
})
test('tag write permission revocation disables retained draft and checked assignment', {timeout:60000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page,state,user}=await setup(browser);await assets(page);await page.getByRole('button',{name:'标签管理',exact:true}).click();await page.getByRole('button',{name:'新增标签',exact:true}).click();await page.getByLabel('标签名称',{exact:true}).fill('保留草稿')
  user.permissions=['asset.read'];user.stationPermissions={'12':['asset.read']}
  const response=page.waitForResponse(r=>r.url().endsWith('/auth/me'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await response
  await page.getByText('当前仅有查看权限。',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'保存标签',exact:true}).isDisabled(),true)
  assert.equal(await page.getByLabel('标签名称',{exact:true}).inputValue(),'保留草稿')
  assert.deepEqual(state.writes,[])
 }finally{await browser.close()}
})
test('layout refresh never redirects an existing draft to another selected template', {timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page,state}=await setup(browser);await template(page);await page.getByRole('button',{name:'经营看板',exact:true}).click();await page.getByRole('button',{name:'页面定制',exact:true}).click();await page.getByRole('checkbox',{name:'在线运行容量',exact:true}).uncheck()
  state.items.push({id:'template-2',name:'另一个模板',cards:['在线运行容量'],pinned:true,sortOrder:10,version:0});state.selectedId='template-2'
  await page.getByRole('button',{name:'刷新版本（保留卡片草稿）',exact:true}).click();await page.getByText('已刷新模板版本；卡片草稿已保留，请核对后保存',{exact:true}).waitFor()
  const before=state.writes.length
  await page.getByRole('button',{name:'保存页面布局',exact:true}).click();await page.getByRole('alert').filter({hasText:'当前选中模板已变化'}).waitFor()
  assert.equal(state.writes.length,before);assert.deepEqual(state.items[1].cards,['在线运行容量']);assert.equal(await page.getByRole('checkbox',{name:'在线运行容量',exact:true}).isChecked(),false)
 }finally{await browser.close()}
})
test('removed tag assignments are pruned visibly, and tag drafts require explicit discard on close or navigation', {timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page,state}=await setup(browser);state.tags=[{id:'tag-1',name:'临时标签',description:'',version:0}];await assets(page)
  await page.getByRole('button',{name:'授权测试站点更多操作',exact:true}).click();await page.getByRole('button',{name:'站点标签',exact:true}).click();await page.getByRole('checkbox',{name:'临时标签',exact:true}).check()
  state.tags=[];await page.getByRole('button',{name:'刷新标签（保留草稿）',exact:true}).click();await page.getByText('部分标签已删除，已从待分配草稿中移除；请核对后保存',{exact:true}).waitFor();await page.getByRole('button',{name:'保存站点标签',exact:true}).click();await page.getByText('站点标签已保存',{exact:true}).waitFor();assert.deepEqual(state.assigned,[]);await close(page)
  await page.getByRole('button',{name:'标签管理',exact:true}).click();await page.getByRole('button',{name:'新增标签',exact:true}).click();await page.getByLabel('标签名称',{exact:true}).fill('不能静默丢失')
  await page.getByRole('dialog',{name:'标签管理',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog',{name:'放弃配置草稿',exact:true}).waitFor();await page.getByRole('button',{name:'继续编辑配置',exact:true}).click();assert.equal(await page.getByLabel('标签名称',{exact:true}).inputValue(),'不能静默丢失')
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).evaluate(button=>button.click());await page.getByRole('dialog',{name:'放弃配置草稿',exact:true}).waitFor();await page.getByRole('button',{name:'继续编辑配置',exact:true}).click();assert.equal(await page.getByLabel('标签名称',{exact:true}).inputValue(),'不能静默丢失')
  await page.getByRole('dialog',{name:'标签管理',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'放弃配置修改',exact:true}).click();await page.getByRole('dialog',{name:'标签管理',exact:true}).waitFor({state:'detached'})
 }finally{await browser.close()}
})
test('template name draft disables pin and selection, and close preserves until explicit discard', {timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try{
  const {page}=await setup(browser);await template(page);await page.getByRole('button',{name:'私人看板模板',exact:true}).click();await page.getByRole('button',{name:'重命名我的运营模板',exact:true}).click();await page.getByLabel('模板名称',{exact:true}).fill('未保存名称')
  assert.equal(await page.getByRole('button',{name:'置顶我的运营模板',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'选择我的运营模板',exact:true}).isDisabled(),true)
  assert.equal(await page.getByRole('button',{name:'重命名我的运营模板',exact:true}).isDisabled(),true,'重新打开重命名不能覆盖当前草稿')
  await page.getByRole('dialog',{name:'私人看板模板',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('dialog',{name:'放弃配置草稿',exact:true}).waitFor();await page.getByRole('button',{name:'继续编辑配置',exact:true}).click();assert.equal(await page.getByLabel('模板名称',{exact:true}).inputValue(),'未保存名称')
  await page.getByRole('dialog',{name:'私人看板模板',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'放弃配置修改',exact:true}).click();await page.getByRole('dialog',{name:'私人看板模板',exact:true}).waitFor({state:'detached'})
 }finally{await browser.close()}
})

test('annual plan entry uses the scoped station and revocation preserves input without writes', {timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const {page,user,state}=await setup(browser);await assets(page)
  await page.getByRole('button',{name:'授权测试站点更多操作',exact:true}).click()
  await page.getByRole('button',{name:'发电计划',exact:true}).click()
  await page.getByRole('dialog',{name:'授权测试站点 · 年度月发电计划',exact:true}).waitFor()
  await page.getByRole('button',{name:'新增年度计划',exact:true}).click()
  await page.getByLabel('1月常规计划（kWh）',{exact:true}).fill('42.12')
  user.permissions=['asset.read'];user.stationPermissions={'12':['asset.read']}
  const refreshed=page.waitForResponse(r=>r.url().endsWith('/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refreshed
  await page.getByText('当前仅有查看权限。',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'保存年度计划',exact:true}).isDisabled(),true)
  assert.equal(await page.getByLabel('1月常规计划（kWh）',{exact:true}).inputValue(),'42.12')
  assert.deepEqual(state.writes,[])
  await page.getByRole('button',{name:'关闭计划',exact:true}).click()
  await page.getByRole('button',{name:'继续编辑配置',exact:true}).click()
  assert.equal(await page.getByLabel('1月常规计划（kWh）',{exact:true}).inputValue(),'42.12')
  await page.getByRole('button',{name:'关闭计划',exact:true}).click()
  await page.getByRole('button',{name:'放弃配置修改',exact:true}).click()
  await page.getByRole('dialog',{name:'授权测试站点 · 年度月发电计划',exact:true}).waitFor({state:'detached'})
 } finally {await browser.close()}
})

test('space management entry preserves a revoked station draft and guards shell navigation', {timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const {page,user,state}=await setup(browser);await assets(page)
  await page.getByRole('button',{name:'授权测试站点更多操作',exact:true}).click()
  await page.getByRole('button',{name:'空间管理',exact:true}).click()
  await page.getByRole('dialog',{name:'授权测试站点 · 空间管理',exact:true}).waitFor()
  await page.getByRole('button',{name:'新增空间',exact:true}).click()
  await page.getByLabel('空间名称',{exact:true}).fill('保留的空间草稿')
  user.permissions=['asset.read'];user.stationPermissions={'12':['asset.read']}
  const refreshed=page.waitForResponse(r=>r.url().endsWith('/auth/me'))
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refreshed
  await page.getByText('当前仅有查看权限。',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'保存空间',exact:true}).isDisabled(),true)
  assert.equal(await page.getByLabel('空间名称',{exact:true}).inputValue(),'保留的空间草稿')
  assert.deepEqual(state.writes,[])
  await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'总览',exact:true}).evaluate(button=>button.click())
  await page.getByRole('button',{name:'继续编辑配置',exact:true}).click()
  assert.equal(await page.getByLabel('空间名称',{exact:true}).inputValue(),'保留的空间草稿')
  await page.getByRole('button',{name:'关闭空间管理',exact:true}).click()
  await page.getByRole('button',{name:'放弃配置修改',exact:true}).click()
  await page.getByRole('dialog',{name:'授权测试站点 · 空间管理',exact:true}).waitFor({state:'detached'})
 } finally {await browser.close()}
})
