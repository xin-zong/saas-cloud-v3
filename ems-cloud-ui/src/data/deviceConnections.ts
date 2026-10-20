export type ConnectionNode={id:unknown;name?:string;type?:string;serial?:string;status?:string;updatedAt?:string|null;linkedDeviceId?:number|string|null;sourceType?:string|null;observedStatus?:string|null;observedAt?:string|null;capturedAt?:string|null}
export type ConnectionEdge={parentId:unknown;childId:unknown}
export function connectionRows(nodes:ConnectionNode[],edges:ConnectionEdge[],collapsed:string[]){
 const byId=new Map(nodes.map(node=>[String(node.id),node])),children=new Map<string,string[]>(),inbound=new Set<string>(),hidden=new Set<string>(),visited=new Set<string>(),rows:{node:ConnectionNode;depth:number;hasChildren:boolean;key:string}[]=[]
 for(const edge of edges){const parent=String(edge.parentId),child=String(edge.childId);if(parent===child||!byId.has(parent)||!byId.has(child))continue;const values=children.get(parent)??[];if(!values.includes(child))values.push(child);children.set(parent,values);inbound.add(child)}
 function hide(id:string,ancestors:Set<string>){if(ancestors.has(id))return;hidden.add(id);for(const child of children.get(id)??[])hide(child,new Set([...ancestors,id]))}
 function walk(id:string,depth:number,ancestors:Set<string>,path:string){if(ancestors.has(id)||rows.length>=10000)return;const node=byId.get(id);if(!node)return;visited.add(id);rows.push({node,depth,hasChildren:!!children.get(id)?.length,key:path+id});if(collapsed.includes(id)){for(const child of children.get(id)??[])hide(child,new Set([id]));return}for(const child of children.get(id)??[])walk(child,depth+1,new Set([...ancestors,id]),path+id+'/')}
 for(const node of nodes)if(!inbound.has(String(node.id)))walk(String(node.id),0,new Set(),'')
 for(const node of nodes)if(!visited.has(String(node.id))&&!hidden.has(String(node.id)))walk(String(node.id),0,new Set(),'orphan/')
 return rows
}
export function connectionTypeLabel(node:ConnectionNode){return ({inverter:'逆变器',cabinet:'储能一体柜',pcs:'PCS','battery-pack':'电池包','battery-stack':'电池堆','battery-cluster':'电池簇','air-conditioner':'空调',meter:'电表',logger:'采集器',ems:'EMS控制器',environment:'动环',mppt:'MPPT','liquid-cooler':'液冷机'} as Record<string,string>)[node.type??'']??(node.sourceType?.trim()||'未知类型')}
export function connectionDeviceId(node:ConnectionNode):string|null {
 const id=node.linkedDeviceId??node.id
 return /^\d+$/.test(String(id))?String(id):null
}
export function connectionSelected(node:ConnectionNode,deviceId:string){return String(node.id)===deviceId||connectionDeviceId(node)===deviceId}
export function connectionObservation(node:ConnectionNode){
 const live=!!node.updatedAt
 return {status:live&&['online','offline'].includes(node.status??'')?node.status!:'unknown',time:node.updatedAt??node.observedAt??null,source:!live&&!!node.observedAt}
}
export function connectionBatteryPackId(node:ConnectionNode):string|null{
 if(node.type!=='battery-pack'||node.linkedDeviceId!=null)return null
 return /^reference-connection:([1-9]\d*)$/.exec(String(node.id))?.[1]??null
}
