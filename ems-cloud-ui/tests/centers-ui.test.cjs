const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")
const { chromium } = require("playwright")

const artifacts = path.resolve(__dirname, "../.figma/centers")
const url = process.env.PREVIEW_URL || "http://localhost:8443/"
const accounts = {
  owner: ["owner@enerlution.cn", ""],
  operator: ["operator@enerlution.cn", "246810"],
  integrator: ["integrator@enerlution.cn", "246810"],
}

async function login(page, role) {
  const [account, mfa] = accounts[role]
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page
    .getByRole("textbox", { name: "登录账号", exact: true })
    .fill(account)
  await page.getByLabel("密码", { exact: true }).fill("Demo@2026")
  await page.getByRole("button", { name: "登录", exact: true }).click()
  if (mfa) {
    await page.getByLabel("动态验证码", { exact: true }).fill(mfa)
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

function nav(page) {
  return page.getByRole("navigation", { name: "一级导航", exact: true })
}

async function open(page, name) {
  await nav(page).getByRole("button", { name, exact: true }).click()
  await page.locator("main").waitFor()
}

async function checkLayout(page, expectedNavCount) {
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".recharts-responsive-container")].every(
      (chart) => {
        const svg = chart.querySelector(".recharts-surface")
        return (
          !svg ||
          Math.abs(svg.getBoundingClientRect().width - chart.clientWidth) < 2
        )
      },
    ),
  )
  const geometry = await page.locator("main").evaluate((main) => {
    const box = main.getBoundingClientRect()
    const sidebar = document
      .querySelector(".workspace-sidebar")
      .getBoundingClientRect()
    return {
      width: main.clientWidth,
      scroll: main.scrollWidth,
      left: box.left,
      right: box.right,
      sidebarRight: sidebar.right,
      viewport: innerWidth,
      background: getComputedStyle(main).backgroundColor,
    }
  })
  assert.ok(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry))
  assert.ok(geometry.left >= geometry.sidebarRight - 1, JSON.stringify(geometry))
  assert.ok(geometry.right <= geometry.viewport + 1, JSON.stringify(geometry))
  assert.equal(geometry.background, "rgb(237, 243, 239)")
  assert.equal(await nav(page).getByRole("button").count(), expectedNavCount)
}

async function screenshotWidths(page, role, section, expectedNavCount) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 })
    await checkLayout(page, expectedNavCount)
    await page.screenshot({
      path: path.join(artifacts, `${role}-${section}-${width}.png`),
      animations: "disabled",
    })
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
}

test("role-scoped centers: responsive layouts, tabs and role-specific actions", { timeout: 180000 }, async (t) => {
  await fs.mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ headless: true })

  await t.test("owner sees operations and reports only", async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Shanghai",
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.route(
      /fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,
      (route) => route.abort(),
    )
    try {
      await login(page, "owner")
      assert.deepEqual(await nav(page).getByRole("button").allTextContents(), [
        "总览",
        "资产与站点",
        "运营中心",
        "分析与报告",
        "设置",
      ])
      await open(page, "运营中心")
      assert.deepEqual(
        await page
          .getByRole("navigation", { name: "运营中心二级导航" })
          .getByRole("button")
          .allTextContents(),
        ["运营总览", "收益结算"],
      )
      await screenshotWidths(page, "owner", "operations", 5)
      await page
        .getByRole("navigation", { name: "运营中心二级导航" })
        .getByRole("button", { name: "收益结算", exact: true })
        .click()
      await checkLayout(page, 5)

      await open(page, "分析与报告")
      assert.ok(await page.locator(".global-ai-trigger").isVisible())
      await page.getByRole("button", { name: "展开AI助手", exact: true }).click()
      await page.locator(".global-ai-drawer").waitFor({ state: "visible" })
      await page.getByRole("button", { name: "关闭AI助手", exact: true }).click()
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })

  await t.test("operator sees maintenance, work orders and health reports", async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Shanghai",
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.route(
      /fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,
      (route) => route.abort(),
    )
    try {
      await login(page, "operator")
      await open(page, "运维中心")
      const maintenanceTabs = page.getByRole("navigation", {
        name: "运维中心二级导航",
      })
      assert.deepEqual(await maintenanceTabs.getByRole("button").allTextContents(), [
        "运维总览",
        "告警事件",
        "设备健康",
        "固件升级",
      ])
      await screenshotWidths(page, "operator", "maintenance", 6)
      await maintenanceTabs
        .getByRole("button", { name: "设备健康", exact: true })
        .click()
      await page.getByRole("region", { name: "设备运行与故障记录" }).waitFor()

      await open(page, "工单与审批")
      assert.deepEqual(
        await page
          .getByRole("navigation", { name: "工单与审批一级导航" })
          .getByRole("button")
          .allTextContents(),
        ["工单中心", "我的待办"],
      )
      await page.getByRole("button", { name: "新建工单", exact: true }).click()
      await page.getByRole("dialog", { name: "新建工单" }).waitFor()
      await page
        .getByRole("button", { name: "关闭新建工单", exact: true })
        .click()
      await checkLayout(page, 6)

      await open(page, "分析与报告")
      await page
        .getByRole("tab", { name: "报告中心", exact: true })
        .click()
      assert.deepEqual(
        await page.getByLabel("报告类型", { exact: true }).locator("option").allTextContents(),
        ["设备健康报告"],
      )
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })

  await t.test("integrator sees delivery operations, technical orders and organization permissions", async () => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Shanghai",
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.route(
      /fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,
      (route) => route.abort(),
    )
    try {
      await login(page, "integrator")
      await open(page, "运维中心")
      const maintenanceTabs = page.getByRole("navigation", {
        name: "运维中心二级导航",
      })
      assert.deepEqual(await maintenanceTabs.getByRole("button").allTextContents(), [
        "告警事件",
        "设备健康",
        "固件升级",
      ])
      await screenshotWidths(page, "integrator", "delivery", 6)
      await maintenanceTabs
        .getByRole("button", { name: "固件升级", exact: true })
        .click()
      assert.ok(await page.getByText("项目交付与技术支持范围", { exact: true }).isVisible())

      await open(page, "工单与审批")
      await page.getByRole("button", { name: "新建工单", exact: true }).click()
      assert.deepEqual(
        await page.getByLabel("新建工单来源", { exact: true }).locator("option").allTextContents(),
        ["安装", "调试", "升级", "维护"],
      )
      await page
        .getByRole("button", { name: "关闭新建工单", exact: true })
        .click()

      await open(page, "平台管理")
      assert.equal(
        await page.getByRole("navigation", { name: "平台管理二级导航" }).count(),
        0,
      )
      assert.ok(await page.getByRole("tab", { name: "成员管理", exact: true }).isVisible())
      assert.equal(await page.locator(".global-ai-trigger").count(), 0)
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
    }
  })

  await browser.close()
})
