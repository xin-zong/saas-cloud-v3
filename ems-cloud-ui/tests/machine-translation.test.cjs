const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function moduleUnderTest(){const m={exports:{}};const source=fs.readFileSync(`${__dirname}/../src/i18n/machine.ts`,'utf8').replaceAll('import.meta.env','{}');new Function('exports','module',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m);return m.exports}
const storage=()=>{const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}}
const response=text=>({ok:true,status:200,json:async()=>({responseStatus:200,responseData:{translatedText:text}})})
test('machine translation deduplicates requests, preserves identifiers and numbers, caches per account',async()=>{
 const {MachineTranslator}=moduleUnderTest(),disk=storage(),calls=[]
 const client=new MachineTranslator({storage:disk,fetcher:async url=>{calls.push(url);return response('ZXQ0QXZ battery cabinet overtemperature ZXQ1QXZ')}})
 client.configure('api:7',true)
 const text='RACK-02 电池柜过温 46.5°C';const values=await Promise.all([client.request(text),client.request(text)])
 assert.deepEqual(values,['RACK-02 battery cabinet overtemperature 46.5°C','RACK-02 battery cabinet overtemperature 46.5°C']);assert.equal(calls.length,1);assert.ok(!calls[0].includes('RACK-02'));assert.equal(client.read(text),values[0])
 const restored=new MachineTranslator({storage:disk});restored.configure('api:7',true);assert.equal(restored.read(text),values[0]);restored.configure('api:8',true);assert.equal(restored.read(text),undefined)
})
test('failed or untranslated provider output is never cached as success and can be retried',async()=>{
 const {MachineTranslator}=moduleUnderTest();let count=0
 const client=new MachineTranslator({fetcher:async()=>{count++;return response(count===1?'仍然是中文':'Communication failure')}});client.configure('api:7',true)
 assert.equal(await client.request('通讯中断'),undefined);assert.equal(client.read('通讯中断'),undefined);assert.equal(client.getStatus().failed,1);await client.request('通讯中断');assert.equal(count,1)
 client.retryFailed();assert.equal(await client.request('通讯中断'),'Communication failure');assert.equal(client.getStatus().failed,0)
})
test('late responses cannot populate another account or re-enable a cancelled language',async()=>{
 const {MachineTranslator}=moduleUnderTest();let resolve,started;const begun=new Promise(r=>started=r)
 const client=new MachineTranslator({fetcher:async()=>{started();return new Promise(r=>resolve=r)}});client.configure('api:7',true);const pending=client.request('站点断线');await begun
 client.configure('api:8',true);resolve(response('Site disconnected'));assert.equal(await pending,undefined);assert.equal(client.read('站点断线'),undefined)
 client.configure('api:8',false);assert.equal(await client.request('站点断线'),undefined)
})
test('credentials and raw JSON are excluded, and oversized text is split without dropping content',async()=>{
 const {MachineTranslator}=moduleUnderTest(),queries=[]
 const client=new MachineTranslator({fetcher:async url=>{const q=new URL(url).searchParams.get('q');queries.push(q);return response(q.replace(/[\u3400-\u9fff]+/g,'Maintenance notice'))}});client.configure('api:7',true)
 assert.equal(await client.request('密码: my-private-value'),undefined);assert.equal(await client.request('{"告警":"测试"}'),undefined);assert.equal(queries.length,0)
 const translated=await client.request('设备需要定期检修。'.repeat(90)+' RACK-02');assert.ok(translated.includes('RACK-02'));assert.ok(queries.length>1);assert.ok(queries.every(q=>new TextEncoder().encode(q).length<=480))
})
test('an unavailable provider drains the queue and stops repeated external calls until retry',async()=>{
 const {MachineTranslator}=moduleUnderTest();let calls=0
 const client=new MachineTranslator({fetcher:async()=>{calls++;return{ok:false,status:429,json:async()=>({})}}});client.configure('api:7',true)
 await Promise.all(['站点通信失败','温控巡检提醒','电池离线提醒','设备升级通知'].map(text=>client.request(text)))
 assert.ok(calls<=2);assert.equal(client.getStatus().pending,0);assert.equal(client.getStatus().failed,4);await client.request('新的接口说明');assert.ok(calls<=2)
})
