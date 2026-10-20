const test=require('node:test'),assert=require('node:assert/strict');
const {harness:baseHarness,all,field,button}=require('./helpers/report-workspace-harness.cjs');
async function harness(){const h=await baseHarness();all(h.render()).find(n=>n.props?.className==='mr-primary mr-create').props.onClick();h.render();return h}
let prior;test.beforeEach(()=>prior=global.window);test.afterEach(()=>global.window=prior);
test('every manual request input participates in the navigation guard, including template switches',async()=>{
 const changes=[tree=>field(tree,'选择报表模板').props.onChange({target:{value:'monthly'}}),tree=>all(tree).find(n=>n.props?.['aria-label']==='开始周期').props.onChange({target:{value:'2026-10-01'}}),tree=>all(tree).find(n=>n.props?.['aria-label']==='结束周期').props.onChange({target:{value:'2026-10-02'}}),tree=>field(tree,'选择导出文件语言').props.onChange({target:{value:'English'}}),tree=>field(tree,'报表文件名称').props.onChange({target:{value:'draft.xlsx'}}),tree=>all(tree).find(n=>n.props?.stations&&n.props?.value?.scope).props.onChange({scope:'specific',stationIds:[]}),tree=>all(tree).find(n=>n.props?.stations&&n.props?.value?.scope).props.onChange({scope:'all',stationIds:[1]})];
 for(const change of changes){const h=await harness();assert.equal(await h.guard(),true);change(h.render());h.render();assert.equal(await h.rejectLeave(),false);assert.equal(await h.rejectLeave(),false)}
});
test('declining cancellation preserves manual edits; confirmed cancellation starts a clean new draft',async()=>{
 const h=await harness();field(h.render(),'报表文件名称').props.onChange({target:{value:'keep me'}});const drawer=()=>all(h.render()).find(n=>n.props?.title==='手工创建报表');
 let pending=drawer().props.onClose();button(h.render(),'继续编辑配置').props.onClick();await pending;assert.equal(field(h.render(),'报表文件名称').props.value,'keep me');
 pending=drawer().props.onClose();button(h.render(),'放弃配置修改').props.onClick();await pending;assert.equal(drawer(),undefined);
 all(h.render()).find(n=>n.props?.className==='mr-primary mr-create').props.onClick();h.render();assert.equal(await h.guard(),true);assert.notEqual(field(h.render(),'报表文件名称').props.value,'keep me');
});
