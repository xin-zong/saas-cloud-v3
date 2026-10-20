// Stage pages share the topology model; switching stages does not reset the canvas.
let activeStage='design', siteDraft=null, pendingBindings=new Map(), pendingTemplate=null, templateCategory='全部';
const topologyPresets=[
 {id:'storage1',name:'单支路储能',group:'纯储能',chain:'电网 → 母线 → PCS ↔ 电池',scale:'125 kW / 261 kWh',description:'适合单套储能系统，包含并网计量、变压器、负荷和 1 条储能支路。'},
 {id:'storage2',name:'双支路储能',group:'纯储能',chain:'电网 → 母线 → 2 × 储能支路',scale:'250 kW / 522 kWh',description:'两套 PCS 与电池分别建模，可以独立绑定设备及分配控制范围。'},
 {id:'storage4',name:'多支路储能',group:'纯储能',chain:'电网 → 母线 → 4 × 储能支路',scale:'500 kW / 1,044 kWh',description:'预设四套并联储能支路，适合体验多设备接入与分组控制。'},
 {id:'pv',name:'分布式光伏',group:'光伏',chain:'电网 → 母线 ← 光伏 · 负荷',scale:'光伏 200 kW',description:'包含光伏逆变器和园区负荷，不预置储能设备。'},
 {id:'solar1',name:'光伏 + 单支路储能',group:'光储',chain:'母线 → 光伏 + 1 × 储能 + 负荷',scale:'光伏 200 kW · 储能 125 kW',description:'轻量光储结构，保留并网计量和一条独立储能支路。'},
 {id:'solar',name:'光伏 + 双支路储能',group:'光储',chain:'母线 → 光伏 + 2 × 储能 + 负荷',scale:'光伏 200 kW · 储能 250 kW',description:'当前示例站型，包含双 PCS、双电池与光伏逆变器。'},
 {id:'solar-charge',name:'光储充一体站',group:'光储',chain:'母线 → 光伏 + 储能 + 充电 + 负荷',scale:'新增充电设施 120 kW',description:'在双支路光储结构上增加交流侧充电设施，充电设施默认仅监测。'},
 {id:'blank',name:'自定义空白拓扑',group:'自定义',chain:'从节点库自行添加并建立连接',scale:'不预置设备',description:'只保留站点基本信息，电气结构、设备及连接均由你创建。'}
];
icons.charger='M6 4h16v25H6zM10 8h8v7h-8zM22 10h4v11q0 4 3 4M10 21h8';
types.charger={label:'充电设施',code:'EV',group:'能源设备',ports:[['AC','ac','400 V']]};
function createPreset(id){
  const next=initial();
  if(id==='blank')return{nodes:[],edges:[]};
  if(id.startsWith('storage'))next.nodes=next.nodes.filter(n=>n.type!=='pv');
  if(id==='pv')next.nodes=next.nodes.filter(n=>!['pcs','battery'].includes(n.type));
  if(id==='storage1'||id==='solar1')next.nodes=next.nodes.filter(n=>!['PCS-02','BAT-02'].includes(n.id));
  if(id==='storage4')for(let i=3;i<=4;i++){
    next.nodes.push({...clone(baseNodes.find(n=>n.type==='pcs')),id:'PCS-0'+i,name:i+'# 储能 PCS',scope:''});
    next.nodes.push({...clone(baseNodes.find(n=>n.type==='battery')),id:'BAT-0'+i,name:i+'# 电池系统'});
    next.edges.push({id:'PRESET-AC-'+i,from:'BUS-01',fromPort:'AC',to:'PCS-0'+i,toPort:'AC',kind:'ac'},{id:'PRESET-DC-'+i,from:'PCS-0'+i,fromPort:'DC',to:'BAT-0'+i,toPort:'DC',kind:'dc'});
  }
  if(id==='solar-charge'){
    next.nodes.push({id:'EV-01',type:'charger',name:'园区充电设施',x:790,y:472,rating:'120',unit:'kW',voltage:'400 V',controllable:false});
    next.edges.push({id:'PRESET-EV',from:'BUS-01',fromPort:'AC',to:'EV-01',toPort:'AC',kind:'ac'});
  }
  const leaves=next.nodes.filter(n=>['pcs','pv','load','charger'].includes(n.type));
  leaves.forEach((n,i)=>{n.x=leaves.length===1?442:40+i*(820/(leaves.length-1));n.y=472;const battery=next.nodes.find(b=>b.id==='BAT-'+n.id.split('-')[1]&&n.type==='pcs');if(battery){battery.x=n.x;battery.y=635;}});
  next.edges=next.edges.filter(e=>next.nodes.some(n=>n.id===e.from)&&next.nodes.some(n=>n.id===e.to));
  return next;
}
function templateSelector(){
  const key=pendingTemplate||model.site.templateKey||'solar';const chosen=topologyPresets.find(p=>p.id===key);
  return `<div class="template-search"><select aria-label="筛选拓扑模板" id="template-category">${['全部','纯储能','光伏','光储','自定义'].map(c=>`<option ${c===templateCategory?'selected':''}>${c}</option>`).join('')}</select><span>8 种预设 · 每个站点选择一个起始模板</span></div><div class="table-scroll"><table class="template-selector"><thead><tr><th>起始模板</th><th>连接结构</th><th>参考规模</th></tr></thead><tbody>${topologyPresets.filter(p=>templateCategory==='全部'||p.group===templateCategory).map(p=>`<tr><td><label><input type="radio" name="site-template" value="${p.id}" ${p.id===key?'checked':''}>${p.name}</label></td><td class="template-chain">${p.chain}</td><td class="template-scale">${p.scale}</td></tr>`).join('')}</tbody></table></div><div class="template-description"><strong>当前选择：${chosen.name}</strong>　${chosen.description}</div>${pendingTemplate?'<p class="template-warning">保存时将替换当前节点与连接，并清空已有设备绑定。可在拓扑工作台撤销恢复。</p>':'<p class="field-help" style="margin-top:10px">模板参数为设计起点，创建后可修改节点、参数和连接。未更换模板时保留当前拓扑。</p>'}`;
}
const stageNames={site:'站点边界',design:'搭建逻辑拓扑',binding:'发现与绑定设备',review:'校验与复核'};
function showStage(stage){
  activeStage=stage;
  $('.workbench').hidden=stage!=='design';$('#stage-page').hidden=stage==='design';
  $$('.steps button').forEach(b=>{const on=b.dataset.action===stage;b.classList.toggle('current',on);b.setAttribute('aria-current',on?'step':'false');});
  $$('.rail-top button').forEach(b=>b.classList.toggle('active',b.dataset.action===stage));
  $('.breadcrumbs').innerHTML=`场站 <span>/</span> 一次接线图 <span>/</span> ${stageNames[stage]}`;
  $('.workflow > [data-action="templates"]').hidden=stage!=='design';
  if(stage==='design')return;
  ({site:renderSiteStage,binding:renderBindingStage,review:renderReviewStage})[stage]();
}
function stageFrame(number,title,description,body,footer){
  $('#stage-page').innerHTML=`<div class="stage-body">${body}</div><footer class="stage-footer">${footer}</footer>`;
}
function renderSiteStage(){
  const s=siteDraft||model.site;
  stageFrame('01','站点边界','配置站点运行方式与并网点，边界信息同步到电气拓扑。',`
    <section class="form-section template-section"><div class="form-caption"><h3>拓扑起始模板</h3><p>按场景选择电气骨架<br>创建后仍可自由编辑</p></div><div class="form-content">${templateSelector()}</div></section>
    <section class="form-section"><div class="form-caption"><h3>基本信息</h3><p>用于识别和组织站点</p></div><div class="form-content"><label class="field"><span>站点名称 <em>*</em></span><input id="site-name" data-site="name" value="${esc(s.name)}" maxlength="80"></label><div class="form-pair"><label class="field"><span>站点场景</span><input value="${esc(model.site.scene)}" readonly></label><div class="field"><span>场景来源</span><p class="plain-value">由拓扑模板确定 <button class="text-button" data-action="design">查看拓扑 ↗</button></p></div></div></div></section>
    <section class="form-section"><div class="form-caption"><h3>电气边界</h3><p>明确并网点和运行方式</p></div><div class="form-content"><dl class="definition-rows"><div><dt>并网结构</dt><dd>${esc(s.grid)}<small>当前模板为单并网点</small></dd></div><div><dt>运行方式</dt><dd>${esc(s.mode)}<small>本版尚未配置离网切换逻辑</small></dd></div><div><dt>边界计量</dt><dd>${model.nodes.filter(n=>n.type==='meter'&&n.role==='并网点计量').map(n=>esc(n.id)+' · '+esc(n.name)).join('，')||'待在拓扑中指定'}<small>计量用途在电表属性中配置</small></dd></div></dl></div></section>
    <section class="form-section"><div class="form-caption"><h3>管理范围</h3><p>描述 EMS 的管理边界</p></div><div class="form-content"><label class="field"><span>管理范围 <em>*</em></span><select id="site-scope" data-site="scope">${['全站监测 · 储能可控','全站监测 · 光储可控','仅监测'].map(x=>`<option ${s.scope===x?'selected':''}>${x}</option>`).join('')}</select></label><p class="field-help">具体设备是否可控、属于哪个控制范围，仍在拓扑节点属性中逐一确认。</p></div></section>`,
    `<span class="footer-note">填写内容在切换步骤时保留，保存后写入当前草案。</span><button data-action="savesite">保存边界设置</button><button class="primary" data-action="sitenext">保存并进入拓扑 →</button>`);
}
function renderBindingStage(){
  const ns=model.nodes.filter(physical),bound=ns.filter(n=>n.bound).length;
  stageFrame('03','发现与绑定设备','将现场设备对应到逻辑节点，设备绑定不会改变已经定义的电气连接。',`
    <div class="stage-toolbar"><div class="inline-metrics"><span>设计设备 <b>${ns.length}</b></span><span>已绑定 <b>${bound}</b></span><span>待绑定 <b>${ns.length-bound}</b></span></div><button data-action="discover">↻ ${discovered?'重新模拟发现':'模拟发现设备'}</button></div>
    <p class="stage-note">${discovered?'已载入示例设备，可逐行确认匹配。':'尚未发现设备。可先完成逻辑设计，再在此进行匹配。'} 当前为演示，不扫描真实网络。</p>
    <div class="table-scroll"><table class="stage-table binding-table"><thead><tr><th>设计节点</th><th>设备类型</th><th>设计参数</th><th>实际设备 / SN</th><th>绑定状态</th><th></th></tr></thead><tbody>${ns.map((n,i)=>{const chosen=pendingBindings.has(n.id)?pendingBindings.get(n.id):(n.bound||'');return `<tr><td><b>${esc(n.id)}</b><small>${esc(n.name)}</small></td><td>${types[n.type].label}</td><td class="mono">${n.rating?esc(n.rating+' '+n.unit):'—'}</td><td><select aria-label="${n.id} 实际设备" data-bind="${n.id}" ${discovered||n.bound?'':'disabled'}><option value="">暂不绑定</option><option value="${esc(n.bound||'DEMO-'+types[n.type].code+'-'+String(i+101))}" ${chosen?'selected':''}>${esc(n.bound||'DEMO-'+types[n.type].code+'-'+String(i+101))}</option></select></td><td><span class="row-status ${n.bound?'good':''}">${pendingBindings.has(n.id)&&chosen!==(n.bound||'')?'待确认':n.bound?'已绑定':'待绑定'}</span></td><td><button class="text-button" data-goto-node="${n.id}">定位节点 ↗</button></td></tr>`}).join('')||'<tr><td colspan="6" class="empty">尚无可绑定设备，请先在拓扑中添加能源设备。</td></tr>'}</tbody></table></div>`,
    `<button data-action="design">← 返回拓扑</button><span class="footer-note">${pendingBindings.size?'匹配已修改，确认后写入草案。':'实际接入仍需核对协议、测点和通信状态。'}</span><button data-action="confirmbinding">确认绑定</button><button class="primary" data-action="bindingnext">确认并进入校验 →</button>`);
}
function renderReviewStage(){
  const issues=checks(), ns=model.nodes.filter(physical), bound=ns.filter(n=>n.bound).length;
  const groups=[['电气结构','电气连接与节点完整性',issues.filter(i=>/并网边界|连接到电气|边界关联|切换开关/.test(i.msg))],['设计参数','名称、额定参数与计量角色',issues.filter(i=>/名称|额定|计量角色/.test(i.msg))]];
  stageFrame('04','校验与复核','设计完整性与设备接入分别检查，未完成绑定不阻塞逻辑设计复核。',`
    <div class="stage-toolbar"><div class="inline-metrics"><span>逻辑设计 <b class="${issues.length?'attention':'good'}">${issues.length?issues.length+' 项待完善':'检查通过'}</b></span><span>设备绑定 <b>${bound} / ${ns.length}</b></span><span>现场验证 <b>未完成</b></span></div><button data-action="recheckstage">↻ 重新校验</button></div>
    <h3 class="table-section-title">逻辑设计检查 <span>提交前需全部通过</span></h3><div class="table-scroll"><table class="stage-table"><thead><tr><th>检查项</th><th>检查范围</th><th>结果</th><th>待完善内容</th><th></th></tr></thead><tbody>${groups.map(([name,desc,list])=>`<tr><td><b>${name}</b></td><td>${desc}</td><td><span class="row-status ${list.length?'':'good'}">${list.length?'待完善':'✓ 通过'}</span></td><td>${list.length?list.map(i=>`<div class="review-problem">${esc(i.id||'站点')} · ${esc(i.msg)}</div>`).join(''):'—'}</td><td>${list.length?`<button class="text-button" data-goto-node="${list[0].id||''}">去完善 ↗</button>`:''}</td></tr>`).join('')}</tbody></table></div>
    <h3 class="table-section-title">设备接入检查 <span>独立追踪，不代表设计错误</span></h3><div class="table-scroll"><table class="stage-table"><thead><tr><th>检查项</th><th>结果</th><th>说明</th><th></th></tr></thead><tbody><tr><td><b>实际设备绑定</b></td><td>${bound} / ${ns.length}</td><td>${bound===ns.length&&ns.length?'示例设备已全部匹配':'可在交付阶段继续完成设备匹配'}</td><td><button class="text-button" data-action="binding">查看绑定 ↗</button></td></tr><tr><td><b>现场通信与测点</b></td><td><span class="row-status">待现场验证</span></td><td>演示不验证实际协议、数据点映射及控制能力</td><td>—</td></tr></tbody></table></div>
    <p class="stage-note">${model.submitted?'当前版本已模拟提交设计复核。修改草案后需要重新校验。':issues.length?'请先完善上方设计问题，再提交复核。':'当前逻辑设计可以提交复核；站点接入就绪仍需完成现场验证。'}</p>`,
    `<button data-action="binding">← 返回设备绑定</button><span class="footer-note">模拟复核，不创建真实审批记录。</span><button data-action="design">继续编辑拓扑</button><button class="primary" data-action="submit" ${issues.length||model.submitted?'disabled':''}>${model.submitted?'已模拟提交':'模拟提交设计复核'}</button>`);
}
function saveBoundary(){const s=siteDraft||model.site;if(!s.name.trim()){toast('请填写站点名称');$('#site-name')?.focus();return false;}transaction(()=>{model.site={...model.site,...s,name:s.name.trim()};if(pendingTemplate){const preset=createPreset(pendingTemplate);model.nodes=preset.nodes;model.edges=preset.edges;model.site.templateKey=pendingTemplate;model.site.scene=topologyPresets.find(p=>p.id===pendingTemplate).name;selected=model.nodes.find(n=>n.type==='pcs')?.id||null;pendingBindings.clear();discovered=false;}});siteDraft=null;pendingTemplate=null;toast('站点边界已更新到草案');return true;}
function saveBindings(){transaction(()=>{for(const [id,sn] of pendingBindings){const n=node(id);if(!n)continue;if(sn)n.bound=sn;else delete n.bound;}});pendingBindings.clear();toast('设备绑定已更新到草案');}
Object.assign(actions,{
  templates(){showStage('site');},
  site(){showStage('site');},binding(){showStage('binding');},review(){showStage('review');},design(){showStage('design');setView('electrical');},
  savesite(){if(saveBoundary())renderSiteStage();},sitenext(){if(saveBoundary())actions.design();},
  discover(){discovered=true;renderBindingStage();toast('已发现与设计节点对应的示例设备');},
  confirmbinding(){saveBindings();renderBindingStage();},bindingnext(){saveBindings();showStage('review');},recheckstage(){renderReviewStage();toast('已重新检查当前草案');},
  submit(){if(checks().length){toast('请先完善设计问题');return;}transaction(()=>{model.revision++;});model.submitted=true;actions.save();renderStatus();renderReviewStage();toast('已模拟提交设计复核');}
});
$('#stage-page').addEventListener('input',ev=>{const key=ev.target.dataset.site;if(key){siteDraft={...(siteDraft||model.site),[key]:ev.target.value};dirty=true;$('#save-state').textContent='边界设置尚未确认';}});
$('#stage-page').addEventListener('change',ev=>{if(ev.target.id==='template-category'){templateCategory=ev.target.value;renderSiteStage();return;}if(ev.target.name==='site-template'){pendingTemplate=ev.target.value===(model.site.templateKey||'solar')?null:ev.target.value;dirty=true;$('#save-state').textContent='模板选择尚未确认';renderSiteStage();return;}const id=ev.target.dataset.bind;if(id){pendingBindings.set(id,ev.target.value);dirty=true;$('#save-state').textContent='设备匹配尚未确认';const tr=ev.target.closest('tr');tr.querySelector('.row-status').textContent='待确认';}});
document.addEventListener('click',ev=>{const target=ev.target.closest('[data-goto-node]');if(target){actions.design();if(target.dataset.gotoNode)select(target.dataset.gotoNode);$('#inspector input')?.focus();}});
const saveDraft=actions.save;
actions.save=function(){if((siteDraft||pendingTemplate)&&!saveBoundary())return;if(pendingBindings.size)saveBindings();saveDraft();if(activeStage!=='design')showStage(activeStage);};
render();
showStage('design');

