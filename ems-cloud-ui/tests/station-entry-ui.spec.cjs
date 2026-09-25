const test = require("node:test")
const assert = require("node:assert/strict")
const { chromium } = require("playwright")
const fs = require("node:fs/promises")
const path = require("node:path")
const url = process.env.DEMO_PREVIEW_URL || "http://127.0.0.1:8450"
const artifacts = path.resolve(__dirname, "../.figma/station-entry")
test('API station editing retains scoped writes and closes after permission revocation', {timeout:90000}, async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addInitScript(()=>sessionStorage.setItem('enerlution-api-token','entry-test'));const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let user={id:'7',name:'权限用户',account:'entry@test',role:'integrator',organization:'测试',stationIds:['1','2'],permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit'],2:['asset.read']},organizationPermissions:{}};
 const stations=[{id:1,name:'可编辑站点',code:'API-1',rated_power_kw:100,capacity_kwh:200,region:'华东',address:'真实地址'},{id:2,name:'只读站点',code:'API-2',rated_power_kw:50,capacity_kwh:100}];const writes=[];
 await page.route('http://127.0.0.1:18090/api/**',async route=>{const req=route.request(),p=new URL(req.url()).pathname.slice(4);let data=[];if(p==='/auth/me')data=user;else if(p==='/stations')data=stations;else if(p==='/stations/1'&&req.method()==='PUT'){const body=req.postDataJSON();writes.push(body);stations[0].name=body.name;data=null;}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,data})});});
 try{await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8451',{waitUntil:'domcontentloaded',timeout:60000});await page.getByRole('button',{name:'资产与站点',exact:true}).click();await page.getByRole('button',{name:'编辑可编辑站点',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'编辑只读站点',exact:true}).count(),0);assert.doesNotMatch(await page.locator('.station-assets').innerText(),/NaN|undefined/);await page.screenshot({path:path.join(artifacts,'api-empty-list.png')});await page.getByRole('button',{name:'编辑可编辑站点',exact:true}).click();await page.getByLabel('站点名称 *',{exact:true}).fill('服务器保存名称');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('status').filter({hasText:'已保存编辑'}).waitFor();assert.equal(writes.length,1);assert.equal(writes[0].name,'服务器保存名称');assert.equal(writes[0].ratedPowerKw,100);assert.equal(writes[0].capacityKwh,200);await page.getByLabel('详细地址 *',{exact:true}).fill('未保存修改');user={...user,permissions:['asset.read'],stationPermissions:{1:['asset.read'],2:['asset.read']}};const refreshed=page.waitForResponse(r=>r.url().endsWith('/auth/me'));await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await refreshed;await page.locator('.station-editor').waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'编辑服务器保存名称',exact:true}).count(),0);assert.equal(writes.length,1);await page.getByRole('button',{name:'地图查询',exact:true}).click();assert.doesNotMatch(await page.locator('.station-map').innerText(),/NaN|551\.1|30,389/);await page.screenshot({path:path.join(artifacts,'api-map-empty.png')});assert.deepEqual(errors,[]);}finally{await browser.close();}
});
test(
  "station entry: favorites, unsaved editing, provisioning validation and unavailable deployment",
  { timeout: 180000 },
  async () => {
    await fs.mkdir(artifacts, { recursive: true })
    const browser = await chromium.launch({ channel: "msedge", headless: true })
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    })
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    try {
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000})
      await page
        .getByRole("textbox", { name: "登录账号", exact: true })
        .fill("integrator@enerlution.cn")
      await page.getByLabel("密码", { exact: true }).fill("Demo@2026")
      await page.getByRole("button", { name: "登录", exact: true }).click()
      await page.getByLabel('动态验证码', {exact:true}).fill('246810')
      await page.getByRole('button', {name:'完成验证', exact:true}).click()
      await page.locator(".workspace-sidebar").waitFor()
      await page
        .getByRole("navigation", { name: "一级导航" })
        .getByRole("button", { name: "资产与站点" })
        .click()
      await page.locator(".station-list-panel").waitFor()
      await page.screenshot({ path: path.join(artifacts, "list-1440.png") })
      const firstName = await page
        .locator(".station-name-button")
        .first()
        .textContent()
      await page
        .getByRole("button", { name: "收藏" + firstName, exact: true })
        .click()
      await page.getByRole("button", { name: "收藏站点", exact: true }).click()
      await page
        .getByRole("button", { name: "取消收藏" + firstName, exact: true })
        .click()
      await page.getByRole("dialog", { name: "确定取消收藏？" }).waitFor()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "取消", exact: true })
        .click()
      assert.equal(await page.locator(".station-name-button").count(), 1)
      await page
        .getByRole("button", { name: "取消收藏" + firstName, exact: true })
        .click()
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "确认", exact: true })
        .click()
      await page.getByRole("heading", { name: "暂无收藏站点" }).waitFor()
      await page.screenshot({
        path: path.join(artifacts, "favorites-empty.png"),
      })
      await page.getByRole("button", { name: "列表查询", exact: true }).click()
      await page
        .getByRole("button", { name: "编辑" + firstName, exact: true })
        .click()
      await page
        .getByLabel("站点名称 *", { exact: true })
        .fill(firstName + "测试")
      await page
        .getByRole("button", { name: "返回站点列表", exact: true })
        .click()
      await page.getByRole("dialog", { name: "未保存的更改" }).waitFor()
      await page.screenshot({ path: path.join(artifacts, "edit-unsaved.png") })
      await page
        .getByRole("button", { name: "不保存离开", exact: true })
        .click()
      await page
        .getByRole("button", { name: "＋ 新增站点", exact: true })
        .click()
      await page.getByRole("button", { name: "下一步", exact: true }).click()
      assert.match(await page.getByRole("alert").textContent(), /站点名称/)
      await page.getByLabel("站点名称 *", { exact: true }).fill("测试新站")
      await page.getByLabel("所在地区 *", { exact: true }).selectOption("华东")
      await page.getByLabel("详细地址 *", { exact: true }).fill("工业园 1 号")
      await page.screenshot({
        path: path.join(artifacts, "provision-basics.png"),
      })
      await page.getByRole("button", { name: "下一步", exact: true }).click()
      await page.getByRole("button", { name: "校验配置", exact: true }).click()
      await page.getByText("发现 1 项待修正", { exact: true }).waitFor()
      await page.getByRole("button", { name: "返回修改", exact: true }).click()
      await page
        .getByRole("button", { name: "＋ 交流母线", exact: true })
        .click()
      await page.getByRole("button", { name: "PCS", exact: true }).click()
      await page
        .getByLabel("协议模板 *", { exact: true })
        .selectOption("Modbus TCP")
      await page.getByLabel("IP 地址 *", { exact: true }).fill("192.168.1.101")
      await page
        .getByRole("button", { name: "电池 / BMS", exact: true })
        .click()
      await page
        .getByLabel("协议模板 *", { exact: true })
        .selectOption("Modbus RTU")
      await page.screenshot({ path: path.join(artifacts, "provision-bms.png") })
      await page.getByRole("button", { name: "清空", exact: true }).click()
      await page.getByRole("dialog", { name: "清空画布？" }).waitFor()
      await page.getByRole("button", { name: "取消", exact: true }).click()
      assert.equal(await page.locator(".topology-device").count(), 2)
      await page.getByRole("button", { name: "校验配置", exact: true }).click()
      await page.getByText("本地校验通过", { exact: true }).waitFor()
      await page.screenshot({
        path: path.join(artifacts, "provision-validation.png"),
      })
      await page.getByRole("button", { name: "发布配置", exact: true }).click()
      await page.getByRole("dialog", { name: "暂时无法发布配置" }).waitFor()
      await page.getByRole("button", { name: "保存本地草稿并查看结果" }).click()
      await page.getByRole("heading", { name: "部署服务未接通" }).waitFor()
      assert.equal(await page.getByText("关联成功", { exact: true }).count(), 0)
      assert.equal(await page.locator(".deployment-stages small").count(), 6)
      await page.screenshot({
        path: path.join(artifacts, "provision-results.png"),
      })
      await page
        .getByRole("button", { name: "新版本配置草稿", exact: true })
        .click()
      await page.getByText("已创建新版本本地草稿，现场生效版本未知。").waitFor()
      await page.getByRole("button", { name: "清空", exact: true }).click()
      await page.getByRole("button", { name: "确认清空", exact: true }).click()
      assert.equal(await page.locator(".topology-device").count(), 0)
      await page.getByRole("button", { name: "撤销", exact: true }).click()
      assert.equal(await page.locator(".topology-device").count(), 2)
      await page.getByRole("button", { name: "重做", exact: true }).click()
      assert.equal(await page.locator(".topology-device").count(), 0)
      await page
        .getByRole("button", { name: "← 返回站点列表", exact: true })
        .click()
      await page
        .getByRole("button", { name: "保存并离开", exact: true })
        .click()
      await page.getByRole("button", { name: "地图查询", exact: true }).click()
      await page.getByLabel("地图选择站点").selectOption({ label: firstName })
      await page.screenshot({ path: path.join(artifacts, "map.png") })
      await page.getByRole("button", { name: "智能规则", exact: true }).click()
      await page.screenshot({ path: path.join(artifacts, "smart-rules.png") })
      for (const width of [1366, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        await page
          .getByRole("button", { name: "列表查询", exact: true })
          .click()
        const size = await page
          .locator(".station-assets")
          .evaluate((el) => ({
            client: el.clientWidth,
            scroll: el.scrollWidth,
          }))
        assert.ok(size.scroll <= size.client + 1, JSON.stringify(size))
        await page.screenshot({
          path: path.join(artifacts, "list-" + width + ".png"),
        })
      }
      assert.deepEqual(errors, [])
    } finally {
      await browser.close()
    }
  },
)



