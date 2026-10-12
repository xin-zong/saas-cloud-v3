const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{renderToStaticMarkup}=require('react-dom/server')
const preferences={language:'English',chartAnimation:'关闭'},cache=new Map()
function load(name){
 if(cache.has(name))return cache.get(name)
 const m={exports:{}};cache.set(name,m.exports)
 const source=fs.readFileSync(path.join(__dirname,'../src',name+'.ts'),'utf8').replaceAll('import.meta.env','{}')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','exports','module',code)(key=>key==='@/preferences/store'?{getPreferences:()=>preferences,subscribePreferences:()=>()=>{}}:key.startsWith('./')?load(path.posix.join(path.posix.dirname(name),key)):require(key),m.exports,m)
 return m.exports
}
const {jsx,jsxs}=load('i18n/jsx-runtime')
test('translated native option labels preserve original submitted string and numeric values',()=>{
 assert.equal(renderToStaticMarkup(jsx('option',{children:'简体中文'})),'<option value="简体中文">Simplified Chinese</option>')
 assert.equal(renderToStaticMarkup(jsxs('option',{children:['站点',' ',1]})),'<option value="站点 1">Site 1</option>')
})
test('user inputs, protocol evidence and explicit untranslated values stay unchanged',()=>{
 const html=renderToStaticMarkup(jsxs('div',{children:[jsx('textarea',{placeholder:'备注',defaultValue:'总览'}),jsx('pre',{children:'总览'}),jsx('span',{translate:'no',children:'总览'})]}))
 assert.match(html,/<textarea placeholder="Notes">总览<\/textarea>/);assert.match(html,/<pre>总览<\/pre>/);assert.match(html,/<span translate="no">总览<\/span>/)
})
test('chart motion and series names use global preferences without altering data keys',()=>{
 const Line=props=>jsx('span',{translate:'no',children:JSON.stringify(props)});Line.displayName='Line'
 const html=renderToStaticMarkup(jsx(Line,{name:'储能',dataKey:'storage'}))
 assert.match(html,/Storage/);assert.match(html,/storage/);assert.match(html,/isAnimationActive[^:]*:false/)
})
test('avatar initials derive from the translated full name instead of translating a single character',()=>{
 assert.equal(renderToStaticMarkup(jsx('span',{'data-i18n-initial':'总览',children:'总'})),'<span>O</span>')
})
