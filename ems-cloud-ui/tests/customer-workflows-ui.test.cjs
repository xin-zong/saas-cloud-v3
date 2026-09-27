const { test } = require("node:test")
const assert = require("node:assert/strict")
const { chromium } = require("playwright")
async function setup(t, config = {}) {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(5000)
  await page.addInitScript(() =>
    sessionStorage.setItem("enerlution-api-token", "customer-test"),
  )
  let customers = []
  let optionFailures = config.optionFailures ?? 0
  let createFailures = config.createFailures ?? 0
  let posts = 0
  const writes = []
  await page.route("http://127.0.0.1:18090/api/**", async (route) => {
    const r = route.request(),
      path = new URL(r.url()).pathname.slice(4)
    let data = [], status = 200, msg = "ok"
    if (path === "/auth/me")
      data = {
        id: "7",
        name: "管理员",
        role: "integrator",
        stationIds: [],
        permissions: config.permissions ?? ["customer.read", "customer.manage"],
      }
    else if (path === "/platform/customers/create-options") {
      if(optionFailures-- > 0){status=503;msg="组织加载暂时失败"}else data = { organizations: [{ id: 2, name: "华东组织" }] }
    }
    else if (path === "/platform/customers" && r.method() === "POST") {
      posts++
      if(createFailures-- > 0){await route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({code:409,msg:"客户名称已存在"})});return}
      const b = r.postDataJSON()
      writes.push(b)
      data = {
        id: 3,
        name: b.name,
        organization_id: b.organizationId,
        entity: b.entity,
        contact: b.contact,
      }
      customers = [
        {
          ...data,
          organization_name: "华东组织",
          station_count: 0,
          can_edit: true,
          stations: [],
        },
      ]
    } else if (path === "/platform/customers") data = customers
    else if (path === "/platform/customers/3") {
      const b = r.postDataJSON()
      writes.push(b)
      customers = customers.map((c) => ({ ...c, ...b }))
      data = customers[0]
    }
    await route.fulfill({
      status, contentType: "application/json",
      body: JSON.stringify({ code: status===200?0:status, msg, data }),
    })
  })
  await page.goto("http://127.0.0.1:8471", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })
  await page.getByRole("button", { name: "平台管理", exact: true }).click()
  return { page, writes, posts:()=>posts }
}
test("create empty-directory customer and reload persisted profile without any station", async (t) => {
  const { page, writes } = await setup(t)
  await page.getByRole("button", { name: "新增客户", exact: true }).click()
  await page.getByLabel("客户名称 *", { exact: true }).fill("新客户")
  await page.getByLabel("客户主体", { exact: true }).fill("主体公司")
  await page.getByLabel("服务联系人", { exact: true }).fill("联系人")
  await capture(page,"customer-create")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await page.getByRole("heading", { name: "新客户", exact: true }).waitFor()
  await capture(page,"customer-detail")
  await page.getByText("主体公司", { exact: true }).waitFor()
  await page.getByText("暂无已授权的关联站点", { exact: true }).waitFor()
  assert.deepEqual(writes[0], {
    name: "新客户",
    organizationId: 2,
    entity: "主体公司",
    contact: "联系人",
  })
  await page.reload({ waitUntil: "domcontentloaded", timeout:60000 })
  await page.getByRole("button", { name: "平台管理", exact: true }).click()
  await page.getByRole("button", { name: "查看详情", exact: true }).click()
  await page.getByText("主体公司", { exact: true }).waitFor()
  await page.getByRole("button", { name: "编辑客户资料" }).click()
  assert.equal(
    await page.getByLabel("服务联系人", { exact: true }).inputValue(),
    "联系人",
  )
  await page.getByLabel("服务联系人", { exact: true }).fill("新联系人")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await page.getByText("新联系人", { exact: true }).waitFor()
  assert.equal(writes.length, 2)
  await page.getByRole("button",{name:"编辑客户资料"}).click()
  await page.getByLabel("服务联系人",{exact:true}).fill("  ")
  await page.getByRole("button",{name:"保存",exact:true}).click()
  await page.getByRole("dialog").waitFor({state:"detached"})
  assert.equal(writes[2].contact,null)
})

