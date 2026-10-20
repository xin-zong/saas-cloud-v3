const test = require('node:test'), assert = require('node:assert/strict'), { chromium } = require('playwright');

test('production station entry starts blank, offers only real templates and restores the saved draft', { timeout: 90000 }, async () => {
 const browser = await chromium.launch({ channel: 'msedge', headless: true });
 try {
  const page = await browser.newPage(); page.setDefaultTimeout(12000);
  await page.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'production-entry'));
  await page.route(/^http:\/\/127\.0\.0\.1:(18090|18092)\/api\//, async route => {
   const data = new URL(route.request().url()).pathname === '/api/auth/me' ? { id: '7', name: '建站测试', tenantName: '测试企业', tenant: { actorId: 7, tenantId: 2, kind: 'enterprise', administrator: true }, menus: [{ id: 1, client: 'web', kind: 'page', path: 'assets', children: [] }], roleNames: ['Admin'], stationIds: [], permissions: ['asset.read', 'asset.edit', 'asset.create'], stationPermissions: {} } : [];
   await route.fulfill({ json: { code: 200, data } });
  });
  async function open() {
   await page.goto(process.env.API_PREVIEW_URL || 'http://127.0.0.1:8461/', { waitUntil: 'domcontentloaded', timeout: 60000 });
   await page.getByRole('navigation', { name: '一级导航' }).getByRole('button', { name: '电站管理', exact: true }).click();
   await page.getByRole('button', { name: '＋ 新增站点', exact: true }).click();
  }
  await open();
  assert.equal(await page.getByRole('button', { name: /载入.*示例/ }).count(), 0);
  assert.deepEqual(await page.getByRole('radiogroup', { name: '拓扑起始模板' }).getByRole('radio').evaluateAll(inputs => inputs.map(input => input.getAttribute('aria-label'))), ['光储协同', '工商业储能', '光储充', '自定义空白拓扑']);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  const key = 'enerlution_station_provision_v1:api:7:new';
  const blank = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(blank.name, ''); assert.equal(blank.code, ''); assert.equal(blank.template, '自定义空白拓扑'); assert.deepEqual(blank.devices, []); assert.deepEqual(blank.connections, []); assert.equal(blank.runtime, undefined);
  await page.getByLabel('站点名称 *', { exact: true }).fill('自己的站点');
  await page.getByRole('radio', { name: '工商业储能', exact: true }).check();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.ok(saved.devices.length > 0); assert.equal(saved.name, '自己的站点'); assert.equal(saved.template, '工商业储能');
  await open();
  assert.equal(await page.getByLabel('站点名称 *', { exact: true }).inputValue(), '自己的站点');
  assert.equal(await page.getByRole('radio', { name: '工商业储能', exact: true }).isChecked(), true);
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), saved);
  const legacy = { ...saved, topologyMeta: { ...saved.topologyMeta, emsRef: 'stale-ems' } };
  await page.evaluate(({ key, draft }) => localStorage.setItem(key, JSON.stringify(draft)), { key, draft: legacy });
  await open();
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), legacy);
  await page.getByRole('radio', { name: '光储协同', exact: true }).click();
  await page.getByRole('dialog', { name: '替换当前拓扑？' }).getByRole('button', { name: '替换拓扑', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  const replaced = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(replaced.topologyMeta.emsRef, replaced.devices.find(device => device.type === 'EMS').id);
  assert.deepEqual(replaced.topologyMeta, { ...legacy.topologyMeta, emsRef: replaced.devices.find(device => device.type === 'EMS').id });
  assert.equal(replaced.name, legacy.name); assert.deepEqual(replaced.runtime, legacy.runtime);
  await page.getByRole('radio', { name: '自定义空白拓扑', exact: true }).click();
  await page.getByRole('dialog', { name: '替换当前拓扑？' }).getByRole('button', { name: '替换拓扑', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  const cleared = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(Object.hasOwn(cleared.topologyMeta, 'emsRef'), false);
  const { emsRef, ...otherMeta } = legacy.topologyMeta;
  assert.deepEqual(cleared.topologyMeta, otherMeta); assert.equal(cleared.name, legacy.name);
 } finally { await browser.close(); }
});
