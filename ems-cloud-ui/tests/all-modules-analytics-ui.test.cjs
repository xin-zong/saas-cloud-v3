const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright')
const evidence = path.resolve(__dirname, '../../.superpowers/sdd/2026-09-29-ems-business-completion/task3-ui')
async function setup(role = 'owner') {
  await fs.mkdir(evidence,{recursive:true})
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, timezoneId: 'Asia/Shanghai' })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'module06-token'))
  const page = await context.newPage(); page.setDefaultTimeout(12000)
  const permissions = ['asset.read', 'telemetry.read', 'report.export', 'strategy.read', 'revenue.read', 'audit.read', 'alarm.read']
  const user = { id: '7', name: '分析用户', account: 'analytics@test', role, organization: '测试', stationIds: ['12', '13'], permissions, stationPermissions: { 12: [...permissions], 13: ['asset.read', 'telemetry.read', 'report.export', 'alarm.read'] }, organizationPermissions: {} }
  const state = { user, calls: [], jobs: [], failPoints: false, failReport: false, delayReport: null, downloads: [], errors: [] }
  page.on('pageerror', e => state.errors.push(e.message)); page.on('download', d => state.downloads.push(d))
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const url = new URL(route.request().url()), p = url.pathname.slice(4); state.calls.push(url)
    let data = []
    if (p === '/auth/me') data = user
    else if (p === '/stations') data = [{ id: 12, name: '分析甲站', code: 'A12' }, { id: 13, name: '分析乙站', code: 'B13' }]
    else if (/\/stations\/\d+\/points/.test(p)) {
      if (state.failPoints) return route.fulfill({ status: 500, json: { msg: '测点读取失败' } })
      data = p.includes('/12/') ? [{ id: 17, device_id: 4, name: '有功功率', unit: 'kW' }, { id: 18, device_id: 4, name: '电池 SOC', unit: '%' }, { id: 27, device_id: 5, name: '柜内湿度', unit: '%RH' }] : [{ id: 99, device_id: 9, name: '乙站电流', unit: 'A' }]
    } else if (/\/points\/\d+\/history/.test(p)) {
      if (state.delayHistory) await state.delayHistory
      if (state.failHistory) return route.fulfill({ status: 500, json: { msg: '历史查询不可用' } })
      const time = +new Date(url.searchParams.get('from'))
      data = [{ timestamp: time, value: 0, samples: 1 }, { timestamp: time + Number(url.searchParams.get('minutes')) * 120000, value: 42, samples: 2 }]
      if (state.historyMode === 'complete') {
        const step = Number(url.searchParams.get('minutes')) * 60000
        data = Array.from({ length: Math.ceil((Date.parse(url.searchParams.get('to')) - time) / step) }, (_, i) => ({ timestamp: time + i * step, value: i, samples: 1 }))
      } else if (state.historyMode === 'empty') data = []
    } else if (/\/telemetry\/snapshot$/.test(p)) data = { items: [], serverTime: Date.now(), presence: null }
    else if (/\/telemetry\/stream$/.test(p)) {
      if(state.liveDisconnected) return route.abort('failed')
      const time = Date.now(), points = p.includes('/12/') ? ['17','18','27'] : ['99']
      const frames = [0,state.liveValue ?? 42].map((value,index) => `event: snapshot\ndata: ${JSON.stringify({serverTime:time,items:points.map(pointId => ({pointId,value:String(value),valueType:'number',quality:'valid',sourceTime:time - (index ? 0 : 120000),receivedAt:time,staleReason:null})),presence:null})}\n\n`).join('')
      return route.fulfill({ contentType: 'text/event-stream', body: frames })
    } else if (/\/stations\/\d+\/analysis-jobs$/.test(p)) {
      const stationId = p.split('/')[2]
      if (route.request().method() === 'POST') {
        if (state.delayReport) await state.delayReport
        const body = route.request().postDataJSON()
        data = { id:`job-${state.jobs.length+1}`,stationId,...body,minutes:body.minutes ?? null,pointIds:body.pointIds ?? [],status:state.failReport?'failed':'completed',createdAt:new Date().toISOString(),completedAt:new Date().toISOString(),error:state.failReport?'报告服务暂不可用':null }
        state.jobs.unshift(data)
      } else data = state.jobs.filter(job => job.stationId === stationId && job.kind === url.searchParams.get('kind')).slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+20)
    } else if (/\/analysis-jobs\/[^/]+\/retry$/.test(p)) {
      data = state.jobs.find(job => job.id === p.split('/')[2]);data.status='completed';data.error=null
    } else if (/\/analysis-jobs\/[^/]+\/download$/.test(p)) {
      if (state.delayReport) await state.delayReport
      if (state.failReport) return route.fulfill({ status: 500, json: { msg: '报告服务暂不可用' } })
      const job=state.jobs.find(job=>job.id===p.split('/')[2])
      return route.fulfill({ contentType: 'text/csv', body: job?.kind==='telemetry'?`point_name,exact_value,quality\n${job.pointIds.map(id=>`${({'17':'有功功率','18':'电池 SOC','27':'柜内湿度','99':'乙站电流'})[id]},"0",valid`).join('\n')}\n`:'date,amount\n2026-09-20,125\n' })
    } else if (/\/analysis-jobs\/[^/]+$/.test(p)) {
      const job=state.jobs.find(job=>job.id===p.split('/')[2])
      data={job,summary:[{label:'确认收益',value:'125',unit:'CNY'}],sections:[{title:'收益明细',columns:[{key:'date',label:'日期'},{key:'amount',label:'金额'}],rows:[{date:'2026-09-20',amount:'125'}]}]}
    } else if (p === '/audit') data = state.audits ?? [{ id: 8, actor_id: 7, occurred_at: '2026-09-26T08:00:00Z', action: 'report.export', detail: 'station=12,kind=revenue' }]
    await route.fulfill({ json: { code: 0, data } })
  })
  await page.goto(process.env.API_PREVIEW_URL || 'http://127.0.0.1:8461', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '分析与报告', exact: true }).click()
  return { browser, page, state }
}
test('current multi-signal analysis, searchable station picker and older trend/audit controls are reachable', async () => {
  const { browser, page, state } = await setup()
  try {
    await page.getByRole('tab', { name: '实时分析', exact: true }).waitFor()
    await page.getByLabel('搜索设备或信号').fill('湿度')
    await page.getByText('柜内湿度 · 27', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '分析站点', exact: true }).click({force:true})
    await page.getByPlaceholder('搜索站点名称', { exact: true }).fill('乙')
    await page.getByRole('option', { name: '分析乙站' }).click()
    await page.getByText('乙站电流 · 99', { exact: true }).first().waitFor()
    assert.equal(await page.getByText('柜内湿度 · 27', { exact: true }).count(), 0)
    await page.getByRole('tab', { name: '历史趋势', exact: true }).click()
    await page.getByRole('button', { name: '30天', exact: true }).click()
    await page.getByText('平均功率输出', { exact: true }).waitFor()
    await page.getByRole('button', { name: '事件审计', exact: true }).click()
    await page.getByRole('button', { name: '查看事件 8' }).click()
    await page.getByText('操作状态快照', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'COPY JSON' }).waitFor()
    await page.getByLabel('搜索日志编号、操作内容').fill('missing')
    await page.getByText('没有符合筛选条件的审计记录').waitFor()
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await page.getByRole('button', { name: '查看事件 8' }).waitFor()
    assert.deepEqual(state.errors, [])
  } finally { await browser.close() }
})
test('download selects registered points/device, validates range, exports real CSV and clears revoked data', async () => {
  const { browser, page, state } = await setup('operator')
  try {
    await page.getByRole('tab', { name: '数据下载', exact: true }).click()
    await page.getByLabel('下载设备', { exact: true }).selectOption('5')
    await page.getByRole('button', { name: '选择参数', exact: true }).click()
    assert.equal(await page.getByRole('checkbox', { name: /有功功率/ }).count(), 0)
    await page.getByRole('checkbox', { name: /柜内湿度/ }).check()
    await page.getByRole('button', { name: '应用参数', exact: true }).click()
    await page.getByLabel('下载开始时间').fill('2026-09-01T00:00')
    await page.getByLabel('下载结束时间').fill('2026-09-02T00:00')
    await page.getByLabel('数据粒度', { exact: true }).selectOption('5')
    const before = state.calls.length
    await page.getByRole('button', { name: '生成文件', exact: true }).click()
    await page.getByText('可下载', { exact: true }).waitFor()
    const queries = state.calls.slice(before).filter(u => u.pathname.endsWith('/analysis-jobs'))
    assert(queries.length > 0);assert.deepEqual(state.jobs[0].pointIds,['27']);assert.equal(state.jobs[0].minutes,5)
    const wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 CSV', exact: true }).click()
    const csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /柜内湿度/); assert.match(csv, /"0"/); assert.doesNotMatch(csv, /有功功率|电池 SOC/)
    state.user.stationPermissions['12'] = ['asset.read']
    await page.evaluate(() => window.dispatchEvent(new Event('enerlution:permissions-changed')))
    await page.getByLabel('下载站点').selectOption('13')
    assert.equal(await page.getByRole('button', { name: '下载 CSV', exact: true }).count(), 0)
    await page.getByRole('button', { name: '选择参数', exact: true }).click()
    assert.equal(await page.getByRole('checkbox', { name: /柜内湿度/ }).count(), 0)
    await page.getByRole('checkbox', { name: /乙站电流/ }).waitFor()
    assert.deepEqual(state.errors, [])
  } finally { await browser.close() }
})
test('report station permissions, retries, validation and late revoked responses never download', async () => {
  const { browser, page, state } = await setup('integrator')
  try {
    await page.getByRole('tab', { name: '报告中心', exact: true }).click()
    await page.getByLabel('报告站点').selectOption('13')
    assert.deepEqual(await page.getByLabel('报告类型', { exact: true }).locator('option').allTextContents(), ['设备健康报告'])
    await page.getByLabel('报告站点').selectOption('12')
    await page.getByLabel('报告类型', { exact: true }).selectOption('revenue')
    await page.getByLabel('报告开始日期').fill('2026-09-01')
    await page.getByLabel('报告结束日期').fill('2026-09-26')
    state.failReport = true
    await page.getByRole('button', { name: '生成报告', exact: true }).click()
    await page.getByText('生成失败', { exact: true }).waitFor()
    state.failReport = false
    await page.getByRole('button', { name: '重试', exact: true }).click()
    await page.getByRole('button', { name: '预览', exact: true }).click()
    await page.getByText('收益明细', { exact: true }).waitFor()
    const wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 CSV 报告', exact: true }).click(); await wait
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    let release; state.delayReport = new Promise(resolve => { release = resolve })
    await page.getByRole('button', { name: '下载 CSV', exact: true }).click()
    await page.getByRole('button', { name: '取消等待', exact: true }).waitFor()
    state.user.stationPermissions['12'] = ['asset.read', 'telemetry.read', 'report.export']
    await page.evaluate(() => window.dispatchEvent(new Event('enerlution:permissions-changed')))
    await page.getByLabel('报告类型', { exact: true }).selectOption('health')
    release(); await page.waitForTimeout(250)
    assert.equal(state.downloads.length, 1)
    assert.deepEqual(state.errors, [])
  } finally { await browser.close() }
})
module.exports = { setup, evidence }

