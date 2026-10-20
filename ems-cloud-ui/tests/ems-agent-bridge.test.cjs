const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const exportsObject={};
new Function('exports',ts.transpileModule(fs.readFileSync(__dirname+'/../src/ems-agent/protocol.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exportsObject);
const {acceptAgentMessage,agentContext}=exportsObject;
test('bridge rejects other origins, sources, channels and unknown message kinds',()=>{
 const source={}; const target={origin:'http://localhost:8444',source,channel:'abc'};
 const event={origin:target.origin,source,data:{type:'ems-agent:ready',channel:'abc'}};
 assert.equal(acceptAgentMessage(event,target),true);
 for(const bad of [{origin:'https://other.invalid'},{source:{}},{data:{type:'ems-agent:ready',channel:'other'}},{data:{type:'execute-anything',channel:'abc'}}]) assert.equal(acceptAgentMessage({...event,...bad},target),false);
});
test('a valid active site is carried into the route and tenant identity separates local history',()=>{
 const user={id:'7',name:'User',role:'owner',tenant:{tenantId:12},permissions:['asset.read'],stationPermissions:{'21':['asset.read']}};
 const context=agentContext(user,[{id:'21',name:'新疆261机柜'}],'场站','21','zh-CN');
 assert.equal(context.route.query.stationId,'21');
 assert.equal(context.user.id,'12:7');
 assert.equal(context.user.language,'zh-CN');
});
function legacyApi(){
 const exported={},values=new Map(),context={sites:[{site_id:'21',display_name:'新疆261机柜'}]};
 const previous=global.localStorage;
 global.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const source=fs.readFileSync(__dirname+'/../src/ems-agent/legacy/agent.js','utf8');
 new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exported,name=>name==='../host-context'?{getHostContext:()=>context}:{});
 return {api:exported,restore:()=>{global.localStorage=previous}};
}
test('site directory still comes from the current authorized host instead of the original Agent database',async()=>{
 const h=legacyApi();try{assert.deepEqual(await h.api.getSites(),[{site_id:'21',display_name:'新疆261机柜'}])}finally{h.restore()}
});
test('legacy selections, conversation and mode persist per identity without sharing another account',()=>{
 const h=legacyApi();try{
 h.api.saveSelectedSiteIds(['21'],'tenant1:user1');h.api.saveConversationId('conversation1','tenant1:user1');h.api.saveAgentMode('thinking','tenant1:user1');
 assert.deepEqual(h.api.loadSelectedSiteIds('tenant1:user1'),['21']);
 assert.equal(h.api.loadConversationId('tenant1:user1'),'conversation1');
 assert.equal(h.api.loadAgentMode('tenant1:user1'),'thinking');
 assert.deepEqual(h.api.loadSelectedSiteIds('tenant2:user1'),[]);
 assert.equal(h.api.loadConversationId('tenant1:user2'),null);
 assert.equal(h.api.loadAgentMode('tenant1:user2'),'simple');
 }finally{h.restore()}
});
test('context contains only authorized station identities and no login credentials or telemetry',()=>{
 const user={id:'u1',name:'Operator',role:'operator',permissions:['asset.read'],stationPermissions:{'1':['asset.read'],'2':[]},account:'private',token:'secret'};
 const context=agentContext(user,[{id:'1',name:'Allowed',soc:88},{id:'2',name:'Denied'},{id:'3',name:'Unassigned'}],'场站','2','zh-CN');
 assert.deepEqual(context.sites,[{site_id:'1',stationId:'1',stationName:'Allowed',display_name:'Allowed'}]);
 assert.equal(context.route.query.stationId,undefined);
 assert.doesNotMatch(JSON.stringify(context),/secret|private|soc|Denied|Unassigned/);
 assert.equal(agentContext({...user,id:'u2',stationPermissions:{}},[],'设备',null,'en').user.id,'local:u2');
});
