const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')
const preview = process.env.SPACES_PREVIEW_URL || 'http://127.0.0.1:8444'
async function setup(t, options = {}) {
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close())
 const page=await browser.newPage({viewport:{width:1280,height:1000}});page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(60000)
 const state={spaces:options.existing?[{id:'space-a',stationId:'101',parentId:null,name:'园区',type:10,version:0,deviceCount:0},{id:'space-b',stationId:'101',parentId:null,name:'办公楼',type:30,version:0,deviceCount:0}]:[],devices:Array.from({length:25},(_,i)=>({deviceId:String(i+1),name:`设备${i+1}`,code:`DEV-${String(i+1).padStart(3,'0')}`,spaceId:options.assigned&&i===1?'space-b':null,spaceName:options.assigned&&i===1?'办公楼':null})),writes:[],reads:[],fail:options.fail,errors:[],serial:0}
 let release;const pending=new Promise(resolve=>release=resolve)
 page.on('pageerror',e=>state.errors.push(e.message))
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort())
 await page.route('**/src/main.tsx*',async r=>{
  const source=await(await r.fetch()).text(),react=source.match(/["']([^"']*\/react\.js\?v=[^"']+)["']/)?.[1],dom=source.match(/["']([^"']*\/react-dom_client\.js\?v=[^"']+)["']/)?.[1]
  assert.ok(react&&dom,'Use live Vite React versions')
  await r.fulfill({contentType:'text/javascript',body:`import React from '${react}';import ReactDOM from '${dom}';import Panel from '/src/components/StationSpacesPanel.tsx';import '/src/index.css';
  function Harness(){const[open,setOpen]=React.useState(true),[canEdit,setCanEdit]=React.useState(${options.readOnly?'false':'true'});const guard=React.useRef(null);const register=React.useCallback(g=>guard.current=g,[]);window.__revoke=()=>setCanEdit(false);window.__restore=()=>setCanEdit(true);window.__unmount=()=>setOpen(false);window.__navigate=async()=>{const allowed=guard.current?await guard.current():true;if(allowed)setOpen(false);return allowed};return open?React.createElement(Panel,{station:{id:'101',name:'空间测试站点'},canEdit,onClose:()=>setOpen(false),registerLeaveGuard:register}):React.createElement('p',null,'空间管理已关闭')};ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));`})
 })
 if(options.demo)await page.route('**/src/api/client.ts*',r=>r.fulfill({contentType:'text/javascript',body:`export const DEMO_MODE=true;export class ApiError extends Error{};export function api(){window.__unexpectedCalls=(window.__unexpectedCalls||0)+1;throw Error('No demo API')}export const send=api;`}))
 const recount=()=>state.spaces.forEach(space=>space.deviceCount=state.devices.filter(d=>d.spaceId===space.id).length)
 await page.route(url=>url.pathname.startsWith('/api/'),async r=>{
  const req=r.request(),method=req.method(),url=new URL(req.url()),p=url.pathname.replace('/api/stations/101/','')
  const reply=(data,status=200,msg='ok')=>r.fulfill({status,headers:{'access-control-allow-origin':'*'},json:{code:status,data,msg}})
  if(method==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization'}})
  if(method==='GET'){
   state.reads.push(p+url.search);recount()
   if(p==='spaces')return reply(state.spaces)
   if(p==='space-devices'){
    let rows=state.devices.filter(d=>`${d.name} ${d.code}`.toLowerCase().includes((url.searchParams.get('q')||'').toLowerCase()))
    if(url.searchParams.get('spaceId'))rows=rows.filter(d=>d.spaceId===url.searchParams.get('spaceId'))
    if(url.searchParams.get('unassigned')==='true')rows=rows.filter(d=>!d.spaceId)
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||20)
    return reply({items:rows.slice(offset,offset+limit),total:rows.length})
   }
  }
  const body=req.postData()?req.postDataJSON():null;state.writes.push({p,method,body,query:url.search})
  if(options.pending)await pending
  if(state.fail){const fail=state.fail;state.fail=null;if(state.spaces[0]){state.spaces[0].version++;if(fail==='rename')state.spaces[0].name='远端名称'}if(fail==='assignment')state.devices[0]={...state.devices[0],spaceId:'space-b',spaceName:'办公楼'};return reply(null,409,'空间版本冲突')}
  if(p==='spaces'&&method==='POST'){const space={id:`new-space-${++state.serial}`,stationId:'101',...body,version:0,deviceCount:0};state.spaces.push(space);return reply(space)}
  const parts=p.split('/'),space=state.spaces.find(row=>row.id===parts[1]);if(!space)return reply(null,404,'空间不存在')
  const version=body?.expectedVersion??Number(url.searchParams.get('expectedVersion'));if(version!==space.version)return reply(null,409,'空间版本冲突')
  if(parts.length===2&&method==='PUT'){space.name=body.name;space.version++;return reply(space)}
  if(parts[2]==='parent'){space.parentId=body.parentId;space.version++;return reply(space)}
  if(parts[2]==='devices'&&method==='PUT'){
   const batch=body.deviceIds.map(id=>state.devices.find(d=>d.deviceId===id));if(batch.some(d=>!d||d.spaceId&&d.spaceId!==space.id))return reply(null,409,'设备已属于其他空间')
   batch.forEach(d=>{d.spaceId=space.id;d.spaceName=space.name});space.version++;recount();return reply(space)
  }
  if(parts[2]==='devices'&&method==='DELETE'){const d=state.devices.find(d=>d.deviceId===parts[3]);if(d){d.spaceId=null;d.spaceName=null}space.version++;recount();return reply(space)}
  if(method==='DELETE'){if(state.spaces.some(s=>s.parentId===space.id)||state.devices.some(d=>d.spaceId===space.id))return reply(null,409,'空间仍有子空间或关联设备');state.spaces=state.spaces.filter(s=>s.id!==space.id);return reply(null)}
  return reply(null,400,'Unexpected API')
 })
 await page.goto(preview,{waitUntil:'domcontentloaded'})
 await page.getByRole('dialog',{name:'空间测试站点 · 空间管理',exact:true}).waitFor()
 if(!options.demo)await page.getByRole('button',{name:'新增空间',exact:true}).waitFor()
 return{page,state,release}
}
async function choose(page,name){await page.getByRole('treeitem',{name:`选择空间${name}`,exact:true}).click()}
async function create(page,name,type='10',child=false){await page.getByRole('button',{name:child?'新增子空间':'新增空间',exact:true}).click();await page.getByLabel('空间名称',{exact:true}).fill(name);await page.getByLabel('空间类型',{exact:true}).selectOption(type);await page.getByRole('button',{name:'保存空间',exact:true}).click();await page.getByRole('status').filter({hasText:'空间配置已保存'}).waitFor()}

