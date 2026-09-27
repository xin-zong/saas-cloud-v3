const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(name, cache = new Map()) {
 if(cache.has(name)) return cache.get(name)
 const filename = `${__dirname}/../src/api/${name}.ts`
 if(!fs.existsSync(filename)) return {}
 const code = ts.transpileModule(fs.readFileSync(filename,'utf8').replaceAll('import.meta.env','{}'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 const exports = {}; cache.set(name,exports)
 new Function('exports','require',code)(exports,n=>load(n.replace('./',''),cache)); return exports
}
function setup() {
 const storage=new Map(); global.sessionStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}
 global.window={dispatchEvent(){}}; return load('ems')
}
test('EMS observations preserve null, exact decimals, opaque revisions, words and quality',()=>{
 const service=setup(); assert.equal(typeof service.adaptObservation,'function')
 for(const value of [null,'900719925474099312345.00000000000001','firmware-001',[65535,0]]) {
 const row=service.adaptObservation({pointId:'9007199254740993',value,quality:'invalid',sourceTime:null,receivedAt:1,bindingPeriodId:'9007199254740997',revision:'01'})
 assert.deepEqual(row.value,value); assert.equal(row.pointId,'9007199254740993'); assert.equal(row.quality,'invalid'); assert.equal(row.sourceTime,null); assert.equal(row.revision,'01')
 }
 assert.equal(service.chartNumber({value:null,valueType:'number',quality:'valid'}),null)
 assert.equal(service.chartNumber({value:'12',valueType:'text',quality:'valid'}),null)
 assert.equal(service.chartNumber({value:'12',valueType:'number',quality:'invalid'}),null)
 assert.equal(service.chartNumber({value:'12.5',valueType:'number',quality:'valid'}),12.5)
})
test('station EMS requests are authorized and exact history uses explicit EMS aggregation',async()=>{
 const service=setup(); assert.equal(typeof service.loadStationEms,'function')
 const calls=[]; global.fetch=async(url,options)=>{calls.push(String(url));return {ok:true,status:200,json:async()=>({code:0,data:String(url).includes('telemetry/latest')?{items:[],total:0,hasMore:false}:[]})}}
 const user={stationPermissions:{'12':['ems.read','telemetry.read']}}
 await assert.rejects(service.loadStationEms(user,'13',new AbortController().signal),/权限/); assert.equal(calls.length,0)
 const data=await service.loadStationEms(user,'12',new AbortController().signal);assert.deepEqual(data.gateways,[]);assert.deepEqual(data.latest.items,[])
 await service.loadEmsHistory('9007199254740993',new Date(0),new Date(60000),'last',1,new AbortController().signal)
 assert.match(calls.at(-1),/source=ems/);assert.match(calls.at(-1),/aggregation=last/);assert.match(calls.at(-1),/9007199254740993/)
})
test('visible refresh aborts replaced work and a late resolution cannot publish after scope revocation',async()=>{
 const service=setup(); assert.equal(typeof service.createLatestRequest,'function')
 const outputs=[];const requests=[];const gate=service.createLatestRequest(v=>outputs.push(v))
 let firstResolve,secondResolve
 const a=gate.run(signal=>{requests.push(signal);return new Promise(r=>firstResolve=r)})
 const b=gate.run(signal=>{requests.push(signal);return new Promise(r=>secondResolve=r)})
 assert.equal(requests[0].aborted,true);secondResolve('new');await b;firstResolve('old');await a;assert.deepEqual(outputs,['new'])
 let resolve;const c=gate.run(signal=>{requests.push(signal);return new Promise(r=>resolve=r)});gate.cancel();resolve('revoked');await c
 assert.equal(requests.at(-1).aborted,true);assert.deepEqual(outputs,['new'])
})
test('EMS-only station grant has a platform entry without granting unrelated business permissions', () => {
 const source=fs.readFileSync(`${__dirname}/../src/auth/apiPermissions.ts`,'utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
 const exports={};new Function('exports','require',code)(exports,()=>({ROLE_CONFIG:{owner:{defaultNav:'总览'}}}))
 const result=exports.apiRoleConfig({role:'owner',permissions:['ems.manage'],stationPermissions:{'12':['ems.manage']}})
 assert(result.nav.includes('平台管理'));assert.deepEqual(result.platformTabs,[])
})
test('manual work orders retain the server business alarm linkage',()=>{
 const service=load('adapters');assert.equal(service.adaptOrder({id:'99',alarm_id:'88',title:'真实关联工单'}).alarmId,'88')
})
test('historical buckets use typed evidence independently of absent or null latest values',()=>{
 const service=setup()
 assert.equal(service.historyChartNumber({value:'12.5',quality:'valid',aggregation:'last',evidence:[{valueType:'number',value:'12.5'}]}),12.5)
 assert.equal(service.historyChartNumber({value:'12',quality:'valid',aggregation:'last',evidence:[{valueType:'text',value:'12'}]}),null)
 assert.equal(service.historyChartNumber({value:'7',quality:'valid',aggregation:'avg',evidence:[{valueType:'number',value:'6',quality:'valid'},{valueType:'number',value:'8',quality:'valid'}]}),7)
 assert.equal(service.historyChartNumber({value:'7',quality:'valid',aggregation:'avg',evidence:[]}),null)
})
