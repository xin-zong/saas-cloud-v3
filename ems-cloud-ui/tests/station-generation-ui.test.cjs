const test = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const preview = process.env.GENERATION_PREVIEW_URL || 'http://127.0.0.1:8444'
const months = () => Array.from({length:12},(_,i)=>({month:i+1,plannedKwh:'1.00',excellentKwh:null}))
async function setup(t,options={}) {
 const browser = await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close())
 const page = await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(7000)
 page.on('pageerror',error=>console.error('generation harness:',error.message))
 const writes = [], records = options.existing ? [{id:'11111111-1111-4111-8111-111111111111',stationId:'101',year:2026,months:months(),version:1}] : []
 let fail = options.fail, conflict=options.conflict;let release;const pending = new Promise(r=>release=r)
 await page.route('**/src/main.tsx*',async r=>{
 const source=await(await r.fetch()).text()
 const react=source.match(/["']([^"']*\/react\.js\?v=[^"']+)["']/)?.[1]
 const dom=source.match(/["']([^"']*\/react-dom_client\.js\?v=[^"']+)["']/)?.[1]
 assert.ok(react&&dom,'Use the live Vite dependency versions to share the app React instance')
 await r.fulfill({contentType:'text/javascript',body:`
 import React from '${react}';import ReactDOM from'${dom}';
 import Panel from '/src/components/StationGenerationPlansPanel.tsx';import'/src/index.css';import'/src/components/station-provision/station-entry.css';
 function Harness(){const[open,setOpen]=React.useState(true);const[canEdit,setCanEdit]=React.useState(${options.readOnly?'false':'true'});const guard=React.useRef(null);const register=React.useCallback(g=>{guard.current=g},[]);
 window.__revoke=()=>setCanEdit(false);window.__restore=()=>setCanEdit(true);window.__navigate=async()=>{const allowed=guard.current?await guard.current():true;if(allowed)setOpen(false);return allowed};
 return React.createElement('div',{className:'station-entry-scope'},open?React.createElement(Panel,{station:{id:'101',name:'测试站点'},canEdit,onClose:()=>setOpen(false),registerLeaveGuard:register}):React.createElement('p',null,'已关闭计划'));}
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));`})})
 if(options.demo)await page.route('**/src/api/client.ts*',r=>r.fulfill({contentType:'text/javascript',body:`export const DEMO_MODE=true;export class ApiError extends Error{};export function api(){window.__unexpectedCalls=(window.__unexpectedCalls||0)+1;throw Error('demo network prohibited')}export const send=api;`}))
 await page.route(url=>url.pathname.startsWith('/api/'),async r=>{
  const request=r.request(),method=request.method(),url=new URL(request.url());let status=200,data=records,msg='ok'
  if(method==='OPTIONS'){await r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization'}});return}
  if(!url.pathname.includes('/generation-plans'))throw new Error(`Unexpected API ${url.pathname}`)
  if(method!=='GET'){
   const body=request.postData()?request.postDataJSON():null;writes.push({method,body,url:url.pathname+url.search})
   if(options.pending)await pending
   if(conflict){conflict=false;records[0].version=2;records[0].months[0].plannedKwh='999.00';status=409;msg='版本冲突'}
   else if(fail){fail=false;status=500;msg='测试保存失败'}
   else if(method==='POST'){data={id:'22222222-2222-4222-8222-222222222222',stationId:'101',year:body.year,months:body.months,version:1};records.push(data)}
   else if(method==='PUT'){assert.equal(body.expectedVersion,records[0].version);data={...records[0],months:body.months,version:records[0].version+1};records[0]=data}
   else if(method==='DELETE'){records.splice(0);data=null}
  }
  await r.fulfill({status,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify({code:status,msg,data})})
 })
 await page.goto(preview,{waitUntil:'domcontentloaded',timeout:60000})
 return {page,writes,records,release}
}
test('403 recovery requires successful refresh, preserves generation draft and still respects canEdit',async t=>{
 const{page,writes,records}=await setup(t,{existing:true});let deny=true,failRefresh=false,attempts=0
 await page.route(url=>url.pathname.includes('/generation-plans'),async route=>{
  const method=route.request().method();let status=0
  if(method==='PUT'){attempts++;if(deny){deny=false;status=403}}
  if(method==='GET'&&failRefresh)status=503
  if(status)return route.fulfill({status,headers:{'access-control-allow-origin':'*'},json:{code:status,data:null,msg:status===403?'测试撤权':'测试刷新失败'}})
  return route.fallback()
 })
 await page.getByRole('button',{name:'编辑2026年计划',exact:true}).click()
 const field=page.getByLabel('1月常规计划（kWh）',{exact:true}),save=page.getByRole('button',{name:'保存年度计划',exact:true}),refresh=page.getByRole('button',{name:'刷新计划（保留草稿）',exact:true})
 await field.fill('42.12');await save.click();await page.getByRole('alert').filter({hasText:'测试撤权'}).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(writes.length,0)
 await page.evaluate(()=>window.__revoke());await page.evaluate(()=>window.__restore());failRefresh=true
 await refresh.click();await page.getByRole('alert').filter({hasText:'测试刷新失败'}).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(await field.inputValue(),'42.12')
 failRefresh=false;await refresh.click();await refresh.and(page.locator(':enabled')).waitFor()
 assert.equal(await save.isDisabled(),false)
 await page.evaluate(()=>window.__revoke());await refresh.click();await refresh.and(page.locator(':enabled')).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(await field.isDisabled(),true);assert.equal(attempts,1)
 await page.evaluate(()=>window.__restore());await save.click();await page.getByRole('status').filter({hasText:'已保存'}).waitFor()
 assert.equal(records[0].months[0].plannedKwh,'42.12');assert.equal(attempts,2);assert.equal(writes.length,1)
})

test('creates only after all twelve exact kWh values validate and survives refresh',async t=>{
 const{page,writes}=await setup(t)
 await page.getByRole('button',{name:'新增年度计划',exact:true}).click()
 await page.getByRole('button',{name:'保存年度计划',exact:true}).click()
 await page.getByRole('alert').waitFor();assert.equal(writes.length,0)
 for(let month=1;month<=12;month++)await page.getByLabel(`${month}月常规计划（kWh）`,{exact:true}).fill(month===1?'99999999.99':'1.2')
 await page.getByLabel('1月卓越计划（kWh）',{exact:true}).fill('0.01')
 await page.getByRole('button',{name:'保存年度计划',exact:true}).click()
 await page.getByRole('status').filter({hasText:'已保存'}).waitFor()
 assert.equal(writes.length,1);assert.equal(writes[0].body.months[0].plannedKwh,'99999999.99');assert.equal(writes[0].body.months[1].plannedKwh,'1.20')
 await page.getByRole('button',{name:'刷新计划（保留草稿）',exact:true}).click()
 await page.getByRole('button',{name:/编辑\d+年计划/}).click()
 assert.equal(await page.getByLabel('1月常规计划（kWh）',{exact:true}).inputValue(),'99999999.99')
 assert.equal(await page.getByLabel('计划年份',{exact:true}).isDisabled(),true)
 if(process.env.GENERATION_SCREENSHOT)await page.screenshot({path:process.env.GENERATION_SCREENSHOT,fullPage:true})
})
test('failure and conflict preserve months; close and navigation require explicit discard',async t=>{
 const{page,writes}=await setup(t,{existing:true,conflict:true})
 await page.getByRole('button',{name:'编辑2026年计划',exact:true}).click()
 await page.getByLabel('1月常规计划（kWh）',{exact:true}).fill('42.12')
 await page.getByRole('button',{name:'保存年度计划',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'版本冲突'}).waitFor()
 assert.equal(await page.getByLabel('1月常规计划（kWh）',{exact:true}).inputValue(),'42.12')
 await page.getByRole('button',{name:'刷新计划（保留草稿）',exact:true}).click()
 await page.getByRole('button',{name:'保存年度计划',exact:true}).click()
 await page.getByRole('status').filter({hasText:'已保存'}).waitFor()
 assert.equal(writes[1].body.expectedVersion,2);assert.equal(writes[1].body.months[0].plannedKwh,'42.12');assert.equal('year'in writes[1].body,false)
 await page.getByRole('button',{name:'编辑2026年计划',exact:true}).click();await page.getByLabel('2月常规计划（kWh）',{exact:true}).fill('9.99')
 await page.getByRole('button',{name:'关闭计划',exact:true}).click()
 await page.getByRole('button',{name:'继续编辑配置',exact:true}).click()
 assert.equal(await page.getByLabel('2月常规计划（kWh）',{exact:true}).inputValue(),'9.99')
 await page.evaluate(()=>{window.__navigationResult=window.__navigate()})
 await page.getByRole('button',{name:'放弃配置修改',exact:true}).click()
 await page.getByText('已关闭计划',{exact:true}).waitFor()
 assert.equal(writes.length,2)
})
test('pending writes cannot repeat and revocation keeps drafts while disabling changes',async t=>{
 const{page,writes,release}=await setup(t,{existing:true,pending:true})
 await page.getByRole('button',{name:'编辑2026年计划',exact:true}).click();await page.getByLabel('1月常规计划（kWh）',{exact:true}).fill('8.88')
 await page.getByRole('button',{name:'保存年度计划',exact:true}).dblclick({force:true})
 await page.waitForTimeout(150);assert.equal(writes.length,1)
 assert.equal(await page.getByRole('button',{name:'保存年度计划',exact:true}).isDisabled(),true)
 release();await page.getByRole('status').filter({hasText:'已保存'}).waitFor()
 await page.getByRole('button',{name:'编辑2026年计划',exact:true}).click();await page.getByLabel('1月常规计划（kWh）',{exact:true}).fill('7.77')
 await page.evaluate(()=>window.__revoke());await page.waitForTimeout(50)
 assert.equal(await page.getByLabel('1月常规计划（kWh）',{exact:true}).inputValue(),'7.77')
 assert.equal(await page.getByLabel('1月常规计划（kWh）',{exact:true}).isDisabled(),true)
 assert.equal(await page.getByRole('button',{name:'保存年度计划',exact:true}).isDisabled(),true)
 assert.equal(writes.length,1)
})
test('server failures retain drafts and demo mode performs no service requests',async t=>{
 const{page,writes}=await setup(t,{existing:true,fail:true})
 await page.getByRole('button',{name:'编辑2026年计划',exact:true}).click();await page.getByLabel('1月常规计划（kWh）',{exact:true}).fill('5.55')
 await page.getByRole('button',{name:'保存年度计划',exact:true}).click();await page.getByRole('alert').filter({hasText:'测试保存失败'}).waitFor()
 assert.equal(await page.getByLabel('1月常规计划（kWh）',{exact:true}).inputValue(),'5.55');assert.equal(writes.length,1)
 const demo=await setup(t,{demo:true});await demo.page.getByText(/演示模式.*服务不可用/).waitFor()
 assert.equal(demo.writes.length,0);assert.equal(await demo.page.evaluate(()=>window.__unexpectedCalls||0),0)
})
test('deletion is explicit and read-only details never expose enabled writes',async t=>{
 const{page,writes}=await setup(t,{existing:true})
 await page.getByRole('button',{name:'删除2026年计划',exact:true}).click()
 await page.getByRole('button',{name:'取消删除计划',exact:true}).click();assert.equal(writes.length,0)
 await page.getByRole('button',{name:'删除2026年计划',exact:true}).click()
 await page.getByRole('button',{name:'确认删除年度计划',exact:true}).click()
 await page.getByText('暂无年度发电计划',{exact:true}).waitFor()
 assert.equal(writes.length,1);assert.equal(writes[0].method,'DELETE');assert.match(writes[0].url,/expectedVersion=1$/)
 const read=await setup(t,{existing:true,readOnly:true})
 assert.equal(await read.page.getByRole('button',{name:'新增年度计划',exact:true}).count(),0)
 await read.page.getByRole('button',{name:'查看2026年计划',exact:true}).click()
 assert.equal(await read.page.getByLabel('1月常规计划（kWh）',{exact:true}).isDisabled(),true)
 assert.equal(await read.page.getByRole('button',{name:'保存年度计划',exact:true}).isDisabled(),true)
 assert.equal(read.writes.length,0)
})
