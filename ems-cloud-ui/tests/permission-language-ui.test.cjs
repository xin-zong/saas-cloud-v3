const {test}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright')
test('role menus and permission names follow saved language both ways while preserving Web/App grants',{timeout:120000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000);page.on('pageerror',e=>errors.push(e.message))
  await page.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','permission-language'))
  const settings={language:'简体中文',timezone:'Asia/Shanghai'},rows=[]
  for(const [client,offset] of [['web',0],['app',100]])rows.push(
   {id:1+offset,parent_id:null,client,kind:'directory',name_key:'nav.company.enterprise'},
   {id:2+offset,parent_id:1+offset,client,kind:'page',name_key:'page.company.profile',route_path:'company.profile',permission_code:'company.profile.read',permission_name:'View enterprise profile'},
   {id:3+offset,parent_id:1+offset,client,kind:'action',name_key:'platform.action.company.manage',permission_code:'company.manage',permission_name:'Manage companies'},
   {id:4+offset,parent_id:1+offset,client,kind:'action',name_key:'action.ems.read',permission_code:'ems.read',permission_name:'查看 EMS 接入'},
   {id:5+offset,parent_id:1+offset,client,kind:'action',name_key:'Device Reviewer',permission_code:'asset.edit'},
   {id:6+offset,parent_id:null,client,kind:'directory',name_key:'nav.platform.permission'},
   {id:7+offset,parent_id:6+offset,client,kind:'page',name_key:'page.platform.menus',route_path:'platform.menus',permission_code:'menu.manage'})
  await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,async route=>{const req=route.request(),p=new URL(req.url()).pathname;let data=[]
   if(p==='/api/auth/me')data={id:'77',name:'语言测试用户',tenant:{actorId:77,tenantId:1,kind:'platform',administrator:true},roleNames:['Super Admin'],stationIds:[],permissions:['company.role.manage','menu.manage'],stationPermissions:{},menus:[{id:1,client:'web',kind:'page',path:'platform.roles',children:[]},{id:2,client:'web',kind:'page',path:'platform.menus',children:[]}]}
   if(p==='/api/settings'){if(req.method()==='PUT'){const body=req.postDataJSON();settings[body.key]=body.value}data=settings}
   if(p==='/api/company/roles/options')data={menus:rows}
   if(p==='/api/platform/menus')data=rows.map(r=>({...r,enabled:true}))
   if(p==='/api/platform/permission-options')data={permissions:[{code:'ems.read',name:'查看 EMS 接入'},{code:'company.manage',name:'Manage companies'}],routes:['assets','platform.menus'],allMenus:rows,templates:[]}
   if(p==='/api/company/roles'&&req.method()==='GET')data=[{id:9,name:'Installer',source:'custom',readonly:false,enabled:true,member_count:0,permissions:[{code:'ems.read',client:'app'}]}]
   if(p==='/api/company/roles/9'&&req.method()==='PUT'){writes.push(req.postDataJSON());data={}}
   await route.fulfill({json:{code:200,data}})
  })
  await page.route('https://api.mymemory.translated.net/get?**',async route=>{const url=new URL(route.request().url()),q=url.searchParams.get('q');await route.fulfill({json:{responseStatus:200,responseData:{translatedText:url.searchParams.get('langpair')==='en-GB|zh-CN'?'设备审阅者':q.replace(/[\u3400-\u9fff]+/g,'Translated text')}}})})
  await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8447/',{waitUntil:'domcontentloaded',timeout:60000})
  const openRole=async english=>{await page.getByRole('navigation',{name:english?'Primary navigation':'一级导航'}).getByRole('button',{name:english?'Enterprise management':'企业管理',exact:true}).click();await page.getByRole('button',{name:english?'Platform roles':'平台角色',exact:true}).click();await page.locator('.tenant-role-list').getByRole('button',{name:english?/Installer/:/安装服务商/}).click()}
  const labels=()=>page.locator('.tenant-permission>label>span').allTextContents()
  await openRole(false);await page.getByText('设备审阅者',{exact:true}).waitFor();assert((await labels()).every(s=>!/[A-Za-z]/.test(s)));assert((await labels()).includes('管理企业'));assert((await labels()).includes('查看能量管理系统接入'));assert.equal(await page.getByRole('button',{name:'网页端',exact:true}).count(),1)
  const setLanguage=async(english,value)=>{await page.getByRole('button',{name:english?'Settings':'设置',exact:true}).click();await page.getByRole('button',{name:english?/Display & language/:/显示与语言/}).click();await page.getByLabel(english?'Interface language':'界面语言',{exact:true}).selectOption(value);await page.locator('.settings-detail-header button').click();await page.waitForFunction(lang=>document.documentElement.lang===lang,value==='English'?'en':'zh-CN')}
  await setLanguage(false,'English');await openRole(true);assert((await labels()).every(s=>!/[\u3400-\u9fff]/.test(s)));assert((await labels()).includes('Manage enterprises'));assert((await labels()).includes('View EMS integration'))
  await page.getByRole('button',{name:'Mobile app',exact:true}).click();assert((await labels()).every(s=>!/[\u3400-\u9fff]/.test(s)))
  await page.getByRole('button',{name:'Edit',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Edit custom role',exact:true});await dialog.getByRole('button',{name:'Web',exact:true}).click();await dialog.locator('.tenant-permission label').filter({hasText:'Manage enterprises'}).locator('input').check();await dialog.getByRole('button',{name:'Save',exact:true}).click()
  assert.equal(writes[0].name,'Installer');assert.deepEqual(writes[0].permissions,[{code:'ems.read',client:'app'},{code:'company.manage',client:'web'}])
  const checkPermissionOptions=async english=>{await page.getByRole('navigation',{name:english?'Primary navigation':'一级导航'}).getByRole('button',{name:english?'Packages & permissions':'套餐权限管理',exact:true}).click();await page.getByRole('button',{name:english?'Menu management':'菜单管理',exact:true}).click();await page.getByRole('button',{name:english?'Add top-level menu':'新增一级菜单',exact:true}).click();const menu=page.getByRole('dialog');await menu.getByLabel(english?'Node type':'节点类型',{exact:true}).selectOption('action');const permission=menu.getByLabel(english?'Implemented permissions *':'已实现操作权限 *',{exact:true});const options=await permission.locator('option').allTextContents();assert(options.every(s=>english?!/[\u3400-\u9fff]/.test(s):!/[A-Za-z]/.test(s)));await permission.selectOption('ems.read');assert.equal(await permission.inputValue(),'ems.read');await menu.getByRole('button',{name:english?'Cancel':'取消',exact:true}).click();await menu.getByRole('button',{name:english?'Discard changes':'放弃修改',exact:true}).click();await menu.waitFor({state:'hidden'})}
  await checkPermissionOptions(true)
  await setLanguage(true,'简体中文');await openRole(false);assert((await labels()).every(s=>!/[A-Za-z]/.test(s)));assert((await labels()).includes('企业管理'));assert.deepEqual(errors,[])
  await checkPermissionOptions(false);assert.deepEqual(errors,[])
 }finally{await browser.close()}
})
