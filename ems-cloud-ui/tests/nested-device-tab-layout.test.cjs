const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=path.join(__dirname,'../src/components');
const node=(classes,parent=null,tag='div')=>({classes:classes.split(' '),parent,tag});
// Match descendant and child selectors against a representative nested station/device tree.
function matches(target,selector){
 const tokens=selector.trim().replace(/\s*>\s*/g,' > ').split(/\s+/);
 const simple=(n,s)=>!!n&&(!/^[a-z]/i.test(s)||n.tag===s.match(/^[a-z][\w-]*/i)[0])&&[...s.matchAll(/\.([\w-]+)/g)].every(m=>n.classes.includes(m[1]));
 function at(n,i){if(i<0)return true;if(!simple(n,tokens[i]))return false;if(i===0)return true;if(tokens[i-1]==='>')return at(n.parent,i-2);for(let p=n.parent;p;p=p.parent)if(at(p,i-1))return true;return false}
 return at(target,tokens.length-1);
}
const theme=node('station-workspace-theme'),station=node('station-shell-parity',theme),row=node('rs-module-row',station),stationTabs=node('rs-tabs',row,'nav'),drawer=node('rd-detail-drawer rd-pack-drawer',station),device=node('rd-device-detail',drawer),deviceTabs=node('rs-tabs',device,'nav');
const css=fs.readFileSync(path.join(src,'reference-station/station-shell-parity.css'),'utf8');
const tabRules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>m[1].includes('.rs-tabs'));
test('station module tab geometry applies to station tabs but never nested device or pack tabs',()=>{
 assert.ok(tabRules.some(m=>matches(stationTabs,m[1])),'station module layout remains styled');
 assert.deepEqual(tabRules.filter(m=>matches(deviceTabs,m[1])).map(m=>m[2]),[],'nested drawer tabs must not inherit station flex:auto/width at responsive breakpoints');
 const deviceButton=node('',deviceTabs,'button');
 assert.deepEqual(tabRules.filter(m=>m[1].includes('button')&&matches(deviceButton,m[1])).map(m=>m[2]),[],'device buttons must retain compact device tab geometry');
});
test('device detail tab header cannot grow into unused drawer space',()=>{
 const sheet=fs.readFileSync(path.join(src,'reference-devices.css'),'utf8');
 const rules=[...sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>matches(deviceTabs,m[1]));
 assert.ok(rules.some(m=>/flex\s*:\s*0\s+0\s+auto\s*(;|$)/.test(m[2])),'own device tab header must use a non-growing flex basis');
});
