const test=require('node:test'),assert=require('node:assert/strict'),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm');
const output=ts.transpileModule(fs.readFileSync('src/components/reference-station/navigation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};vm.runInNewContext(output,{exports:m.exports,module:m});const {stationModules,resolveStationModule}=m.exports;
test('every selected station module survives a CRUD remount',()=>{for(const tab of stationModules)assert.equal(resolveStationModule(tab),tab)});
test('remembered settings overrides original device deep link after navigation',()=>{assert.equal(resolveStationModule('设置','19'),'设置');assert.equal(resolveStationModule('设备','19'),'设备')});
test('incoming legacy routes and missing or invalid targets resolve safely',()=>{assert.equal(resolveStationModule('告警信息'),'报警');assert.equal(resolveStationModule('设备详情'),'设备');assert.equal(resolveStationModule(undefined,'19'),'设备');assert.equal(resolveStationModule('not-a-module'),'数据看板');assert.equal(resolveStationModule(),'数据看板')});
test('station menu uses verified saved configuration, excluding unknown and duplicate entries',()=>{
 assert.deepEqual(Array.from(m.exports.configuredStationModules(['数据看板','子场站','设备','报警','能量管理','智能分析','一次接线图','操作日志','设置','设备','invalid'])),['数据看板','子场站','设备','报警','能量管理','智能分析','一次接线图','操作日志','设置']);
 assert.deepEqual(Array.from(m.exports.configuredStationModules(undefined)),Array.from(stationModules));
});
test('hidden selected module resolves to first verified module without inventing a station type rule',()=>{
 assert.equal(m.exports.visibleStationModule('系统布局',['数据看板','设备']),'数据看板');
 assert.equal(m.exports.visibleStationModule('设备',['数据看板','设备']),'设备');
});
test('persisted module IDs resolve to the nine verified Xinjiang tabs',()=>{
 assert.deepEqual(Array.from(m.exports.configuredStationModules(['dashboard','substations','devices','alarms','energy','analysis','wiring','logs','settings'])),['数据看板','子场站','设备','报警','能量管理','智能分析','一次接线图','操作日志','设置']);
});
