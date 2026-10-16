const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

async function setup(t, options={}) {
  const browser=await chromium.launch({channel:'msedge',headless:true});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.setDefaultTimeout(6000);
  page.on('dialog',dialog=>dialog.accept());
  await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,r=>r.abort());
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','profile-test-only'));
  let name='服务器姓名', account='profile@example.test', id='8', reads=0, identities=0;
  let failRead=!!options.failRead, failWrite=!!options.failWrite, failReadback=!!options.failReadback;
  let releaseRead, releaseWrite;
  const readGate=new Promise(r=>releaseRead=r), writeGate=new Promise(r=>releaseWrite=r);
  let finishFirstRead;
  const firstReadCompleted=new Promise(r=>finishFirstRead=r);
  const writes=[];
  await page.route('**/src/main.tsx*',async r=>{
    const source=await(await r.fetch()).text();
    const react=source.match(/["']([^"']*\/react\.js\?v=[^"']+)["']/)?.[1];
    const dom=source.match(/["']([^"']*\/react-dom_client\.js\?v=[^"']+)["']/)?.[1];
    assert(react&&dom);
    await r.fulfill({contentType:'text/javascript',body:`import React from '${react}';import ReactDOM from '${dom}';import{AuthProvider,useAuth}from'/src/auth/AuthContext.tsx';import Settings from'/src/components/SystemSettingsPage.tsx';import'/src/index.css';import'/src/tenant/tenant.css';import'/src/styles/platform-alignment.css';
    function Harness(){const{user}=useAuth();const[open,setOpen]=React.useState(false);const guard=React.useRef(null);const register=React.useCallback(g=>guard.current=g,[]);return !user?null:React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setOpen(true)},'设置'),React.createElement('button',{onClick:async()=>{if(!guard.current||await guard.current())setOpen(false)}},'平台管理'),open?React.createElement(Settings,{key:user.id,user,onLogout:()=>{},registerLeaveGuard:register}):null)}ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AuthProvider,null,React.createElement(Harness)));`});
  });
  await page.route('**/api/**',async r=>{
    const q=r.request(), path=new URL(q.url()).pathname;
    if(!path.startsWith('/api/'))return r.continue();
    let data=[],status=200,msg='ok',firstRead=false;
    if(q.method()==='OPTIONS') return r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
    if(path==='/api/auth/me') {identities++;data={id,name,account,role:'integrator',stationIds:[],permissions:['role.manage']};}
    else if(path==='/api/settings')data={};
    else if(path==='/api/me/profile') {
      if(q.method()==='PUT') {
        writes.push(q.postDataJSON());
        if(options.pendingWrite)await writeGate;
        if(failWrite){status=503;msg='姓名保存失败';failWrite=false;} else name=q.postDataJSON().name.trim();
        data={id,account,display_name:name,tenant_name:'测试租户',kind:'integrator',mfa_enabled:false};
      } else {
        reads++;
        firstRead=reads===1;
        // Capture the account at request time so a delayed response really is stale.
        data={id,account,display_name:name,tenant_name:'测试租户',kind:'integrator',mfa_enabled:false};
        if(failReadback && writes.length){failRead=true;failReadback=false;}
        if(options.pendingRead && reads===1)await readGate;
        if(failRead){status=503;msg='账户资料读取失败';}
      }
    } else if(q.method()!=='GET')throw new Error('Unexpected mutation '+q.method()+' '+path);
    try {await r.fulfill({status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({code:status===200?0:status,msg,data})});}
    finally {if(firstRead)finishFirstRead();}
  });
  const open=async()=>{await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8444',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('显示名称',{exact:true}).waitFor();};
  await open();
  return {page,writes,releaseRead,releaseWrite,firstReadCompleted,open,reads:()=>reads,identities:()=>identities,allowRead:()=>{failRead=false},switchAccount:()=>{id='9';name='另一个账户';account='another@example.test'}};
}
const input=page=>page.getByLabel('显示名称',{exact:true});
const save=page=>page.getByRole('button',{name:'保存账户资料',exact:true});
const category=(page,name)=>page.locator('.settings-category').filter({hasText:name}).click();

test('profile late initial read cannot overwrite editable input',async t=>{
  const {page,writes,releaseRead}=await setup(t,{pendingRead:true});
  assert.equal(await input(page).isDisabled(),true);
  assert.equal(await save(page).isDisabled(),true);
  releaseRead(); await input(page).fill('读取后的草稿');
  assert.equal(await input(page).inputValue(),'读取后的草稿');assert.deepEqual(writes,[]);
});
test('profile read failure stays disabled and explicit retry restores server name',async t=>{
  const {page,writes,allowRead}=await setup(t,{failRead:true});
  await page.getByRole('alert').filter({hasText:'账户资料读取失败'}).waitFor();
  assert.equal(await input(page).isDisabled(),true);assert.equal(await save(page).isDisabled(),true);
  allowRead();await page.getByRole('button',{name:'重试读取账户资料',exact:true}).click();
  await input(page).fill('可编辑');assert.deepEqual(writes,[]);
});
test('profile validates whitespace, keeps failed draft, retries trimmed name and reads back identity',async t=>{
  const state=await setup(t,{failWrite:true}),{page,writes}=state;
  await input(page).fill('   ');await save(page).click();
  await page.getByRole('alert').filter({hasText:'1–120'}).waitFor();assert.equal(writes.length,0);
  await input(page).fill('  更新姓名  ');await save(page).click();
  await page.getByRole('alert').filter({hasText:'姓名保存失败'}).waitFor();assert.equal(await input(page).inputValue(),'  更新姓名  ');
  await save(page).click();await page.getByRole('status').filter({hasText:'显示名称已保存'}).waitFor();
  assert.deepEqual(writes,[{name:'更新姓名'},{name:'更新姓名'}]);
  assert(state.reads()>=2);assert(state.identities()>=2);
  assert.equal(await page.getByText(/头像和全局身份/).count(),0);
  await page.screenshot({path:'../.local-tools/implementation/personal-profile-panel.png',fullPage:true});
  await state.open();assert.equal(await input(page).inputValue(),'更新姓名');
});
test('profile category and shell navigation keep or discard draft explicitly',async t=>{
  const {page,writes}=await setup(t);await input(page).fill('未保存姓名');
  await category(page,'通知设置');await page.getByRole('button',{name:'继续编辑',exact:true}).click();
  assert.equal(await input(page).inputValue(),'未保存姓名');
  await page.getByRole('button',{name:'平台管理',exact:true}).click();await page.getByRole('button',{name:'继续编辑',exact:true}).click();
  assert.equal(await input(page).inputValue(),'未保存姓名');
  await category(page,'通知设置');await page.getByRole('button',{name:'放弃修改',exact:true}).click();
  await category(page,'个人偏好');await page.waitForFunction(()=>document.querySelector('input[maxlength="120"]')?.value==='服务器姓名');assert.deepEqual(writes,[]);
});
test('profile in-flight save blocks category and shell navigation without duplicate writes',async t=>{
  const {page,writes,releaseWrite}=await setup(t,{pendingWrite:true});await input(page).fill('保存中姓名');await save(page).click();
  await category(page,'通知设置');await page.getByRole('alert').filter({hasText:'正在保存账户资料'}).waitFor();
  await page.getByRole('button',{name:'平台管理',exact:true}).click();assert.equal(await input(page).inputValue(),'保存中姓名');
  assert.equal(writes.length,1);releaseWrite();await page.getByRole('status').filter({hasText:'显示名称已保存'}).waitFor();
  assert.equal(await page.getByRole('alert').filter({hasText:'正在保存账户资料'}).count(),0);
});
test('profile switching accounts never inherits unsaved account draft',async t=>{
  const {page,switchAccount,open}=await setup(t);await input(page).fill('前账户草稿');switchAccount();await open();
  assert.equal(await input(page).inputValue(),'另一个账户');
});
test('profile same-document account refresh clears the previous account draft and loads the new profile',async t=>{
  const {page,writes,switchAccount}=await setup(t);await input(page).fill('前账户未保存草稿');
  await page.evaluate(()=>window.__profileDocumentMarker='same-document');
  switchAccount();
  await page.evaluate(async()=>{const{CAPABILITIES_CHANGED}=await import('/src/api/client.ts');window.dispatchEvent(new Event(CAPABILITIES_CHANGED));});
  await page.waitForFunction(()=>document.querySelector('input[maxlength="120"]')?.value==='另一个账户');
  assert.equal(await page.evaluate(()=>window.__profileDocumentMarker),'same-document');
  assert.equal(await page.getByLabel('登录邮箱',{exact:true}).inputValue(),'another@example.test');
  assert.equal(await save(page).isDisabled(),true);assert.deepEqual(writes,[]);
});
test('profile late response from the previous account cannot overwrite the new same-document profile',async t=>{
  const {page,writes,switchAccount,releaseRead,firstReadCompleted}=await setup(t,{pendingRead:true});
  assert.equal(await input(page).isDisabled(),true);
  await page.evaluate(()=>window.__profileDocumentMarker='same-document');
  switchAccount();
  await page.evaluate(async()=>{const{CAPABILITIES_CHANGED}=await import('/src/api/client.ts');window.dispatchEvent(new Event(CAPABILITIES_CHANGED));});
  await page.waitForFunction(()=>document.querySelector('input[maxlength="120"]')?.value==='另一个账户');
  await input(page).fill('新账户草稿');
  releaseRead();await firstReadCompleted;
  assert.equal(await page.evaluate(()=>window.__profileDocumentMarker),'same-document');
  assert.equal(await input(page).inputValue(),'新账户草稿');
  assert.equal(await page.getByLabel('登录邮箱',{exact:true}).inputValue(),'another@example.test');
  assert.deepEqual(writes,[]);
});
test('profile background identity refresh preserves an unsaved name draft',async t=>{
  const {page,writes}=await setup(t);await input(page).fill('身份刷新时的草稿');
  const refreshed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/me');
  await page.evaluate(()=>window.dispatchEvent(new Event('enerlution:permissions-changed')));
  await refreshed;
  assert.equal(await input(page).inputValue(),'身份刷新时的草稿');assert.deepEqual(writes,[]);
});
test('profile successful write followed by failed readback keeps confirmed name and offers read-only retry',async t=>{
  const {page,writes,allowRead}=await setup(t,{failReadback:true});await input(page).fill('  已写入姓名  ');await save(page).click();
  await page.getByRole('alert').filter({hasText:'姓名已写入，但资料回读失败'}).waitFor();
  assert.equal(await input(page).inputValue(),'已写入姓名');assert.equal(await save(page).isDisabled(),true);
  assert.equal(writes.length,1);allowRead();await page.getByRole('button',{name:'重试读取账户资料',exact:true}).click();
  await input(page).fill('继续编辑');assert.equal(writes.length,1);
});
test('profile preserves the project 120-character name contract',async t=>{
  const {page,writes}=await setup(t);
  assert.equal(await input(page).getAttribute('maxlength'),'120');
  const name='名'.repeat(120);await input(page).fill(name);await save(page).click();
  await page.getByRole('status').filter({hasText:'显示名称已保存'}).waitFor();
  assert.deepEqual(writes,[{name}]);
});
