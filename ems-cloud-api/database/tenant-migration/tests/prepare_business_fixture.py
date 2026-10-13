"""Create the future-station fixture only in the isolated refactor test database.

Requires the nonsecret HTTP report and EMS_SSH_PASSWORD; never reads a production
runtime password. This intentionally has no configurable target database.
"""
import json
import os
from pathlib import Path
import re
import paramiko

report_path = Path(os.environ['EMS_TENANT_TEST_REPORT'])
report = json.loads(report_path.read_text(encoding='utf-8'))
tenant = int(report['tenantId'])
account = report['account']
assert tenant > 0 and re.fullmatch(r'company-[0-9a-f]+@example\.invalid', account)
sql = f"""
BEGIN;
DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_refactor_test' THEN RAISE EXCEPTION 'wrong database'; END IF;
END $$;
INSERT INTO station(code,name,rated_power_kw,capacity_kwh,tenant_id,manager_id)
 SELECT 'TEST-SAAS-B-'||t.tenant_id::text,'隔离验收 B 新增电站',100,200,t.tenant_id,a.user_id
 FROM company_profile t JOIN tenant_administrator a ON a.tenant_id=t.tenant_id
 JOIN app_user u ON u.id=a.user_id
 WHERE t.tenant_id={tenant} AND u.account='{account}' AND t.name LIKE '隔离验收企业 %'
 ON CONFLICT(code) DO NOTHING;
SELECT id FROM station WHERE code='TEST-SAAS-B-{tenant}';
COMMIT;
"""
client = paramiko.SSHClient()
client.load_system_host_keys()
client.connect(os.environ.get('EMS_SSH_HOST','120.27.23.229'),username=os.environ.get('EMS_SSH_USER','root'),password=os.environ.pop('EMS_SSH_PASSWORD'),allow_agent=False,look_for_keys=False,timeout=20)
try:
 stdin,stdout,stderr=client.exec_command('sudo -u postgres psql -X -q -At -v ON_ERROR_STOP=1 -d ems_cloud_saas_refactor_test',timeout=120)
 stdin.write(sql)
 stdin.channel.shutdown_write()
 output=stdout.read().decode().strip()
 error=stderr.read().decode()
 if stdout.channel.recv_exit_status()!=0:raise RuntimeError('Fixture preparation failed: '+error[:1000])
 report['fixtureStationId']=int(output)
 report_path.write_text(json.dumps(report),encoding='utf-8')
 print('Prepared clearly marked future station in isolated enterprise B')
finally:
 client.close()
