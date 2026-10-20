const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function render(telemetry,scope,scene='overall'){let state=0;const keys=[],equipment=[{type:'pcs',status:'online',count:2,deviceIds:['1','2']},{type:'pcs',status:'offline',count:1,deviceIds:['3']}];
 function load(file){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{
  if(name==='react')return {...React,useState:v=>[++state===3?{stationId:'17',id:scope}:v,()=>{}]};
  if(name==='@/data/stationDashboard')return load(path.join(__dirname,'../src/data/stationDashboard.ts'));
  if(name==='@/api/stationDashboard')return {loadStationDashboard:()=>Promise.resolve({equipment})};
  if(name==='@/api/substations')return {substationsApi:{list:()=>Promise.resolve([])}};
  if(name==='./reference-station/shared')return {Empty:({text})=>React.createElement('p',null,text),QueryState:()=>null,useStationQuery:key=>{keys.push(key);return {data:key.startsWith('dashboard-equipment')?{equipment}:[],loading:false}}};
  if(name==='@/api/client')return {api:()=>Promise.resolve({})};
  if(name==='@/api/stationGenerationPlans')return {loadStationGenerationPlans:()=>Promise.resolve([])};
  if(name==='@/data/stationDashboardHistory'||name==='./stationDashboardHistory')return load(path.join(__dirname,'../src/data/stationDashboardHistory.ts'));
  if(name==='@/data/stationDashboardSolar')return load(path.join(__dirname,'../src/data/stationDashboardSolar.ts'));
  if(name==='@/data/stationDashboardPresentation')return load(path.join(__dirname,'../src/data/stationDashboardPresentation.ts'));
  if(name==='@/data/stationDashboardExtras')return load(path.join(__dirname,'../src/data/stationDashboardExtras.ts'));
  if(name==='./LoadingState')return load(path.join(__dirname,'../src/components/LoadingState.tsx'));
  if(name==='./StationDashboardMetricPanel')return load(path.join(__dirname,'../src/components/StationDashboardMetricPanel.tsx'));
  if(name==='./EnergyFlowDiagram')return {StationFlowDeviceArtwork:()=>null};
  if(['./StationProfileImage','./StationLocationDetails','./StationDashboardSolar','./StationDashboardGrid','./StationDashboardComposition','./StationGenerationPlansPanel'].includes(name))return {default:()=>null,SolarStatistics:()=>null};
  if(name==='./StationDashboardHistory')return {default:()=>null};
  if(name.endsWith('.css'))return {};
  return require(name);
 });return exports}
 const Component=load(path.join(__dirname,'../src/components/StationDashboardParity.tsx')).default;
 return {keys,html:renderToStaticMarkup(React.createElement(Component,{station:{id:'17'},view:{scenes:[scene],panels:scene==='storage'?[{key:'battery',label:'储能',metrics:[{key:'soc',value:82.4321},{key:'soh',value:91.8765},{key:'dailyCharge',value:758.3421}]}]:[],equipment,alarms:[],telemetryAvailable:true},telemetry,onDevices:()=>{},onSources:()=>{},onAlarms:()=>{},canViewDevices:true,canViewSubstations:true}))};
}
function count(html,status){const row=html.match(new RegExp('sdp-status '+status+'[\\s\\S]*?</tr>'))?.[0];return row?.match(/<button[^>]*>(\d+)<\/button>/)?.[1]}
for(const scope of ['', 'child'])test(`revoked telemetry redacts cached equipment counts in ${scope||'whole station'}`,()=>{const permitted=render(true,scope),denied=render(false,scope);assert.equal(count(permitted.html,'online'),'2');assert.equal(count(denied.html,'total'),'3');assert.equal(count(denied.html,'online'),'0');assert.equal(count(denied.html,'offline'),'0');assert.equal(count(denied.html,'unknown'),'3');assert.notEqual(permitted.keys.find(k=>k.startsWith('dashboard-equipment')),denied.keys.find(k=>k.startsWith('dashboard-equipment')));});


test('revoked telemetry in dedicated storage scene hides cached numeric values',()=>{const denied=render(false,'','storage').html;assert.match(denied,/无遥测查看权限/);assert.doesNotMatch(denied,/82.4321|91.8765|758.3421/)});
