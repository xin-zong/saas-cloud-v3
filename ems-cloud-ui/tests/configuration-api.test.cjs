const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function service(name) {
 const calls = []; let failure = null
 const client = {api: async (path, options) => {calls.push({path, ...options}); if(failure) throw failure; return []}, send: async (path, method, body) => {calls.push({path,method,body}); if(failure) throw failure; return []}}
 const source = fs.readFileSync(`${__dirname}/../src/api/${name}.ts`, 'utf8')
 const exports = {}
 new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,()=>client)
 return {api:exports,calls,fail:e=>failure=e}
}
test('station tags use versioned CRUD and station scoped assignments',async()=>{
 const {api,calls,fail}=service('stationTags')
 await api.listStationTags('测试 &',20,40)
 assert.equal(calls[0].path,'/station-tags?q=%E6%B5%8B%E8%AF%95%20%26&limit=20&offset=40')
 await api.createStationTag({name:'标签',description:'说明'})
 await api.updateStationTag({id:'a',name:'更新',description:'说明',version:3})
 assert.deepEqual(calls[2],{path:'/station-tags/a',method:'PUT',body:{name:'更新',description:'说明',expectedVersion:3}})
 await api.deleteStationTag({id:'a',version:3})
 assert.equal(calls[3].path,'/station-tags/a?expectedVersion=3')
 await api.loadStationTags('12');await api.assignStationTags('12',['a'])
 assert.deepEqual(calls[5],{path:'/stations/12/tags',method:'PUT',body:{tagIds:['a']}})
 fail(new Error('版本冲突'));await assert.rejects(api.assignStationTags('12',[]),/版本冲突/)
})
test('monitor template mutations retain server version and selection can reset',async()=>{
 const {api,calls,fail}=service('monitorTemplates')
 await api.loadMonitorTemplates()
 await api.createMonitorTemplate('私人模板',['站点运营概况'])
 await api.updateMonitorTemplate({id:'t',name:'重命名',cards:['站点运营概况'],version:7})
 assert.deepEqual(calls[2].body,{name:'重命名',cards:['站点运营概况'],expectedVersion:7})
 await api.pinMonitorTemplate({id:'t',version:7},true)
 assert.deepEqual(calls[3].body,{pinned:true,expectedVersion:7})
 await api.selectMonitorTemplate(null)
 assert.deepEqual(calls[4].body,{templateId:null})
 await api.deleteMonitorTemplate({id:'t',version:8});assert.equal(calls[5].path,'/monitor/templates/t?expectedVersion=8')
 fail(new Error('保存失败'));await assert.rejects(api.createMonitorTemplate('失败',[]),/保存失败/)
})
