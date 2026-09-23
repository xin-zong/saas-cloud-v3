const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")
const { chromium } = require("playwright")

const url = process.env.PREVIEW_URL || "http://localhost:8443/"
const artifacts = path.resolve(__dirname, "../.figma/roles")

const ACCOUNTS = {
  owner: {
    account: "owner@enerlution.cn",
    password: "Demo@2026",
    mfa: "",
  },
  operator: {
    account: "operator@enerlution.cn",
    password: "Demo@2026",
    mfa: "246810",
  },
  integrator: {
    account: "integrator@enerlution.cn",
    password: "Demo@2026",
    mfa: "246810",
  },
}

async function openPage(browser, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({
    viewport,
    timezoneId: "Asia/Shanghai",
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  await page.route(
    /fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,
    (route) => route.abort(),
  )
  return { context, page }
}

async function login(page, role) {
  const account = ACCOUNTS[role]
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page
    .getByRole("textbox", { name: "登录账号", exact: true })
    .fill(account.account)
  await page.getByLabel("密码", { exact: true }).fill(account.password)
  await page.getByRole("button", { name: "登录", exact: true }).click()

  if (account.mfa) {
    await page.getByLabel("动态验证码", { exact: true }).fill(account.mfa)
    await page
      .getByRole("button", { name: "完成验证", exact: true })
      .click()
  }

  await page.locator(".workspace-sidebar").waitFor()
  assert.equal(
    await page.locator(".workspace-account").getAttribute("data-role-account"),
    role,
  )
}

function primaryNav(page) {
  return page.getByRole("navigation", {
    name: "一级导航",
    exact: true,
  })
}

async function assertResponsiveShell(page, name) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({
      width,
      height: width < 600 ? 844 : 1000,
    })
    const geometry = await page.evaluate(() => {
      const shell = document.querySelector(".workspace-shell")
      return {
        bodyWidth: document.body.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        shellWidth: shell?.clientWidth ?? 0,
        shellScrollWidth: shell?.scrollWidth ?? 0,
      }
    })
    assert.ok(
      geometry.bodyScrollWidth <= geometry.bodyWidth + 1,
      `${name} ${width}: body ${JSON.stringify(geometry)}`,
    )
    assert.ok(
      geometry.shellScrollWidth <= geometry.shellWidth + 1,
      `${name} ${width}: shell ${JSON.stringify(geometry)}`,
    )
    await page.screenshot({
      path: path.join(artifacts, `${name}-${width}.png`),
      animations: "disabled",
    })
  }
}

async function assertOverviewMap(page, role) {
  await primaryNav(page).getByRole("button", { name: "总览", exact: true }).click()
  const map = page.locator(".leaflet-container").first()
  await map.waitFor({ state: "visible" })
  await page.waitForFunction(
    () => document.querySelectorAll(".leaflet-container .leaflet-tile").length > 4,
  )
  const geometry = await map.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { width: bounds.width, height: bounds.height }
  })
  assert.ok(geometry.width > 100, `${role}: map width ${geometry.width}`)
  assert.ok(geometry.height > 100, `${role}: map height ${geometry.height}`)
  assert.equal(await page.locator(".leaflet-marker-icon").count(), 2)
}

async function logout(page) {
  await page
    .locator(".workspace-account")
    .getByRole("button", { name: "退出登录", exact: true })
    .click()
  await page.locator(".auth-page").waitFor()
}

