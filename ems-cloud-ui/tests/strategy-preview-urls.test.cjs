const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const vm = require('node:vm')

test('strategy browser scenarios select the configured mode URL, independently of the grouped generic URL', () => {
  const source = fs.readFileSync(path.join(__dirname, 'strategy-ui.test.cjs'), 'utf8')
  const file = ts.createSourceFile('strategy-ui.test.cjs', source, ts.ScriptTarget.Latest, true)
  const destinations = []
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'page.goto') destinations.push(node.arguments[0].getText(file))
    ts.forEachChild(node, visit)
  }
  visit(file)
  const env = { DEMO_PREVIEW_URL: 'http://demo.example.test:9040', API_PREVIEW_URL: 'http://api.example.test:9041', PREVIEW_URL: 'http://wrong-group.example.test' }
  assert.deepEqual(destinations.map(expression => vm.runInNewContext(expression, { process: { env } })), [env.DEMO_PREVIEW_URL, env.API_PREVIEW_URL, env.API_PREVIEW_URL])
  assert.deepEqual(destinations.map(expression => vm.runInNewContext(expression, { process: { env: {} } })), ['http://127.0.0.1:8450', 'http://127.0.0.1:8451', 'http://127.0.0.1:8451'])
})
