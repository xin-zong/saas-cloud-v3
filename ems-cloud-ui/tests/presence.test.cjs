const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(){const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync('src/api/presence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m);return m.exports}
test('presence refresh updates only matching assets and never infers running state',()=>{
 const {mergePresence}=load();const stations=[{id:'4',status:'offline',runStatus:'遥测未知',deviceInventory:[{id:'5',status:'offline'},{id:'6',status:'offline'}],devices:{}}];
 const result=mergePresence(stations,[{stationId:'4',status:'online',devices:[{id:'5',status:'online',observedAt:'2026-09-29T00:00:00Z'}]}]);
 assert.equal(result[0].status,'online');assert.equal(result[0].deviceInventory[0].status,'online');assert.equal(result[0].deviceInventory[1].status,'offline');assert.equal(result[0].devices.online,1);assert.equal(result[0].runStatus,'通信在线');assert.equal(result[0].dataStatus,'partial');assert.equal(stations[0].status,'offline');
 assert.equal(mergePresence(result,[{stationId:'4',status:'offline',devices:[{id:'5',status:'offline'}]}])[0].devices.online,0);
})
