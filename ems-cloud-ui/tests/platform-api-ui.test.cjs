const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const fs = require('node:fs')
async function setup(t, permissions = ['organization.member.read','member.manage.profile','organization.manage','member.grant.manage'], options = {}) {
  const browser = await chromium.launch({ channel: 'msedge', headless: true }); t.after(() => browser.close())
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'platform-test'))
  const page = await context.newPage(); page.setDefaultTimeout(7000)
  const errors=[]; page.on('pageerror', e=>errors.push(e.message)); t.after(()=>assert.deepEqual(errors,[]))
  const orgs=[{id:3,name:'华东',parent_id:99,lead_user_id:null},{id:4,name:'子组织',parent_id:3,lead_user_id:9,...(options.nestedRoot?{can_reparent:false}:{}),...(options.hiddenLead?{lead_user_id:null,lead_restricted:true}:{})}]
  const members=[{id:9,account:'real.member',display_name:'真实成员',enabled:true,organization_id:4,management_organization_id:4,email:'member@example.com'},{id:10,account:'free.member',display_name:'待安排成员',enabled:true,organization_id:null,management_organization_id:3,email:null}]
  const requests=[]; let failProfile = options.failProfile, releaseSave; const heldSave = new Promise(resolve => { releaseSave = resolve })
  await page.route('http://127.0.0.1:18090/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(4),method=req.method(),body=req.postDataJSON()
    requests.push({path,method,search:url.search,body}); let data=[],status=200,msg='ok'
    if(path==='/auth/me') data={id:'7',name:'管理员',account:'manager',role:'integrator',organization:'华东',stationIds:[],permissions}
    else if(path==='/members' && method==='GET') data=members
    else if(path==='/members' && method==='POST') { data={id:11}; members.push({id:11,account:body.account,display_name:body.name,email:body.email,enabled:true,organization_id:body.organizationId,management_organization_id:body.managementOrganizationId??body.organizationId}) }
    else if(/^\/members\/\d+\/organization$/.test(path)) {const m=members.find(m=>m.id===Number(path.split('/')[2])); m.organization_id=body.organizationId; orgs.forEach(o=>{if(o.lead_user_id===m.id&&m.organization_id!==o.id)o.lead_user_id=null}); data=null}
    else if(/^\/members\/\d+$/.test(path)&&method==='PUT'&&failProfile){failProfile=false;status=409;msg='成员范围已变化';data=null}
    else if(/^\/members\/\d+$/.test(path)&&method==='PUT'){if(options.holdSave)await heldSave;const m=members.find(m=>m.id===Number(path.split('/')[2])); Object.assign(m,{display_name:body.name,email:body.email,enabled:body.enabled});data=null}
    else if(/^\/members\/\d+$/.test(path)&&method==='DELETE'){status=409;msg='成员存在业务或授权历史引用，请停用成员';data=null}
    else if(path.endsWith('/grants')) data=[]
    else if(path==='/platform/organizations'&&method==='GET') data=orgs
    else if(path==='/platform/organizations'&&method==='POST'){data={id:5};orgs.push({id:5,name:body.name,parent_id:body.parentId,lead_user_id:body.leadUserId})}
    else if(path.startsWith('/platform/organizations/')&&method==='PUT'){const o=orgs.find(o=>o.id===Number(path.split('/')[3]));Object.assign(o,{name:body.name,...(Object.hasOwn(body,"leadUserId")?{lead_user_id:body.leadUserId,lead_restricted:false}:{}),...(body.parentId==null?{}:{parent_id:body.parentId})});data=null}
    else {status=403;msg=`unexpected ${path}`}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,msg,data})})
  })
  await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:8445',{waitUntil:'domcontentloaded',timeout:60000})
  await page.getByRole('button',{name:'平台管理',exact:true}).click()
  return {page,requests,members,orgs,releaseSave}
}
const writes=requests=>requests.filter(r=>['POST','PUT','DELETE'].includes(r.method))
async function screenshot(page,name){if(process.env.PLATFORM_SCREENSHOTS){fs.mkdirSync(process.env.PLATFORM_SCREENSHOTS,{recursive:true});await page.screenshot({path:process.env.PLATFORM_SCREENSHOTS+'/'+name+'.png'})}}

