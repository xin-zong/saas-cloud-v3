import importlib.util
from pathlib import Path
import unittest

path=Path(__file__).parents[1]/'seed.py'
spec=importlib.util.spec_from_file_location('seed',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class SeedTest(unittest.TestCase):
 def test_existing_passwords_are_never_overwritten(self):
  sql=module.build_seed({'users':[{'id':14,'account':'superadmin@prototype.local'},{'id':2,'account':'owner@prototype.local'}],'stations':[{'id':4,'code':'PROTO-001'}]},
   {'users':{'superadmin@prototype.local':'platform','owner@prototype.local':'demo'},'stations':{'PROTO-001':'demo'},'platformAdministrator':'superadmin@prototype.local','enterpriseAdministrator':'owner@prototype.local'},'$2b$12$synthetic')
  self.assertNotRegex(sql,r'(?i)UPDATE app_user SET[^;]*password_hash')
  self.assertIn('password hashes changed',sql)
  self.assertIn('platform-approval@prototype.local',sql)
  self.assertIn('platform-support@prototype.local',sql)
  self.assertIn('installer@prototype.local',sql)
 def test_missing_ownership_mapping_stops_generation(self):
  with self.assertRaises(ValueError):module.build_seed({'users':[],'stations':[{'id':4,'code':'S'}]}, {'users':{},'stations':{}},'hash')
if __name__=='__main__':unittest.main()
