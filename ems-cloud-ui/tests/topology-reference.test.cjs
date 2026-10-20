const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript')
const cache={}
function load(name){const file=path.resolve(__dirname,'../src/components/station-provision',name+'.ts');if(cache[file])return cache[file].exports;const mod={exports:{}};cache[file]=mod;new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>n.startsWith('.')?(n.endsWith('.json')?JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),n),'utf8')):load(path.basename(n))):require(n),mod,mod.exports);return mod.exports}
test('industrial reference retains all stable XML identities, embedded controllers and endpoint order',()=>{
 const {createIndustrialReference}=load('topologyReference'),{parseDraft}=load('model')
 const a=createIndustrialReference(),b=createIndustrialReference()
 assert.equal(a.topologyMeta.configSetId,b.topologyMeta.configSetId)
 assert.equal(a.devices.length,8) // 7 visible nodes and a cabinet; meter and TMS are embedded.
 const bat=a.devices.find(n=>n.id==='EMU01'),grid=a.devices.find(n=>n.id==='GRID01')
 assert.equal(bat.coolingConfiguration.nodeId,'TMS01');assert.equal(grid.metering.nodeId,'METER01')
 assert.deepEqual(a.connections[0],{id:'WIRE01',from:'GRID01',fromPort:'ac',to:'ACBUS01',toPort:'bus',kind:'AC'})
 assert.equal(a.devices.find(n=>n.id==='DCDC01').forwardDeviceId,'EMU01')
 assert.equal(a.devices.find(n=>n.id==='CAB01').cabinetNumber,'1')
 assert.deepEqual(parseDraft(JSON.stringify(a)),JSON.parse(JSON.stringify(a)))
 bat.name='Edited name';assert.equal(createIndustrialReference().devices.find(n=>n.id==='EMU01').name,'1号电池系统')
})
