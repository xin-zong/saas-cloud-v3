const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
function harness(){let handler,closed=0;const e={},code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components/ReferenceStationDeviceDetail.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require',code)(e,id=>{
  if(id==='react/jsx-runtime')return {...jsx,jsx:(type,props,...rest)=>{if(props?.['aria-label']==='设备详情')handler=props.onKeyDown;return jsx.jsx(type,props,...rest)},jsxs:(type,props,...rest)=>{if(props?.['aria-label']==='设备详情')handler=props.onKeyDown;return jsx.jsxs(type,props,...rest)}};
  if(id.endsWith('.css')||id==='@/api/client'||id==='@/api/deviceDetails'||id==='@/api/deviceHistoryExport'||id==='@/data/stationDevices')return {};
  if(id==='@/auth/apiPermissions')return {hasStationPermission:()=>true};
  if(id==='@/preferences/date')return {dateKey:()=> '2026-10-19'};
  if(id==='@/preferences/PreferencesProvider')return {useDisplayPreferences:()=>({timezone:'UTC'})};
  if(id==='@/data/deviceSampleTime')return {deviceSampleTime:()=>({sourceTime:null})};
  if(id==='./DetailReadTabs')return {useDetailEpoch:()=>'',RetainedReadTab:()=>null};
  if(id==='./reference-station/shared')return {useStationQuery:()=>({loading:true}),display:String,QueryState:()=>null,Empty:()=>null};
  if(id.startsWith('./Reference'))return new Proxy({},{get:()=>()=>null});return require(id);
 });renderToStaticMarkup(React.createElement(e.ReferenceStationDeviceDetail,{user:{id:1,permissions:[],stationPermissions:{}},stationId:'s',deviceId:'d',onClose:()=>closed++}));return {handler,closed:()=>closed};
}
test('Escape inside native parameter dialog dismisses only the native dialog, not device detail',()=>{const old=global.Element;global.Element=class {closest(selector){assert.equal(selector,'dialog');return {tagName:'DIALOG'}}};try{const h=harness();let stopped=false;h.handler({key:'Escape',target:new global.Element(),stopPropagation:()=>stopped=true});assert.equal(h.closed(),0);assert.equal(stopped,false,'native dialog retains its browser dismissal behavior')}finally{global.Element=old}});
test('Escape on device drawer still closes the device detail',()=>{const old=global.Element;global.Element=class {closest(){return null}};try{const h=harness();let stopped=false;h.handler({key:'Escape',target:new global.Element(),stopPropagation:()=>stopped=true});assert.equal(h.closed(),1);assert.equal(stopped,true)}finally{global.Element=old}});
test('Tab inside native dialog remains governed by native focus containment',()=>{const old=global.Element;global.Element=class {closest(){return {}}};try{const h=harness();h.handler({key:'Tab',target:new global.Element(),preventDefault:()=>assert.fail('outer drawer must not trap native-dialog focus')});assert.equal(h.closed(),0)}finally{global.Element=old}});
