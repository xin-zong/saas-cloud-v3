const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(){const exports={};new Function('exports',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/data/referenceHistoryExport.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);return exports}
test('five-day export includes selected day and four preceding calendar days',()=>{
 const m=load();assert.deepEqual(m.historyExportDates('2026-10-18',5),{start:'2026-10-14',end:'2026-10-18',until:'2026-10-19'})
 assert.deepEqual(m.historyExportDates('2024-03-02',5),{start:'2024-02-27',end:'2024-03-02',until:'2024-03-03'})
 assert.deepEqual(m.historyExportDates('2026-01-02',5),{start:'2025-12-29',end:'2026-01-02',until:'2026-01-03'})
 assert.deepEqual(m.historyExportDates('2026-03-29',1),{start:'2026-03-29',end:'2026-03-29',until:'2026-03-30'})
 for(const date of ['2026-02-30','','2026-1-02'])assert.throws(()=>m.historyExportDates(date,5))
 assert.throws(()=>m.historyExportDates('2026-10-18',6))
})
test('selected and all export use only the current device registry without chart selection caps',()=>{
 const m=load(),points=Array.from({length:20},(_,i)=>({id:i+1,name:`Parameter ${i+1}`}))
 assert.deepEqual(m.historyExportPointIds('selected',[3,1],points),[1,3])
 assert.deepEqual(m.historyExportPointIds('all',[999],points),points.map(p=>p.id))
 assert.throws(()=>m.historyExportPointIds('selected',[999],points))
 assert.throws(()=>m.historyExportPointIds('selected',[],points))
 assert.throws(()=>m.historyExportPointIds('selected',[1,1],points))
 assert.throws(()=>m.historyExportPointIds('all',[],[{id:1},{id:1}]))
})
