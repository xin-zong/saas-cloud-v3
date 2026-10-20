const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(){const exported={};new Function('exports','require',ts.transpileModule(fs.readFileSync(__dirname+'/../src/ems-agent/transport.js','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exported,name=>{assert.equal(name,'@/api/client');return{getToken:()=> 'platform-token'}});return exported}
test('stream parser preserves split UTF-8, multiple events and a final line without newline',async t=>{
 const previous=global.fetch;t.after(()=>global.fetch=previous);let request;
 const bytes=new TextEncoder().encode('{"type":"activity","title":"处理中"}\n{"type":"response","response":{"answer":"连接成功"}}');
 global.fetch=async(url,options)=>{request={url,options};return new Response(new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,34));controller.enqueue(bytes.slice(34,63));controller.enqueue(bytes.slice(63));controller.close()}}))};
 const events=[];await load().streamChatMessage({message:'hello',dry_run:false,user_context:{secret:'do not forward'}},event=>events.push(event));
 assert.deepEqual(events.map(e=>e.type),['activity','response']);assert.equal(events[1].response.answer,'连接成功');assert.equal(request.url,'/ems-agent-api/v1/chat/stream');assert.equal(request.options.headers.Authorization,'Bearer platform-token');
 const payload=JSON.parse(request.options.body);assert.equal(payload.dry_run,true);assert.equal(payload.user_context,undefined);assert.equal(request.options.headers['X-API-Key'],undefined);
});
test('real gateway errors are surfaced without fabricated success responses',async t=>{
 const previous=global.fetch;t.after(()=>global.fetch=previous);global.fetch=async()=>Response.json({detail:'原 Agent 接口尚未配置'},{status:503});
 await assert.rejects(load().agentRequest('/v1/health'),error=>error.status===503&&error.message.includes('尚未配置'));
});
