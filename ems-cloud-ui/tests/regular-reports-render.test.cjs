const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const source=fs.readFileSync(`${__dirname}/../src/components/MonitorReportsWorkspace.tsx`,'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText
const types={daily:'日级数据报表',monthly:'月级数据报表',yearly:'年级数据报表',total:'累计数据报表'}
function render(production){
 const exports={};const writes=[]
 const imported=id=>{
  if(id==='react')return React;if(id==='react/jsx-runtime')return require(id)
  if(id==='@/auth/AuthContext')return {useAuth:()=>({user:{id:'7',account:'test',stationPermissions:{}}})}
  if(id==='@/data/regularReports'){const data={};new Function('exports',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/data/regularReports.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(data);return data}
  if(id==='./useConfigurationLeaveGuard')return {useConfigurationLeaveGuard:({onClose})=>({close:onClose,confirmation:null})}
  if(id==='./useRegularReportJobs')return {useRegularReportJobs:()=>({records:[],total:0,page:0,size:50,loading:false,busy:false,error:'',active:null,refresh:()=>{}})}
  if(id==='@/api/regularReportJobs')return {}
  if(id==='@/auth/apiPermissions')return {hasStationPermission:()=>true}
  if(id==='@/api/regularReports')return {REGULAR_REPORT_TYPES:types,reportConfigSave:()=>writes.push('save')}
  if(id.endsWith('.css'))return {}
  throw new Error(`Unexpected runtime dependency: ${id}`)
 }
 new Function('require','exports',compiled)(imported,exports)
 return {html:renderToStaticMarkup(React.createElement(exports.default,{stations:[],production})),writes}
}
test('production form keeps unverified preview/export disabled and never substitutes station analysis',()=>{
 const {html,writes}=render(true)
 assert.match(html,/生产运行日报/);assert.match(html,/业务组/)
 assert.match(html,/<select disabled=""><option>暂无已接入的业务组目录/)
 assert.match(html,/<button disabled="">预览<\/button>/)
 assert.match(html,/<button disabled="" class="mr-primary">导出<\/button>/)
 assert.deepEqual(writes,[])
})
test('regular report screen exposes independent list/template/task navigation and an honest empty persisted result list',()=>{
 const {html,writes}=render(false)
 assert.match(html,/role="tab" aria-selected="true">报表列表/)
 assert.match(html,/role="tab" aria-selected="false">报表模板/)
 assert.match(html,/role="tab" aria-selected="false">自动化任务/)
 assert.match(html,/暂无数据/);assert.match(html,/共0条/)
 assert.deepEqual(writes,[])
})

