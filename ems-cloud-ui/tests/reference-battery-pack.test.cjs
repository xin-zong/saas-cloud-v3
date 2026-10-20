const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function renderPackEnergy(energyGroup,telemetry=true){
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),module={exports:{}};
 const pack={archive:{serial:'pack'},points:[],observations:[],energyGroup};
 const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/components/ReferenceBatteryPackDetail.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const localRequire=id=>id==='./DetailReadTabs'?{useDetailEpoch:()=>'',RetainedReadTab:({active,children})=>active?children:null}:id==='@/preferences/date'?{formatDate:v=>`formatted(${v})`,dateKey:v=>new Date(v).toISOString().slice(0,10)}:id.endsWith('.css')?{}:id==='@/api/deviceDetails'?{}:id==='@/api/client'?{}:id==='@/auth/apiPermissions'?{hasStationPermission:(_user,_station,p)=>p!=='telemetry.read'||telemetry}:id==='@/data/referenceBatteryPack'?load('referenceBatteryPack'):id==='./ReferenceDeviceHistory'?{}:id==='./reference-station/shared'?{QueryState:()=>null,Empty:({text})=>React.createElement('p',null,text),useStationQuery:()=>({data:pack,loading:false})}:require(id);
 new Function('require','module','exports',code)(localRequire,module,module.exports);
 return renderToStaticMarkup(React.createElement(module.exports.ReferenceBatteryPackDetail,{user:{},stationId:'1',nodeId:'8',onClose:()=>{}}));
}
test('optional energy card preserves zero and sits between voltage and temperature with capture timestamps',()=>{
 const html=renderPackEnergy({chargeKwh:0,dischargeKwh:0,sourceTime:'source',capturedAt:'capture'});
 assert.match(html,/<h3>电池组<\/h3>/);assert.match(html,/今日充电量<\/dt><dd>0kWh<\/dd>/);assert.match(html,/今日放电量<\/dt><dd>0kWh<\/dd>/);
 assert.ok(html.indexOf('<h3>单体电压</h3>')<html.indexOf('<h3>电池组</h3>'));assert.ok(html.indexOf('<h3>电池组</h3>')<html.indexOf('<h3>单体温度</h3>'));
 assert.equal((html.match(/title="采样时间：formatted\(source\)；采集时间：formatted\(capture\)"/g)||[]).length,2);
});
test('energy card distinguishes missing capture from measured values',()=>{
 const html=renderPackEnergy({chargeKwh:null,dischargeKwh:12.5,sourceTime:'source',capturedAt:'capture'});
 assert.match(html,/今日充电量<\/dt><dd>未采集<\/dd>/);assert.match(html,/今日放电量<\/dt><dd>12.5kWh<\/dd>/);
});
test('absent energy group never adds a phantom card',()=>{
 for(const value of [undefined,null])assert.doesNotMatch(renderPackEnergy(value),/<h3>电池组<\/h3>|今日充电量|今日放电量/);
});
test('denied telemetry hides energy card and captured values',()=>{
 const html=renderPackEnergy({chargeKwh:123.45,dischargeKwh:678.9,sourceTime:'secretSource',capturedAt:'secretCapture'},false);
 assert.doesNotMatch(html,/<h3>电池组<\/h3>|今日充电量|今日放电量|123.45|678.9|secretSource|secretCapture/);assert.match(html,/无遥测查看权限/);
});
function load(name){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/data/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,id=>load(id.replace('./','')));return exports}
test('pack navigation is limited to source-only battery packs',()=>{const {connectionBatteryPackId:f}=load('deviceConnections');assert.equal(f({id:'reference-connection:8',type:'battery-pack'}),'8');for(const n of [{id:8,type:'battery-pack'},{id:'reference-connection:8',type:'pcs'},{id:'reference-connection:8',type:'battery-pack',linkedDeviceId:9}])assert.equal(f(n),null)});
test('pack history has only registered pack points and never parent SOC configuration',()=>{const {batteryPackHistoryDetail:f}=load('referenceBatteryPack');const p={archive:{id:'reference-connection:8',serial:'pack'},points:[{id:71,name:'单体电压1',unit:'V'}],historyDeviceId:9};const d=f(p);assert.deepEqual(d.configuration.selectedPointIds,[]);assert.deepEqual(d.points,p.points);assert.equal(d.archive.id,p.archive.id);assert.equal(load('referenceDeviceHistory').defaultHistoryPointIds(d.type,d.points).length,0)});
test('connection table offers pack action only when caller supplies pack handler',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),module={exports:{}};
 const nodes=[{id:'reference-connection:8',type:'battery-pack',serial:'pack'},{id:'reference-connection:9',type:'pcs',serial:'pcs'}];
 const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/components/ReferenceDeviceConnections.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const localRequire=id=>id==='@/data/deviceConnections'?load('deviceConnections'):id==='@/api/deviceDetails'?{}:id==='@/api/client'?{}:id==='./DetailReadTabs'?{useDetailEpoch:()=>'',RetainedReadTab:({active,children})=>active?children:null}:id==='@/preferences/date'?{formatDate:v=>v}:id==='./reference-station/shared'?{QueryState:()=>null,Empty:()=>null,useStationQuery:()=>({data:{nodes,edges:[]},loading:false})}:require(id);
 new Function('require','module','exports',code)(localRequire,module,module.exports);
 const html=renderToStaticMarkup(React.createElement(module.exports.ReferenceDeviceConnections,{stationId:'1',deviceId:'42',onOpenBatteryPack:()=>{}}));
 assert.equal((html.match(/class="rd-connection-device"/g)||[]).length,1);assert.match(html,/电池包<br\/>pack<\/button>/);assert.doesNotMatch(html,/PCS<br\/>pcs<\/button>/);
});
test('pack realtime renders capture provenance, explicit missing fields and only four tabs',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),module={exports:{}};
 const pack={archive:{id:'reference-connection:8',serial:'pack',baseSN:null,cellCount:48,parentSensor:'1'},points:[{id:71,name:'电池包 SN · 电压 #1',unit:'V',kind:'voltage',index:1},{id:72,name:'电池包 SN · 温度 #3',unit:'℃',kind:'temperature',index:3}],observations:[{pointId:71,value:3.2,sourceTime:'2026-10-19T08:00:00Z',capturedAt:'2026-10-19T08:01:00Z'},{pointId:72,value:35,sourceTime:'2026-10-19T09:00:00Z',capturedAt:'2026-10-19T09:01:00Z'}]};
 const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/components/ReferenceBatteryPackDetail.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const localRequire=id=>id==='./DetailReadTabs'?{useDetailEpoch:()=>'',RetainedReadTab:({active,children})=>active?children:null}:id==='@/preferences/date'?{dateKey:v=>new Date(v).toISOString().slice(0,10),formatDate:v=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(v))}:id.endsWith('.css')?{}:id==='@/api/deviceDetails'?{}:id==='@/api/client'?{}:id==='@/auth/apiPermissions'?{hasStationPermission:()=>true}:id==='@/data/referenceBatteryPack'?load('referenceBatteryPack'):id==='./ReferenceDeviceHistory'?{}:id==='./reference-station/shared'?{QueryState:()=>null,Empty:({text})=>React.createElement('p',null,text),useStationQuery:()=>({data:pack,loading:false})}:require(id);
 new Function('require','module','exports',code)(localRequire,module,module.exports);
 const html=renderToStaticMarkup(React.createElement(module.exports.ReferenceBatteryPackDetail,{user:{},stationId:'1',nodeId:'8',onClose:()=>{}}));
 assert.equal((html.match(/role="tab"/g)||[]).length,4);assert.doesNotMatch(html,/非实时|已过期|模拟数据/);assert.match(html,/连接设备SN<\/dt><dd>未采集/);assert.match(html,/3.2V/);assert.match(html,/单体电压1/);assert.match(html,/单体温度3/);assert.match(html,/title="采样时间：17:00:00；采集时间：17:01:00"/);assert.doesNotMatch(html,/电池包 SN · 电压 #1/);assert.match(html,/16:00:00/);assert.match(html,/title="采样时间：16:00:00；采集时间：16:01:00"/);assert.doesNotMatch(html,/2026-10-19T08:00:00Z/);assert.doesNotMatch(html,/>设置</);
});
test('pack history wrapper preserves pack scope and query contract',async()=>{
 const module={exports:{}},calls=[];const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/api/deviceDetails.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(()=>({api:async(path,options)=>{calls.push({path,options});return []}}),module,module.exports);
 const from=new Date('2026-10-19T00:00:00Z'),to=new Date('2026-10-20T00:00:00Z'),signal=new AbortController().signal;
 await module.exports.loadBatteryPackHistory('station 1','8','71',from,to,signal);
 const url=new URL(calls[0].path,'http://test');assert.equal(url.pathname,'/stations/station%201/reference-connections/8/battery-pack/history');assert.equal(url.searchParams.get('pointId'),'71');assert.equal(url.searchParams.get('from'),from.toISOString());assert.equal(url.searchParams.get('to'),to.toISOString());assert.equal(url.searchParams.get('aggregation'),'last');assert.equal(url.searchParams.get('minutes'),'15');assert.equal(calls[0].options.signal,signal);
 assert.throws(()=>module.exports.loadBatteryPackHistory('1','8','71',to,from),/有效历史范围/);
});

