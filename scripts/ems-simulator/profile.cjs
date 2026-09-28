// Synthetic test traffic only. Source units/types come from the immutable catalog.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEFAULTS = Object.freeze({
  emsId: '4a8be161-7ee9-458f-b412-7d256e64eed9', stationId: 4,
  bindingPeriodId: 2, gatewayDeviceId: 57, cabinetNo: 1,
  structureVersion: 2026092901, configRevision: 2026092901,
});
const FILES = {
  cabinet_30s: '05_机柜30秒完整报文参考.json', cabinet_60s: '05_机柜60秒完整报文参考.json',
  ems: '05_EMS完整报文参考.json', cell_voltage: '05_单体电压完整报文参考.json',
  cell_temperature: '05_单体温度完整报文参考.json',
};
const clone = value => JSON.parse(JSON.stringify(value));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const positive = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
};

function auditSources(sourceDirectory) {
  const manifest = readJson(path.join(ROOT, 'docs/ems-integration/source-manifest.json'));
  const catalog = readJson(path.join(ROOT, 'ems-cloud-protocol/src/main/resources/ems-v1-point-catalog.json'));
  const results = manifest.map(record => {
    const bytes = fs.readFileSync(path.join(sourceDirectory, record.name));
    const actual = sha256(bytes);
    if (bytes.length !== record.bytes || actual !== record.sha256.toLowerCase()) throw new Error(`Source provenance mismatch: ${record.name}`);
    if (catalog.sources[record.name] && actual !== catalog.sources[record.name]) throw new Error(`Catalog provenance mismatch: ${record.name}`);
    return {name:record.name, bytes:bytes.length, sha256:actual};
  });
  return results;
}

function loadProfile() {
  const catalog = readJson(path.join(ROOT, 'ems-cloud-protocol/src/main/resources/ems-v1-point-catalog.json'));
  const manifest = readJson(path.join(ROOT, 'docs/ems-integration/source-manifest.json'));
  const frames = {};
  for (const [type, name] of Object.entries(FILES)) {
    const filename = path.join(ROOT, 'ems-cloud-protocol/src/test/resources/wire', name);
    const bytes = fs.readFileSync(filename);
    const record = manifest.find(source => source.name === name);
    // Git on Windows checks out CRLF; the source manifest records the original LF bytes.
    const normalized = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    if (!record || ![sha256(bytes),sha256(normalized)].includes(record.sha256.toLowerCase())) throw new Error(`Fixture provenance mismatch: ${name}`);
    frames[type] = readJson(filename);
  }
  const structure = readJson(path.join(ROOT, 'ems-cloud-protocol/src/test/resources/telemetry/structure-matched-synthetic.json'));
  const profile = {catalog, frames, structure};
  validateProfile(profile);
  return profile;
}

