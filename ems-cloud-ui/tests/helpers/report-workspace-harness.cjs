const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const all=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(all):[node,...all(node.props?.children),...all(node.props?.footer),...all(node.props?.actions),...all(node.props?.confirmation)];
const button=(tree,label)=>all(tree).find(n=>n.type==='button'&&n.props.children===label);
const field=(tree,label)=>all(tree).find(n=>n.props?.label===label).props.children;
async function harness(production=false){
 const slots=[],effects=[],listeners=new Map(),requests=[];let cursor=0,guard,result,jobBusy=false,finishSave;
 const register=value=>guard=value;
 const win={confirm(){throw Error('Native confirm must not be called')},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)}};
 const changed=(old,deps)=>!old||!deps||deps.some((v,n)=>v!==old[n]);
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]},useRef(value){const i=cursor++;return slots[i]||(slots[i]={current:value})},useCallback(fn,deps){const i=cursor++;if(changed(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn},useEffect(effect,deps){const i=cursor++;if(changed(slots[i]?.deps,deps)){const old=slots[i];slots[i]={deps};effects.push(()=>{old?.cleanup?.();slots[i].cleanup=effect()})}}};
 const templates=['daily','monthly'].map(type=>({id:type,name:type,type,version:1,payload:{name:type,type,fields:['Site Name']}}));
 const api={REGULAR_REPORT_TYPES:{daily:'日级',monthly:'月级',yearly:'年级',total:'累计'},reportConfigFields:async()=>({daily:['Site Name','Address'],monthly:['Site Name','Address']}),reportConfigList:async category=>category==='template'?templates:[],reportConfigSave:()=>new Promise(resolve=>finishSave=resolve)};
 const cache={};function load(file){if(cache[file])return cache[file];const out=cache[file]={};new Function('exports','require',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../../src/components',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(out,id=>{
  if(id==='react')return hooks;if(id==='react/jsx-runtime')return require(id);
  if(id==='./useConfigurationLeaveGuard')return load('useConfigurationLeaveGuard.tsx');if(id==='./useEditorLeaveGuard')return load('useEditorLeaveGuard.ts');
  if(id==='./station-provision/Common')return{Modal:'modal'};if(id==='./ui/Workspace')return{Button:'button'};
  if(id==='@/data/regularReports')return load('../data/regularReports.ts');
  if(id==='@/auth/AuthContext')return{useAuth:()=>({user:{id:'7'}})};if(id==='@/auth/apiPermissions')return{hasStationPermission:()=>true};
  if(id==='@/api/regularReports')return api;if(id==='@/api/regularReportJobs')return{reportJobCapabilities:async()=>null};
  if(id==='./useRegularReportJobs')return{useRegularReportJobs:()=>({records:[],total:0,page:0,size:50,loading:false,busy:jobBusy,error:'',active:null,refresh(){},create:async request=>{requests.push(request);return result},download:async()=>{}})};
  return{};
 });return out;}
 const component=load('MonitorReportsWorkspace.tsx').default({stations:[{id:'1',name:'Station'}]}).type;
 function render(){cursor=0;const tree=component({stations:[{id:'1',name:'Station'},{id:'2',name:'Second'}],production,registerLeaveGuard:register});effects.splice(0).forEach(effect=>effect());return tree}
 global.window=win;render();await tick();render();
 return{render,requests,listeners,guard:()=>guard(),setResult:value=>result=value,setBusy:value=>jobBusy=value,finishSave:async()=>{finishSave();await tick()},async rejectLeave(){const pending=guard();button(render(),'继续编辑配置').props.onClick();return pending},async discardLeave(){const pending=guard();button(render(),'放弃配置修改').props.onClick();return pending}};
}
module.exports={harness,all,button,field,tick};
