const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const exportsForTest={};new Function('exports',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/data/tariffLibrary.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exportsForTest)
const {tariffLibraryPage}=exportsForTest
test('archive clamps last-page offset so remaining records stay visible',()=>{assert.equal(tariffLibraryPage(50,50,1),0);assert.equal(tariffLibraryPage(51,50,1),1);assert.equal(tariffLibraryPage(1,50,8),0)})
test('empty and invalid page requests resolve to first page',()=>{assert.equal(tariffLibraryPage(0,50,1),0);assert.equal(tariffLibraryPage(9,50,-1),0);assert.equal(tariffLibraryPage(9,50,Infinity),0)})
