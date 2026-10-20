// No manufacturer profiles are loaded without registered model metadata.
const deviceCatalog=[];
const profile=(id,type,brand,name,protocols,extra={})=>deviceCatalog.push({id,type,brand,name,protocols,mapping:id+'-POINTS-v1',...extra});
const selectedProfile=n=>deviceCatalog.find(p=>p.id===n.deviceModel&&p.type===n.type);
function catalogFields(n){
  const profiles=deviceCatalog.filter(p=>p.type===n.type);if(!profiles.length)return '';const chosen=selectedProfile(n);
  return `<section class="catalog-fields"><div class="section-label">设备选型 <span class="catalog-badge">型号资料</span></div><label class="field"><span>品牌 / 型号</span><select data-identity="model"><option value="">未指定 · 手动配置</option>${profiles.map(p=>`<option value="${p.id}" ${chosen?.id===p.id?'selected':''}>${esc(p.brand+' · '+p.name)}</option>`).join('')}</select></label>${chosen?`<p class="catalog-match">${chosen.protocols.map(id=>communicationProtocols[id].name).join(' / ')}</p>`:''}</section>`;
}
const catalogBaseInspector=renderInspector;
renderInspector=function(){
  catalogBaseInspector();const n=node(selected);if(!n)return;
  const content=$('#inspector .inspector-content'),title=$('#inspector .object-title');
  if(content&&title&&!(view==='communication'&&controller(n)&&commPanel==='ports'))title.insertAdjacentHTML('afterend',catalogFields(n));
  if(view!=='communication')return;
  const p=selectedProfile(n),c=communicationConfig(n),protocolSelect=$('#inspector [data-comm="protocol"]');
  if(protocolSelect&&p){
    if(c.source!=='manual')protocolSelect.innerHTML=p.protocols.map(id=>`<option value="${id}" ${c.protocol===id?'selected':''}>${communicationProtocols[id].name}</option>`).join('');
    protocolSelect.closest('.field').insertAdjacentHTML('afterend',`<label class="field"><span>协议配置方式</span><select data-identity="mode"><option value="profile" ${c.source!=='manual'?'selected':''}>按型号支持的协议配置</option><option value="manual" ${c.source==='manual'?'selected':''}>手动覆盖（需现场确认）</option></select></label>`);
    const mapping=$('[data-comm="mapping"]');if(mapping&&c.source!=='manual')mapping.readOnly=true;
    const parent=node(c.parent),channel=parent&&channels(parent).find(ch=>ch.id===c.port);
    const mismatch=channel&&(c.protocol==='rtu'&&(p.baud&&channel.baud!==p.baud||p.parity&&channel.parity!==p.parity)||c.protocol==='can'&&p.bitrate&&channel.bitrate!==p.bitrate);
    if(mismatch)content.insertAdjacentHTML('beforeend',`<div class="template-warning">上级共用端口参数与型号推荐值不同。应用后将影响该端口下的全部设备。</div><button class="text-button" data-action="applymodelchannel">应用型号推荐的共用端口参数</button>`);
  }
};
function applyModel(n,p){
  const old=clone(communicationConfig(n));n.deviceBrand=p.brand;n.deviceModel=p.id;
  const protocol=p.protocols.includes(old.protocol)?old.protocol:p.protocols[0],medium=communicationProtocols[protocol].medium,parent=node(old.parent);
  n.communication={...old,protocol,source:'profile',configured:true,mapping:p.mapping,devicePort:medium==='ethernet'?'LAN-1':medium==='serial'?'RS485-1':'CAN-1',port:parent?channels(parent).find(ch=>ch.id===old.port&&ch.medium===medium)?.id||channels(parent).find(ch=>ch.medium===medium)?.id||'':''};
  if(protocol==='tcp'&&old.protocol!=='tcp')n.communication.tcpPort='502';
}
$('#inspector').addEventListener('change',ev=>{
  const key=ev.target.dataset.identity,n=node(selected);if(!key||!n)return;const value=ev.target.value;
  transaction(()=>{
    materializeCommunication();
    if(key==='brand'){n.deviceBrand=value;delete n.deviceModel;n.communication.source='manual';n.communication.mapping='';}
    if(key==='model'){const p=deviceCatalog.find(p=>p.id===value&&p.type===n.type);if(p)applyModel(n,p);else{delete n.deviceModel;delete n.deviceBrand;n.communication.source='manual';n.communication.mapping='';}}
    if(key==='mode'){if(value==='profile'&&selectedProfile(n))applyModel(n,selectedProfile(n));else n.communication.source='manual';}
  });
});
actions.applymodelchannel=function(){const n=node(selected),p=selectedProfile(n),c=communicationConfig(n),parent=node(c.parent);if(!parent||!p)return;transaction(()=>{materializeCommunication();const ch=parent.channels.find(ch=>ch.id===c.port);if(!ch)return;for(const key of ['baud','parity','bitrate','frame'])if(p[key]!==undefined)ch[key]=p[key];});toast('已更新共用通道参数，请核对同通道的其他设备');};
const baseCommunicationIssues=communicationIssues;
communicationIssues=function(){const issues=baseCommunicationIssues();for(const n of communicationNodes()){const p=selectedProfile(n),c=communicationConfig(n);if(!p)continue;if(!p.protocols.includes(c.protocol))issues.push({id:n.id,msg:'当前协议不在所选型号的已登记支持列表内'});const parent=node(c.parent),ch=parent&&channels(parent).find(ch=>ch.id===c.port);if(ch&&c.protocol==='rtu'&&(p.baud&&p.baud!==ch.baud||p.parity&&p.parity!==ch.parity))issues.push({id:n.id,msg:'串口共用参数与型号推荐值不一致'});}return issues;};
render();
