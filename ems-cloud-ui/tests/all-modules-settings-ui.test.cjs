const {test}=require('node:test');const assert=require('node:assert/strict');const {chromium}=require('playwright');
async function setup(t,options={}){const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);page.setDefaultNavigationTimeout(60000);await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort());await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','task8'));let values={},fail=options.partial;const writes=[];let release;const gate=new Promise(r=>release=r);await page.route('http://127.0.0.1:18090/api/**',async r=>{const q=r.request(),path=new URL(q.url()).pathname.slice(4);let data=[],status=200,msg='ok';if(path==='/auth/me')data={id:'8',name:'真实账户',account:'settings@example.test',role:'integrator',stationIds:[],permissions:['role.manage']};else if(path==='/settings'){if(q.method()==='PUT'){const body=q.postDataJSON();writes.push(body);if(options.pending)await gate;if(fail&&body.key==='density'){fail=false;status=409;msg='设置并发冲突'}else values[body.key]=body.value;}data=values;}else if(path==='/auth/logout'){writes.push({logout:true});data=null}await r.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,msg,data})})});await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8461',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'保存配置',exact:true}).waitFor();return {page,writes,release};}
const category=(page,name)=>page.locator('.settings-category').filter({hasText:name}).click();
test('notification preferences use real writes without claiming delivery',async t=>{const {page,writes}=await setup(t);await category(page,'通知设置');await page.getByRole('button',{name:'全部级别',exact:true}).click();await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByText('偏好已保存至服务器',{exact:true}).waitFor();assert(writes.some(w=>w.key==='alarmScope'&&w.value==='全部级别'));await page.getByText(/不代表消息已送达/).waitFor();await page.reload();await page.getByRole('button',{name:'设置',exact:true}).click();await category(page,'通知设置');assert.equal(await page.getByRole('button',{name:'全部级别',exact:true}).getAttribute('aria-pressed'),'true')});
test('partial save keeps unconfirmed values and retry only writes remaining keys',async t=>{const {page,writes}=await setup(t,{partial:true});await page.getByRole('button',{name:'上次访问页面',exact:true}).click();await page.getByRole('button',{name:'紧凑',exact:true}).click();await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByRole('alert').filter({hasText:'设置并发冲突'}).waitFor();assert.equal(await page.getByRole('button',{name:'紧凑',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByText('偏好已保存至服务器',{exact:true}).waitFor();assert.equal(writes.filter(w=>w.key==='defaultEntry').length,1);assert.equal(writes.filter(w=>w.key==='density').length,2)});
test('category and outer navigation cancel retains draft while discard restores baseline',async t=>{const {page}=await setup(t);await page.getByRole('button',{name:'紧凑',exact:true}).click();await category(page,'通知设置');await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert.equal(await page.getByRole('button',{name:'紧凑',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'平台管理',exact:true}).click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();assert.equal(await page.getByRole('button',{name:'舒适',exact:true}).getAttribute('aria-pressed'),'true')});
for(const entry of ['settings','header','sidebar'])test(`${entry} logout confirms, cancellation keeps draft, confirmation runs guard`,async t=>{const {page,writes}=await setup(t);await page.getByRole('button',{name:'紧凑',exact:true}).click();const trigger=async()=>{if(entry==='settings')return page.locator('.settings-logout').click();if(entry==='header'){const header=page.locator('.station-global-header');if(!await header.getByRole('button',{name:'退出登录',exact:true}).count())await header.getByRole('button',{name:'真实账户，账户菜单',exact:true}).dispatchEvent('click');return header.getByRole('button',{name:'退出登录',exact:true}).dispatchEvent('click')}return page.locator('.workspace-sidebar').getByRole('button',{name:'退出登录',exact:true,includeHidden:true}).dispatchEvent('click')};await trigger();await page.getByRole('dialog',{name:'退出登录？'}).getByRole('button',{name:'取消',exact:true}).click();assert.equal(await page.getByRole('button',{name:'紧凑',exact:true}).getAttribute('aria-pressed'),'true');assert(!writes.some(w=>w.logout));await trigger();await page.getByRole('dialog',{name:'退出登录？'}).getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('button',{name:'继续编辑',exact:true}).click();assert(!writes.some(w=>w.logout));await trigger();await page.getByRole('dialog',{name:'退出登录？'}).getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('button',{name:'放弃修改',exact:true}).click();await page.getByLabel('登录账号',{exact:true}).waitFor();assert(writes.some(w=>w.logout));assert.equal(await page.evaluate(()=>sessionStorage.getItem('enerlution-api-token')),null)});
test('pending write cannot be bypassed by navigation or logout',async t=>{const {page,writes,release}=await setup(t,{pending:true});await page.getByRole('button',{name:'紧凑',exact:true}).click();await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByRole('button',{name:'平台管理',exact:true}).click();await page.getByRole('alert').filter({hasText:'正在保存'}).waitFor();await page.locator('.settings-logout').click();await page.getByRole('dialog',{name:'退出登录？'}).getByRole('button',{name:'退出登录',exact:true}).click();assert(!writes.some(w=>w.logout));release();await page.getByText('偏好已保存至服务器',{exact:true}).waitFor()});
test('security opens honest unsupported states without mutating MFA',async t=>{const {page,writes}=await setup(t);await category(page,'登录与安全');assert.equal(await page.getByText('已开启 · 验证器',{exact:true}).count(),0);await page.getByRole('button',{name:'管理方式',exact:true}).click();await page.getByRole('dialog').getByText(/尚未接入/).waitFor();await page.getByRole('dialog').getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'查看设备',exact:true}).click();await page.getByText('暂无可用的登录设备数据',{exact:true}).waitFor();assert.equal(writes.length,0)});



async function demoSetup(t){const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultTimeout(6000);page.setDefaultNavigationTimeout(60000);await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort());await page.goto(process.env.DEMO_PREVIEW_URL||'http://127.0.0.1:8460',{waitUntil:'domcontentloaded',timeout:60000});await page.evaluate(()=>{localStorage.setItem('enerlution-auth-session-v1',JSON.stringify({userId:'user-owner-demo'}));localStorage.setItem('enerlution-system-settings-v1',JSON.stringify({displayName:'OLD-ACCOUNT',email:'old@example.test'}));localStorage.setItem('enerlution:settings:api:user-owner-demo',JSON.stringify({settings:{displayName:'API-ACCOUNT'}}))});await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'设置',exact:true}).click();return page;}
test('demo profile validates, keyboard stays in email, scoped storage reloads and other accounts do not inherit',async t=>{const page=await demoSetup(t);assert.notEqual(await page.getByLabel('显示名称',{exact:true}).inputValue(),'OLD-ACCOUNT');assert.notEqual(await page.getByLabel('显示名称',{exact:true}).inputValue(),'API-ACCOUNT');const email=page.getByLabel('联系邮箱',{exact:true});await email.fill('');await email.focus();await page.keyboard.type('keyboard@example.test',{delay:20});assert.equal(await email.inputValue(),'keyboard@example.test');assert.equal(await email.evaluate(e=>e===document.activeElement),true);await email.fill('invalid');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByRole('alert').filter({hasText:'有效的联系邮箱'}).waitFor();await email.fill('keyboard@example.test');await page.getByLabel('显示名称',{exact:true}).fill('OWNER-DRAFT');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByText('已保存至本机',{exact:true}).waitFor();await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'设置',exact:true}).click();assert.equal(await page.getByLabel('显示名称',{exact:true}).inputValue(),'OWNER-DRAFT');await page.evaluate(()=>localStorage.setItem('enerlution-auth-session-v1',JSON.stringify({userId:'user-operator-demo'})));await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'设置',exact:true}).click();assert.notEqual(await page.getByLabel('显示名称',{exact:true}).inputValue(),'OWNER-DRAFT');assert.notEqual(await page.getByLabel('联系邮箱',{exact:true}).inputValue(),'keyboard@example.test')});
test('partial save discard retains confirmed values and restores failed fields',async t=>{const {page}=await setup(t,{partial:true});await page.getByRole('button',{name:'上次访问页面',exact:true}).click();await page.getByRole('button',{name:'紧凑',exact:true}).click();await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByRole('alert').filter({hasText:'设置并发冲突'}).waitFor();await category(page,'显示与语言');await page.getByRole('button',{name:'放弃修改',exact:true}).click();await category(page,'个人偏好');assert.equal(await page.getByRole('button',{name:'上次访问页面',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:'舒适',exact:true}).getAttribute('aria-pressed'),'true')});
test('load failure disables editing and retry restores real server preferences',async t=>{const {page}=await setup(t);let fail=true;await page.route('http://127.0.0.1:18090/api/settings',r=>{const status=fail?503:200;return r.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status===200?0:503,msg:'偏好暂不可用',data:{density:'紧凑'}})})});await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('alert').filter({hasText:'偏好暂不可用'}).waitFor();assert.equal(await page.getByRole('button',{name:'保存配置',exact:true}).isDisabled(),true);fail=false;await page.getByRole('button',{name:'重试加载偏好',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.settings-choice[aria-pressed=true]')&&[...document.querySelectorAll('.settings-choice[aria-pressed=true]')].some(e=>e.textContent==='紧凑'))});
test('notification channel preferences save without enabling delivery services',async t=>{const {page,writes}=await setup(t);await category(page,'通知设置');await page.getByLabel('邮件通知',{exact:true}).selectOption('不接收');await page.getByLabel('短信通知',{exact:true}).selectOption('不接收');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByText('偏好已保存至服务器',{exact:true}).waitFor();assert(writes.some(w=>w.key==='notificationEmail'&&w.value==='false'));assert(writes.some(w=>w.key==='notificationSms'&&w.value==='不接收'))});
for(const role of ['operator','integrator'])test(`${role} demo logout clears real session only after explicit confirmation`,async t=>{const browser=await chromium.launch({channel:'msedge',headless:true});t.after(()=>browser.close());const page=await browser.newPage();page.setDefaultNavigationTimeout(60000);await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort());await page.goto(process.env.DEMO_PREVIEW_URL||'http://127.0.0.1:8460',{waitUntil:'domcontentloaded'});await page.getByLabel('登录账号',{exact:true}).fill(role+'@enerlution.cn');await page.getByLabel('密码',{exact:true}).fill('Demo@2026');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByLabel('动态验证码',{exact:true}).fill('246810');await page.getByRole('button',{name:'完成验证',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await page.locator('.settings-logout').click();await page.keyboard.press('Escape');assert(await page.evaluate(()=>localStorage.getItem('enerlution-auth-session-v1')));await page.locator('.settings-logout').click();await page.getByRole('dialog',{name:'退出登录？'}).getByRole('button',{name:'退出登录',exact:true}).click();await page.getByLabel('登录账号',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('enerlution-auth-session-v1')),null);await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'登录',exact:true}).waitFor()});
test('unchanged API defaults do not falsely report a server save',async t=>{const {page,writes}=await setup(t);await page.getByRole('button',{name:'舒适',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'保存配置',exact:true}).isDisabled(),true);assert.equal(await page.getByText('偏好已保存至服务器',{exact:true}).count(),0);assert.equal(writes.length,0)});
test('editing demo contact email never changes the displayed login identity',async t=>{const page=await demoSetup(t);await page.getByLabel('联系邮箱',{exact:true}).fill('contact-only@example.test');await page.getByRole('button',{name:'保存配置',exact:true}).click();await page.getByText('已保存至本机',{exact:true}).waitFor();await category(page,'登录与安全');await page.locator('.settings-detail-content').getByText('owner@enerlution.cn',{exact:true}).waitFor();assert.equal(await page.locator('.settings-detail-content').getByText('contact-only@example.test',{exact:true}).count(),0)});

