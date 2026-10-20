const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('node:http');
const file=require('node:path').join(__dirname,'../server/ems-agent-proxy.mjs');
async function fixture(t){
 const {createAgentProxy}=await import(require('node:url').pathToFileURL(file));
 const calls=[];
 const upstream=async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('/auth/me'))return Response.json({code:200,data:{id:'u1',tenant:{tenantId:2},permissions:['asset.read'],stationPermissions:{'21':['asset.read'],'22':[]}}});
  if(url.endsWith('/v1/health'))return Response.json({status:'ok',model:'original-agent'});
  if(url.endsWith('/v1/chat/stream'))return new Response('{"type":"start","conversation_id":"owned"}\n{"type":"response","response":{"conversation_id":"owned","answer":"连接成功"}}\n',{headers:{'content-type':'application/x-ndjson'}});
  return Response.json({tools:[]});
 };
 const handler=createAgentProxy({fetchImpl:upstream,config:()=>({url:'http://47.99.70.238:18080',apiKey:'private-test-key'})});
 const server=createServer((req,res)=>void handler(req,res,()=>{res.statusCode=404;res.end()}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return{base:`http://127.0.0.1:${server.address().port}/ems-agent-api`,calls};
}
test('local proxy refuses anonymous requests before reaching original service',async t=>{
 const h=await fixture(t),r=await fetch(h.base+'/v1/health');assert.equal(r.status,401);assert.equal(h.calls.length,0);
});
test('health uses server secret and never forwards the platform login token upstream',async t=>{
 const h=await fixture(t),r=await fetch(h.base+'/v1/health',{headers:{Authorization:'Bearer platform-token'}});
 assert.equal(r.status,200);assert.equal((await r.json()).status,'ok');
 const call=h.calls.find(call=>call.url.endsWith('/v1/health'));assert.equal(call.options.headers['X-API-Key'],'private-test-key');assert.equal(call.options.headers.Authorization,undefined);
});
test('chat validates scope, forces dry-run, replaces claimed identity and streams the actual response',async t=>{
 const h=await fixture(t),headers={Authorization:'Bearer platform-token','Content-Type':'application/json'};
 let r=await fetch(h.base+'/v1/chat/stream',{method:'POST',headers,body:JSON.stringify({message:'hello',site_scope:['22']})});assert.equal(r.status,403);assert.equal(h.calls.some(c=>c.url.endsWith('/v1/chat/stream')),false);
 r=await fetch(h.base+'/v1/chat/stream',{method:'POST',headers,body:JSON.stringify({message:'hello',dry_run:false,site_scope:['21'],user_context:{user_id:'forged',permissions:['*']}})});
 assert.equal(r.status,200);assert.match(await r.text(),/连接成功/);
 const data=JSON.parse(h.calls.find(c=>c.url.endsWith('/v1/chat/stream')).options.body);assert.equal(data.dry_run,true);assert.deepEqual(data.site_scope,['21']);assert.equal(data.user_context.user_id,'2:u1');assert.doesNotMatch(JSON.stringify(data),/forged/);
});
test('unknown conversation and attachment IDs are refused locally',async t=>{
 const h=await fixture(t),headers={Authorization:'Bearer platform-token','Content-Type':'application/json'};
 for(const payload of [{conversation_id:'another-user'},{attachment_ids:['another-file']}]){
 const r=await fetch(h.base+'/v1/chat/stream',{method:'POST',headers,body:JSON.stringify({message:'hello',...payload})});assert.equal(r.status,403);
 }
});
