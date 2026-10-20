const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react')
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText
const source=compile(fs.readFileSync(__dirname+'/../src/components/MonitorReportsWorkspace.tsx','utf8')),data={}
new Function('exports',compile(fs.readFileSync(__dirname+'/../src/data/regularReports.ts','utf8')))(data)
const catalog={daily:['Site Name','Address','Device Info','Device SN','Device Name','Production','Inverter Production','Meter Positive Total Energy','Module Production','Microinverter Production'],total:['Site Name','Device Info','Device SN','Meter Total Positive Total Energy']}
const tick=()=>new Promise(resolve=>setImmediate(resolve))
let previousWindow
test.beforeEach(()=>{previousWindow=global.window;global.window={addEventListener(){},removeEventListener(){},confirm:()=>true}})
test.afterEach(()=>{global.window=previousWindow})
function all(node){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(all);return[node,...all(node.props?.children),...all(node.props?.footer)]}
function checkbox(tree,label){const node=all(tree).find(n=>n.type==='label'&&Array.isArray(n.props.children)&&n.props.children[1]===label);return node&&node.props.children[0]}
function button(tree,text){return all(tree).find(n=>n.type==='button'&&n.props.children===text)}
// Execute the production component and its event handlers; only hooks and network boundaries are adapted.
async function harness(initial=[]){
 const slots=[],effects=[];let cursor=0,rows=structuredClone(initial);const writes=[],requests=[]
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]},useRef(value){const i=cursor++;return slots[i]||(slots[i]={current:value})},useEffect(effect,deps){const i=cursor++;if(!slots[i]||deps?.some((v,n)=>v!==slots[i][n]))effects.push(effect);slots[i]=deps}}
 const api={REGULAR_REPORT_TYPES:{daily:'日级',total:'累计'},reportConfigFields:async()=>catalog,reportConfigList:async category=>category==='template'?rows:[],reportConfigSave:async(category,draft,id)=>{writes.push(structuredClone(draft));rows=[{id:id||'saved',name:draft.name,type:draft.type,version:2,payload:structuredClone(draft)}]}}
 const out={};new Function('exports','require',source)(out,id=>id==='react'?hooks:id==='react/jsx-runtime'?require(id):id==='@/data/regularReports'?data:id==='./useConfigurationLeaveGuard'?{useConfigurationLeaveGuard:({onClose})=>({close:onClose,confirmation:null})}:id==='./useRegularReportJobs'?{useRegularReportJobs:()=>({records:[],total:0,page:0,size:50,loading:false,busy:false,error:'',active:null,refresh(){},create:async request=>{requests.push(request)}})}:id==='@/auth/AuthContext'?{useAuth:()=>({user:{id:'7'}})}:id==='@/auth/apiPermissions'?{hasStationPermission:()=>true}:id==='@/api/regularReports'?api:id==='@/api/regularReportJobs'?{reportJobCapabilities:async()=>null}:{})
 const component=out.default({stations:[{id:'1',name:'Station'}]}).type
 function render(){cursor=0;const tree=component({stations:[{id:'1',name:'Station'}],production:false});effects.splice(0).forEach(effect=>effect());return tree}
 render();await tick();button(render(),'报表模板').props.onClick()
 return {render,writes,requests}
}
test('template cancellation of Device Info removes all device children from saved and subsequent manual requests',async()=>{
 const h=await harness();all(h.render()).find(n=>n.props?.className==='mr-new-template').props.onClick()
 all(h.render()).find(n=>n.props?.label==='模板名称').props.children.props.onChange({target:{value:'Test'}})
 checkbox(h.render(),'设备信息').props.onChange({target:{checked:true}})
 for(const label of ['设备名称','逆变器发电量','电表正向总电量','组件发电量','微逆发电量'])checkbox(h.render(),label).props.onChange({target:{checked:true}})
 checkbox(h.render(),'设备信息').props.onChange({target:{checked:false}})
 button(h.render(),'保存').props.onClick();await tick()
 assert.deepEqual(h.writes[0].fields,['Site Name'])
 button(h.render(),'报表列表').props.onClick();all(h.render()).find(n=>n.props?.className==='mr-primary mr-create').props.onClick()
 button(h.render(),'导出').props.onClick();await tick()
 assert.deepEqual(h.requests[0].fields,['Site Name'])
})
test('device-data controls are hidden until Device Info is selected and disappear when it is cleared',async()=>{
 const h=await harness();all(h.render()).find(n=>n.props?.className==='mr-new-template').props.onClick()
 assert.equal(checkbox(h.render(),'逆变器发电量'),undefined)
 checkbox(h.render(),'设备信息').props.onChange({target:{checked:true}})
 assert.ok(checkbox(h.render(),'逆变器发电量'))
 checkbox(h.render(),'设备信息').props.onChange({target:{checked:false}})
 assert.equal(checkbox(h.render(),'逆变器发电量'),undefined)
})
test('reopening an orphaned template preserves its metrics, visibly restores required parents, and saves a valid draft',async()=>{
 const h=await harness([{id:'old',name:'Legacy',type:'daily',version:1,payload:{name:'Legacy',type:'daily',fields:['Site Name','Inverter Production']}}])
 all(h.render()).find(n=>n.props?.['aria-label']==='编辑Legacy').props.onClick()
 assert.equal(checkbox(h.render(),'设备信息').props.checked,true)
 assert.equal(checkbox(h.render(),'设备SN').props.checked,true)
 assert.equal(checkbox(h.render(),'逆变器发电量').props.checked,true)
 assert.ok(all(h.render()).some(n=>n.props?.role==='status'&&/设备信息/.test(n.props.children)))
 assert.equal(h.writes.length,0)
 button(h.render(),'保存').props.onClick();await tick()
 assert.deepEqual(h.writes[0].fields,['Site Name','Device Info','Device SN','Inverter Production'])
})
