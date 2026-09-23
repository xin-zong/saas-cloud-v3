const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")
const { chromium } = require("playwright")

const url = process.env.PREVIEW_URL || "http://localhost:8443/"
const artifacts = path.resolve(__dirname, "../.figma/stage-one")
const storageKey = "enerlution-system-settings-v1"
const ownerAccount = "owner@enerlution.cn"
const demoPassword = "Demo@2026"

async function loginAsOwner(page) {
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page
    .getByRole("textbox", { name: "登录账号", exact: true })
    .fill(ownerAccount)
  await page.getByLabel("密码", { exact: true }).fill(demoPassword)
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await page.locator(".workspace-sidebar").waitFor()
  assert.equal(
    await page.locator(".workspace-account").getAttribute("data-role-account"),
    "owner",
  )
}

async function checkLayout(page, pageClass, expectedNavCount = 5) {
  if (pageClass === ".revenue-workspace") {
    // ResizeObserver updates the SVG after the viewport and CSS have resized.
    await page.waitForFunction(() => {
      const chart = document.querySelector(".revenue-chart")
      const surface = chart?.querySelector(".recharts-surface")
      return (
        surface &&
        Math.abs(surface.getBoundingClientRect().width - chart.clientWidth) < 2
      )
    })
  }
  const layout = await page.locator(pageClass).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const sidebar = document
      .querySelector(".workspace-sidebar")
      .getBoundingClientRect()
    return {
      width: element.clientWidth,
      scroll: element.scrollWidth,
      left: rect.left,
      sidebarRight: sidebar.right,
      right: rect.right,
      viewport: innerWidth,
    }
  })
  assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout))
  assert.ok(layout.left >= layout.sidebarRight - 1, JSON.stringify(layout))
  assert.ok(layout.right <= layout.viewport + 1, JSON.stringify(layout))
  assert.equal(
    await page
      .getByRole("navigation", { name: "一级导航", exact: true })
      .getByRole("button")
      .count(),
    expectedNavCount,
  )
}

