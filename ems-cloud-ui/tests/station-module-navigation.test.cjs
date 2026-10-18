const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const output=ts.transpileModule(fs.readFileSync('src/components/reference-station/navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const m={exports:{}};vm.runInNewContext(output,{exports:m.exports,module:m});const {stationModules,resolveStationModule}=m.exports;
test('every selected station module survives a CRUD remount',()=>{for(const tab of stationModules)assert.equal(resolveStationModule(tab),tab)});
test('remembered settings overrides original device deep link after navigation',()=>{assert.equal(resolveStationModule('设置','19'),'设置');assert.equal(resolveStationModule('设备','19'),'设备')});
test('incoming legacy routes and missing or invalid targets resolve safely',()=>{assert.equal(resolveStationModule('告警信息'),'报警');assert.equal(resolveStationModule('设备详情'),'设备');assert.equal(resolveStationModule(undefined,'19'),'设备');assert.equal(resolveStationModule('not-a-module'),'数据看板');assert.equal(resolveStationModule(),'数据看板')});
