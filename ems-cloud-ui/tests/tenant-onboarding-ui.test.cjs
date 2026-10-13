const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright")

const URL =
  process.env.TENANT_PREVIEW_URL ||
  process.env.API_PREVIEW_URL ||
  "http://127.0.0.1:8447/"

async function setup(t, { activation = false, loggedIn = false } = {}) {
  const browser = await chromium.launch({ channel: "msedge", headless: true })

  t.after(() => browser.close())

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })

  if (loggedIn)
    await context.addInitScript(() =>
      sessionStorage.setItem("enerlution-api-token", "existing-session"),
    )

  const page = await context.newPage()

  page.setDefaultTimeout(10000)

  const writes = [],
    errors = []

  page.on("pageerror", (e) => errors.push(e.message))

  t.after(() => assert.deepEqual(errors, []))

  await page.route("**/maps.googleapis.com/**", (r) => r.abort())

  await page.route(
    /^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,
    async (route) => {
      const req = route.request(),
        url = new globalThis.URL(req.url()),
        path = url.pathname.slice(4),
        body = req.postData() ? req.postDataJSON() : null

      let data = null,
        status = 200

      if (req.method() !== "GET") writes.push({ path, body })

      if (path === "/public/environments")
        data = [
          { code: "apac", url: URL, available: true },

          { code: "eu", url: "", available: false },
        ]
      else if (path === "/public/registration/email-challenges")
        data = { challengeId: "challenge-1", mailStatus: "pending" }
      else if (path === "/public/registration/email-challenges/verify")
        data = { email: "new@test.invalid", context: "verified-context" }
      else if (path === "/public/company-applications")
        data = { id: 9, number: "APP-UI-TEST", status: "pending" }
      else if (path === "/public/company-applications/progress")
        data = [
          {
            id: 9,

            number: "APP-UI-TEST",

            status: "rejected",

            submitted_at: "2026-10-13T00:00:00Z",

            events: [
              {
                id: 1,

                action: "rejected",

                reason: "补充注册资料",

                occurred_at: "2026-10-13T01:00:00Z",
              },
            ],
          },
        ]
      else if (path === "/public/activations/inspect")
        data = { account: "new@test.invalid", name: "待激活员工" }
      else if (path === "/auth/me")
        data = {
          id: "1",

          name: "已登录员工",

          account: "old@test.invalid",

          tenantName: "已有企业",

          tenant: {
            actorId: 1,

            tenantId: 2,

            kind: "enterprise",

            administrator: false,
          },

          menus: [],

          roleNames: [],

          stationIds: [],

          stationPermissions: {},

          permissions: [],
        }
      else if (path === "/me/capabilities/events") {
        await route.fulfill({
          status: 200,

          contentType: "text/event-stream",

          body: "event: ready\ndata: {}\n\n",
        })

        return
      } else if (path === "/settings") data = {}

      await route.fulfill({
        status,

        contentType: "application/json",

        body: JSON.stringify({ code: status, msg: "Success", data }),
      })
    },
  )

  return { page, writes }
}

async function verify(page) {
  await page.getByLabel("邮箱 *", { exact: true }).fill("new@test.invalid")

  await page.getByRole("button", { name: "发送验证码", exact: true }).click()

  await page.getByLabel("邮箱验证码", { exact: true }).fill("123456")

  await page.getByRole("button", { name: "验证邮箱", exact: true }).click()
}

test("three-stage registration requires multi-selects and verified email, unavailable datacenters are disabled", async (t) => {
  const { page, writes } = await setup(t)

  await page.goto(URL + "#register", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })

  await page

    .getByRole("heading", { name: "企业入驻申请", exact: true })

    .waitFor()

  assert.equal(
    await page

      .getByLabel("数据中心")

      .locator("option[value=eu]")

      .getAttribute("disabled"),

    "",
  )

  await page.getByLabel("企业名称 *").fill("测试企业")

  await page.getByLabel("安装商", { exact: true }).check()

  await page.getByLabel("运营商", { exact: true }).check()

  await page.getByLabel("工商业储能", { exact: true }).check()

  for (const [label, value] of [
    ["国家 *", "Germany"],

    ["省 / 州 *", "Berlin"],

    ["城市 *", "Berlin"],

    ["详细地址 *", "Test address"],

    ["邮编 *", "10115"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value)

  await page.getByRole("button", { name: "下一步", exact: true }).click()

  await page.getByLabel("联系人 *", { exact: true }).fill("申请人")

  await page.getByLabel("国际电话 *", { exact: true }).fill("+49 3012345678")

  assert.equal(
    await page

      .getByRole("button", { name: "提交申请", exact: true })

      .isDisabled(),

    true,
  )

  await verify(page)

  await page.getByRole("button", { name: "提交申请", exact: true }).click()

  await page.getByRole("heading", { name: "申请已提交" }).waitFor()

  const submit = writes.find((w) => w.path === "/public/company-applications")

  assert.deepEqual(submit.body.company.companyTypes, ["installer", "operator"])

  assert.equal(submit.body.context, "verified-context")

  assert.equal(submit.body.company.contactName, "申请人")

  assert.equal(
    writes.some((w) => w.path === "/auth/login"),

    false,
  )
})

test("progress is shown only after email verification and includes rejection reason", async (t) => {
  const { page, writes } = await setup(t)

  await page.goto(URL + "#application-progress", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })

  assert.equal(
    writes.some((w) => w.path.endsWith("/progress")),

    false,
  )

  await verify(page)

  await page.getByText("补充注册资料", { exact: true }).waitFor()

  assert.equal(
    writes.find((w) => w.path.endsWith("/progress")).body.email,

    "new@test.invalid",
  )
})

test("activation opens even during an existing session, inspect does not activate, strong matching passwords are required", async (t) => {
  const { page, writes } = await setup(t, { loggedIn: true })

  await page.goto(URL + "#activate=" + "A".repeat(43), {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  })

  await page.getByRole("heading", { name: "设置密码并激活账号" }).waitFor()

  await page.getByLabel("新密码", { exact: true }).fill("StrongPassword7")

  await page.getByLabel("确认新密码", { exact: true }).fill("WrongPassword7")

  await page.getByRole("button", { name: "激活账号", exact: true }).click()

  await page.getByRole("alert").filter({ hasText: "两次密码不一致" }).waitFor()

  assert.equal(
    writes.some((w) => w.path.endsWith("/accept")),

    false,
  )

  await page.getByLabel("确认新密码", { exact: true }).fill("StrongPassword7")

  await page.getByRole("button", { name: "激活账号", exact: true }).click()

  await page.getByText("账号已激活，请使用新密码登录。").waitFor()

  assert.equal(writes.filter((w) => w.path.endsWith("/accept")).length, 1)

  assert.equal(new globalThis.URL(page.url()).hash, "")
})
