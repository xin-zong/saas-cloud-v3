const { test } = require("node:test")
const assert = require("node:assert/strict")
const { chromium } = require("playwright")
const fs = require("node:fs/promises")
const path = require("node:path")
const preview = process.env.ALARM_PREVIEW_URL || "http://127.0.0.1:8444"
async function setup(t, globalScope = false) {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  t.after(() => browser.close())
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  })
  page.setDefaultTimeout(15000)
  const state = {
    writes: [],
    reads: [],
    rules: [],
    errors: [],
    read: false,
    conflict: false,
    alarm: {
      id: 17,
      station_id: 9,
      station_name: "验收站点",
      device_id: 19,
      device_name: "BMS验收设备",
      code: "TEMP",
      title: "温度超限",
      source: "device",
      severity: "warning",
      occurred_at: "2026-10-17T00:00:00Z",
      lifecycle: "active",
      effective_recovered_at: null,
      closed_at: null,
      acknowledged_at: null,
      version: 1,
      read_flag: false,
      events: [],
      notes: [],
      sampleStatus: "暂无测点数据",
    },
  }
  page.on("pageerror", (e) => state.errors.push(e.message))
  await page.route(
    /fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,
    (r) => r.abort(),
  )
  await page.route("**/src/auth/AuthContext.tsx*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: "export function useAuth(){return {user:window.__alarmUser}}",
    }),
  )
  await page.route("**/src/main.tsx*", async (r) => {
    const source = await (await r.fetch()).text(),
      react = source.match(/["']([^"']*\/react\.js\?v=[^"']+)["']/)?.[1],
      dom = source.match(
        /["']([^"']*\/react-dom_client\.js\?v=[^"']+)["']/,
      )?.[1]
    assert.ok(react && dom)
    await r.fulfill({
      contentType: "text/javascript",
      body: `import React from '${react}';import ReactDOM from '${dom}';import Component from '/src/components/AlarmWorkspacePage.tsx';import '/src/index.css';window.__alarmUser={id:'7',permissions:['alarm.read','alarm.handle','workorder.create','workorder.handle'],stationPermissions:{'9':['alarm.read','alarm.handle','workorder.create','workorder.handle'],'10':['alarm.read','alarm.handle','workorder.create','workorder.handle']}};function Harness(){const[station,setStation]=React.useState('9');const[,force]=React.useState(0);window.__setStation=setStation;window.__revoke=()=>{window.__alarmUser={...window.__alarmUser,stationPermissions:{}};force(n=>n+1)};return React.createElement(Component,{stationId:${globalScope ? 'undefined' : 'station'},stations:[{id:'9',name:'验收站点'},{id:'10',name:'另一站点'}]})};ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));`,
    })
  })
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (r) => {
      const req = r.request(),
        method = req.method(),
        url = new URL(req.url()),
        p = url.pathname.slice(4),
        body = req.postData() ? req.postDataJSON() : null
      const reply = (data, status = 200, msg = "ok") =>
        r.fulfill({
          status,
          headers: { "access-control-allow-origin": "*" },
          json: { code: status, data, msg },
        })
      if (method === "OPTIONS")
        return r.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
            "access-control-allow-headers": "content-type,authorization",
          },
        })
      if (method !== "GET") state.writes.push({ p, method, body })
      else state.reads.push(url.pathname + url.search)
      if (p === "/work-orders" && method === "POST") return reply({id: 99})
      if (p === "/alarms/workspace") {
        const show = url.searchParams.get("view") !== "history"
        return reply({
          items: show ? [{ ...state.alarm, read_flag: state.read }] : [],
          total: show ? 1 : 0,
          limit: 20,
          offset: 0,
        })
      }
      if (p === "/alarms/workspace/17")
        return reply({ ...state.alarm, read_flag: state.read })
      if (p === "/alarms/workspace/read") {
        state.read = true
        return reply({ ids: body.ids })
      }
      if (p === "/alarms/workspace/17/close") {
        if (state.conflict)
          return reply(null, 409, "告警已被其他人更新，请刷新")
        state.alarm.closed_at = "2026-10-17T01:00:00Z"
        state.alarm.lifecycle = "closed"
        state.alarm.version++
        return reply({ id: 17, version: state.alarm.version })
      }
      if (p === "/alarm-rules/options")
        return reply({
          devices: [{ id: 19, name: "BMS验收设备" }],
          recipients: [{ id: 7, display_name: "验收用户" }],
        })
      if (p === "/alarm-rules" && method === "GET") return reply(state.rules)
      if (p === "/alarm-rules" && method === "POST") {
        const row = {
          id: 3,
          station_id: body.stationId,
          station_name: "验收站点",
          name: body.name,
          object_type: body.objectType,
          device_id: body.deviceId,
          severity: body.severity,
          conditions: body.conditions,
          effective_start: body.effectiveStart,
          effective_end: body.effectiveEnd,
          recovery_duration: body.recoveryDuration,
          solution: body.solution,
          notification: body.notification,
          enabled: true,
          version: 1,
          evaluationStatus: "unavailable",
          evaluationReason: "采样执行契约尚未明确",
          deliveryStatus: "not_connected",
        }
        state.rules.push(row)
        return reply(row)
      }
      if (p === "/alarm-rules/3/enabled") {
        assert.equal(body.expectedVersion, state.rules[0].version)
        state.rules[0].enabled = body.enabled
        state.rules[0].version++
        return reply(state.rules[0])
      }
      if (p === "/alarm-rules/3/history")
        return reply([
          {
            id: 1,
            action: "create",
            version: 1,
            occurred_at: "2026-10-17T00:00:00Z",
          },
        ])
      return reply([])
    },
  )
  await page.goto(preview, { waitUntil: "domcontentloaded" })
  await page.getByRole("button", { name: "事件详情 →", exact: true }).waitFor()
  return { page, state }
}
test(
  "live detail records personal reading independently and stale close remains visible",
  { timeout: 90000 },
  async (t) => {
    const { page, state } = await setup(t)
    assert.equal(state.writes.length, 0)
    await page.getByRole("button", { name: "事件详情 →", exact: true }).click()
    const detail = page.getByRole("dialog", { name: "告警详情", exact: true })
    await detail.getByText("个人阅读：已读", { exact: false }).waitFor()
    assert.deepEqual(
      state.writes.map((w) => w.p),
      ["/alarms/workspace/read"],
    )
    assert.equal(state.alarm.acknowledged_at, null)
    state.conflict = true
    await detail.getByRole("button", { name: "人工关闭", exact: true }).click()
    await detail.getByLabel("告警处理说明").fill("现场排查")
    await detail.getByRole("button", { name: "确认提交", exact: true }).click()
    await detail.getByRole("alert").filter({ hasText: "其他人更新" }).waitFor()
    assert.equal(state.alarm.lifecycle, "active")
    assert.deepEqual(state.writes[1].body, {
      expectedVersion: 1,
      note: "现场排查",
    })
    assert.deepEqual(state.errors, [])
    const dir = path.resolve(
      __dirname,
      "../../.superpowers/sdd/2026-10-17-monitor-device-alarm",
    )
    await fs.mkdir(dir, { recursive: true })
    await page.screenshot({
      path: path.join(dir, "task3-alarm-detail.png"),
      fullPage: true,
    })
  },
)
test(
  "rule config saves conditions and notification then independent toggle uses exact version",
  { timeout: 90000 },
  async (t) => {
    const { page, state } = await setup(t)
    await page.getByRole("button", { name: "规则管理", exact: true }).click()
    await page.getByRole("button", { name: "新增规则", exact: true }).click()
    const dialog = page.getByRole("dialog", {
      name: "新增告警规则",
      exact: true,
    })
    await dialog.getByLabel("规则名称", { exact: true }).fill("温度规则")
    await dialog.getByLabel("设备", { exact: true }).selectOption("19")
    await dialog.getByLabel("条件1指标1", { exact: true }).fill("temperature")
    await dialog.getByLabel("条件1指标1单位", { exact: true }).fill("°C")
    await dialog.getByLabel("阈值 / 下界", { exact: true }).fill("50")
    await dialog.getByRole("button", { name: "保存规则", exact: true }).click()
    await page.getByText("温度规则", { exact: true }).waitFor()
    assert.equal(state.rules[0].conditions[0].lower, 50)
    assert.equal(state.rules[0].notification.needed, false)
    await page.getByRole("button", { name: "停用", exact: true }).click()
    await page.getByRole("cell").filter({ hasText: "已停用配置" }).waitFor()
    assert.equal(state.rules[0].version, 2)
    assert.equal(state.rules[0].enabled, false)
    await page.getByRole("button", { name: "详情", exact: true }).click()
    await page
      .getByRole("dialog", { name: "规则详情", exact: true })
      .getByText("采样执行契约尚未明确", { exact: true })
      .waitFor()
    assert.deepEqual(state.errors, [])
  },
)

