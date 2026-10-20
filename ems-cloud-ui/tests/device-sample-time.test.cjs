const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
const m={exports:{}}
new Function('exports',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/data/deviceSampleTime.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports)
const {deviceSampleTime,formatSampleTime}=m.exports
const points=[{id:1},{id:2}],at=Date.parse('2026-07-01T12:00:00Z')
test('missing, invalid, receipt-only and foreign timestamps cannot become sample times',()=>{
 assert.equal(deviceSampleTime(points,[{pointId:1,receivedAt:at},{pointId:2,sourceTime:NaN},{pointId:3,sourceTime:at}]).sourceTime,null)
 assert.equal(deviceSampleTime(points,[{pointId:1,sourceTime:''},{pointId:2,sourceTime:Infinity}]).sourceTime,null)
})
test('latest sample keeps stale status and does not imply simultaneous samples',()=>{
 assert.deepEqual(deviceSampleTime(points,[{pointId:1,sourceTime:at-1000},{pointId:2,sourceTime:at,staleReason:'source_older_than_90_seconds'}]),{sourceTime:at,unavailable:true,mixed:true})
 assert.equal(deviceSampleTime(points,[{pointId:1,sourceTime:at},{pointId:2,sourceTime:at}]).mixed,false)
 assert.equal(deviceSampleTime(points,[{pointId:1,sourceTime:at,quality:'invalid'}]).unavailable,true)
})
test('timezone offsets follow user zone including DST and fractional offsets',()=>{
 assert.equal(formatSampleTime(at,'Asia/Kolkata'),'2026-07-01 17:30:00 UTC+05:30')
 assert.equal(formatSampleTime(at,'Europe/Berlin'),'2026-07-01 14:00:00 UTC+02:00')
 assert.equal(formatSampleTime(Date.parse('2026-01-01T12:00:00Z'),'Europe/Berlin'),'2026-01-01 13:00:00 UTC+01:00')
 assert.equal(formatSampleTime(at,'UTC'),'2026-07-01 12:00:00 UTC+00:00')
})
