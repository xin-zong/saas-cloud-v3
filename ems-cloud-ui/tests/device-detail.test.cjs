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

test('stored stale samples retain last-known zero and text with source time without becoming live',()=>{
 const d=load(),p={id:1,name:'功率',unit:'kW'},row={sourceType:'stored_device',value:'0',valueType:'number',quality:'valid',sourceTime:1000,staleReason:'source_older_than_90_seconds'};
 const value=d.detailPoint(p,row);assert.equal(value.value,null);assert.equal(value.lastKnownValue,'0');assert.equal(value.sourceTime,1000);assert.match(d.formatPoint(value),/0 kW/);
 assert.equal(d.detailPoint(p,{...row,value:'停机',valueType:'text'}).lastKnownValue,'停机');assert.equal(d.detailPoint(p,{...row,value:null}).lastKnownValue,undefined);
})

test('energy roles require a unique physical measurement and never sum stack plus cluster',()=>{
 const d=load(),p={id:'1',label:'power',unit:'kW',value:null,quality:'bad',sourceType:'stored_device',semanticKey:'batteryPower',lastKnownValue:'0',sourceTime:1000,staleReason:'expired'};
 assert.equal(d.lastKnownNumber(d.semanticPoint([{points:[p]}],'batteryPower')),0);
 assert.equal(d.semanticPoint([{points:[p]},{points:[{...p,id:'2'}]}],'batteryPower'),undefined);
 assert.equal(d.lastKnownNumber({...p,lastKnownValue:'fault'}),null);
})

test('verified parent stack supplies aggregate role only when every cluster belongs to it',()=>{
 const d=load(),p={id:'1',semanticKey:'soc'},stack={id:'stack',sourceType:'31002',points:[p]},cluster={id:'cluster',sourceType:'31001',parentDeviceId:'stack',points:[{...p,id:'2'}]};
 assert.equal(d.semanticPoint([stack,cluster],'soc'),p);
 assert.equal(d.semanticPoint([stack,{...cluster,parentDeviceId:undefined}],'soc'),undefined);
 assert.equal(d.semanticPoint([stack,{...cluster,parentDeviceId:'other'}],'soc'),undefined);
})

test('overview resolves canonical battery voltage/current while retaining native metrics and rejecting ambiguity',()=>{
 const d=load(),voltage={id:'900',semanticKey:'voltage',label:'总电压',unit:'V',value:null,quality:'bad',sourceType:'stored_device',valueType:'number',lastKnownValue:'767.2',staleReason:'source_older_than_90_seconds'},current={...voltage,id:'901',semanticKey:'current',label:'总电流',unit:'A',lastKnownValue:'0'};
 const battery={sourceType:'Battery Cluster',points:[voltage,current]};
 assert.equal(d.deviceMetricPoint(battery,'dcVoltage'),voltage);assert.equal(d.deviceMetricPoint(battery,'dcCurrent'),current);
 assert.match(d.formatPoint(d.deviceMetricPoint(battery,'dcVoltage')),/767.2 V/);assert.match(d.formatPoint(d.deviceMetricPoint(battery,'dcCurrent')),/0 A/);
 const native={id:'20',metric:'dcVoltage',unit:'V',value:800,quality:'good'};assert.equal(d.deviceMetricPoint({points:[native]},'dcVoltage'),native);
 assert.equal(d.deviceMetricPoint({...battery,points:[voltage,{...voltage,id:'902'}]},'dcVoltage'),undefined);
 assert.equal(d.deviceMetricPoint({sourceType:'Smart Meter',points:[voltage]},'dcVoltage'),undefined);
})
