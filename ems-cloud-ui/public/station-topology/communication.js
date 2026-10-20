// Communication configuration is independent of the electrical graph.
const communicationProtocols={tcp:{name:'Modbus TCP',medium:'ethernet'},rtu:{name:'Modbus RTU',medium:'serial'},can:{name:'CAN · 厂商协议',medium:'can'}};
let commPanel='access', selectedChannel='ETH-1';
const controller=n=>['gateway','ems'].includes(n.type);
const communicationNodes=()=>model.nodes.filter(physical);
function channelDefaults(){return[
  {id:'ETH-1',medium:'ethernet',ip:'192.168.10.1',mask:'255.255.255.0'},
  {id:'ETH-2',medium:'ethernet',ip:'192.168.20.1',mask:'255.255.255.0'},
  {id:'RS485-1',medium:'serial',baud:'9600',dataBits:'8',parity:'Even',stopBits:'1'},
  {id:'RS485-2',medium:'serial',baud:'19200',dataBits:'8',parity:'Even',stopBits:'1'},
  {id:'CAN-1',medium:'can',bitrate:'500',frame:'standard'}
]}
function channels(n){return n.channels||channelDefaults();}
function communicationConfig(n){
  if(n.communication)return n.communication;
  const peers=communicationNodes();const root=peers.find(a=>a.type==='ems'&&a.id!==n.id), gateway=peers.find(a=>a.type==='gateway'&&a.id!==n.id);
  const parent=n.type==='ems'?'':n.type==='gateway'?root?.id||'':gateway?.id||root?.id||'';
  const protocol=n.type==='battery'?'can':n.type==='meter'?'rtu':'tcp';
  const index=peers.indexOf(n)+1;
  return{parent,port:protocol==='tcp'?'ETH-1':protocol==='rtu'?'RS485-1':'CAN-1',protocol,devicePort:protocol==='tcp'?'LAN-1':protocol==='rtu'?'RS485-1':'CAN-1',host:'192.168.10.'+(100+index),tcpPort:'502',unit:'1',slave:String(index),canId:String(index),mapping:'',poll:'1000',timeout:'3000',configured:false};
}
function materializeCommunication(){for(const n of communicationNodes()){if(!n.communication)n.communication=clone(communicationConfig(n));if(controller(n)&&!n.channels)n.channels=channelDefaults();}}
materializeCommunication();
const mediumName={ethernet:'Ethernet',serial:'RS485',can:'CAN'};
const validInteger=(v,min,max)=>/^\d+$/.test(String(v))&&Number(v)>=min&&Number(v)<=max;
const validIP=v=>/^\d+\.\d+\.\d+\.\d+$/.test(v)&&v.split('.').every(s=>Number(s)<=255);
function communicationIssues(){
  const result=[],targets=communicationNodes();const add=(id,message)=>result.push({id,msg:message});
  for(const n of targets){
    const c=communicationConfig(n);if(n.type==='ems'&&!c.parent)continue;
    const parent=node(c.parent),protocol=communicationProtocols[c.protocol];
    if(!parent||!controller(parent)){add(n.id,'请选择有效的上级网关或 EMS');continue;}
    if(!protocol){add(n.id,'请选择通信协议');continue;}
    const port=channels(parent).find(p=>p.id===c.port);
    if(!port||port.medium!==protocol.medium)add(n.id,'上级端口与协议的物理接口不兼容');
    if(!c.devicePort?.trim())add(n.id,'请填写设备侧物理端口');
    if(c.protocol==='tcp'){if(!validIP(c.host))add(n.id,'设备 IPv4 地址格式无效');if(!validInteger(c.tcpPort,1,65535))add(n.id,'TCP 端口需为 1–65535');if(!validInteger(c.unit,0,255))add(n.id,'Unit ID 需为 0–255，请按设备协议确认');}
    if(c.protocol==='rtu'&&!validInteger(c.slave,1,247))add(n.id,'RTU 从站地址需为 1–247');
    if(c.protocol==='can'&&!validInteger(c.canId,0,port?.frame==='extended'?536870911:2047))add(n.id,'CAN 接收报文 ID 超出当前帧格式范围');
    if(!validInteger(c.poll,100,60000)||!validInteger(c.timeout,100,60000))add(n.id,'采集周期与超时需为 100–60000 ms');
    let id=n.id;const seen=new Set();while(id){if(seen.has(id)){add(n.id,'上级设备配置形成通信环路');break;}seen.add(id);const current=node(id);id=current?communicationConfig(current).parent:'';}
    if(c.protocol==='rtu')for(const other of targets){if(other.id===n.id)continue;const o=communicationConfig(other);if(o.protocol==='rtu'&&o.parent===c.parent&&o.port===c.port&&Number(o.slave)===Number(c.slave)){add(n.id,`${c.port} 上的从站地址 ${c.slave} 与 ${other.id} 重复`);break;}}
    if(c.protocol==='tcp')for(const other of targets){if(other.id===n.id)continue;const o=communicationConfig(other);if(o.protocol==='tcp'&&o.parent===c.parent&&o.port===c.port&&o.host===c.host&&Number(o.tcpPort)===Number(c.tcpPort)&&Number(o.unit)===Number(c.unit)){add(n.id,`TCP 端点与 Unit ID 与 ${other.id} 重复`);break;}}
  }
  return result;
}
function communicationField(label,key,value,options,help=''){
  return `<label class="field"><span>${label}</span>${options?`<select data-comm="${key}">${options.map(o=>{const v=Array.isArray(o)?o[0]:o,t=Array.isArray(o)?o[1]:o;return`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(t)}</option>`}).join('')}</select>`:`<input data-comm="${key}" value="${esc(value)}" ${['tcpPort','unit','slave','canId','poll','timeout'].includes(key)?'inputmode="numeric"':''}>`}${help?`<small class="comm-help">${help}</small>`:''}</label>`;
}
function renderCommunicationInspector(){
  const n=node(selected);if(!n||!physical(n)){$('#inspector').innerHTML='<div class="inspector-head">通信接入配置</div><div class="empty">选择通信设备<br>配置协议、端口与地址</div>';return;}
  const c=communicationConfig(n),root=n.type==='ems'&&!c.parent;
  let html=`<div class="inspector-head">通信接入配置<span>${(n.legacyGeneric?'设备（类型待识别）':types[n.type].label)}</span></div><div class="inspector-content"><div class="object-title"><div class="object-icon">${symbol(n.type)}</div><div><h2>${esc(n.name)}</h2><p>${esc(n.id)} · ${c.configured?'草案已配置':'示例参数 · 待确认'}</p></div></div>`;
  if(controller(n))html+=`<div class="inspector-tabs"><button class="${commPanel==='access'?'active':''}" data-comm-panel="access">${root?'控制器信息':'上行接入'}</button><button class="${commPanel==='ports'?'active':''}" data-comm-panel="ports">下行端口管理</button></div>`;
  if(controller(n)&&commPanel==='ports'){
    const list=channels(n);let port=list.find(p=>p.id===selectedChannel)||list[0];selectedChannel=port.id;
    html+=`<div class="comm-port-list">${list.map(p=>`<button class="${p.id===port.id?'active':''}" data-select-channel="${p.id}"><b>${p.id}</b><span>${mediumName[p.medium]}</span><small>${communicationNodes().filter(a=>{const cc=communicationConfig(a);return cc.parent===n.id&&cc.port===p.id}).length} 台设备</small></button>`).join('')}</div><div class="section-label">${port.id} · 共用通道参数</div>`;
    const cf=(label,key,value,options)=>communicationField(label,key,value,options).replaceAll('data-comm=','data-channel=');
    if(port.medium==='ethernet')html+=cf('本地 IPv4 地址','ip',port.ip)+cf('子网掩码','mask',port.mask);
    if(port.medium==='serial')html+=`<div class="field-pair">${cf('波特率 (bps)','baud',port.baud,['2400','4800','9600','19200','38400','57600','115200'])}${cf('数据位','dataBits',port.dataBits,['8'])}</div><div class="field-pair">${cf('校验位','parity',port.parity,[['Even','偶校验 Even'],['Odd','奇校验 Odd'],['None','无校验 None']])}${cf('停止位','stopBits',port.stopBits,['1','2'])}</div>`;
    if(port.medium==='can')html+=cf('总线速率 (kbit/s)','bitrate',port.bitrate,['125','250','500','1000'])+cf('帧格式','frame',port.frame,[['standard','标准帧 · 11 bit'],['extended','扩展帧 · 29 bit']]);
    html+='<p class="comm-help">此端口下所有设备共享通道参数。修改会影响该端口的全部接入设备。</p><div class="section-label">增加物理端口</div><div class="comm-add-ports"><button data-new-channel="ethernet">＋ Ethernet</button><button data-new-channel="serial">＋ RS485</button><button data-new-channel="can">＋ CAN</button></div><p class="comm-help">端口数量是设计配置，需与现场硬件能力核对。</p>';
  }else if(root){html+=`<div class="section-label">站级通信主节点</div><p class="comm-help">设备可以直接接入 EMS 的端口，也可以经网关接入。下行端口管理中可配置网络、串口与 CAN 通道。</p><div class="definition-rows"><div>控制器编号：${esc(n.id)}</div><div>物理端口：${channels(n).length} 个</div></div><button class="primary" data-comm-panel="ports">配置下行端口 →</button>`;}
  else{
    const protocol=communicationProtocols[c.protocol]||communicationProtocols.tcp,parent=node(c.parent),available=parent?channels(parent).filter(p=>p.medium===protocol.medium):[];
    html+=`<div class="section-label">连接路径</div>${communicationField('上级采集设备','parent',c.parent,[['','请选择上级设备'],...communicationNodes().filter(a=>controller(a)&&a.id!==n.id).map(a=>[a.id,a.id+' · '+a.name])])}${communicationField('通信协议','protocol',c.protocol,Object.entries(communicationProtocols).map(([id,p])=>[id,p.name]))}<div class="field-pair">${communicationField('上级物理端口','port',c.port,[['','请选择端口'],...available.map(p=>[p.id,p.id])])}${communicationField('设备侧物理端口','devicePort',c.devicePort)}</div>`;
    if(parent&&c.port)html+=`<button class="text-button comm-parent-link" data-open-parent="${esc(parent.id)}" data-port-id="${esc(c.port)}">配置 ${esc(parent.id)} / ${esc(c.port)} 共用参数 ↗</button>`;
    html+='<div class="section-label">协议地址</div>';
    if(c.protocol==='tcp')html+=communicationField('设备 IPv4 地址','host',c.host)+`<div class="field-pair">${communicationField('TCP 服务端口','tcpPort',c.tcpPort)}${communicationField('Unit ID','unit',c.unit)}</div><p class="comm-help">TCP 服务端口与上级 ETH 物理端口不同；Unit ID 按设备协议配置。</p>`;
    if(c.protocol==='rtu'){const port=parent&&channels(parent).find(p=>p.id===c.port);html+=communicationField('从站地址 / Slave ID','slave',c.slave,null,'同一串口下地址唯一，范围 1–247。')+`<div class="comm-inherited"><span>继承上级串口参数</span><b>${port?`${port.baud} bps · ${port.dataBits}${port.parity==='None'?'N':port.parity==='Odd'?'O':'E'}${port.stopBits}`:'尚未选择串口'}</b></div>`;}
    if(c.protocol==='can'){html+=communicationField('接收报文 ID（十进制）','canId',c.canId,null,'厂商 CAN 协议的单条接收标识示例，不等同于设备站号。');}
    html+=`<div class="section-label">采集与数据映射</div>${communicationField('点表 / 协议映射名称','mapping',c.mapping,null,'填写厂商提供的映射名称；原型不加载真实驱动。')}<div class="field-pair">${communicationField(c.protocol==='can'?'接收检查周期 (ms)':'采集周期 (ms)','poll',c.poll)}${communicationField('响应超时 (ms)','timeout',c.timeout)}</div>`;
    const problems=communicationIssues().filter(i=>i.id===n.id);html+=`<div class="comm-validation ${problems.length?'invalid':''}">${problems.length?problems.map(p=>'! '+esc(p.msg)).join('<br>'):'✓ 配置格式检查通过'}</div><p class="comm-help">配置仅保存到设计草案，现场连通性和设备协议仍需验证。</p>`;
  }
  $('#inspector').innerHTML=html+'</div>';
}
function renderCommunicationCanvas(){
  const ns=communicationNodes(),roots=ns.filter(controller),devices=ns.filter(n=>!controller(n));
  $('#canvas-title').textContent='通信接入拓扑';$('#canvas-description').textContent='选择设备配置协议与两端端口 · 虚线表示设计连接';
  const positions=new Map();roots.forEach((n,i)=>positions.set(n.id,{x:80+i*360,y:115}));
  devices.forEach((n,i)=>positions.set(n.id,{x:55+(i%4)*250,y:365+Math.floor(i/4)*190}));
  const height=Math.max(790,420+Math.ceil(devices.length/4)*190);$('#canvas').setAttribute('viewBox',`0 0 1040 ${height}`);
  let svg='';
  for(const n of ns){const c=communicationConfig(n),a=positions.get(c.parent),b=positions.get(n.id);if(!a||!b)continue;const protocol=communicationProtocols[c.protocol];const x=a.x+86,y=a.y+88,tx=b.x+86,ty=b.y;const path=controller(n)?`M${a.x+172} ${a.y+44}H${b.x}`:`M${x} ${y}V${ty-42}H${tx}V${ty}`;svg+=`<g class="edge communication" data-comm-select="${n.id}" tabindex="0" role="button" aria-label="配置 ${esc(n.id)} 的通信连接"><path class="edge-hit" d="${path}"/><path class="edge-line" d="${path}"/><text class="comm-edge-label" x="${controller(n)?a.x+188:tx+7}" y="${controller(n)?a.y+32:ty-16}">${esc(c.port)} · ${esc(protocol?.name||'待选协议')}</text></g>`;}
  for(const n of ns){const p=positions.get(n.id),c=communicationConfig(n),problem=communicationIssues().some(i=>i.id===n.id),endpoint=n.type==='ems'&&!c.parent?'站级采集与控制':c.protocol==='tcp'?`${c.host}:${c.tcpPort}`:c.protocol==='rtu'?`地址 ${c.slave} · ${c.devicePort}`:`报文 ${c.canId} · ${c.devicePort}`;svg+=`<g class="node ${selected===n.id?'selected':''}" data-comm-select="${n.id}" role="button" tabindex="0" aria-label="${esc(n.id)} 通信属性"><rect class="node-box" x="${p.x}" y="${p.y}" width="172" height="88" rx="6"/><path class="node-icon" d="${icons[n.type]}" transform="translate(${p.x+12},${p.y+12}) scale(.9)"/><text class="node-label" x="${p.x+49}" y="${p.y+26}">${esc(n.id)}</text><text class="node-subtitle" x="${p.x+49}" y="${p.y+45}">${esc(n.name)}</text><line x1="${p.x+10}" x2="${p.x+162}" y1="${p.y+56}" y2="${p.y+56}" stroke="#e8eef1"/><text class="comm-endpoint" x="${p.x+10}" y="${p.y+76}">${esc(endpoint)}</text><circle cx="${p.x+157}" cy="${p.y+13}" r="3" fill="${problem?'#c58b39':'#719f8e'}"/></g>`;}
  $('#scene').innerHTML=svg;$('#scene').setAttribute('transform',`translate(${520*(1-zoom)} ${height/2*(1-zoom)}) scale(${zoom})`);$('#zoom-label').textContent=Math.round(zoom*100)+'%';
}
function renderCommunicationIssues(){
  const list=communicationIssues();$('.validation-head b').textContent='通信配置检查';$('#issue-summary').textContent=list.length?list.length+' 项待完善':'格式检查通过 · 未验证连通性';$('#issue-summary').style.color=list.length?'var(--amber)':'var(--green)';$('#issues').hidden=issueCollapsed;$('#issues').innerHTML=list.length?list.map(i=>`<button class="issue" data-comm-select="${i.id}"><span class="issue-icon">!</span><code>${esc(i.id)}</code><span>${esc(i.msg)}</span><span class="issue-arrow">配置 ↗</span></button>`).join(''):'<p class="inline-note">物理端口、协议地址和通道内地址冲突检查通过；尚未连接实际设备。</p>';
}
function refreshCommunication(){renderCanvas();renderInspector();renderIssues();renderStatus();}
$('#inspector').addEventListener('change',ev=>{
  const n=node(selected);if(!n)return;
  const key=ev.target.dataset.comm,channelKey=ev.target.dataset.channel;
  if(key){const value=ev.target.value.trim();if(key==='parent'){let id=value;const seen=new Set([n.id]);while(id){if(seen.has(id)){toast('上级设备不能形成通信环路');renderInspector();return;}seen.add(id);const next=node(id);id=next?communicationConfig(next).parent:'';}}
    transaction(()=>{materializeCommunication();const c=n.communication;c[key]=value;c.configured=true;if(key==='protocol'||key==='parent'){const p=node(c.parent),medium=communicationProtocols[c.protocol].medium;c.port=p?channels(p).find(p=>p.medium===medium)?.id||'':'';if(key==='protocol')c.devicePort=medium==='ethernet'?'LAN-1':medium==='serial'?'RS485-1':'CAN-1';}});
  }
  if(channelKey){const value=ev.target.value.trim();if(['ip','mask'].includes(channelKey)&&!validIP(value)){toast('请输入有效的 IPv4 地址');renderInspector();return;}transaction(()=>{materializeCommunication();const port=n.channels.find(p=>p.id===selectedChannel);if(port)port[channelKey]=value;});}
});
document.addEventListener('click',ev=>{
  const target=ev.target.closest('[data-comm-select],[data-comm-panel],[data-select-channel],[data-open-parent],[data-new-channel]');if(!target)return;
  if(target.dataset.commSelect){selected=target.dataset.commSelect;commPanel='access';refreshCommunication();}
  if(target.dataset.commPanel){commPanel=target.dataset.commPanel;renderInspector();}
  if(target.dataset.selectChannel){selectedChannel=target.dataset.selectChannel;renderInspector();}
  if(target.dataset.openParent){selected=target.dataset.openParent;commPanel='ports';selectedChannel=target.dataset.portId;refreshCommunication();}
  if(target.dataset.newChannel){const n=node(selected),medium=target.dataset.newChannel;transaction(()=>{materializeCommunication();const prefix=medium==='ethernet'?'ETH':medium==='serial'?'RS485':'CAN';let i=1;while(n.channels.some(p=>p.id===prefix+'-'+i))i++;const p=clone(channelDefaults().find(p=>p.medium===medium));p.id=prefix+'-'+i;if(medium==='ethernet')p.ip='192.168.'+(10+i)+'.1';n.channels.push(p);selectedChannel=p.id;});}
});
$('#canvas').addEventListener('keydown',ev=>{if(['Enter',' '].includes(ev.key)){const target=ev.target.closest('[data-comm-select]');if(target){ev.preventDefault();selected=target.dataset.commSelect;commPanel='access';refreshCommunication();}}});
const originalSetView=setView;
setView=function(v){originalSetView(v);$('.workbench').classList.toggle('communication-mode',v==='communication');if(v!=='communication')$('#canvas').setAttribute('viewBox','0 0 1040 790');if(v==='communication'&&!physical(node(selected)||{type:''}))selected=communicationNodes().find(n=>n.type==='pcs')?.id||communicationNodes()[0]?.id;commPanel='access';refreshCommunication();};
const originalValidate=actions.validate;
actions.validate=function(){if(view==='communication'){renderCommunicationIssues();toast('通信配置检查完成：'+communicationIssues().length+' 项待完善');}else originalValidate();};
const originalCommConnect=actions.connect;
actions.connect=function(){if(view==='communication'){toast('选择设备，在右侧修改上级设备与物理端口，即可建立通信连接');}else originalCommConnect();};
const originalChangeField=changeField;
changeField=function(el){const old=selected,key=el.dataset.field,value=el.value.trim();originalChangeField(el);if(key==='id'&&selected===value&&old!==value){for(const n of communicationNodes())if(n.communication?.parent===old)n.communication.parent=value;}};
render();
