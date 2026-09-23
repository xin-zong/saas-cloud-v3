const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")
const { chromium } = require("playwright")

const url = process.env.PREVIEW_URL || "http://localhost:8443/"
const artifacts = path.resolve(__dirname, "../.figma/operations-redesign")

async function loginAsOwner(page) {
  await page.goto(url, { waitUntil: "domcontentloaded" })
  await page
    .getByRole("textbox", { name: "登录账号", exact: true })
    .fill("owner@enerlution.cn")
  await page.getByLabel("密码", { exact: true }).fill("Demo@2026")
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await page.locator(".workspace-sidebar").waitFor()
}

async function checkMainLayout(page, label, width) {
  await page.locator("main").waitFor()
  const geometry = await page.locator("main").evaluate((main) => ({
    client: main.clientWidth,
    scroll: main.scrollWidth,
    right: main.getBoundingClientRect().right,
    viewport: innerWidth,
  }))
  assert.ok(
    geometry.scroll <= geometry.client + 1,
    `${label} ${width}: ${JSON.stringify(geometry)}`,
  )
  assert.ok(
    geometry.right <= geometry.viewport + 1,
    `${label} ${width}: ${JSON.stringify(geometry)}`,
  )
}

test("operations redesign: owner tabs, responsive layout and settlement export", { timeout: 120000 }, async () => {
  await fs.mkdir(artifacts, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    timezoneId: "Asia/Shanghai",
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.route(
    /fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,
    (route) => route.abort(),
  )
  await page.clock.install({ time: new Date("2026-09-18T09:00:00+08:00") })
  try {
    await loginAsOwner(page)
    await page
      .getByRole("navigation", { name: "一级导航" })
      .getByRole("button", { name: "运营中心" })
      .click()
    const tabs = page.getByRole("navigation", { name: "运营中心二级导航" })
    assert.deepEqual(await tabs.getByRole("button").allTextContents(), [
      "运营总览",
      "收益结算",
    ])

    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 })
      for (const [name, file] of [
        ["运营总览", "overview"],
        ["收益结算", "settlement"],
      ]) {
        await tabs.getByRole("button", { name, exact: true }).click()
        await checkMainLayout(page, name, width)
        await page.screenshot({
          path: path.join(artifacts, `${file}-${width}.png`),
          animations: "disabled",
        })
        if (name === "收益结算" && width < 600) {
          for (const value of await page.locator(".settlement-kpi strong").all()) {
            assert.equal(
              await value.evaluate((element) => {
                const range = document.createRange()
                range.selectNodeContents(element)
                return range.getClientRects().length
              }),
              1,
            )
          }
        }
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 })
    await tabs.getByRole("button", { name: "运营总览", exact: true }).click()
    assert.equal(await page.locator(".ops-detail tbody tr").count(), 2)
    await page.getByRole("searchbox", { name: "搜索经营站点" }).fill("苏州")
    assert.equal(await page.locator(".ops-detail tbody tr").count(), 1)
    await page.getByRole("searchbox", { name: "搜索经营站点" }).fill("")

    await tabs.getByRole("button", { name: "收益结算", exact: true }).click()
    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "导出对账表", exact: true }).click()
    assert.match((await download).suggestedFilename(), /\.csv$/)
    assert.deepEqual(errors, [])
  } finally {
    await context.close()
    await browser.close()
  }
})