async function openVerification(page) {
  await category(page, '登录与安全');
  await page.getByRole('button', {name:'管理方式', exact:true}).click();
}

test('fixround1 password validates locally, keeps keyboard focus and never writes secrets', async t => {
  const {page,writes} = await setup(t);
  const mutations=[]; page.on('request',r=>{if(r.method()!=='GET')mutations.push(r.url())});
  await openVerification(page);
  const dialog = page.getByRole('dialog', {name:'验证方式',exact:true});
  await dialog.getByRole('button',{name:'提交密码变更',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'当前密码'}).waitFor();
  await page.getByLabel('当前密码',{exact:true}).fill('Current8-secret');
  const next = page.getByLabel('新密码',{exact:true});
  await next.fill('short');
  await dialog.getByRole('button',{name:'提交密码变更',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'8–128 位'}).waitFor();
  await next.fill('');
  await next.focus(); await page.keyboard.type('Next99-secret',{delay:20});
  assert.equal(await next.inputValue(),'Next99-secret');
  assert.equal(await next.evaluate(e=>e===document.activeElement),true);
  await page.getByLabel('确认新密码',{exact:true}).fill('different8');
  await dialog.getByRole('button',{name:'提交密码变更',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'两次新密码不一致'}).waitFor();
  await page.getByLabel('确认新密码',{exact:true}).fill('Next99-secret');
  await dialog.getByRole('button',{name:'提交密码变更',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'尚未接通，未提交'}).waitFor();
  const storage=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));
  assert(!storage.includes('Current8-secret')); assert(!storage.includes('Next99-secret'));
  assert.equal(writes.length,0);
  assert.deepEqual(mutations,[]);
});

