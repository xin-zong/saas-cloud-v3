const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
test('station log query encodes filters and station and propagates cancellation/errors', async () => {
  const calls = []; let failure
  const exports = {}
  const source = fs.readFileSync(`${__dirname}/../src/api/stationOperationLogs.ts`, 'utf8')
  new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,()=>({api:async(path,options)=>{calls.push({path,options});if(failure)throw failure;return {items:[],hasMore:false}}}))
  const controller = new AbortController()
  await exports.loadStationOperationLogs('a/b',{content:'  50% & _  ',actor:'person',channel:'application',ip:'',from:'2026-10-18T00:00:00Z'},40,controller.signal)
  assert.match(calls[0].path,/^\/stations\/a%2Fb\/operation-logs\?/)
  const query = new URLSearchParams(calls[0].path.split('?')[1])
  assert.equal(query.get('content'),'50% & _');assert.equal(query.get('offset'),'40');assert.equal(query.get('limit'),'20');assert.equal(query.has('ip'),false)
  assert.equal(calls[0].options.signal,controller.signal);assert.equal(calls[0].options.method,undefined)
  failure=new Error('revoked');await assert.rejects(exports.loadStationOperationLogs('101'),/revoked/)
})