async function settle(page) { await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))) }
function rule(id,station,name) { return {id,station_id:station,station_name:name,name,object_type:'DEVICE',device_id:19,severity:'warning',conditions:[],effective_start:0,effective_end:1440,recovery_duration:0,solution:'',notification:{needed:false,maxCount:1,channels:[],recipients:[],recoveryNotice:false},enabled:true,version:1,evaluationStatus:'unavailable',evaluationReason:'待接入',deliveryStatus:'not_connected'} }
test('late alarm detail after tab or station change never reopens old resource or marks it read',{timeout:90000},async t=>{
 const {page,state}=await setup(t);let release,arrived;const hold=new Promise(r=>release=r),requested=new Promise(r=>arrived=r);
 await page.route(url=>url.pathname==='/api/alarms/workspace/17',async r=>{arrived();await hold;await r.fulfill({json:{code:0,data:{...state.alarm}}})});
 await page.getByRole('button',{name:'事件详情 →',exact:true}).click();await requested;await page.getByRole('button',{name:'历史告警',exact:true}).click();await page.evaluate(()=>window.__setStation('10'));await page.getByText('当前条件下暂无告警',{exact:true}).waitFor();const completed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/alarms/workspace/17');release();await completed;await settle(page);assert.equal(await page.getByRole('dialog',{name:'告警详情',exact:true}).count(),0);assert.equal(state.writes.length,0);
});
test('rule list scope and detail history discard old responses and revoke clears editors',{timeout:90000},async t=>{
 const {page,state}=await setup(t,true);let releaseA,arrivedA;const holdA=new Promise(r=>releaseA=r),requestA=new Promise(r=>arrivedA=r);
 const a=rule(31,9,'旧站规则'),b=rule(32,10,'当前站规则');
 await page.route(url=>url.pathname==='/api/alarm-rules',async r=>{const scope=new URL(r.request().url()).searchParams.get('stationId');if(scope==='9'){arrivedA();await holdA;return r.fulfill({json:{code:0,data:[a]}})}return r.fulfill({json:{code:0,data:scope==='10'?[b]:[a,b]}})});
 await page.getByRole('button',{name:'规则管理',exact:true}).click();const filter=page.getByLabel('规则站点筛选');await filter.selectOption('9');await requestA;await filter.selectOption('10');await page.getByRole('cell',{name:'当前站规则',exact:true}).waitFor();const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/alarm-rules'&&new URL(r.url()).searchParams.get('stationId')==='9');releaseA();await response;await settle(page);assert.equal(await page.getByRole('cell',{name:'旧站规则',exact:true}).count(),0);
 await filter.selectOption('');await page.getByRole('cell',{name:'旧站规则',exact:true}).waitFor();let releaseHistory,arrivedHistory;const holdHistory=new Promise(r=>releaseHistory=r),historyRequest=new Promise(r=>arrivedHistory=r);
 await page.route(url=>url.pathname==='/api/alarm-rules/31/history',async r=>{arrivedHistory();await holdHistory;return r.fulfill({json:{code:0,data:[{id:31,action:'旧站专属动作',version:1,occurred_at:'2026-10-17'}]}})});
 await page.route(url=>url.pathname==='/api/alarm-rules/32/history',r=>r.fulfill({json:{code:0,data:[{id:32,action:'当前专属动作',version:1,occurred_at:'2026-10-17'}]}}));
 await page.getByRole('row').filter({hasText:'旧站规则'}).getByRole('button',{name:'详情',exact:true}).click();await historyRequest;await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.getByRole('row').filter({hasText:'当前站规则'}).getByRole('button',{name:'详情',exact:true}).click();await page.getByText(/当前专属动作/).waitFor();const hresponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/alarm-rules/31/history');releaseHistory();await hresponse;await settle(page);assert.equal(await page.getByText(/旧站专属动作/).count(),0);
 await page.evaluate(()=>window.__revoke());await settle(page);assert.equal(await page.getByRole('dialog').count(),0);assert.deepEqual(state.errors,[]);
});
test('revoked rule editor drops pending recipient options and cannot resurrect configuration',{timeout:90000},async t=>{
 const {page,state}=await setup(t);let release,arrived;const hold=new Promise(r=>release=r),requested=new Promise(r=>arrived=r);
 await page.route(url=>url.pathname==='/api/alarm-rules/options',async r=>{arrived();await hold;await r.fulfill({json:{code:0,data:{devices:[{id:19,name:'迟到设备'}],recipients:[{id:7,display_name:'迟到收件人'}]}}})});
 await page.getByRole('button',{name:'规则管理',exact:true}).click();await page.getByRole('button',{name:'新增规则',exact:true}).click();await requested;await page.getByLabel('规则名称',{exact:true}).fill('撤权草稿');await page.evaluate(()=>window.__revoke());await settle(page);assert.equal(await page.getByRole('dialog').count(),0);const completed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/alarm-rules/options');release();await completed;await settle(page);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByText('迟到收件人',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'新增规则',exact:true}).isDisabled(),true);assert.equal(state.writes.length,0);
});

