const test = require("node:test"),
  assert = require("node:assert/strict"),
  { chromium } = require("playwright"),
  fs = require("node:fs/promises"),
  path = require("node:path")
test(
  "auto arrange repairs a moved member, aligns wires and undoes the complete layout in one step",
  { timeout: 90000 },
  async () => {
    const browser = await chromium.launch({ channel: "msedge", headless: true })
    try {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1080 },
      })
      page.setDefaultTimeout(15000)
      const errors = []
      page.on("pageerror", (e) => errors.push(e.message))
      await page.addInitScript(() =>
        sessionStorage.setItem("enerlution-api-token", "topology-arrange"),
      )
      await page.route(
        /^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//,
        async (route) => {
          const p = new URL(route.request().url()).pathname,
            data =
              p === "/api/auth/me"
                ? {
                    id: "7",
                    name: "拓扑验收",
                    tenantName: "测试企业",
                    tenant: {
                      actorId: 7,
                      tenantId: 2,
                      kind: "enterprise",
                      administrator: true,
                    },
                    menus: [
                      {
                        id: 1,
                        client: "web",
                        kind: "page",
                        path: "assets",
                        children: [],
                      },
                    ],
                    roleNames: ["Admin"],
                    stationIds: [],
                    permissions: ["asset.read", "asset.edit", "asset.create"],
                    stationPermissions: {},
                  }
                : p === "/api/settings"
                  ? { language: "简体中文", theme: "跟随系统" }
                  : []
          await route.fulfill({ json: { code: 200, data } })
        },
      )
      await page.goto(process.env.API_PREVIEW_URL || "http://127.0.0.1:8461/", {
        waitUntil: "domcontentloaded",
      })
      await page
        .getByRole("navigation", { name: "一级导航" })
        .getByRole("button", { name: "电站管理", exact: true })
        .click()
      await page
        .getByRole("button", { name: "＋ 新增站点", exact: true })
        .click()
      await page.getByLabel("站点名称 *", { exact: true }).fill("自动整理验收")
      await page.getByLabel("站点 ID *", { exact: true }).fill("ARRANGE-TEST")
      await page.getByLabel("所在地区 *", { exact: true }).selectOption("欧洲")
      await page.getByLabel("详细地址 *", { exact: true }).fill("Berlin")
      await page.getByRole("radio", { name: "光储充", exact: true }).check()
      await page.getByRole("button", { name: "下一步", exact: true }).click()
      await page.locator(".topology-studio").waitFor()
      const pcs = page.getByRole("button", {
        name: "配置 储能 PCS 1",
        exact: true,
      })
      await pcs.focus()
      for (let i = 0; i < 8; i++) await page.keyboard.press("Shift+ArrowRight")
      for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowUp")
      const snapshot = () =>
        page
          .locator(".topo-card,.topo-cabinet")
          .evaluateAll((nodes) =>
            nodes.map((n) => ({
              label: n.getAttribute("aria-label"),
              style: n.getAttribute("style"),
            })),
          )
      const moved = await snapshot()
      await page.getByRole("button", { name: "整理布局", exact: true }).click()
      await page.waitForTimeout(100)
      const arranged = await snapshot()
      assert.notDeepEqual(arranged, moved)
      const cabinet = await page.locator(".topo-cabinet").boundingBox()
      for (const name of ["储能 PCS 1", "电池系统 1", "光伏 DC/DC 1"]) {
        const card = await page
          .getByRole("button", { name: "配置 " + name, exact: true })
          .boundingBox()
        assert.ok(
          card.x >= cabinet.x &&
            card.x + card.width <= cabinet.x + cabinet.width &&
            card.y >= cabinet.y &&
            card.y + card.height <= cabinet.y + cabinet.height,
          name + " stays in cabinet",
        )
      }
      const geometry = await page
        .locator(".topo-card")
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            label: n.getAttribute("aria-label"),
            x: parseFloat(n.style.left),
            y: parseFloat(n.style.top),
            w: parseFloat(n.style.width),
            h: parseFloat(n.style.height),
          })),
        )
      for (let i = 0; i < geometry.length; i++)
        for (let j = i + 1; j < geometry.length; j++) {
          const a = geometry[i],
            b = geometry[j]
          assert.ok(
            a.x + a.w / 2 <= b.x - b.w / 2 ||
              b.x + b.w / 2 <= a.x - a.w / 2 ||
              a.y + a.h / 2 <= b.y - b.h / 2 ||
              b.y + b.h / 2 <= a.y - a.h / 2,
            "cards and buses must not overlap",
          )
        }
      const paths = await page
        .locator(".topo-wires path")
        .evaluateAll((paths) => paths.map((p) => p.getAttribute("d")))
      assert.ok(paths.length >= 5)
      for (const p of paths) {
        assert.ok(!/NaN|undefined/.test(p))
        const points = [...p.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(
          (m) => [+m[1], +m[2]],
        )
        assert.ok(points.length >= 2)
        for (let i = 1; i < points.length; i++)
          assert.ok(
            points[i][0] === points[i - 1][0] ||
              points[i][1] === points[i - 1][1],
          )
      }
      const dir = path.resolve(__dirname, "../.figma/topology-arrange")
      await fs.mkdir(dir, { recursive: true })
      await page.screenshot({
        path: path.join(dir, "arranged-1440.png"),
        fullPage: true,
        animations: "disabled",
      })
      await page.getByRole("button", { name: "撤销", exact: true }).click()
      assert.deepEqual(
        await snapshot(),
        moved,
        "one undo restores every coordinate and size",
      )
      await page.getByRole("button", { name: "重做", exact: true }).click()
      assert.deepEqual(await snapshot(), arranged)
      await page.getByRole("button", { name: "整理布局", exact: true }).click()
      assert.deepEqual(await snapshot(), arranged, "second arrange is stable")
      assert.deepEqual(errors, [])
    } finally {
      await browser.close()
    }
  },
)