test("owner role: login, asset revenue, reports, session restore and logout", { timeout: 180000 }, async () => {
  await fs.mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const { context, page } = await openPage(browser)
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await login(page, "owner")
    assert.deepEqual(await primaryNav(page).getByRole("button").allTextContents(), [
      "总览",
      "资产与站点",
      "运营中心",
      "分析与报告",
      "设置",
    ])
    for (const hidden of ["运维中心", "工单与审批", "平台管理"]) {
      assert.equal(await primaryNav(page).getByRole("button", { name: hidden, exact: true }).count(), 0)
    }

    await assertResponsiveShell(page, "owner-overview")
    await page.getByRole("button", { name: "资产与站点", exact: true }).click()
    assert.match(
      await page.locator(".assets-workspace table thead").innerText(),
      /累计收益/,
    )
    assert.equal(await page.getByRole("button", { name: "新增站点", exact: true }).count(), 0)

    await page.getByText("苏州园区站", { exact: true }).first().click()
    const stationNav = page.getByRole("navigation", { name: "站点二级导航" })
    assert.deepEqual(await stationNav.getByRole("button").allTextContents(), [
      "站点概览",
      "运营收益",
      "告警信息",
      "运行曲线",
      "一次接线图",
      "设备详情",
    ])
    for (const hidden of ["运行策略", "电价设置"]) {
      assert.equal(await stationNav.getByRole("button", { name: hidden, exact: true }).count(), 0)
    }

    await stationNav.getByRole("button", { name: "运营收益", exact: true }).click()
    await page.locator(".revenue-workspace").waitFor()
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "导出明细", exact: true }).click()
    assert.match((await downloadPromise).suggestedFilename(), /\.csv$/)

    await primaryNav(page).getByRole("button", { name: "分析与报告", exact: true }).click()
    const analysisTabs = page.getByRole("tablist", { name: "分析与报告视图" })
    assert.deepEqual(await analysisTabs.getByRole("tab").allTextContents(), [
      "数据分析",
      "数据下载",
      "报告中心",
    ])
    await analysisTabs.getByRole("tab", { name: "报告中心", exact: true }).click()
    await page.getByRole("button", { name: "生成报告", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "已生成" }).waitFor()
    const reportDownload = page.waitForEvent("download")
    await page.getByRole("button", { name: /下载 .*报告/ }).first().click()
    assert.match((await reportDownload).suggestedFilename(), /\.txt$/)

    await page.reload({ waitUntil: "domcontentloaded" })
    await page.locator(".workspace-sidebar").waitFor()
    assert.equal(await primaryNav(page).getByRole("button", { name: "分析与报告", exact: true }).count(), 1)
    await logout(page)
    assert.equal(await page.locator(".workspace-sidebar").count(), 0)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})

test("operator role: MFA, maintenance actions, work orders and hidden revenue", { timeout: 180000 }, async () => {
  await fs.mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const { context, page } = await openPage(browser)
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await login(page, "operator")
    assert.deepEqual(await primaryNav(page).getByRole("button").allTextContents(), [
      "总览",
      "资产与站点",
      "运维中心",
      "工单与审批",
      "分析与报告",
      "设置",
    ])
    for (const hidden of ["运营中心", "平台管理"]) {
      assert.equal(await primaryNav(page).getByRole("button", { name: hidden, exact: true }).count(), 0)
    }

    await assertOverviewMap(page, "operator")
    await page.getByRole("button", { name: "资产与站点", exact: true }).click()
    assert.doesNotMatch(
      await page.locator(".assets-workspace table thead").innerText(),
      /累计收益/,
    )
    assert.equal(await page.getByRole("button", { name: "新增站点", exact: true }).count(), 0)
    await page.getByText("苏州园区站", { exact: true }).first().click()
    const stationNav = page.getByRole("navigation", { name: "站点二级导航" })
    assert.deepEqual(await stationNav.getByRole("button").allTextContents(), [
      "站点概览",
      "运行策略",
      "告警信息",
      "运行曲线",
      "一次接线图",
      "设备详情",
    ])
    assert.equal(await stationNav.getByRole("button", { name: "运营收益", exact: true }).count(), 0)
    assert.equal(await page.getByText("累计收益", { exact: true }).count(), 0)

    await primaryNav(page).getByRole("button", { name: "运维中心", exact: true }).click()
    const maintenanceTabs = page.getByRole("navigation", { name: "运维中心二级导航" })
    assert.deepEqual(await maintenanceTabs.getByRole("button").allTextContents(), [
      "运维总览",
      "告警事件",
      "设备健康",
      "固件升级",
    ])
    await maintenanceTabs.getByRole("button", { name: "告警事件", exact: true }).click()
    await page.getByText("跨站告警事件", { exact: true }).waitFor()
    assert.ok(await page.getByRole("button", { name: "转工单", exact: true }).isVisible())

    await primaryNav(page).getByRole("button", { name: "工单与审批", exact: true }).click()
    const workTabs = page.getByRole("navigation", { name: "工单与审批一级导航" })
    assert.deepEqual(await workTabs.getByRole("button").allTextContents(), [
      "工单中心",
      "我的待办",
    ])
    assert.equal(await workTabs.getByRole("button", { name: "审批中心", exact: true }).count(), 0)
    await workTabs.getByRole("button", { name: "工单中心", exact: true }).click()
    await page.getByRole("button", { name: "新建工单", exact: true }).click()
    const source = page.getByLabel("新建工单来源", { exact: true })
    assert.deepEqual(await source.locator("option").allTextContents(), [
      "人工",
      "告警",
      "巡检",
      "维护",
    ])
    await page.getByRole("button", { name: "关闭新建工单", exact: true }).click()

    await primaryNav(page).getByRole("button", { name: "分析与报告", exact: true }).click()
    const analysisTabs = page.getByRole("tablist", { name: "分析与报告视图" })
    await analysisTabs.getByRole("tab", { name: "报告中心", exact: true }).click()
    assert.deepEqual(await page.getByLabel("报告类型", { exact: true }).locator("option").allTextContents(), [
      "设备健康报告",
    ])

    await assertResponsiveShell(page, "operator-maintenance")
    await logout(page)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})

