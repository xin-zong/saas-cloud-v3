#!/usr/bin/env python3
"""Read-only source comparison over strict SSH; prints booleans, never secrets."""
import json,pathlib,shlex,subprocess,sys
from release import load_env
root=pathlib.Path(__file__).resolve().parents[2]
local=load_env(root/'ems-cloud-api/.env')
keys=['EMS_MFA_ENCRYPTION_KEY','EMS_CH_USERNAME','EMS_CH_PASSWORD','EMS_CH_DATABASE','EMS_DB_PASSWORD']
payload={key:local.get(key,'') for key in keys}
remote=r'''
import base64,json,pathlib,subprocess,sys,urllib.request,re
local=json.load(sys.stdin)
pid=subprocess.check_output(['systemctl','show','ems-cloud-v3-api.service','-p','MainPID','--value'],text=True).strip()
prod=dict(line.split('=',1) for line in pathlib.Path('/proc/'+pid+'/environ').read_text().split('\0') if '=' in line)
db=dict(line.split('=',1) for line in pathlib.Path('/etc/ems-cloud-toyingzhen/database.env').read_text().splitlines() if '=' in line and not line.startswith('#'))
checks={'mfaMatchesRunningProduction':bool(local['EMS_MFA_ENCRYPTION_KEY']) and local['EMS_MFA_ENCRYPTION_KEY']==prod.get('EMS_MFA_ENCRYPTION_KEY'),'readonlyHistoryCredentialsMatchProduction':all(local[k] and local[k]==prod.get(k) for k in ['EMS_CH_USERNAME','EMS_CH_PASSWORD','EMS_CH_DATABASE']),'databasePasswordMatchesIsolatedCloudConfig':bool(local['EMS_DB_PASSWORD']) and local['EMS_DB_PASSWORD']==db.get('EMS_DB_PASSWORD')}
token=base64.b64encode((local['EMS_CH_USERNAME']+':'+local['EMS_CH_PASSWORD']).encode()).decode()
checks['historyReadonlyEnforced']=False
try:
 req=urllib.request.Request('http://127.0.0.1:18123/',data=b'SELECT 1 FORMAT TabSeparated',headers={'Authorization':'Basic '+token})
 with urllib.request.urlopen(req,timeout=10) as response:checks['historySelectAllowed']=response.read(100).decode().strip()=='1'
except Exception:checks['historySelectAllowed']=False
try:
 req=urllib.request.Request('http://127.0.0.1:18123/',data=b'SHOW GRANTS FORMAT TabSeparated',headers={'Authorization':'Basic '+token})
 with urllib.request.urlopen(req,timeout=10) as response:grants=response.read(65536).decode().splitlines()
 allowed={'SELECT','SHOW','SHOW DATABASES','SHOW TABLES','SHOW COLUMNS','SHOW DICTIONARIES','USAGE'}
 checks['historyReadonlyEnforced']=bool(grants) and all((match:=re.fullmatch(r'GRANT (.+?) ON .+? TO .+',line)) and set(p.strip() for p in match[1].split(','))<=allowed and 'WITH GRANT OPTION' not in line for line in grants)
except Exception:pass
print(json.dumps(checks));sys.exit(0 if all(checks.values()) else 1)
'''
result=subprocess.run(['ssh','-T','-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes','-i',str(pathlib.Path.home()/'.ssh/codex_chuneng_shared_test_20260915'),'root@120.27.23.229','python3 -c '+shlex.quote(remote)],input=json.dumps(payload),capture_output=True,text=True)
# Remote program output is a closed boolean map; never echo unexpected SSH errors/data.
try:
 data=json.loads(result.stdout)
 if not isinstance(data,dict) or set(data)!={'mfaMatchesRunningProduction','readonlyHistoryCredentialsMatchProduction','databasePasswordMatchesIsolatedCloudConfig','historyReadonlyEnforced','historySelectAllowed'} or any(type(value) is not bool for value in data.values()):raise ValueError()
 print(json.dumps(data,indent=2))
except Exception:
 print('Read-only configuration audit failed; no remote details displayed',file=sys.stderr);sys.exit(1)
sys.exit(result.returncode if result.returncode else 0)