test('fixround1 MFA steps validate code without challenge, activation, network or persistence', async t => {
  const {page,writes}=await setup(t); await openVerification(page);
  const mutations=[]; page.on('request',r=>{if(r.method()!=='GET')mutations.push(r.url())});
  await page.getByRole('tab',{name:'MFA 配置',exact:true}).click();
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'当前密码'}).waitFor();
  await page.getByLabel('MFA 当前密码',{exact:true}).fill('Mfa8-secret');
  await page.getByRole('button',{name:'下一步',exact:true}).click();
  await page.getByLabel('MFA 验证码',{exact:true}).fill('abc');
  await page.getByRole('button',{name:'提交 MFA 配置',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'6 位数字'}).waitFor();
  await page.getByLabel('MFA 验证码',{exact:true}).fill('123456');
  await page.getByRole('button',{name:'提交 MFA 配置',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'尚未接通，未提交'}).waitFor();
  assert.equal(writes.length,0);
  assert.deepEqual(mutations,[]);
  assert(!await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('Mfa8-secret')));
  assert(!await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('123456')));
  await page.getByRole('dialog',{name:'验证方式',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'放弃修改',exact:true}).click();
  await page.getByRole('button',{name:'管理方式',exact:true}).click();
  await page.getByRole('tab',{name:'MFA 配置',exact:true}).click();
  assert.equal(await page.getByLabel('MFA 当前密码',{exact:true}).inputValue(),'');
});