function validateProfile(profile) {
  const {catalog, frames, structure} = profile;
  if (catalog.version !== 'ems-v1-profile-20260917' || catalog.counts.ordinary !== 295 || catalog.counts.ems !== 6 || catalog.counts.config !== 173) throw new Error('Unsupported catalog profile');
  const definitions = new Map(catalog.definitions.map(d => [`${d.namespace}:${d.sourcePointId}`, d]));
  const seen = new Set();
  for (const [type, count] of [['cabinet_30s', 241], ['cabinet_60s', 54]]) {
    let actual = 0;
    for (const subsystem of ['emu','bms','tms','pvdc','pcs','grid']) {
      const block = frames[type].d[subsystem];
      for (const [id, value] of block.p) {
        const definition = definitions.get(`cabinet:${id}`);
        if (!definition || definition.sourceType !== type || definition.subsystem !== subsystem || seen.has(id)) throw new Error('Ordinary profile placement mismatch');
        if (value !== null && (definition.wireType === 'TEXT' ? typeof value !== 'string' : definition.wireType === 'U16_WORDS' ? !Array.isArray(value) || value.length !== 4 || !value.every(v=>Number.isInteger(v)&&v>=0&&v<=65535) : typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Ordinary profile wire type mismatch');
        actual++; seen.add(id);
      }
    }
    if (actual !== count) throw new Error(`Ordinary profile count mismatch: ${type}`);
  }
  if (seen.size !== 295) throw new Error('Ordinary profile requires 295 points');
  if (frames.ems.d.base.flatMap(block=>block.p).length !== 6 || frames.ems.d.cfg.p.length !== 173 || new Set(frames.ems.d.cfg.p.map(([id])=>id)).size !== 173) throw new Error('EMS/config profile count mismatch');
  for (const [type, field] of [['cell_voltage','voltCount'],['cell_temperature','tempCount']]) {
    const bms = structure.d.clusterLayout.bms;
    const rows = frames[type].d.values;
    if (rows.length !== bms.bmuCount || rows.some(row=>row.length!==bms[field]) || rows.flat().length>500) throw new Error('Cell structure/array dimensions mismatch');
  }
}

function validateDeployment(options) {
  const config = {...DEFAULTS, ...options};
  if (config.emsId !== DEFAULTS.emsId) throw new Error('EMS identity differs from approved deployment');
  if (config.stationId !== 4) throw new Error('station identity differs from approved deployment');
  if (config.bindingPeriodId !== 2) throw new Error('binding period differs from approved deployment');
  if (config.gatewayDeviceId !== 57) throw new Error('gateway device differs from approved deployment');
  if (config.cabinetNo !== 1) throw new Error('Only approved synthetic cabinet 1 is supported');
  return config;
}

class FullPointScenario {
  constructor(options = {}, profile = loadProfile()) {
    this.options = {...DEFAULTS, ...options};
    if (!UUID4.test(this.options.emsId)) throw new Error('EMS must be a UUIDv4');
    positive(this.options.structureVersion, 'structureVersion');
    if (!Number.isSafeInteger(this.options.configRevision) || this.options.configRevision < 0) throw new Error('configRevision must be nonnegative safe integer');
    if (this.options.cabinetNo !== 1) throw new Error('Only synthetic cabinet 1 supported');
    if (this.options.counterResetAfterSeconds != null && (!Number.isFinite(this.options.counterResetAfterSeconds) || this.options.counterResetAfterSeconds <= 0)) throw new Error('counterResetAfterSeconds must be positive');
    if (!['normal','stale','invalid'].includes(this.options.qualityMode || 'normal')) throw new Error('Unsupported qualityMode');
    validateProfile(profile);
    this.profile = clone(profile);
    this.startedMono = options.startedMonoMs ?? 0;
    this.connectionId = null;
    this.cache = new Map();
    this.active = false;
  }
  beginConnection(connectionId = randomUUID(), nowMs = Date.now(), monoMs = 0) {
    if (!UUID4.test(connectionId)) throw new Error('connectionId must be a UUIDv4');
    if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isFinite(monoMs)) throw new Error('Invalid clock');
    this.connectionId = connectionId;
    this.active = true;
    this.cache.clear();
    this.next = {heartbeat:monoMs, structure:monoMs, ems:monoMs+10000, cabinet_30s:monoMs+15000,
      cabinet_60s:monoMs+20000, cell_voltage:monoMs+25000, cell_temperature:monoMs+26000};
  }
  disconnect() { this.active = false; this.cache.clear(); }
  uptime(monoMs) { return Math.max(0, (monoMs-this.startedMono)/1000); }
  structure() {
    if (!this.connectionId) throw new Error('Connection must begin before structure');
    const result = clone(this.profile.structure);
    delete result._testFixtureProvenance;
    result.connectionId = this.connectionId; result.seq = 1;
    result.sv = this.options.structureVersion;
    result.d.clusters = result.d.clusters.filter(c=>c.c === 1);
    result.d.publicMeters = [];
    return result;
  }
  frame(type, nowMs, monoMs) {
    if (!Number.isSafeInteger(nowMs) || nowMs<0 || !Number.isFinite(monoMs)) throw new Error('Invalid clock');
    if (type === 'heartbeat') return {v:1, emsId:this.options.emsId, connectionId:this.connectionId, uptimeSeconds:Math.floor(this.uptime(monoMs))};
    if (type === 'structure') return this.structure();
    if (!this.profile.frames[type]) throw new Error('Unsupported telemetry type');
    const frame = clone(this.profile.frames[type]);
    const elapsed = this.uptime(monoMs);
    const round = (v, digits=3)=>+v.toFixed(digits);
    const voltage = round(512 + 4*Math.sin(elapsed/120));
    const power = round(20 + 4*Math.sin(elapsed/90));
    const current = round(power*1000/voltage);
    const counterElapsed = this.options.counterResetAfterSeconds && elapsed>=this.options.counterResetAfterSeconds ? elapsed-this.options.counterResetAfterSeconds : elapsed;
    const baseline = this.options.counterResetAfterSeconds && elapsed>=this.options.counterResetAfterSeconds ? 0 : 1000;
    const dischargeEnergy = baseline + (20*counterElapsed + 360*(1-Math.cos(counterElapsed/90)))/3600;
    const chargeEnergy = baseline + 4*counterElapsed/3600;
    const dynamic = {
      20018:round(65+5*Math.sin(elapsed/600),2), 20021:voltage, 20022:voltage,
      20023:current, 20024:power,
      20001:round(chargeEnergy,6), 20002:round(dischargeEnergy,6),
      20060:round(chargeEnergy,6), 20061:round(dischargeEnergy,6),
      20107:round(5+Math.sin(elapsed/150)),
      20187:round(power/3), 20191:round(power/3), 20195:round(power/3), 20197:power,
      20238:round(power/6), 20242:round(power/6), 20246:round(power/6), 20248:round(power/2),
      20251:round(chargeEnergy,6), 20252:round(dischargeEnergy,6),
    };
    const mode = this.options.qualityMode || 'normal';
    const timestamp = mode === 'stale' ? nowMs-120000 : nowMs;
    if (type === 'ems') {
      // Unconfirmed 90002..90004 always retain null/invalid/sourceTime=null.
      frame.d.base[2] = {ts:mode==='invalid'?null:timestamp, q:mode==='normal'?'valid':mode,
        p:[[90005,round(23.45+3*Math.sin(elapsed/60),2)],[90006,round(56.78+2*Math.sin(elapsed/90),2)],[90007,Math.floor(86400+elapsed)]]};
      if (mode === 'invalid') frame.d.base[2].p = frame.d.base[2].p.map(([id])=>[id,null]);
      frame.d.cfg.rev = this.options.configRevision;
      return frame;
    }
    frame.c = 1;
    if (type.startsWith('cell_')) {
      frame.sv = this.options.structureVersion;
      frame.d.ts = mode==='invalid'?null:timestamp;
      frame.d.q = mode==='normal'?'valid':mode;
      if (mode === 'invalid') frame.d.values = null;
      else frame.d.values = frame.d.values.map(row=>row.map(v=>v===null?null:type==='cell_voltage'?round(v+0.005*Math.sin(elapsed/120)):Math.round(v+2*Math.sin(elapsed/180))));
      return frame;
    }
    for (const [name, block] of Object.entries(frame.d)) {
      block.ts = mode==='invalid'?null:timestamp;
      if (name === 'link') { block.online=mode==='invalid'?null:true; continue; }
      block.q = mode==='normal'?'valid':mode;
      block.p = block.p.map(([id,v])=>[id, mode==='invalid'?null:dynamic[id] ?? v]);
    }
    return frame;
  }
  envelope(kind, nowMs, monoMs) {
    const payload = this.frame(kind, nowMs, monoMs);
    const message = JSON.stringify(payload);
    const limit = kind==='structure'?65536:6144;
    if (Buffer.byteLength(message)>limit) throw new Error(`Payload too large: ${kind}`);
    return {kind, topic:`ems/v1/${this.options.emsId}/up/${kind==='heartbeat'?'heartbeat':'telemetry'}`, message, qos:kind==='structure'?1:0, retain:false};
  }
  due(nowMs, monoMs) {
    if (!this.active) return [];
    const periods = {heartbeat:30000, ems:60000, cabinet_30s:30000, cabinet_60s:60000, cell_voltage:60000, cell_temperature:60000};
    const messages = [];
    for (const kind of ['heartbeat','structure','ems','cabinet_30s','cabinet_60s','cell_voltage','cell_temperature']) {
      if (monoMs>=this.next[kind]) {
        messages.push(this.envelope(kind,nowMs,monoMs));
        // A late or disconnected scheduler never emits a replay of missed ordinary frames.
        this.next[kind]=periods[kind]?monoMs+periods[kind]:Infinity;
      }
    }
    return messages;
  }
  request(request, nowMs, monoMs) {
    if (!this.active || !request || request.emsId!==this.options.emsId || typeof request.id!=='string' || !/^[A-Za-z0-9_-]{1,64}$/.test(request.id)) return null;
    const error = code=>({v:1, emsId:this.options.emsId, id:request.id, ok:false, error:{code,message:code}});
    if (!UUID4.test(request.connectionId || '') || !Number.isSafeInteger(request.v) || !Number.isSafeInteger(request.expiresAtMs) || request.expiresAtMs<0 || typeof request.op!=='string' || !request.params || typeof request.params!=='object' || Array.isArray(request.params)) return error('INVALID_REQUEST');
    if (request.v!==1) return error('UNSUPPORTED_VERSION');
    if (!['structure.get','alarm.current.get'].includes(request.op)) return error('UNKNOWN_OPERATION');
    const keys=Object.keys(request.params);
    if (request.op==='structure.get'?keys.length!==0:keys.length!==1||keys[0]!=='c'||request.params.c!==1) return error('INVALID_REQUEST');
    if (request.connectionId!==this.connectionId) return error('CONNECTION_MISMATCH');
    if (nowMs>=request.expiresAtMs) return error('REQUEST_EXPIRED');
    const canonical = JSON.stringify([request.v,request.emsId,request.connectionId,request.id,request.op,request.expiresAtMs,request.params.c ?? null]);
    for (const [id,record] of this.cache) if (monoMs-record.acceptedMono>=60000) this.cache.delete(id);
    const cached=this.cache.get(request.id);
    if (cached) return cached.canonical===canonical?clone(cached.response):error('INVALID_REQUEST');
    if (this.cache.size>=32) return error('BUSY');
    const data = request.op==='structure.get'?this.structure():{v:1,type:'alarm_current',connectionId:this.connectionId,c:1,seq:1,alarms:null};
    const response={v:1,emsId:this.options.emsId,id:request.id,ok:true,data};
    this.cache.set(request.id,{acceptedMono:monoMs,canonical,response:clone(response)});
    return response;
  }
}

module.exports = {DEFAULTS, UUID4, ROOT, loadProfile, validateProfile, validateDeployment, auditSources, FullPointScenario};
