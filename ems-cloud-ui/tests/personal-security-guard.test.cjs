const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
test('security inputs confirm discard, preserve cancelled edits and block leaving while a mocked save is pending',async()=>{
 const states=[],refs=[],listeners=new Map();let stateIndex=0,refIndex=0,guard,dirtyOptions,settled,requested=0,tree;
 const previousWindow=global.window;global.window={addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)};
 const react={useState:initial=>{const i=stateIndex++;if(!(i in states))states[i]=initial;return[states[i],value=>states[i]=typeof value==='function'?value(states[i]):value]},useRef:initial=>{const i=refIndex++;return refs[i]??(refs[i]={current:initial})},useCallback:fn=>fn,useEffect:fn=>fn()};
 const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};let release;const save=new Promise(resolve=>release=resolve);let writes=0;
 const deps={'react':react,'react/jsx-runtime':jsx,'@/api/client':{send:()=>{writes++;return save}},'@/auth/AuthContext':{useAuth:()=>({logout:()=>{},user:{id:'7'}})},'@/components/ui/Workspace':{Button:'button',Badge:'badge'},'@/components/SettingsDialog':{default:'dialog'},'@/components/LoadingState':{default:'loading'},'@/components/useEditorLeaveGuard':{useEditorLeaveGuard:options=>{dirtyOptions=options;return{requestLeave:async()=>{requested++;if(options.dirty){options.onConfirm();return false}return true},settleLeave:allow=>settled=allow}}},'./shared':{Field:'field',QueryState:'query',useTenantQuery:()=>({data:{account:'test',mfa_enabled:false}})}};
 const m={exports:{}};new Function('require','exports','module',ts.transpileModule(fs.readFileSync(`${__dirname}/../src/tenant/PersonalCenterPage.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(k=>deps[k],m.exports,m);
 function render(){stateIndex=0;refIndex=0;tree=m.exports.PersonalSecurity({registerLeaveGuard:fn=>guard=fn});return tree}
 function nodes(node,predicate,result=[]){if(node&&typeof node==='object'){if(predicate(node))result.push(node);for(const child of [].concat(node.props?.children??[]))nodes(child,predicate,result)}return result}
 try{
  render();assert.equal(await guard(),true);assert.equal(dirtyOptions.dirty,false);
  nodes(tree,n=>n.type==='input')[0].props.onChange({target:{value:'test-input'}});render();assert.equal(dirtyOptions.dirty,true);
  let prevented=false;listeners.get('beforeunload')({preventDefault:()=>prevented=true});assert.equal(prevented,true);
  assert.equal(await guard(),false);render();let dialog=nodes(tree,n=>n.type==='dialog')[0];assert.ok(dialog);dialog.props.onClose();render();assert.equal(settled,false);assert.equal(nodes(tree,n=>n.type==='input')[0].props.value,'test-input');
  await guard();render();dialog=nodes(tree,n=>n.type==='dialog')[0];const buttons=nodes(dialog,n=>n.type==='button');buttons.find(n=>n.props.children==='放弃修改').props.onClick();render();assert.equal(settled,true);assert.ok(nodes(tree,n=>n.type==='input').every(n=>n.props.value===''));
  const inputs=nodes(tree,n=>n.type==='input');inputs[0].props.onChange({target:{value:'current-test'}});inputs[1].props.onChange({target:{value:'NewTest123'}});inputs[2].props.onChange({target:{value:'NewTest123'}});render();
  const pending=nodes(tree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});render();assert.equal(writes,1);assert.ok(nodes(tree,n=>n.type==='input').every(n=>n.props.disabled));const before=requested;assert.equal(await guard(),false);assert.equal(requested,before);release();await pending;
 }finally{global.window=previousWindow}
});
