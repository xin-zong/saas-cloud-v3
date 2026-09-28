const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function setup() {
 const cache = new Map(), storage = new Map()
 global.sessionStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }
 global.window = { dispatchEvent() {} }
 function load(path) {
  if(cache.has(path)) return cache.get(path)
  const exports={};cache.set(path,exports)
  const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${path}.ts`,'utf8').replaceAll('import.meta.env','{}'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('exports','require',code)(exports,name=>name==='react'?require('react'):load(name==='@/api/client'?'api/client':name.startsWith('./')?`components/${name.slice(2)}`:name.replace('@/','')))
  return exports
 }
 return { ...load('components/apiAnalytics'), ...load('components/stationAnalysisData'), ...load('components/useAnalysisJobs'), client:load('api/client') }
}
const point={id:'19',name:'SOC',unit:'%',device_id:'5',device_name:'BMSdevice5',source:'ems',sourceId:'20018',namespace:'cabinet',valueType:'number',aggregation:['last']}
test('confirmed EMS directory chooses last and keeps exact invalid and typed evidence',async()=>{
 const service=setup(),urls=[]
 const evidence=[{sourceTime:1000,receivedAt:1100,value:'9007199254740993.000001',valueType:'number',quality:'valid'}]
 global.fetch=async url=>{urls.push(String(url));return {ok:true,status:200,json:async()=>({code:0,data:[
 {timestamp:1000,value:evidence[0].value,quality:'valid',samples:1,aggregation:'last',evidence},
 {timestamp:2000,value:'fault',quality:'valid',samples:1,aggregation:'last',evidence:[{sourceTime:2000,valueType:'text',value:'fault',quality:'valid'}]},
 {timestamp:3000,value:null,quality:'invalid',samples:1,aggregation:'last',evidence:[{sourceTime:3000,valueType:'null',value:null,quality:'invalid'}]}
 ]})}}
 const rows=await service.loadHistory(point,new Date(0),new Date(60000),1)
 assert.match(urls[0],/source=ems/);assert.match(urls[0],/aggregation=last/)
 assert.equal(rows.length,3);assert.equal(rows[0].exactValue,evidence[0].value);assert.equal(rows[1].value,null);assert.equal(rows[1].exactValue,'fault');assert.equal(rows[2].quality,'invalid')
 assert.match(service.historyCsv(point,rows),/9007199254740993.000001/)
 assert.match(service.historyCsv(point,rows),/value_type/)
 assert.match(service.historyCsv(point,rows),/source_id/)
 assert.match(service.historyCsv(point,rows),/20018/)
 await assert.rejects(service.loadHistory({...point,aggregation:['last']},new Date(0),new Date(60000),1,undefined,'avg'),/聚合/)
})
test('registered channels show actual devices and default selection stays bounded',()=>{
 const service=setup(),points=Array.from({length:1000},(_,i)=>({...point,id:String(i)}))
 assert.equal(service.registeredChannels([point])[0].group,'BMSdevice5')
 assert.equal(service.defaultAnalysisPoints(points).length,4)
 assert.equal(service.defaultAnalysisPoints([{...point,valueType:'text'},point]).length,1)
 for(const valueType of ['u16_words','bitmap','unknown','null','text']) assert.equal(service.numericPoint({...point,valueType}),false)
 assert.equal(service.pointMatchesMetric({...point,name:'模拟 BMS SOC'},'soc'),true)
 assert.equal(service.pointMatchesMetric({...point,namespace:'ems'},'soc'),false)
 assert.equal(service.pointMatchesMetric({...point,sourceId:'20024',name:'模拟电池功率'},'energy'),true)
})
test('job CSV failures and changed sessions never save stale files',async()=>{
 const service=setup();service.client.setToken('token')
 let saves=0
 global.URL.createObjectURL=()=>{saves++;return 'blob:test'}
 global.document={body:{appendChild(){}},createElement:()=>({click(){},remove(){}})}
 global.window.setTimeout=()=>{}
 const job={id:'job-1',stationId:'4',kind:'telemetry',status:'completed'}
 global.fetch=async()=>({ok:false,status:403,json:async()=>({msg:'站点授权已撤销'})})
 await assert.rejects(service.downloadAnalysisJob(job),/授权已撤销/);assert.equal(saves,0)
 global.fetch=async()=>({ok:true,status:200,headers:{get:()=> 'text/csv'},blob:async()=>{service.client.setToken('new-token');return new Blob(['exact_value\n1\n'])}})
 await assert.rejects(service.downloadAnalysisJob(job),/会话已变化/);assert.equal(saves,0)
})
test('historical rows preserve gaps and expose exact channel evidence',async()=>{
 const service=setup()
 global.fetch=async()=>({ok:true,status:200,json:async()=>({code:0,data:[{timestamp:0,value:'1.0000000000001',quality:'valid',aggregation:'last',samples:1,evidence:[{valueType:'number',value:'1.0000000000001',quality:'valid',sourceTime:0,receivedAt:1}]},{timestamp:120000,value:'3',quality:'valid',aggregation:'last',samples:1,evidence:[{valueType:'number',value:'3',quality:'valid',sourceTime:120000,receivedAt:120001}]}]})})
 const rows=await service.queryRegisteredTelemetry([point],new Date(0),new Date(180000),1,new AbortController().signal)
 assert.equal(rows[1]['point:19'],null);assert.equal(service.analysisEvidence(rows[0],'point:19').exactValue,'1.0000000000001')
})
test('valid text and bitmap evidence counts as available data without becoming a numeric curve',()=>{
 const service=setup()
 const [row]=service.mergeAnalysisSnapshot([],{serverTime:1000,items:[{pointId:'19',value:[65535,0],valueType:'u16_words',quality:'valid',sourceTime:900,receivedAt:1000}]},['point:19'])
 assert.equal(row['point:19'],null)
 assert.equal(service.validChannelSample(row,'point:19'),true)
 assert.deepEqual(service.analysisEvidence(row,'point:19').exactValue,[65535,0])
})
test('live snapshots deduplicate source samples, preserve text and invalid quality, and show gaps',()=>{
 const service=setup(),snapshot={serverTime:120100,items:[{pointId:'19',value:'30.00000001',valueType:'number',quality:'valid',sourceTime:120000,receivedAt:120100}]}
 let rows=service.mergeAnalysisSnapshot([],snapshot,['point:19'])
 rows=service.mergeAnalysisSnapshot(rows,snapshot,['point:19'])
 assert.equal(rows.length,1);assert.equal(service.analysisEvidence(rows[0],'point:19').exactValue,'30.00000001')
 rows=service.mergeAnalysisSnapshot(rows,{...snapshot,items:[{...snapshot.items[0],sourceTime:240000,value:'fault',valueType:'text',quality:'invalid'}]},['point:19'])
 assert.equal(rows.at(-1)['point:19'],null);assert.equal(service.analysisEvidence(rows.at(-1),'point:19').quality,'invalid')
 assert(rows.some(row=>row.timestamp>120000&&row.timestamp<240000&&row['point:19']===null))
 rows=service.mergeAnalysisSnapshot(rows,{serverTime:250000,items:[]},['point:19'])
 assert.equal(rows.at(-1)['point:19'],null)
 assert.equal(service.latestChannelEvidence(rows,'point:19').exactValue,null)
 assert.equal(service.latestChannelEvidence(rows,'point:19').sourceTime,null)
 rows=service.mergeAnalysisSnapshot(rows,{serverTime:260000,items:[{...snapshot.items[0],receivedAt:260000}]},['point:19'])
 assert.equal(service.latestChannelEvidence(rows,'point:19',true).exactValue,'30.00000001')
})
test('persisted jobs use selected station and offset timestamps with bounded export validation',async()=>{
 const service=setup(),calls=[]
 global.fetch=async(url,options)=>{calls.push({url:String(url),options});return {ok:true,status:200,json:async()=>({code:0,data:String(url).includes('?')?[]:{id:'job',stationId:'4',kind:'telemetry',status:'completed'}})}}
 const request={kind:'telemetry',from:'2026-09-28T00:00:00+08:00',to:'2026-09-29T00:00:00+08:00',minutes:0,pointIds:['19','21']}
 await service.createAnalysisJob('4',request)
 assert.deepEqual(JSON.parse(calls[0].options.body),request)
 await service.listAnalysisJobs('4','telemetry',new AbortController().signal,20)
 assert.match(calls[1].url,/stations\/4\/analysis-jobs\?kind=telemetry&limit=20&offset=20/)
 await assert.rejects(service.createAnalysisJob('4',{...request,from:'2026-09-28T00:00:00'}),/时区/)
 await assert.rejects(service.createAnalysisJob('4',{...request,pointIds:Array.from({length:201},(_,i)=>String(i+1))}),/200/)
 await assert.rejects(service.createAnalysisJob('4',{...request,to:'2026-11-29T00:00:00+08:00'}),/31/)
})
test('calendar report dates map to half-open local intervals including the last day',()=>{
 const service=setup(),range=service.reportDateRange('2026-09-28','2026-09-29')
 assert.equal(Date.parse(range.to)-Date.parse(range.from),2*86400000)
 assert.equal(range.to,'2026-09-29T16:00:00.000Z')
 assert.throws(()=>service.reportDateRange('2026-02-30','2026-03-02'),/有效/)
})
test('report bounds and displayed dates stay on Shanghai business days in UTC and DST browsers',()=>{
 const service=setup(),previous=process.env.TZ
 try {
  for(const zone of ['UTC','America/New_York','Asia/Shanghai']) {
   process.env.TZ=zone
   assert.deepEqual(service.reportDateRange('2026-09-29','2026-09-29'),{from:'2026-09-28T16:00:00.000Z',to:'2026-09-29T16:00:00.000Z'})
   assert.deepEqual(service.reportDateRange('2026-03-07','2026-03-08'),{from:'2026-03-06T16:00:00.000Z',to:'2026-03-08T16:00:00.000Z'})
   assert.equal(service.reportBusinessDate('2026-09-28T16:00:00Z'),'2026/9/29')
  }
 } finally { if(previous===undefined) delete process.env.TZ;else process.env.TZ=previous }
})
test('live evidence expires locally after a disconnected interval without changing stored historical quality',()=>{
 const service=setup(),sample={timestamp:1000,sourceTime:1000,receivedAt:2000,value:42,exactValue:'42.000001',valueType:'number',quality:'valid',samples:1}
 assert.equal(service.liveChannelEvidence(sample,91000).staleReason,undefined)
 assert.equal(service.liveChannelEvidence(sample,91001).staleReason,'source_time_expired')
 assert.equal(service.liveChannelEvidence({...sample,sourceTime:100000},100001).staleReason,'received_time_expired')
 assert.equal(service.liveChannelEvidence({...sample,staleReason:'heartbeat_expired'},100001).staleReason,'heartbeat_expired')
 assert.equal(sample.quality,'valid');assert.equal(sample.staleReason,undefined);assert.equal(sample.exactValue,'42.000001')
 // Pausing freezes the evaluation clock at the last view time, preserving its explicitly labeled snapshot.
 assert.equal(service.liveChannelEvidence(sample,2000).staleReason,undefined)
 assert.equal(service.liveChannelEvidence(undefined,2000),undefined)
})
test('report capabilities require every station permission used by the backend',()=>{
 const service=setup(),check=grants=>code=>grants.includes(code)
 assert.equal(service.reportCapabilityAllowed('operations',check(['report.export','strategy.read'])),false)
 assert.equal(service.reportCapabilityAllowed('operations',check(['report.export','strategy.read','telemetry.read'])),true)
 assert.equal(service.reportCapabilityAllowed('health',check(['report.export','asset.read','telemetry.read'])),false)
 assert.equal(service.reportCapabilityAllowed('health',check(['report.export','asset.read','alarm.read','telemetry.read'])),true)
 assert.equal(service.reportCapabilityAllowed('revenue',check(['report.export','revenue.read'])),true)
 assert.equal(service.reportCapabilityAllowed('revenue',check(['revenue.read'])),false)
})
test('persisted records only display the currently authorized station and selected report kind',()=>{
 const service=setup(),rows=[{id:'one',stationId:'4',kind:'telemetry'},{id:'two',stationId:'5',kind:'telemetry'},{id:'three',stationId:'4',kind:'health'}]
 assert.deepEqual(service.scopedAnalysisJobs(rows,'4','telemetry'),[rows[0]])
 assert.deepEqual(service.scopedAnalysisJobs(rows,'4','health'),[rows[2]])
 assert.deepEqual(service.scopedAnalysisJobs(rows,'6','health'),[])
})
