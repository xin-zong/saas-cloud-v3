const test = require("node:test"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright")
test(
  "topology supports pointer dragging, port wiring, zoom and accessible fullscreen",
  { timeout: 150000 },
  async () => {
    const browser = await chromium.launch({ channel: "msedge", headless: true })
    try {
      const page = await browser.newPage({
        viewport: { width: 1540, height: 1100 },
      })
      page.setDefaultTimeout(12000)
      page.setDefaultNavigationTimeout(60000)
      const errors = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.addInitScript(() => {
        sessionStorage.setItem("enerlution-api-token", "canvas-test")
        if(localStorage.getItem("enerlution_station_provision_v1:api:7:new"))return
        const defaults = {
          model: "",
          rating: "",
          voltage: "",
          protocol: "Modbus TCP",
          interface: "ETH1",
          ip: "",
          port: "502",
          address: "1",
          bus: "",
          baud: "9600",
          parity: "无校验",
          bits: "8 / 1",
          enabled: true,
        }
        const devices = [
          {
            ...defaults,
            id: "grid",
            type: "电网",
            code: "GRID01",
            name: "公共电网",
            x: 50,
            y: 15,
          },
          {
            ...defaults,
            id: "pcs",
            type: "PCS",
            code: "PCS01",
            name: "储能变流器",
            x: 50,
            y: 45,
          },
          {
            ...defaults,
            id: "battery",
            type: "电池 / BMS",
            code: "BAT01",
            name: "电池系统",
            x: 50,
            y: 75,
          },
          {
            ...defaults,
            id: "ems",
            type: "EMS",
            code: "EMS01",
            name: "EMS",
            ports: [
              {
                id: "ETH1",
                kind: "ETH",
                interface: "ETH1",
                protocol: "Modbus TCP",
                role: "客户端 / 主站",
                ip: "",
                port: "502",
                address: "1",
                version: "",
                targets: [],
              },
            ],
          },
        ]
        localStorage.setItem(
          "enerlution_station_provision_v1:api:7:new",
          JSON.stringify({
            schema: 1,
            template: "自定义空白拓扑",
            name: "画布验收",
            code: "CANVAS",
            organization: "测试组织",
            region: "欧洲",
            type: "工商业储能",
            timezone: "Europe/Berlin",
            address: "Berlin",
            imageUrl: "",
            ratedPower: "100",
            storageCapacity: "200",
            devices,
            buses: [],
            connections: [],
            version: 3,
          }),
        )
      })
      await page.route(
        /^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,
        async (route) => {
          let data = []
          if (new URL(route.request().url()).pathname === "/api/auth/me")
            data = {
              id: "7",
              name: "画布测试",
              tenantName: "测试企业",
              tenant: {
                actorId: 7,
                tenantId: 2,
                kind: "enterprise",
                administrator: true,
              },
              menus: [
                {
                  id: 1,
                  client: "web",
                  kind: "page",
                  path: "assets",
                  children: [],
                },
              ],
              roleNames: ["Admin"],
              stationIds: [],
              permissions: ["asset.read", "asset.edit"],
              stationPermissions: {},
            }
          await route.fulfill({ json: { code: 200, data } })
        },
      )
      await page.goto(process.env.API_PREVIEW_URL || "http://127.0.0.1:8461/", {
        waitUntil: "domcontentloaded",
      })
      await page
        .getByRole("navigation", { name: "一级导航" })
        .getByRole("button", { name: "电站管理", exact: true })
        .click()
      await page
        .getByRole("button", { name: "继续本地建站草稿", exact: true })
        .click()
      await page.getByRole("button", { name: "下一步", exact: true }).click()
      const card = page.locator('[data-canvas-node="pcs"]'),
        before = await card.boundingBox()
      assert.ok(before)
      await page.mouse.move(before.x + before.width / 2, before.y + 20)
      await page.mouse.down()
      await page.mouse.move(before.x + before.width / 2 + 70, before.y + 50, {
        steps: 8,
      })
      await page.mouse.up()
      const after = await card.boundingBox()
      assert.ok(after.x - before.x > 60)
      assert.ok(after.y - before.y > 20)
      const resize = page.getByRole("button", {
          name: "调整 PCS01 尺寸",
          exact: true,
        }),
        rs = await resize.boundingBox(),
        oldSize = await card.boundingBox()
      await page.mouse.move(rs.x + rs.width / 2, rs.y + rs.height / 2)
      await page.mouse.down()
      await page.mouse.move(
        rs.x + rs.width / 2 + 30,
        rs.y + rs.height / 2 + 12,
        { steps: 6 },
      )
      await page.mouse.up()
      assert.ok((await card.boundingBox()).width - oldSize.width > 45)
      await page.getByRole("button", { name: "撤销", exact: true }).click()
      assert.ok(Math.abs((await card.boundingBox()).width - oldSize.width) < 2)
      await page.getByRole("button", { name: "重做", exact: true }).click()
      assert.ok((await card.boundingBox()).width - oldSize.width > 45)
      const a = page.getByRole("button", {
          name: "GRID01 AC 端口",
          exact: true,
        }),
        b = page.getByRole("button", { name: "PCS01 AC 端口", exact: true })
      const pa = await a.boundingBox(),
        pb = await b.boundingBox()
      await page.mouse.move(pa.x + pa.width / 2, pa.y + pa.height / 2)
      await page.mouse.down()
      await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2, {
        steps: 10,
      })
      await page.mouse.up()
      assert.equal(await page.locator(".topo-wires path").count(), 1)
      await page.screenshot({
        path: "../.topology-canvas-electrical.png",
        fullPage: true,
      })
      await page.getByRole("button", { name: "通信拓扑", exact: true }).click()
      await page
        .getByRole("button", { name: "EMS01 ETH1 端口", exact: true })
        .click()
      await page
        .getByRole("button", { name: "PCS01 ETH1 端口", exact: true })
        .click()
      assert.equal(await page.locator(".topo-wires path").count(), 1)
      await page.getByRole("button", { name: "展开画布", exact: true }).click()
      await page.getByRole("dialog", { name: "拓扑全屏编辑" }).waitFor()
      const fullBefore=await card.boundingBox();await page.mouse.move(fullBefore.x+fullBefore.width/2,fullBefore.y+20);await page.mouse.down();await page.mouse.move(fullBefore.x+fullBefore.width/2+44,fullBefore.y+44,{steps:6});await page.mouse.up();const fullAfter=await card.boundingBox();assert.ok(Math.abs(fullAfter.x-fullBefore.x-44)<3);assert.ok(Math.abs(fullAfter.y-fullBefore.y-24)<3);
      await page.screenshot({
        path: "../.topology-canvas-fullscreen.png",
        fullPage: true,
      })
      assert.equal(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      )
      await page.keyboard.press("Escape")
      assert.equal(
        await page.getByRole("dialog", { name: "拓扑全屏编辑" }).count(),
        0,
      )
      const viewport = page.getByTestId("topology-canvas"),
        vbox = await viewport.boundingBox(),
        zoomBefore = await page
          .getByRole("button", { name: "重置缩放", exact: true })
          .innerText()
      await page.mouse.move(vbox.x + vbox.width / 2, vbox.y + vbox.height / 2)
      await page.mouse.wheel(0, -180)
      await page.waitForTimeout(100)
      assert.notEqual(
        await page
          .getByRole("button", { name: "重置缩放", exact: true })
          .innerText(),
        zoomBefore,
      )
      const panBefore = await card.boundingBox()
      await page.mouse.move(vbox.x + vbox.width - 40, vbox.y + vbox.height - 60)
      await page.mouse.down()
      await page.mouse.move(
        vbox.x + vbox.width - 10,
        vbox.y + vbox.height - 40,
        { steps: 5 },
      )
      await page.mouse.up()
      assert.ok((await card.boundingBox()).x - panBefore.x > 25)
      const scaledBefore=await card.boundingBox();await page.mouse.move(scaledBefore.x+scaledBefore.width/2,scaledBefore.y+20);await page.mouse.down();await page.mouse.move(scaledBefore.x+scaledBefore.width/2+52,scaledBefore.y+40,{steps:6});await page.mouse.up();assert.ok(Math.abs((await card.boundingBox()).x-scaledBefore.x-52)<3)
      const countBefore = await page.locator("[data-canvas-node]").count()
      await page
        .locator('.topo-library [draggable="true"]')
        .filter({ hasText: "电网侧电表" })
        .dragTo(viewport, { targetPosition: { x: 240, y: 280 } })
      assert.equal(
        await page.locator("[data-canvas-node]").count(),
        countBefore + 1,
      )
      await page.getByRole("button", { name: "保存草稿", exact: true }).click()
      const saved = await page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("enerlution_station_provision_v1:api:7:new"),
        ),
      )
      assert.equal(saved.connections.length, 1)
      assert.equal(saved.connections[0].fromPort,"ac");assert.equal(saved.connections[0].toPort,"ac")
      assert.equal(saved.devices.find((n) => n.id === "pcs").emsId, "ems")
      assert.ok(saved.devices.find((n) => n.id === "pcs").x > 50)
      assert.deepEqual(errors, [])
      await page.getByRole("button", { name: "适应画布", exact: true }).click()
      assert.equal(
        await page
          .locator('img[src*="topology-current"]')
          .evaluateAll((images) =>
            images.every((img) => img.complete && img.naturalWidth > 0),
          ),
        true,
      )
      await page.screenshot({
        path: "../.topology-canvas-verified.png",
        fullPage: true,
      })

      await page.evaluate(()=>{const key='enerlution_station_provision_v1:api:7:new',d=JSON.parse(localStorage.getItem(key)),base=d.devices.find(n=>n.id==='grid');d.devices.find(n=>n.id==='battery').cooling=true;d.devices.find(n=>n.id==='battery').coolingConfiguration={nodeId:'TMS_STABLE',name:'液冷测试',enabled:true,access:'设备转发',forwardDeviceId:'battery',controlPermission:'collect',commX:74,commY:68};d.devices.push({...base,id:'gen',type:'柴油发电机',code:'GEN01',name:'柴油发电机',x:18,y:16},{...base,id:'ats',type:'ATS',code:'ATS01',name:'双电源切换',x:36,y:36});localStorage.setItem(key,JSON.stringify(d))});
      await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('navigation',{name:'一级导航'}).getByRole('button',{name:'电站管理',exact:true}).click();await page.getByRole('button',{name:'继续本地建站草稿',exact:true}).click();await page.getByRole('button',{name:'下一步',exact:true}).click();
      assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('enerlution_station_provision_v1:api:7:new')).devices.find(n=>n.id==='pcs').width),saved.devices.find(n=>n.id==='pcs').width);assert.ok(Math.abs(await page.locator('[data-canvas-node="pcs"]').evaluate(el=>Number.parseFloat(el.style.width))-saved.devices.find(n=>n.id==='pcs').width)<.001);
      const genPort=await page.getByRole('button',{name:'GEN01 AC 端口',exact:true}).boundingBox(),atsPort=await page.getByRole('button',{name:'ATS01 电源 A 端口',exact:true}).boundingBox();await page.mouse.move(genPort.x+genPort.width/2,genPort.y+genPort.height/2);await page.mouse.down();await page.mouse.move(atsPort.x+atsPort.width/2,atsPort.y+atsPort.height/2,{steps:8});await page.mouse.up();
      await page.locator('[data-canvas-node="battery"] .topo-card-body').click();await page.locator('[data-device-field="battery:tms:name"]').fill('液冷系统已编辑');await page.getByRole('button',{name:'通信拓扑',exact:true}).click();await page.locator('[data-canvas-node="battery:tms"] .topo-card-body').click();assert.equal(await page.locator('[data-device-field="battery:tms:code"]').inputValue(),'TMS_STABLE');await page.getByRole('button',{name:'EMS01 ETH1 端口',exact:true}).click();await page.locator('[data-port-node="battery:tms"][data-port="IN"]').click();await page.locator('[data-device-field="battery:tms:ip"]').fill('10.0.1.8');await page.getByRole('button',{name:'撤销',exact:true}).click();assert.notEqual(await page.locator('[data-device-field="battery:tms:ip"]').inputValue(),'10.0.1.8');await page.getByRole('button',{name:'重做',exact:true}).click();assert.equal(await page.locator('[data-device-field="battery:tms:ip"]').inputValue(),'10.0.1.8');await page.getByRole('button',{name:'保存草稿',exact:true}).click();const final=await page.evaluate(()=>JSON.parse(localStorage.getItem('enerlution_station_provision_v1:api:7:new')));const atsWire=final.connections.find(e=>e.to==='ats');assert.equal(atsWire.fromPort,'ac');assert.equal(atsWire.toPort,'sourceA');assert.equal(final.devices.find(n=>n.id==='battery').coolingConfiguration.nodeId,'TMS_STABLE');assert.equal(final.devices.find(n=>n.id==='battery').coolingConfiguration.name,'液冷系统已编辑');assert.equal(final.devices.find(n=>n.id==='battery').coolingConfiguration.ip,'10.0.1.8');assert.deepEqual(errors,[]);await page.screenshot({path:'../.topology-contract-nested-verified.png',fullPage:true});
    } finally {
      await browser.close()
    }
  },
)