test('late close POST cannot refresh old scope or reopen alarm after switching stations',{timeout:90000},async t=>{
 const {page,state}=await setup(t);await page.getByRole('button',{name:'事件详情 →',exact:true}).click();const dialog=page.getByRole('dialog',{name:'告警详情',exact:true});await dialog.getByText('个人阅读：已读',{exact:false}).waitFor();let release,arrived;const hold=new Promise(r=>release=r),requested=new Promise(r=>arrived=r);
 await page.route(url=>url.pathname==='/api/alarms/workspace/17/close',async r=>{arrived();await hold;return r.fallback()});await dialog.getByRole('button',{name:'人工关闭',exact:true}).click();await dialog.getByLabel('告警处理说明').fill('关闭旧站告警');await dialog.getByRole('button',{name:'确认提交',exact:true}).click();await requested;await page.evaluate(()=>window.__setStation('10'));await settle(page);assert.equal(await page.getByRole('dialog').count(),0);const reads=state.reads.length;const done=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/alarms/workspace/17/close');release();await done;await settle(page);assert.equal(await page.getByRole('dialog').count(),0);assert.equal(state.reads.length,reads);
});
test('late batch-read POST cannot load its former station after context switch',{timeout:90000},async t=>{
 const {page,state}=await setup(t);let release,arrived;const hold=new Promise(r=>release=r),requested=new Promise(r=>arrived=r);await page.route(url=>url.pathname==='/api/alarms/workspace/read',async r=>{arrived();await hold;return r.fallback()});await page.getByRole('checkbox',{name:'选择告警17',exact:true}).check();await page.getByRole('button',{name:/批量标为已读/}).click();await requested;await page.evaluate(()=>window.__setStation('10'));await settle(page);const reads=state.reads.length;const done=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/alarms/workspace/read');release();await done;await settle(page);assert.equal(state.reads.length,reads);assert.equal(await page.getByRole('dialog').count(),0);
});
test('late rule-save POST never clears the draft created in a different station',{timeout:90000},async t=>{
 const {page,state}=await setup(t);await page.getByRole('button',{name:'规则管理',exact:true}).click();await page.getByRole('button',{name:'新增规则',exact:true}).click();let dialog=page.getByRole('dialog',{name:'新增告警规则',exact:true});await dialog.getByLabel('规则名称',{exact:true}).fill('旧站保存');await dialog.getByLabel('设备',{exact:true}).selectOption('19');await dialog.getByLabel('条件1指标1',{exact:true}).fill('temperature');await dialog.getByLabel('阈值 / 下界',{exact:true}).fill('50');let release,arrived;const hold=new Promise(r=>release=r),requested=new Promise(r=>arrived=r);await page.route(url=>url.pathname==='/api/alarm-rules',async r=>{if(r.request().method()!=='POST')return r.fallback();arrived();await hold;return r.fallback()});await dialog.getByRole('button',{name:'保存规则',exact:true}).click();await requested;await page.evaluate(()=>window.__setStation('10'));await page.getByRole('button',{name:'新增规则',exact:true}).and(page.locator(':enabled')).waitFor();await page.getByRole('button',{name:'新增规则',exact:true}).click();dialog=page.getByRole('dialog',{name:'新增告警规则',exact:true});await dialog.getByLabel('规则名称',{exact:true}).fill('新站未保存草稿');const done=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/alarm-rules'&&r.request().method()==='POST');release();await done;await settle(page);assert.equal(await dialog.count(),1);assert.equal(await dialog.getByLabel('规则名称',{exact:true}).inputValue(),'新站未保存草稿');assert.deepEqual(state.errors,[]);
});