test('profile-only operator creates unassigned member with explicit owner and edits email without grant access',async t=>{
  const {page,requests}=await setup(t,['member.manage.profile'])
  await page.getByText('真实成员',{exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'查看权限'}).count(),0)
  await page.getByRole('button',{name:'新增成员',exact:true}).click()
  await page.locator('input[name=name]').fill('新增成员甲');await page.locator('input[name=account]').fill('new.member')
  await page.locator('input[name=email]').fill('new@example.com');await page.locator('input[name=password]').fill('long-password-123')
  await page.locator('select[name=organizationId]').selectOption('')
  await page.locator('select[name=managementOrganizationId]').selectOption('3')
  await screenshot(page,'member-create')
  await page.getByRole('dialog').getByRole('button',{name:'创建',exact:true}).click()
  await page.getByText('新增成员甲',{exact:true}).waitFor()
  assert.deepEqual(writes(requests)[0].body,{account:'new.member',name:'新增成员甲',password:'long-password-123',email:'new@example.com',organizationId:null,managementOrganizationId:3})
  await page.getByRole('row').filter({hasText:'新增成员甲'}).getByRole('button',{name:'编辑',exact:true}).click()
  await page.locator('input[name=email]').fill('edit@example.com');await page.locator('select[name=enabled]').selectOption('false')
  await screenshot(page,'member-edit');await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('status').filter({hasText:'成员已更新'}).waitFor()
  assert.deepEqual(writes(requests)[1].body,{name:'新增成员甲',email:'edit@example.com',enabled:false})
  assert(requests.some(r=>r.path==='/members'&&r.search==='?purpose=profiles'))
  assert.equal(requests.filter(r=>r.path.endsWith('/grants')).length,0)
})

test('organization-only operator configures lead and adds or removes existing scoped members',async t=>{
  const {page,requests}=await setup(t,['organization.manage'])
  await page.getByRole('button',{name:'华东 / 子组织',exact:true}).click()
  await page.getByRole('heading',{name:'直属成员',exact:true}).waitFor()
  await page.getByRole('button',{name:'编辑组织',exact:true}).click()
  await page.locator('select[name=leadUserId]').selectOption('9');await screenshot(page,'organization-edit')
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await page.getByText('组织已更新').waitFor()
  assert.deepEqual(writes(requests)[0].body,{name:'子组织',parentId:3,leadUserId:9})
  await page.getByRole('button',{name:'添加已有成员',exact:true}).click()
  await page.getByLabel('搜索已有成员').fill('free.member');await page.locator('select[name=memberId]').selectOption('10')
  await screenshot(page,'organization-add');await page.getByRole('dialog').getByRole('button',{name:'添加',exact:true}).click()
  await page.getByRole('row').filter({hasText:'待安排成员'}).waitFor()
  assert.deepEqual(writes(requests)[1],{path:'/members/10/organization',method:'PUT',search:'',body:{organizationId:4}})
  await page.getByRole('row').filter({hasText:'真实成员'}).getByRole('button',{name:'移出组织',exact:true}).click()
  await page.getByRole('dialog').getByText('已有授权将保留',{exact:false}).waitFor();await page.getByRole('button',{name:'确认移出',exact:true}).click()
  await page.getByText('成员已移出组织').waitFor()
  assert.deepEqual(writes(requests)[2].body,{organizationId:null});assert.equal(writes(requests)[2].path,'/members/9/organization')
  await page.getByRole('row').filter({hasText:'真实成员'}).waitFor({state:'detached'});await page.getByRole('row').filter({hasText:'待安排成员'}).waitFor()
  await screenshot(page,'organization-overview')
  assert(requests.some(r=>r.path==='/members'&&r.search==='?purpose=organizations'))
  assert.equal(requests.filter(r=>r.path.endsWith('/grants')).length,0)
})

test('member filter, separate membership move, reference conflict and create then grant navigation',async t=>{
  const {page,requests}=await setup(t)
  await page.getByLabel('筛选所属组织').selectOption('unassigned')
  await page.getByText('待安排成员',{exact:true}).waitFor();assert.equal(await page.getByText('真实成员',{exact:true}).count(),0)
  await page.getByLabel('筛选所属组织').selectOption('')
  await page.getByRole('row').filter({hasText:'真实成员'}).getByRole('button',{name:'调整组织',exact:true}).click()
  await page.locator('select[name=organizationId]').selectOption('3');await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByText('成员组织已更新').waitFor();assert.deepEqual(writes(requests)[0].body,{organizationId:3})
  await page.getByRole('row').filter({hasText:'真实成员'}).getByRole('button',{name:'删除',exact:true}).click()
  await page.getByRole('button',{name:'确认删除',exact:true}).click();await page.getByRole('alert').getByText('请停用成员',{exact:false}).waitFor()
  await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'新增成员',exact:true}).click()
  await page.locator('input[name=name]').fill('新待授权');await page.locator('input[name=account]').fill('new.grant');await page.locator('input[name=password]').fill('long-password-123')
  await page.locator('select[name=organizationId]').selectOption('3');await page.getByRole('dialog').getByRole('button',{name:'创建',exact:true}).click()
  await page.getByRole('button',{name:'现在分配权限',exact:true}).click();await page.getByRole('button',{name:'分配权限',exact:true}).waitFor()
  assert(requests.some(r=>r.path==='/members/11/grants'&&r.method==='GET'))
  assert.equal(writes(requests).filter(r=>r.path.endsWith('/grants')).length,0)
})

