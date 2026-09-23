const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const exportsModule = {}
new Function('exports', ts.transpileModule(fs.readFileSync('src/api/settlement.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exportsModule)
test('complete settlement derives cents, payment balance and preserves negative corrections', () => {
 const result=exportsModule.adaptSettlement({id:1,calculation_complete:true,statement_amount:'79.75',payments:[{amount:'20.10'}],lines:[{category:'arbitrage',amount:'100.10'},{category:'purchase',amount:'20.20'},{category:'adjustment',amount:'-0.15'}]})
 assert.equal(result.realized,79.75); assert.equal(result.settled,20.10); assert.equal(result.pending,59.65); assert.equal(result.difference,0)
})
test('incomplete settlement remains unknown and never treats estimates as realized', () => {
 const result=exportsModule.adaptSettlement({id:2,calculation_complete:false,estimated_amount:100,payments:[],lines:[]})
 assert.equal(result.realized,null);assert.equal(result.pending,null);assert.equal(result.estimated,100)
})
