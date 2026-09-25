const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const artifacts = path.resolve(__dirname, "../.figma/strategy");
test(
  "R10 local strategy creation, all mode settings, confirmation, persistence and honest dispatch",
  { timeout: 180000 },
  async () => {
    await fs.mkdir(artifacts, { recursive: true });
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() =>
      localStorage.setItem(
        "enerlution-auth-session-v1",
        JSON.stringify({ userId: "user-integrator-demo" }),
      ),
    );
    try {
      await page.goto(process.env.DEMO_PREVIEW_URL || "http://127.0.0.1:8450", {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("button", { name: "资产与站点", exact: true })
        .click();
      await page.locator(".station-name-button").first().click();
      await page.getByRole("button", { name: "策略运行", exact: true }).click();
      await page.getByRole("heading", { name: "今日电价与运行模式" }).waitFor();
      await page.screenshot({
        path: path.join(artifacts, "overview-1440.png"),
      });
      await page
        .getByRole("button", { name: "新增策略方案", exact: true })
        .click();
      await page.getByLabel("方案名称", { exact: true }).fill("周末本地策略");
      await page
        .getByRole("button", { name: "创建并配置", exact: true })
        .click();
      await page.getByRole("button", { name: "新增时段", exact: true }).click();
      let dialog = page.getByRole("dialog");
      await dialog.getByLabel("开始时间", { exact: true }).fill("07:00");
      await dialog.getByLabel("结束时间", { exact: true }).fill("10:00");
      for (const mode of [
        "动态电价优化",
        "光伏自发自用",
        "新能源平滑",
        "峰谷套利",
      ]) {
        await dialog.getByRole("button", { name: mode, exact: true }).click();
        await page.screenshot({
          path: path.join(artifacts, `base-${mode}.png`),
        });
      }
      await dialog
        .getByRole("button", { name: "新增充电时段", exact: true })
        .click();
      await dialog.getByLabel("充电1开始").fill("07:00");
      await dialog.getByLabel("充电1结束").fill("10:00");
      await dialog.getByLabel("充电1功率").fill("20");
      await dialog.getByRole("switch", { name: "高级模式设置" }).click();
      await dialog
        .getByRole("button", { name: "覆盖模式", exact: true })
        .click();
      for (const mode of [
        "需量控制",
        "容量保护",
        "备电保障",
        "一次调频",
        "VPP",
        "AGC",
        "调峰",
        "AVC",
      ]) {
        await dialog.getByRole("button", { name: mode, exact: true }).click();
        await dialog
          .getByRole("heading", { name: mode, exact: true })
          .waitFor();
        await page.screenshot({
          path: path.join(artifacts, `overlay-${mode}.png`),
        });
      }
      assert.equal(
        await dialog
          .getByRole("button", { name: "下发（未接入）", exact: true })
          .isDisabled(),
        true,
      );
      await dialog
        .getByRole("button", { name: "需量控制", exact: true })
        .click();
      await dialog.getByRole("checkbox", { name: "启用需量控制" }).check();
      await dialog
        .getByRole("button", { name: "模式优先级", exact: true })
        .click();
      await page.screenshot({ path: path.join(artifacts, "priority.png") });
      await dialog
        .getByRole("button", { name: "保存设置", exact: true })
        .click();
      await page
        .getByRole("button", { name: "编辑默认配置", exact: true })
        .click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("最低保留电量").fill("33");
      await dialog
        .getByRole("button", { name: "保存默认设置", exact: true })
        .click();
      await page.getByRole("button", { name: "保存策略", exact: true }).click();
      await page
        .getByRole("status")
        .filter({ hasText: "本地草稿已保存" })
        .waitFor();
      await page.screenshot({ path: path.join(artifacts, "editor-1440.png") });
      await page.getByRole("button", { name: "AI 策略", exact: true }).click();
      await page.getByLabel("目标或约束").fill("优先保供");
      await page
        .getByRole("button", { name: "预览本地草案", exact: true })
        .click();
      await page.getByRole("button", { name: "查看差异", exact: true }).click();
      await page.getByText("原方案不会被修改", { exact: false }).waitFor();
      await page
        .getByRole("button", { name: "插入为新方案", exact: true })
        .click();
      await page.getByRole("status").filter({ hasText: "尚未提交" }).waitFor();
      await page
        .getByRole("button", { name: "返回综合页", exact: true })
        .click();
      await page
        .getByRole("button", { name: "删除周末本地策略", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "删除策略方案？" })
        .getByRole("button", { name: "取消", exact: true })
        .click();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page
        .getByRole("button", { name: "资产与站点", exact: true })
        .click();
      await page.locator(".station-name-button").first().click();
      await page.getByRole("button", { name: "策略运行", exact: true }).click();
      await page
        .getByRole("button", { name: "编辑周末本地策略", exact: true })
        .click();
      await page.getByText("最低保留电量 33%", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "删除时段1", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "删除策略时段？" })
        .getByRole("button", { name: "删除时段", exact: true })
        .click();
      await page.getByRole("button", { name: "保存策略", exact: true }).click();
      for (const width of [1366, 1920]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
        );
        await page.screenshot({
          path: path.join(artifacts, `editor-${width}.png`),
        });
      }
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  },
);

