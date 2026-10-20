const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(){const exports={};new Function('exports',ts.transpileModule(fs.readFileSync(__dirname+'/../src/data/referenceHistoryParameterGroups.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);return exports}
test('verified exact names override misleading prefixes and unmatched names stay explicit',()=>{const points=[{id:1,name:'电网总功率'},{id:2,name:'电网电压上限'},{id:3,name:'BMS最大充电功率'},{id:4,name:'BMS电压'},{id:5,name:'电网总功率估算'},{id:6,name:'详情 · 母线电压'},{id:7,name:'PV1 电压'}];const groups=load().historyParameterGroups('inverter',points);assert.deepEqual(groups.map(g=>[g.label,g.points.map(p=>p.id)]),[['电网',[1,6]],['BMS',[4]],['铭牌定值',[3]],['保护参数',[2]],['其他参数',[5,7]]]);assert.equal(groups[0].points[0],points[0]);assert.equal(groups.flatMap(g=>g.points).length,points.length)});
test('search is case insensitive and omits empty groups without mutating registered points',()=>{const points=Object.freeze([{id:1,name:'BMS电压'},{id:2,name:'电网总功率'}]);const d=load();assert.deepEqual(d.historyParameterGroups('inverter',points,' bms ').map(g=>[g.label,g.points.map(p=>p.id)]),[['BMS',[1]]]);assert.deepEqual(d.historyParameterGroups('inverter',points,'无匹配'),[]);assert.deepEqual(d.historyParameterGroups('inverter',[]),[]);assert.equal(points.length,2)});
test('pack and generic devices preserve flat registry order and search',()=>{const points=[{id:3,name:'电网电压上限'},{id:2,name:'BMS电压'},{id:1,name:'其他'}];for(const type of ['battery-pack','generic']){assert.deepEqual(load().historyParameterGroups(type,points),[{label:'',points}]);assert.deepEqual(load().historyParameterGroups(type,points,'bms'),[{label:'',points:[points[1]]}])}});

test('parameter dialog keeps selection and raw export menus enforce permissions and scope',async()=>{
 const path=require('node:path'),states=[],refs=[];let cursor=0,refCursor=0,closed=0;
 const react={useState:initial=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}]},useRef:()=>{const index=refCursor++;return refs[index]??(refs[index]={current:{showModal(){},close(){closed++}}})},useMemo:fn=>fn()};
 function module(file){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{
 if(name==='react')return react;if(name==='react/jsx-runtime')return {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
 if(name.startsWith('@/data/'))return module(path.join(__dirname,'../src/data',name.split('/').at(-1)+'.ts'));
 if(name==='@/preferences/date')return {dateKey:()=> '2026-10-19',calendarBounds:()=>({start:new Date('2026-10-19'),end:new Date('2026-10-20')})};
 if(name==='@/preferences/store')return {getPreferences:()=>({timezone:'UTC'})};
 if(name==='./reference-station/shared')return {useStationQuery:()=>({data:[],loading:false})};return {};
 });return exports}
 const Component=module(path.join(__dirname,'../src/components/ReferenceDeviceHistory.tsx')).ReferenceDeviceHistory;
 const points=[{id:1,name:'交流电压R/U/A',unit:'V'},{id:2,name:'电网电压上限',unit:'V'}],props={detail:{type:'inverter',archive:{id:1},points,configuration:{selectedPointIds:[2]}},telemetry:true,canExport:false};
 function render(){cursor=0;refCursor=0;return Component(props)}
 function nodes(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)]}
 function button(tree,label){return nodes(tree).find(n=>n.type==='button'&&n.props.children===label)}
 let tree=render();button(tree,'参数选择').props.onClick();tree=render();assert.deepEqual(states[0],[2]);
 nodes(tree).find(n=>n.props?.['aria-label']==='搜索历史参数').props.onChange({target:{value:'交流'}});tree=render();const box=nodes(tree).find(n=>n.type==='input'&&n.props.type==='checkbox');box.props.onChange({target:{checked:true}});tree=render();assert.ok(nodes(tree).some(n=>n.type==='span'&&JSON.stringify(n.props.children)==='["已选择 ",2,"/12"]'));
 button(tree,'取消').props.onClick();assert.deepEqual(states[0],[2]);button(render(),'参数选择').props.onClick();tree=render();assert.deepEqual(states[3],[2]);
 button(tree,'恢复默认').props.onClick();tree=render();assert.deepEqual(states[3],[1]);assert.deepEqual(states[0],[2]);button(tree,'确定').props.onClick();assert.deepEqual(states[0],[1]);assert.equal(closed,2);
 const exported=[];props.onExport=async request=>{exported.push(request)};
 tree=render();assert.equal(button(tree,'导出已选参数').props.disabled,true);
 props.canExport=true;tree=render();
 const event={currentTarget:{closest:()=>({removeAttribute(){}})}};
 button(tree,'导出已选参数').props.onClick(event);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(exported[0],{date:'2026-10-19',days:1,timezone:'UTC',scope:'selected',pointIds:[1]});
 tree=render();nodes(tree).filter(n=>n.type==='button'&&n.props.children==='导出全部参数')[1].props.onClick(event);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(exported[1],{date:'2026-10-19',days:5,timezone:'UTC',scope:'all',pointIds:[]});
 props.telemetry=false;tree=render();assert.equal(button(tree,'导出全部参数').props.disabled,true);
});
