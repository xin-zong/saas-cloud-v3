const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
function load(name) {
  const file = path.join(__dirname, '../src/components/station-provision', name + '.ts')
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const result = {exports:{}}
  new Function('require','exports','module',code)(p => load(p.replace('./','')),result.exports,result)
  return result.exports
}
test('run parameters restore old drafts with defaults, round trip edited parameters', () => {
  const m=load('runtimeModel'), value=m.defaultRuntime()
  assert.equal(value.peakPeriods.length,8); assert.equal(value.gridPeriods.length,6)
  const updated={...value, reserveEnabled:true, reserveSoc:'21'}
  assert.equal(m.parseRuntime(JSON.parse(JSON.stringify(updated))).reserveSoc,'21')
  assert.deepEqual(m.parseRuntime(undefined),value)
})
test('SOC checks point at the invalid field and ignore disabled reserve values',()=>{
  const m=load('runtimeModel'), value={...m.defaultRuntime(),reserveEnabled:true,reserveSoc:'105'}
  assert.ok(m.validateRuntime(value).some(x=>x.field==='reserveSoc'))
  assert.ok(!m.validateRuntime({...value,reserveEnabled:false}).some(x=>x.field==='reserveSoc'))
  assert.ok(m.validateRuntime({...value,reserveSoc:'10',forceStartSoc:'40',forceEndSoc:'30'}).some(x=>x.field==='forceStartSoc'))
})
test('enabled periods reject overlapping weekdays and invalid bounds without losing inactive drafts',()=>{
  const m=load('runtimeModel'), value=m.defaultRuntime()
  value.peakPeriods[0]={...value.peakPeriods[0],enabled:true,start:'01:00',end:'03:00',days:[1],maxPower:'10',soc:'80'}
  value.peakPeriods[1]={...value.peakPeriods[1],enabled:true,start:'02:00',end:'04:00',days:[1],maxPower:'10',soc:'80'}
  assert.ok(m.validateRuntime(value).some(x=>x.message.includes('重叠')))
  value.peakPeriods[1].days=[2]
  assert.deepEqual(m.validateRuntime(value),[])
  value.peakPeriods[1].enabled=false;value.peakPeriods[1].soc='105'
  assert.deepEqual(m.validateRuntime(value),[])
})
test('new topology templates provide cabinets and prevent EMS electrical wiring',()=>{
  const m=load('model'), n=load('topologyModel'), d={...m.emptyProvision(),...n.buildSiteTemplate('光储协同')}
  assert.equal(d.devices.filter(x=>x.type==='标准柜').length,1)
  assert.ok(d.devices.some(x=>x.type==='直流母线'))
  assert.ok(d.devices.some(x=>x.type==='EMS'&&x.ports.length===2))
  const ems=d.devices.find(x=>x.type==='EMS'), bus=d.devices.find(x=>x.type==='交流母线')
  assert.equal(n.canWire(ems,bus,'AC'),false)
  assert.equal(n.buildSiteTemplate('工商业储能').devices.find(x=>x.type==='光伏 DC/DC').enabled,false)
})
test('splitting a cabinet preserves child configuration, locations and electrical edges',()=>{
 const m=load('model'),n=load('topologyModel'),d={...m.emptyProvision(),...n.buildSiteTemplate('光储协同')},cab=d.devices.find(x=>x.type==='标准柜'),pcs=d.devices.find(x=>x.type==='PCS')
 pcs.ip='192.168.1.8';const before=n.nodePosition(d,pcs,d.devices.indexOf(pcs)),result=n.splitCabinet(d,cab.id),after=result.devices.find(x=>x.id===pcs.id)
 assert.equal(after.cabinetId,undefined);assert.equal(after.ip,'192.168.1.8');assert.equal(after.emsId,pcs.emsId);assert.deepEqual(n.nodePosition({...d,...result},after,result.devices.indexOf(after)),before);assert.deepEqual(result.connections,d.connections)
})
test('copying a cabinet preserves child offsets, EMU references and internal wiring',()=>{
 const m=load('model'),n=load('topologyModel'),d={...m.emptyProvision(),...n.buildSiteTemplate('光储协同')},cab=d.devices.find(x=>x.type==='标准柜')
 const result=n.cloneNode(d,cab.id),copy=result.devices.find(x=>x.id===result.selectedId),children=result.devices.filter(x=>x.cabinetId===copy.id)
 assert.equal(children.length,4);assert.equal(children.find(x=>x.type==='PCS').x,undefined)
 assert.equal(children.find(x=>x.type==='光伏 DC/DC').emuId,children.find(x=>x.type==='电池 / BMS').id)
 const pcs=children.find(x=>x.type==='PCS');assert.equal(n.nodePosition({...d,...result},pcs,0).x,copy.x)
 assert.equal(result.connections.filter(x=>children.some(c=>c.id===x.from)&&children.some(c=>c.id===x.to)).length,3)
})
test('moving and arranging a cabinet translates customized children without flattening the group',()=>{
 const m=load('model'),n=load('topologyModel'),d={...m.emptyProvision(),...n.buildSiteTemplate('光储协同')},cab=d.devices.find(x=>x.type==='标准柜'),pcs=d.devices.find(x=>x.type==='PCS'),battery=d.devices.find(x=>x.type==='电池 / BMS')
 pcs.x=cab.x-3;pcs.y=cab.y-5
 const result=n.moveNode(d,cab.id,{x:cab.x+10,y:cab.y-10}),moved=result.devices.find(x=>x.id===pcs.id)
 assert.equal(moved.x,pcs.x+10);assert.equal(moved.y,pcs.y-10);assert.equal(result.devices.find(x=>x.id===battery.id).x,undefined)
 const arranged=n.arrangeNodes(d),newCab=arranged.devices.find(x=>x.id===cab.id),newPcs=arranged.devices.find(x=>x.id===pcs.id)
 assert.equal(newPcs.x-newCab.x,-3);assert.equal(newPcs.y-newCab.y,-5);assert.equal(arranged.devices.find(x=>x.id===battery.id).x,undefined)
})
test('deleting a cabinet removes children, electrical and communication references',()=>{
  const m=load('model'), n=load('topologyModel'), d={...m.emptyProvision(),...n.buildSiteTemplate('工商业储能')}
  const cab=d.devices.find(x=>x.type==='标准柜'), children=d.devices.filter(x=>x.cabinetId===cab.id).map(x=>x.id)
  const patch=n.removeNode(d,cab.id)
  assert.ok(children.every(id=>!patch.devices.some(x=>x.id===id)))
  assert.ok(patch.connections.every(x=>!children.includes(x.from)&&!children.includes(x.to)))
})
test('new device configuration is checked by EMS interface and keeps the chosen unit id',()=>{
  const m=load('model'),n=load('topologyModel'),d={...m.emptyProvision(),...n.buildSiteTemplate('工商业储能')}
  const pcs=d.devices.find(x=>x.type==='PCS'),ems=d.devices.find(x=>x.type==='EMS')
  pcs.emsId=ems.id;pcs.interface='ETH-1';pcs.protocol='Modbus TCP';pcs.ip='192.168.1.2';pcs.port='502';pcs.address='1';pcs.model='manual'
  assert.ok(!n.validateSiteTopology(d).some(x=>x.nodeId===pcs.id&&x.field==='interface'))
  pcs.interface='RS485-1'
  assert.ok(n.validateSiteTopology(d).some(x=>x.nodeId===pcs.id&&x.field==='interface'))
})
