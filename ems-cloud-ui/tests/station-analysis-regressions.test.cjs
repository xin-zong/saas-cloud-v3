const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(path, deps = { './apiAnalytics': {} }, extension = 'ts') {
  const source = fs.readFileSync(`${__dirname}/../src/${path}.${extension}`, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  const exports = {}
  new Function('exports', 'require', code)(exports, name => deps[name] ?? (() => { throw Error(name) })())
  return exports
}
test('interval energy counts all buckets, never bridges missing values and separates signs', () => {
  const { intervalEnergy } = load('components/stationAnalysisData')
  const rows = [0, 15, 30, 45].map(minute => ({ timestamp: minute * 60000, storage: 100, intervalMinutes: 15 }))
  assert.deepEqual(intervalEnergy(rows, 0, 3600000), { charge: 0, discharge: 100 })
  assert.deepEqual(intervalEnergy([rows[0]], 0, 3600000), { charge: 0, discharge: 25 })
  assert.deepEqual(intervalEnergy([rows[0], rows[3]], 0, 3600000), { charge: 0, discharge: 50 })
  assert.deepEqual(intervalEnergy([{ ...rows[0], storage: -100 }, rows[1]], 0, 3600000), { charge: -25, discharge: 25 })
  assert.deepEqual(intervalEnergy([{ ...rows[0], storage: null }], 0, 3600000), { charge: null, discharge: null })
  assert.deepEqual(intervalEnergy([{ ...rows[0], intervalMinutes: 5 }], 0, 3600000), { charge: 0, discharge: 100 / 12 })
  assert.deepEqual(intervalEnergy(rows, 300000, 600000), { charge: 0, discharge: 100 / 12 })
})
test('aggregate API mapping remains conservative and carries bucket duration into curve energy', async () => {
  const telemetry = load('data/stationTelemetry')
  const calls = []
  const start = +new Date('2026-09-26T00:00:00')
  const api = {
    loadPoints: async () => [
      { id: '18', device_id: '4', name: 'SOC', unit: '%' },
      { id: '19', device_id: '5', name: 'SOC', unit: '%' },
      { id: '27', device_id: '5', name: '柜内湿度', unit: '%RH' },
      { id: '30', device_id: '4', name: '充放电功率', unit: 'kW' },
    ],
    loadHistory: async id => { calls.push(id); return [0, 15, 30, 45].map(minute => ({ timestamp: start + minute * 60000, value: 100, samples: 1 })) },
  }
  const aggregate = load('components/stationTelemetryQuery', { '@/data/stationTelemetry': telemetry, './apiAnalytics': api })
  const samples = await aggregate.queryStationTelemetry({ id: '12' }, new Date(start), new Date(start + 3600000), 15, new AbortController().signal)
  assert.deepEqual(calls, ['30'])
  assert.equal(samples[0].intervalMinutes, 15)
  const curve = load('components/StationRunCurvePage', {
    react: {}, './stationAnalysisData': load('components/stationAnalysisData'), './StationAnalysisPage': {},
    './stationTelemetryQuery': aggregate, '@/auth/apiPermissions': {}, 'lucide-react': {}, recharts: {},
    '@/api/client': { DEMO_MODE: false }, '@/auth/AuthContext': {}, './ApiAnalyticsPage': {},
    '@/data/dataClock': {}, '@/data/stationTelemetry': telemetry, './station-run-curves.css': {},
  }, 'tsx')
  assert.equal(curve.buildCurveData({ telemetryHistory: samples }, '2026-09-26', 'D').points[0].discharge, 100)
  assert.equal(curve.buildCurveData({ telemetryHistory: [samples[0]] }, '2026-09-26', 'D').points[0].discharge, 25)
  assert.equal(curve.buildCurveData({ telemetryHistory: [samples[0], samples[3]] }, '2026-09-26', 'D').points[0].discharge, 50)
})
test('registered channels retain duplicate SOC and arbitrary point IDs and selected query granularity', async () => {
  const points = [
    { id: '18', device_id: '4', name: '电池 SOC', unit: '%' },
    { id: '19', device_id: '5', name: '电池 SOC', unit: '%' },
    { id: '27', device_id: '5', name: '柜内湿度', unit: '%RH' },
  ]
  const calls = []
  const service = load('components/stationAnalysisData', { './apiAnalytics': { loadHistory: async (id, from, to, minutes) => {
    calls.push({ id, minutes }); return [{ timestamp: 0, value: Number(id), samples: 1 }, { timestamp: 600000, value: Number(id) + 1, samples: 1 }]
  } } })
  const channels = service.registeredChannels(points)
  assert.equal(new Set(channels.map(c => c.id)).size, 3)
  assert.notEqual(channels[0].group, channels[1].group)
  const rows = await service.queryRegisteredTelemetry(points, new Date(0), new Date(900000), 5, new AbortController().signal)
  assert.deepEqual(calls, [{ id: '18', minutes: 5 }, { id: '19', minutes: 5 }, { id: '27', minutes: 5 }])
  assert.equal(rows[0][channels[0].id], 18)
  assert.equal(rows[0][channels[1].id], 19)
  assert.equal(rows[0][channels[2].id], 27)
  assert.equal(rows.find(row => row.timestamp === 300000)[channels[0].id], null)
})
