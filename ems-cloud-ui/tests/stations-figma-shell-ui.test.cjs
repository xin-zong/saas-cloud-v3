const { test } = require("node:test")
const assert = require("node:assert/strict")
const { chromium } = require("playwright")
const fs = require("node:fs")

test("Figma station shell, equipment selection, analysis navigation and responsive layout", async (t) => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  await context.addInitScript(() =>
    localStorage.setItem(
      "enerlution-auth-session-v1",
      JSON.stringify({ userId: "user-owner-demo" }),
    ),
  )
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.goto(process.env.STATIONS_DEMO_URL || "http://127.0.0.1:8450", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  })
  await page.getByRole("button", { name: "资产与站点", exact: true }).click()
  await page.locator(".station-name-button").first().click()
  await page.getByRole("region", { name: "站点能流图", exact: true }).waitFor()
  const header = await page.locator(".station-global-header").boundingBox()
  const sidebar = await page.locator(".workspace-sidebar").boundingBox()
  assert.equal(header.height, 56)
  assert.equal(sidebar.width, 176)
  assert.equal(sidebar.y, 56)
  await page.getByRole("button", { name: "查看PCS设备", exact: true }).click()
  assert.equal(
    await page
      .getByRole("button", { name: "PCS", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  )
  const broken = await page
    .locator('[data-design-area="stations"] img')
    .evaluateAll((images) =>
      images
        .filter((img) => img.complete && !img.naturalWidth)
        .map((img) => img.src),
    )
  assert.deepEqual(broken, [])
  fs.mkdirSync("test-results/figma-stations", { recursive: true })
  await page.screenshot({
    path: "test-results/figma-stations/overview-1440.png",
  })
  await page.getByRole("button", { name: "运营收益", exact: true }).click()
  await page.getByRole("region", { name: "收益明细", exact: true }).waitFor()
  await page.screenshot({
    path: "test-results/figma-stations/revenue-1440.png",
  })
  await page.getByRole("button", { name: "运行曲线", exact: true }).click()
  await page.getByRole("button", { name: "深入分析" }).first().click()
  assert.equal(
    await page
      .getByRole("tab", { name: "历史趋势" })
      .getAttribute("aria-selected"),
    "true",
  )
  await page.getByRole("button", { name: "分屏", exact: true }).click()
  await page.getByRole("tab", { name: "实时分析" }).click()
  await page.getByRole("button", { name: "暂停", exact: true }).click()
  await page.screenshot({
    path: "test-results/figma-stations/analysis-1440.png",
  })
  await page.getByRole("button", { name: "返回运行曲线", exact: false }).click()
  await page.getByRole("button", { name: "站点概览", exact: true }).click()
  await page.getByRole("button", { name: "设备详情", exact: true }).click()
  await page.getByRole("tab", { name: "控制记录", exact: true }).click()
  await page.getByRole("button", { name: "选择 并网电表", exact: true }).click()
  await page
    .getByRole("heading", { name: "厂家额定参数", exact: true })
    .waitFor()
  await page.screenshot({
    path: "test-results/figma-stations/devices-1440.png",
  })
  await page.getByRole("button", { name: "告警信息", exact: true }).click()
  await page.getByRole("region", { name: "告警分布", exact: true }).waitFor()
  await page.screenshot({ path: "test-results/figma-stations/alarms-1440.png" })
  await page
    .getByRole("button", { name: "查看 ", exact: false })
    .first()
    .click()
  await page.screenshot({
    path: "test-results/figma-stations/alarm-detail-1440.png",
  })
  await page.getByRole("button", { name: "返回告警列表", exact: false }).click()
  await page.getByRole("button", { name: "一次接线图", exact: true }).click()
  await page
    .getByRole("button", { name: "选择接线图电池", exact: true })
    .click()
  await page.screenshot({
    path: "test-results/figma-stations/single-line-1440.png",
  })
  await page.getByRole("button", { name: "查看设备详情", exact: false }).click()
  await page
    .getByRole("heading", { name: "厂家额定参数", exact: true })
    .waitFor()
  await page.getByRole("button", { name: "站点概览", exact: true }).click()
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.screenshot({
      path: `test-results/figma-stations/overview-${width}.png`,
    })
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    )
  }
  assert.deepEqual(errors, [])
})

test("API station layouts retain empty states and query actual telemetry without fabricated results", async (t) => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  t.after(() => browser.close())
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  await context.addInitScript(() =>
    sessionStorage.setItem("enerlution-api-token", "station-layout-test"),
  )
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  let failHistory = false,
    historyCalls = 0
  const permissions = [
    "asset.read",
    "telemetry.read",
    "revenue.read",
    "report.export",
  ]
  await page.route("http://127.0.0.1:18090/api/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.slice(4)
    let data = []
    if (path === "/auth/me")
      data = {
        id: "7",
        name: "接口用户",
        account: "layout-test",
        role: "owner",
        organization: "测试",
        stationIds: ["12"],
        permissions,
        stationPermissions: { 12: permissions },
        organizationPermissions: {},
      }
    else if (path === "/stations")
      data = [
        {
          id: 12,
          name: "真实空数据站",
          code: "EMPTY12",
          rated_power_kw: 100,
          capacity_kwh: 200,
        },
      ]
    else if (path === "/stations/12/points")
      data = [{ id: 18, device_id: 4, name: "电池 SOC", unit: "%" }]
    else if (path === "/points/18/history") {
      historyCalls++
      if (failHistory) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            code: 500,
            msg: "采样服务暂不可用",
            data: null,
          }),
        })
        return
      }
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ code: 0, msg: "ok", data }),
    })
  })
  await page.goto(process.env.STATIONS_API_URL || "http://127.0.0.1:8451", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  })
  await page.getByRole("button", { name: "资产与站点", exact: true }).click()
  await page.getByRole("button", { name: "真实空数据站", exact: true }).click()
  await page.getByText("暂无采样数据", { exact: true }).waitFor()
  assert.equal(
    await page.getByRole("combobox", { name: "选择概览设备" }).isDisabled(),
    true,
  )
  await page.screenshot({
    path: "test-results/figma-stations/overview-api-empty.png",
  })
  await page.getByRole("button", { name: "运营收益", exact: true }).click()
  await page.getByText("所选日期范围暂无收益明细").waitFor()
  assert.equal(
    await page.getByRole("button", { name: "导出", exact: true }).isDisabled(),
    true,
  )
  await page.getByRole("button", { name: "运行曲线", exact: true }).click()
  await page.getByRole("button", { name: "深入分析" }).first().click()
  await page.getByRole("tab", { name: "历史趋势" }).waitFor()
  assert.equal(
    await page
      .getByRole("button", { name: "导出当前数据", exact: true })
      .isDisabled(),
    true,
  )
  failHistory = true
  await page.getByRole("button", { name: "查询", exact: true }).click()
  await page
    .getByRole("alert")
    .filter({ hasText: "采样服务暂不可用" })
    .waitFor()
  assert.ok(historyCalls > 0)
  assert.deepEqual(errors, [])
})
