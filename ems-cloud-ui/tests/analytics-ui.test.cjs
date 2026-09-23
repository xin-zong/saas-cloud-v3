const { test } = require("node:test")
const assert = require("node:assert/strict")
const { chromium } = require("playwright")

test("API analytics renders sparse history and downloads only successful server reports", async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true })
  await context.addInitScript(() => sessionStorage.setItem("enerlution-api-token", "analytics-token"))
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  const errors = []
  let downloads = 0
  page.on("pageerror", (error) => errors.push(error.message))
  page.on("download", () => { downloads++ })
  const user = { id: "7", name: "分析用户", account: "analytics@test", role: "owner", organization: "测试", stationIds: ["12"], permissions: ["asset.read", "telemetry.read", "report.export", "revenue.read", "strategy.read"] }
  let historyCalls = 0
  let reportCalls = 0
  let reportFails = false
  await page.route("http://127.0.0.1:18090/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.slice(4)
    let data = []
    if (path === "/auth/me") data = user
    else {
      assert.equal(request.headers().authorization, "Bearer analytics-token")
      if (path === "/stations") data = [{ id: 12, name: "分析站点", code: "A-12", rated_power_kw: 100, capacity_kwh: 200 }]
      else if (path === "/stations/12/points") data = [
        { id: 17, device_id: 4, name: "有功功率", unit: "kW" },
        { id: 18, device_id: 4, name: "电池 SOC", unit: "%" },
      ]
      else if (path === "/points/18/history") {
        historyCalls++
        assert.equal(url.searchParams.get("minutes"), "5")
        assert.equal(url.searchParams.get("from"), "2025-10-09T00:00:00.000Z")
        assert.equal(url.searchParams.get("to"), "2025-10-09T01:00:00.000Z")
        data = historyCalls === 1 ? [] : [
          { timestamp: Date.parse("2025-10-09T00:00:00Z"), value: 0, samples: 2 },
          { timestamp: Date.parse("2025-10-09T00:10:00Z"), value: 42, samples: 3 },
        ]
      }
      else if (path === "/stations/12/reports/revenue") {
        reportCalls++
        assert.equal(url.searchParams.get("from"), "2025-10-01")
        assert.equal(url.searchParams.get("to"), "2025-10-09")
        if (reportFails) {
          await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: 403, msg: "没有导出权限" }) })
          return
        }
        await route.fulfill({ status: 200, contentType: "text/csv;charset=UTF-8", headers: { "Content-Disposition": 'attachment; filename="report-12-revenue.csv"' }, body: "\uFEFFreference,amount\r\nR-1,125\r\n" })
        return
      }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, data }) })
  })
  try {
    await page.goto(process.env.PREVIEW_URL || "http://127.0.0.1:8443", { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.getByRole("button", { name: "分析与报告", exact: true }).click()
    await page.getByRole("option", { name: "电池 SOC (%)" }).waitFor({ state: "attached" })
    await page.getByLabel("测点", { exact: true }).selectOption("18")
    await page.getByLabel("开始时间", { exact: true }).fill("2025-10-09T08:00")
    await page.getByLabel("结束时间", { exact: true }).fill("2025-10-09T09:00")
    await page.getByLabel("粒度", { exact: true }).selectOption("5")
    await page.getByRole("button", { name: "查询历史" }).click()
    await page.getByText("所选时间段没有采样数据。").waitFor()
    assert.equal(await page.getByText("暂无采样数据").count(), 1)
    await page.getByRole("button", { name: "查询历史" }).click()
    await page.getByText("2 个采样区间 · 数值为服务器返回的区间平均值。").waitFor()
    assert.equal(historyCalls, 2)
    await page.getByRole("tab", { name: "数据下载" }).click()
    await page.getByRole("button", { name: "导出查询 CSV" }).waitFor()
    await page.getByRole("tab", { name: "报告中心" }).click()
    await page.getByLabel("报告类型", { exact: true }).selectOption("revenue")
    await page.getByLabel("报告开始日期", { exact: true }).fill("2025-10-01")
    await page.getByLabel("报告结束日期", { exact: true }).fill("2025-10-09")
    const downloadPromise = page.waitForEvent("download")
    await page.getByRole("button", { name: "下载 CSV 报告" }).click()
    const download = await downloadPromise
    assert.match(download.suggestedFilename(), /report-12-revenue/)
    assert.equal(downloads, 1)
    assert.equal(reportCalls, 1)
    reportFails = true
    await page.getByRole("button", { name: "下载 CSV 报告" }).click()
    await page.getByRole("alert").getByText("没有导出权限").waitFor()
    assert.equal(reportCalls, 2)
    assert.equal(downloads, 1)
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})