test(
  "stage-one workspace: settings, revenue, data updates and responsive shell",
  { timeout: 180000 },
  async (t) => {
    await fs.mkdir(artifacts, { recursive: true })
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      timezoneId: "Asia/Shanghai",
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    // External fonts are not required for deterministic local UI tests.
    await page.route(
      /fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,
      (route) => route.abort(),
    )
    page.setDefaultTimeout(15000)
    try {
      await loginAsOwner(page)
      assert.equal(
        await page
          .locator("[data-live-preview]")
          .getAttribute("data-live-status"),
        "ready",
      )
      await page
        .getByRole("button", { name: "展开热视图状态", exact: true })
        .click()
      await page.getByText("HMR 已连接", { exact: true }).waitFor()
      assert.equal(
        await page
          .getByRole("button", { name: "模拟数据变更", exact: true })
          .isVisible(),
        true,
      )
      await page
        .getByRole("button", { name: "收起热视图状态", exact: true })
        .click()
      await page.getByRole("button", { name: "设置", exact: true }).click()

      await t.test(
        "settings save, reload, cancel reset and storage failure",
        async () => {
          await page
            .getByLabel("备用接口地址", { exact: true })
            .fill("https://backup.example.test/v2")
          await page
            .getByRole("switch", { name: "自动刷新数据", exact: true })
            .click()
          assert.equal(
            await page.getByLabel("刷新间隔", { exact: true }).isDisabled(),
            true,
          )
          await page
            .getByRole("button", { name: "保存配置", exact: true })
            .click()
          await page.getByText("已保存至本机", { exact: true }).waitFor()
          await page.reload({ waitUntil: "domcontentloaded" })
          await page.getByRole("button", { name: "设置", exact: true }).click()
          assert.equal(
            await page.getByLabel("备用接口地址", { exact: true }).inputValue(),
            "https://backup.example.test/v2",
          )
          assert.equal(
            await page
              .getByRole("switch", { name: "自动刷新数据", exact: true })
              .getAttribute("aria-checked"),
            "false",
          )
          await page
            .getByRole("button", { name: "恢复默认", exact: true })
            .click()
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "取消", exact: true })
            .click()
          assert.equal(
            await page.getByLabel("备用接口地址", { exact: true }).inputValue(),
            "https://backup.example.test/v2",
          )
          await page
            .getByLabel("备用接口地址", { exact: true })
            .fill("https://changed.example.test/v3")
          await page.evaluate(() => {
            Storage.prototype.setItem = () => {
              throw new DOMException("Blocked", "QuotaExceededError")
            }
          })
          await page
            .getByRole("button", { name: "保存配置", exact: true })
            .click()
          await page
            .getByRole("alert")
            .filter({ hasText: "保存失败" })
            .waitFor()
          assert.equal(
            await page.getByText("已保存至本机", { exact: true }).count(),
            0,
          )
          await page.reload({ waitUntil: "domcontentloaded" })
          await page.getByRole("button", { name: "设置", exact: true }).click()
          await page
            .getByRole("button", { name: "恢复默认", exact: true })
            .click()
          await page
            .getByRole("dialog")
            .getByRole("button", { name: "恢复默认", exact: true })
            .click()
          assert.equal(
            await page.getByLabel("备用接口地址", { exact: true }).inputValue(),
            "https://backup.enerlution.local/v1",
          )
        },
      )

      await t.test(
        "settings across desktop, tablet and mobile viewports",
        async () => {
          for (const width of [1440, 1280, 1024, 390, 320]) {
            await page.setViewportSize({
              width,
              height: width < 600 ? 844 : 1000,
            })
            await checkLayout(page, ".settings-workspace")
            await page.screenshot({
              path: path.join(artifacts, `settings-${width}.png`),
              animations: "disabled",
            })
          }
          await page.setViewportSize({ width: 1440, height: 1000 })
          await page
            .getByRole("button", { name: "收起导航", exact: true })
            .click()
          await checkLayout(page, ".settings-workspace")
          assert.equal(
            await page
              .locator(".workspace-sidebar")
              .evaluate((e) => e.clientWidth),
            55,
          )
          await page
            .getByRole("button", { name: "展开导航", exact: true })
            .click()
        },
      )

      await t.test(
        "legacy local settings remain readable and corrupt storage is reported",
        async () => {
          await page.evaluate(
            (key) =>
              localStorage.setItem(
                key,
                JSON.stringify({
                  language: "English",
                  autoRefresh: false,
                  backupEndpoint: "https://legacy.example.test/v1",
                }),
              ),
            storageKey,
          )
          await page.reload({ waitUntil: "domcontentloaded" })
          await page.getByRole("button", { name: "设置", exact: true }).click()
          assert.equal(
            await page.getByLabel("界面语言", { exact: true }).inputValue(),
            "English",
          )
          assert.equal(
            await page.getByLabel("备用接口地址", { exact: true }).inputValue(),
            "https://legacy.example.test/v1",
          )
          await page.evaluate(
            (key) => localStorage.setItem(key, "{broken"),
            storageKey,
          )
          await page.reload({ waitUntil: "domcontentloaded" })
          await page.getByRole("button", { name: "设置", exact: true }).click()
          await page
            .getByRole("alert")
            .filter({ hasText: "无法读取本地配置" })
            .waitFor()
          assert.equal(
            await page.getByLabel("界面语言", { exact: true }).inputValue(),
            "简体中文",
          )
          await page.evaluate((key) => localStorage.removeItem(key), storageKey)
        },
      )

      await page
        .getByRole("button", { name: "资产与站点", exact: true })
        .click()
      await page.getByText("苏州园区站", { exact: true }).first().click()
      await page.getByRole("button", { name: "运营收益", exact: true }).click()

      await t.test(
        "calendar presets, custom validation, table and export",
        async () => {
          const ranges = await page.evaluate(async () => {
            const { getDefaultRevenueDateRange } = await import(
              "/src/data/stationMetrics.ts"
            )
            return Object.fromEntries(
              ["日", "周", "月", "年"].map((key) => [
                key,
                getDefaultRevenueDateRange(key),
              ]),
            )
          })
          const values = []
          for (const period of ["日", "周", "月", "年"]) {
            await page
              .getByRole("button", { name: period, exact: true })
              .click()
            const range = ranges[period]
            assert.match(
              await page
                .locator('[data-time-range="station-revenue"]')
                .innerText(),
              new RegExp(`${range.start} 至 ${range.end}`),
            )
            values.push(await page.locator("[data-metric]").first().innerText())
            assert.ok(
              await page.locator(".revenue-chart .recharts-surface").count(),
            )
          }
          assert.ok(new Set(values).size > 1, "Preset metrics must change")
          await page.getByTitle("选择日期范围").click()
          await page.getByLabel("开始日期", { exact: true }).fill("2026-09-03")
          await page.getByLabel("结束日期", { exact: true }).fill("2026-09-01")
          await page.getByRole("button", { name: "应用", exact: true }).click()
          await page
            .getByRole("alert")
            .filter({ hasText: "结束日期不能早于开始日期" })
            .waitFor()
          await page.getByLabel("开始日期", { exact: true }).fill("2026-09-01")
          await page.getByLabel("结束日期", { exact: true }).fill("2026-09-03")
          await page.getByRole("button", { name: "应用", exact: true }).click()
          await page
            .getByRole("button", { name: /^展开 2026/ })
            .first()
            .click()
          assert.ok(await page.locator(".revenue-trace").isVisible())
          const downloadPromise = page.waitForEvent("download")
          await page
            .getByRole("button", { name: "导出明细", exact: true })
            .click()
          const download = await downloadPromise
          assert.match(
            download.suggestedFilename(),
            /2026-09-01-2026-09-03\.csv$/,
          )
          const csv = await fs.readFile(await download.path(), "utf8")
          assert.match(csv, /日期,峰谷套利/)
        },
      )

      await t.test(
        "incoming revenue updates repaint metrics, chart and detail rows",
        async () => {
          const patch = (value) =>
            page.evaluate((value) => {
              window.__ENERLUTION_DATA__.patchStation("1", {
                revenueSource: "connected",
                revenueHistory: [
                  {
                    date: "2026-09-01",
                    settled: value,
                    pending: 200,
                    est: 50,
                    peakValley: value,
                    demand: 200,
                    pv: 30,
                    vpp: 20,
                    penalty: -10,
                  },
                  {
                    date: "2026-09-02",
                    settled: 300,
                    pending: 100,
                    est: 0,
                    peakValley: 300,
                    demand: 100,
                    pv: 0,
                    vpp: 0,
                    penalty: 0,
                  },
                ],
              })
            }, value)
          await patch(1000)
          await page.waitForFunction(
            () =>
              document.querySelector(
                '[data-metric="station-revenue-选定范围收益"]',
              ).textContent === "1,650",
          )
          const before = await page
            .locator(".revenue-chart .recharts-surface")
            .innerHTML()
          const tableBefore = await page.locator(".revenue-table").innerText()
          await patch(7000)
          await page.waitForFunction(
            () =>
              document.querySelector(
                '[data-metric="station-revenue-选定范围收益"]',
              ).textContent === "7,650",
          )
          assert.notEqual(
            await page.locator(".revenue-chart .recharts-surface").innerHTML(),
            before,
          )
          assert.notEqual(
            await page.locator(".revenue-table").innerText(),
            tableBefore,
          )
          await page
            .getByRole("button", { name: "已结算", exact: true })
            .click()
          assert.equal(
            await page
              .getByRole("button", { name: "已结算", exact: true })
              .getAttribute("aria-pressed"),
            "false",
          )
          await page
            .getByRole("button", { name: "已结算", exact: true })
            .click()
          await page
            .getByLabel("收益构成来源", { exact: true })
            .selectOption("峰谷套利")
          assert.equal(await page.locator(".revenue-source").count(), 1)
          await page
            .getByLabel("收益构成来源", { exact: true })
            .selectOption("全部来源")
        },
      )

      await t.test(
        "revenue responsive layouts, date dialog and assistant shell offsets",
        async () => {
          for (const width of [1440, 1280, 1024, 390, 320]) {
            await page.setViewportSize({
              width,
              height: width < 600 ? 844 : 1000,
            })
            await page.locator(".revenue-workspace").evaluate((e) => {
              e.scrollTop = 0
            })
            await checkLayout(page, ".revenue-workspace")
            await page.screenshot({
              path: path.join(artifacts, `revenue-${width}.png`),
              animations: "disabled",
            })
            await page.locator(".revenue-trend").scrollIntoViewIfNeeded()
            await page.screenshot({
              path: path.join(artifacts, `revenue-chart-${width}.png`),
              animations: "disabled",
            })
            const bars = page.locator(
              ".revenue-chart .recharts-bar-rectangle path",
            )
            assert.ok(
              await bars.count(),
              "Revenue chart must render data marks",
            )
            await bars.first().hover()
            const tooltip = page.locator(
              ".revenue-chart .recharts-tooltip-wrapper",
            )
            await tooltip.waitFor({ state: "visible" })
            const tooltipBox = await tooltip.boundingBox()
            const chartBox = await page.locator(".revenue-chart").boundingBox()
            assert.ok(
              tooltipBox.x >= chartBox.x - 1 &&
                tooltipBox.x + tooltipBox.width <=
                  chartBox.x + chartBox.width + 1,
              "Chart tooltip must fit its container",
            )
            await page.mouse.move(0, 0)
            await page.locator(".revenue-workspace").evaluate((e) => {
              e.scrollTop = 0
            })
            await page.getByTitle("选择日期范围").click()
            const box = await page.getByRole("dialog").boundingBox()
            assert.ok(box.x >= 0 && box.x + box.width <= width)
            await page.keyboard.press("Escape")
            await page.waitForFunction(
              () =>
                document
                  .querySelector('[data-time-range="station-revenue"]')
                  .getAttribute("aria-expanded") === "false",
            )
            assert.equal(
              await page
                .locator('[data-time-range="station-revenue"]')
                .getAttribute("aria-expanded"),
              "false",
            )
          }
          await page.setViewportSize({ width: 1440, height: 1000 })
          await page
            .getByRole("button", { name: "收起导航", exact: true })
            .click()
          await checkLayout(page, ".revenue-workspace")
          await page
            .getByRole("button", { name: "分析与报告", exact: true })
            .click()
          await page
            .getByRole("button", { name: "展开AI助手", exact: true })
            .click()
          const rects = await page.evaluate(() => ({
            nav: document
              .querySelector(".workspace-sidebar")
              .getBoundingClientRect().right,
            drawer: document
              .querySelector(".global-ai-drawer")
              .getBoundingClientRect().left,
          }))
          assert.ok(rects.drawer >= rects.nav, "AI drawer must not cover primary navigation")
          await page
            .getByRole("button", { name: "关闭AI助手", exact: true })
            .click()
        },
      )

      await t.test(
        "primary navigation and live preview remain available on legacy pages",
        async () => {
          for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 1000 })
            for (const name of [
              "总览",
              "运营中心",
              "分析与报告",
              "设置",
              "资产与站点",
            ]) {
              const nav = page.getByRole("navigation", {
                name: "一级导航",
                exact: true,
              })
              await nav.getByRole("button", { name, exact: true }).click()
              assert.equal(await nav.getByRole("button").count(), 5)
              assert.equal(
                await nav
                  .getByRole("button", { name, exact: true })
                  .getAttribute("aria-current"),
                "page",
              )
              assert.ok(await page.locator(".workspace-sidebar").isVisible())
              await page
                .getByRole("button", { name: "展开热视图状态", exact: true })
                .click()
              await page.getByText("HMR 已连接", { exact: true }).waitFor()
              await page
                .getByRole("button", { name: "收起热视图状态", exact: true })
                .click()
            }
            for (const name of [
              "告警信息",
              "运行曲线",
              "运营收益",
            ]) {
              await page
                .getByRole("navigation", { name: "站点二级导航" })
                .getByRole("button", { name, exact: true })
                .click()
              assert.ok(await page.locator(".workspace-sidebar").isVisible())
              await page
                .getByRole("button", { name: "展开热视图状态", exact: true })
                .click()
              await page.getByText("HMR 已连接", { exact: true }).waitFor()
              await page
                .getByRole("button", { name: "收起热视图状态", exact: true })
                .click()
            }
          }
        },
      )
      assert.deepEqual(errors, [])
    } finally {
      await context.close()
      await browser.close()
    }
  },
)
