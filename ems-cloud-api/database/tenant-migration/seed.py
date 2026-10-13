"""Generate a reviewed, single-use tenant backfill; existing password hashes never change.

Requires explicit inventory/mapping and EMS_TENANT_SEED_PASSWORD_HASH for NEW accounts.
Writes SQL to the requested private file, never prints credentials or hash values.
"""
import importlib.util,json,os,sys
from pathlib import Path

API=Path(__file__).resolve().parents[2]
def q(value):
 if value is None:return 'NULL'
 if isinstance(value,bool):return 'true' if value else 'false'
 if isinstance(value,int):return str(value)
 return "'"+str(value).replace("'","''")+"'"

NEW_PERMISSIONS={
 'overview.read':('查看总览','station','read'),
 'company.application.read':('查看企业申请','tenant','read'),'company.application.review':('审批企业申请','tenant','write'),
 'menu.manage':('管理菜单','tenant','write'),'package.manage':('管理权限包','tenant','write'),'role.template.manage':('管理预制角色','tenant','write'),
 'company.read':('查看企业','tenant','read'),'company.manage':('管理企业','tenant','write'),
 'company.profile.read':('查看本企业资料','tenant','read'),'company.profile.manage':('编辑本企业资料','tenant','write'),
 'company.people.read':('查看员工','tenant','read'),'company.people.manage':('管理员工','tenant','write'),
 'company.role.manage':('管理租户角色','tenant','write'),'company.grant.manage':('管理角色站点授权','tenant','write'),
 'tenant.data.read':('跨租户读取数据','tenant','read'),'tenant.data.write':('跨租户控制数据','tenant','write')}
RETIRED={'customer.read','customer.manage','organization.member.read','organization.manage','member.manage.profile','member.grant.manage','role.manage','member.manage','workorder.manage'}

