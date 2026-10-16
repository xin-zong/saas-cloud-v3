const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path')
const {chromium}=require('playwright')
const preview=process.env.REPORT_TEMPLATES_PREVIEW_URL||'http://127.0.0.1:8444'
const catalog={schemaVersion:1,timeTypes:[{code:'day',label:'日'},{code:'month',label:'月'},{code:'year',label:'年'},{code:'range',label:'日期范围'}],fields:[...['stationId','from','to','generatedAt'].map((code,i)=>({code:`meta.${code}`,label:['站点标识','开始时间','结束时间','生成时间'][i],group:'报告信息',locked:true,linkRef:[]})),{code:'summary.revenue',label:'确认收益',group:'摘要',locked:false,linkRef:[]},{code:'section.revenue.currency',label:'币种',group:'收益明细',locked:false,linkRef:[]},{code:'section.revenue.amount',label:'账单金额',group:'收益明细',locked:false,linkRef:['section.revenue.currency']}]}
const fields=catalog.fields.map(f=>f.code)
const template=(id,name,origin='custom',timeType='range')=>({id,name,kind:'revenue',timeType,origin,fields:[...fields],schemaVersion:1,version:1})
async function setup(t,options={}){
 const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1280,height:1000},acceptDownloads:true});page.setDefaultTimeout(12000);page.setDefaultNavigationTimeout(60000)
 const state={templates:catalog.timeTypes.map(type=>template(`sys-${type.code}`,`系统${type.label}报`,'system',type.code)),catalog:structuredClone(catalog),jobs:[],writes:[],reads:[],errors:[],fail:options.fail,serial:0}
 if(options.existing)state.templates.push(template('custom-1','我的月报','custom',options.center?'month':'range'))
 if(options.capacity)for(let i=0;i<10;i++)state.templates.push({...template(`custom-${i}`,`模板${i}`),kind:options.otherOnly?'health':i%2?'health':'revenue'})
 let release;const pending=new Promise(resolve=>release=resolve)
 page.on('pageerror',e=>state.errors.push(e.message));await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort())
 let reactUrl
 await page.route('**/src/auth/AuthContext.tsx*',r=>r.fulfill({contentType:'text/javascript',body:`export function useAuth(){return {user:window.__reportUser}}`}))
 await page.route('**/src/main.tsx*',async r=>{
  const source=await(await r.fetch()).text(),react=source.match(/["']([^"']*\/react\.js\?v=[^"']+)["']/)?.[1],dom=source.match(/["']([^"']*\/react-dom_client\.js\?v=[^"']+)["']/)?.[1];reactUrl=react;assert.ok(react&&dom)
  await r.fulfill({contentType:'text/javascript',body:`import React from '${react}';import ReactDOM from '${dom}';import Component from '/src/components/${options.center?'ApiAnalyticsPage':'ReportTemplatesPanel'}.tsx';import '/src/index.css';
  window.__reportUser={id:'7',account:'report@test',permissions:['report.export','revenue.read'],stationPermissions:{'101':['report.export','revenue.read']}};
  function Harness(){const[open,setOpen]=React.useState(true),[canEdit,setCanEdit]=React.useState(true);const guard=React.useRef(null),register=React.useCallback(g=>guard.current=g,[]);window.__revoke=()=>setCanEdit(false);window.__restore=()=>setCanEdit(true);window.__unmount=()=>setOpen(false);window.__navigate=async()=>{if(!guard.current||await guard.current())setOpen(false)};return open?React.createElement(Component,${options.center?`{stations:[{id:'101',name:'报表测试站点'}],allowedTabs:['报告中心'],allowedReportTypes:['收益报告'],role:'owner',registerLeaveGuard:register}`:`{kind:'revenue',canEdit,onClose:()=>setOpen(false),registerLeaveGuard:register}`}):React.createElement('p',null,'报表页面已关闭')};ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));`})
 })
 const report=(job)=>{const selected=job.templateSnapshot?.fields??fields;return {job,summary:selected.includes('summary.revenue')?[{label:'确认收益',value:'125',unit:'CNY'}]:[],sections:[{title:'收益明细',columns:[...(selected.includes('section.revenue.amount')?[{key:'amount',label:'账单金额'}]:[]),...(selected.includes('section.revenue.currency')?[{key:'currency',label:'币种'}]:[])],rows:[{amount:'88.88',currency:'CNY'}]}].filter(section=>section.columns.length)}}
 await page.route(url=>url.pathname.startsWith('/api/'),async r=>{
  const req=r.request(),method=req.method(),url=new URL(req.url()),p=url.pathname.slice(4),body=req.postData()?req.postDataJSON():null
  const reply=(data,status=200,msg='ok')=>r.fulfill({status,headers:{'access-control-allow-origin':'*'},json:{code:status,data,msg}})
  if(method==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization'}})
  if(method==='GET')state.reads.push(p)
  else{state.writes.push({p,method,body});if(options.pending)await pending;if(state.fail){state.fail=null;const item=state.templates.find(t=>t.id==='custom-1');if(item){item.version++;item.name='远端名称'}return reply(null,409,'模板版本冲突')}}
  if(p==='/report-template-fields')return reply(state.catalog)
  if(p==='/report-templates'&&method==='GET')return reply(state.templates.filter(t=>(!url.searchParams.get('kind')||t.kind===url.searchParams.get('kind'))&&(!url.searchParams.get('timeType')||t.timeType===url.searchParams.get('timeType'))))
  if(p==='/report-templates'&&method==='POST'){const row={id:`new-${++state.serial}`,...body,origin:'custom',schemaVersion:1,version:1};state.templates.push(row);return reply(row)}
  if(p.startsWith('/report-templates/')){
   const id=decodeURIComponent(p.split('/')[2]),row=state.templates.find(t=>t.id===id);if(!row)return reply(null,404,'模板已删除')
   if(p.endsWith('/clone')){assert.equal(body.expectedVersion,row.version);const copy={...structuredClone(row),id:`new-${++state.serial}`,name:body.name,origin:'custom',version:1};state.templates.push(copy);return reply(copy)}
   if(row.origin==='system')return reply(null,403,'系统模板只读')
   if(method==='PUT'){assert.equal(body.expectedVersion,row.version);Object.assign(row,body,{version:row.version+1});delete row.expectedVersion;return reply(row)}
   if(method==='DELETE'){assert.equal(Number(url.searchParams.get('expectedVersion')),row.version);state.templates=state.templates.filter(t=>t.id!==id);return reply(null)}
  }
  if(p==='/stations/101/analysis-jobs'){
   if(method==='GET')return reply(state.jobs)
   const current=body.templateId?state.templates.find(t=>t.id===body.templateId):null
   if(body.templateId&&(!current||current.version!==body.expectedTemplateVersion))return reply(null,409,'模板版本冲突')
   const snapshot=current?Object.fromEntries(['id','name','kind','timeType','fields','schemaVersion','version'].map(key=>[key,structuredClone(current[key])])):null
   const job={id:`job-${state.jobs.length+1}`,stationId:'101',...body,minutes:null,pointIds:[],status:'completed',createdAt:'2026-10-16T00:00:00Z',completedAt:'2026-10-16T00:00:01Z',error:null,templateSnapshot:snapshot};state.jobs.unshift(job);return reply(job)
  }
  if(p.startsWith('/analysis-jobs/')){
   const job=state.jobs.find(j=>j.id===p.split('/')[2]);if(!job)return reply(null,404,'任务不存在')
   if(p.endsWith('/download')){const result=report(job);return r.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'text/csv',body:`template_name,${job.templateSnapshot?.name??''}\n${result.summary.map(item=>`${item.label},${item.value}\n`).join('')}${result.sections.map(section=>`${section.columns.map(c=>c.label).join(',')}\n${section.columns.map(c=>String(section.rows[0][c.key])).join(',')}\n`).join('')}`})}
   return reply(report(job))
  }
  return reply([])
 })
 await page.goto(preview,{waitUntil:'domcontentloaded'})
 if(options.capacity)await page.getByText('已达到私人模板总数上限 10 个，可编辑已有模板或先删除不再使用的模板。',{exact:true}).waitFor()
 else await page.getByRole('button',{name:options.center?'报表模板管理':'新增报表模板',exact:true}).and(page.locator(':enabled')).waitFor()
 return{page,state,release}
}
async function closePanel(page){await page.getByRole('button',{name:'关闭报表模板',exact:true}).click()}

