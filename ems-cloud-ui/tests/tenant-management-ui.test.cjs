const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright")

const URL =
  process.env.TENANT_PREVIEW_URL ||
  process.env.API_PREVIEW_URL ||
  "http://127.0.0.1:8447/"

const pathMenu = (path, id) => ({
  id,

  client: "web",

  kind: "page",

  nameKey: path,

  path,

  permissionCode: path,

  children: [],
})

async function setup(
  t,

  {
    kind = "enterprise",

    routes = ["company.people", "company.roles", "company.profile"],

    failInvite = false,
  } = {},
) {
  const browser = await chromium.launch({ channel: "msedge", headless: true })

  t.after(() => browser.close())

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })

  const page = await context.newPage()

  page.setDefaultTimeout(10000)

  const errors = [],
    writes = []

  page.on("pageerror", (e) => errors.push(e.message))

  t.after(() => assert.deepEqual(errors, []))

  await context.addInitScript(() =>
    sessionStorage.setItem("enerlution-api-token", "tenant-ui-test"),
  )

  const menus = [
    {
      id: 1,

      parent_id: null,

      client: "web",

      kind: "directory",

      name_key: "nav.assets",

      applicable_side: "both",

      enabled: true,
    },

    {
      id: 2,

      parent_id: 1,

      client: "web",

      kind: "page",

      name_key: "page.assets",

      permission_code: "asset.read",

      route_path: "assets",

      configurable: true,

      enabled: true,
    },

    {
      id: 3,

      parent_id: 2,

      client: "web",

      kind: "action",

      name_key: "action.asset.edit",

      permission_code: "asset.edit",

      configurable: true,

      enabled: true,
    },

    {
      id: 4,

      parent_id: null,

      client: "app",

      kind: "directory",

      name_key: "nav.assets",

      applicable_side: "both",

      enabled: true,
    },

    {
      id: 5,

      parent_id: 4,

      client: "app",

      kind: "page",

      name_key: "page.assets",

      permission_code: "asset.read",

      route_path: "assets",

      configurable: true,

      enabled: true,
    },
  ]

  const user = {
    id: "1",

    name: "租户管理员",

    account: "admin@test.invalid",

    role: "operator",

    organization: "验收企业",

    tenant: { actorId: 1, tenantId: 2, kind, administrator: true },

    menus: routes.map(pathMenu),

    roleNames: ["Super Admin"],

    stationIds: [],

    stationPermissions: {},

    permissions: [
      "company.people.read",

      "company.people.manage",

      "company.grant.manage",

      "company.role.manage",

      "company.profile.read",

      "company.profile.manage",

      "company.application.read",

      "company.application.review",

      "company.read",

      "company.manage",

      "menu.manage",

      "package.manage",

      "role.template.manage",
    ],
  }

  const people = [
    {
      id: 1,

      account: user.account,

      display_name: user.name,

      status: "active",

      administrator: true,

      roles: [],

      managedStations: [],
    },

    {
      id: 2,

      account: "invited@test.invalid",

      display_name: "待激活员工",

      status: "invited",

      administrator: false,

      roles: [],

      managedStations: [],
    },
  ]

  let roles = [
    {
      id: "administrator",

      name: "Super Admin",

      source: "system",

      readonly: true,

      permissions: [],
    },

    {
      id: 10,

      name: "Viewer",

      source: "template",

      readonly: true,

      enabled: true,

      permissions: [{ code: "asset.read", client: "web" }],
    },

    {
      id: 20,

      name: "Viewer",

      source: "custom",

      readonly: false,

      enabled: true,

      member_count: 0,

      permissions: [],
    },
  ]

  await page.route(
    /^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,
    async (route) => {
      const request = route.request(),
        url = new globalThis.URL(request.url()),
        path = url.pathname.slice(4),
        method = request.method()

      let data = [],
        status = 200,
        msg = "Success"

      const body = request.postData() ? request.postDataJSON() : null

      if (!["GET", "OPTIONS"].includes(method))
        writes.push({ path, method, body })

      if (path === "/auth/me") data = user
      else if (path === "/me/capabilities/events") {
        await route.fulfill({
          status: 200,

          contentType: "text/event-stream",

          body: "event: ready\ndata: {}\n\n",
        })

        return
      } else if (path === "/settings")
        data = { language: "简体中文", timezone: "Asia/Shanghai" }
      else if (path === "/company/people" && method === "GET")
        data = { items: people, total: 2 }
      else if (path === "/company/people" && method === "POST") {
        if (failInvite) {
          status = 409

          msg = "邮箱已属于另一企业"

          data = null
        } else data = { id: 3, status: "invited", mailStatus: "pending" }
      } else if (path === "/company/roles/options") data = { menus }
      else if (path === "/company/roles" && method === "GET") data = roles
      else if (path === "/company/roles" && method === "POST") {
        roles.push({
          id: 21,

          ...body,

          source: "custom",

          readonly: false,

          enabled: true,

          member_count: 0,
        })

        data = { id: 21 }
      } else if (path === "/company/member-grants/options")
        data = {
          roles: [
            { id: 10, name: "Viewer", source: "template" },

            { id: 20, name: "Viewer", source: "custom" },
          ],

          stations: [
            { id: 4, name: "站点 A" },

            { id: 5, name: "站点 B" },
          ],
        }
      else if (path === "/company/member-grants")
        data = method === "GET" ? [] : { id: 30 }
      else if (path === "/platform/company-applications")
        data = {
          items: [
            {
              id: 8,

              number: "APP-TEST",

              name: "申请企业",

              email: "new@test.invalid",

              contact_name: "申请人",

              status: "pending",

              submitted_at: "2026-10-13T01:00:00Z",
            },
          ],

          total: 1,
        }
      else if (path === "/platform/company-applications/8")
        data = {
          id: 8,

          number: "APP-TEST",

          name: "申请企业",

          email: "new@test.invalid",

          status: "pending",

          companyTypes: ["operator"],

          businessScopes: ["commercial"],

          events: [],
        }
      else if (path === "/platform/company-applications/8/reject") {
        status = 409

        msg = "该申请已被处理，请刷新列表"

        data = null
      } else if (path === "/platform/company-options")
        data = {
          packages: [{ id: 1, name: "基础权限包", enabled: true }],

          tags: [],
        }
      else if (path === "/platform/permission-options")
        data = {
          menus,

          templates: [{ id: 10, name: "Viewer", enabled: true }],

          permissions: [],

          routes: ["assets"],
        }
      else if (path === "/platform/menus") data = menus
      else if (path === "/platform/permission-packages")
        data = [
          {
            id: 1,

            name: "基础权限包",

            enabled: true,

            companyTypes: ["operator"],

            menuIds: [1, 4],

            templateIds: [10],

            company_count: 2,
          },
        ]
      else if (path.endsWith("/impact")) data = { referencingCompanies: 2 }

      await route.fulfill({
        status,

        contentType: "application/json",

        body: JSON.stringify({ code: status, msg, data }),
      })
    },
  )

  await page.goto(URL, { waitUntil: "domcontentloaded" })

  try {
    await page.getByRole("button", { name: "平台管理", exact: true }).click()
  } catch (e) {
    console.log(
      "Visible page:",

      (await page.locator("body").innerText()).slice(0, 1000),
    )

    throw e
  }

  return { page, writes }
}

