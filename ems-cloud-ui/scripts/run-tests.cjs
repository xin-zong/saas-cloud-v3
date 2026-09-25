const { readdirSync } = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const demo = ['centers-ui.test.cjs', 'operations-redesign-ui.test.cjs', 'role-access-ui.test.cjs', 'workspace-ui.test.cjs']
function groups(files) {
  for (const file of demo) if (!files.includes(file)) throw new Error(`Missing demo test: ${file}`)
  return { api: files.filter(file => !demo.includes(file)).sort(), demo: [...demo] }
}
module.exports = { groups }

if (require.main === module) {
  const cwd = path.resolve(__dirname, '..')
  const split = groups(readdirSync(path.join(cwd, 'tests')).filter(file => /\.(test|spec)\.cjs$/.test(file)))
  const urls = { api: process.env.API_PREVIEW_URL || 'http://127.0.0.1:8445', demo: process.env.DEMO_PREVIEW_URL || 'http://127.0.0.1:8446' }
  if (urls.api === urls.demo) throw new Error('API and demo preview URLs must differ')
  let failed = false
  for (const [mode, files] of Object.entries(split)) {
    console.log(`Running ${mode} group: ${files.length} files at ${urls[mode]}`)
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map(file => `tests/${file}`)], {
      cwd, stdio: 'inherit', env: { ...process.env, PREVIEW_URL: urls[mode], API_PREVIEW_URL: urls.api, DEMO_PREVIEW_URL: urls.demo },
    })
    if (result.error) console.error(result.error.message)
    if (result.status !== 0) failed = true
  }
  process.exitCode = failed ? 1 : 0
}