test('disconnected live channels expire on the local clock while paused snapshots and historical quality stay intact', async () => {
  const { browser, page, state } = await setup()
  try {
    await page.clock.install()
    const row=page.locator('.analysis-channels tbody tr').first(),current=row.locator('td').nth(1)
    await current.getByText('42',{exact:true}).waitFor()
    await page.getByRole('button',{name:'暂停',exact:true}).click()
    await page.clock.fastForward(91001)
    assert.equal(await current.innerText(),'42')
    await row.getByText('暂停快照',{exact:false}).waitFor()
    state.liveDisconnected=true
    await page.getByRole('button',{name:'开启',exact:true}).click()
    await page.clock.fastForward(91001)
    await current.getByText('—',{exact:true}).waitFor()
    await row.getByText('过期',{exact:false}).waitFor()
    assert.match(await page.locator('.analysis-channels header').innerText(),/0\/3 有效/)
    await page.getByRole('tab',{name:'历史趋势',exact:true}).click()
    await row.locator('td').nth(3).getByText('有效 · number',{exact:true}).waitFor()
    assert.deepEqual(state.errors,[])
  } finally { await browser.close() }
})

test('report options and station picker omit kinds missing any required station capability', async () => {
  const { browser, page, state } = await setup()
  try {
    state.user.stationPermissions['12']=['report.export','strategy.read','revenue.read','asset.read']
    state.user.stationPermissions['13']=['report.export','asset.read','telemetry.read']
    await page.evaluate(()=>window.dispatchEvent(new Event('enerlution:permissions-changed')))
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
    await page.getByRole('tab',{name:'报告中心',exact:true}).click()
    await page.waitForFunction(()=>document.querySelector('[aria-label="报告站点"]')?.querySelectorAll('option').length===1)
    assert.deepEqual(await page.getByLabel('报告站点').locator('option').allTextContents(),['分析甲站'])
    assert.deepEqual(await page.getByLabel('报告类型',{exact:true}).locator('option').allTextContents(),['收益报告'])
    assert.deepEqual(state.errors,[])
  } finally { await browser.close() }
})

