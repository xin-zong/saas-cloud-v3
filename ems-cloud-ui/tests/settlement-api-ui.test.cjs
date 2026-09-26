const { test } = require("node:test")
const assert = require("node:assert/strict")
const { chromium } = require("playwright")

test("API settlement period loads historical currency and persists review history", async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => sessionStorage.setItem("enerlution-api-token", "settlement-token"))
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const errors = []
  page.on("pageerror", (error) => errors.push(error.message))
  const user = { id: "7", name: "结算用户", account: "settlement@test", role: "owner", organization: "测试", stationIds: ["12"], permissions: ["revenue.read", "revenue.review"] }
  user.stationPermissions = Object.fromEntries(user.stationIds.map(id => [id, [...user.permissions]]))
  user.organizationPermissions = {}
  const reviews = [{ author_id: 3, note: "历史核对意见", created_at: "2025-04-13T10:00:00Z" }]
  const historical = []
  let posted = null
  await page.route("http://127.0.0.1:18090/api/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.slice(4)
    let data = []
    if (path === "/auth/me") data = user
    else {
      assert.equal(request.headers().authorization, "Bearer settlement-token")
      if (path === "/stations/options") data = [{id:12,name:"历史结算站"}]
      else if (path === "/stations") data = [{ id: 12, name: "历史结算站", code: "S-12", rated_power_kw: 100, capacity_kwh: 200 }]
      else if (path === "/stations/12/settlements") {
        assert.equal(url.searchParams.get("limit"), "100")
        assert.equal(url.searchParams.get("offset"), "0")
        if (url.searchParams.get("from") === "2025-04-01" && url.searchParams.get("to") === "2025-04-30") {
          historical.push(url.search)
          data = [{ id: 61, recognition_date: "2025-04-12", contract_code: "EU-1", currency: "EUR", reference: "REF-61", status: "calculated", statement_amount: 125, estimated_amount: 130, meter_complete: true, calculation_complete: true, lines: [{ category: "arbitrage", amount: 150 }, { category: "purchase", amount: 25 }], payments: [{ amount: 50, paid_on: "2025-04-20" }], reviews }]
        }
      }
      else if (path === "/settlements/61/reviews" && request.method() === "POST") {
        posted = request.postDataJSON()
        reviews.push({ author_id: 7, note: posted.note, created_at: "2025-04-14T10:00:00Z" })
        data = null
      }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data }) })
  })
  try {
    await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:8443", { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.getByRole("button", { name: "运营中心", exact: true }).click()
    await page.getByRole("button", { name: "收益核算", exact: true }).click()
    await page.getByRole("button", { name: "选择核算周期" }).click()
    await page.getByLabel("核算开始日期").fill("2025-04-01")
    await page.getByLabel("核算结束日期").fill("2025-04-30")
    await page.getByRole("button", { name: "应用范围" }).click()
    await page.getByRole("option", { name: "EUR" }).waitFor({ state: "attached" })
    assert.ok(historical.length >= 1)
    await page.getByLabel("核算币种").selectOption("EUR")
    await page.getByRole("button", { name: "历史结算站", exact: true }).click()
    await page.getByRole("button", { name: "复核备注", exact: true }).click()
    await page.getByText("历史核对意见", { exact: false }).waitFor()
    await page.getByLabel("结算复核备注").fill("二次复核已完成")
    await page.getByRole("button", { name: "保存备注" }).click()
    await page.getByText("复核意见已保存，账目状态未改变").waitFor()
    await page.getByText("二次复核已完成", { exact: false }).waitFor()
    assert.deepEqual(posted, { note: "二次复核已完成" })
    assert.ok(historical.length >= 2, "review history rereads selected historical period")
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