for (const destination of ['close','escape','category','global','logout','header','sidebar']) {
  test(`fixround1 sensitive draft guards ${destination}, cancellation retains and discard clears`, async t => {
    const {page,writes}=await setup(t); await openVerification(page);
    await page.getByLabel('新密码',{exact:true}).fill('Leave8-secret');
    const trigger=async()=>{
      if(destination==='close') return page.getByRole('dialog',{name:'验证方式',exact:true}).getByRole('button',{name:'关闭',exact:true}).click();
      if(destination==='escape') return page.keyboard.press('Escape');
      if(destination==='category') return page.locator('.settings-category').filter({hasText:'通知设置'}).dispatchEvent('click');
      if(destination==='global') return page.getByRole('button',{name:'平台管理',exact:true,includeHidden:true}).dispatchEvent('click');
      if(destination==='logout') await page.locator('.settings-logout').dispatchEvent('click');
      if(destination==='header') {
        const header=page.locator('.station-global-header');
        if(!await header.getByRole('button',{name:'退出登录',exact:true}).count()) await header.getByRole('button',{name:'真实账户，账户菜单',exact:true}).dispatchEvent('click');
        await header.getByRole('button',{name:'退出登录',exact:true}).dispatchEvent('click');
      }
      if(destination==='sidebar') await page.locator('.workspace-sidebar').getByRole('button',{name:'退出登录',exact:true,includeHidden:true}).dispatchEvent('click');
      await page.getByRole('dialog',{name:'退出登录？',exact:true}).getByRole('button',{name:'退出登录',exact:true}).click();
    };
    await trigger(); await page.getByRole('button',{name:'继续编辑',exact:true}).click();
    assert.equal(await page.getByLabel('新密码',{exact:true}).inputValue(),'Leave8-secret');
    assert(!writes.some(w=>w.logout));
    await trigger(); await page.getByRole('button',{name:'放弃修改',exact:true}).click();
    if(['logout','header','sidebar'].includes(destination)) {
      await page.getByLabel('登录账号',{exact:true}).waitFor();
      assert.equal(await page.locator('input[type=password]').count(),1);
    } else {
      if(destination==='global') await page.getByRole('button',{name:'设置',exact:true}).click();
      await openVerification(page);
      assert.equal(await page.getByLabel('新密码',{exact:true}).inputValue(),'');
    }
    assert(!await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('Leave8-secret')));
  });
}

