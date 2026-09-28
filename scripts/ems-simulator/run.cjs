// One MQTT.js connection. Reuses the dependency shipped with official mqttx-cli.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');
const { FullPointScenario, validateDeployment, ROOT } = require('./profile.cjs');

class SimulatorRuntime {
  constructor(client, options, clocks = {}) {
    this.client = client;
    this.options = options;
    this.now = clocks.now || Date.now;
    this.mono = clocks.mono || (()=>performance.now());
    this.uuid = clocks.uuid || randomUUID;
    this.log = clocks.log || (record=>process.stdout.write(JSON.stringify(record)+'\n'));
    this.scenario = clocks.scenario || new FullPointScenario({...options, startedMonoMs:clocks.startedMonoMs ?? this.mono()});
    const prefix=`ems/v1/${options.emsId}`;
    this.subscriptionTopics = [prefix+'/down/request',prefix+'/down/ack'];
    this.ready=false; this.epoch=0; this.queue=[]; this.draining=null; this.stopped=false;
    this.stats={sender:'MQTT.js (official mqttx-cli dependency)',synthetic:true,sent:0,byType:{}};
  }
  connected() {
    const epoch=++this.epoch;
    const connectionId=this.uuid();
    this.ready=false;
    this.client.subscribe(this.subscriptionTopics, {qos:1}, (error, grants)=>{
      if (this.stopped || this.epoch!==epoch || !this.client.connected) return;
      if (error || !Array.isArray(grants) || this.subscriptionTopics.some(topic=>!grants.some(grant=>grant.topic===topic&&grant.qos===1))) {
        this.log({event:'subscription_rejected'});
        this.client.end?.(true);
        return;
      }
      this.scenario.beginConnection(connectionId,this.now(),this.mono());
      this.ready=true;
      this.stats.connectionId=connectionId;
      this.log({event:'ready',synthetic:true,connectionId});
      this.tick().catch(error=>this.fail(error));
    });
  }
  disconnected() {
    this.ready=false; this.epoch++; this.queue=[];
    this.scenario.disconnect();
  }
  fail(error) {
    // Never serialize transport options, certificate bytes, or a credential-bearing error.
    this.log({event:'transport_failure',code:error?.code || 'PUBLISH_FAILED'});
    this.disconnected();
    this.client.end?.(true);
  }
  async tick() {
    if (!this.ready || this.stopped || !this.client.connected) return;
    const now=this.now(), mono=this.mono();
    for (const message of this.scenario.due(now,mono)) {
      // Keep only the latest unsent value for each ordinary object.
      const existing=this.queue.findIndex(item=>item.kind===message.kind);
      if (existing>=0) this.queue[existing]=message;
      else if (this.queue.length<8) this.queue.push(message);
      else throw new Error('Bounded send queue full');
    }
    await this.flush();
  }
  async flush() {
    if (this.draining) return this.draining;
    const epoch=this.epoch;
    this.draining=(async()=>{
      while (this.ready && !this.stopped && this.epoch===epoch && this.client.connected && this.queue.length) {
        const message=this.queue.shift();
        await new Promise((resolve,reject)=>{
          const timeout=setTimeout(()=>reject(Object.assign(new Error('Publish timeout'),{code:'PUBLISH_TIMEOUT'})),10000);
          this.client.publish(message.topic,message.message,{qos:message.qos,retain:false},error=>{
            clearTimeout(timeout);
            error?reject(error):resolve();
          });
        });
        if (this.epoch!==epoch) break;
        this.stats.sent++;
        this.stats.byType[message.kind]=(this.stats.byType[message.kind]||0)+1;
        this.stats.lastPublishedAtMs=this.now();
        this.log({event:'published',kind:message.kind,qos:message.qos,bytes:Buffer.byteLength(message.message),sentAtMs:this.stats.lastPublishedAtMs});
      }
    })();
    try { await this.draining; } finally { this.draining=null; }
  }
  async received(topic, bytes, packet={}) {
    if (!this.ready || this.stopped || packet.retain || bytes.length>4096) return;
    if (topic===this.subscriptionTopics[1]) {
      // Structure has no business ACK. No alarm/history reliable objects are emitted.
      this.log({event:'ack_observed',bytes:bytes.length});
      return;
    }
    if (topic!==this.subscriptionTopics[0]) return;
    let request;
    try { request=JSON.parse(bytes.toString('utf8')); } catch { return; }
    const epoch=this.epoch;
    const response=this.scenario.request(request,this.now(),this.mono());
    if (!response || this.epoch!==epoch || !this.ready) return;
    const message=JSON.stringify(response);
    if (Buffer.byteLength(message)>65536 || this.queue.length>=8) return;
    this.queue.unshift({kind:'response',topic:`ems/v1/${this.options.emsId}/up/response`,message,qos:1,retain:false});
    await this.flush();
  }
  stop() { this.stopped=true; this.disconnected(); }
}

function readConfig(filename) {
  const config=JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
  validateDeployment(config);
  if (!config.host || typeof config.host!=='string' || config.host.includes('://') || /[\s/@]/.test(config.host)) throw new Error('host must contain a bare broker host');
  if (config.port!==8884) throw new Error('Only approved mTLS listener 8884 is allowed');
  for (const field of ['caPath','certPath','keyPath','stateDirectory']) {
    if (!config[field] || !path.isAbsolute(config[field])) throw new Error(`${field} must be an absolute local path`);
  }
  const state=path.resolve(config.stateDirectory), repo=path.resolve(ROOT);
  if (state===repo || state.startsWith(repo+path.sep)) throw new Error('Runtime stateDirectory must remain outside the repository');
  const values={...validateDeployment(config),...config};
  new FullPointScenario(values); // Validate protocol options before any network access.
  return values;
}