const fs = require("node:fs/promises")
const path = require("node:path")
test("station association explicitly assigns and clears, unchanged fields omit customerId", async (t) => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(6000)
  await page.addInitScript(() =>
    sessionStorage.setItem("enerlution-api-token", "station-test"),
  )
  const writes = []
  let station = {
    id: 1,
    name: "关联站点",
    code: "S1",
    customer_id: 3,
    rated_power_kw: 100,
    capacity_kwh: 200,
  }
  await page.route("http://127.0.0.1:18090/api/**", async (route) => {
    const r = route.request(),
      p = new URL(r.url()).pathname.slice(4)
    let data = []
    if (p === "/auth/me")
      data = {
        id: "7",
        name: "管理员",
        role: "integrator",
        stationIds: ["1"],
        permissions: [
          "asset.read",
          "asset.edit",
          "customer.read",
          "customer.manage",
        ],
        stationPermissions: {
          1: ["asset.read", "asset.edit", "customer.read", "customer.manage"],
        },
      }
    else if (p === "/stations") data = [station]
    else if (p === "/platform/customers/options")
      data = {
        can_assign: true,
        customers: [
          { id: 3, name: "原客户" },
          { id: 4, name: "新客户" },
        ],
        current_customer: station.customer_id
          ? {
              id: station.customer_id,
              name: station.customer_id === 3 ? "原客户" : "新客户",
            }
          : null,
        current_customer_restricted: false,
      }
    else if (p === "/stations/1" && r.method() === "PUT") {
      const b = r.postDataJSON()
      writes.push(b)
      station = {
        ...station,
        name: b.name,
        ...(Object.hasOwn(b, "customerId")
          ? { customer_id: b.customerId }
          : {}),
      }
      data = station
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data }),
    })
  })
  await page.goto("http://127.0.0.1:8471", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })
  await page.getByRole("button", { name: "资产与站点", exact: true }).click()
  await page.getByRole("button", { name: "编辑关联站点", exact: true }).click()
  await page.getByLabel("所属客户", { exact: true }).selectOption("4")
  await capture(page,"station-customer-selector")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "已保存编辑" }).waitFor()
  assert.equal(writes[0].customerId, "4")
  await page.getByLabel("所属客户", { exact: true }).selectOption("")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await page.getByRole("status").filter({ hasText: "已保存编辑" }).waitFor()
  assert.equal(writes[1].customerId, null)
  await page.getByLabel("站点名称 *", { exact: true }).fill("改名称")
  await page.getByRole("button", { name: "保存", exact: true }).click()
  await page.waitForTimeout(300)
  assert.equal(Object.hasOwn(writes[2], "customerId"), false)
  await page.getByRole("button",{name:"返回站点列表",exact:true}).click()
  await page.getByRole("button",{name:"编辑改名称",exact:true}).click()
  await page.locator('select[aria-label="所属客户"]').waitFor()
  assert.equal(await page.getByLabel("所属客户",{exact:true}).inputValue(),"")
  await page.getByLabel("所属客户",{exact:true}).selectOption("3")
  await page.route("**/api/platform/customers/options?*",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({code:0,data:{can_assign:false,customers:[],current_customer:null,current_customer_restricted:true}})}))
  await page.getByRole("button",{name:"保存",exact:true}).click()
  await page.getByRole("alert").filter({hasText:"客户关联权限已失效"}).waitFor()
  assert.equal(writes.length,3)
  assert.equal(await page.getByLabel("所属客户",{exact:true}).inputValue(),"当前客户关联受限")
  assert.equal(await page.getByText("原客户",{exact:true}).count(),0)
  await page.getByRole("button",{name:"返回站点列表",exact:true}).click()
  await page.getByRole("button",{name:"不保存离开",exact:true}).click()
  await page.getByRole("button",{name:"编辑改名称",exact:true}).click()
  await page.getByLabel("站点名称 *",{exact:true}).fill("无客户权限保存")
  await page.getByRole("button",{name:"保存",exact:true}).click()
  await page.getByRole("status").filter({hasText:"已保存编辑"}).waitFor()
  assert.equal(Object.hasOwn(writes[3],"customerId"),false)
  await page.getByRole("button",{name:"返回站点列表",exact:true}).click()
  await page.route("**/api/platform/customers/options?*",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({code:503,msg:"客户选项故障"})}))
  await page.getByRole("button",{name:"编辑无客户权限保存",exact:true}).click()
  await page.getByRole("alert").filter({hasText:"客户选项故障"}).waitFor()
  await page.getByLabel("站点名称 *",{exact:true}).fill("故障时保存名称")
  await page.getByRole("button",{name:"保存",exact:true}).click()
  await page.getByRole("status").filter({hasText:"已保存编辑"}).waitFor()
  assert.equal(Object.hasOwn(writes[4],"customerId"),false)

})

