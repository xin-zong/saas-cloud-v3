const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const vm=require('node:vm')
const ts=require('typescript')

// Transport/DOM contract tests only; these do not prove browser file receipt.
function harness({status=200,type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',afterFetch,afterBlob}={}){
 const calls=[],bytes=new Uint8Array([80,75,3,4]),blob=new Blob([bytes]);let token='test-token',session=4
 class ApiError extends Error{constructor(message,status){super(message);this.status=status}}
 const client={BASE_URL:'/api',getToken:()=>token,getSessionVersion:()=>session,setToken:v=>{token=v;calls.push(['token',v])},refreshAfterForbidden:async()=>calls.push(['refresh']),ApiError}
 const link={href:'',download:'',click(){calls.push(['click',this.href,this.download])},remove(){calls.push(['remove'])}}
 const scope={exports:{},require:()=>client,URLSearchParams,URL:{createObjectURL:b=>{calls.push(['blob',b]);return 'blob:test-download'},revokeObjectURL:u=>calls.push(['revoke',u])},Event,
  document:{createElement:name=>{assert.equal(name,'a');return link},body:{appendChild:a=>{assert.equal(a,link);calls.push(['append'])}}},
  window:{dispatchEvent:e=>calls.push(['event',e.type]),setTimeout:(f,ms)=>{calls.push(['timer',ms]);scope.cleanup=f}},
  fetch:async(url,options)=>{calls.push(['fetch',url,options]);afterFetch?.(()=>session++);return {ok:status===200,status,headers:{get:()=>type},json:async()=>({msg:'denied'}),blob:async()=>{afterBlob?.(()=>session++);return blob}}}}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../src/api/stationHistoryExport.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope)
 return {run:()=>scope.exports.downloadStationHistory('站/21',{period:'total',date:'2025:2026',scene:'grid',fields:['activeKw','powerFactor']}),calls,blob,cleanup:()=>scope.cleanup?.()}
}

test('export preserves selected fields, authorization, XLSX bytes and safe filename before initiating download',async()=>{
 const h=harness();await h.run();const request=h.calls.find(c=>c[0]==='fetch'),url=new URL(request[1],'https://example.test')
 assert.equal(url.pathname,'/api/stations/%E7%AB%99%2F21/dashboard-history/workbook')
 assert.equal(url.searchParams.get('fields'),'activeKw,powerFactor');assert.equal(url.searchParams.get('date'),'2025:2026')
 assert.equal(request[2].headers.Authorization,'Bearer test-token')
 assert.equal(h.calls.find(c=>c[0]==='blob')[1],h.blob)
 assert.deepEqual(h.calls.filter(c=>['append','click','remove'].includes(c[0])).map(c=>c[0]),['append','click','remove'])
 assert.equal(h.calls.find(c=>c[0]==='click')[2],'场站历史-站/21-2025~2026.xlsx')
 assert.equal(h.calls.some(c=>c[0]==='revoke'),false);h.cleanup();assert.deepEqual(h.calls.at(-1),['revoke','blob:test-download'])
})
test('401 invalidates the session and never initiates a download',async()=>{
 const h=harness({status:401});await assert.rejects(h.run(),e=>e.status===401)
 assert.ok(h.calls.some(c=>c[0]==='token'&&c[1]===null));assert.ok(h.calls.some(c=>c[0]==='event'&&c[1]==='enerlution:unauthorized'))
 assert.equal(h.calls.some(c=>c[0]==='click'),false)
})
test('403 refreshes capabilities without initiating a download',async()=>{
 const h=harness({status:403});await assert.rejects(h.run(),e=>e.status===403)
 assert.ok(h.calls.some(c=>c[0]==='refresh'));assert.equal(h.calls.some(c=>c[0]==='click'),false)
})
test('a successful JSON response is rejected instead of being saved as XLSX',async()=>{
 const h=harness({type:'application/json'});await assert.rejects(h.run(),/XLSX/)
 assert.equal(h.calls.some(c=>c[0]==='blob'||c[0]==='click'),false)
})
for(const boundary of ['afterFetch','afterBlob'])test(`session change at ${boundary} prevents stale account data download`,async()=>{
 const h=harness({[boundary]:change=>change()});await assert.rejects(h.run(),e=>e.status===401)
 assert.equal(h.calls.some(c=>c[0]==='blob'||c[0]==='click'),false)
})