function acquireProcessLock(lockFile, identity, lifecycle=process) {
  const ownerToken=randomUUID();
  let descriptor;
  try { descriptor=fs.openSync(lockFile,'wx'); }
  catch { throw new Error('Simulator lock exists; inspect the recorded PID before removing a stale lock'); }
  try {
    fs.writeFileSync(descriptor,JSON.stringify({...identity,ownerToken,startedAt:new Date().toISOString()}));
  } catch(error) {
    try { fs.closeSync(descriptor); } catch {}
    try { fs.unlinkSync(lockFile); } catch {}
    throw error;
  }
  let released=false;
  const release=()=>{
    if (released) return;
    released=true;
    try {
      const currentOwner=JSON.parse(fs.readFileSync(lockFile,'utf8'));
      if (currentOwner.ownerToken===ownerToken) fs.unlinkSync(lockFile);
    } catch {
      // Missing/replaced/malformed locks do not grant ownership to the old process.
    } finally {
      try { fs.closeSync(descriptor); } catch {}
    }
  };
  // Stop can leave a publish timeout or transport handle alive; retain exclusivity until exit.
  lifecycle.once('exit',release);
  return {release};
}

function main(argv=process.argv.slice(2)) {
  if (argv.length!==2 || argv[0]!=='--config') throw new Error('Usage: node run.cjs --config ABSOLUTE_PRIVATE_CONFIG.json');
  const config=readConfig(path.resolve(argv[1]));
  fs.mkdirSync(config.stateDirectory,{recursive:true});
  const lockFile=path.join(config.stateDirectory,'ems-fullpoint.lock');
  const statusFile=path.join(config.stateDirectory,'ems-fullpoint-status.json');
  const stopFile=path.join(config.stateDirectory,'STOP-FULLPOINT');
  acquireProcessLock(lockFile,{pid:process.pid,emsId:config.emsId});
  let client,runtime,retryTimer,tickTimer,stopping=false,attempt=0;
  const startedMonoMs=performance.now();
  const scenario=new FullPointScenario({...config,startedMonoMs});
  const log=record=>process.stdout.write(JSON.stringify(record)+'\n');
  const stop=()=>{
    if (stopping) return;
    stopping=true; clearTimeout(retryTimer); clearInterval(tickTimer);
    runtime?.stop(); client?.end(true);
    log({event:'stopping',synthetic:true});
  };
  process.once('SIGINT',stop); process.once('SIGTERM',stop);
  let mqtt,tlsOptions;
  try {
    mqtt=config.mqttModulePath?require(path.resolve(config.mqttModulePath)):require('mqtt');
    tlsOptions={ca:fs.readFileSync(config.caPath),cert:fs.readFileSync(config.certPath),key:fs.readFileSync(config.keyPath)};
  } catch { throw new Error('MQTT dependency or local certificate path unavailable; certificate contents are never logged'); }
  const connect=()=>{
    if (stopping) return;
    client=mqtt.connect({protocol:'mqtts',host:config.host,port:8884,clientId:config.emsId,
      protocolVersion:4,clean:true,keepalive:30,rejectUnauthorized:true,minVersion:'TLSv1.2',reconnectPeriod:0,
      queueQoSZero:false,connectTimeout:15000,...tlsOptions});
    runtime=new SimulatorRuntime(client,config,{scenario,startedMonoMs,log});
    const activeClient=client,activeRuntime=runtime;
    activeClient.on('connect',()=>{attempt=0;activeRuntime.connected();});
    activeClient.on('message',(topic,bytes,packet)=>activeRuntime.received(topic,bytes,packet).catch(error=>activeRuntime.fail(error)));
    activeClient.on('error',error=>{
      const permanent=/CERT|TLS|SSL|UNABLE_TO_VERIFY|SELF_SIGNED|ALTNAME/.test(error.code||'') || [4,5].includes(error.code);
      log({event:permanent?'certificate_or_auth_rejected':'connection_error',code:error.code||'MQTT_ERROR'});
      if (permanent) {process.exitCode=1;stop();} else activeClient.end(true);
    });
    activeClient.once('close',()=>{
      activeRuntime.stop();
      // Recreate the client so MQTT.js cannot resend old QoS1 structure/response packets.
      activeClient.end(true);
      if (!stopping) {
        const delayMs=Math.min(30000,1000*2**Math.min(attempt++,5));
        log({event:'reconnect_scheduled',delayMs});
        retryTimer=setTimeout(connect,delayMs);
      }
    });
  };
  tickTimer=setInterval(()=>{
    if (fs.existsSync(stopFile)) {stop();return;}
    const activeRuntime=runtime;
    activeRuntime?.tick().catch(error=>activeRuntime.fail(error));
    if (runtime) fs.writeFileSync(statusFile,JSON.stringify({...runtime.stats,online:runtime.ready,synthetic:true,structureVersion:config.structureVersion,configRevision:config.configRevision},null,2));
  },250);
  if (fs.existsSync(stopFile)) { stop(); return; }
  connect();
}

if (require.main===module) {
  try { main(); } catch(error) { process.stderr.write(error.message+'\n'); process.exitCode=1; }
}
module.exports={SimulatorRuntime,readConfig,acquireProcessLock,main};
