(()=>{
let currentTab='palette';
const category=n=>n.legacyGeneric?'generic':n.type;
const allowed=n=>view==='communication'?physical(n)&&n.type!=='gateway':!['ems','gateway'].includes(n.type);
function renderDevices(){
 $('#palette').hidden=currentTab!=='palette';$('#device-list-panel').hidden=currentTab!=='devices';
 $('#node-search').placeholder=currentTab==='palette'?'搜索设备或结构':'搜索编号或名称';$('#node-search').setAttribute('aria-label',$('#node-search').placeholder);
 const nodes=model.nodes.filter(allowed),q=$('#node-search').value.trim().toLowerCase(),filter=$('#device-type-filter'),prior=filter.value,keys=[...new Set(nodes.map(category))];
 filter.innerHTML='<option value="">全部类型</option>'+keys.map(k=>'<option value="'+k+'">'+esc(k==='generic'?'设备（类型待识别）':types[k].label)+'</option>').join('');filter.value=keys.includes(prior)?prior:'';
 const shown=nodes.filter(n=>(!filter.value||category(n)===filter.value)&&(n.id+' '+n.name).toLowerCase().includes(q));
 const issues=view==='communication'?communicationIssues():checks();
 $('#device-list').innerHTML=shown.map(n=>{const warning=issues.filter(i=>i.id===n.id);return '<button class="device-list-row '+(n.id===selected?'active':'')+'" data-list-device="'+esc(n.id)+'" aria-pressed="'+(n.id===selected)+'" title="'+esc(n.id+' · '+n.name)+'">'+symbol(n.type)+'<span class="device-list-name"><b>'+esc(n.id)+'</b><span>'+esc(n.name)+'</span></span><span class="device-list-state">'+(physical(n)?'<i class="binding-dot '+(n.bound?'bound':'')+'" role="img" aria-label="'+(n.bound?'已绑定':'待绑定')+'" title="'+(n.bound?'已绑定':'待绑定')+'"></i>':'')+(warning.length?'<span class="device-list-warning" title="'+esc(warning.map(i=>i.msg).join('；'))+'" aria-label="配置待完善">!</span>':'')+'</span></button>';}).join('')||'<div class="empty">'+(nodes.length?'没有匹配的设备':'暂无设备')+'</div>';
}
const previousPalette=renderPalette;renderPalette=function(){previousPalette();renderDevices();};
const previousStatus=renderStatus;renderStatus=function(){previousStatus();renderDevices();};
$('#node-search').addEventListener('input',e=>{e.stopImmediatePropagation();renderPalette();},true);
$('#device-type-filter').addEventListener('change',renderDevices);
$('.library').addEventListener('click',e=>{const tabButton=e.target.closest('[data-library-tab]');if(tabButton){currentTab=tabButton.dataset.libraryTab;$$('[data-library-tab]').forEach(b=>b.classList.toggle('active',b===tabButton));$('#node-search').value='';renderPalette();return;}const item=e.target.closest('[data-list-device]');if(item){activePort=null;select(item.dataset.listDevice);if(typeof focusCanvasDevice==='function')focusCanvasDevice(selected);}});
renderDevices();
})();
