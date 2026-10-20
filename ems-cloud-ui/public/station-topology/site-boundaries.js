// Site boundaries refer to the same nodes used by the electrical editor.
let boundaryDraft=null, applyingBoundary=null;
function inferBoundaries(nodes=model.nodes,edges=model.edges){
  const byId=id=>nodes.find(n=>n.id===id);
  return nodes.filter(n=>n.type==='grid').map((g,i)=>{
    const queue=[[g.id]],seen=new Set();let path=[];
    while(queue.length){const candidate=queue.shift(),id=candidate.at(-1);if(seen.has(id))continue;seen.add(id);if(byId(id)?.type==='bus'){path=candidate;break;}for(const e of edges.filter(e=>e.from===id||e.to===id)){const next=e.from===id?e.to:e.from;if(!seen.has(next))queue.push([...candidate,next]);}}
    const member=type=>path.find(id=>byId(id)?.type===type)||'';
    return {id:'PCC-'+String(i+1).padStart(2,'0'),name:g.name||'并网点 '+(i+1),voltage:g.voltage||'400 V',gridId:g.id,meterId:member('meter'),busId:member('bus'),transformerId:member('transformer'),switchId:member('breaker'),path};
  });
}
function boundaryState(){if(boundaryDraft)return boundaryDraft;const s=siteDraft||model.site;return {mode:s.mode||'并网运行',points:clone(s.boundaries||inferBoundaries())};}
function editBoundaries(){if(!boundaryDraft)boundaryDraft=clone(boundaryState());siteDraft||={...model.site};dirty=true;$('#save-state').textContent='边界设置尚未确认';return boundaryDraft;}
function boundaryNodes(){return pendingTemplate?createPreset(pendingTemplate).nodes:model.nodes;}
function boundarySelect(p,key,type,label){const list=boundaryNodes().filter(n=>n.type===type);return `<label class="field"><span>${label}</span><select data-boundary-id="${p.id}" data-boundary-key="${key}"><option value="">新建${types[type].label}</option>${list.map(n=>`<option value="${esc(n.id)}" ${p[key]===n.id?'selected':''}>${esc(n.id+' · '+n.name)}</option>`).join('')}</select></label>`;}
function boundaryEditor(){const b=boundaryState(),offline=b.mode==='离网运行';return `<section class="form-section boundary-section"><div class="form-caption"><h3>电气边界</h3><p>运行方式与并网点</p></div><div class="form-content"><div class="form-pair"><label class="field"><span>运行方式</span><select data-boundary-mode>${['并网运行','离网运行','并离网切换'].map(v=>`<option ${b.mode===v?'selected':''}>${v}</option>`).join('')}</select></label><div class="field"><span>并网结构</span><p class="plain-value">${offline?'无并网点':b.points.length===1?'单并网点':b.points.length>1?'多并网点 · '+b.points.length+' 个':'尚未添加并网点'}</p></div></div>${offline?'<p class="boundary-empty">离网运行不接入公共电网。原有并网点设置会保留，切回并网模式时可恢复。</p>':`<div class="boundary-toolbar"><b>并网点</b><button class="text-button" data-boundary-add>＋ 新增并网点</button></div><div class="boundary-list">${b.points.map(p=>`<section class="boundary-row"><header><b>${esc(p.id)}</b><button class="text-button danger" data-boundary-remove="${p.id}">删除</button></header><div class="boundary-fields"><label class="field"><span>并网点名称</span><input data-boundary-id="${p.id}" data-boundary-key="name" value="${esc(p.name)}"></label><label class="field"><span>接入电压</span><select data-boundary-id="${p.id}" data-boundary-key="voltage">${['400 V','10 kV'].map(v=>`<option ${p.voltage===v?'selected':''}>${v}</option>`).join('')}</select></label>${boundarySelect(p,'gridId','grid','公共电网节点')}${boundarySelect(p,'meterId','meter','边界电表')}${boundarySelect(p,'busId','bus','接入母线')}${b.mode==='并离网切换'?boundarySelect(p,'switchId','breaker','并离网切换开关'):''}</div></section>`).join('')||'<p class="boundary-empty">新增并网点后，保存时会同步创建对应电气节点。</p>'}</div><p class="field-help">选择已有节点或新建节点；接入电压与母线不同时自动补充变压器。新并网点默认使用独立母线。</p>${b.mode==='并离网切换'?'<p class="field-help">此处只定义切换开关的拓扑位置，联锁条件及切换策略由应用层配置。</p>':''}`}</div></section>`;}
const boundarySiteRender=renderSiteStage;
renderSiteStage=function(){boundarySiteRender();const sections=[...$('#stage-page').querySelectorAll('.form-section')];for(const section of sections){const title=section.querySelector('h3')?.textContent;if(title==='电气边界')section.outerHTML=boundaryEditor();if(title==='管理范围')section.remove();}};
$('#stage-page').addEventListener('input',ev=>{const id=ev.target.dataset.boundaryId,key=ev.target.dataset.boundaryKey;if(id&&key){const p=editBoundaries().points.find(p=>p.id===id);if(p)p[key]=ev.target.value;}});
$('#stage-page').addEventListener('change',ev=>{
  if(ev.target.hasAttribute('data-boundary-mode')){editBoundaries().mode=ev.target.value;renderSiteStage();}
  if(ev.target.dataset.boundaryKey){const p=editBoundaries().points.find(p=>p.id===ev.target.dataset.boundaryId);if(p)p[ev.target.dataset.boundaryKey]=ev.target.value;}
  if(ev.target.name==='site-template'){const preset=pendingTemplate?createPreset(pendingTemplate):model;boundaryDraft={mode:boundaryState().mode,points:inferBoundaries(preset.nodes,preset.edges)};renderSiteStage();}
});
$('#stage-page').addEventListener('click',ev=>{const el=ev.target.closest('[data-boundary-add],[data-boundary-remove]');if(!el)return;const b=editBoundaries();if(el.hasAttribute('data-boundary-add')){let i=1;while(b.points.some(p=>p.id==='PCC-'+String(i).padStart(2,'0')))i++;b.points.push({id:'PCC-'+String(i).padStart(2,'0'),name:i+'# 并网点',voltage:'400 V',gridId:'',meterId:'',busId:'',switchId:'',transformerId:'',path:[]});}else b.points=b.points.filter(p=>p.id!==el.dataset.boundaryRemove);renderSiteStage();});
function applyBoundaries(b){
  const previous=model.site.boundaries||inferBoundaries(),offline=b.mode==='离网运行';
  function create(type,id,name,voltage,x,y){let n=id&&node(id);if(n)return n;const chosen=id&&!node(id)?id:newId(type);n={id:chosen,type,name,voltage,x,y};if(type==='bus'&&x>=1100)n.busWidth=260;if(type==='meter')Object.assign(n,{role:'并网点计量',polarity:'',scope:''});if(type==='transformer')Object.assign(n,{rating:'1250',unit:'kVA'});model.nodes.push(n);return n;}
  const points=clone(b.points);
  if(offline){const grids=model.nodes.filter(n=>n.type==='grid').map(n=>n.id);model.nodes=model.nodes.filter(n=>!grids.includes(n.id));model.edges=model.edges.filter(e=>!grids.includes(e.from)&&!grids.includes(e.to));for(const n of model.nodes)if(n.type==='meter'&&n.role==='并网点计量')n.role='支路计量';}
  else{
    for(const [i,p] of points.entries()){
      const x=node(p.gridId)?.x??(i===0?442:1100+(i-1)*360);
      const grid=create('grid',p.gridId,p.name,p.voltage,x,35),meter=create('meter',p.meterId,p.name+'计量',p.voltage,x,145),bus=create('bus',p.busId,p.name+'母线','400 V',x,394);
      Object.assign(grid,{name:p.name,voltage:p.voltage});Object.assign(meter,{voltage:p.voltage,role:'并网点计量',scope:p.id});p.gridId=grid.id;p.meterId=meter.id;p.busId=bus.id;
      const chain=[{n:grid,from:'AC',to:'AC'},{n:meter,from:'OUT',to:'IN'}];
      if(b.mode==='并离网切换'||p.switchId){const sw=create('breaker',p.switchId,p.name+'切换开关',p.voltage,x,225);sw.voltage=p.voltage;p.switchId=sw.id;chain.push({n:sw,from:'OUT',to:'IN'});}
      if(p.voltage!==bus.voltage){const tx=create('transformer',p.transformerId,p.name+'变压器',p.voltage+' / '+bus.voltage,x,300);tx.voltage=p.voltage+' / '+bus.voltage;p.transformerId=tx.id;chain.push({n:tx,from:'LV',to:'HV'});}
      chain.push({n:bus,from:'AC',to:'AC'});
      const paths=[p.path||[],previous.find(old=>old.id===p.id)?.path||[],chain.map(c=>c.n.id)];
      model.edges=model.edges.filter(e=>!paths.some(path=>path.some((id,j)=>j<path.length-1&&(e.from===id&&e.to===path[j+1]||e.to===id&&e.from===path[j+1]))));
      for(let j=0;j<chain.length-1;j++){const a=chain[j],z=chain[j+1];model.edges.push({id:'BOUNDARY-'+p.id+'-'+j,from:a.n.id,fromPort:a.from,to:z.n.id,toPort:z.to,kind:'ac'});}
      p.path=chain.map(c=>c.n.id);
    }
    const removed=previous.filter(old=>!points.some(p=>p.gridId===old.gridId)).map(p=>p.gridId);model.nodes=model.nodes.filter(n=>!removed.includes(n.id));model.edges=model.edges.filter(e=>!removed.includes(e.from)&&!removed.includes(e.to));
    for(const n of model.nodes)if(n.type==='meter'&&n.role==='并网点计量'&&!points.some(p=>p.meterId===n.id))n.role='支路计量';
  }
  model.site.boundaries=points;model.site.mode=b.mode;model.site.grid=offline?'无并网点':points.length===1?'单并网点':'多并网点 · '+points.length+' 个';
}
const boundaryTransaction=transaction;
transaction=function(fn){boundaryTransaction(()=>{fn();if(applyingBoundary){const draft=applyingBoundary;applyingBoundary=null;applyBoundaries(draft);}});};
const boundarySaveBase=saveBoundary;
saveBoundary=function(){
  const b=boundaryState(),nodes=boundaryNodes();if(b.mode!=='离网运行'){
    if(!b.points.length){toast('请新增至少一个并网点，或选择离网运行');return false;}
    if(b.points.some(p=>!p.name.trim())){toast('请填写并网点名称');return false;}
    for(const key of ['gridId','meterId','busId','switchId']){const chosen=b.points.map(p=>p[key]).filter(Boolean);if(new Set(chosen).size!==chosen.length){toast('不同并网点请使用独立的电网、电表、母线和切换开关');return false;}}
    for(const p of b.points)for(const [key,type] of [['gridId','grid'],['meterId','meter'],['busId','bus'],['switchId','breaker']])if(p[key]&&!nodes.some(n=>n.id===p[key]&&n.type===type)&&!model.site.boundaries?.some(old=>old[key]===p[key])){toast('关联节点已不存在，请重新选择');return false;}
  }
  applyingBoundary=clone(b);const ok=boundarySaveBase();applyingBoundary=null;if(ok)boundaryDraft=null;return ok;
};
const boundaryChecks=checks;
checks=function(){let issues=boundaryChecks();if(model.site.mode==='离网运行')issues=issues.filter(i=>!i.msg.includes('缺少并网边界')&&!i.msg.includes('缺少并网点计量角色'));else for(const p of model.site.boundaries||[]){if(!node(p.gridId)||!node(p.meterId)||!node(p.busId))issues.push({id:p.gridId,msg:p.id+' 边界关联节点缺失'});if(model.site.mode==='并离网切换'&&!node(p.switchId))issues.push({id:p.gridId,msg:p.id+' 缺少切换开关'});}return issues;};
const boundaryStatus=renderStatus;renderStatus=function(){boundaryStatus();$('#site-summary').textContent=[model.site.scene,model.site.grid,model.site.mode].join(' · ');};
const boundaryDetails=nodeDetails;nodeDetails=function(n){if(n.type==='meter'){const p=(model.site.boundaries||[]).find(p=>p.meterId===n.id);const role=n.role==='并网点计量'?'并网计量':n.role||'支路计量';return role+(p?' · '+p.id:'');}return boundaryDetails(n);};
const boundaryPorts=ports;ports=function(n){const list=boundaryPorts(n);if(n.type==='breaker')return list.map(p=>({...p,voltage:n.voltage||p.voltage}));return list;};
const boundaryCanvas=renderCanvas;renderCanvas=function(){boundaryCanvas();if(view==='electrical'){const width=Math.max(1040,...model.nodes.filter(n=>n.type!=='ems').map(n=>n.x+(n.type==='bus'?(n.busWidth||850):deviceSize(n).width)+40)),height=Math.max(790,...model.nodes.map(n=>n.y+deviceSize(n).height+24));$('#canvas').setAttribute('viewBox',`0 0 ${width} ${height}`);$('#canvas > rect')?.setAttribute('width',width);}};
render();
