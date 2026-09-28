// Official MQTTX CLI custom scenario shape: generator(faker, options) -> topic/message.
// One selected type per run. Use run.cjs for a complete connection-aware mixed-QoS session.
const {performance} = require('node:perf_hooks');
const {randomUUID} = require('node:crypto');
const {FullPointScenario,DEFAULTS} = require('./profile.cjs');
const kind=process.env.EMS_SIM_KIND || 'cabinet_30s';
if (!['heartbeat','structure','ems','cabinet_30s','cabinet_60s','cell_voltage','cell_temperature'].includes(kind)) throw new Error('Unsupported EMS_SIM_KIND');
const started=performance.now();
const options={...DEFAULTS,startedMonoMs:started};
if(process.env.EMS_SIM_STRUCTURE_VERSION) options.structureVersion=Number(process.env.EMS_SIM_STRUCTURE_VERSION);
if(process.env.EMS_SIM_CONFIG_REVISION) options.configRevision=Number(process.env.EMS_SIM_CONFIG_REVISION);
const scenario=new FullPointScenario(options);
scenario.beginConnection(process.env.EMS_SIM_CONNECTION_ID || randomUUID(),Date.now(),started);
module.exports={
  name:'hefei-fullpoint-single-type-synthetic',version:'1.0.0',
  generator(_faker,options) {
    if(options.clientId!==DEFAULTS.emsId) throw new Error('Unexpected EMS client ID (MQTTX count must be 1)');
    const generated=scenario.envelope(kind,Date.now(),performance.now());
    return {topic:generated.topic,message:generated.message};
  },
};