test('live SSE pauses without new requests, reconnects, and closes after permission revocation', async () => {
  const { browser, page, state } = await setup()
  try {
    const current = page.locator('.analysis-channels tbody tr').first().locator('td').nth(1)
    await current.getByText('42',{exact:true}).waitFor()
    await page.getByRole('button',{name:'暂停',exact:true}).click()
    const requests = state.calls.filter(url=>url.pathname.endsWith('/telemetry/stream')).length
    state.liveValue=77
    await page.waitForTimeout(1300)
    assert.equal(state.calls.filter(url=>url.pathname.endsWith('/telemetry/stream')).length,requests)
    assert.equal(await current.innerText(),'42')
    await page.getByRole('button',{name:'开启',exact:true}).click()
    await current.getByText('77',{exact:true}).waitFor()
    await page.waitForFunction(() => document.querySelector('.analysis-channels tbody td:nth-child(2)')?.textContent === '77')
    state.liveValue=88
    await current.getByText('88',{exact:true}).waitFor()
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
    const hiddenRequests=state.calls.filter(url=>url.pathname.endsWith('/telemetry/stream')).length
    state.liveValue=89
    await page.waitForTimeout(1300)
    assert.equal(state.calls.filter(url=>url.pathname.endsWith('/telemetry/stream')).length,hiddenRequests)
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))})
    await current.getByText('89',{exact:true}).waitFor()
    state.user.stationPermissions['12']=['asset.read']
    await page.evaluate(()=>window.dispatchEvent(new Event('enerlution:permissions-changed')))
    await page.getByRole('button',{name:'分析站点',exact:true}).click({force:true})
    await page.getByRole('option',{name:'分析乙站'}).click()
    await page.getByText('乙站电流 · 99',{exact:true}).first().waitFor()
    const after = state.calls.filter(url=>url.pathname.includes('/stations/12/telemetry/stream')).length
    await page.waitForTimeout(1300)
    assert.equal(state.calls.filter(url=>url.pathname.includes('/stations/12/telemetry/stream')).length,after)
    assert.deepEqual(state.errors,[])
  } finally { await browser.close() }
})

