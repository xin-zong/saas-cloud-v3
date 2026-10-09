const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(name,deps){const source=fs.readFileSync(`${__dirname}/../src/${name}.ts`,'utf8');const m={exports:{}};new Function('require','exports','module',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(key=>deps[key],m.exports,m);return m.exports}
test('station curves query EMS protocol identities with full metadata and preserve missing buckets',async()=>{
 const telemetry=load('data/stationTelemetry',{}),calls=[];
 const points=[{id:'19',name:'模拟-任意显示名称',unit:'%',source:'ems',sourceId:'20018',namespace:'cabinet'},
 {id:'21',name:'电压',unit:'V',source:'ems',sourceId:'20021',namespace:'cabinet'},
 {id:'29',name:'最高温度',unit:'℃',source:'ems',sourceId:'20029',namespace:'cabinet'},
 {id:'99',name:'光伏功率',unit:'kW',source:'ems',sourceId:'99999',namespace:'cabinet'}];
 const query=load('components/stationTelemetryQuery',{'@/data/stationTelemetry':telemetry,'./apiAnalytics':{loadPoints:async()=>points,loadHistory:async point=>{calls.push(point);return[{timestamp:1000,value:point.id==='21'?null:55,samples:1}]}}});
 const rows=await query.queryStationTelemetry({id:'4'},new Date(0),new Date(60000),1,new AbortController().signal);
 assert.deepEqual(calls.map(point=>point.id),['19','29','21']);assert.equal(calls[0].source,'ems');assert.equal(rows[0].values.soc,55);assert.equal(rows[0].values.dcVoltage,null);assert.equal(rows[0].values.temperature,55);assert.equal(rows[0].values.pv,undefined);
})

test('EMS mappings take precedence over legacy summary points and preserve ambiguity',async()=>{
 const telemetry=load('data/stationTelemetry',{}),calls=[];
 const points=[{id:'26',name:'储能功率',unit:'kW',source:'legacy'},
 {id:'28',name:'SOC',unit:'%',source:'legacy'},
 {id:'78',name:'光伏功率',unit:'kW',source:'legacy'},
 {id:'19',name:'BMS SOC',unit:'%',source:'ems',sourceId:'20018',namespace:'cabinet'},
 {id:'800',name:'bms power',unit:'kW',source:'ems',sourceId:'20024',namespace:'cabinet'},
 {id:'883',name:'pvdc power',unit:'kW',source:'ems',sourceId:'20107',namespace:'cabinet'},
 {id:'1024',name:'grid power',unit:'kW',source:'ems',sourceId:'20248',namespace:'cabinet'}];
 const query=load('components/stationTelemetryQuery',{'@/data/stationTelemetry':telemetry,'./apiAnalytics':{loadPoints:async()=>points,loadHistory:async point=>{calls.push(point);return[{timestamp:1000,value:12,samples:1}]}}});
 const rows=await query.queryStationTelemetry({id:'4'},new Date(0),new Date(60000),1,new AbortController().signal);
 assert.deepEqual(calls.map(point=>point.id),['19','800','883','1024']);
 assert.equal(rows[0].values.storage,12);assert.equal(rows[0].values.pv,12);assert.equal(rows[0].intervalMinutes,undefined);
 calls.length=0;points.push({...points[4],id:'801'});
 await query.queryStationTelemetry({id:'4'},new Date(0),new Date(60000),1,new AbortController().signal);
 assert.equal(calls.some(point=>['26','800','801'].includes(point.id)),false);
})

test('live trend date follows today while demo date follows loaded evidence',()=>{
 const clock=load('data/dataClock',{'./operations':{operationsDate:()=>''}});
 const station={telemetryHistory:[],maintenance:{alarms:[{occurredAt:'2026-09-25T08:00:00+08:00'}]},deviceInventory:[]};
 assert.equal(clock.stationTrendDate(station,false,new Date('2026-10-08T12:00:00')), '2026-10-08');
 assert.equal(clock.stationTrendDate(station,true,new Date('2026-10-08T12:00:00')), '2026-09-25');
})

test('isolated trend values remain visible including zero and gaps',()=>{
 const {hasIsolatedTelemetryValue}=load('data/stationTelemetry',{});
 assert.equal(hasIsolatedTelemetryValue([{soc:null},{soc:0},{soc:null}],'soc'),true);
 assert.equal(hasIsolatedTelemetryValue([{soc:55},{soc:56}],'soc'),false);
 assert.equal(hasIsolatedTelemetryValue([{soc:55},{soc:null},{soc:56}],'soc'),true);
 assert.equal(hasIsolatedTelemetryValue([{soc:null},{soc:NaN}],'soc'),false);
})