test('403 recovery requires successful refresh, preserves space draft and still respects canEdit', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{existing:true});let deny=true,failRefresh=false,attempts=0
 await page.route(url=>url.pathname.startsWith('/api/stations/101/'),async route=>{
  const method=route.request().method();let status=0
  if(method==='PUT'){attempts++;if(deny){deny=false;status=403}}
  if(method==='GET'&&failRefresh&&new URL(route.request().url()).pathname==='/api/stations/101/space-devices')status=503
  if(status)return route.fulfill({status,headers:{'access-control-allow-origin':'*'},json:{code:status,data:null,msg:status===403?'测试撤权':'测试刷新失败'}})
  return route.fallback()
 })
 await choose(page,'园区');await page.getByRole('button',{name:'重命名空间',exact:true}).click()
 const field=page.getByLabel('空间名称',{exact:true}),save=page.getByRole('button',{name:'保存空间',exact:true}),refresh=page.getByRole('button',{name:'刷新空间（保留草稿）',exact:true})
 await field.fill('恢复后保留的空间草稿');await save.click();await page.getByRole('alert').filter({hasText:'测试撤权'}).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(state.writes.length,0)
 await page.evaluate(()=>window.__revoke());await page.evaluate(()=>window.__restore());failRefresh=true
 await refresh.click();await page.getByRole('alert').filter({hasText:'测试刷新失败'}).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(await field.inputValue(),'恢复后保留的空间草稿')
 failRefresh=false;await refresh.click();await refresh.and(page.locator(':enabled')).waitFor()
 assert.equal(await save.isDisabled(),false)
 await page.evaluate(()=>window.__revoke());await refresh.click();await refresh.and(page.locator(':enabled')).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(await field.isDisabled(),true);assert.equal(attempts,1)
 await page.evaluate(()=>window.__restore());await save.click();await page.getByRole('status').filter({hasText:'空间配置已保存'}).waitFor()
 assert.equal(state.spaces[0].name,'恢复后保留的空间草稿');assert.equal(attempts,2);assert.deepEqual(state.errors,[])
})