test("invitation conflicts retain input, protected admins have no disable button, grants identify source", async (t) => {
  const { page, writes } = await setup(t, { failInvite: true })

  const admin = page.getByRole("row").filter({ hasText: "admin@test.invalid" })

  assert.equal(
    await admin.getByRole("button", { name: "停用", exact: true }).count(),

    0,
  )

  await page.getByRole("button", { name: "邀请员工", exact: true }).click()

  const dialog = page.getByRole("dialog", { name: "邀请新员工", exact: true })

  await dialog.getByLabel("显示名称 *").fill("测试员工")

  await dialog.getByLabel("登录邮箱 *").fill("taken@test.invalid")

  await dialog.getByRole("button", { name: "保存", exact: true }).click()

  await dialog

    .getByRole("alert")

    .filter({ hasText: "邮箱已属于另一企业" })

    .waitFor()

  assert.equal(
    await dialog.getByLabel("登录邮箱 *").inputValue(),

    "taken@test.invalid",
  )

  await dialog.getByRole("button", { name: "取消", exact: true }).click()

  await dialog.getByRole("button", { name: "放弃修改", exact: true }).click()

  await page

    .getByRole("row")

    .filter({ hasText: "invited@test.invalid" })

    .getByRole("button", { name: "配置授权" })

    .click()

  await page.getByRole("button", { name: "分配角色", exact: true }).click()

  const grant = page.getByRole("dialog", { name: "配置角色授权", exact: true })

  assert.equal(
    await grant

      .getByLabel("角色 *")

      .locator("option")

      .filter({ hasText: "Viewer" })

      .count(),

    2,
  )

  await grant.getByLabel("角色 *").selectOption("template:10")

  await grant.getByLabel("站点 A").check()

  await grant.getByRole("button", { name: "保存", exact: true }).click()

  assert.equal(
    writes.find((w) => w.path === "/company/member-grants").body.templateId,

    10,
  )

  assert.deepEqual(
    writes.find((w) => w.path === "/company/member-grants").body.stationIds,

    [4],
  )
})

