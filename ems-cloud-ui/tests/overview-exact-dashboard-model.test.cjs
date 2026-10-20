const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
function load(file){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/components/',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;new Function('require','module','exports',code)(name=>{
 if(name==='@/data/stationTelemetry')return {normalizeTelemetry:samples=>samples.map(p=>({timestamp:Date.parse(p.timestamp),storage:p.quality?.storage==='bad'?null:p.values.storage}))}
 if(name==='@/preferences/date')return {dateKey:d=>Number.isFinite(new Date(d).getTime())?new Date(d).toISOString().slice(0,10):'',parseDateTimeInput:d=>new Date(d+'T00:00:00Z')}
 return {}
},module,module.exports);return module.exports}
const {observedEnergyTrend}=load('CompactOverviewDashboard.tsx')
const sample=(timestamp,storage,quality='good')=>({timestamp,values:{storage},quality:{storage:quality}})
test('observed energy integrates real signed telemetry and keeps missing days absent',()=>{
 const points=observedEnergyTrend([{telemetryHistory:[sample('2026-10-18T00:00:00Z',-100),sample('2026-10-18T01:00:00Z',-100),sample('2026-10-20T00:00:00Z',200),sample('2026-10-20T00:30:00Z',200)]}],'2026-10-18','2026-10-20')
 assert.deepEqual(points,[{date:'2026-10-18',charge:.1,discharge:0},{date:'2026-10-20',charge:0,discharge:.1}])
})
test('observed energy rejects bad quality, absent values, large gaps and out-of-range dates',()=>{
 assert.deepEqual(observedEnergyTrend([{telemetryHistory:[sample('2026-10-18T00:00:00Z',100),sample('2026-10-18T00:30:00Z',100,'bad'),sample('2026-10-18T01:00:00Z',null),sample('2026-10-18T04:00:00Z',100)]}],'2026-10-18','2026-10-20'),[])
 assert.deepEqual(observedEnergyTrend([{operations:{samples:[{timestamp:'2026-10-18T00:00:00Z',storage:-100},{timestamp:'2026-10-18T01:00:00Z',storage:100}]}}],'2026-10-19','2026-10-20'),[])
})
test('observed energy handles sign changes without counting a full interval in both directions',()=>{
 const [point]=observedEnergyTrend([{operations:{samples:[{timestamp:'2026-10-18T00:00:00Z',storage:-100},{timestamp:'2026-10-18T01:00:00Z',storage:100}]}}],'2026-10-18','2026-10-18')
 assert.equal(point.charge,.025);assert.equal(point.discharge,.025)
})
