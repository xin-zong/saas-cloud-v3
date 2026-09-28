const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
function setup(){
 const cache={};const client={getToken:()=> 'test-session',getSessionVersion:()=>1,ApiError:class extends Error{constructor(message,status){super(message);this.status=status}},setToken(){},refreshAfterForbidden:async()=>{}}
 const load=name=>{if(name==='client')return client;if(cache[name])return cache[name];const m={exports:{}};cache[name]=m.exports;const source=fs.readFileSync(path.join(__dirname,'../src/api',`${name}.ts`),'utf8').replace(/import\.meta\.env/g,'({})');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports','module',js)(p=>load(p.replace('./','')),m.exports,m);return m.exports};return load('stationRealtime')
}
test('SSE frames preserve chunk remainder and multi-line JSON',()=>{
 const {readSseFrames}=setup();let parsed=readSseFrames('event: snapshot\r\ndata: {"a":\r\ndata: 1}\r\n\r\nevent: snap');assert.deepEqual(parsed.events,[{event:'snapshot',data:'{"a":\n1}'}]);assert.equal(parsed.rest,'event: snap');parsed=readSseFrames(parsed.rest+'shot\ndata: {}\n\n');assert.equal(parsed.events[0].event,'snapshot')
})
test('snapshot joins physical points and clears absent or stale prior values',()=>{
 const {mergeStationSnapshot}=setup();const station={id:'4',ratedPower:100,status:'offline',devices:{},soc:90,deviceInventory:[{id:'5',primaryPointId:'',updatedAt:'',points:[{id:'19',label:'SOC',unit:'%',value:90,quality:'good'},{id:'21',label:'voltage',unit:'V',value:512,quality:'good'}]}]};
 const row={pointId:'19',deviceId:'5',namespace:'cabinet',sourceId:20018,value:'66.123456789012345',valueType:'number',quality:'valid',receivedAt:1000,sourceTime:1000,staleReason:null};
 const result=mergeStationSnapshot(station,{items:[row],serverTime:1000,presence:null});assert.equal(result.deviceInventory[0].points[0].metric,'soc');assert.equal(result.deviceInventory[0].points[0].exactValue,row.value);assert.equal(result.deviceInventory[0].points[1].value,null);assert.equal(result.soc,Number(row.value));assert.ok(Number.isNaN(result.activePower));
 const stale=mergeStationSnapshot(result,{items:[{...row,staleReason:'heartbeat_expired'}],serverTime:2000,presence:null});assert.ok(Number.isNaN(stale.soc));assert.equal(stale.deviceInventory[0].points[0].quality,'bad')
})
test('SSE uses Authorization header and cancellation stops delivery',async()=>{
 const {subscribeStationTelemetry}=setup();const abort=new AbortController();let request,seen=0,cancelled=false;
 const original=global.fetch;global.fetch=async(url,options)=>{request={url,options};return{ok:true,headers:new Headers({'content-type':'text/event-stream'}),body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('event: snapshot\ndata: {"items":[],"serverTime":1,"presence":null}\n\n'))},cancel(){cancelled=true}})}};
 try{await subscribeStationTelemetry('4',['19'],{onSnapshot(){seen++;abort.abort()}},abort.signal);assert.equal(seen,1);assert.equal(request.options.headers.Authorization,'Bearer test-session');assert.ok(!request.url.includes('test-session'));assert.ok(cancelled)}finally{global.fetch=original}
})
