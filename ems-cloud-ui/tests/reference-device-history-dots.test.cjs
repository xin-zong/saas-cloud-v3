const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function loadShared(){
 function load(file){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>name.endsWith('.css')?{}:name==='../LoadingState'?load(path.join(__dirname,'../src/components/LoadingState.tsx')):require(name));return exports}
 return load(path.join(__dirname,'../src/components/reference-station/shared.tsx'))
}
test('shared query loading renders the real accessible LoadingState and errors remain visible',()=>{
 const {QueryState}=loadShared();const html=renderToStaticMarkup(React.createElement(QueryState,{loading:true,error:'',loadingText:'读取采样中'}));
 assert.match(html,/loading-state-spinner/);assert.match(html,/role="status"/);assert.match(html,/aria-busy="true"/);assert.match(html,/读取采样中/);
 const error=renderToStaticMarkup(React.createElement(QueryState,{loading:false,error:'采样读取失败'}));assert.match(error,/role="alert"/);assert.match(error,/采样读取失败/);assert.doesNotMatch(error,/loading-state-spinner/);
});
function render(rows,ids=[1],brush,htmlOnly=false){
 const lines=[],bindings={};
 function load(file){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{
  if(name==='@/data/referenceCellHistory')return {};
  if(name==='@/api/deviceDetails')return {};
  if(name==='@/api/ems')return {};
  if(name==='@/preferences/date')return {dateKey:()=> '2026-10-19',formatDate:String,calendarBounds:()=>({start:new Date('2026-10-19T00:00:00Z'),end:new Date('2026-10-19T23:59:59.999Z')})};
  if(name==='@/preferences/store')return {getPreferences:()=>({timezone:'Asia/Shanghai'})};
  if(name==='./reference-station/shared')return {...loadShared(),useStationQuery:()=>({data:rows,loading:false,error:''})};
  if(name==='@/data/referenceHistoryParameterGroups')return load(path.join(__dirname,'../src/data/referenceHistoryParameterGroups.ts'));
  if(name==='@/data/referenceDeviceHistory')return load(path.join(__dirname,'../src/data/referenceDeviceHistory.ts'));
  if(name==='@/data/referenceHistoryExport')return load(path.join(__dirname,'../src/data/referenceHistoryExport.ts'));
  // Exercise the component's renderer contract without browser sizing or network requests.
  if(name==='recharts')return new Proxy({},{get:(_,key)=>key==='LineChart'?props=>{bindings.chart=props;return React.createElement(React.Fragment,null,props.children)}:key==='XAxis'?props=>{bindings.axis=props;return null}:key==='Line'?props=>{lines.push(props);const visible=brush?rows.slice(brush[0],brush[1]+1):rows,points=visible.map((payload,index)=>({x:10+index*10,y:payload[props.dataKey]==null?null:20,payload}));return React.createElement('g',null,points.map(({payload,x,y},index)=>React.createElement('g',{key:index,'data-time':payload.time,'data-series':props.dataKey},typeof props.dot==='function'?props.dot({cx:x,cy:y,index,payload,points,stroke:props.stroke}):null)))}:({children})=>React.createElement(React.Fragment,null,children)});
  return require(name);
 });return exports;}
 const {ReferenceDeviceHistory}=load(path.join(__dirname,'../src/components/ReferenceDeviceHistory.tsx'));
 const html=renderToStaticMarkup(React.createElement(ReferenceDeviceHistory,{detail:{type:'pcs',archive:{id:1},configuration:{selectedPointIds:ids},points:ids.map(id=>({id,name:`P${id}`,unit:'kW'}))},telemetry:true,canExport:true}));
 assert.equal(bindings.axis.dataKey,'timestamp');assert.equal(bindings.axis.type,'number');assert.deepEqual(bindings.chart.data.map(row=>row.timestamp),rows.map(row=>Date.parse(String(row.time))));assert.ok(lines.every(line=>line.isAnimationActive===false),'large source sample sets must not restart animations');
 assert.ok(lines.every(line=>line.connectNulls===false),'missing samples must remain disconnected');
 const visible=[...html.matchAll(/<g data-time="([^"]+)" data-series="([^"]+)">(<circle[^>]*><\/circle>|<circle[^>]*\/>)/g)].map(m=>`${m[2]}@${m[1]}`);
 return htmlOnly?html:visible;
}
test('isolated zero and the valid point after a gap are visible without changing source values',()=>{
 const rows=[{time:'00:00','1':'0'},{time:'00:15','1':null},{time:'00:30','1':'3.0000000000001'}],original=JSON.stringify(rows);
 assert.deepEqual(render(rows),['1@00:00','1@00:30']);assert.equal(JSON.stringify(rows),original);
});
test('interleaved missing samples are evaluated independently for every selected series',()=>{
 assert.deepEqual(render([{time:'00:00','1':0,'2':null},{time:'00:15','1':null,'2':'8'},{time:'00:30','1':'3','2':null}],[1,2]),['1@00:00','1@00:30','2@00:15']);
});
test('continuous runs retain lines without extra dots and missing values never become zero dots',()=>{
 assert.deepEqual(render([{time:'00:00','1':null},{time:'00:15','1':0},{time:'00:30','1':'2'},{time:'00:45','1':null},{time:'01:00','1':'5'}]),['1@01:00']);
});
test('Brush single-point window keeps a zero visible even when it belongs to a longer continuous run',()=>{
 assert.deepEqual(render([{time:'00:00','1':0},{time:'00:15','1':2},{time:'00:30','1':null}],[1],[0,0]),['1@00:00']);
});
test('Brush truncating a continuous segment leaves its visible endpoint marked next to a gap',()=>{
 assert.deepEqual(render([{time:'00:00','1':0},{time:'00:15','1':2},{time:'00:30','1':null}],[1],[1,2]),['1@00:15']);
});

test('numeric time axis binds preprocessed epoch samples while keeping the source series and zero visible',()=>{const rows=[{time:'2026-10-19T00:00:33.000Z','1':'0'},{time:'2026-10-19T00:01:33.000Z','1':null},{time:'2026-10-19T00:02:33.000Z','1':'31.17'}];assert.deepEqual(render(rows),['1@2026-10-19T00:00:33.000Z','1@2026-10-19T00:02:33.000Z'])});

test('empty history retains a measurable chart shell and an explicit selected-day empty state',()=>{const html=render([],[1],undefined,true);assert.match(html,/2026-10-19 暂无有效历史数据/);assert.doesNotMatch(html,/<circle/)});
