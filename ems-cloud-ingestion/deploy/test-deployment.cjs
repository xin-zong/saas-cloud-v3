const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const bash = process.env.BASH_BIN || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash');
const run = (...args) => spawnSync(bash, args, {encoding:'utf8', cwd:__dirname});
test('permanent and recreated preview preserve the active 8443 CORS origins', () => {
  const origins='http://localhost:8443,http://127.0.0.1:8443';
  const unit=readFileSync(path.join(__dirname,'systemd/ems-cloud-v3-api.service'),'utf8');
  const transition=readFileSync(path.join(__dirname,'api-preview-transition.sh'),'utf8');
  assert.ok(unit.includes(`Environment=EMS_CORS_ORIGINS=${origins}`));
  assert.ok(transition.includes(`--setenv=EMS_CORS_ORIGINS=${origins}`));
  assert.ok(transition.includes('verify_api_cors()'));
});
test('API CORS probe checks both approved origins and rejects healthy 5173-only responses', () => {
  const transition=readFileSync(path.join(__dirname,'api-preview-transition.sh'),'utf8');
  const probe=transition.match(/verify_api_cors\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(probe,'CORS response probe missing');
  const correct=`curl() { local arg selected; for arg in "$@"; do if [[ $arg == 'Origin: '* ]]; then selected=\${arg#Origin: }; fi; done; printf 'HTTP/1.1 200 OK\\r\\nAccess-Control-Allow-Origin: %s\\r\\n\\r\\n' "$selected"; }`;
  let result=run('-c',`${correct}\n${probe}\nverify_api_cors`);
  assert.equal(result.status,0,result.stderr);
  for(const wrong of ['http://localhost:5173','http://localhost:8443','*','']) {
    const mock=`curl() { printf 'HTTP/1.1 200 OK\\r\\nAccess-Control-Allow-Origin: ${wrong}\\r\\n\\r\\n'; }`;
    result=run('-c',`${mock}\n${probe}\nverify_api_cors`);
    assert.notEqual(result.status,0,`unexpectedly accepted ${wrong}`);
  }
});
test('empty fleet grants only the exact cloud channels', () => {
  const result = run('render-acl.sh');
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], 'user ems-cloud-v3-ingestion');
  assert.equal(lines.length, 9);
  assert.equal(lines.filter(x => x.startsWith('topic read ems/v1/+/up/')).length, 6);
  assert.equal(lines.filter(x => x.startsWith('topic write ems/v1/+/down/')).length, 2);
  assert.ok(!result.stdout.includes('pattern'));
  assert.ok(!result.stdout.includes('#'));
});
test('registered UUID gets exactly six publishes and two reads', () => {
  const id='755facdc-9bdf-43d0-9412-c94f860a01ec';
  const result=run('render-acl.sh', id);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout.split('\n').filter(x=>x.startsWith(`topic write ems/v1/${id}/up/`)).length,6);
  assert.equal(result.stdout.split('\n').filter(x=>x.startsWith(`topic read ems/v1/${id}/down/`)).length,2);
});
test('invalid, cloud, uppercase, duplicate UUIDs fail without partial ACL', () => {
  const id='755facdc-9bdf-43d0-9412-c94f860a01ec';
  for(const args of [['ems-cloud-v3-ingestion'],[id.toUpperCase()],['+/up/#'],[id,id],[id,'bad']]) {
    const result=run('render-acl.sh',...args);
    assert.notEqual(result.status,0);
    assert.equal(result.stdout,'');
  }
});
test('all deployment shell files parse', () => {
  for(const file of ['render-acl.sh','worker-launch.sh','preflight.sh','stage-release.sh','api-preview-transition.sh']) {
    const result=run('-n',file);
    assert.equal(result.status,0,`${file}: ${result.stderr}`);
  }
});
test('worker refuses absent managed config and never prints secret values', () => {
  const env = {...process.env};
  for (const key of Object.keys(env)) if (key.startsWith('EMS_')) delete env[key];
  let result=spawnSync(bash,['worker-launch.sh'],{encoding:'utf8',cwd:__dirname,env});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Missing managed environment: EMS_DB_URL/);
  for(const key of ['EMS_DB_URL','EMS_DB_USERNAME','EMS_DB_PASSWORD','EMS_CH_HTTP_URL','EMS_CH_USER','EMS_CH_PASSWORD','EMS_MQTT_CA','EMS_MQTT_CERT','EMS_MQTT_KEY']) env[key]='test-secret-never-print';
  env.EMS_MQTT_URI='ssl://127.0.0.1:8883';
  result=spawnSync(bash,['worker-launch.sh'],{encoding:'utf8',cwd:__dirname,env});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/Strict MQTT URI/);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('test-secret-never-print'));
});
