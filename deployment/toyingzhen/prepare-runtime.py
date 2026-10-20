#!/usr/bin/env python3
"""Create ignored private runtime from existing local isolated config. No upload."""
import os,pathlib,sys
from release import ENV_KEYS,SMTP_KEYS,SMTP_OPTIONAL_KEYS,AGENT_KEYS,PUBLIC,load_env,validate_env
root=pathlib.Path(__file__).resolve().parents[2]
source=load_env(root/'ems-cloud-api/.env')
env={k:source.get(k,'') for k in ENV_KEYS}
env.update({k:source[k] for k in SMTP_KEYS|SMTP_OPTIONAL_KEYS|AGENT_KEYS if k in source})
env.update(EMS_DB_URL='jdbc:postgresql://127.0.0.1:5432/ems_cloud_saas_toyingzhen',EMS_CH_URL='http://127.0.0.1:18123',EMS_BIND_ADDRESS='127.0.0.1',EMS_PORT='18091',EMS_CORS_ORIGINS=PUBLIC,EMS_TENANT_PUBLIC_URL=PUBLIC,EMS_ALARM_ENGINE_ENABLED='false')
validate_env(env)
# systemd EnvironmentFile parses quoted values; quote and escape without using a shell.
# Existing private .env syntax is plain values. Validate no env expansion in this file.
def quoted(value):return '"'+value.replace('\\','\\\\').replace('"','\\"')+'"'
out=root/'.local-tools/deploy-toyingzhen/runtime.env'
if out.exists():raise SystemExit('Refusing private runtime overwrite; compare/review existing file locally')
out.parent.mkdir(parents=True,exist_ok=True)
# Unquoted serialization is restricted to systemd-safe tokens so validator and service agree.
if any(any(c.isspace() for c in value) or any(c in value for c in ['"',"'",'\\']) for value in env.values()):raise SystemExit('Private runtime contains values requiring quoting; prepare securely on target instead')
with open(out,'x',encoding='utf-8',newline='\n') as file:
    os.chmod(out,0o600)
    for key in sorted(env):file.write(key+'='+env[key]+'\n')
print('Private runtime prepared in ignored .local-tools/deploy-toyingzhen/runtime.env; no values printed or uploaded')
