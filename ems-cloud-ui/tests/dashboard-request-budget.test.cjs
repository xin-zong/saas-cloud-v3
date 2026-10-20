const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react')

// Execute the production component tree with deterministic hooks; replace HTTP,
// charts and unrelated visual children, without opening a browser or database.
function fixture({scene='storage',pending=false}={}) {
 const calls=[],states=new Map(),cache=new Map();let active,cursor
 const hooks={...React,useState(initial){const index=cursor++;if(!(index in active))active[index]=typeof initial==='function'?initial():initial;const state=active;return [state[index],value=>state[index]=typeof value==='function'?value(state[index]):value]},useEffect(){},useCallback:fn=>fn,useRef:value=>({current:value})}
 function load(file){if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports)
  new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,name=>{
   if(name==='react')return hooks;if(name==='react/jsx-runtime')return require(name)
   if(name.endsWith('.css'))return {}
   if(name==='@/api/client')return {api:url=>{calls.push(url);return Promise.resolve(undefined)},send:async()=>{}}
   if(name==='@/api/stationGenerationPlans')return {loadStationGenerationPlans:()=>{calls.push('plans');return Promise.resolve([])}}
   if(name==='@/api/substations')return {substationsApi:{list:()=>{calls.push('substations');return Promise.resolve([])}}}
   if(name.endsWith('reference-station/shared'))return {Empty:()=>null,QueryState:props=>React.createElement('query-state',props),useStationQuery:(key,loader)=>{
    loader(new AbortController().signal);return {loading:pending,error:'',data:undefined}
   }}
   if(name.startsWith('@/data/'))return load(path.resolve(__dirname,'../src/data',name.slice(7)+'.ts'))
   if(name==='./StationDashboardHistory')return load(path.resolve(__dirname,'../src/components/StationDashboardHistory.tsx'))
   return new Proxy({},{get:(_target,key)=>key==='__esModule'?true:()=>null})
  });return exports
 }
 const Component=load(path.resolve(__dirname,'../src/components/StationDashboardParity.tsx')).default
 const props={station:{id:'7',name:'station',ratedPower:100,storageCapacity:200},view:{sourceTime:'2026-10-18T12:00:00Z',timezone:'UTC',telemetryAvailable:true,scenes:[scene],panels:[],equipment:[],alarms:[],flow:{batteryKw:1}},telemetry:true,onDevices(){},onSources(){},onAlarms(){}}
 function expand(node,position='root'){
  if(node==null||typeof node!=='object')return node
  if(Array.isArray(node))return node.map((child,index)=>expand(child,position+':'+index))
  if(typeof node.type==='function'){
   if(node.type.prototype?.isReactComponent)return null
   const previous=active,previousCursor=cursor;active=states.get(position)??[];states.set(position,active);cursor=0
   const result=node.type(node.props);active=previous;cursor=previousCursor;return expand(result,position+':component')
  }
  return {...node,props:{...node.props,children:expand(node.props?.children,position+':children')}}
 }
 function render(){calls.length=0;return expand(React.createElement(Component,props))}
 return {calls,render,props}
}
function walk(node){return node==null||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(walk):[node,...walk(node.props?.children)]}
function click(tree,label){const button=walk(tree).find(node=>node.type==='button'&&node.props.children===label);assert.ok(button,`button ${label}`);button.props.onClick()}

test('storage dashboard reads one day capture and one shared week capture, without solar plans or year',()=>{
 const f=fixture();f.render()
 assert.equal(f.calls.filter(url=>url.includes('period=day&')).length,1)
 assert.equal(f.calls.filter(url=>url.includes('period=week&')).length,1)
 assert.equal(f.calls.filter(url=>url.includes('period=total&')).length,1,'cumulative metric card still needs total')
 assert.equal(f.calls.filter(url=>url.includes('period=year&')).length,0)
 assert.equal(f.calls.filter(url=>url==='plans').length,0)
})

test('initial history pending does not hide the live metric panel',()=>{
 const tree=fixture({pending:true}).render()
 assert.ok(walk(tree).some(node=>node.props?.className==='sdp-card sdp-metrics'))
 assert.ok(walk(tree).some(node=>node.type==='query-state'&&node.props.loading&&node.props.loadingText==='加载补充与累计统计…'))
})

test('changing history period requests selected period while the initial day remains shared',()=>{
 const f=fixture();let tree=f.render();click(tree,'月');tree=f.render()
 assert.equal(f.calls.filter(url=>url.includes('period=month&')).length,1)
 assert.equal(f.calls.filter(url=>url.includes('period=day&')).length,1)
})

test('storage cards keep independent periods, and equal selections converge to one request',()=>{
 const f=fixture();let tree=f.render()
 let cards=walk(tree).filter(node=>node.props?.className==='sdp-card sdh-stat')
 click(cards[0],'月');tree=f.render()
 assert.equal(f.calls.filter(url=>url.includes('period=month&')).length,1)
 assert.equal(f.calls.filter(url=>url.includes('period=week&')).length,1)
 cards=walk(tree).filter(node=>node.props?.className==='sdp-card sdh-stat')
 click(cards[1],'月');f.render()
 assert.equal(f.calls.filter(url=>url.includes('period=month&')).length,1)
 assert.equal(f.calls.filter(url=>url.includes('period=week&')).length,0)
})

test('solar scene retains generation plan year and cumulative queries',()=>{
 const f=fixture({scene:'solar'});f.render()
 assert.equal(f.calls.filter(url=>url==='plans').length,1)
 assert.equal(f.calls.filter(url=>url.includes('period=year&')).length,1)
 assert.equal(f.calls.filter(url=>url.includes('period=total&')).length,1)
})

test('telemetry denied after navigation starts no history or generation-plan requests',()=>{
 const f=fixture();f.props.telemetry=false;f.render();assert.deepEqual(f.calls,[])
})