test("new-site customer association saves only an isolated local draft and revalidates restored choice", async (t) => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage()
  page.setDefaultTimeout(6000)
  await page.addInitScript(() =>
    sessionStorage.setItem("enerlution-api-token", "new-site-test"),
  )
  let readable = true
  const writes = []
  await page.route("http://127.0.0.1:18090/api/**", async (route) => {
    const r = route.request(),
      p = new URL(r.url()).pathname.slice(4)
    if (["POST", "PUT", "DELETE"].includes(r.method())) writes.push(p)
    let data = []
    if (p === "/auth/me")
      data = {
        id: "7",
        name: "管理员",
        role: "integrator",
        stationIds: ["1"],
        permissions: [
          "asset.read",
          "asset.edit",
          "customer.read",
          "customer.manage",
        ],
        stationPermissions: {
          1: ["asset.read", "asset.edit", "customer.read", "customer.manage"],
        },
      }
    else if (p === "/stations") data = [{ id: 1, name: "站点", code: "S1" }]
    else if (p === "/platform/customers")
      data = readable
        ? [
            { id: 3, name: "可选客户", can_edit: true },
            { id: 4, name: "只读客户", can_edit: false },
          ]
        : []
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ code: 0, data }),
    })
  })
  await page.goto("http://127.0.0.1:8471", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })
  await page.getByRole("button", { name: "资产与站点", exact: true }).click()
  await page.getByRole("button", { name: "＋ 新增站点", exact: true }).click()
  await page.getByLabel("所属客户", { exact: true }).selectOption("3")
  assert.equal(
    await page
      .getByLabel("所属客户", { exact: true })
      .getByRole("option", { name: "只读客户" })
      .count(),
    0,
  )
  await page.getByRole("button", { name: "保存草稿", exact: true }).click()
  const draft = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("enerlution_station_provision_v1:api:7:new"),
    ),
  )
  assert.equal(draft.customerId, "3")
  assert.equal(writes.length, 0)
  readable = false
  await page.reload({ waitUntil: "domcontentloaded", timeout:60000 })
  await page.getByRole("button", { name: "资产与站点", exact: true }).click()
  await page.getByRole("button", { name: "＋ 新增站点", exact: true }).click()
  await page.getByLabel("所属客户", { exact: true }).waitFor()
  assert.equal(await page.getByText("可选客户", { exact: true }).count(), 0)
  assert.equal(
    await page.getByLabel("所属客户", { exact: true }).inputValue(),
    "",
  )
  assert.equal(writes.length, 0)
})

