const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function render({selected='',viewMode='2d',telemetry=true,supplement=true}={}){const changed=[],captured={};let index=0;
 const flow={gridKw:-12,loadKw:30,pcsKw:null,mpptKw:0,batteryKw:-8,batterySoc:61,convention:'import-charge-positive'};
 function load(relative){const file=path.join(__dirname,'../src',relative),out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(out,name=>{
  if(name==='react')return relative.endsWith('StationDashboardParity.tsx')?{...React,useState:v=>[++index===2?selected:v,value=>changed.push(value)],lazy:()=>props=>{captured.props=props;return React.createElement(load('components/StationDashboardFlow.tsx').default,props)}}:relative.endsWith('StationDashboardFlow.tsx')?{...React,useState:v=>React.useState(v==='2d'?viewMode:v)}:React;
  if(name==='@/api/stationDashboard')return{};
  if(name==='@/api/substations')return{substationsApi:{}};
  if(name==='@/api/stationGenerationPlans')return{};
  if(name==='@/api/client')return{};
  if(name.startsWith('@/api/'))return{};
  if(name==='./reference-station/shared')return{Empty:({text})=>React.createElement('p',null,text),QueryState:()=>null,useStationQuery:key=>({loading:false,data:key.startsWith('dashboard-supplement')?supplement?{payload:{dashboardSupplement:{flow,updatedAt:'2026-10-17T15:55:00Z'}},period:'day',date:'2026-10-17'}:undefined:key.startsWith('dashboard-total')?{payload:{}}:[]})};
  if(name.startsWith('@/data/'))return load(`data/${name.split('/').pop()}.ts`);
  if(name==='./EnergyFlow3D')return{INIT_DEVICES:['tower','factory','pcs','solar','battery'].map(type=>({id:type,type})),default:props=>{captured.three=props;return React.createElement('div',{'data-3d-count':props.devices.length},props.metrics.pcs.value)}};
  if(['./StationProfileImage','./StationLocationDetails','./StationDashboardSolar','./StationDashboardGrid','./StationDashboardComposition','./StationGenerationPlansPanel','./StationDashboardHistory'].includes(name))return{default:()=>null,SolarStatistics:()=>null};
  if(name.startsWith('./')&&!name.endsWith('.css'))return load(`components/${name.slice(2)}.tsx`);
  if(name.endsWith('.css'))return{};
  return require(name);
 });return out}
 const Component=load('components/StationDashboardParity.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Component,{station:{id:'261',name:'Storage'},view:{stationId:'261',scenes:['storage'],sourceTime:'2026-10-17T15:55:00Z',timezone:'Asia/Shanghai',panels:[{key:'storage',label:'储能',metrics:[{key:'soc',value:99}]},{key:'pcs',label:'PCS',metrics:[{key:'power',value:987654,unit:'kW'}]}],flow:{...flow,pcsKw:supplement?987654:null},capacityKwh:100,ratedPowerKw:50,equipment:[],alarms:[],telemetryAvailable:true},telemetry,onDevices(){},onSources(){},onAlarms(){}}));return{html,captured,changed};
}
test('storage renders three-column flow with both view controls, five clickable nodes and battery metrics',()=>{const {html,captured,changed}=render();assert.match(html,/2D 能流/);assert.match(html,/3D 视图/);assert.match(html,/sdp-profile/);assert.match(html,/sdp-flow/);assert.match(html,/sdp-metrics/);assert.match(html,/data-panel-key="battery"/);assert.match(html,/>61 <small>%/);assert.doesNotMatch(html,/无已接通的本地 EMS/);for(const type of ['tower','factory','pcs','solar','battery']){assert.match(html,new RegExp(`data-device="${type}"`));captured.props.onDeviceSelect(type)}assert.deepEqual(changed,['grid','load','pcs','solar','battery'])});
test('all five storage right cards remain reachable and null PCS never borrows the older view value',()=>{for(const selected of ['grid','load','pcs','solar','battery']){const {html}=render({selected});assert.match(html,new RegExp(`data-panel-key="${selected}"`));assert.doesNotMatch(html,/987654/)}const {html}=render({selected:'pcs'});assert.match(html,/PCS有功功率/);assert.match(html,/— <small>kW/)});
test('storage 3D retains five original devices and missing PCS in its shared measured model',()=>{const {html,captured}=render({viewMode:'3d'});assert.match(html,/data-3d-count="5"/);assert.equal(captured.three.metrics.pcs.value,'—');assert.equal(captured.three.metrics.battery.value,'-8');assert.equal(captured.three.devices.length,5)});
test('storage denied telemetry blanks node and right-card measurements',()=>{const {html,captured}=render({telemetry:false});assert.match(html,/无遥测查看权限/);assert.doesNotMatch(html,/987654|>61 <small>%/);assert.equal(captured.props.rawFlow,null)});
test('storage without supplement still replaces stale PCS panel power with explicit missing current flow',()=>{const {html}=render({supplement:false,selected:'pcs'});assert.match(html,/data-panel-key="pcs"/);assert.doesNotMatch(html,/987654/);assert.match(html,/— <small>kW/)});