test(
  "API strategy local configuration cannot generate AI or dispatch and revocation closes editors",
  { timeout: 90000 },
  async () => {
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.setDefaultTimeout(10000);
    await page.addInitScript(() =>
      sessionStorage.setItem("enerlution-api-token", "strategy-editor-test"),
    );
    let user = {
      id: "77",
      name: "策略用户",
      account: "strategy@test",
      role: "integrator",
      organization: "测试",
      stationIds: ["12"],
      permissions: ["asset.read", "strategy.read", "strategy.manage"],
      stationPermissions: {
        12: ["asset.read", "strategy.read", "strategy.manage"],
      },
      organizationPermissions: {},
    };
    const writes = [];
    await page.route("http://127.0.0.1:18090/api/**", async (route) => {
      const req = route.request(),
        endpoint = new URL(req.url()).pathname.slice(4);
      if (req.method() !== "GET") writes.push(endpoint);
      let data = [];
      if (endpoint === "/auth/me") data = user;
      else if (endpoint === "/stations")
        data = [
          {
            id: 12,
            name: "API策略站点",
            code: "STRATEGY",
            rated_power_kw: 100,
            capacity_kwh: 200,
          },
        ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, data }),
      });
    });
    try {
      await page.goto(process.env.API_PREVIEW_URL || "http://127.0.0.1:8451", {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("button", { name: "资产与站点", exact: true })
        .click();
      await page
        .getByRole("button", { name: "API策略站点", exact: true })
        .click();
      await page.getByRole("button", { name: "策略运行", exact: true }).click();
      await page
        .getByRole("button", { name: "新增策略方案", exact: true })
        .click();
      await page.getByLabel("方案名称", { exact: true }).fill("API本地草稿");
      await page
        .getByRole("button", { name: "创建并配置", exact: true })
        .click();
      await page.getByRole("button", { name: "AI 策略", exact: true }).click();
      await page
        .getByText(
          "AI 生成服务未接通，暂无服务端生成内容。现有方案保持不变。",
          { exact: true },
        )
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "生成草案（未接通）", exact: true })
          .isDisabled(),
        true,
      );
      await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
      await page.getByRole("button", { name: "新增时段", exact: true }).click();
      let dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "光伏自发自用", exact: true })
        .click();
      await dialog.getByLabel("最低保留电量", { exact: true }).fill("101");
      await dialog
        .getByRole("button", { name: "保存设置", exact: true })
        .click();
      await dialog
        .getByRole("alert")
        .filter({ hasText: "最低保留电量" })
        .waitFor();
      await dialog.getByLabel("最低保留电量", { exact: true }).fill("25");
      await dialog
        .getByRole("button", { name: "保存设置", exact: true })
        .click();
      await page.getByRole("button", { name: "保存策略", exact: true }).click();
      await page.getByRole("button", { name: "新增时段", exact: true }).click();
      dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "保存设置", exact: true })
        .click();
      await dialog.getByRole("alert").filter({ hasText: "重叠" }).waitFor();
      await dialog.getByRole("button", { name: "取消", exact: true }).click();
      await page
        .getByRole("button", { name: "编辑时段1", exact: true })
        .click();
      user = {
        ...user,
        permissions: ["asset.read", "strategy.read"],
        stationPermissions: { 12: ["asset.read", "strategy.read"] },
      };
      const refreshed = page.waitForResponse((r) =>
        r.url().endsWith("/auth/me"),
      );
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await refreshed;
      await page.getByRole("dialog").waitFor({ state: "detached" });
      assert.equal(
        await page
          .getByRole("button", { name: "保存策略", exact: true })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "新增时段", exact: true })
          .isDisabled(),
        true,
      );
      assert.deepEqual(writes, []);
      await page.screenshot({
        path: path.join(artifacts, "api-readonly-editor.png"),
      });
    } finally {
      await browser.close();
    }
  },
);

