const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const source=compile(fs.readFileSync(__dirname+'/../src/components/AlarmRulesPage.tsx','utf8'));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const all=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(all):[tree,...all(tree.props?.children)];
const text=tree=>typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):'';
const named=tree=>all(tree).find(n=>n.type==='button'&&text(n)==='Local rule');
const toggle=tree=>all(tree).find(n=>n.props?.role==='switch');
const detail=tree=>all(tree).find(n=>n.props?.['aria-label']==='规则详情');
async function harness(){
 const slots=[],effects=[],historyRequests=[];let cursor=0,finish;
 let row={id:139,name:'Local rule',station_id:9,station_name:'Station',object_type:'STATION',severity:'info',conditions:[],effective_start:0,effective_end:1440,recovery_duration:0,notification:{needed:false},solution:'',enabled:false,version:3,evaluationStatus:'disabled',evaluationReason:'规则已停用',deliveryStatus:'not_connected'};
 const user={id:'7'};
 const changed=(old,deps)=>!old||deps?.some((v,n)=>v!==old[n]);
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value]},useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial})},useEffect(effect,deps){const i=cursor++;if(changed(slots[i],deps))effects.push(effect);slots[i]=deps},useCallback(fn,deps){const i=cursor++;if(changed(slots[i]?.deps,deps))slots[i]={fn,deps};return slots[i].fn}};
 const api={listAlarmRules:async()=>[structuredClone(row)],toggleAlarmRule:()=>new Promise(resolve=>{finish=()=>{row={...row,enabled:true,version:4,evaluationStatus:'ready',evaluationReason:'等待首次执行'};resolve(row)}}),alarmRuleHistory:()=>new Promise(resolve=>historyRequests.push({version:row.version,resolve}))};
 const out={};new Function('exports','require',source)(out,id=>id==='react'?hooks:id==='react/jsx-runtime'?require(id):id==='lucide-react'?{}:id==='@/auth/AuthContext'?{useAuth:()=>({user})}:id==='@/auth/apiPermissions'?{hasStationPermission:()=>true}:id==='@/api/alarmWorkspace'?api:id==='./useEditorLeaveGuard'?{useEditorLeaveGuard:()=>({requestLeave:async()=>true,settleLeave(){}})}:{});
 function render(){cursor=0;const tree=out.default({stations:[{id:'9',name:'Station'}]});effects.splice(0).forEach(effect=>effect());return tree}
 render();await tick();render();
 return {render,historyRequests,finish:async()=>{finish();await tick()},resolveHistory:index=>{const h=historyRequests[index];h.resolve([{id:index,version:h.version,action:'enabled',occurred_at:'local'}])}};
}
test('mutation blocks same-tick detail clicks and reopens the refreshed rule and revision after completion',async()=>{
 const h=await harness(),before=h.render();toggle(before).props.onClick();named(before).props.onClick();
 assert.equal(detail(h.render()),undefined);assert.equal(h.historyRequests.length,0);assert.equal(named(h.render()).props.disabled,true);
 await h.finish();let tree=h.render();assert.equal(toggle(tree).props['aria-checked'],true);assert.equal(named(tree).props.disabled,false);
 named(tree).props.onClick();h.resolveHistory(0);await tick();tree=h.render();
 assert.match(text(detail(tree)),/待检测/);assert.match(text(detail(tree)),/V4/);assert.doesNotMatch(text(detail(tree)),/规则已停用|V3/);
});
test('starting a list mutation closes an existing detail and ignores its late history response',async()=>{
 const h=await harness();named(h.render()).props.onClick();assert.ok(detail(h.render()));
 toggle(h.render()).props.onClick();assert.equal(detail(h.render()),undefined);
 await h.finish();named(h.render()).props.onClick();h.resolveHistory(1);await tick();
 assert.match(text(detail(h.render())),/V4/);h.resolveHistory(0);await tick();
 assert.match(text(detail(h.render())),/V4/);assert.doesNotMatch(text(detail(h.render())),/V3/);
});
