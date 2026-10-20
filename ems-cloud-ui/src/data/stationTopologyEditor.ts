import type {WiringGraph,WiringBinding,WiringElement} from './stationWiring'
// getRandomValues is available on HTTP deployments too; randomUUID requires a secure context.
export function createTopologyChannel(random:Pick<Crypto,'getRandomValues'>=globalThis.crypto):string{
 return Array.from(random.getRandomValues(new Uint8Array(16)),byte=>byte.toString(16).padStart(2,'0')).join('')
}
export type TopologyNode={id:string;type:string;name:string;x:number;y:number;deviceId?:string|null;pointId?:string|null;[key:string]:unknown}
export type TopologyDocument={schema:1;nodes:TopologyNode[];edges:{id:string;from:string;to:string;fromPort?:string;toPort?:string;kind?:string;[key:string]:unknown}[];site:Record<string,unknown>;[key:string]:unknown}
const types=new Set(['grid','meter','transformer','bus','breaker','pcs','battery','pv','load','gateway','ems','charger'])
const key=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(v)
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function validateTopology(value:unknown):TopologyDocument{
 if(!object(value)||value.schema!==1||!Array.isArray(value.nodes)||!Array.isArray(value.edges)||!object(value.site)||value.nodes.length>500||value.edges.length>1000||new TextEncoder().encode(JSON.stringify(value)).length>524288)throw new Error('拓扑文档格式或大小无效')
 const ids=new Set<string>(),edges=new Set<string>()
 for(const n of value.nodes){if(!object(n)||!key(n.id)||ids.has(n.id)||typeof n.type!=='string'||!types.has(n.type)||typeof n.name!=='string'||n.name.length>200||typeof n.x!=='number'||!Number.isFinite(n.x)||n.x<0||n.x>9980||typeof n.y!=='number'||!Number.isFinite(n.y)||n.y<0||n.y>9980)throw new Error('拓扑节点格式无效');ids.add(n.id)}
 for(const e of value.edges){if(!object(e)||!key(e.id)||edges.has(e.id)||typeof e.from!=='string'||typeof e.to!=='string'||e.from===e.to||!ids.has(e.from)||!ids.has(e.to))throw new Error('拓扑连接格式无效');edges.add(e.id)}
 return JSON.parse(JSON.stringify(value)) as TopologyDocument
}
export function topologyFromWiring(graph:WiringGraph|null|undefined,name:string,bindings:Pick<WiringBinding,'deviceId'|'deviceType'>[]=[]):TopologyDocument{
 if(graph?.editorDocument)return validateTopology(graph.editorDocument)
 const registered=new Map(bindings.map(b=>[b.deviceId,b.deviceType??''])),mapping:Record<string,string>={pcs:'pcs','battery-cluster':'battery','battery-stack':'battery',stack:'battery',cabinet:'battery','battery-cabinet':'battery',inverter:'pv',meter:'meter',logger:'gateway',ems:'ems',load:'load'}
 const category=(e:WiringElement)=>e.kind==='breaker'?'breaker':e.kind==='junction'?'bus':mapping[registered.get(e.deviceId??'')??'']

 return {schema:1,site:{name,scene:'场站拓扑',grid:'待配置',mode:'并网运行',scope:'设计配置'},nodes:(graph?.elements??[]).map(e=>({id:e.id,type:category(e)??'load',legacyGeneric:!category(e),name:e.text,x:e.x,y:e.y,width:e.width,height:e.height,deviceId:e.deviceId,pointId:e.pointId,legacyKind:e.kind})),edges:(graph?.edges??[]).map(e=>({id:e.id,from:e.source,to:e.target,fromPort:'AC',toPort:'AC',kind:'ac'}))}
}
export function topologyToWiring(value:unknown,bindings:Pick<WiringBinding,'deviceId'|'pointId'>[]):WiringGraph{
 const doc=validateTopology(value),elements=doc.nodes.map(n=>{const deviceId=n.deviceId||null,pointId=n.pointId||null;if(deviceId&&!bindings.some(b=>b.deviceId===deviceId)||pointId&&(!deviceId||!bindings.some(b=>b.deviceId===deviceId&&b.pointId===pointId)))throw new Error('关联设备或测点不属于当前场站');return {id:n.id,kind:n.legacyKind==='text'?'text':n.type==='breaker'?'breaker':n.type==='bus'?'junction':'device',text:n.name,x:n.x,y:n.y,width:Math.max(20,Math.min(1000,10000-n.x,Number(n.width)||152)),height:Math.max(20,Math.min(1000,10000-n.y,Number(n.height)||76)),rotation:0,color:'#4b646d',fontSize:14,align:'center',deviceId,pointId} as WiringElement})
 return {elements,edges:doc.edges.map(e=>({id:e.id,source:e.from,target:e.to})),editorDocument:doc}
}
export function topologyMessage(event:{origin:string;source:unknown;data:unknown},source:unknown,origin:string,channel:string):{type:string;document?:unknown}|null{
 const data=event.data;if(event.origin!==origin||event.source!==source||!object(data)||data.channel!==channel||typeof data.type!=='string'||!['ems-topology:ready','ems-topology:change','ems-topology:save'].includes(data.type))return null
 return {type:data.type,document:data.document}
}
