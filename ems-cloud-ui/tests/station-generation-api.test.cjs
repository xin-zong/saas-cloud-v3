const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function service() {
 const calls = []; let error = null
 const client = { api: async(path,options) => { calls.push({path,...options}); if(error)throw error;return [] }, send: async(path,method,body) => { calls.push({path,method,body}); if(error)throw error;return {id:'p',stationId:'101',year:2026,months:[],version:1} } }
 const exports = {}
 const source = fs.readFileSync(`${__dirname}/../src/api/stationGenerationPlans.ts`,'utf8')
 new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(exports,()=>client)
 return { api:exports,calls,fail:e=>error=e }
}
const months = () => Array.from({length:12},(_,i)=>({month:i+1,plannedKwh:'1',excellentKwh:null}))
test('generation plans preserve station routes, immutable year and optimistic versions',async()=>{
 const {api,calls,fail} = service()
 await api.loadStationGenerationPlans('101');await api.loadStationGenerationPlans('101',2026)
 assert.equal(calls[0].path,'/stations/101/generation-plans')
 assert.equal(calls[1].path,'/stations/101/generation-plans?year=2026')
 await api.createStationGenerationPlan('101',2026,months())
 assert.equal(calls[2].method,'POST');assert.equal(calls[2].body.year,2026)
 assert.equal(calls[2].body.months[0].plannedKwh,'1.00')
 await api.updateStationGenerationPlan({id:'a/b',stationId:'101',year:2026,months:months(),version:7})
 assert.equal(calls[3].path,'/stations/101/generation-plans/a%2Fb')
 assert.deepEqual(Object.keys(calls[3].body).sort(),['expectedVersion','months'])
 assert.equal(calls[3].body.expectedVersion,7)
 await api.deleteStationGenerationPlan({id:'a/b',stationId:'101',version:8})
 assert.equal(calls[4].path,'/stations/101/generation-plans/a%2Fb?expectedVersion=8')
 fail(new Error('并发冲突'));await assert.rejects(api.updateStationGenerationPlan({id:'a',stationId:'101',year:2026,months:months(),version:7}),/并发冲突/)
})
test('month values remain exact decimal strings and every month is required once',()=>{
 const {api} = service();const values = months();values[0] = {month:1,plannedKwh:'99999999.99',excellentKwh:'0.01'}
 assert.equal(api.normalizeGenerationMonths(values)[0].plannedKwh,'99999999.99')
 assert.equal(api.normalizeGenerationMonths(values)[0].excellentKwh,'0.01')
 assert.equal(api.normalizeGenerationMonths(months())[0].plannedKwh,'1.00')
 const optional = months();optional[0].excellentKwh='';assert.equal(api.normalizeGenerationMonths(optional)[0].excellentKwh,null)
 for(const value of ['', '0','-1','0.001','1.000','100000000','1e2','NaN']) {
  const invalid = months();invalid[0].plannedKwh=value;assert.throws(()=>api.normalizeGenerationMonths(invalid))
 }
 assert.throws(()=>api.normalizeGenerationMonths(months().slice(1)))
 const duplicate=months();duplicate[11].month=1;assert.throws(()=>api.normalizeGenerationMonths(duplicate))
})
test('new year choices use Shanghai and include both twenty-year endpoints',()=>{
 const {api}=service();const years=api.generationPlanYears(new Date('2026-12-31T16:00:00Z'))
 assert.equal(years.length,41);assert.equal(years[0],2007);assert.equal(years[40],2047)
})
