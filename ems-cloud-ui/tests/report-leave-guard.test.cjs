const test=require('node:test'),assert=require('node:assert/strict');
const {harness,all,button,field,tick}=require('./helpers/report-workspace-harness.cjs');
let prior;test.beforeEach(()=>prior=global.window);test.afterEach(()=>global.window=prior);
const drawer=tree=>all(tree).find(n=>['手工创建报表','自定义报表模板','创建自动化任务'].includes(n.props?.title));
for(const kind of ['manual','template','task'])test(`${kind} cancel uses the existing confirmation inside the active drawer and preserves or discards the draft`,async()=>{
 const h=await harness();
 if(kind==='template'){button(h.render(),'报表模板').props.onClick();all(h.render()).find(n=>n.props?.className==='mr-new-template').props.onClick()}
 else{if(kind==='task')button(h.render(),'自动化任务').props.onClick();all(h.render()).find(n=>n.props?.className==='mr-primary mr-create').props.onClick()}
 const label=kind==='manual'?'报表文件名称':kind==='template'?'模板名称':'任务名称';field(h.render(),label).props.onChange({target:{value:'keep draft'}});
 let pending=drawer(h.render()).props.onClose();let tree=h.render();assert.ok(button(drawer(tree),'继续编辑配置'),'confirmation must be inside the native modal drawer');
 button(tree,'继续编辑配置').props.onClick();await pending;assert.equal(field(h.render(),label).props.value,'keep draft');
 pending=drawer(h.render()).props.onClose();button(h.render(),'放弃配置修改').props.onClick();await pending;assert.equal(drawer(h.render()),undefined);assert.equal(await h.guard(),true);
});
test('module navigation awaits confirmation and beforeunload remains protected',async()=>{
 const h=await harness();all(h.render()).find(n=>n.props?.className==='mr-primary mr-create').props.onClick();field(h.render(),'报表文件名称').props.onChange({target:{value:'draft'}});h.render();
 let prevented=false;const event={preventDefault:()=>prevented=true};h.listeners.get('beforeunload')(event);assert.equal(prevented,true);assert.equal(event.returnValue,'');
 assert.equal(await h.rejectLeave(),false);assert.ok(drawer(h.render()));assert.equal(await h.discardLeave(),true);assert.equal(drawer(h.render()),undefined);assert.equal(h.listeners.has('beforeunload'),false);
});
test('busy generation prevents discard until it finishes, without losing the draft',async()=>{
 const h=await harness();all(h.render()).find(n=>n.props?.className==='mr-primary mr-create').props.onClick();field(h.render(),'报表文件名称').props.onChange({target:{value:'busy draft'}});h.setBusy(true);h.render();
 const pending=h.guard();let settled=false;pending.then(()=>settled=true);assert.equal(button(h.render(),'放弃配置修改').props.disabled,true);await tick();assert.equal(settled,false);
 button(h.render(),'继续编辑配置').props.onClick();assert.equal(await pending,false);assert.equal(field(h.render(),'报表文件名称').props.value,'busy draft');h.setBusy(false);h.render();assert.equal(await h.discardLeave(),true);
});
test('accepted manual and production submissions clear dirty state and allow navigation',async()=>{
 for(const production of [false,true]){const h=await harness(production);h.setResult({status:'completed'});
  if(production){field(h.render(),'选择报表对象类型').props.onChange({target:{value:'station'}});field(h.render(),'选择报表对象').props.onChange({target:{value:'1'}});await button(h.render(),'预览').props.onClick()}
  else{all(h.render()).find(n=>n.props?.className==='mr-primary mr-create').props.onClick();field(h.render(),'报表文件名称').props.onChange({target:{value:'accepted'}});button(h.render(),'导出').props.onClick();await tick()}
  h.render();assert.equal(await h.guard(),true);assert.equal(all(h.render()).some(n=>n.props?.title==='放弃配置草稿'),false);
 }
});
test('configuration save prevents discard and its successful completion clears the editor',async()=>{
 const h=await harness();button(h.render(),'报表模板').props.onClick();all(h.render()).find(n=>n.props?.className==='mr-new-template').props.onClick();field(h.render(),'模板名称').props.onChange({target:{value:'saved template'}});
 button(h.render(),'保存').props.onClick();h.render();const pending=h.guard();assert.equal(button(h.render(),'放弃配置修改').props.disabled,true);
 button(h.render(),'继续编辑配置').props.onClick();assert.equal(await pending,false);await h.finishSave();h.render();assert.equal(drawer(h.render()),undefined);assert.equal(await h.guard(),true);
});
test('production navigation rejection preserves all inputs and confirmation resets its dirty baseline',async()=>{
 const h=await harness(true);field(h.render(),'选择报表对象类型').props.onChange({target:{value:'station'}});field(h.render(),'选择报表对象').props.onChange({target:{value:'2'}});field(h.render(),'报表文件名称').props.onChange({target:{value:'production draft'}});h.render();
 assert.equal(await h.rejectLeave(),false);assert.equal(field(h.render(),'报表文件名称').props.value,'production draft');assert.equal(await h.discardLeave(),true);h.render();assert.equal(await h.guard(),true);
});
