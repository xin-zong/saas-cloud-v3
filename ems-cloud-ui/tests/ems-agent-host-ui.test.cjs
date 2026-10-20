const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
test('production EMSAgent opens the complete isolated assistant and restores focus on close',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','agent-host'));
  await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{
   const p=new URL(route.request().url()).pathname;
   const data=p==='/api/auth/me'?{id:'7',name:'助手验收',tenant:{actorId:7,tenantId:2,kind:'enterprise',administrator:true},menus:[{id:1,client:'web',kind:'page',path:'assets',children:[]}],roleNames:['Admin'],stationIds:[],permissions:['asset.read'],stationPermissions:{}}:p==='/api/settings'?{language:'简体中文',theme:'浅色'}:[];
   await route.fulfill({json:{code:200,data}});
  });
  await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8461/',{waitUntil:'domcontentloaded',timeout:60000});
  const trigger=page.getByRole('button',{name:'打开 EMSAgent 小助手',exact:true});await trigger.click();
  const frame=page.locator('iframe[title="EMSAgent 小助手"]');await frame.waitFor();
  const child=page.frameLocator('iframe[title="EMSAgent 小助手"]');await child.locator('.assistant-dialog').waitFor();
  assert.equal(await child.locator('html').getAttribute('lang'),'zh-CN');
  await child.locator('textarea').fill('关闭后保留我的未发送内容');
  const width=await frame.evaluate(e=>e.getBoundingClientRect().width);assert.ok(width>=400&&width<=620);
  await page.evaluate(()=>window.postMessage({source:'enerlution-ems-agent',type:'close'},location.origin));
  assert.equal(await frame.isVisible(),true,'same-origin messages from another window must be ignored');
  await child.locator('.assistant-dialog__close-btn').click();await frame.waitFor({state:'hidden'});assert.equal(await trigger.evaluate(e=>document.activeElement===e),true);
  await trigger.click();await child.locator('.assistant-dialog').waitFor();assert.equal(await child.locator('textarea').inputValue(),'关闭后保留我的未发送内容');
  await child.locator('.assistant-dialog__header-btn').click();await page.waitForFunction(()=>Math.abs(document.querySelector('iframe[title="EMSAgent 小助手"]').getBoundingClientRect().width-innerWidth)<2);await child.locator('.assistant-dialog__header-btn').click();
  await child.locator('.assistant-dialog__close-btn').click();await frame.waitFor({state:'hidden'});
  await trigger.click();await page.keyboard.press('Escape');await frame.waitFor({state:'hidden'});
 }finally{await browser.close()}
});
