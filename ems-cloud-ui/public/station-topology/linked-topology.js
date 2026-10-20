// One device inventory; electrical DC edges determine PCS/cabinet pairing.
function electricalPCS(b){return model.edges.filter(e=>e.kind==='dc'&&(e.from===b.id||e.to===b.id)).map(e=>node(e.from===b.id?e.to:e.from)).filter(n=>n?.type==='pcs');}
function bmsConfig(b){return {protocol:'can',pcsPort:'CAN-BMS-1',bmsPort:'CAN-PCS-1',bitrate:'500',baud:'19200',slave:'1',mapping:'',confirmed:false,...b.bmsLink};}
function integrateEMS(m){
  const gateways=m.nodes.filter(n=>n.type==='gateway'),ems=m.nodes.find(n=>n.type==='ems');if(!gateways.length)return;
  if(!ems)return;
  ems.channels=ems.channels||channelDefaults();
  for(const gw of gateways){
    const portMap=new Map();for(const p of channels(gw)){let id=p.id;const same=ems.channels.find(c=>JSON.stringify(c)===JSON.stringify(p));if(same){portMap.set(p.id,same.id);continue;}if(ems.channels.some(c=>c.id===id)){const prefix=p.medium==='ethernet'?'ETH':p.medium==='serial'?'RS485':'CAN';let k=1;while(ems.channels.some(c=>c.id===prefix+'-'+k))k++;id=prefix+'-'+k;}ems.channels.push({...clone(p),id});portMap.set(p.id,id);}
    for(const n of m.nodes)if(n.communication?.parent===gw.id){n.communication.parent=ems.id;n.communication.port=portMap.get(n.communication.port)||n.communication.port;}
  }
  m.legacyGateways=[...(m.legacyGateways||[]),...clone(gateways)];
  const ids=new Set(gateways.map(n=>n.id));m.nodes=m.nodes.filter(n=>!ids.has(n.id));m.edges=m.edges.filter(e=>!ids.has(e.from)&&!ids.has(e.to));
}
// New templates need only the EMS. Existing gateway channels are retained during migration.
baseNodes.splice(baseNodes.findIndex(n=>n.type==='gateway'),1);
integrateEMS(model);types.ems.label='EMS · 采集与控制';
const linkedPalette=renderPalette;
renderPalette=function(){linkedPalette();document.querySelectorAll('[data-add="gateway"],[data-type="gateway"]').forEach(el=>el.remove());};
const linkedAdd=add;add=function(t,pos){if(t==='gateway'){toast('本站由 EMS 承担采集网关功能，请配置 EMS 端口');return;}linkedAdd(t,pos);};
const linkedIssues=communicationIssues;
communicationIssues=function(){const result=linkedIssues();for(const b of model.nodes.filter(n=>n.type==='battery')){
  const ps=electricalPCS(b),c=bmsConfig(b);if(ps.length!==1){result.push({id:b.id,msg:ps.length?'电池柜连接了多个 PCS，请核对电气配对':'电池柜未配对 PCS，请先连接电气 DC 端口'});continue;}
  if(!c.confirmed)result.push({id:b.id,msg:'PCS ↔ BMS 本地链路待确认（依据电气 DC 连接配对）'});
  if(!c.pcsPort.trim()||!c.bmsPort.trim()||!c.mapping.trim())result.push({id:b.id,msg:'请补充 PCS/BMS 两端端口及协议点表版本'});
  if(c.bmsPort===communicationConfig(b).devicePort)result.push({id:b.id,msg:'BMS 接入 EMS 与 PCS 使用了同一物理端口，请核对接口占用'});
  if(c.protocol==='rtu'&&!validInteger(c.slave,1,247))result.push({id:b.id,msg:'BMS 本地链路从站地址需为 1–247'});
}return result;};
const linkedInspector=renderInspector;
renderInspector=function(){linkedInspector();if(view!=='communication')return;const n=node(selected),content=$('#inspector .inspector-content');if(!n||!content)return;
  if(n.type==='pcs')content.insertAdjacentHTML('beforeend',`<div class="section-label">对应电池柜 · 本地 BMS 通信</div>${model.nodes.filter(b=>b.type==='battery'&&electricalPCS(b).some(p=>p.id===n.id)).map(b=>`<button class="text-button" data-comm-select="${esc(b.id)}">${esc(b.id)} / BMS · 配置本地链路 →</button>`).join('')||'<p class="template-warning">未连接电池柜，请在电气图建立 DC 连接。</p>'}`);
  if(n.type!=='battery')return;
  const c=bmsConfig(n),ps=electricalPCS(n),field=(label,key,value,options)=>communicationField(label,key,value,options).replaceAll('data-comm=','data-bms=');
  content.insertAdjacentHTML('afterbegin',`<div class="bms-local"><div class="section-label">PCS ↔ BMS · 本地链路</div><p class="comm-help">同一电池柜的 BMS，不额外创建电池设备。配对来自电气 DC 连线。</p><div class="comm-inherited">${ps.length===1?esc(ps[0].id)+' ↔ '+esc(n.id)+' / BMS':'未确定配对 · 请完善电气图'}</div>${field('本地协议','protocol',c.protocol,[['can','CAN · 厂商协议'],['rtu','Modbus RTU']])}${field('PCS 侧物理端口','pcsPort',c.pcsPort)}${field('BMS 侧物理端口','bmsPort',c.bmsPort)}${c.protocol==='can'?field('CAN 速率 (kbit/s)','bitrate',c.bitrate,['125','250','500','1000']):field('波特率 (bps)','baud',c.baud,['9600','19200','38400','115200'])+field('BMS 从站地址','slave',c.slave)}${field('协议 / 点表版本','mapping',c.mapping)}<label class="field"><span><input type="checkbox" data-bms="confirmed" ${c.confirmed?'checked':''}> 已核对两端协议及物理接口</span></label>${!ps.length?'<button class="text-button" data-action="design">去电气拓扑配对 →</button><button class="text-button" data-action="delete">删除这个未配对电池柜（可撤销）</button>':''}<div class="section-label">EMS ↔ BMS · 独立采集链路</div></div>`);
};
$('#inspector').addEventListener('change',ev=>{const key=ev.target.dataset.bms,n=node(selected);if(!key||n?.type!=='battery')return;const value=key==='confirmed'?ev.target.checked:ev.target.value.trim();transaction(()=>{n.bmsLink={...bmsConfig(n),[key]:value};if(key!=='confirmed')n.bmsLink.confirmed=false;});});
renderCommunicationCanvas=function(){
  const ns=communicationNodes(),ems=ns.find(n=>n.type==='ems'),pcs=ns.filter(n=>n.type==='pcs'),batteries=ns.filter(n=>n.type==='battery');
  const columns=[];for(const p of pcs){const bs=batteries.filter(b=>electricalPCS(b).length===1&&electricalPCS(b)[0].id===p.id);columns.push({top:p,batteries:bs});}
  for(const n of ns.filter(n=>!['pcs','battery','ems'].includes(n.type)))columns.push({top:n,batteries:[]});
  for(const b of batteries.filter(b=>electricalPCS(b).length!==1))columns.push({top:b,batteries:[],unpaired:true});
  const width=Math.max(1040,columns.length*330+50),height=Math.max(790,590+Math.max(1,...columns.map(c=>c.batteries.length))*180),positions=new Map();
  $('#canvas').setAttribute('viewBox',`0 0 ${width} ${height}`);$('#canvas-title').textContent='通信关系 · EMS 直接采集';$('#canvas-description').textContent=`${pcs.length} 台 PCS / ${batteries.length} 个电池柜 · 配对来自电气图 · BMS 属于对应电池柜`;
  let svg='',portBadges='';const text=(x,y,s,color='#607581')=>`<text x="${x}" y="${y}" fill="${color}" font-size="14">${esc(s)}</text>`;
  const badge=(x,y,label,attributes)=>`<g class="comm-port-badge" ${attributes} tabindex="0" role="button"><rect x="${x-22}" y="${y-12}" width="44" height="24" rx="4"/><text x="${x}" y="${y+5}" text-anchor="middle">${label}</text></g>`;
  if(ems)svg+=`<g data-comm-select="${esc(ems.id)}" tabindex="0" role="button" aria-label="EMS 端口管理"><rect x="30" y="95" width="${width-60}" height="78" rx="6" fill="#ecf4f2" stroke="#739f92"/>${text(50,122,ems.id+' · EMS 采集与控制','#246857')}${text(50,147,'点击端口序号配置实际接口')}</g>`;
  function wire(n,x,y,side=false){const c=communicationConfig(n),valid=ems&&c.parent===ems.id,proto=communicationProtocols[c.protocol]?.name||'待配置';if(!valid)return;const sx=side?x+267:x+65,ty=side?y+44:y;
    const path=side?`M${sx} 173V${ty}H${x+192}`:`M${sx} 173V${ty}`;
    portBadges+=badge(side?x+192:sx,ty,'P01',`data-comm-select="${esc(n.id)}" aria-label="配置 ${esc(n.id)} P01 采集端口"`);
    const number='P'+String(channels(ems).findIndex(p=>p.id===c.port)+1).padStart(2,'0');
    svg+=`<g data-comm-select="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(ems.id+' '+c.port+' 至 '+n.id+' '+c.devicePort)}"><path d="${path}" fill="none" stroke="${({tcp:'#2563eb',rtu:'#d97706',can:'#9333ea'})[c.protocol]||'#9aa6ad'}" stroke-width="2"/><title>${esc(proto+' · '+c.port+' → '+c.devicePort)}</title></g>`;
    portBadges+=badge(sx,173,number,`data-ems-channel="${esc(c.port)}" aria-label="配置 EMS ${number} 实际端口 ${esc(c.port)}"`);
  }
  columns.forEach((col,i)=>{const x=40+i*330,y=330;positions.set(col.top.id,{x,y});wire(col.top,x,y);
    col.batteries.forEach((b,j)=>{const by=560+j*180,c=bmsConfig(b);positions.set(b.id,{x,y:by});wire(b,x,by,true);const sx=x+95;portBadges+=badge(sx,y+88,'P02',`data-comm-select="${esc(b.id)}" aria-label="配置 ${esc(col.top.id)} P02 本地端口"`)+badge(sx,by,'P02',`data-comm-select="${esc(b.id)}" aria-label="配置 ${esc(b.id)} P02 本地端口"`);svg+=`<g data-comm-select="${esc(b.id)}" tabindex="0" role="button" aria-label="${esc(col.top.id+' 与 '+b.id+' BMS 本地链路')}"><path d="M${sx} ${y+88}V${by}" fill="none" stroke="${c.protocol==='can'?'#9333ea':'#d97706'}" stroke-width="2"/><title>${esc((c.protocol==='can'?'CAN':'Modbus RTU')+' · '+c.pcsPort+' ↔ '+c.bmsPort)}</title></g>`;});
  });
  const issues=communicationIssues();for(const n of ns.filter(n=>n.type!=='ems')){const p=positions.get(n.id);if(!p)continue;const problem=issues.some(i=>i.id===n.id);svg+=`<g class="node ${selected===n.id?'selected':''}" data-comm-select="${esc(n.id)}" role="button" tabindex="0" aria-label="${esc(n.id)} 通信属性"><rect class="node-box" x="${p.x}" y="${p.y}" width="192" height="88" rx="6"/><path class="node-icon" d="${icons[n.type]}" transform="translate(${p.x+12},${p.y+12}) scale(.9)"/>${text(p.x+49,p.y+26,n.id)}${text(p.x+49,p.y+46,n.type==='battery'?'电池柜 / BMS':n.name)}${text(p.x+12,p.y+74,n.controllable?'EMS 控制':problem?'配置待完善':'仅监测')}<circle cx="${p.x+179}" cy="${p.y+13}" r="3" fill="${problem?'#c58b39':'#719f8e'}"/></g>`;}
  $('#scene').innerHTML=svg+portBadges;$('#scene').setAttribute('transform',`translate(${width/2*(1-zoom)} ${height/2*(1-zoom)}) scale(${zoom})`);$('#zoom-label').textContent=Math.round(zoom*100)+'%';
  $('.canvas-legend').innerHTML='<span><i class="line" style="background:#2563eb"></i>Modbus TCP</span><span><i class="line" style="background:#d97706"></i>Modbus RTU</span><span><i class="line" style="background:#9333ea"></i>CAN</span>';
};
const linkedSetView=setView;setView=function(v){linkedSetView(v);if(v==='electrical')$('.canvas-legend').innerHTML='<span><i class="line ac"></i>AC 交流</span><span><i class="line dc"></i>DC 直流</span><span><i class="pending-dot"></i>待绑定</span>';};
render();

