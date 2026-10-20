const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),runtime=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
const src=path.join(__dirname,'../src');
function load(file,dependencies={}){
 const exports={};
 const resolve=base=>[base,base+'.ts',base+'.tsx'].find(candidate=>fs.existsSync(candidate))??base;
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require',code)(exports,name=>name.endsWith('.css')?{}:name in dependencies?dependencies[name]:name.startsWith('@/')?load(resolve(path.join(src,name.slice(2))),dependencies):name.startsWith('.')?load(resolve(path.join(path.dirname(file),name)),dependencies):require(name));
 return exports;
}

const navigation=load(path.join(src,'navigation/referenceNavigation.ts')),management=load(path.join(src,'tenant/referenceManagement.ts'));
const appSource=ts.createSourceFile('App.tsx',fs.readFileSync(path.join(src,'App.tsx'),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function findNode(predicate){let found;function visit(node){if(predicate(node))found=node;ts.forEachChild(node,visit)}visit(appSource);assert.ok(found,'production integration node must remain discoverable');return found}
const referenceBlock=findNode(node=>ts.isIfStatement(node)&&node.expression.getText(appSource)==='!DEMO_MODE'&&node.thenStatement.getText(appSource).includes('const personalPages:')).thenStatement;
function compile(code,deps){const exports={};new Function('exports','require',...Object.keys(deps),ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(exports,require,...Object.values(deps));return exports.run}
const enterprise={id:'actor',name:'Operator',permissions:['company.profile.read','company.people.read','company.role.manage','company.grant.manage'],tenant:{kind:'enterprise',tenantId:2},menus:[{children:['company.profile','company.people','company.roles','company.grants'].map(path=>({path}))}]};
function renderApp(page,user=enterprise,allow=true){const writes=[],mounted=[];let workspace;
 const guard=async()=>{writes.push(['leave']);return allow},register=()=>{};
 const deps={referencePage:page,user,...navigation,...management,requestActiveEditorLeave:guard,setReferencePage:value=>writes.push(['page',value]),setActiveNav:value=>writes.push(['nav',value]),setElectricView:value=>writes.push(['view',value]),setActiveDetailId:value=>writes.push(['detail',value]),logoutConfirm:false,requestLogout:()=>{},registerSettingsLeaveGuard:register,
 ReferenceWorkspace:props=>{workspace=props;return React.createElement('main',null,props.children)},ReferenceManagementWorkspace:props=>{mounted.push(['management',props]);return React.createElement('output',null,'management:'+props.page)},SystemSettingsPage:props=>{mounted.push(['settings',props]);return React.createElement('output',null,'settings:'+props.initialCategory)},MessagesPage:props=>{mounted.push(['messages',props]);return React.createElement('output',null,'message list')},stations:[],scopedStations:[],activeDetailId:null,EmsAgentHost:()=>null};
 const run=compile('export function run()'+referenceBlock.getText(appSource),deps);const html=renderToStaticMarkup(run());return {html,writes,mounted,workspace,register}}
test('App renders every authorized management route through the real permission gate',()=>{for(const page of ['company','saas-account','saas-service','organization','roles']){const result=renderApp(page);assert.equal(result.mounted[0][0],'management');assert.equal(result.mounted[0][1].page,page)}const denied=renderApp('roles',{...enterprise,permissions:[]});assert.match(denied.html,/无访问权限/);assert.deepEqual(denied.mounted,[]);assert.deepEqual(renderApp('logs').mounted,[]);});
test('App maps all four authenticated personal routes and forwards the settings leave registrar',()=>{for(const category of ['personal','notifications','display','security']){const result=renderApp('settings-'+category,{...enterprise,permissions:[],menus:[]});assert.equal(result.mounted[0][0],'settings');assert.equal(result.mounted[0][1].initialCategory,category);assert.equal(result.mounted[0][1].registerLeaveGuard,result.register)}});
test('App refuses unknown destinations before consulting the leave guard',async()=>{const result=renderApp('company');assert.equal(await result.workspace.onNavigate('settings-unknown'),false);assert.deepEqual(result.writes,[])});
test('cancelled leave prevents all App route and station-detail mutations',async()=>{const result=renderApp('settings-personal',enterprise,false);assert.equal(await result.workspace.onNavigate('company'),false);assert.deepEqual(result.writes,[['leave']])});
test('accepted navigation changes the page only after leave and clears stale station detail',async()=>{const result=renderApp('company');assert.equal(await result.workspace.onNavigate('settings-security'),true);assert.deepEqual(result.writes,[['leave'],['page','settings-security'],['nav','总览'],['view','stations'],['detail',null]])});
test('App dispatches personal routes to settings guard and preserves existing module guards',async()=>{const node=findNode(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='requestActiveEditorLeave');for(const [page,expected]of [['settings-personal','settings'],['settings-security','settings'],['settings-display','settings'],['settings-notifications','settings'],['tags','module'],['tariffs','module'],['report-common','module'],['alarm-rules','module'],['devices','devices'],['dashboard','overview'],['sites','assets']]){const calls=[];const ref=name=>({current:async()=>{calls.push(name);return false}});const deps={DEMO_MODE:false,referencePage:page,activeDetailId:null,settingsLeaveGuard:ref('settings'),referenceModuleLeaveGuard:ref('module'),devicesLeaveGuard:ref('devices'),overviewLeaveGuard:ref('overview'),assetsLeaveGuard:ref('assets')};const run=compile('export const run='+node.getText(appSource),deps);assert.equal(await run(),false);assert.deepEqual(calls,[expected])}});
test('enterprise log access is not invented from a nonexistent company.audit menu',()=>{const user={...enterprise,permissions:['audit.read'],menus:[{path:'company.audit'},{path:'platform.audit'}]};assert.deepEqual(management.managementRoutes('logs',user),[]);assert.deepEqual(renderApp('logs',user).mounted,[])});
function text(value){if(value==null||typeof value==='boolean')return '';if(Array.isArray(value))return value.map(text).join('');return typeof value==='object'?text(value.props?.children):String(value)}
function renderWorkspace({user=enterprise,utility='',allow=true}={}){const buttons=[],calls=[],setters=[],language=[];let hook=0;const state=['system',['saas'],true,false,utility];const dependencies={react:{...React,useState:()=>{const index=hook++;return [state[index],value=>setters.push([index,value])]},useEffect:()=>{}},'react/jsx-runtime':{...runtime,jsx:(type,props,key)=>{if(type==='button')buttons.push(props);return runtime.jsx(type,props,key)},jsxs:(type,props,key)=>{if(type==='button')buttons.push(props);return runtime.jsxs(type,props,key)}},'./BusinessGroupScope':{BusinessGroupProvider:({children})=>children,BusinessGroupPicker:()=>null},'./AccountLanguageMenu':{default:props=>{language.push(props);return React.createElement('output',null,'Language')}},'./SettingsDialog':{default:({children})=>React.createElement('aside',null,children)}};
 const file=path.join(src,'components/ReferenceWorkspace.tsx'),code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,exports={};new Function('exports','require',code)(exports,name=>name.endsWith('.css')?{}:name in dependencies?dependencies[name]:name==='@/navigation/referenceNavigation'?navigation:name==='@/navigation/referenceNavigation.ts'?navigation:require(name));
 const html=renderToStaticMarkup(React.createElement(exports.default,{user,page:'company',onNavigate:async id=>{calls.push(id);return allow},onLogout:()=>calls.push('logout'),children:'content'}));return {html,buttons,calls,setters,language}}
test('ReferenceWorkspace retains disabled management entries for missing exact permissions',()=>{const result=renderWorkspace({user:{...enterprise,permissions:['company.profile.read'],menus:[{path:'company.profile'}]}});const button=label=>result.buttons.find(b=>text(b.children)===label);assert.equal(button('企业信息管理').disabled,false);assert.equal(button('账户中心').disabled,false);for(const label of ['内部组织管理','角色管理','平台日志','场站服务管理'])assert.equal(button(label).disabled,true,label)});
test('account and notification shortcuts use guarded navigation and cancelled leave preserves section',async()=>{const result=renderWorkspace({allow:false});result.buttons.find(b=>b['aria-label']==='通知').onClick();result.buttons.find(b=>text(b.children)==='个人中心').onClick();result.buttons.find(b=>text(b.children)==='语言与显示').onClick();await Promise.resolve();await Promise.resolve();assert.deepEqual(result.calls,['messages','settings-personal','settings-display']);assert.equal(result.setters.some(([index])=>index===0),false)});
test('language dialog passes the authenticated account identity to the existing language component',()=>{const result=renderWorkspace({utility:'语言'});assert.equal(result.language.length,1);assert.equal(result.language[0].userId,enterprise.id);assert.equal(typeof result.language[0].onClose,'function')});
test('opening language over a settings draft preserves the mounted page and does not navigate',()=>{const result=renderWorkspace();result.buttons.find(button=>button['aria-label']==='语言').onClick();assert.deepEqual(result.calls,[]);assert.deepEqual(result.setters,[[4,'语言']]);assert.match(result.html,/content/)});
test('the real language component saves only language and leaves pending password and display drafts untouched',async()=>{
 const draft={currentPassword:'unsaved current',newPassword:'unsaved new',confirmation:'unsaved new',timezone:'draft-zone'},original=JSON.stringify(draft),writes=[],buttons=[];let current={language:'简体中文',timezone:'Europe/Berlin'},release,closed=0;
 const gate=new Promise(done=>release=done);
 const helper=load(path.join(src,'preferences/language.ts'),{'@/api/client':{DEMO_MODE:false,send:async(...args)=>{writes.push(args);await gate}},'./store':{getPreferences:()=>current,applyPreferences:value=>current=value}});
 const dependencies={'react':{...React,useState:initial=>[initial,()=>{}],useRef:initial=>({current:initial})},'react/jsx-runtime':{...runtime,jsx:(type,props,key)=>{if(type==='button')buttons.push(props);return runtime.jsx(type,props,key)},jsxs:(type,props,key)=>{if(type==='button')buttons.push(props);return runtime.jsxs(type,props,key)}},'@/preferences/PreferencesProvider':{useDisplayPreferences:()=>({language:'简体中文'})},'@/preferences/language':helper,'./ui/Workspace':{Button:props=>React.createElement('button',props)}};
 const exports=load(path.join(src,'components/AccountLanguageMenu.tsx'),dependencies);
 renderToStaticMarkup(React.createElement(exports.default,{userId:enterprise.id,onClose:()=>closed++}));const english=buttons.find(button=>button.lang==='en');english.onClick();english.onClick();assert.deepEqual(writes,[['/settings','PUT',{key:'language',value:'English'}]]);assert.equal(current.language,'简体中文');assert.equal(JSON.stringify(draft),original);assert.equal(closed,0);
 release();await new Promise(done=>setImmediate(done));assert.deepEqual(current,{language:'English',timezone:'Europe/Berlin'});assert.equal(JSON.stringify(draft),original);assert.equal(closed,1);assert.equal(writes.some(([url])=>url.includes('password')||url.includes('profile')),false);
});

test('inherited object keys never become personal routes or invoke navigation guards',async()=>{
 for(const id of ['constructor','toString','__proto__','hasOwnProperty']){
  const source=renderApp('company');assert.equal(await source.workspace.onNavigate(id),false,id);assert.deepEqual(source.writes,[],id);
  const target=renderApp(id);assert.deepEqual(target.mounted,[],id);assert.match(target.html,/无访问权限/);
 }
});
test('language saving renders the actual shared LoadingState rather than a test substitute',()=>{
 let state=0;
 const Component=load(path.join(src,'components/AccountLanguageMenu.tsx'),{
  react:{...React,useState:()=>[++state===1?true:'',()=>{}],useRef:value=>({current:value})},
  '@/preferences/PreferencesProvider':{useDisplayPreferences:()=>({language:'English'})},
  '@/preferences/language':{saveInterfaceLanguage:()=>assert.fail('render must never save')},
  './ui/Workspace':{Button:props=>React.createElement('button',props)}
 }).default;
 const html=renderToStaticMarkup(React.createElement(Component,{userId:enterprise.id}));
 assert.match(html,/loading-state-spinner/);assert.match(html,/role="status"/);assert.match(html,/aria-busy="true"/);assert.match(html,/Saving language…/);
});

test('notification destination mounts the standalone message list for authenticated accounts',async()=>{const result=renderApp('messages',{...enterprise,permissions:[],menus:[]});assert.equal(result.mounted[0]?.[0],'messages');assert.equal(await result.workspace.onNavigate('messages'),true);assert.deepEqual(result.writes[1],['page','messages']);assert.equal(typeof result.mounted[0][1].onNotificationSettings,'function')});

test('message list states disconnected delivery truth without fabricated alarms or read actions',()=>{
 const actions=[];
 const Messages=load(path.join(src,'components/MessagesPage.tsx'),{'./ui/Workspace':{Button:props=>React.createElement('button',props)}}).default;
 const html=renderToStaticMarkup(React.createElement(Messages,{onNotificationSettings:()=>actions.push('settings')}));
 assert.match(html,/aria-label="消息列表"/);assert.match(html,/暂无可读取的站内消息/);assert.match(html,/站内消息投递服务尚未接通/);
 for(const field of ['消息主题','消息类型','时间','状态'])assert.match(html,new RegExp('<th>'+field+'</th>'));
 assert.doesNotMatch(html,/标为已读|全部已读|模拟消息|实时报警/);assert.deepEqual(actions,[]);
});