async function completeHistory(page, state) {
  state.historyMode = 'complete'
  await page.getByRole('tab', { name: '历史趋势', exact: true }).click()
  await page.getByLabel('开始时间', { exact: true }).fill('2026-09-25T00:00')
  await page.getByLabel('结束时间', { exact: true }).fill('2026-09-25T01:00')
  await page.getByRole('button', { name: '查询', exact: true }).click()
  const completeness = page.locator('.analytics-trend-summary > div').filter({ hasText: '数据完整度' }).locator('strong')
  await completeness.getByText('100.0%', { exact: true }).waitFor()
  return completeness
}

test('review completeness stays full-query under pan zoom Y-only and fit', async () => {
  const { browser, page, state } = await setup()
  try {
    const completeness = await completeHistory(page, state)
    await page.getByRole('button', { name: '平移', exact: true }).click()
    assert.equal(await completeness.innerText(), '100.0%')
    await page.getByLabel('缩放坐标', { exact: true }).selectOption('Y')
    assert.equal(await completeness.innerText(), '100.0%')
    await page.getByLabel('缩放坐标', { exact: true }).selectOption('XY')
    await page.getByRole('button', { name: '缩放时间范围', exact: true }).click()
    assert.equal(await completeness.innerText(), '100.0%')
    await page.getByRole('button', { name: '还原视图', exact: true }).click()
    assert.equal(await completeness.innerText(), '100.0%')
    await page.getByRole('button', { name: '缩放时间范围', exact: true }).click()
    const handle = await page.locator('.recharts-brush-traveller').last().boundingBox()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x - 150, handle.y + handle.height / 2, { steps: 8 })
    await page.mouse.up()
    assert.equal(await completeness.innerText(), '100.0%')
    assert.doesNotMatch(await page.locator('.analysis-chart-summary').innerText(), /60 时间点/)
    await completeness.scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(evidence, 'task6-fix-completeness-1440.png') })
    await page.getByRole('button', { name: '今日', exact: true }).click()
    await completeness.getByText('100.0%', { exact: true }).waitFor()
  } finally { await browser.close() }
})