test('history component executes supplied pack loader and never generic point loader',async()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),module={exports:{}},calls=[];let query,queryKey;
 const code=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/components/ReferenceDeviceHistory.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const localRequire=id=>id==='@/api/deviceDetails'?{DEVICE_HISTORY_INTERVAL_MINUTES:15,loadDeviceHistory:()=>{throw Error('Generic history must not run')}}:id==='@/api/ems'?{historyChartNumber:Number}:id==='@/data/referenceDeviceHistory'?load('referenceDeviceHistory'):id==='@/data/referenceCellHistory'?load('referenceCellHistory'):id.startsWith('@/data/')?load(id.slice(7)):id==='./DetailReadTabs'?{useDetailEpoch:()=>'',RetainedReadTab:({active,children})=>active?children:null}:id==='@/preferences/date'?{dateKey:()=> '2026-10-19',calendarBounds:()=>({start:new Date('2026-10-19T00:00:00Z'),end:new Date('2026-10-19T23:59:59.999Z')}),formatDate:String}:id==='@/preferences/store'?{getPreferences:()=>({timezone:'UTC'})}:id==='./reference-station/shared'?{Empty:()=>null,QueryState:()=>null,useStationQuery:(key,loader)=>{queryKey=key;query=loader;return {data:[],loading:false}}}:require(id);
 new Function('require','module','exports',code)(localRequire,module,module.exports);
 const detail={type:'other',archive:{id:'reference-connection:8'},points:[{id:71,name:'V1',unit:'V'}],configuration:{selectedPointIds:[71]}};
 renderToStaticMarkup(React.createElement(module.exports.ReferenceDeviceHistory,{detail,telemetry:true,canExport:true,historyLoader:async(...args)=>{calls.push(args);return []}}));
 const signal=new AbortController().signal;await query(signal);assert.match(queryKey,/reference-connection:8/);assert.equal(calls.length,1);assert.equal(calls[0][0],'71');assert.equal(calls[0][3].aborted,false);
});