test('fixround1 sensitive inputs remain guarded while preference save is pending', async t=>{
  const {page,writes,release}=await setup(t,{pending:true});
  await category(page,'登录与安全');
  await page.getByRole('switch',{name:'新设备登录提醒',exact:true}).click();
  await page.getByRole('button',{name:'管理方式',exact:true}).click();
  await page.getByLabel('新密码',{exact:true}).fill('Busy8-secret');
  await page.getByRole('button',{name:'保存配置',exact:true,includeHidden:true}).dispatchEvent('click');
  await page.keyboard.press('Escape');
  const dialog=page.getByRole('dialog',{name:'验证方式',exact:true});
  await dialog.getByRole('alert').filter({hasText:'正在保存'}).waitFor();
  assert.equal(await page.getByLabel('新密码',{exact:true}).inputValue(),'Busy8-secret');
  await page.locator('.settings-logout').dispatchEvent('click');
  await page.getByRole('dialog',{name:'退出登录？',exact:true}).getByRole('button',{name:'退出登录',exact:true}).click();
  assert(!writes.some(w=>w.logout));
  release();
  await page.waitForFunction(()=>!document.querySelector('.settings-security-form').disabled);
  await dialog.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('button',{name:'放弃修改',exact:true}).click();
  await page.getByRole('button',{name:'管理方式',exact:true}).click();
  assert.equal(await page.getByLabel('新密码',{exact:true}).inputValue(),'');
});

for(const status of [401,403]) test(`fixround1 settings ${status} preserves shared authentication semantics`, async t=>{
  const {page}=await setup(t);
  let refreshed=0;
  await page.route('http://127.0.0.1:18090/api/auth/me',r=>{refreshed++;return r.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data:{id:'8',name:'真实账户',account:'settings@example.test',role:'integrator',stationIds:[],permissions:[]}})})});
  await page.route('http://127.0.0.1:18090/api/settings',r=>r.fulfill({status,contentType:'application/json',body:JSON.stringify({code:status,msg:'测试拒绝',data:null})}));
  await page.getByRole('button',{name:'紧凑',exact:true}).click();
  await page.getByRole('button',{name:'保存配置',exact:true}).click();
  if(status===401){await page.getByLabel('登录账号',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>sessionStorage.getItem('enerlution-api-token')),null)}
  else {await page.locator('.settings-feedback[role=alert]').filter({hasText:'权限已变化'}).waitFor();assert(refreshed>0);assert.equal(await page.getByRole('button',{name:'紧凑',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByText('偏好已保存至服务器',{exact:true}).count(),0)}
});
