const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function render(telemetry,loading=false){
 function load(file){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{
 if(name==='@/data/stationDashboardHistory')return load(path.join(__dirname,'../src/data/stationDashboardHistory.ts'));
 if(name==='@/api/stationHistoryExport')return {downloadStationHistory:()=>{throw Error('SSR must not download')}};
 if(name==='./LoadingState')return load(path.join(__dirname,'../src/components/LoadingState.tsx'));if(name==='@/api/client')return {api:()=>{throw Error('SSR must not request')}};
 if(name==='./reference-station/shared')return {Empty:({text})=>React.createElement('p',null,text),QueryState:()=>null,useStationQuery:()=>({data:{available:false},loading,error:''})};
 if(name.endsWith('.css'))return {};return require(name);
 });return exports}
 const Component=load(path.join(__dirname,'../src/components/StationDashboardHistory.tsx')).default;
 return renderToStaticMarkup(React.createElement(Component,{stationId:'17',view:{sourceTime:'2026-10-18T23:30:00Z',timezone:'Asia/Shanghai'},telemetry}));
}
test('uncaptured station history preserves period controls and actual empty chart without synthetic paths',()=>{const html=render(true);assert.match(html,/运行状态/);assert.match(html,/所选期间尚未采集场站历史/);assert.match(html,/2026-10-19/);assert.match(html,/参数选择/);assert.match(html,/class="sdh-export" disabled/);assert.doesNotMatch(html,/recharts-line/);assert.equal((html.match(/role="tab"/g)||[]).length,4)})
test('history permissions redact even an available dashboard date',()=>{assert.match(render(false),/无遥测查看权限/)})


test('pending history shows spinner without simultaneous missing data or summary',()=>{const html=render(true,true);assert.match(html,/loading-state-spinner/);assert.doesNotMatch(html,/所选期间尚未采集|暂无分时天气|暂无已采集|光伏发电量：|— kWh/)});
