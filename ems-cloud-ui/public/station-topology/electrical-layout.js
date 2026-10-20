// Arrange connected equipment by port-centered electrical branches.
function arrangeElectricalNodes(){
 const ns=model.nodes.filter(n=>!['ems','gateway'].includes(n.type)),byId=new Map(ns.map(n=>[n.id,n])),adj=new Map(ns.map(n=>[n.id,[]]));
 for(const e of model.edges){if(!byId.has(e.from)||!byId.has(e.to))continue;adj.get(e.from).push(e.to);adj.get(e.to).push(e.from);}
 const visited=new Set(),roots=[];
 const priority=n=>n.type==='grid'?0:n.type==='bus'?1:n.type==='pcs'?2:3;
 function build(n){visited.add(n.id);const children=[...new Set(adj.get(n.id))].map(id=>byId.get(id)).sort((a,b)=>a.x-b.x||a.id.localeCompare(b.id)).filter(n=>!visited.has(n.id));const branch={node:n,children:[]};for(const child of children)if(!visited.has(child.id))branch.children.push(build(child));branch.width=Math.max((n.type==='bus'?152:deviceSize(n).width)+40,branch.children.reduce((sum,c)=>sum+c.width,0)+Math.max(0,branch.children.length-1)*48);return branch;}
 for(const n of ns.slice().sort((a,b)=>priority(a)-priority(b)||a.x-b.x))if(!visited.has(n.id))roots.push(build(n));
 function place(branch,left,top){const n=branch.node,center=left+branch.width/2;n.y=top;
   if(n.type==='bus'){n.busWidth=Math.max(240,branch.width-40);n.x=center-n.busWidth/2;}else n.x=center-deviceSize(n).width/2;
   let childLeft=left+(branch.width-(branch.children.reduce((sum,c)=>sum+c.width,0)+Math.max(0,branch.children.length-1)*48))/2;
   for(const child of branch.children){place(child,childLeft,top+(n.type==='bus'?9:deviceSize(n).height)+54);childLeft+=child.width+48;}
 }
 let left=50;for(const root of roots){place(root,left,50);left+=root.width+120;}
}
actions.layout=function(){if(view==='communication'){actions.fit();return;}transaction(arrangeElectricalNodes);actions.fit();toast('已按设备端口和连接关系整理布局');};
