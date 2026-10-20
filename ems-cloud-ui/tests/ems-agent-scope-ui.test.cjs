const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
test('station-specific permission revocation invalidates Agent responses even when global permissions and station IDs stay unchanged',{timeout:30000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.goto((process.env.EMS_AGENT_PREVIEW_URL||'http://127.0.0.1:8457')+'/ems-agent.html');
  const result=await page.evaluate(async()=>{
   const api=await import('/src/ems-agent/api.js');
   const value={visible:false,language:'en',stations:[{id:'4',code:'PROTO-001'}],user:{id:'7',tenantId:2,permissions:['asset.read','telemetry.read'],stationPermissions:{4:['asset.read','telemetry.read']}}};
   const receive=async context=>{window.postMessage({source:'enerlution-ems-agent',type:'context',context},location.origin);await new Promise(resolve=>setTimeout(resolve,30))};
   await receive(value);sessionStorage.setItem('enerlution-api-token','same-token');
   window.fetch=async()=>{await receive({...value,user:{...value.user,stationPermissions:{4:['asset.read']}}});return new Response('{}',{status:200})};
   let message='';try{await api.getTools()}catch(error){message=error.message}
   return{message};
  });
  assert.match(result.message,/permissions.*changed/i);
 }finally{await browser.close()}
});
