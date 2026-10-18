const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const ts=require('typescript')
const path=require('node:path')
const file=path.join(__dirname,'../src/components/reference-dashboard-model.ts')
const moduleUnderTest={exports:{}}
if(fs.existsSync(file))new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(moduleUnderTest.exports,require)
const model=moduleUnderTest.exports
test('rankings exclude unauthorized stations and missing values while preserving measured zero',()=>{
 assert.equal(typeof model.dashboardRanking,'function')
 const rows=[{id:'a',name:'A'},{id:'b',name:'B'}]
 const card={ranking:[{stationId:'secret',value:999},{stationId:'a',value:0},{stationId:'b',value:4},{stationId:'a',value:null}]}
 assert.deepEqual(model.dashboardRanking(card,rows,false).map(r=>[r.id,r.value]),[['a',0],['b',4]])
 assert.deepEqual(model.dashboardRanking(card,rows,true).map(r=>r.id),['b','a'])
})
test('unavailable selected month never reuses a different month record',()=>{
 assert.equal(typeof model.dashboardPeriodRecord,'function')
 const card={value:24,trend:{start:'2026-09-01'}}
 assert.equal(model.dashboardPeriodRecord(card,'2026-10','month'),undefined)
 assert.equal(model.dashboardPeriodRecord(card,'2026-09','month'),card)
 assert.equal(model.dashboardPeriodRecord(card,'2026','year'),card)
 assert.equal(model.dashboardPeriodRecord({value:24},'2026','year'),undefined)
})
test('daily chart inserts null gaps and retains explicit zero across month boundary',()=>{
 assert.equal(typeof model.dashboardAxisPoints,'function')
 assert.deepEqual(model.dashboardAxisPoints({start:'2026-09-30',end:'2026-10-02',granularity:'day',series:['metric'],points:[{date:'2026-09-30',values:{metric:0}},{date:'2026-10-02',values:{metric:3}}]}),[{date:'2026-09-30',metric:0},{date:'2026-10-01',metric:null},{date:'2026-10-02',metric:3}])
})
