const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript')
function load(file,deps={}){const m={exports:{}};new Function('require','exports','module',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(k=>deps[k],m.exports,m);return m.exports}
test('preferences validate legacy values and fall back safely',()=>{
 const p=load('preferences/model');assert.equal(p.normalizePreferences({language:'English',timezone:'Europe / Berlin (UTC+01:00)'}).timezone,'Europe/Berlin');assert.equal(p.normalizePreferences({timezone:'invalid'}).timezone,'Asia/Shanghai');assert.equal(p.normalizePreferences({highContrast:'false'}).highContrast,false)
})
test('display dates and input instants use the selected timezone with DST',()=>{
 const p=load('preferences/model');const d=load('preferences/date',{'./store':{getPreferences:()=>p.normalizePreferences({timezone:'Europe/Berlin',language:'English'})}})
 assert.equal(d.dateKey('2026-10-11T23:30:00Z'),'2026-10-12');assert.equal(d.dateTimeInput('2026-07-01T12:00:00Z'),'2026-07-01T14:00:00');assert.equal(d.parseDateTimeInput('2026-07-01T14:00').toISOString(),'2026-07-01T12:00:00.000Z');assert.equal(d.parseDateTimeInput('2026-01-01T14:00').toISOString(),'2026-01-01T13:00:00.000Z');assert.ok(Number.isNaN(d.parseDateTimeInput('2026-03-29T02:30').getTime()))
 assert.ok(Number.isNaN(d.calendarBounds('', 'D').start.getTime()));assert.ok(Number.isNaN(d.calendarBounds('2026-02-30','M').end.getTime()));assert.equal(d.localized(new Date('2026-07-01T12:00:00Z'),'toLocaleString','zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}),'14:00')
})
test('global regions include every continent and Europe does not move real station coordinates',()=>{
 const m=load('maps/regions');assert.deepEqual(m.DEFAULT_MAP_VIEW,{lat:50,lng:10,zoom:4});assert.ok(m.MAP_REGIONS.some(r=>r.id==='global'));assert.ok(m.inMapRegion({lat:'48.85 N',lng:'2.35 E',region:'法国'},'europe'));assert.equal(m.inMapRegion({lat:'31.23 N',lng:'121.47 E',region:'华东'},'europe'),false);assert.ok(m.inMapRegion({lat:'',lng:'',region:''},'global'));assert.equal(m.stationCoordinates({lat:'',lng:''}),null)
 assert.equal(m.mapRegionView('华东',[{lat:'31.23',lng:'121.47'}]).lng,121.47)
})
