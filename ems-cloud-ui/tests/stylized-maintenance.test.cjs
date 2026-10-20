const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const source=path.resolve(__dirname,'../src/components/maintenance/stylizedSummary.ts')
function load(){const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m);return m.exports}
test('weekly maintenance preserves unknown coverage and counts occurrence and recovery separately',()=>{
const {buildWeekMaintenance}=load(),now=Date.parse('2026-10-20T12:00:00Z'),days=['2026-10-19','2026-10-20'],day=t=>new Date(t).toISOString().slice(0,10)
const row={alarmsKnown:true,alarms:[{id:'a',severity:'critical',status:'active',occurredAt:'2026-10-19T10:00:00Z'},{id:'b',severity:'warning',status:'recovered',occurredAt:'2026-10-18T10:00:00Z',recoveredAt:'2026-10-20T10:00:00Z'},{id:'future',severity:'critical',status:'active',occurredAt:'2026-10-20T23:00:00Z'}]}
const result=buildWeekMaintenance([row],now,days,day);assert.equal(result.total,1);assert.equal(result.critical,1);assert.equal(result.active,1);assert.equal(result.recovered,1);assert.deepEqual(result.trend.map(x=>[x.added,x.recovered]),[[1,0],[0,1]])
assert.equal(buildWeekMaintenance([row,{alarmsKnown:false,alarms:[]}],now,days,day).total,null)
assert.equal(buildWeekMaintenance([],now,days,day).total,null)
})
