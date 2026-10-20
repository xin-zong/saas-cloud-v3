const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,deps={}){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/${file}`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(out,id=>deps[id]??require(id));return out}
const modulePath='data/stationFlow.ts';
const base={gridKw:20,loadKw:60,pcsKw:8,mpptKw:45,batteryKw:5};
test('measured grid import/export and battery charge/discharge reverse only their own bus branches',()=>{
 const {buildStationFlow}=load(modulePath);
 const forward=buildStationFlow(base,'import-charge-positive');
 assert.deepEqual(forward.edges.map(({from,to,animate})=>[from,to,animate]),[['tower','pcs',true],['solar','pcs',true],['pcs','factory',true],['pcs','battery',true]]);
 const reverse=buildStationFlow({...base,gridKw:-20,batteryKw:-5},'import-charge-positive');
 assert.deepEqual(reverse.edges.map(({from,to})=>[from,to]),[['pcs','tower'],['solar','pcs'],['pcs','factory'],['battery','pcs']]);
 assert.equal(reverse.metrics.tower.value,'-20');assert.equal(reverse.metrics.battery.value,'-5');
 assert.ok(!reverse.edges.some(e=>e.from==='solar'&&e.to==='battery'));
});
test('zero missing invalid and undeclared sign convention never animate',()=>{
 const {buildStationFlow}=load(modulePath);
 const zero=buildStationFlow({gridKw:0,loadKw:0,pcsKw:0,mpptKw:0,batteryKw:0},'import-charge-positive');
 assert.ok(zero.edges.every(e=>!e.animate));assert.equal(zero.metrics.tower.value,'0');
 const missing=buildStationFlow(null,'import-charge-positive');assert.ok(missing.edges.every(e=>!e.animate));assert.equal(missing.metrics.tower.value,'—');
 const unknown=buildStationFlow(base,null);assert.ok(unknown.edges.filter(e=>['grid','battery'].includes(e.id)).every(e=>!e.animate));assert.equal(unknown.gridDirection,'unknown');assert.equal(unknown.batteryDirection,'unknown');
 const invalid=buildStationFlow({...base,gridKw:NaN,batteryKw:Infinity,loadKw:-1,mpptKw:-3},'import-charge-positive');assert.ok(invalid.edges.every(e=>!e.animate));assert.equal(invalid.metrics.tower.value,'—');
});
test('scene masks unrelated measured nodes without fabricating replacement measurements',()=>{
 const {buildStationFlow}=load(modulePath);const grid=buildStationFlow(base,'import-charge-positive','grid');assert.deepEqual(grid.edges.map(e=>e.id),['grid','load']);assert.equal(grid.metrics.solar.value,'—');assert.equal(grid.metrics.battery.value,'—');
});
test('original 2D measured labels preserve signed kW and never render legacy allocations',()=>{
 const {buildStationFlow}=load(modulePath);const flow=buildStationFlow({...base,gridKw:-20,batteryKw:-5},'import-charge-positive');
 const Diagram=load('components/EnergyFlowDiagram.tsx').default;
 const station={name:'Test',status:'online',runStatus:'正常',soc:45,activePower:999999,pvOutput:100,storageCapacity:100};
 const html=renderToStaticMarkup(React.createElement(Diagram,{station,measured:flow}));
 assert.match(html,/-20<\/tspan>/);assert.match(html,/-5<\/tspan>/);assert.doesNotMatch(html,/data-flow="pv-battery"/);assert.match(html,/data-flow="battery"[^>]*data-active="true"/);assert.match(html,/viewBox="0 0 1063 582"/);assert.doesNotMatch(html,/32°/);
 const empty=renderToStaticMarkup(React.createElement(Diagram,{station,measured:buildStationFlow(null,null)}));assert.doesNotMatch(empty,/data-active="true"/);assert.match(empty,/—/);
});
test('view switch remains visible without flow data and both views receive the same measured model',()=>{
 const {buildStationFlow}=load(modulePath),empty=buildStationFlow(null,null),captured=[];
 const Component=load('components/StationDashboardFlow.tsx',{
  '@/data/stationFlow':{buildStationFlow},
  './EnergyFlowDiagram':{default:({measured})=>{captured.push(measured.metrics);return React.createElement('p',null,measured.metrics.tower.value)}},
  './EnergyFlow3D':{INIT_DEVICES:[{id:'pcs',type:'pcs'},{id:'tower',type:'tower'},{id:'battery',type:'battery'}],default:({metrics,edges})=>{captured.push(metrics);assert.ok(edges.every(e=>typeof e.animate==='boolean'));return React.createElement('p',null,metrics.tower.value)}}
 }).default;
 for(const view of ['2d','3d']){
  const html=renderToStaticMarkup(React.createElement(Component,{scene:'overall',station:{name:'Test'},metrics:empty.metrics,rawFlow:null,view}));
  assert.match(html,/2D 能流/);assert.match(html,/3D 视图/);assert.match(html,/—/);
 }
 captured.length=0;
 for(const view of ['2d','3d'])renderToStaticMarkup(React.createElement(Component,{scene:'overall',station:{name:'Test'},metrics:empty.metrics,rawFlow:base,directionConvention:'import-charge-positive',view}));
 assert.deepEqual(captured[0],captured[1]);assert.equal(captured[0].tower.value,'20');
});
test('legacy diagram consumers keep their original geometry and fallback powers',()=>{
 const Diagram=load('components/EnergyFlowDiagram.tsx').default;
 const html=renderToStaticMarkup(React.createElement(Diagram,{station:{name:'Legacy',status:'online',runStatus:'正常',soc:50,activePower:100,pvOutput:.2,storageCapacity:1}}));
 assert.match(html,/data-flow="pv-battery"[^>]*data-active="true"/);assert.match(html,/Build-in Power/);assert.match(html,/32°/);
});
test('2D motion follows the signed path and is absent for zero missing or unknown direction',()=>{
 const {buildStationFlow}=load(modulePath),Diagram=load('components/EnergyFlowDiagram.tsx').default,station={name:'Test',status:'online',runStatus:'正常',soc:50,activePower:0,pvOutput:0,storageCapacity:0};
 const render=flow=>renderToStaticMarkup(React.createElement(Diagram,{station,measured:flow}));
 const html=render(buildStationFlow({gridKw:-20,loadKw:0,pcsKw:null,mpptKw:0,batteryKw:5},'import-charge-positive'));
 assert.match(html,/<animateMotion[^>]*path="M430 270 H415 V180 Q415 150 385 150 H320"/);
 assert.match(html,/<animateMotion[^>]*path="M635 310 H665 Q695 310 695 340 V432 H743"/);
 assert.doesNotMatch(render(buildStationFlow({gridKw:0,loadKw:0,pcsKw:0,mpptKw:0,batteryKw:0},'import-charge-positive')),/animateMotion/);
 assert.doesNotMatch(render(buildStationFlow({gridKw:10,loadKw:0,pcsKw:0,mpptKw:0,batteryKw:10},null)),/animateMotion/);
});
test('separate generation measurement takes priority over MPPT and preserves zero',()=>{
 const {buildStationFlow}=load(modulePath);
 assert.equal(buildStationFlow({...base,solarKw:123,mpptKw:9},null).metrics.solar.value,'123');
 const zero=buildStationFlow({...base,solarKw:0,mpptKw:9},null);assert.equal(zero.metrics.solar.value,'0');assert.equal(zero.solarDirection,'idle');
 assert.equal(buildStationFlow({...base,solarKw:null,mpptKw:9},null).metrics.solar.value,'9');
});
test('measured SOC uses validated flow SOC and never leaks station SOC when telemetry is missing',()=>{
 const {buildStationFlow}=load(modulePath),Diagram=load('components/EnergyFlowDiagram.tsx').default;
 const station={name:'Test',status:'online',runStatus:'正常',soc:87,activePower:0,pvOutput:0,storageCapacity:1};
 const render=flow=>renderToStaticMarkup(React.createElement(Diagram,{station,measured:buildStationFlow(flow,null)}));
 assert.match(render({...base,batterySoc:23}),/>SOC 23%</);assert.doesNotMatch(render({...base,batterySoc:23}),/>87%</);
 for(const flow of [null,base,{...base,batterySoc:-1},{...base,batterySoc:101},{...base,batterySoc:NaN}]){const html=render(flow);assert.doesNotMatch(html,/>87%</);assert.match(html,/>SOC —<\/text>/);}
 assert.equal(buildStationFlow({...base,batterySoc:0},null).batterySoc,0);
 assert.equal(buildStationFlow({...base,batterySoc:100},null).batterySoc,100);
});
test('measured 2D exposes five selectable devices and retains signed measurements',()=>{const {buildStationFlow}=load(modulePath),D=load('components/EnergyFlowDiagram.tsx').default,html=renderToStaticMarkup(React.createElement(D,{station:{name:'Test'},measured:buildStationFlow(base,'import-charge-positive'),selectedType:'pcs',onDeviceSelect:()=>{}}));assert.equal((html.match(/role="button"/g)||[]).length,5);assert.match(html,/data-device="pcs"[^>]*aria-pressed="true"/);assert.match(html,/aria-label="PCS[^\"]*查看对应指标/);for(const type of ['tower','factory','solar','battery'])assert.match(html,new RegExp(`data-device="${type}"`));assert.match(html,/公共母线/);assert.match(html,/能量流向根据采样功率显示/);assert.doesNotMatch(html,/不推算节点间分配电量/);assert.doesNotMatch(html,/32°|Normal/)});
test('2D device activation calls only the selected type and supports keyboard Enter and Space',()=>{const D=load('components/EnergyFlowDiagram.tsx'),called=[],choose=type=>called.push(type);D.activateFlowDevice('solar',choose);D.activateFlowDevice('pcs',choose,{key:'Enter',preventDefault(){called.push('prevent')}});D.activateFlowDevice('battery',choose,{key:' ',preventDefault(){called.push('prevent')}});D.activateFlowDevice('factory',choose,{key:'Escape',preventDefault(){called.push('wrong')}});assert.deepEqual(called,['solar','prevent','pcs','prevent','battery']);D.activateFlowDevice('tower',undefined)});

 test('flow labels remove binary precision noise without rounding raw direction data or tiny powers to zero',()=>{
 const {buildStationFlow}=load(modulePath);const input={gridKw:0.9434600000000001,loadKw:1.25694,pcsKw:null,batteryKw:0.000000123456};const model=buildStationFlow(input,'import-charge-positive');assert.equal(model.metrics.tower.value,'0.9435');assert.equal(model.metrics.factory.value,'1.257');assert.equal(model.metrics.pcs.value,'—');assert.notEqual(Number(model.metrics.battery.value),0);assert.equal(model.values.gridKw,input.gridKw);assert.equal(model.values.batteryKw,input.batteryKw);assert.equal(model.batteryDirection,'forward');
 });
