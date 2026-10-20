const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
const source=compile(fs.readFileSync(__dirname+'/../src/components/MonitorReportsWorkspace.tsx','utf8')),data={};
new Function('exports',compile(fs.readFileSync(__dirname+'/../src/data/regularReports.ts','utf8')))(data);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function all(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(all);return[node,...all(node.props?.children),...all(node.props?.footer)]}
function button(tree,text){return all(tree).find(n=>n.type==='button'&&n.props.children===text)}
function dialog(tree){return all(tree).find(n=>n.props?.title==='删除配置')}
function alerts(tree){return all(tree).filter(n=>n.props?.role==='alert').map(n=>n.props.children)}
async function harness(){
 const slots=[],effects=[],deletes=[];let cursor=0,readFailure=false;
 const template={id:'template-1',name:'Referenced template',type:'daily',version:1,payload:{name:'Referenced template',type:'daily',fields:['Site Name']}};
 const task={id:'task-1',name:'Existing task',type:'daily',version:1,payload:{name:'Existing task',type:'daily',templateId:'template-1',scope:'all',stationIds:[],range:0,frequency:0,time:'DAY'}};
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]},useRef(value){const i=cursor++;return slots[i]||(slots[i]={current:value})},useEffect(effect,deps){const i=cursor++;if(!slots[i]||deps?.some((v,n)=>v!==slots[i][n]))effects.push(effect);slots[i]=deps}};
 const api={REGULAR_REPORT_TYPES:{daily:'日级'},reportConfigFields:async()=>{if(readFailure)throw Error('列表刷新失败');return{daily:['Site Name']}},reportConfigList:async category=>category==='template'?[template]:[task],reportConfigDelete:async row=>{deletes.push(row.id);throw Error(row.id==='template-1'?'模板已被任务引用':'任务删除版本冲突')}};
 const out={};new Function('exports','require',source)(out,id=>id==='react'?hooks:id==='react/jsx-runtime'?require(id):id==='@/data/regularReports'?data:id==='./useConfigurationLeaveGuard'?{useConfigurationLeaveGuard:({onClose})=>({close:onClose,confirmation:null})}:id==='./useRegularReportJobs'?{useRegularReportJobs:()=>({records:[],total:0,page:0,size:50,loading:false,busy:false,error:'',active:null,refresh(){}})}:id==='@/auth/AuthContext'?{useAuth:()=>({user:{id:'7'}})}:id==='@/auth/apiPermissions'?{hasStationPermission:()=>true}:id==='@/api/regularReports'?api:id==='@/api/regularReportJobs'?{reportJobCapabilities:async()=>null}:{});
 const component=out.default({stations:[{id:'1',name:'Station'}]}).type;
 function render(){cursor=0;const tree=component({stations:[{id:'1',name:'Station'}],production:false});effects.splice(0).forEach(effect=>effect());return tree}
 render();await tick();button(render(),'报表模板').props.onClick();
 return {render,deletes,failReads:()=>readFailure=true};
}
for(const close of ['取消','关闭'])test(`failed template delete ${close} clears its error before another task delete`,async()=>{
 const h=await harness();all(h.render()).find(n=>n.props?.['aria-label']==='删除Referenced template').props.onClick();
 button(dialog(h.render()),'确认删除').props.onClick();await tick();
 assert.deepEqual(alerts(dialog(h.render())),['模板已被任务引用']);
 if(close==='取消')button(dialog(h.render()),'取消').props.onClick();else dialog(h.render()).props.onClose();
 assert.deepEqual(alerts(h.render()),[]);
 button(h.render(),'自动化任务').props.onClick();button(h.render(),'删除').props.onClick();
 assert.deepEqual(alerts(dialog(h.render())),[]);assert.deepEqual(h.deletes,['template-1']);
 button(dialog(h.render()),'确认删除').props.onClick();await tick();
 assert.deepEqual(alerts(dialog(h.render())),['任务删除版本冲突']);assert.ok(dialog(h.render()));
 assert.deepEqual(h.deletes,['template-1','task-1']);
});
test('opening either configuration deletion clears an earlier list error without deleting anything',async()=>{
 for(const tab of ['报表模板','自动化任务']){
  const h=await harness();button(h.render(),'自动化任务').props.onClick();h.failReads();button(h.render(),'刷新').props.onClick();await tick();
  assert.ok(alerts(h.render()).includes('列表刷新失败'));
  button(h.render(),tab).props.onClick();button(h.render(),'删除').props.onClick();
  assert.deepEqual(alerts(dialog(h.render())),[]);assert.deepEqual(h.deletes,[]);
 }
});
