const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')

test('API approval reviewer can decide a server record and sees refreshed state', async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(() => sessionStorage.setItem('enerlution-api-token', 'approval-test'))
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const user = { id: '7', name: '审核人', account: 'review@test', role: 'operator', organization: '测试', stationIds: ['12'], permissions: ['asset.read', 'workorder.read', 'approval.read','approval.review'] }
  user.stationPermissions = Object.fromEntries(user.stationIds.map(id => [id, [...user.permissions]]))
  user.organizationPermissions = {}
  const approval = { id: 45, title: '计划审批 #31', submitter_id: 9, requester_name: '申请人', reviewer_id: null, submitted_at: new Date().toISOString(), status: 'pending', note: null, plan_id: 31, work_order_id: null, station_id: 12, station_name: '审核站点' }
  let decisions = 0
  let conflict = false
  await page.route('http://127.0.0.1:18090/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname.slice(4)
    let data = []
    if (path === '/auth/me') data = user
    else if (path === '/stations') data = [{ id: 12, name: '审核站点', code: 'ST-12' }]
    else if (path === '/approvals') data = [approval]
    else if (path === '/approvals/45/decision') {
      assert.equal(request.method(), 'POST')
      if (conflict) {
        await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ code: 409, msg: '审批已经结束', data: null }) })
        return
      }
      assert.deepEqual(request.postDataJSON(), { decision: 'approved', note: '核验通过' })
      decisions++
      approval.status = 'approved'
      approval.reviewer_id = 7
      approval.note = '核验通过'
      data = null
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) })
  })
  try {
    await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:8443')
    await page.getByRole('button', { name: '工单与审批', exact: true }).click()
    await page.getByRole('button', { name: '审批中心', exact: true }).click()
    await page.getByText('计划审批 #31', { exact: true }).waitFor()
    await page.getByRole('button', { name: '办理审批' }).click()
    await page.getByLabel('审批意见').fill('核验通过')
    await page.getByRole('button', { name: '同意' }).click()
    await page.getByRole('button', { name: '确认批准', exact: true }).click()
    await page.getByRole('complementary',{name:'审核复核详情'}).getByText('已通过', { exact: true }).waitFor()
    assert.equal(decisions, 1)
    approval.status = 'pending'
    approval.submitter_id = 7
    await page.reload()
    await page.getByRole('button', { name: '工单与审批', exact: true }).click()
    await page.getByRole('button', { name: '审批中心', exact: true }).click()
    await page.getByRole('button', { name: '办理审批' }).click()
    assert.equal(await page.getByRole('button', { name: '同意', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('button', { name: '驳回', exact: true }).isDisabled(), true)
    assert.equal(decisions, 1)
    approval.submitter_id = 9
    conflict = true
    await page.reload()
    await page.getByRole('button', { name: '工单与审批', exact: true }).click()
    await page.getByRole('button', { name: '审批中心', exact: true }).click()
    await page.getByRole('button', { name: '办理审批' }).click()
    await page.getByLabel('审批意见').fill('稍后处理')
    await page.getByRole('button', { name: '驳回', exact: true }).click()
    await page.getByRole('button', { name: '确认驳回', exact: true }).click()
    await page.getByText('审批已经结束', { exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '驳回', exact: true }).isEnabled(), true)
    assert.deepEqual(errors, [])
  } finally { await browser.close() }
})