test('space tree creates hierarchy, renames, moves and protects nonempty parents', {timeout:90000},async t=>{
 const{page,state}=await setup(t)
 await create(page,'一期');await choose(page,'一期');await create(page,'储能室','50',true);assert.equal(state.spaces[1].parentId,state.spaces[0].id)
 await choose(page,'储能室');await page.getByRole('button',{name:'重命名空间',exact:true}).click();await page.getByLabel('空间名称',{exact:true}).fill('配电室');await page.getByRole('button',{name:'保存空间',exact:true}).click();await page.getByRole('status').filter({hasText:'空间配置已保存'}).waitFor()
 await page.getByRole('button',{name:'移动空间',exact:true}).click();await page.getByLabel('上级空间',{exact:true}).selectOption('');await page.getByRole('button',{name:'保存空间',exact:true}).click();await page.getByRole('status').filter({hasText:'空间配置已保存'}).waitFor();assert.equal(state.spaces[1].parentId,null)
 await page.getByRole('button',{name:'移动空间',exact:true}).click();await page.getByLabel('上级空间',{exact:true}).selectOption(state.spaces[0].id);await page.getByRole('button',{name:'保存空间',exact:true}).click();await page.getByRole('status').filter({hasText:'空间配置已保存'}).waitFor()
 await choose(page,'一期');assert.equal(await page.getByRole('button',{name:'删除空间',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'移动空间',exact:true}).click();assert.equal(await page.getByLabel('上级空间',{exact:true}).locator(`option[value="${state.spaces[1].id}"]`).count(),0);assert.equal(await page.getByLabel('上级空间',{exact:true}).locator(`option[value="${state.spaces[0].id}"]`).count(),0);await page.getByRole('button',{name:'取消空间编辑',exact:true}).click()
 await choose(page,'配电室');await page.getByRole('button',{name:'删除空间',exact:true}).click();await page.getByRole('button',{name:'确认删除空间',exact:true}).click();await page.getByRole('status').filter({hasText:'空间已删除'}).waitFor();assert.equal(state.spaces.length,1)
 assert.deepEqual(state.errors,[])
})
test('space device server search and paging retain a batch, persist associations and explicitly unbind', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{existing:true,assigned:true});await choose(page,'园区')
 assert.equal(await page.getByRole('checkbox',{name:'选择设备设备2',exact:true}).isDisabled(),true)
 await page.getByRole('checkbox',{name:'选择设备设备1',exact:true}).check();await page.getByRole('button',{name:'下一页设备',exact:true}).click();await page.getByRole('checkbox',{name:'选择设备设备21',exact:true}).check();await page.getByRole('button',{name:'关联已选设备',exact:true}).click();await page.getByRole('status').filter({hasText:'设备关联已保存'}).waitFor()
 assert.deepEqual(state.writes.find(w=>w.p.endsWith('/devices')&&w.method==='PUT').body.deviceIds,['1','21']);assert.equal(state.spaces[0].deviceCount,2)
 await page.getByLabel('空间设备范围',{exact:true}).selectOption('current');await page.getByRole('button',{name:'解除关联设备1',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'删除空间',exact:true}).isDisabled(),true)
 await page.getByRole('button',{name:'刷新空间（保留草稿）',exact:true}).click();await page.getByRole('button',{name:'解除关联设备1',exact:true}).waitFor()
 const artifacts=path.join(__dirname,'../.figma/station-spaces');await fs.mkdir(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'mock-space-device-persisted-1280.png'),animations:'disabled'})
 for(const id of ['1','21']){await page.getByRole('button',{name:`解除关联设备${id}`,exact:true}).click();await page.getByRole('button',{name:'确认解除设备关联',exact:true}).click();await page.getByRole('status').filter({hasText:'设备关联已解除'}).waitFor()}
 await page.getByLabel('空间设备范围',{exact:true}).selectOption('unassigned');await page.getByLabel('搜索空间设备',{exact:true}).fill('DEV-025');await page.getByRole('button',{name:'搜索设备',exact:true}).click();await page.getByRole('checkbox',{name:'选择设备设备25',exact:true}).waitFor();assert.equal(await page.getByRole('checkbox').count(),1);assert.ok(state.reads.some(p=>p.includes('q=DEV-025')&&p.includes('unassigned=true')))
 assert.deepEqual(state.errors,[])
})
test('space conflict refresh preserves edits, cancels unrelated actions, and requires explicit discard', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{existing:true,fail:'rename'});await choose(page,'园区');await page.getByRole('button',{name:'重命名空间',exact:true}).click();await page.getByLabel('空间名称',{exact:true}).fill('我的名称');await page.getByRole('button',{name:'保存空间',exact:true}).click();await page.getByRole('alert').filter({hasText:'空间版本冲突'}).waitFor()
 assert.equal(await page.getByLabel('空间名称',{exact:true}).inputValue(),'我的名称');assert.equal(await page.getByRole('button',{name:'重命名空间',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'新增空间',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('treeitem',{name:'选择空间办公楼',exact:true}).isDisabled(),true)
 await page.getByRole('button',{name:'关闭空间管理',exact:true}).click();await page.getByRole('button',{name:'继续编辑配置',exact:true}).click();assert.equal(await page.getByLabel('空间名称',{exact:true}).inputValue(),'我的名称')
 await page.getByRole('button',{name:'刷新空间（保留草稿）',exact:true}).click();await page.getByRole('button',{name:'保存空间',exact:true}).click();await page.getByRole('status').filter({hasText:'空间配置已保存'}).waitFor();assert.equal(state.writes[1].body.expectedVersion,1);assert.equal(state.spaces[0].name,'我的名称')
 await page.getByRole('button',{name:'移动空间',exact:true}).click();await page.getByLabel('上级空间',{exact:true}).selectOption('space-b');await page.evaluate(()=>{window.__navResult=window.__navigate()});await page.getByRole('button',{name:'放弃配置修改',exact:true}).click();await page.getByText('空间管理已关闭',{exact:true}).waitFor();assert.equal(state.writes.length,2)
})
test('pending space mutation is single shot, and completion after unmount performs no follow-up reads', {timeout:90000},async t=>{
 const{page,state,release}=await setup(t,{existing:true,pending:true});await choose(page,'园区');await page.getByRole('button',{name:'重命名空间',exact:true}).click();await page.getByLabel('空间名称',{exact:true}).fill('保存中名称');await page.getByRole('button',{name:'保存空间',exact:true}).dblclick({force:true});await page.waitForTimeout(100);assert.equal(state.writes.length,1)
 await page.evaluate(()=>window.__revoke());assert.equal(await page.getByLabel('空间名称',{exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('空间名称',{exact:true}).inputValue(),'保存中名称')
 const count=state.reads.length;await page.evaluate(()=>window.__unmount());const completed=page.waitForResponse(r=>r.request().method()==='PUT');release();await completed;await page.waitForTimeout(150);assert.equal(state.reads.length,count);await page.getByText('空间管理已关闭',{exact:true}).waitFor();assert.deepEqual(state.errors,[])
})
test('space selection refresh removes moved devices visibly and demo never calls API', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{existing:true,fail:'assignment'});await choose(page,'园区');await page.getByRole('checkbox',{name:'选择设备设备1',exact:true}).check();await page.getByRole('button',{name:'关联已选设备',exact:true}).click();await page.getByRole('alert').filter({hasText:'空间版本冲突'}).waitFor();await page.getByRole('button',{name:'刷新空间（保留草稿）',exact:true}).click();await page.getByRole('status').filter({hasText:'已移出选择'}).waitFor();assert.equal(await page.getByRole('button',{name:'关联已选设备',exact:true}).count(),0);assert.equal(state.writes.length,1)
 const demo=await setup(t,{demo:true});await demo.page.getByText('演示模式：空间管理仅在 API 模式提供，此处不创建示例空间或设备。',{exact:true}).waitFor();assert.equal(await demo.page.evaluate(()=>window.__unexpectedCalls||0),0);assert.deepEqual(demo.state.writes,[])
})
test('rename refresh adopts remote parent changes without losing name or implicitly moving the space', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{existing:true})
 state.spaces[1].parentId='space-a'
 await page.getByRole('button',{name:'刷新空间（保留草稿）',exact:true}).click()
 await choose(page,'办公楼');await page.getByRole('button',{name:'重命名空间',exact:true}).click();await page.getByLabel('空间名称',{exact:true}).fill('保留的重命名')
 state.spaces[1].parentId=null;state.spaces[1].version=2;state.spaces=state.spaces.filter(space=>space.id!=='space-a')
 await page.getByRole('button',{name:'保存空间',exact:true}).click();await page.getByRole('alert').filter({hasText:'空间版本冲突'}).waitFor()
 await page.getByRole('button',{name:'刷新空间（保留草稿）',exact:true}).click()
 assert.equal(await page.getByLabel('空间名称',{exact:true}).inputValue(),'保留的重命名')
 await page.getByRole('button',{name:'保存空间',exact:true}).and(page.locator(':enabled')).waitFor()
 assert.equal(await page.getByRole('button',{name:'保存空间',exact:true}).isDisabled(),false)
 await page.getByRole('button',{name:'保存空间',exact:true}).click();await page.getByRole('status').filter({hasText:'空间配置已保存'}).waitFor()
 const last=state.writes.at(-1);assert.equal(last.p,'spaces/space-b');assert.deepEqual(last.body,{name:'保留的重命名',expectedVersion:2});assert.equal(state.spaces[0].parentId,null);assert.equal(state.spaces[0].name,'保留的重命名')
})
