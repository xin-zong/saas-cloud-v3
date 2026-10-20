const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Execute real API modules, substituting only the external HTTP boundary.
function stationApi(request) {
  const cache = {}
  function load(file) {
    if (cache[file]) return cache[file]
    if (file.endsWith('/preferences/date')) return {localized:(date, method, ...args)=>date[method](...args)}
    if (file.endsWith('/tenant/permissionTree')) return {menuRoutes:()=>[]}
    const exports = {}; cache[file] = exports
    const source = fs.readFileSync(file+'.ts','utf8').replaceAll('import.meta.env','({})')
    const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
    new Function('exports','require',js)(exports,name=>name.startsWith('@/')?load(path.resolve(__dirname,'../src',name.slice(2)).replaceAll('\\','/')):load(path.resolve(path.dirname(file),name).replaceAll('\\','/')))
    return exports
  }
  const client = path.resolve(__dirname,'../src/api/client').replaceAll('\\','/')
  if(request) cache[client] = {api:request,allRows:(url,signal)=>request(url,{signal})}
  return {...load(path.resolve(__dirname,'../src/api/stations').replaceAll('\\','/')),client:load(client)}
}
const permissions = ['asset.read','alarm.read','telemetry.read','inspection.manage','strategy.read','market.read','revenue.read','workorder.read']
const user = {id:'u1',permissions,stationIds:['1','2'],stationPermissions:{'1':permissions,'2':permissions}}

test('directory loading returns authorized identities without loading station business details',async()=>{
  const calls=[]
  const {loadStations}=stationApi(async(url)=>{calls.push(url);return url==='/stations'?[{id:1,name:'A'},{id:2,name:'B'},{id:3,name:'forbidden'}]:[]})
  const rows=await loadStations(user,undefined,'directory')
  assert.deepEqual(calls,['/stations'])
  assert.deepEqual(rows.map(row=>row.id),['1','2'])
  assert.ok(Number.isNaN(rows[0].soc),'directory must not invent measurements')
})

test('directory preserves independent operation permission identities with no asset permission',async()=>{
  const calls=[],signal=new AbortController().signal
  const scoped={...user,permissions:['alarm.read'],stationIds:['2'],stationPermissions:{'2':['alarm.read']}}
  const {loadStations}=stationApi(async(url,init)=>{calls.push(url);assert.equal(init.signal,signal);return [{id:2,name:'Alarm station'},{id:3,name:'forbidden'}]})
  const rows=await loadStations(scoped,signal,'directory')
  assert.deepEqual(calls,['/stations/options?permission=alarm.read'])
  assert.deepEqual(rows.map(row=>row.id),['2'])
})

test('legacy full mode retains business detail hydration and station permission checks',async()=>{
  const calls=[]
  const scoped={...user,permissions:['asset.read'],stationIds:['1'],stationPermissions:{'1':['asset.read']}}
  const {loadStations}=stationApi(async(url)=>{calls.push(url);if(url==='/stations')return [{id:1,name:'A'}];if(url==='/stations/1/devices')return [{id:10,name:'Device',communication_status:'online'}];return []})
  const rows=await loadStations(scoped,undefined,'full')
  assert.deepEqual(calls,['/stations','/stations/1/devices','/stations/1/firmware-tasks'])
  assert.equal(rows[0].deviceInventory[0].name,'Device')
  assert.equal(rows[0].devices.online,1)
  assert.equal(rows[0].maintenance.alarms,undefined)
})

// Run the actual App effect callbacks without mounting unrelated visual components.
function appEffect(needle,scope) {
  const source=fs.readFileSync(path.join(__dirname,'../src/App.tsx'),'utf8')
  const ast=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
  let callback
  function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes(needle))callback=node.arguments[0].getText(ast);ts.forEachChild(node,visit)}
  visit(ast);assert.ok(callback,`missing App effect ${needle}`)
  const js=ts.transpileModule('const effect = '+callback,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
  return new Function(...Object.keys(scope),js+'; return effect();')(...Object.values(scope))
}
const flush=()=>new Promise(resolve=>setImmediate(resolve))

test('Reference routes load directory only and cancellation ignores a late result',async()=>{
  let resolve,request,committed=false
  const cleanup=appEffect('loadStations(user',{
    DEMO_MODE:false,user,stationLoadMode:'directory',setApiLoading(){},setApiError(){},setStations(){committed=true},
    loadStations:(_user,signal,mode)=>{request={signal,mode};return new Promise(done=>resolve=done)}
  })
  assert.equal(request.mode,'directory')
  cleanup();assert.ok(request.signal.aborted)
  resolve([{id:'old-user-station'}]);await flush();assert.equal(committed,false)
})

test('Reference routes never open global telemetry requests or polling timers',()=>{
  let calls=0
  const cleanup=appEffect('refreshPresence = async',{
    DEMO_MODE:false,stationLoadMode:'directory',presenceIds:'1,2',user,document:{hidden:false},
    hasStationPermission:()=>true,loadStationSnapshot(){calls++;return Promise.resolve({})},
    api(){calls++;return Promise.resolve({})},setStations(){},setTimeout(){calls++}
  })
  cleanup?.();assert.equal(calls,0)
})

test('directory HTTP response from a previous session is rejected before identities are returned',async t=>{
  const previous={fetch:global.fetch,sessionStorage:global.sessionStorage,window:global.window}
  t.after(()=>Object.assign(global,previous))
  const storage=new Map();global.sessionStorage={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
  global.window={dispatchEvent(){}}
  const {loadStations,client}=stationApi();client.setToken('first-user')
  let resolve;global.fetch=()=>new Promise(done=>resolve=done)
  const pending=loadStations(user,undefined,'directory')
  client.setToken('next-user')
  resolve({ok:true,status:200,json:async()=>({code:0,data:[{id:1,name:'old user'}]})})
  await assert.rejects(pending,/会话已变化/)
})

test('permission scope changes replace directory identities and never reuse a previous result',async()=>{
  const calls=[]
  const {loadStations}=stationApi(async url=>{calls.push(url);return [{id:1,name:'A'},{id:2,name:'B'}]})
  const first=await loadStations(user,undefined,'directory')
  const restricted={...user,stationIds:['2'],stationPermissions:{'2':['asset.read']}}
  const second=await loadStations(restricted,undefined,'directory')
  assert.deepEqual(first.map(row=>row.id),['1','2'])
  assert.deepEqual(second.map(row=>row.id),['2'])
  assert.deepEqual(calls,['/stations','/stations'])
})