const artifacts=path.resolve(__dirname,"../../.superpowers/sdd/2026-09-27-customer-workflows/screenshots")
async function capture(page,name){await page.locator("img:visible").evaluateAll(images=>Promise.all(images.map(image=>image.decode().catch(()=>{}))));if(name==="station-customer-selector"){const assets=await page.locator(".station-editor img:visible").evaluateAll(images=>images.map(image=>({src:image.getAttribute("src"),loaded:image.complete&&image.naturalWidth>0,width:image.getBoundingClientRect().width,height:image.getBoundingClientRect().height})));for(const asset of assets)assert.equal(asset.loaded&&asset.width>0&&asset.height>0,true,`loaded ${asset.src}`)}await fs.mkdir(artifacts,{recursive:true});for(const width of [1366,1440,1920]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(artifacts,`${name}-${width}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}}
test("customer creation retries options and duplicate errors while preserving input and dirty focus",async t=>{const {page,posts}=await setup(t,{optionFailures:1,createFailures:1});await page.getByRole("button",{name:"新增客户",exact:true}).click();await page.getByRole("alert").filter({hasText:"组织加载暂时失败"}).waitFor();await page.getByRole("button",{name:"重试加载组织"}).click();await page.getByLabel("客户名称 *",{exact:true}).fill("重复客户");await page.getByRole("button",{name:"保存",exact:true}).click();await page.getByRole("alert").filter({hasText:"客户名称已存在"}).waitFor();assert.equal(await page.getByLabel("客户名称 *",{exact:true}).inputValue(),"重复客户");assert.equal(posts(),1);await page.getByLabel("客户名称 *",{exact:true}).fill("可用客户");await page.keyboard.press("Escape");await page.getByRole("button",{name:"继续编辑",exact:true}).click();assert.equal(await page.getByLabel("客户名称 *",{exact:true}).inputValue(),"可用客户");await page.getByRole("button",{name:"保存",exact:true}).click();await page.getByRole("heading",{name:"可用客户",exact:true}).waitFor();assert.equal(posts(),2)});
test("customer reader has no creation entry or organization options request",async t=>{const {page}=await setup(t,{permissions:["customer.read"]});await page.getByText("当前条件下暂无客户",{exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"新增客户",exact:true}).count(),0)});
for (const flow of ['station', 'new-site']) {
  test(`${flow} delayed customer retry cannot restore names after customer-only revocation`, async t => {
    const browser = await chromium.launch({channel:'msedge',headless:true})
    t.after(() => browser.close())
    const page = await browser.newPage()
    page.setDefaultTimeout(6000)
    await page.addInitScript(() => sessionStorage.setItem('enerlution-api-token','held-customer'))
    let revoked = false, retryRequested = false, heldRoute
    let releaseHeld, markHeldStarted
    const heldStarted = new Promise(resolve => { markHeldStarted = resolve })
    const held = new Promise(resolve => { releaseHeld = resolve })
    const writes = []
    await page.route('http://127.0.0.1:18090/api/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname.slice(4)
      let data = [], status = 200, msg = 'ok', headers = {}
      if (['POST','PUT','DELETE'].includes(request.method())) writes.push(pathname)
      if (pathname === '/auth/me') {
        const permissions = revoked ? ['asset.read','asset.edit'] : ['asset.read','asset.edit','customer.read','customer.manage']
        data = {id:'7',name:'管理员',role:'integrator',stationIds:['1'],permissions,stationPermissions:{1:permissions},organizationPermissions:{}}
      } else if (pathname === '/stations') data = [{id:1,name:'异步站点',code:'S1',customer_id:3}]
      else if (pathname === (flow === 'station' ? '/platform/customers/options' : '/platform/customers')) {
        if (!retryRequested) {status=503;msg='首次客户选项失败'}
        else if (!revoked) {
          heldRoute = route
          markHeldStarted()
          await held
          headers = {'x-customer-regression':'held'}
          data = flow === 'station' ? {can_assign:true,customers:[{id:3,name:'延迟返回的客户'}],current_customer:{id:3,name:'延迟返回的客户'},current_customer_restricted:false} : [{id:3,name:'延迟返回的客户',can_edit:true}]
        } else data = flow === 'station' ? {can_assign:false,customers:[],current_customer:null,current_customer_restricted:true} : []
      }
      await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify({code:status===200?0:status,msg,data})})
    })
    await page.goto('http://127.0.0.1:8471',{waitUntil:'domcontentloaded',timeout:60000})
    await page.getByRole('button',{name:'资产与站点',exact:true}).click()
    await page.getByRole('button',{name:flow === 'station' ? '编辑异步站点' : '＋ 新增站点',exact:true}).click()
    await page.getByRole('alert').filter({hasText:'首次客户选项失败'}).waitFor()
    retryRequested = true
    await page.getByRole('button',{name:'重试加载客户',exact:true}).click()
    await heldStarted
    assert.ok(heldRoute,'retry request is held before revocation')
    revoked = true
    const refresh = page.waitForResponse(response => response.url().endsWith('/auth/me'))
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await refresh
    if (flow === 'station') await page.getByLabel('所属客户',{exact:true}).filter({visible:true}).waitFor()
    await page.waitForFunction(flow => flow === 'station' ? document.querySelector('input[aria-label="所属客户"]')?.value === '当前客户关联受限' : document.querySelector('select[aria-label="所属客户"]')?.disabled, flow)
    const oldResponse = page.waitForResponse(response => response.headers()['x-customer-regression'] === 'held')
    releaseHeld()
    await (await oldResponse).finished()
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.equal(await page.getByText('延迟返回的客户',{exact:true}).count(),0)
    if (flow === 'station') assert.equal(await page.getByLabel('所属客户',{exact:true}).inputValue(),'当前客户关联受限')
    else assert.equal(await page.getByLabel('所属客户',{exact:true}).isDisabled(),true)
    assert.equal(writes.length,0)
  })
}
