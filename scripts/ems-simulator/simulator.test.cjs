const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const os = require('node:os');
const modulePath = path.join(__dirname, 'profile.cjs');
const load = () => require(modulePath);
const EMS = '4a8be161-7ee9-458f-b412-7d256e64eed9';
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const NOW = 1790640000000;
const pairs = frame => Object.values(frame.d).filter(block => block && Array.isArray(block.p)).flatMap(block => block.p);
const value = (frame, id) => pairs(frame).find(pair => pair[0] === id)?.[1];

test('complete frame output covers exactly 295 ordinary points, 6 EMS and 173 config IDs', () => {
  const { FullPointScenario, loadProfile } = load();
  const profile = loadProfile();
  const scenario = new FullPointScenario({ emsId: EMS, structureVersion: 2026092901 }, profile);
  scenario.beginConnection(C1, NOW, 0);
  const fast = scenario.frame('cabinet_30s', NOW, 0);
  const slow = scenario.frame('cabinet_60s', NOW, 0);
  assert.equal(pairs(fast).length, 241);
  assert.equal(pairs(slow).length, 54);
  assert.equal(new Set([...pairs(fast), ...pairs(slow)].map(([id]) => id)).size, 295);
  const ems = scenario.frame('ems', NOW, 0);
  assert.equal(ems.d.base.flatMap(block => block.p).length, 6);
  assert.equal(ems.d.cfg.p.length, 173);
  assert.equal(new Set(ems.d.cfg.p.map(([id]) => id)).size, 173);
  assert.equal(ems.d.cfg.p.filter(([,v]) => v === null).length, 9);
  assert.equal(profile.catalog.counts.sqlDefinitions, 1410);
  assert.equal(profile.catalog.definitions.filter(d => d.sourcePointId >= 25001 && d.sourcePointId <= 26000).length, 1000);
});

test('source unknown quality, timestamps, bitmap words and version strings are preserved', () => {
  const { FullPointScenario } = load();
  const scenario = new FullPointScenario({ emsId: EMS });
  scenario.beginConnection(C1, NOW, 0);
  const ems = scenario.frame('ems', NOW + 30000, 30000);
  assert.deepEqual(ems.d.base.slice(0, 2), [
    { ts: null, q: 'invalid', p: [[90002, null], [90003, null]] },
    { ts: null, q: 'invalid', p: [[90004, null]] },
  ]);
  assert.equal(ems.d.base[2].ts, NOW + 30000);
  const fast = scenario.frame('cabinet_30s', NOW + 30000, 30000);
  assert.deepEqual(value(fast, 20062), [0, 0, 0, 0]);
  assert.equal(value(fast, 20086), null);
  const slow = scenario.frame('cabinet_60s', NOW + 30000, 30000);
  assert.equal(typeof value(slow, 20231), 'string');
  assert.equal(value(slow, 20003), null);
  for (const block of Object.values(fast.d)) assert.equal(block.ts, NOW + 30000);
});

test('single cabinet synthetic structure matches 5x32 voltage / 5x16 temperature and keeps null positions', () => {
  const { FullPointScenario } = load();
  const scenario = new FullPointScenario({ emsId: EMS });
  scenario.beginConnection(C1, NOW, 0);
  const structure = scenario.structure();
  assert.deepEqual(structure.d.clusters.map(c => c.c), [1]);
  assert.equal(structure.seq, 1);
  assert.equal(structure.connectionId, C1);
  assert.equal(structure.d.clusterLayout.bms.bmuCount, 5);
  assert.equal(structure.d.clusterLayout.bms.voltCount, 32);
  assert.equal(structure.d.clusterLayout.bms.tempCount, 16);
  assert.deepEqual(structure.d.publicMeters, []);
  for (const [type, columns] of [['cell_voltage', 32], ['cell_temperature', 16]]) {
    const frame = scenario.frame(type, NOW, 0);
    assert.equal(frame.c, 1);
    assert.equal(frame.sv, structure.sv);
    assert.equal(frame.d.values.length, 5);
    assert.ok(frame.d.values.every(row => row.length === columns));
    assert.equal(frame.d.values.flat().filter(v => v === null).length, 1);
    assert.ok(Buffer.byteLength(JSON.stringify(frame)) <= 6144);
  }
  assert.equal(scenario.frame('cell_voltage', NOW, 0).d.values[0][2], null);
  assert.ok(!('_testFixtureProvenance' in structure));
});