test('read-only directories preserve role/site columns with no profile writes',async t=>{
  const {page,requests}=await setup(t,['organization.member.read'])
  await page.getByText('真实成员',{exact:true}).waitFor()
  await page.getByRole('columnheader',{name:'已分配角色',exact:true}).waitFor();await page.getByRole('columnheader',{name:'站点范围',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'新增成员',exact:true}).count(),0)
  assert.equal(await page.getByRole('button',{name:'编辑',exact:true}).count(),0)
  await screenshot(page,'member-overview');assert.equal(writes(requests).length,0)
})
// Customer maintenance contract migration remains T10's responsibility; grants are covered by member-grants-api-ui.test.cjs.


test('profile save errors keep draft and dirty close protects form until explicit discard',async t=>{
  const {page,requests}=await setup(t,['member.manage.profile'],{failProfile:true})
  await page.getByRole('row').filter({hasText:'真实成员'}).getByRole('button',{name:'编辑',exact:true}).click()
  await page.locator('input[name=name]').fill('保留草稿')
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('alert').getByText('成员范围已变化').waitFor()
  assert.equal(await page.locator('input[name=name]').inputValue(),'保留草稿')
  await page.getByRole('button',{name:'取消',exact:true}).click()
  await page.getByRole('heading',{name:'未保存的修改',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'继续编辑',exact:true}).evaluate(el=>el===document.activeElement),true)
  await page.getByRole('button',{name:'继续编辑',exact:true}).click()
  assert.equal(await page.locator('input[name=name]').inputValue(),'保留草稿')
  await page.getByRole('button',{name:'取消',exact:true}).click();await page.getByRole('button',{name:'放弃修改',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'detached'});assert.equal(writes(requests).length,1)
})

test('pending profile save blocks duplicate writes and closing the original context',async t=>{
  const {page,requests,releaseSave}=await setup(t,['member.manage.profile'],{holdSave:true});t.after(releaseSave)
  await page.getByRole('row').filter({hasText:'真实成员'}).getByRole('button',{name:'编辑',exact:true}).click()
  await page.locator('input[name=name]').fill('已保存姓名');await page.getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('button',{name:'正在保存…',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'取消',exact:true}).isDisabled(),true)
  assert.equal(await page.locator('input[name=name]').isDisabled(),true)
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),1)
  releaseSave();await page.getByRole('dialog').waitFor({state:'detached'})
  await page.getByText('已保存姓名',{exact:true}).waitFor();assert.equal(writes(requests).length,1)
})

test('authoritative nested management root disables parent move and preserves parent with null',async t=>{
  const {page,requests}=await setup(t,['organization.manage'],{nestedRoot:true})
  await page.getByRole('button',{name:'华东 / 子组织',exact:true}).click()
  await page.getByRole('button',{name:'编辑组织',exact:true}).click()
  assert.equal(await page.locator('select[name=parentId]').isDisabled(),true)
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('status').filter({hasText:'组织已更新'}).waitFor()
  assert.deepEqual(writes(requests)[0].body,{name:'子组织',parentId:null,leadUserId:9})
  await page.getByRole('button',{name:'新增子组织',exact:true}).click()
  await page.locator('input[name=name]').fill('下级组织')
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('button',{name:'华东 / 子组织 / 下级组织',exact:true}).waitFor()
  assert.deepEqual(writes(requests)[1].body,{name:'下级组织',parentId:4,leadUserId:null})
})

test('editing organization name preserves a hidden lead unless explicitly cleared',async t=>{
  const {page,requests}=await setup(t,['organization.manage'],{hiddenLead:true})
  await page.getByRole('button',{name:'华东 / 子组织',exact:true}).click()
  await page.getByRole('button',{name:'编辑组织',exact:true}).click()
  assert.equal(await page.locator('select[name=leadUserId]').inputValue(),'keep')
  await page.locator('input[name=name]').fill('更新组织名')
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('status').filter({hasText:'组织已更新'}).waitFor()
  assert.deepEqual(writes(requests)[0].body,{name:'更新组织名',parentId:3})
  await page.getByRole('button',{name:'编辑组织',exact:true}).click()
  await page.locator('select[name=leadUserId]').selectOption('')
  await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click()
  await page.getByRole('dialog').waitFor({state:'detached'})
  assert.equal(writes(requests)[1].body.leadUserId,null)
})