test('403 recovery requires successful refresh, preserves report draft and still respects canEdit', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{existing:true});let deny=true,failRefresh=false,attempts=0
 await page.route(url=>url.pathname.startsWith('/api/report-template'),async route=>{
  const method=route.request().method();let status=0
  if(method==='PUT'){attempts++;if(deny){deny=false;status=403}}
  if(method==='GET'&&failRefresh&&new URL(route.request().url()).pathname==='/api/report-template-fields')status=503
  if(status)return route.fulfill({status,headers:{'access-control-allow-origin':'*'},json:{code:status,data:null,msg:status===403?'测试撤权':'测试刷新失败'}})
  return route.fallback()
 })
 await page.getByRole('button',{name:'编辑我的月报',exact:true}).click()
 const field=page.getByLabel('报表模板名称',{exact:true}),save=page.getByRole('button',{name:'保存报表模板',exact:true}),refresh=page.getByRole('button',{name:'刷新模板与目录（保留草稿）',exact:true})
 await field.fill('恢复后保留的报表草稿');await save.click();await page.getByRole('alert').filter({hasText:'测试撤权'}).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(state.writes.length,0)
 await page.evaluate(()=>window.__revoke());await page.evaluate(()=>window.__restore());failRefresh=true
 await refresh.click();await page.getByRole('alert').filter({hasText:'测试刷新失败'}).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(await field.inputValue(),'恢复后保留的报表草稿')
 failRefresh=false;await refresh.click();await refresh.and(page.locator(':enabled')).waitFor()
 assert.equal(await save.isDisabled(),false)
 await page.evaluate(()=>window.__revoke());await refresh.click();await refresh.and(page.locator(':enabled')).waitFor()
 assert.equal(await save.isDisabled(),true);assert.equal(await field.isDisabled(),true);assert.equal(attempts,1)
 await page.evaluate(()=>window.__restore());await save.click();await page.getByRole('status').filter({hasText:'报表模板已保存'}).waitFor()
 assert.equal(state.templates.find(t=>t.id==='custom-1').name,'恢复后保留的报表草稿');assert.equal(attempts,2);assert.deepEqual(state.errors,[])
})
test('report template generic catalog dependencies persist in private CRUD and refresh', {timeout:90000},async t=>{
 const{page,state}=await setup(t);assert.equal(state.writes.length,0);await page.getByRole('button',{name:'新增报表模板',exact:true}).click();await page.getByLabel('报表模板名称',{exact:true}).fill('私人月报');await page.getByLabel('模板周期',{exact:true}).selectOption('month');assert.equal(await page.getByRole('checkbox',{name:'站点标识',exact:true}).isDisabled(),true);await page.getByRole('checkbox',{name:'账单金额',exact:true}).check();assert.equal(await page.getByRole('checkbox',{name:'币种',exact:true}).isChecked(),true);await page.getByRole('button',{name:'保存报表模板',exact:true}).click();await page.getByRole('status').filter({hasText:'报表模板已保存'}).waitFor();assert.ok(state.writes[0].body.fields.includes('meta.stationId'));assert.ok(state.writes[0].body.fields.includes('section.revenue.currency'))
 await page.getByRole('button',{name:'刷新模板与目录（保留草稿）',exact:true}).click();await page.getByRole('button',{name:'编辑私人月报',exact:true}).click();assert.equal(await page.getByLabel('模板周期',{exact:true}).inputValue(),'month');assert.equal(await page.getByRole('checkbox',{name:'账单金额',exact:true}).isChecked(),true);await page.getByLabel('报表模板名称',{exact:true}).fill('改名月报');await page.getByRole('checkbox',{name:'币种',exact:true}).uncheck();assert.equal(await page.getByRole('checkbox',{name:'账单金额',exact:true}).isChecked(),false);await page.getByRole('button',{name:'保存报表模板',exact:true}).click();await page.getByRole('status').filter({hasText:'报表模板已保存'}).waitFor();assert.equal('kind'in state.writes[1].body,false)
 await page.getByRole('button',{name:'删除改名月报',exact:true}).click();await page.getByRole('button',{name:'确认删除报表模板',exact:true}).click();await page.getByRole('status').filter({hasText:'私人模板已删除'}).waitFor();assert.equal(state.templates.filter(t=>t.origin==='custom').length,0);assert.deepEqual(state.errors,[])
})
test('system report templates are readonly and clone only explicitly within total ten private limit', {timeout:90000},async t=>{
 const{page,state}=await setup(t);assert.equal(await page.getByRole('button',{name:'编辑系统日期范围报',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'删除系统日期范围报',exact:true}).count(),0);await page.getByRole('button',{name:'另存系统月报',exact:true}).click();await page.getByLabel('报表模板名称',{exact:true}).fill('系统副本');assert.equal(await page.getByLabel('模板周期',{exact:true}).isDisabled(),true);assert.equal(await page.getByRole('checkbox',{name:'账单金额',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'确认另存模板',exact:true}).click();await page.getByRole('status').filter({hasText:'已另存为私人模板'}).waitFor();assert.deepEqual(state.writes[0].body,{name:'系统副本',expectedVersion:1});assert.equal(state.templates.find(t=>t.name==='系统副本').origin,'custom')
 const capped=await setup(t,{capacity:true});assert.equal(await capped.page.getByRole('button',{name:'新增报表模板',exact:true}).isDisabled(),true);assert.equal(await capped.page.getByRole('button',{name:'另存系统月报',exact:true}).isDisabled(),true);assert.equal(capped.state.writes.length,0)
})
test('template failures preserve draft and version refresh, close navigation and revocation protect changes', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{existing:true,fail:true});await page.getByRole('button',{name:'编辑我的月报',exact:true}).click();await page.getByLabel('报表模板名称',{exact:true}).fill('保留名称');await page.getByRole('button',{name:'保存报表模板',exact:true}).click();await page.getByRole('alert').filter({hasText:'模板版本冲突'}).waitFor();assert.equal(await page.getByLabel('报表模板名称',{exact:true}).inputValue(),'保留名称');assert.equal(await page.getByRole('button',{name:'另存系统月报',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'关闭报表模板',exact:true}).click();await page.getByRole('button',{name:'继续编辑配置',exact:true}).click();await page.getByRole('button',{name:'刷新模板与目录（保留草稿）',exact:true}).click();await page.getByRole('button',{name:'保存报表模板',exact:true}).click();await page.getByRole('status').filter({hasText:'报表模板已保存'}).waitFor();assert.equal(state.writes[1].body.expectedVersion,2)
 await page.getByRole('button',{name:'编辑保留名称',exact:true}).click();await page.getByLabel('报表模板名称',{exact:true}).fill('撤权后草稿');await page.evaluate(()=>window.__revoke());assert.equal(await page.getByLabel('报表模板名称',{exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'保存报表模板',exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('报表模板名称',{exact:true}).inputValue(),'撤权后草稿');await page.evaluate(()=>{window.__nav=window.__navigate()});await page.getByRole('button',{name:'放弃配置修改',exact:true}).click();await page.getByText('报表页面已关闭',{exact:true}).waitFor();assert.equal(state.writes.length,2)
})
test('template duplicate save is locked and completed request after unmount does not read or update panel', {timeout:90000},async t=>{
 const{page,state,release}=await setup(t,{pending:true});await page.getByRole('button',{name:'新增报表模板',exact:true}).click();await page.getByLabel('报表模板名称',{exact:true}).fill('保存中');await page.getByRole('button',{name:'保存报表模板',exact:true}).dblclick({force:true});await page.waitForTimeout(100);assert.equal(state.writes.length,1);const count=state.reads.length;await page.evaluate(()=>window.__unmount());const response=page.waitForResponse(r=>r.request().method()==='POST');release();await response;await page.waitForTimeout(100);assert.equal(state.reads.length,count);assert.deepEqual(state.errors,[])
})
test('selected template generates real job snapshot shown by preview and server CSV after template deletion', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{center:true,existing:true});assert.equal(state.writes.length,0);await page.getByLabel('报告周期选择',{exact:true}).selectOption('month');await page.getByLabel('生成报表模板',{exact:true}).selectOption('custom-1');await page.getByLabel('报告月份',{exact:true}).fill('2024-02');await page.getByRole('button',{name:'生成报告',exact:true}).click();const dialog=page.getByRole('dialog',{name:'报告正文预览',exact:true});await dialog.waitFor();await dialog.getByText('我的月报',{exact:true}).waitFor();await dialog.getByRole('cell',{name:'88.88',exact:true}).waitFor();const generated=state.writes.find(w=>w.p.endsWith('/analysis-jobs'));assert.equal(generated.body.templateId,'custom-1');assert.equal(generated.body.expectedTemplateVersion,1);assert.equal('pointIds'in generated.body,false);assert.equal(generated.body.from,'2024-01-31T16:00:00.000Z');assert.equal(generated.body.to,'2024-02-29T16:00:00.000Z')
 const artifacts=path.join(__dirname,'../.figma/report-templates');await fs.mkdir(artifacts,{recursive:true});await page.screenshot({path:path.join(artifacts,'mock-report-template-snapshot-1280.png'),animations:'disabled'})
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'报表模板管理',exact:true}).click();await page.getByRole('button',{name:'删除我的月报',exact:true}).click();await page.getByRole('button',{name:'确认删除报表模板',exact:true}).click();await page.getByRole('status').filter({hasText:'私人模板已删除'}).waitFor();await closePanel(page);await page.getByRole('button',{name:'预览',exact:true}).click();await dialog.waitFor();await dialog.getByText('我的月报',{exact:true}).waitFor();const downloaded=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载 CSV 报告',exact:true}).click();const csv=await fs.readFile(await(await downloaded).path(),'utf8');assert.match(csv,/我的月报/);assert.match(csv,/88\.88/);assert.match(csv,/账单金额/);assert.equal(state.jobs[0].templateSnapshot.name,'我的月报');assert.deepEqual(state.errors,[])
})
test('report period controls retain legacy no-template requests and reject excessive ranges before posting', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{center:true});for(const[type,label,value,from,to]of[['day','报告日期','2026-10-16','2026-10-15T16:00:00.000Z','2026-10-16T16:00:00.000Z'],['year','报告年份','2024','2023-12-31T16:00:00.000Z','2024-12-31T16:00:00.000Z']]){await page.getByLabel('报告周期选择',{exact:true}).selectOption(type);await page.getByLabel(label,{exact:true}).fill(value);await page.getByRole('button',{name:'生成报告',exact:true}).click();const dialog=page.getByRole('dialog',{name:'报告正文预览',exact:true});await dialog.waitFor();const request=state.writes.filter(w=>w.p.endsWith('/analysis-jobs')).at(-1).body;assert.equal('templateId'in request,false);assert.equal('expectedTemplateVersion'in request,false);assert.equal(request.from,from);assert.equal(request.to,to);await dialog.getByRole('button',{name:'关闭',exact:true}).click()}
 await page.getByLabel('报告周期选择',{exact:true}).selectOption('range');await page.getByLabel('报告开始日期',{exact:true}).fill('2024-01-01');await page.getByLabel('报告结束日期',{exact:true}).fill('2026-12-31');const count=state.writes.length;await page.getByRole('button',{name:'生成报告',exact:true}).click();await page.getByRole('alert').filter({hasText:'366'}).waitFor();assert.equal(state.writes.length,count)
})
test('changing selected template period invalidates generation until explicit reselection', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{center:true,existing:true});await page.getByLabel('报告周期选择',{exact:true}).selectOption('month');await page.getByLabel('生成报表模板',{exact:true}).selectOption('custom-1');await page.getByRole('button',{name:'报表模板管理',exact:true}).click();await page.getByRole('button',{name:'编辑我的月报',exact:true}).click();await page.getByLabel('模板周期',{exact:true}).selectOption('range');await page.getByRole('button',{name:'保存报表模板',exact:true}).click();await page.getByRole('status').filter({hasText:'报表模板已保存'}).waitFor();await closePanel(page)
 assert.equal(await page.getByLabel('生成报表模板',{exact:true}).inputValue(),'custom-1');await page.getByRole('option',{name:'所选模板不可用，请重新选择',exact:true}).waitFor({state:'attached'});const count=state.writes.length;await page.getByRole('button',{name:'生成报告',exact:true}).click();await page.getByRole('alert').filter({hasText:'所选模板已变化或删除'}).waitFor();assert.equal(state.writes.length,count)
 await page.getByLabel('生成报表模板',{exact:true}).selectOption('');await page.getByRole('button',{name:'生成报告',exact:true}).click();await page.getByRole('dialog',{name:'报告正文预览',exact:true}).waitFor();assert.equal('templateId'in state.writes.at(-1).body,false)
})
test('catalog refresh preserves unknown draft fields visibly until explicit removal', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{existing:true});await page.getByRole('button',{name:'编辑我的月报',exact:true}).click();await page.getByLabel('报表模板名称',{exact:true}).fill('目录更新草稿');state.catalog.fields=state.catalog.fields.filter(field=>field.code!=='section.revenue.amount');await page.getByRole('button',{name:'刷新模板与目录（保留草稿）',exact:true}).click();await page.getByRole('alert').filter({hasText:'以下字段已不在目录中'}).waitFor();assert.equal(await page.getByLabel('报表模板名称',{exact:true}).inputValue(),'目录更新草稿');assert.equal(await page.getByRole('button',{name:'保存报表模板',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'移除失效字段',exact:true}).click();await page.getByRole('button',{name:'保存报表模板',exact:true}).click();await page.getByRole('status').filter({hasText:'报表模板已保存'}).waitFor();assert.equal(state.writes[0].body.fields.includes('section.revenue.amount'),false)
})
test('private capacity can be released after losing access to a different report kind without granting its data', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{capacity:true,otherOnly:true});assert.equal(await page.getByRole('button',{name:'新增报表模板',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'编辑模板0',exact:true}).count(),0)
 await page.getByRole('button',{name:'删除其他类型模板模板0',exact:true}).click();await page.getByRole('button',{name:'确认删除报表模板',exact:true}).click();await page.getByRole('status').filter({hasText:'私人模板已删除'}).waitFor();await page.getByRole('button',{name:'新增报表模板',exact:true}).and(page.locator(':enabled')).waitFor();assert.equal(state.templates.filter(row=>row.origin==='custom').length,9);assert.equal(state.writes.length,1);assert.equal(state.writes[0].method,'DELETE');assert.equal(state.writes[0].p,'/report-templates/custom-0')
})
test('report center forwards template draft guard to outer navigation without losing the draft', {timeout:90000},async t=>{
 const{page,state}=await setup(t,{center:true});await page.getByRole('button',{name:'报表模板管理',exact:true}).click();await page.getByRole('button',{name:'新增报表模板',exact:true}).click();await page.getByLabel('报表模板名称',{exact:true}).fill('跨页保留草稿');await page.evaluate(()=>{window.__nav=window.__navigate()});await page.getByRole('dialog',{name:'放弃配置草稿',exact:true}).waitFor();await page.getByRole('button',{name:'继续编辑配置',exact:true}).click();assert.equal(await page.getByLabel('报表模板名称',{exact:true}).inputValue(),'跨页保留草稿');assert.equal(state.writes.length,0);await page.evaluate(()=>{window.__nav=window.__navigate()});await page.getByRole('button',{name:'放弃配置修改',exact:true}).click();await page.getByText('报表页面已关闭',{exact:true}).waitFor();assert.deepEqual(state.errors,[])
})
