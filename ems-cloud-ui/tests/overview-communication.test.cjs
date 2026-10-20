const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../src/components/overviewCommunication.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m)
test('overview only counts confirmed presence as offline and explicitly separates unknowns',()=>{
 const base={status:'offline',runStatus:'遥测未知'}
 assert.deepEqual(m.exports.overviewCommunication([base,{...base,runStatus:'通信离线'},{...base,runStatus:'通信在线'},{...base,maintenance:{communication:{status:'online'}}},{...base,runStatus:'通信未知'},{...base,status:'building'}],false),{online:2,offline:1,unknown:2,building:1,fault:0})
 assert.deepEqual(m.exports.overviewCommunication([base],true),{online:0,offline:1,unknown:0,building:0,fault:0})
})
