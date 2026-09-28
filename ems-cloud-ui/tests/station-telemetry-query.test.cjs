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
