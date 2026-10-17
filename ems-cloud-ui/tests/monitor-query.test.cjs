const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(){const m={exports:{}};new Function('require','exports','module',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/api/monitor.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({}),m.exports,m);return m.exports}
test('chart rows preserve zero, explicit missing buckets and station isolation',()=>{
 const {monitorChartRows}=load();const rows=monitorChartRows([{stationId:'1',timestamp:0,value:0},{stationId:'1',timestamp:7200000,value:3},{stationId:'2',timestamp:0,value:8}],['1','2'],0,10800000,60);
 assert.deepEqual(rows,[{timestamp:0,'1':0,'2':8},{timestamp:3600000,'1':null,'2':null},{timestamp:7200000,'1':3,'2':null}]);
});
test('default widget geometry is non-overlapping and card ordering is preserved',()=>{const {defaultMonitorLayout}=load();assert.deepEqual(defaultMonitorLayout(['a','b','c']),[{card:'a',x:0,y:0,w:6,h:3},{card:'b',x:6,y:0,w:6,h:3},{card:'c',x:0,y:3,w:6,h:3}])});