test("integrator role: MFA, station delivery, technical work orders, firmware and organization access", { timeout: 180000 }, async () => {
  await fs.mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const { context, page } = await openPage(browser)
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  try {
    await login(page, "integrator")
    assert.deepEqual(await primaryNav(page).getByRole("button").allTextContents(), [
      "总览",
      "资产与站点",
      "运维中心",
      "工单与审批",
      "平台管理",
      "设置",
    ])
    for (const hidden of ["运营中心", "分析与报告"]) {
      assert.equal(await primaryNav(page).getByRole("button", { name: hidden, exact: true }).count(), 0)
    }

    await assertOverviewMap(page, "integrator")
    await page.getByRole("button", { name: "资产与站点", exact: true }).click()
    assert.doesNotMatch(
      await page.locator(".assets-workspace table thead").innerText(),
      /累计收益/,
    )
    await page.getByRole("button", { name: "新增站点", exact: true }).click()
    assert.equal(await page.getByText("累计收益", { exact: true }).count(), 0)
    const stationName = "交付验收测试站"
    await page.getByPlaceholder("请输入站点名称", { exact: true }).fill(stationName)
    await page.getByRole("button", { name: "提交审核", exact: true }).first().click()
    await page.getByRole("button", { name: "确认提交", exact: true }).click()
    await page.getByText(stationName, { exact: true }).first().waitFor()
    assert.ok(await page.getByText("建设中", { exact: true }).count() > 0)

    await page.getByRole("button", { name: "站点列表", exact: true }).click()
    await page.getByText(stationName, { exact: true }).first().waitFor()
    await page.getByText(stationName, { exact: true }).first().click()
    const stationNav = page.getByRole("navigation", { name: "站点二级导航" })
    assert.deepEqual(await stationNav.getByRole("button").allTextContents(), [
      "站点概览",
      "运行策略",
      "告警信息",
      "运行曲线",
      "一次接线图",
      "设备详情",
      "电价设置",
    ])
    assert.equal(await stationNav.getByRole("button", { name: "运营收益", exact: true }).count(), 0)

    await primaryNav(page).getByRole("button", { name: "运维中心", exact: true }).click()
    const maintenanceTabs = page.getByRole("navigation", { name: "运维中心二级导航" })
    assert.deepEqual(await maintenanceTabs.getByRole("button").allTextContents(), [
      "告警事件",
      "设备健康",
      "固件升级",
    ])
    assert.equal(await maintenanceTabs.getByRole("button", { name: "巡检检修", exact: true }).count(), 0)
    await maintenanceTabs.getByRole("button", { name: "固件升级", exact: true }).click()
    assert.ok(await page.getByText("固件升级", { exact: true }).count() > 0)

    await primaryNav(page).getByRole("button", { name: "工单与审批", exact: true }).click()
    const workTabs = page.getByRole("navigation", { name: "工单与审批一级导航" })
    assert.deepEqual(await workTabs.getByRole("button").allTextContents(), [
      "工单中心",
      "我的待办",
    ])
    await workTabs.getByRole("button", { name: "工单中心", exact: true }).click()
    await page.getByRole("button", { name: "新建工单", exact: true }).click()
    const source = page.getByLabel("新建工单来源", { exact: true })
    assert.deepEqual(await source.locator("option").allTextContents(), [
      "安装",
      "调试",
      "升级",
      "维护",
    ])
    await page.getByRole("button", { name: "关闭新建工单", exact: true }).click()

    await primaryNav(page).getByRole("button", { name: "平台管理", exact: true }).click()
    assert.equal(await page.getByRole("navigation", { name: "平台管理二级导航" }).count(), 0)
    assert.equal(await page.getByRole("button", { name: "客户管理", exact: true }).count(), 0)
    assert.equal(await page.getByRole("button", { name: "安全审计", exact: true }).count(), 0)
    assert.ok(await page.getByRole("tab", { name: "成员管理", exact: true }).count() > 0)
    await page.getByRole("button", { name: "新增成员", exact: true }).click()
    await page.getByRole("dialog").waitFor()
    await page.getByRole("dialog").getByRole("button", { name: "取消", exact: true }).click()

    await assertResponsiveShell(page, "integrator-delivery")
    await logout(page)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})