test(
  "review fixes: Shanghai boundary, exclusive tariff expiry, native currency and external local draft persistence",
  { timeout: 120000 },
  async () => {
    const browser = await chromium.launch({
      channel: "msedge",
      headless: true,
    });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      timezoneId: "America/Los_Angeles",
    });
    page.setDefaultTimeout(10000);
    await page.clock.install({ time: new Date("2026-09-26T17:00:00Z") });
    await page.addInitScript(() =>
      sessionStorage.setItem("enerlution-api-token", "strategy-review"),
    );
    const permissions = [
      "asset.read",
      "strategy.read",
      "strategy.manage",
      "tariff.read",
    ];
    const user = {
      id: "78",
      name: "策略审查",
      account: "review@test",
      role: "integrator",
      organization: "测试",
      stationIds: ["12"],
      permissions,
      stationPermissions: { 12: permissions },
      organizationPermissions: {},
    };
    const expired = {
      id: 1,
      valid_from: "2026-09-01",
      valid_until: "2026-09-27",
      currency: "CNY",
      periods: [{ start_minute: 0, end_minute: 1440, price_per_kwh: 999 }],
    };
    let tariffs = [expired];
    const writes = [];
    await page.route("http://127.0.0.1:18090/api/**", async (route) => {
      const req = route.request(),
        endpoint = new URL(req.url()).pathname.slice(4);
      if (req.method() !== "GET") writes.push(endpoint);
      let data = [];
      if (endpoint === "/auth/me") data = user;
      else if (endpoint === "/stations")
        data = [
          {
            id: 12,
            name: "审查策略站点",
            code: "REVIEW",
            rated_power_kw: 100,
            capacity_kwh: 200,
          },
        ];
      else if (endpoint === "/stations/12/tariffs") data = tariffs;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, data }),
      });
    });
    const open = async () => {
      await page.goto(process.env.API_PREVIEW_URL || "http://127.0.0.1:8451", {
        waitUntil: "domcontentloaded",
      });
      await page
        .getByRole("button", { name: "资产与站点", exact: true })
        .click();
      await page
        .getByRole("button", { name: "审查策略站点", exact: true })
        .click();
      await page.getByRole("button", { name: "策略运行", exact: true }).click();
    };
    try {
      await open();
      assert.equal(await page.getByLabel("运行模式生效日").inputValue(), "6");
      await page.getByText("2026-09-27", { exact: true }).waitFor();
      await page
        .getByText("暂无当前日期的有效电价数据", { exact: true })
        .waitFor();
      assert.equal(
        await page.locator(".strategy-chart .recharts-line-curve").count(),
        0,
      );
      tariffs = [
        expired,
        {
          id: 2,
          valid_from: "2026-09-27",
          valid_until: "2026-10-01",
          currency: "EUR",
          periods: [{ start_minute: 0, end_minute: 1440, price_per_kwh: 0.25 }],
        },
      ];
      await page.reload({ waitUntil: "domcontentloaded" });
      await open();
      await page.getByText("电价（EUR/kWh）", { exact: true }).waitFor();
      await page
        .locator(".strategy-chart .recharts-line-curve")
        .waitFor({ state: "attached" });
      await page
        .getByRole("button", { name: "新增策略方案", exact: true })
        .click();
      await page
        .getByLabel("方案名称", { exact: true })
        .fill("外部模式本地草稿");
      await page
        .getByRole("button", { name: "创建并配置", exact: true })
        .click();
      await page.getByRole("button", { name: "新增时段", exact: true }).click();
      let dialog = page.getByRole("dialog");
      await dialog.getByRole("switch", { name: "高级模式设置" }).click();
      await dialog
        .getByRole("button", { name: "覆盖模式", exact: true })
        .click();
      const modes = [
        ["VPP", "调度功率上限", "35"],
        ["AGC", "跟踪功率上限", "25"],
        ["调峰", "最大充电功率", "20"],
        ["AVC", "目标电压", "10.5"],
      ];
      for (const [mode, label, value] of modes) {
        await dialog.getByRole("button", { name: mode, exact: true }).click();
        await dialog.getByLabel(label, { exact: true }).fill(value);
        if (mode === "调峰")
          await dialog.getByLabel("最大放电功率", { exact: true }).fill("30");
        if (mode === "AVC")
          await dialog.getByLabel("无功功率限值", { exact: true }).fill("50");
        const connection = dialog.getByLabel(
          mode === "VPP" ? "接入状态" : "BSP通信",
          { exact: true },
        );
        assert.equal(await connection.inputValue(), "未接入");
        assert.equal(await connection.isDisabled(), true);
        await dialog
          .getByRole("checkbox", { name: `纳入本地预览：${mode}`, exact: true })
          .check();
        assert.equal(
          await dialog
            .getByRole("button", { name: "下发（未接入）", exact: true })
            .isDisabled(),
          true,
        );
      }
      await page.screenshot({
        path: path.join(artifacts, "external-local-avc.png"),
      });
      await dialog
        .getByRole("button", { name: "保存设置", exact: true })
        .click();
      await page.getByRole("button", { name: "保存策略", exact: true }).click();
      await page.reload({ waitUntil: "domcontentloaded" });
      await open();
      await page
        .getByRole("button", { name: "编辑外部模式本地草稿", exact: true })
        .click();
      await page
        .getByRole("button", { name: "编辑时段1", exact: true })
        .click();
      dialog = page.getByRole("dialog");
      await dialog
        .getByRole("button", { name: "覆盖模式", exact: true })
        .click();
      for (const [mode, label, value] of modes) {
        await dialog.getByRole("button", { name: mode, exact: true }).click();
        assert.equal(
          await dialog.getByLabel(label, { exact: true }).inputValue(),
          value,
        );
        assert.equal(
          await dialog
            .getByRole("checkbox", {
              name: `纳入本地预览：${mode}`,
              exact: true,
            })
            .isChecked(),
          true,
        );
      }
      assert.deepEqual(writes, []);
    } finally {
      await browser.close();
    }
  },
);
