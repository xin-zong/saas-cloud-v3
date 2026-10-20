// Display numbers remain stable when a physical EMS port is renamed.
const portInspectorBase=renderInspector;
renderInspector=function(){
  tab='properties';portInspectorBase();const n=node(selected),content=$('#inspector .inspector-content');if(!n||!content)return;
  if(view==='electrical'){
    const control=$('#inspector .role-box');if(control&&control.querySelector('[data-field="controllable"]')){control.previousElementSibling?.remove();control.remove();}
    const tabs=$('#inspector .inspector-tabs');if(tabs)tabs.outerHTML='<div class="section-label">设计属性</div>';
    const old=$('#inspector .binding-card');if(old){const heading=old.previousElementSibling;if(heading?.classList.contains('section-label'))heading.remove();old.remove();}
  }
  if(view==='communication'){
    if(['pcs','pv','charger'].includes(n.type))content.insertAdjacentHTML('beforeend',`<section class="communication-control"><div class="section-label">EMS 控制关系</div><label><input type="checkbox" data-field="controllable" ${n.controllable?'checked':''}> 接受 EMS 控制指令</label>${n.controllable?field('所属控制范围','scope',n.scope||'',[['','请选择控制范围'],'T-01 储能控制组','全站协调控制组'],true):'<p class="comm-help">仅监测，不下发控制指令。</p>'}</section>`);
    if(n.type==='ems'&&commPanel==='ports'){
      const list=channels(n),ch=list.find(p=>p.id===selectedChannel);if(ch){const num='P'+String(list.indexOf(ch)+1).padStart(2,'0');content.insertAdjacentHTML('afterbegin',`<section class="port-mapping"><div class="section-label">图中端口 ${num} · 实际接口映射</div><label class="field"><span>实际物理端口名称</span><input data-port-actual value="${esc(ch.id)}"></label><p class="comm-help">${num} 是图中序号，当前对应 ${esc(ch.id)}。修改会同步更新所有使用此端口的连线与设备引用。</p></section>`);}
    }else if(n.type!=='ems'){
      const field=$('[data-comm="devicePort"]');if(field)field.closest('.field').querySelector('span').textContent='端口 01 · 设备采集接口';
      const parent=$('[data-comm="port"]');if(parent){const e=node(communicationConfig(n).parent);if(e)parent.closest('.field').querySelector('span').textContent='EMS 端口序号 / 实际端口';for(const opt of parent.options)if(opt.value)opt.textContent='P'+String((e?channels(e):[]).findIndex(ch=>ch.id===opt.value)+1).padStart(2,'0')+' · '+opt.value;}
      for(const key of ['pcsPort','bmsPort']){const f=$(`[data-bms="${key}"]`);if(f)f.closest('.field').querySelector('span').textContent=(key==='pcsPort'?'PCS':'BMS')+' 端口 02 · 本地通信接口';}
    }
  }
  if(physical(n))content.insertAdjacentHTML('beforeend',`<section class="device-binding-bottom"><div class="section-label">设备绑定</div>${n.bound?`<div class="definition-rows"><div>已绑定 · ${esc(n.bound)}</div><div>设计节点：${esc(n.id)}</div></div>`:''}<button data-action="binding">${n.bound?'查看设备绑定':'发现与绑定设备 →'}</button>${n.bound?'<button class="text-button danger" data-action="unbind">解除绑定</button>':''}</section>`);
};
function openEMSPort(el){const ems=model.nodes.find(n=>n.type==='ems');if(!ems)return;selected=ems.id;selectedChannel=el.dataset.emsChannel;commPanel='ports';refreshCommunication();}
document.addEventListener('click',ev=>{const el=ev.target.closest('[data-ems-channel]');if(el)openEMSPort(el);});
$('#canvas').addEventListener('keydown',ev=>{const el=ev.target.closest('[data-ems-channel]');if(el&&['Enter',' '].includes(ev.key)){ev.preventDefault();openEMSPort(el);}});
$('#inspector').addEventListener('change',ev=>{if(!ev.target.hasAttribute('data-port-actual'))return;const n=node(selected),value=ev.target.value.trim();if(!n||n.type!=='ems')return;const old=selectedChannel;
  if(!/^[A-Za-z0-9_-]{1,24}$/.test(value)||channels(n).some(p=>p.id===value&&p.id!==old)){toast('端口名需为唯一的字母、数字、连字符或下划线，最多 24 字符');renderInspector();return;}
  transaction(()=>{materializeCommunication();n.channels.find(p=>p.id===old).id=value;for(const d of communicationNodes())if(d.communication?.parent===n.id&&d.communication.port===old)d.communication.port=value;selectedChannel=value;});
});
render();

const viewPaletteBase=renderPalette;
renderPalette=function(){viewPaletteBase();if(view==='electrical'){
  document.querySelectorAll('[data-add="ems"]').forEach(el=>{const grid=el.parentElement;el.remove();if(!grid.children.length){grid.previousElementSibling?.remove();grid.remove();}});

}};
const controlViewBase=setView;
setView=function(v){controlViewBase(v);if(v==='electrical'&&node(selected)?.type==='ems'){selected=model.nodes.find(n=>n.type==='pcs')?.id||null;refreshCommunication();}renderPalette();};
document.addEventListener('click',ev=>{const issue=ev.target.closest('[data-issue]');if(issue&&issue.textContent.includes('控制范围'))setView('communication');});
renderPalette();
