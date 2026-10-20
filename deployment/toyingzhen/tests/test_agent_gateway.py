import importlib.util,pathlib,re,unittest
from unittest.mock import patch

P=pathlib.Path(__file__).parents[1]
spec=importlib.util.spec_from_file_location('agent_release',P/'release.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class AgentGatewayTests(unittest.TestCase):
 def base(self):
  return dict(EMS_DATABASE_NAME='ems_cloud_saas_toyingzhen',EMS_DB_URL='jdbc:postgresql://127.0.0.1:5432/ems_cloud_saas_toyingzhen',EMS_DB_USERNAME='ems_toyingzhen_owner',EMS_DB_PASSWORD='private',EMS_CH_URL='http://127.0.0.1:18123',EMS_CH_DATABASE='ems_history',EMS_CH_USERNAME='readonly',EMS_CH_PASSWORD='private',EMS_MFA_ENCRYPTION_KEY='private',EMS_BIND_ADDRESS='127.0.0.1',EMS_PORT='18091',EMS_CORS_ORIGINS=m.PUBLIC,EMS_TENANT_PUBLIC_URL=m.PUBLIC,EMS_ALARM_ENGINE_ENABLED='false')
 def test_agent_absent_is_supported_and_complete_pair_is_supported(self):
  m.validate_env(self.base())
  m.validate_env(self.base()|{'EMS_AGENT_URL':'http://47.99.70.238:18080','EMS_AGENT_API_KEY':'test-private-key'})
 def test_agent_pair_is_required_without_accepting_unknown_keys_or_unsafe_values(self):
  pair={'EMS_AGENT_URL':'http://47.99.70.238:18080','EMS_AGENT_API_KEY':'test-private-key'}
  invalid=[{'EMS_AGENT_URL':pair['EMS_AGENT_URL']},{'EMS_AGENT_API_KEY':'test-private-key'}]
  invalid += [pair|{key:value} for key,value in [('EMS_AGENT_URL','http://127.0.0.1:18080'),('EMS_AGENT_URL',pair['EMS_AGENT_URL']+'/'),('EMS_AGENT_URL','https://47.99.70.238:18080'),('EMS_AGENT_API_KEY',''),('EMS_AGENT_TIMEOUT','190')]]
  invalid += [pair|{'EMS_AGENT_API_KEY':value} for value in [' leading','trailing ','embedded space','line\nfeed','line\rreturn','tab\tvalue','nul\x00value','quote"value',"quote'value",'slash\\value']]
  for changed in invalid:
   with self.subTest(keys=sorted(changed)):
    with self.assertRaises(ValueError):m.validate_env(self.base()|changed)
 def test_agent_pair_can_coexist_with_complete_smtp(self):
  smtp=dict(SPRING_MAIL_HOST='smtp.example.invalid',SPRING_MAIL_PORT='587',SPRING_MAIL_USERNAME='sender@example.invalid',SPRING_MAIL_PASSWORD='test-password',EMS_TENANT_MAIL_FROM='sender@example.invalid',SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH='true',SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY='true',SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE='true',SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_REQUIRED='true',SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE='false')
  env=self.base()|smtp|{'EMS_AGENT_URL':'http://47.99.70.238:18080','EMS_AGENT_API_KEY':'test-private-key'}
  self.assertEqual(m.validate_env(env),env)
 def test_preflight_requires_exact_frozen_migration_sequence(self):
  identity='ems_cloud_saas_toyingzhen|ems_toyingzhen_owner\n'
  sequence=','.join(str(i) for i in range(1,70))
  with patch.object(m,'run',return_value=identity+sequence),patch.object(m,'clickhouse_query',side_effect=['GRANT SELECT ON telemetry.* TO reader','1']):
   m.database_checks(self.base(),69)
  for versions in [','.join(str(i) for i in range(1,69)),sequence+',70',sequence.replace('33,','')]:
   with self.subTest(sequence=versions),patch.object(m,'run',return_value=identity+versions),patch.object(m,'clickhouse_query',side_effect=AssertionError('Must stop before ClickHouse')):
    with self.assertRaises(RuntimeError):m.database_checks(self.base(),69)
 def test_dedicated_nginx_route_rewrites_path_and_preserves_identity_and_streaming(self):
  text=(P/'nginx.conf').read_text()
  route=re.search(r'location\s+/ems-agent-api/\s*\{([^{}]*)\}',text)
  self.assertIsNotNone(route,'Agent route must reach Java instead of SPA fallback')
  body=route[1]
  directives=[line.strip() for line in body.splitlines() if line.strip()]
  for value in ['proxy_pass http://127.0.0.1:18091/api/agent/;','proxy_http_version 1.1;','proxy_set_header Authorization $http_authorization;','proxy_set_header X-Forwarded-For $remote_addr;','proxy_buffering off;','proxy_request_buffering off;','proxy_cache off;','client_max_body_size 21m;']:
   self.assertIn(value,directives)
  for timeout in ['proxy_read_timeout','proxy_send_timeout']:
   self.assertGreaterEqual(int(re.search(timeout+r'\s+(\d+)s;',body)[1]),190)
  prefix='/ems-agent-api/';upstream='http://127.0.0.1:18091/api/agent/'
  for tail in ['v1/health','v1/chat/stream','v1/files/upload']:
   self.assertEqual(upstream+('/ems-agent-api/'+tail)[len(prefix):],'http://127.0.0.1:18091/api/agent/'+tail)
  self.assertRegex(text,r'location /api/\s*\{\s*proxy_pass http://127\.0\.0\.1:18091;')

if __name__=='__main__':unittest.main()