test('review completeness requires a successful matching query and preserves unknown on failure', async () => {
  const { browser, page, state } = await setup()
  let release
  try {
    const completeness = await completeHistory(page, state)
    await page.getByLabel('结束时间', { exact: true }).fill('2026-09-25T02:00')
    assert.doesNotMatch(await completeness.innerText(), /%/)
    state.delayHistory = new Promise(resolve => { release = resolve })
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await completeness.getByText('查询中…', { exact: true }).waitFor()
    release(); state.delayHistory = null
    await completeness.getByText('100.0%', { exact: true }).waitFor()
    state.failHistory = true
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await page.getByRole('alert').getByText('历史查询不可用', { exact: false }).waitFor()
    assert.equal(await completeness.innerText(), '不可用')
    state.failHistory = false; state.historyMode = 'empty'
    await page.getByRole('button', { name: '查询', exact: true }).click()
    await completeness.getByText('0.0%', { exact: true }).waitFor()
    state.historyMode = 'complete'
    state.delayHistory = new Promise(resolve => { release = resolve })
    await page.getByLabel('采样粒度', { exact: true }).selectOption('5')
    await completeness.getByText('查询中…', { exact: true }).waitFor()
    release(); state.delayHistory = null
    await completeness.getByText('100.0%', { exact: true }).waitFor()
    state.delayHistory = new Promise(resolve => { release = resolve })
    await page.locator('.analysis-signal').filter({ hasText: '柜内湿度' }).getByRole('checkbox').uncheck()
    await completeness.getByText('查询中…', { exact: true }).waitFor()
    release(); state.delayHistory = null
    await completeness.getByText('100.0%', { exact: true }).waitFor()
  } finally { release?.(); await browser.close() }
})

test('review audit action multi-selection filters and exports the union of actual actions', async () => {
  const { browser, page, state } = await setup()
  try {
    state.audits = ['report.export', 'plan.create', 'alarm.note'].map((action, index) => ({ id: index + 8, actor_id: 7, occurred_at: '2026-09-26T08:00:00Z', action, detail: `station=12,action=${action}` }))
    await page.getByRole('button', { name: '事件审计', exact: true }).click()
    await page.getByRole('button', { name: '查看事件 10' }).waitFor()
    await page.getByRole('button', { name: '事件类型', exact: true }).click()
    await page.getByRole('checkbox', { name: 'report.export', exact: true }).check()
    await page.getByRole('checkbox', { name: 'plan.create', exact: true }).check()
    assert.equal(await page.getByRole('button', { name: '查看事件 8' }).count(), 1)
    assert.equal(await page.getByRole('button', { name: '查看事件 9' }).count(), 1)
    assert.equal(await page.getByRole('button', { name: '查看事件 10' }).count(), 0)
    assert.equal(await page.getByRole('checkbox', { name: '控制指令（未接通）', exact: true }).isDisabled(), true)
    await page.screenshot({ path: path.join(evidence, 'task6-fix-audit-filter-1440.png') })
    await page.keyboard.press('Escape')
    const wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出审计日志 CSV' }).click()
    const csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /report.export/); assert.match(csv, /plan.create/); assert.doesNotMatch(csv, /alarm.note/)
    await page.getByRole('button', { name: '重置', exact: true }).click()
    await page.getByRole('button', { name: '查看事件 10' }).waitFor()
  } finally { await browser.close() }
})

test('pan viewport exports only the visible interval and fit restores the full sparse series', async () => {
  const { browser, page } = await setup()
  try {
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await page.getByText('有功功率 · 17', { exact: true }).first().waitFor()
    await page.getByRole('button', { name: '平移', exact: true }).click()
    let wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前数据', exact: true }).click()
    let csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /"0"/); assert.doesNotMatch(csv, /"42"/)
    await page.getByLabel('缩放坐标', { exact: true }).selectOption('Y')
    wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前数据', exact: true }).click()
    csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /"42"/)
    await page.getByRole('button', { name: '还原视图', exact: true }).click()
    wait = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出当前数据', exact: true }).click()
    csv = await fs.readFile(await (await wait).path(), 'utf8')
    assert.match(csv, /"42"/)
  } finally { await browser.close() }
})

