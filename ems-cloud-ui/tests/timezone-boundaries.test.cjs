const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

function modules(timezone) {
  const cache = new Map()
  function load(name) {
    if (cache.has(name)) return cache.get(name)
    const source = fs.readFileSync(`${__dirname}/../src/${name}.ts`, 'utf8').replaceAll('import.meta.env', '{}')
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const exports = {}
    cache.set(name, exports)
    new Function('exports', 'require', code)(exports, dependency => {
      if (dependency === './store') return { getPreferences: () => ({ timezone, language: 'English' }) }
      if (dependency === '@/preferences/date') return load('preferences/date')
      if (dependency === './operations') return { operationsDate: load('preferences/date').dateKey }
      if (dependency === '@/api/client') return {}
      throw new Error(`Unexpected import ${dependency}`)
    })
    return exports
  }
  return load
}

test('report boundaries follow selected calendar days across both DST transitions', () => {
  const service = modules('Europe/Berlin')('components/apiAnalytics')
  assert.deepEqual(service.reportDateRange('2026-03-29', '2026-03-29'), { from: '2026-03-28T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z' })
  assert.deepEqual(service.reportDateRange('2026-10-25', '2026-10-25'), { from: '2026-10-24T22:00:00.000Z', to: '2026-10-25T23:00:00.000Z' })
  assert.throws(() => service.reportDateRange('2026-02-30', '2026-03-01'), /有效/)
})

test('alarm and trend date ranges use selected timezone at midnight', () => {
  const load = modules('America/Los_Angeles')
  const instant = new Date('2026-10-12T01:00:00Z')
  const clock = load('data/dataClock'), alarms = load('data/stationAlarms')
  assert.equal(clock.stationTrendDate({}, false, instant), '2026-10-11')
  assert.deepEqual(clock.dateRangeEndingAt(instant, 7), { start: '2026-10-05', end: '2026-10-11' })
  assert.deepEqual(alarms.alarmRange(7, instant), { start: '2026-10-05', end: '2026-10-11' })
  assert.ok(alarms.demoStationAlarms('1', instant).every(row => row.occurredAt.endsWith('Z')))
})
