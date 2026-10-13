"""Explicit, backed-up tenant cutover. Dry-run by default; never touches old business DBs.

Requires paramiko and EMS_SSH_PASSWORD. New coverage accounts require a private BCrypt
hash in EMS_TENANT_SEED_PASSWORD_HASH. Passwords and token material are never printed.
Run only while API/protocol writers to the TARGET database are stopped.
"""
import argparse,datetime,importlib.util,json,os,pathlib,re,shlex
import paramiko

HERE=pathlib.Path(__file__).resolve().parent
def load(name):
 spec=importlib.util.spec_from_file_location(name,HERE/(name+'.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def quote(value):return "'"+str(value).replace("'","''")+"'"
def inventory_sql():return "SELECT json_build_object('users',(SELECT json_agg(json_build_object('id',id,'account',account)) FROM app_user),'stations',(SELECT json_agg(json_build_object('id',id,'code',code)) FROM station));"
def snapshot_sql():return "SELECT json_build_object('stations',(SELECT json_agg(id ORDER BY id) FROM station),'devices',(SELECT json_agg(id ORDER BY id) FROM device),'points',(SELECT json_agg(id ORDER BY id) FROM measurement_point),'bindings',(SELECT json_agg(id ORDER BY id) FROM ems_binding_period),'contracts',(SELECT json_agg(id ORDER BY id) FROM contract),'credentials',(SELECT json_object_agg(id,md5(password_hash)) FROM app_user));"
class Connection:
 def __init__(self,database):
  self.database=database;self.client=paramiko.SSHClient();self.client.load_system_host_keys();self.client.connect(os.environ.get('EMS_SSH_HOST','120.27.23.229'),username=os.environ.get('EMS_SSH_USER','root'),password=os.environ.pop('EMS_SSH_PASSWORD'),look_for_keys=False,allow_agent=False,timeout=20);self.client.get_transport().set_keepalive(20)
 def run(self,command,stdin=None):
  i,o,e=self.client.exec_command(command,timeout=300)
  if stdin is not None:i.write(stdin);i.channel.shutdown_write()
  value=o.read().decode();error=e.read().decode();status=o.channel.recv_exit_status()
  if status:raise RuntimeError('Migration command failed: '+error[:1500])
  return value
 def sql(self,sql,transaction=False):
  guard="DO $$ BEGIN IF current_database()<>"+quote(self.database)+" THEN RAISE EXCEPTION 'wrong target database'; END IF; END $$;\n"
  if transaction:sql='BEGIN;\n'+sql+'\nCOMMIT;\n'
  return self.run('sudo -u postgres psql -X -q -At -v ON_ERROR_STOP=1 -d '+shlex.quote(self.database),guard+sql)
 def close(self):self.client.close()
def main():
 parser=argparse.ArgumentParser();parser.add_argument('--database',required=True);parser.add_argument('--mapping',type=pathlib.Path,required=True);parser.add_argument('--report',type=pathlib.Path,required=True);parser.add_argument('--apply',action='store_true');parser.add_argument('--confirmed-live-cutover',action='store_true');args=parser.parse_args()
 test=bool(re.fullmatch(r'ems_cloud_saas_[a-z_]+_test',args.database));live=args.database=='ems_cloud_saas_v3'
 if not test and not(live and args.confirmed_live_cutover):raise SystemExit('Only isolated SaaS test DBs or explicitly confirmed NEW ems_cloud_saas_v3 are permitted')
 c=Connection(args.database)
 try:
  inventory=json.loads(c.sql(inventory_sql()));mapping=json.loads(args.mapping.read_text(encoding='utf-8-sig'));errors=load('preflight').validate(inventory,mapping)
  if errors:raise SystemExit('Ownership preflight failed: '+'; '.join(errors))
  if not args.apply:print('Preflight passed; dry-run, no writes performed');return
  if c.sql("SELECT to_regclass('public.tenant') IS NOT NULL;").strip()=='t':raise SystemExit('Target already expanded; reconcile its migration state explicitly, do not replay the seed')
  original=json.loads(c.sql(snapshot_sql()));stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');backup=f'/tmp/{args.database}-before-tenant-{stamp}.dump'
  c.run('sudo -u postgres sh -c '+shlex.quote('umask 077; exec pg_dump -Fc -f '+shlex.quote(backup)+' '+shlex.quote(args.database)))
  applied=[];migrations=HERE.parents[1]/'src/main/resources/db/migration'
  known_design=c.sql("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('station_design','station_design_node','station_design_port','station_design_communication','station_design_electrical');").strip()
  if known_design=='0':
   c.sql((migrations/'V18__station_design.sql').read_text(encoding='utf-8')+'\nINSERT INTO schema_migration(version) VALUES(18) ON CONFLICT DO NOTHING;',True)
  elif known_design=='5':c.sql('INSERT INTO schema_migration(version) VALUES(18) ON CONFLICT DO NOTHING;',True)
  else:raise SystemExit('Partial engineering design migration detected; refusing to infer missing schema')
  for version in range(19,23):
   file=next(migrations.glob(f'V{version}__*.sql'));c.sql(file.read_text(encoding='utf-8')+f'\nINSERT INTO schema_migration(version) VALUES({version});',True);applied.append(version)
  seed=load('seed').build_seed(inventory,mapping,os.environ.pop('EMS_TENANT_SEED_PASSWORD_HASH'));c.sql(seed)
  for version in range(23,26):
   file=next(migrations.glob(f'V{version}__*.sql'));c.sql(file.read_text(encoding='utf-8')+f'\nINSERT INTO schema_migration(version) VALUES({version});',True);applied.append(version)
  after=json.loads(c.sql(snapshot_sql()))
  for key in ['stations','devices','points','bindings','contracts']:
   if original[key]!=after[key]:raise RuntimeError('Resource ID reconciliation failed: '+key)
  if any(after['credentials'].get(id)!=hash for id,hash in original['credentials'].items()):raise RuntimeError('Existing credential reconciliation failed')
  if c.sql("SELECT to_regclass('organization') IS NULL AND to_regclass('customer') IS NULL;").strip()!='t':raise RuntimeError('Legacy tables remain')
  report={'database':args.database,'backup':backup,'appliedVersions':applied,'originalAccountsUnchanged':True,'resourceIdsPreserved':{k:len(original[k] or []) for k in ['stations','devices','points','bindings','contracts']},'legacyTablesRemoved':True}
  args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print('Migration and resource reconciliation passed; report: '+str(args.report))
 finally:c.close()
if __name__=='__main__':main()
