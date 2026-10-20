const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const compiled=ts.transpileModule(fs.readFileSync(`${__dirname}/../src/components/ReferenceTariffsPage.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText
function render(permissions=[]){const exports={},calls=[];new Function('require','exports',compiled)(id=>{
 if(id==='react'||id==='react/jsx-runtime')return require(id)
 if(id==='@/auth/AuthContext')return {useAuth:()=>({user:{id:'7',permissions}})}
 if(id==='@/api/tariffLibrary')return {loadTariffLibrary:()=>calls.push('manual'),loadAutomaticTariffCatalog:()=>calls.push('automatic')}
 if(id==='@/data/tariffLibrary')return {tariffLibraryPage:()=>0}
 if(id==='@/api/tariffTemplates')return {TARIFF_BANDS:[]}
 if(id.endsWith('.css'))return {}
 throw new Error(`Unexpected import ${id}`)
},exports);return {html:renderToStaticMarkup(React.createElement(exports.default,{})),calls}}
test('tariff library preserves manual/automatic tabs without fabricating frontend source rows',()=>{const {html,calls}=render(['tariff.manage']);assert.match(html,/role="tab" aria-selected="true">手动电价库/);assert.match(html,/role="tab" aria-selected="false">自动电价库/);assert.match(html,/有效周期/);assert.doesNotMatch(html,/10YES-REE/);assert.deepEqual(calls,[])})
test('reader without tariff.manage cannot start creating or refreshing a tariff',()=>{const {html}=render();assert.match(html,/<button class="rt-primary" disabled="">＋ 新增电价费率/);assert.match(html,/<button disabled="">刷新/);assert.match(html,/当前无费率管理权限/)})


