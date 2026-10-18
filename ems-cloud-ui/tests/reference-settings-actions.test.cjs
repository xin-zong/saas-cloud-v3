const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
test('settings action restarts after StrictMode cleanup and ignores the aborted first request',async()=>{
 const effects=[],values=[],refs=[];let index=0;
 const react={useEffect:f=>effects.push(f),useRef:v=>{const r={current:v};refs.push(r);return r},useState:v=>{const i=index++;values[i]=v;return [v,n=>{values[i]=n}]}};
 const exports={};const code=ts.transpileModule(fs.readFileSync('src/components/reference-settings-shared.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('require','exports',code)(name=>name==='react'?react:{},exports);
 const state=exports.useSettingsAction(),cleanup=effects[0]();let rejectFirst,resolveSecond,secondStarted=false;
 const first=state.run(()=>new Promise((_,reject)=>rejectFirst=reject));cleanup();effects[0]();
 const second=state.run(()=>{secondStarted=true;return new Promise(resolve=>resolveSecond=resolve)});
 assert.equal(secondStarted,true);rejectFirst(Object.assign(new Error('aborted'),{name:'AbortError'}));await first;
 assert.equal(values[0],true);assert.equal(values[1],'');resolveSecond();await second;assert.equal(values[0],false);
});
