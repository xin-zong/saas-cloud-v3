const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs'),ts=require('typescript')
function load(){const exports={};const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/data/stationDevices.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('exports','require',code)(exports,()=>({localized:()=>''}));return exports}
test('nine categories have distinct metric sections including battery monomers and logger communication',()=>{
 const d=load();assert.equal(d.DEVICE_TYPES.length,9)
 assert.ok(d.DEVICE_SCHEMAS['battery-cluster'].sections.includes('单体电压'))
 assert.ok(d.DEVICE_SCHEMAS['battery-stack'].sections.includes('下属电池簇'))
 assert.ok(d.DEVICE_SCHEMAS.logger.sections.includes('通信与采集'))
 assert.notDeepEqual(d.DEVICE_SCHEMAS.inverter.sections,d.DEVICE_SCHEMAS.meter.sections)
 assert.equal(d.deviceTypeFromSource('18_5000','OTHER'),'logger');assert.equal(d.deviceTypeFromSource('18_5001','OTHER'),'ems')
})
test('telemetry adapter preserves missing invalid stale typed and exact numeric readings',()=>{
 const d=load(),p={id:1,name:'SOC',unit:'%'}
 assert.equal(d.detailPoint(p,undefined).value,null)
 assert.equal(d.detailPoint(p,{value:'8',valueType:'number',quality:'valid',staleReason:'expired'}).value,null)
 assert.equal(d.detailPoint(p,{value:'fault',valueType:'text',quality:'valid'}).value,null)
 assert.equal(d.formatPoint(d.detailPoint(p,{value:'fault',valueType:'text',quality:'valid'})),'fault')
 assert.equal(d.detailPoint(p,{value:true,valueType:'boolean',quality:'valid'}).quality,'good')
 const exact='9007199254740993.00001',point=d.detailPoint(p,{value:exact,valueType:'number',quality:'valid',staleReason:null})
 assert.equal(point.exactValue,exact);assert.equal(point.quality,'good')
})
test('battery arrays preserve their accepted BMU slots and never promote stale values to live cells',()=>{
 const d=load(),row={kind:'voltage',value:[['3.327',null],['3.331']],bmuSlots:['2','4'],quality:'valid',staleReason:null}
 assert.deepEqual(d.cellGroups(row),[{slot:'2',values:['3.327','—']},{slot:'4',values:['3.331']}])
 assert.deepEqual(d.cellGroups({...row,staleReason:'expired'}),[])
 assert.deepEqual(d.cellGroups({...row,quality:'invalid'}),[])
})
test('device history inserts explicit null gaps without inventing samples',()=>{
 const d=load();assert.deepEqual(d.deviceHistoryChart([{timestamp:0,value:1},{timestamp:1800000,value:3}]),[{timestamp:0,value:1},{timestamp:900000,value:null},{timestamp:1800000,value:3}])
 assert.deepEqual(d.deviceHistoryChart([]),[])
})
test('device alarm read is filtered by station and device and never marks a receipt',async()=>{
 const exports={},calls=[];const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/api/deviceDetails.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','require',code)(exports,()=>({api:async path=>{calls.push(path);return {items:[],total:0}},send:()=>{throw new Error('unexpected mutation')}}));
 assert.deepEqual(await exports.loadDeviceAlarms('12','4',20),{items:[],total:0});const url=new URL(calls[0],'http://local');assert.equal(url.pathname,'/alarms/workspace');assert.equal(url.searchParams.get('stationId'),'12');assert.equal(url.searchParams.get('deviceId'),'4');assert.equal(url.searchParams.get('offset'),'20')
})