test('schedule uses QoS0 ordinary and QoS1 structure, skips disconnected backlog and rotates reconnect identity', () => {
  const { FullPointScenario } = load();
  const scenario = new FullPointScenario({ emsId: EMS });
  scenario.beginConnection(C1, NOW, 0);
  const initial = scenario.due(NOW, 0);
  assert.deepEqual(initial.map(m => [m.kind, m.qos]), [['heartbeat', 0], ['structure', 1]]);
  assert.ok(initial.every(m => m.retain === false));
  assert.deepEqual(scenario.due(NOW + 15000, 15000).map(m => m.kind), ['ems', 'cabinet_30s']);
  const more = scenario.due(NOW + 30000, 30000);
  assert.deepEqual(more.map(m => m.kind), ['heartbeat', 'cabinet_60s', 'cell_voltage', 'cell_temperature']);
  assert.ok(more.every(m => m.qos === 0));
  scenario.disconnect();
  assert.deepEqual(scenario.due(NOW + 120000, 120000), []);
  scenario.beginConnection(C2, NOW + 120000, 120000);
  const reconnected = scenario.due(NOW + 120000, 120000);
  assert.deepEqual(reconnected.map(m => m.kind), ['heartbeat', 'structure']);
  assert.equal(JSON.parse(reconnected[0].message).connectionId, C2);
  assert.equal(JSON.parse(reconnected[0].message).uptimeSeconds, 120);
  assert.equal(JSON.parse(reconnected[1].message).seq, 1);
});

test('dynamic electrical values agree, energy counters increase, optional reset is explicit', () => {
  const { FullPointScenario } = load();
  const scenario = new FullPointScenario({ emsId: EMS });
  scenario.beginConnection(C1, NOW, 0);
  const first = scenario.frame('cabinet_30s', NOW, 0);
  const second = scenario.frame('cabinet_30s', NOW + 60000, 60000);
  assert.notEqual(value(first, 20018), value(second, 20018));
  assert.notEqual(value(first, 20021), value(second, 20021));
  assert.notEqual(value(first, 20023), value(second, 20023));
  assert.ok(Math.abs(value(second, 20024) - value(second, 20021) * value(second, 20023) / 1000) < 0.001);
  assert.ok(value(scenario.frame('cabinet_60s', NOW+60000, 60000), 20060) > value(scenario.frame('cabinet_60s', NOW, 0), 20060));
  assert.ok(Math.abs(value(second, 20197) - [20187, 20191, 20195].reduce((a,id)=>a+value(second,id),0)) < 0.004);
  const reset = new FullPointScenario({ emsId: EMS, counterResetAfterSeconds: 50 });
  reset.beginConnection(C1, NOW, 0);
  assert.ok(value(reset.frame('cabinet_60s', NOW+60000, 60000), 20060) < value(reset.frame('cabinet_60s', NOW+30000, 30000), 20060));
});

test('read-only requests validate session/expiry/idempotency without incrementing structure sequence', () => {
  const { FullPointScenario } = load();
  const scenario = new FullPointScenario({ emsId: EMS });
  scenario.beginConnection(C1, NOW, 0);
  const request = { v: 1, emsId: EMS, connectionId: C1, id: 'query_1', op: 'structure.get', expiresAtMs: NOW+30000, params: {} };
  const response = scenario.request(request, NOW, 0);
  assert.equal(response.ok, true);
  assert.equal(response.data.seq, 1);
  assert.deepEqual(scenario.request({...request}, NOW+1000, 1000), response);
  assert.equal(scenario.request({...request, expiresAtMs: NOW+40000}, NOW+1000, 1000).error.code, 'INVALID_REQUEST');
  assert.equal(scenario.request({...request, id:'expired', expiresAtMs:NOW}, NOW, 0).error.code, 'REQUEST_EXPIRED');
  assert.equal(scenario.request({...request, id:'old-session', connectionId:C2}, NOW, 0).error.code, 'CONNECTION_MISMATCH');
  assert.equal(scenario.request({...request, id:'control', op:'device.control'}, NOW, 0).error.code, 'UNKNOWN_OPERATION');
  assert.equal(scenario.request({...request, emsId:C2}, NOW, 0), null);
  assert.equal(scenario.request({...request, id:'bad id'}, NOW, 0), null);
  assert.equal(scenario.request({...request, id:'alarms', op:'alarm.current.get', params:{c:1}}, NOW, 0).data.alarms, null);
  for (let i=0; i<30; i++) scenario.request({...request, id:'new_'+i}, NOW, 0);
  assert.equal(scenario.request({...request, id:'overflow'}, NOW, 0).error.code, 'BUSY');
  scenario.disconnect();
  scenario.beginConnection(C2, NOW+70000, 70000);
  assert.equal(scenario.request({...request, connectionId:C2, expiresAtMs:NOW+90000}, NOW+70000, 70000).ok, true);
});

