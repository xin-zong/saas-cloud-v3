const customDefaults={start:'configured',voltage:'400 V',pcs:'2',pcsPower:'125',batteryCapacity:'261',pv:'1',pvPower:'200',chargers:'0',loads:'1'};
let customDraft={...customDefaults,...model.site.custom};
topologyPresets.splice(0,topologyPresets.length,
 {id:'storage2',name:'工商业储能',group:'经典模板',chain:'电网 → 母线 → 储能 + 负荷',scale:'250 kW / 522 kWh',description:'双储能支路与园区负荷，生成后可继续增删设备。'},
 {id:'solar',name:'光储协同',group:'经典模板',chain:'母线 → 光伏 + 储能 + 负荷',scale:'光伏 200 kW · 储能 250 kW',description:'预置光伏、双储能支路和负荷，适合常见工商业站点。'},
 {id:'solar-charge',name:'光储充一体站',group:'经典模板',chain:'母线 → 光伏 + 储能 + 充电',scale:'增加 120 kW 充电设施',description:'在光储结构上预置充电设施，可单独配置监测与控制角色。'},
 {id:'blank',name:'自定义拓扑',group:'自定义',chain:'设置电压、设备数量与容量',scale:'按需配置',description:'可以按参数生成起始结构，也可以从空白画布开始。'}
);
const priorTemplateSelector=templateSelector;
templateSelector=function(){
  const existing=model.site.templateKey||'solar';const key=pendingTemplate|| (topologyPresets.some(p=>p.id===existing)?existing:'blank');const p=topologyPresets.find(p=>p.id===key);
  let html=`<div class="table-scroll"><table class="template-selector"><thead><tr><th>起始方式</th><th>典型结构</th><th>参考规模</th></tr></thead><tbody>${topologyPresets.map(p=>`<tr><td><label><input type="radio" name="site-template" value="${p.id}" ${p.id===key?'checked':''}>${p.name}</label></td><td class="template-chain">${p.chain}</td><td class="template-scale">${p.scale}</td></tr>`).join('')}</tbody></table></div><p class="template-description"><strong>${p.name}</strong>　${p.description}</p>`;
  if(key==='blank'){
    const f=(title,k,min,max)=>`<label class="field"><span>${title}</span><input type="number" data-custom="${k}" value="${esc(customDraft[k])}" min="${min}" max="${max}" step="1"></label>`;
    html+=`<div class="custom-config"><label class="field"><span>创建方式</span><select data-custom="start"><option value="configured" ${customDraft.start==='configured'?'selected':''}>按参数生成起始结构</option><option value="empty" ${customDraft.start==='empty'?'selected':''}>从空白画布开始</option></select></label>`;
    if(customDraft.start==='configured')html+=`<div class="field-pair"><label class="field"><span>接入电压</span><select data-custom="voltage"><option ${customDraft.voltage==='400 V'?'selected':''}>400 V</option><option ${customDraft.voltage==='10 kV'?'selected':''}>10 kV</option></select></label><div><span class="comm-help">并网方式</span><p class="plain-value">单并网点 · 并网运行</p></div></div><div class="custom-counts">${f('储能支路数量','pcs',0,4)}${f('光伏逆变器数量','pv',0,4)}${f('充电设施数量','chargers',0,4)}${f('负荷支路数量','loads',0,4)}</div><div class="custom-counts">${f('每台 PCS 功率 (kW)','pcsPower',1,10000)}${f('每套电池容量 (kWh)','batteryCapacity',1,100000)}${f('每台光伏功率 (kW)','pvPower',1,10000)}</div><p class="field-help">${customDraft.voltage==='10 kV'?'将生成 10 kV / 400 V 变压器。':'400 V 直接接入，不预置变压器。'} 自动包含并网电表、母线、EMS 和网关。第一版支持合计最多 5 条能源与负荷支路。</p>`;
    else html+='<p class="field-help">创建后进入空白画布。可从节点库添加电网、母线、计量、PCS 等节点并连线；通信视图可配置设备接入。</p>';
    html+='</div>';
  }
  if(pendingTemplate)html+='<p class="template-warning">保存后将按当前选择生成结构，替换现有节点和连接，并清空设备绑定。可撤销恢复。</p>';
  else html+='<p class="field-help" style="margin-top:10px">未更换起始方式时保留当前拓扑，已有自定义设备不会被覆盖。</p>';
  return html;
};
const presetGenerator=createPreset;
createPreset=function(id){
  if(id!=='blank')return presetGenerator(id);
  if(customDraft.start==='empty')return {nodes:[],edges:[]};
  const next=initial();next.nodes=next.nodes.filter(n=>['grid','meter','bus','ems','gateway'].includes(n.type)||n.type==='transformer'&&customDraft.voltage==='10 kV');
  for(const n of next.nodes.filter(n=>['grid','meter'].includes(n.type)))n.voltage=customDraft.voltage;
  const edge=(from,fp,to,tp,kind='ac')=>({id:'CUSTOM-'+from+'-'+to,from,fromPort:fp,to,toPort:tp,kind});
  next.edges=[edge('GRID-01','AC','M-01','IN')];
  if(customDraft.voltage==='10 kV')next.edges.push(edge('M-01','OUT','T-01','HV'),edge('T-01','LV','BUS-01','AC'));
  else next.edges.push(edge('M-01','OUT','BUS-01','AC'));
  const total=['pcs','pv','chargers','loads'].reduce((s,k)=>s+Number(customDraft[k]),0);let slot=0;
  for(const [key,type] of [['pcs','pcs'],['pv','pv'],['chargers','charger'],['loads','load']])for(let i=1;i<=Number(customDraft[key]);i++){
    const id=types[type].code+'-'+String(i).padStart(2,'0'),x=total<=1?442:40+slot*(820/(total-1));slot++;
    const n={id,type,name:i+'# '+types[type].label,x,y:472,rating:type==='pcs'?customDraft.pcsPower:type==='pv'?customDraft.pvPower:type==='charger'?'120':'800',unit:'kW',voltage:'400 V',controllable:type==='pcs',scope:''};
    next.nodes.push(n);next.edges.push(edge('BUS-01','AC',id,'AC'));
    if(type==='pcs'){const battery={id:'BAT-'+String(i).padStart(2,'0'),type:'battery',name:i+'# 电池系统',x,y:635,rating:customDraft.batteryCapacity,unit:'kWh',voltage:'750 V'};next.nodes.push(battery);next.edges.push(edge(id,'DC',battery.id,'DC','dc'));}
  }
  return next;
};
const priorBoundarySave=saveBoundary;
saveBoundary=function(){
  if(pendingTemplate==='blank'){
    if(customDraft.start==='configured'){
      const counts=['pcs','pv','chargers','loads'];if(counts.some(k=>!validInteger(customDraft[k],0,4))||counts.reduce((s,k)=>s+Number(customDraft[k]),0)>5){toast('各类设备数量需为 0–4，支路合计不超过 5');return false;}
      if(!validInteger(customDraft.pcsPower,1,10000)||!validInteger(customDraft.batteryCapacity,1,100000)||!validInteger(customDraft.pvPower,1,10000)){toast('请填写有效的功率和容量参数');return false;}
    }
    siteDraft={...(siteDraft||model.site),custom:clone(customDraft)};
  }
  return priorBoundarySave();
};
$('#stage-page').addEventListener('input',ev=>{const k=ev.target.dataset.custom;if(k){customDraft[k]=ev.target.value;pendingTemplate='blank';dirty=true;$('#save-state').textContent='自定义参数尚未确认';}});
$('#stage-page').addEventListener('change',ev=>{const k=ev.target.dataset.custom;if(k){customDraft[k]=ev.target.value;pendingTemplate='blank';dirty=true;if(['start','voltage'].includes(k))renderSiteStage();}});
