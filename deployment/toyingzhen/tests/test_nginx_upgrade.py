import hashlib,importlib.util,json,pathlib,tempfile,unittest
from unittest.mock import patch,Mock

P=pathlib.Path(__file__).parents[1]/'release.py'
spec=importlib.util.spec_from_file_location('nginx_upgrade_release',P)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class NginxUpgradeTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.root=pathlib.Path(self.temp.name).resolve();self.api=self.root/'api';self.nginx=self.root/'installed.conf'
  self.old=self.bundle('toyingzhen-20261020-current','old-reviewed-nginx')
  self.candidate=self.bundle('toyingzhen-20261020-candidate','new-reviewed-nginx')
  self.patches=[patch.object(m,'API',self.api),patch.object(m,'NGINX',self.nginx),patch.object(m,'current_target',return_value=str(self.old))]
  for p in self.patches:p.start();self.addCleanup(p.stop)
 def bundle(self,rid,nginx,branch='develop-toyingzhen'):
  folder=self.api/'releases'/rid;(folder/'web').mkdir(parents=True);(folder/'deploy').mkdir()
  (folder/'web/index.html').write_text('web');(folder/'ems-cloud-api.jar').write_bytes(b'jar')
  (folder/'deploy/nginx.conf').write_text(nginx)
  (folder/'release.json').write_text(json.dumps({'release':rid,'branch':branch,'apiBase':'/api','dataMode':'api','migration':68}))
  self.manifest(folder);return folder
 def manifest(self,folder):
  hashes={p.relative_to(folder).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in folder.rglob('*') if p.is_file() and p.name!='SHA256SUMS.json'}
  (folder/'SHA256SUMS.json').write_text(json.dumps(hashes))
 def check(self):
  helper=getattr(m,'assert_nginx_upgrade_compatible',None)
  if helper:return helper(self.candidate)
  # Baseline preflight rule before adding a reviewed-current upgrade path.
  if m.NGINX.is_symlink() or m.NGINX.read_text()!=(self.candidate/'deploy/nginx.conf').read_text():raise RuntimeError('Existing independent Nginx config differs')
 def test_installed_verified_current_template_is_accepted_for_upgrade(self):
  self.nginx.write_text('old-reviewed-nginx');self.check()
 def test_installed_candidate_template_is_accepted_without_current_lookup(self):
  self.nginx.write_text('new-reviewed-nginx')
  with patch.object(m,'current_target',side_effect=AssertionError('Candidate already matches')):self.check()
 def test_unknown_or_noncurrent_historical_template_is_rejected(self):
  self.bundle('toyingzhen-20261019-historical','historical-nginx')
  for text in ['unknown-external-nginx','historical-nginx']:
   self.nginx.write_text(text)
   with self.assertRaises((RuntimeError,ValueError)):self.check()
 def test_tampered_current_bundle_is_rejected_even_when_nginx_itself_matches(self):
  self.nginx.write_text('old-reviewed-nginx');(self.old/'ems-cloud-api.jar').write_bytes(b'tampered')
  with self.assertRaises((RuntimeError,ValueError)):self.check()
 def test_current_wrong_branch_or_release_identity_is_rejected(self):
  self.nginx.write_text('old-reviewed-nginx')
  original=json.loads((self.old/'release.json').read_text())
  for changed in [{'branch':'main'},{'release':'toyingzhen-20261020-other'}]:
   path=self.old/'release.json';meta=original|changed;path.write_text(json.dumps(meta));self.manifest(self.old)
   with self.assertRaises((RuntimeError,ValueError)):self.check()
 def test_installed_symlink_is_rejected_even_when_candidate_text_matches(self):
  fake=Mock();fake.is_symlink.return_value=True;fake.read_text.return_value='new-reviewed-nginx'
  with patch.object(m,'NGINX',fake):
   with self.assertRaises((RuntimeError,ValueError)):self.check()

if __name__=='__main__':unittest.main()