test('fixture mutations, unsupported client UUID and wrong deployment identity are rejected', () => {
  const { FullPointScenario, validateDeployment, loadProfile } = load();
  assert.throws(()=>new FullPointScenario({emsId:'bad'}), /UUID/);
  assert.throws(()=>validateDeployment({emsId:EMS, stationId:3, bindingPeriodId:2, gatewayDeviceId:57}), /station/);
  assert.throws(()=>validateDeployment({emsId:C1, stationId:4, bindingPeriodId:2, gatewayDeviceId:57}), /EMS/);
  assert.throws(()=>validateDeployment({emsId:EMS, stationId:4, bindingPeriodId:1, gatewayDeviceId:57}), /period/);
  const profile = loadProfile();
  profile.frames.cabinet_30s.d.bms.p.pop();
  assert.throws(()=>new FullPointScenario({emsId:EMS}, profile), /295|profile|count/);
});

test('launcher waits for both subscriptions then publishes per-message QoS and never queues old frames after disconnect', async () => {
  const { SimulatorRuntime } = require('./run.cjs');
  class Transport extends EventEmitter {
    connected = true; published = []; pendingSubscribe;
    subscribe(topics, opts, cb) { this.pendingSubscribe = cb; this.topics = topics; }
    publish(topic, payload, options, cb) { this.published.push({topic,payload:JSON.parse(payload),options}); cb(); }
  }
  const client = new Transport();
  let now = NOW, mono = 0;
  const runtime = new SimulatorRuntime(client, {emsId:EMS}, {now:()=>now, mono:()=>mono, uuid:()=>C1, log:()=>{}});
  await runtime.connected();
  assert.equal(client.published.length, 0);
  client.pendingSubscribe(null, runtime.subscriptionTopics.map(topic=>({topic,qos:1})));
  await runtime.flush();
  assert.deepEqual(client.published.map(p=>[p.payload.type||'heartbeat',p.options.qos]), [['heartbeat',0],['structure',1]]);
  assert.ok(client.published.every(p=>p.options.retain===false));
  now+=30000; mono+=30000;
  await runtime.tick();
  assert.ok(client.published.some(p=>p.payload.type==='cell_voltage'&&p.options.qos===0));
  runtime.disconnected();
  now+=100000; mono+=100000;
  await runtime.tick();
  assert.equal(client.published.length, 8);
  runtime.stop();
});

test('SQL generator keeps configuration out of measurement points and preserves fixed existing point mappings', () => {
  const { buildSeedSql } = require('./prepare.cjs');
  const sql = buildSeedSql();
  assert.ok(sql.startsWith('--'));
  assert.match(sql, /current_database\(\) <> 'ems_cloud_v2_proto'/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /20018[^\n]+19/);
  assert.match(sql, /90007[^\n]+446/);
  assert.ok(!/INSERT INTO (config_value|structure_revision|typed_observation|measurement_sample)/.test(sql));
  assert.match(sql, /SIM-EMU-01/);
  assert.match(sql, /mapping drift/);
});

test('process lock remains exclusive through stopping until the actual exit event', () => {
  const { acquireProcessLock } = require('./run.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-lock-lifecycle-'));
  const lockFile = path.join(directory, 'ems-fullpoint.lock');
  const events = new EventEmitter();
  let lock;
  try {
    lock = acquireProcessLock(lockFile, {pid:101, emsId:EMS}, events);
    events.emit('SIGTERM');
    assert.ok(fs.existsSync(lockFile), 'a stop signal must not expose the lock while work may remain');
    assert.throws(()=>acquireProcessLock(lockFile, {pid:202, emsId:EMS}, new EventEmitter()), /lock exists/);
    events.emit('exit');
    assert.equal(fs.existsSync(lockFile), false);
    lock.release();
  } finally {
    lock?.release();
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    fs.rmdirSync(directory);
  }
});

test('an old exit callback cannot delete a replacement process owner lock', () => {
  const { acquireProcessLock } = require('./run.cjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ems-lock-replacement-'));
  const lockFile = path.join(directory, 'ems-fullpoint.lock');
  const oldEvents = new EventEmitter();
  const newEvents = new EventEmitter();
  let oldLock, newLock, displacedLock;
  try {
    oldLock = acquireProcessLock(lockFile, {pid:101, emsId:EMS}, oldEvents);
    oldLock.release();
    newLock = acquireProcessLock(lockFile, {pid:202, emsId:EMS}, newEvents);
    const replacement = fs.readFileSync(lockFile, 'utf8');
    oldEvents.emit('exit');
    oldLock.release();
    assert.equal(fs.readFileSync(lockFile, 'utf8'), replacement);

    // Even external replacement before old cleanup must not transfer ownership.
    fs.unlinkSync(lockFile);
    displacedLock = acquireProcessLock(lockFile, {pid:303, emsId:EMS}, new EventEmitter());
    const displacedOwner = fs.readFileSync(lockFile, 'utf8');
    newEvents.emit('exit');
    assert.equal(fs.readFileSync(lockFile, 'utf8'), displacedOwner);
  } finally {
    oldLock?.release(); newLock?.release(); displacedLock?.release();
    if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
    fs.rmdirSync(directory);
  }
});