test("predefined roles are read-only and custom role parent selection keeps Web and App separate", async (t) => {
  const { page, writes } = await setup(t)

  await page.getByRole("button", { name: "角色管理", exact: true }).click()

  await page.getByRole("button").filter({ hasText: "Viewer预制" }).click()

  assert.equal(
    await page.getByRole("button", { name: "编辑", exact: true }).count(),

    0,
  )

  await page.getByRole("button", { name: "新增自定义角色" }).click()

  const dialog = page.getByRole("dialog", {
    name: "新增自定义角色",

    exact: true,
  })

  await dialog.getByLabel("角色名称 *").fill("Viewer")

  await dialog

    .locator(".tenant-permission")

    .first()

    .locator(":scope > label input")

    .check()

  await dialog.getByRole("button", { name: "App 应用" }).click()

  assert.equal(await dialog.locator("input[type=checkbox]:checked").count(), 0)

  await dialog.getByRole("button", { name: "保存", exact: true }).click()

  const saved = writes.find(
    (w) => w.path === "/company/roles" && w.method === "POST",
  )

  assert.deepEqual(saved.body.permissions, [
    { code: "asset.read", client: "web" },

    { code: "asset.edit", client: "web" },
  ])
})

test("approval conflict remains visible and reject requires a reason", async (t) => {
  const { page, writes } = await setup(t, {
    kind: "platform",

    routes: ["platform.approvals"],
  })

  await page.getByRole("button", { name: "查看申请" }).click()

  await page.getByRole("button", { name: "拒绝申请" }).click()

  const dialog = page.getByRole("dialog", { name: "拒绝企业申请", exact: true })

  await dialog.getByRole("button", { name: "保存", exact: true }).click()

  assert.equal(
    writes.some((w) => w.path.endsWith("/reject")),

    false,
  )

  await dialog.getByLabel("拒绝原因 *").fill("资料需要补充")

  await dialog.getByRole("button", { name: "保存", exact: true }).click()

  await dialog

    .getByRole("alert")

    .filter({ hasText: "该申请已被处理" })

    .waitFor()

  assert.equal(
    await dialog.getByLabel("拒绝原因 *").inputValue(),

    "资料需要补充",
  )
})

test("package status previews impact before explicit confirmation", async (t) => {
  const { page, writes } = await setup(t, {
    kind: "platform",

    routes: ["platform.packages"],
  })

  await page.getByRole("button", { name: "停用", exact: true }).click()

  const dialog = page.getByRole("dialog", {
    name: "确认停用权限包",

    exact: true,
  })

  await dialog.getByText("关联企业数：2").waitFor()

  assert.equal(
    writes.some((w) => w.path.endsWith("/status")),

    false,
  )

  await dialog.getByRole("button", { name: "保存", exact: true }).click()

  assert.deepEqual(writes.find((w) => w.path.endsWith("/status")).body, {
    enabled: false,

    confirmed: true,
  })
})

test("platform permissions use grouped navigation and a collapsible menu tree with protected deletion", async (t) => {
  const { page } = await setup(t, {
    kind: "platform",
    routes: [
      "platform.approvals",
      "platform.companies",
      "platform.packages",
      "platform.menus",
      "platform.templates",
    ],
  })

  const primary = page.getByRole("navigation", {
    name: "平台管理",
    exact: true,
  })

  assert.equal(
    await primary
      .getByRole("button", { name: "菜单管理", exact: true })
      .count(),
    0,
  )

  await primary.getByRole("button", { name: "权限管理", exact: true }).click()

  await page.getByRole("button", { name: "菜单管理", exact: true }).click()

  const root = page.getByRole("row").filter({ hasText: "资产与站点" }).first()

  assert.equal(
    await root.getByRole("button", { name: "删除", exact: true }).isDisabled(),
    true,
  )

  await root
    .getByRole("button", { name: "收起资产与站点", exact: true })
    .click()

  assert.equal(
    await page.getByRole("row").filter({ hasText: "asset.edit" }).count(),
    0,
  )

  await root
    .getByRole("button", { name: "展开资产与站点", exact: true })
    .click()

  const action = page.getByRole("row").filter({ hasText: "asset.edit" })

  assert.equal(
    await action.getByRole("button", { name: "添加下级", exact: true }).count(),
    0,
  )

  await page.getByRole("button", { name: "新增一级菜单", exact: true }).click()

  await page
    .getByRole("dialog", { name: "新增一级菜单", exact: true })
    .waitFor()
})