test('editor preserves requested tabs and unknown API capacities', {timeout:90000}, async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true})
  const context = await browser.newContext()
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token','entry-test'))
  const page = await context.newPage()
  const writes=[]
  const station={id:1,name:'未知容量站',code:'API-UNKNOWN',region:'华东',address:'真实地址'}
  await page.route('http://127.0.0.1:18090/api/**',async route => {
    const req=route.request(), p=new URL(req.url()).pathname.slice(4)
    let data=[]
    if(p==='/auth/me') data={id:'7',name:'权限用户',account:'entry@test',role:'integrator',organization:'测试',stationIds:['1'],permissions:['asset.read','asset.edit'],stationPermissions:{1:['asset.read','asset.edit']},organizationPermissions:{}}
    else if(p==='/stations') data=[station]
    else if(p==='/stations/1' && req.method()==='PUT') {writes.push(req.postDataJSON());data=null}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:0,data})})
  })
  const click = name => page.getByRole('button',{name,exact:true}).click()
  const edit = async () => {await click('列表查询');await click('编辑未知容量站')}
  try {
    await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8451',{waitUntil:'domcontentloaded',timeout:60000})
    await click('资产与站点');await edit()
    await click('地图查询');await page.locator('.station-map').waitFor()
    await edit();await page.getByLabel('详细地址 *',{exact:true}).fill('未保存地址')
    await click('智能规则');await page.getByRole('dialog',{name:'未保存的更改'}).waitFor()
    await click('取消');await page.locator('.station-editor').waitFor()
    await click('智能规则');await click('不保存离开')
    await page.locator('.station-editor').waitFor({state:'detached'})
    assert.equal(await page.locator('.station-entry-tabs button[aria-current="page"]').textContent(),'智能规则')
    await edit();await page.getByLabel('详细地址 *',{exact:true}).fill('保存真实地址')
    await click('收藏站点');await click('保存并离开')
    await page.getByRole('heading',{name:'暂无收藏站点'}).waitFor()
    assert.equal(writes.length,1);assert.equal(writes[0].address,'保存真实地址')
    assert.ok(!Object.hasOwn(writes[0],'ratedPowerKw'));assert.ok(!Object.hasOwn(writes[0],'capacityKwh'))
    await edit();await page.getByLabel('额定功率 (kW)',{exact:true}).fill('-1')
    await click('保存');await page.getByRole('alert').filter({hasText:'必须为非负数'}).waitFor()
    assert.equal(writes.length,1)
    await page.getByLabel('额定功率 (kW)',{exact:true}).fill('123')
    await click('保存');await page.getByRole('status').filter({hasText:'已保存编辑'}).waitFor()
    assert.equal(writes.length,2);assert.equal(writes[1].ratedPowerKw,123);assert.ok(!Object.hasOwn(writes[1],'capacityKwh'))
  } finally { await browser.close() }
})