def build_seed(inventory,mapping,password_hash):
 spec=importlib.util.spec_from_file_location('ownership_preflight',Path(__file__).with_name('preflight.py'))
 preflight=importlib.util.module_from_spec(spec);spec.loader.exec_module(preflight)
 errors=preflight.validate(inventory,mapping)
 if errors:raise ValueError('; '.join(errors))
 if not password_hash.startswith(('$2a$','$2b$','$2y$')):raise ValueError('BCrypt hash required for new test accounts')
 catalog=json.loads((API/'src/main/resources/permission-catalog.json').read_text(encoding='utf-8'))
 permissions={x['code']:(x['name'],'tenant' if x['code'] in ('asset.create','audit.read') else 'station','read' if x['code'].rsplit('.',1)[-1] in ('read','query','export') else 'write') for x in catalog if x.get('available') and x['code'] not in RETIRED}
 permissions.update(NEW_PERMISSIONS)
 sql=['BEGIN;',"DO $$ BEGIN IF EXISTS(SELECT 1 FROM tenant) THEN RAISE EXCEPTION 'tenant backfill already performed'; END IF; END $$;",
      'CREATE TEMP TABLE credentials_before AS SELECT id,password_hash FROM app_user;',
      "INSERT INTO tenant(kind) VALUES('platform'),('enterprise');",
      "INSERT INTO company_profile(tenant_id,name,country,province,city,address,postcode,contact_name,phone) SELECT id,'演示企业','CN','安徽','合肥','演示资料，请补充企业地址','230000','演示企业联系人','未设置' FROM tenant WHERE kind='enterprise';",
      "INSERT INTO tenant_company_type SELECT id,'operator' FROM tenant WHERE kind='enterprise';",
      "INSERT INTO tenant_business_scope SELECT id,'commercial' FROM tenant WHERE kind='enterprise';"]
 for user in inventory['users']:
  kind='platform' if mapping['users'][user['account'].strip().lower()]=='platform' else 'enterprise'
  sql.append(f"UPDATE app_user SET tenant_id=(SELECT id FROM tenant WHERE kind={q(kind)}),status=CASE WHEN enabled THEN 'active' ELSE 'disabled' END WHERE id={q(user['id'])};")
 for station in inventory['stations']:sql.append(f"UPDATE station SET manager_id=NULL,tenant_id=(SELECT id FROM tenant WHERE kind='enterprise') WHERE id={q(station['id'])};")
 for key,kind in [('platformAdministrator','platform'),('enterpriseAdministrator','enterprise')]:
  sql.append(f"INSERT INTO tenant_administrator SELECT t.id,u.id FROM tenant t JOIN app_user u ON u.account={q(mapping[key])} WHERE t.kind={q(kind)};")
 sql.append("UPDATE station SET manager_id=(SELECT user_id FROM tenant_administrator a WHERE a.tenant_id=station.tenant_id);")
 for code,(name,scope,mode) in permissions.items():
  sql.append(f"INSERT INTO permission(code,name,resource_scope,operation_kind,implemented) VALUES({q(code)},{q(name)},{q(scope)},{q(mode)},true) ON CONFLICT(code) DO UPDATE SET name=excluded.name,resource_scope=excluded.resource_scope,operation_kind=excluded.operation_kind,implemented=true;")
 sql.append("UPDATE permission SET implemented=false WHERE code IN ("+','.join(map(q,RETIRED))+');')
 counter=0;roots={};enterprise_roots=[]
 def node(key,kind,side=None,parent=None,path=None,permission=None,client='web'):
  nonlocal counter
  counter+=1
  sql.append('INSERT INTO menu(parent_id,client,kind,name_key,route_path,permission_code,applicable_side,sort_order) VALUES('+','.join([f"(SELECT id FROM menu WHERE name_key={q(parent)} AND client={q(client)})" if parent else 'NULL',q(client),q(kind),q(key),q(path),q(permission),q(side),str(counter)])+');')
  return key
 business={'overview':['overview.read'],'assets':[p for p in permissions if p.startswith(('asset.','ems.'))],
  'operations':[p for p in permissions if p.startswith(('strategy.','tariff.','market.','revenue.'))],
  'maintenance':[p for p in permissions if p.startswith(('alarm.','inspection.'))],
  'workorders':[p for p in permissions if p.startswith(('workorder.','approval.'))],
  'analytics':[p for p in permissions if p.startswith(('telemetry.','report.'))]}
 for client in ('web','app'):
  for module,codes in business.items():
   root=node('nav.'+module,'directory','both',client=client);enterprise_roots.append((root,client))
   page=node('page.'+module,'page',parent=root,path=module,permission=codes[0],client=client)
   for code in codes[1:]:node('action.'+code,'action',parent=page,permission=code,client=client)
  root=node('nav.company.enterprise','directory','enterprise',client=client);enterprise_roots.append((root,client))
  for path,read,write in [('company.profile','company.profile.read','company.profile.manage'),('company.people','company.people.read','company.people.manage'),('company.roles','company.role.manage',None),('company.grants','company.grant.manage',None)]:
   page=node('page.'+path,'page',parent=root,path=path,permission=read,client=client)
   if write:node('action.'+write,'action',parent=page,permission=write,client=client)
  platform_root=node('nav.platform.company','directory','platform',client=client)
  for path,code in [('platform.companies','company.read'),('platform.people','company.people.read'),('platform.roles','company.role.manage'),('platform.audit','audit.read')]:
   if code in permissions:node('page.'+path,'page',parent=platform_root,path=path,permission=code,client=client)
  for code in ('company.manage','company.people.manage','company.grant.manage','tenant.data.read','tenant.data.write'):node('platform.action.'+code,'action',parent=platform_root,permission=code,client=client)
  config=node('nav.platform.permission','directory','platform',client=client)
  for path,code in [('platform.menus','menu.manage'),('platform.packages','package.manage'),('platform.templates','role.template.manage')]:node('page.'+path,'page',parent=config,path=path,permission=code,client=client)
  approval=node('nav.platform.approval','directory','platform',client=client)
  page=node('page.platform.approvals','page',parent=approval,path='platform.approvals',permission='company.application.read',client=client)
  node('action.company.application.review','action',parent=page,permission='company.application.review',client=client)
 business_codes={p for codes in business.values() for p in codes}
 enterprise_codes=business_codes|{p for p in permissions if p.startswith('company.') and not p.startswith('company.application.') and p not in ('company.read','company.manage')}
 templates={'Admin':enterprise_codes,'Engineer':{p for p in business_codes if not p.startswith(('revenue.','market.','report.')) and p!='asset.create'}|{'company.profile.read'},
  'Installer':{'overview.read','asset.read','asset.edit','telemetry.read','alarm.read','ems.read','ems.query','company.profile.read'},
  'Viewer':{p for p in business_codes if p.endswith('.read')}|{'company.profile.read'}}
 for name,codes in templates.items():
  sql.append(f'INSERT INTO role_template(name) VALUES({q(name)});')
  for client in ('web','app'):
   for code in sorted(codes):sql.append(f"INSERT INTO role_template_permission SELECT id,{q(code)},{q(client)} FROM role_template WHERE name={q(name)};")
 for type_code in ('installer','distributor','service_provider','operator'):
  name=type_code+' Standard'
  sql.append(f"INSERT INTO permission_package(name,remarks) VALUES({q(name)},'Initial enterprise package; platform-managed');")
  sql.append(f"INSERT INTO permission_package_company_type SELECT id,{q(type_code)} FROM permission_package WHERE name={q(name)};")
  for root,client in enterprise_roots:sql.append(f"INSERT INTO permission_package_menu SELECT p.id,m.id FROM permission_package p JOIN menu m ON m.name_key={q(root)} AND m.client={q(client)} WHERE p.name={q(name)};")
  sql.append(f"INSERT INTO permission_package_template SELECT p.id,r.id FROM permission_package p CROSS JOIN role_template r WHERE p.name={q(name)};")
 sql.append("INSERT INTO tenant_package SELECT t.id,p.id FROM tenant t CROSS JOIN permission_package p WHERE t.kind='enterprise' AND p.name='operator Standard';")
 platform_roles={'Platform Admin':set(permissions),'Approval Manager':{'company.application.read','company.application.review'},
                 'Support Agent':business_codes|{'company.read','company.manage','tenant.data.read','tenant.data.write'}}
 for name,codes in platform_roles.items():
  code='saas_'+name.lower().replace(' ','_')
  sql.append(f"INSERT INTO app_role(code,name,tenant_id) SELECT {q(code)},{q(name)},id FROM tenant WHERE kind='platform';")
  for client in ('web','app'):
   for permission in sorted(codes):sql.append(f"INSERT INTO role_permission SELECT id,{q(permission)},{q(client)} FROM app_role WHERE code={q(code)};")
 new_accounts=[('platform-admin@prototype.local','Platform Admin','platform','Platform Admin'),('platform-approval@prototype.local','Approval Manager','platform','Approval Manager'),('platform-support@prototype.local','Support Agent','platform','Support Agent'),('installer@prototype.local','Installer','enterprise','Installer'),('viewer@prototype.local','Viewer','enterprise','Viewer')]
 for email,name,kind,role in new_accounts:
  sql.append(f"INSERT INTO app_user(account,display_name,password_hash,tenant_id,status) SELECT {q(email)},{q(name)},{q(password_hash)},id,'active' FROM tenant WHERE kind={q(kind)};")
 # Retire old authorization associations after replacing ownership. Passwords are not touched.
 sql.extend(['DELETE FROM member_grant_station;','DELETE FROM member_grant;'])
 assignments=[('integrator@prototype.local','Admin','enterprise'),('operator@prototype.local','Engineer','enterprise')]+[(a,r,k) for a,n,k,r in new_accounts]
 accounts={u['account'].strip().lower() for u in inventory['users']}|{a for a,n,k,r in new_accounts}
 for email,role,kind in assignments:
  if email not in accounts:continue
  field,table,lookup=('template_id','role_template','name') if kind=='enterprise' else ('role_id','app_role','name')
  sql.append(f"INSERT INTO member_grant(user_id,{field},valid_from,granted_by) SELECT u.id,r.id,now(),a.user_id FROM app_user u JOIN tenant_administrator a ON a.tenant_id=u.tenant_id CROSS JOIN {table} r WHERE u.account={q(email)} AND r.{lookup}={q(role)}"+ (" AND r.tenant_id=u.tenant_id" if kind=='platform' else '')+';')
  if kind=='enterprise':sql.append(f"INSERT INTO member_grant_station SELECT g.id,s.id FROM member_grant g JOIN app_user u ON u.id=g.user_id JOIN station s ON s.tenant_id=u.tenant_id WHERE u.account={q(email)};")
 sql.extend(["ALTER TABLE app_user ALTER COLUMN tenant_id SET NOT NULL;","ALTER TABLE station ALTER COLUMN tenant_id SET NOT NULL;",
 "DO $$ BEGIN IF EXISTS(SELECT 1 FROM credentials_before b JOIN app_user u ON u.id=b.id WHERE b.password_hash IS DISTINCT FROM u.password_hash) THEN RAISE EXCEPTION 'password hashes changed'; END IF; END $$;",'COMMIT;'])
 return '\n'.join(sql)+'\n'

if __name__=='__main__':
 inventory,mapping=(json.loads(Path(p).read_text(encoding='utf-8-sig')) for p in sys.argv[1:3])
 content=build_seed(inventory,mapping,os.environ.pop('EMS_TENANT_SEED_PASSWORD_HASH'))
 Path(sys.argv[3]).write_text(content,encoding='utf-8')
 print('Private tenant backfill SQL generated; existing passwords preserved')
