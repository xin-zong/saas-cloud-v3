const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(name){const file=path.join(__dirname,'../src/tenant',name),exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;new Function('exports','require',code)(exports,p=>p==='@/components/ui/Workspace'?{}:p.startsWith('./')?load(p.slice(2)+'.ts'):require(p));return exports}
const {menuLabel}=load('permissionLabels.ts');
test('all built-in platform and enterprise role names have Chinese display names',()=>{
 const {knownName}=load('permissionLabels.ts');assert.equal(knownName('Admin','简体中文'),'管理员');assert.equal(knownName('Engineer','简体中文'),'工程师');assert.equal(knownName('Super Admin','简体中文'),'超级管理员');assert.equal(knownName('Installer','简体中文'),'安装服务商');assert.equal(knownName('Viewer','简体中文'),'只读用户')
})
test('custom menu names override the registered route label',()=>{assert.equal(menuLabel({id:1,client:'web',parent_id:null,name_key:'自定义资产入口',route_path:'assets'}),'自定义资产入口')});
test('registered menu keys retain translated route and operation labels',()=>{assert.equal(menuLabel({id:2,client:'web',parent_id:null,name_key:'nav.assets',route_path:'assets'}),'资产与站点');assert.equal(menuLabel({id:3,client:'web',parent_id:2,name_key:'action.asset.edit',permission_code:'asset.edit',permission_name:'编辑站点'}),'编辑站点')});
test('role permission names resolve both platform action keys and directory keys in Chinese',()=>{
 assert.equal(menuLabel({id:31,client:'web',parent_id:null,name_key:'nav.company.enterprise'}),'企业管理')
 assert.equal(menuLabel({id:48,client:'web',parent_id:null,name_key:'nav.platform.permission'}),'套餐权限管理')
 assert.equal(menuLabel({id:43,client:'web',parent_id:38,name_key:'platform.action.company.manage',permission_code:'company.manage',permission_name:'Manage companies'}),'管理企业')
 assert.equal(menuLabel({id:6,client:'web',parent_id:3,name_key:'action.ems.read',permission_code:'ems.read',permission_name:'查看 EMS 接入'}),'查看能量管理系统接入')
})
test('role menu and action labels switch to English without raw keys or Chinese',()=>{
 assert.equal(menuLabel({id:31,client:'web',parent_id:null,name_key:'nav.company.enterprise'},'English'),'Enterprise management')
 assert.equal(menuLabel({id:6,client:'web',parent_id:3,name_key:'action.ems.read',permission_code:'ems.read',permission_name:'查看 EMS 接入'},'English'),'View EMS integration')
 assert.equal(menuLabel({id:48,client:'web',parent_id:null,name_key:'nav.platform.permission'},'English'),'Packages & permissions')
})
test('custom names use translated display labels without changing stored names or falling back to mixed languages',()=>{
 const row={id:88,client:'web',parent_id:null,name_key:'Device Reviewer'}
 assert.equal(menuLabel(row,'简体中文','设备审阅者'),'设备审阅者');assert.equal(row.name_key,'Device Reviewer')
 assert.equal(menuLabel(row,'简体中文'),'自定义菜单（编号 88）')
 assert.equal(menuLabel({...row,name_key:'设备审阅者'},'English'),'Custom menu (88)')
 assert.equal(menuLabel({...row,name_key:'设备审阅者'},'English','Device Reviewer'),'Device Reviewer')
})
