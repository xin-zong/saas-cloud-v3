import importlib.util, pathlib, tempfile, unittest, hashlib, json
from unittest.mock import patch
P=pathlib.Path(__file__).parents[1]/'release.py'
spec=importlib.util.spec_from_file_location('release',P)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class GuardTests(unittest.TestCase):
 def test_proxy_rate_limit_identity_trust_is_loopback_only_and_client_headers_are_overwritten(self):
  root=P.parents[2];nginx=(P.parent/'nginx.conf').read_text();config=(root/'ems-cloud-api/src/main/resources/application.yml').read_text()
  self.assertIn('proxy_set_header X-Forwarded-For $remote_addr;',nginx)
  self.assertNotIn('$proxy_add_x_forwarded_for',nginx)
  self.assertIn('forward-headers-strategy: native',config)
  self.assertIn("internal-proxies: '127\\.0\\.0\\.1|::1|0:0:0:0:0:0:0:1'",config)
 def test_optional_smtp_requires_complete_authenticated_tls_and_preserves_isolation(self):
  env={'EMS_DATABASE_NAME':'ems_cloud_saas_toyingzhen','EMS_DB_URL':'jdbc:postgresql://127.0.0.1:5432/ems_cloud_saas_toyingzhen','EMS_DB_USERNAME':'ems_toyingzhen_owner','EMS_DB_PASSWORD':'private','EMS_CH_URL':'http://127.0.0.1:18123','EMS_CH_DATABASE':'ems_history','EMS_CH_USERNAME':'readonly','EMS_CH_PASSWORD':'private','EMS_MFA_ENCRYPTION_KEY':'private','EMS_BIND_ADDRESS':'127.0.0.1','EMS_PORT':'18091','EMS_CORS_ORIGINS':'http://120.27.23.229:18086','EMS_TENANT_PUBLIC_URL':'http://120.27.23.229:18086','EMS_ALARM_ENGINE_ENABLED':'false'}
  smtp={'SPRING_MAIL_HOST':'smtp.example.invalid','SPRING_MAIL_PORT':'587','SPRING_MAIL_USERNAME':'sender@example.invalid','SPRING_MAIL_PASSWORD':'private-app-password','EMS_TENANT_MAIL_FROM':'sender@example.invalid','SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH':'true','SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY':'true','SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE':'true','SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_REQUIRED':'true','SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE':'false'}
  m.validate_env(dict(env,**smtp))
  m.validate_env(dict(env,**smtp)|{'SPRING_MAIL_PORT':'465','SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE':'false','SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_REQUIRED':'false','SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE':'true'})
  for changed in [{'SPRING_MAIL_PASSWORD':''},{'SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH':'false'},{'SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_REQUIRED':'false'},{'SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY':'false'},{'SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_TRUST':'*'},{'SPRING_MAIL_HOST':'smtp://user:secret@example.invalid'},{'EMS_TENANT_MAIL_FROM':'not-an-email'},{'EMS_DB_USERNAME':'other'},{'EMS_TENANT_PUBLIC_URL':'https://other.example.invalid'},{'SPRING_MAIL_PORT':'0'}]:
   with self.subTest(keys=list(changed)):
    with self.assertRaises(ValueError):m.validate_env(dict(env,**smtp)|changed)
 def test_ids_cannot_escape_release_root(self):
  for x in ['../ems-cloud-v3','/opt/ems-cloud-v3','a;reboot','', 'UPPER']:
   with self.assertRaises(ValueError):m.release_id(x)
  self.assertEqual(m.release_id('toyingzhen-20261019-a1'),'toyingzhen-20261019-a1')
 def test_environment_strict_database_and_partial_smtp_rejected(self):
  env={'EMS_DATABASE_NAME':'ems_cloud_saas_toyingzhen','EMS_DB_URL':'jdbc:postgresql://127.0.0.1:5432/ems_cloud_saas_toyingzhen','EMS_DB_USERNAME':'ems_toyingzhen_owner','EMS_DB_PASSWORD':'private','EMS_CH_URL':'http://127.0.0.1:18123','EMS_CH_DATABASE':'ems_history','EMS_CH_USERNAME':'readonly','EMS_CH_PASSWORD':'private','EMS_MFA_ENCRYPTION_KEY':'private','EMS_BIND_ADDRESS':'127.0.0.1','EMS_PORT':'18091','EMS_CORS_ORIGINS':'http://120.27.23.229:18086','EMS_TENANT_PUBLIC_URL':'http://120.27.23.229:18086','EMS_ALARM_ENGINE_ENABLED':'false'}
  m.validate_env(env)
  for key,value in [('EMS_DB_URL','jdbc:postgresql://127.0.0.1:5432/ems_cloud_saas_v3'),('EMS_PORT','18090'),('SPRING_MAIL_HOST','mail.example'),('EMS_ALARM_ENGINE_ENABLED','true'),('EMS_CH_USERNAME','default')]:
   with self.subTest(key=key):
    with self.assertRaises(ValueError):m.validate_env(dict(env,**{key:value}))
 def test_manifest_rejects_tamper_extra_and_escape(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);(p/'web').mkdir();(p/'web/index.html').write_text('ok');(p/'ems-cloud-api.jar').write_bytes(b'jar');(p/'release.json').write_text('{}')
   hashes={x.relative_to(p).as_posix():hashlib.sha256(x.read_bytes()).hexdigest() for x in p.rglob('*') if x.is_file()};(p/'SHA256SUMS.json').write_text(json.dumps(hashes));m.verify_bundle(p)
   (p/'web/index.html').write_text('tampered')
   with self.assertRaises(ValueError):m.verify_bundle(p)
   (p/'web/index.html').write_text('ok');(p/'extra').write_text('extra')
   with self.assertRaises(ValueError):m.verify_bundle(p)
   hashes['../outside']='a'*64;(p/'SHA256SUMS.json').write_text(json.dumps(hashes))
   with self.assertRaises(ValueError):m.verify_bundle(p)
 def test_readonly_grants_allow_select_not_roles_or_writes(self):
  self.assertTrue(m.readonly_grants(['GRANT SELECT ON telemetry.* TO reader']))
  for rows in [[],['GRANT ALL ON *.* TO reader'],['GRANT SELECT, INSERT ON telemetry.* TO reader'],['GRANT SELECT ON telemetry.* TO reader WITH GRANT OPTION'],['GRANT admin_role TO reader']]:
   self.assertFalse(m.readonly_grants(rows))
 def test_production_change_aborts(self):
  m.assert_baseline({'pid':1},{'pid':1})
  with self.assertRaises(RuntimeError):m.assert_baseline({'pid':1},{'pid':2})
 def test_real_stage_copies_verified_bundle_without_changing_current_or_services(self):
  with tempfile.TemporaryDirectory() as d:
   root=pathlib.Path(d);source=root/'upload';source.mkdir();(source/'web').mkdir();(source/'web/index.html').write_text('frontend');(source/'ems-cloud-api.jar').write_bytes(b'jar')
   rid='toyingzhen-20261019-test';(source/'release.json').write_text(json.dumps({'release':rid}))
   hashes={p.relative_to(source).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in source.rglob('*') if p.is_file()};(source/'SHA256SUMS.json').write_text(json.dumps(hashes))
   api=root/'api';web=root/'web'
   with patch.object(m,'API',api),patch.object(m,'WEB',web),patch.object(m,'check_prod',return_value={'pid':7}),patch.object(m,'baseline',return_value={'pid':7}),patch.object(m,'run',side_effect=AssertionError('No commands permitted during stage')):
    m.stage(rid,source)
    self.assertEqual((web/'releases'/rid/'index.html').read_text(),'frontend');m.verify_bundle(api/'releases'/rid)
    self.assertFalse((api/'current').exists());self.assertFalse((web/'current').exists())
    with self.assertRaises(ValueError):m.stage(rid,source)
 def test_first_deployment_restore_only_disables_dedicated_unit(self):
  with tempfile.TemporaryDirectory() as d:
   p=pathlib.Path(d);unit=p/'api.service';nginx=p/'nginx.conf';unit.write_text('new');nginx.write_text('new')
   with patch.object(m,'UNITFILE',unit),patch.object(m,'NGINX',nginx),patch.object(m,'symlink') as links,patch.object(m,'run',return_value='') as run:
    m.restore({'api':None,'web':None,'unit':None,'nginx':None})
    self.assertFalse(unit.exists());self.assertFalse(nginx.exists())
    self.assertEqual(links.call_count,2)
    self.assertIn(unittest.mock.call(['systemctl','disable','--now','ems-cloud-toyingzhen-api.service']),run.call_args_list)
    self.assertFalse(any('ems-cloud-v3' in str(c) for c in run.call_args_list))
 def test_nginx_candidate_uses_private_regular_file_and_cleans_after_success(self):
  with tempfile.TemporaryDirectory() as d:
   directory=pathlib.Path(d);seen=[];content='events {}\nhttp {}\n'
   def check(args,**kwargs):
    self.assertEqual(args[:3],['nginx','-t','-c']);path=pathlib.Path(args[3]);seen.append(path)
    self.assertEqual(path.parent,directory);self.assertTrue(path.is_file());self.assertFalse(path.is_symlink());self.assertEqual(path.read_text(),content)
    if __import__('os').name!='nt':self.assertEqual(path.stat().st_mode&0o777,0o600)
    return ''
   with patch.object(m,'STATE',directory),patch.object(m,'run',side_effect=check):m.check_nginx_candidate(content)
   self.assertEqual(len(seen),1);self.assertFalse(seen[0].exists());self.assertEqual(list(directory.iterdir()),[])
 def test_nginx_candidate_cleans_when_nginx_rejects(self):
  with tempfile.TemporaryDirectory() as d:
   directory=pathlib.Path(d)
   with patch.object(m,'STATE',directory),patch.object(m,'run',side_effect=RuntimeError('nginx rejected candidate')):
    with self.assertRaises(RuntimeError):m.check_nginx_candidate('invalid;')
   self.assertEqual(list(directory.iterdir()),[])
 def test_deploy_paths_separate(self):
  self.assertEqual(m.API.as_posix(),'/opt/ems-cloud-toyingzhen')
  self.assertEqual(m.WEB.as_posix(),'/var/www/ems-cloud-toyingzhen')
  self.assertEqual(m.UNIT,'ems-cloud-toyingzhen-api.service')
if __name__=='__main__':unittest.main()