test('alarm work order binds the original station alarm and current authorized handler',{timeout:90000},async t=>{
 const {page,state}=await setup(t);await page.getByRole('button',{name:'事件详情 →',exact:true}).click();const dialog=page.getByRole('dialog',{name:'告警详情',exact:true});await dialog.getByText('个人阅读：已读',{exact:false}).waitFor();await dialog.getByRole('button',{name:'创建工单',exact:true}).click();await dialog.getByLabel('工单标题',{exact:true}).fill('告警检查');await dialog.getByLabel('问题描述',{exact:false}).fill('排查BMS温度');await dialog.getByRole('button',{name:'保存工单',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'工单已创建'}).waitFor();const body=state.writes.find(w=>w.p==='/work-orders').body;assert.equal(body.stationId,9);assert.equal(body.alarmId,17);assert.equal(body.assignedTo,7);assert.equal(body.title,'告警检查');assert.equal(body.description,'排查BMS温度');assert.deepEqual(state.errors,[]);
});
test('late alarm work-order POST never clears a new station order draft or shows old success',{timeout:90000},async t=>{
 const {page,state}=await setup(t);await page.getByRole('button',{name:'事件详情 →',exact:true}).click();let dialog=page.getByRole('dialog',{name:'告警详情',exact:true});await dialog.getByText('个人阅读：已读',{exact:false}).waitFor();await dialog.getByRole('button',{name:'创建工单',exact:true}).click();let release,arrived;const hold=new Promise(r=>release=r),requested=new Promise(r=>arrived=r);await page.route(url=>url.pathname==='/api/work-orders',async r=>{arrived();await hold;return r.fallback()});await dialog.getByRole('button',{name:'保存工单',exact:true}).click();await requested;state.alarm.station_id=10;state.alarm.station_name='另一站点';state.alarm.title='新站告警';await page.evaluate(()=>window.__setStation('10'));await settle(page);await page.getByRole('button',{name:'事件详情 →',exact:true}).click();dialog=page.getByRole('dialog',{name:'告警详情',exact:true});await dialog.getByRole('heading',{name:'新站告警',exact:true}).waitFor();await dialog.getByRole('button',{name:'创建工单',exact:true}).click();await dialog.getByLabel('工单标题',{exact:true}).fill('新站保留的工单草稿');const completed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/work-orders');release();await completed;await settle(page);assert.equal(await dialog.getByLabel('工单标题',{exact:true}).count(),1);assert.equal(await dialog.getByLabel('工单标题',{exact:true}).inputValue(),'新站保留的工单草稿');assert.equal(await dialog.getByText('工单已创建，可到工单中心查看',{exact:true}).count(),0);assert.deepEqual(state.errors,[]);
});
