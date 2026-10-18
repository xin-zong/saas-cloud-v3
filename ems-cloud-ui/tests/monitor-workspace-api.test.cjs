const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(){const m={exports:{}};new Function('require','exports','module',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/api/monitorWorkspace.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(()=>({api:async(path,options)=>({path,options}),send:async(path,method,body)=>({path,method,body})}),m.exports,m);return m.exports}
test('monitor query encodes filters and carries cancellation, saves expected version',async()=>{
 const x=load(),c=new AbortController();const response=await x.loadWorkspace({search:'A&B',minCapacity:'0',limit:2},c.signal)
 assert.equal(response.path,'/monitor/workspace?search=A%26B&minCapacity=0&limit=2');assert.equal(response.options.signal,c.signal)
 assert.deepEqual(await x.saveWorkspacePreferences({settings:{fieldView:'solar'},watchedStationIds:['12'],version:3}),{path:'/monitor/workspace/preferences',method:'PUT',body:{settings:{fieldView:'solar'},watchedStationIds:['12'],expectedVersion:3}})
})
test('display preserves real zero, null stays missing and CSV escapes injected formulas',()=>{
 const x=load();assert.equal(x.metricText(0),'0');assert.equal(x.metricText(null),'—');assert.equal(x.metricText(undefined),'—')
 const csv=x.workspaceCsv([{id:'1',name:'=1+1',scene:'PV',communication:'unknown',source:'reference_capture',updatedAt:null,metrics:{pvDaily:0}}],['pvDaily'])
 assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"0"'));assert.ok(csv.includes('快照'));assert.ok(!csv.includes('undefined'))
})
