const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
test('device history requests exclusive next midnight and expands raw stored samples with exact timestamps, zero and gaps',async()=>{
 const start=new Date('2026-10-18T16:00:00Z'),end=new Date('2026-10-19T15:59:59.999Z'),calls=[];let query;
 const evidence=[0,1,2,3].map((i)=>({pointId:'7',source:'stored_device',sourceTimeKind:'source',sourceTime:new Date(start.getTime()+i*60000+33000).toISOString(),quality:i===2?'invalid':'valid',valueType:'number',value:i===0?'0':'3.30000000000000001'}));evidence.push({...evidence[0],sourceTime:new Date(end.getTime()+1).toISOString()});
 function load(file){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{
 if(name==='@/api/deviceDetails')return {DEVICE_HISTORY_INTERVAL_MINUTES:15,loadDeviceHistory:async(...args)=>{calls.push(args);return [{sourceType:'stored_device',value:'wrong last',timestamp:start.toISOString(),evidence}]}};
 if(name==='@/api/ems')return {historyChartNumber:()=>null};
 if(name==='@/preferences/date')return {dateKey:()=> '2026-10-19',formatDate:String,calendarBounds:()=>({start,end})};
 if(name==='@/preferences/store')return {getPreferences:()=>({timezone:'Asia/Shanghai'})};
 if(name==='./reference-station/shared')return {useStationQuery:(_,fn)=>{query=fn;return {loading:false}},Empty:()=>null,QueryState:()=>null};
 if(name.startsWith('@/data/')||name.startsWith('./reference'))return load(path.join(__dirname,'../src/data',name.split('/').at(-1)+'.ts'));
 if(name==='recharts')return new Proxy({},{get:()=>()=>null});return require(name);
 });return exports;}
 const {ReferenceDeviceHistory}=load(path.join(__dirname,'../src/components/ReferenceDeviceHistory.tsx'));
 const detail={type:'battery-cluster',archive:{id:1},configuration:{selectedPointIds:[]},points:[{id:7,code:'reference_device_SOC',name:'SOC',unit:'%'},{id:8,name:'SOH',unit:'%'}]};
 renderToStaticMarkup(React.createElement(ReferenceDeviceHistory,{detail,telemetry:true,canExport:true}));const rows=await query(new AbortController().signal);
 assert.equal(calls[0][2].toISOString(),'2026-10-19T16:00:00.000Z');assert.equal(rows.length,4);assert.equal(rows[0].time,'2026-10-18T16:00:33.000Z');assert.equal(rows[0]['7'],'0');assert.equal(rows[1]['7'],'3.30000000000000001');assert.equal(rows[2]['7'],null);
 renderToStaticMarkup(React.createElement(ReferenceDeviceHistory,{detail,telemetry:false,canExport:true}));assert.deepEqual(await query(new AbortController().signal),[]);assert.equal(calls.length,1);
});