test('download validation and point failure retry preserve parameter choices without fabricated results', async () => {
  const { browser, page, state } = await setup()
  try {
    state.failPoints = true
    await page.getByRole('tab', { name: '数据下载', exact: true }).click()
    await page.getByRole('alert').getByText('测点读取失败', { exact: false }).waitFor()
    state.failPoints = false
    await page.getByRole('button', { name: '重试测点读取' }).click()
    await page.getByRole('button', { name: '选择参数', exact: true }).click()
    await page.getByRole('button', { name: '清空', exact: true }).click()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByText('已选 3 项：', { exact: false }).waitFor()
    await page.getByLabel('下载开始时间').fill('2026-09-26T00:00')
    await page.getByLabel('下载结束时间').fill('2026-09-25T00:00')
    const before = state.calls.length
    await page.getByRole('button', { name: '生成文件', exact: true }).click()
    await page.getByRole('alert').getByText('请选择 31 天内有效时间范围。').waitFor()
    assert.equal(state.calls.slice(before).filter(u => u.pathname.includes('/history')).length, 0)
    await page.getByRole('tab', { name: '报告中心', exact: true }).click()
    await page.getByLabel('报告开始日期').fill('2024-01-01')
    await page.getByRole('button', { name: '生成报告', exact: true }).click()
    await page.getByRole('alert').getByText('请选择 366 天内有效时间范围。').waitFor()
    assert.equal(state.downloads.length, 0)
  } finally { await browser.close() }
})

test('module06 API and demo layouts and asset slots at 1366, 1440 and 1920', { timeout: 120000 }, async () => {
  const { browser, page, state } = await setup()
  try {
    const geometry = []
    async function capture(name, width) {
      await page.locator('.analytics-ai-page img').evaluateAll(images => Promise.all(images.map(i => i.decode().catch(() => {}))))
      const assets = await page.locator('.analytics-ai-page img:visible').evaluateAll(images => images.map(i => { const b = i.getBoundingClientRect(); return { src: new URL(i.src).pathname, width: b.width, height: b.height, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight } }))
      for (const asset of assets) {
        assert(asset.naturalWidth > 0 && asset.width > 0)
        assert.equal(asset.width, asset.naturalWidth); assert.equal(asset.height, asset.naturalHeight)
        assert((await fs.stat(path.resolve(__dirname, '../public', asset.src.slice(1)))).size > 0)
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      geometry.push({ name, width, assets, panels: await page.locator('.analytics-ai-page, .analysis-workspace, .analysis-signal-browser, .analysis-trends, .analysis-channels').evaluateAll(es => es.map(e => { const b=e.getBoundingClientRect(); return { class: e.className, x:b.x, y:b.y, width:b.width, height:b.height } })) })
      await page.screenshot({ path: path.join(evidence, `task6-${name}-${width}.png`) })
    }
    for (const width of [1366, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.getByRole('tab', { name: '数据分析', exact: true }).click()
      await page.getByRole('button', { name: '信号分析', exact: true }).click()
      await page.getByRole('tab', { name: '实时分析', exact: true }).click()
      await page.getByText('有功功率 · 17', { exact: true }).first().waitFor()
      await capture('api-live', width)
      await page.getByRole('button', { name: '分析站点', exact: true }).click()
      await capture('station-picker', width)
      await page.keyboard.press('Escape')
      await page.getByRole('tab', { name: '历史趋势', exact: true }).click()
      await page.getByRole('button', { name: '7天', exact: true }).click()
      await capture('api-history', width)
      await page.getByRole('button', { name: '事件审计', exact: true }).click()
      await page.getByRole('button', { name: '查看事件 8' }).click()
      await capture('audit-detail', width)
      await page.getByRole('tab', { name: '数据下载', exact: true }).click()
      await capture('api-download', width)
      await page.getByRole('button', { name: '选择参数', exact: true }).click()
      await capture('parameters', width)
      await page.getByRole('button', { name: '取消', exact: true }).click()
      await page.getByRole('tab', { name: '报告中心', exact: true }).click()
      await capture('api-reports', width)
    }
    await fs.writeFile(path.join(evidence, 'task6-asset-geometry.json'), JSON.stringify(geometry, null, 2))
    assert.deepEqual(state.errors, [])
    const demo = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await demo.addInitScript(() => localStorage.setItem('enerlution-auth-session-v1', JSON.stringify({ userId: 'user-owner-demo' })))
    await demo.goto(process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8460', { waitUntil: 'domcontentloaded' })
    await demo.getByRole('button', { name: '分析与报告', exact: true }).click()
    for (const width of [1366, 1440, 1920]) {
      await demo.setViewportSize({ width, height: 900 })
      await demo.getByRole('tab', { name: '实时分析', exact: true }).waitFor()
      await demo.screenshot({ path: path.join(evidence, `task6-demo-live-${width}.png`) })
      assert.equal(await demo.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    }
    await demo.close()
  } finally { await browser.close() }
})
