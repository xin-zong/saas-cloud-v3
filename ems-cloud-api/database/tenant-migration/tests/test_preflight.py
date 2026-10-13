import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).parents[1] / 'preflight.py'
spec = importlib.util.spec_from_file_location('preflight', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PreflightTest(unittest.TestCase):
    def setUp(self):
        self.inventory = {'users': [{'id': 1, 'account': 'admin@test.invalid'}, {'id': 2, 'account': 'staff@test.invalid'}],
                          'stations': [{'id': 4, 'code': 'ST-1'}]}
        self.mapping = {'platformAdministrator': 'admin@test.invalid', 'enterpriseAdministrator': 'staff@test.invalid',
                        'users': {'admin@test.invalid': 'platform', 'staff@test.invalid': 'demo'}, 'stations': {'ST-1': 'demo'}}
    def test_complete_mapping_has_no_errors(self):
        self.assertEqual(module.validate(self.inventory, self.mapping), [])
    def test_missing_station_fails(self):
        self.mapping['stations'].clear()
        self.assertIn('unmapped station: ST-1', module.validate(self.inventory, self.mapping))
    def test_duplicate_normalized_email_fails(self):
        self.inventory['users'].append({'id': 3, 'account': ' Staff@test.invalid '})
        self.assertIn('duplicate normalized email: staff@test.invalid', module.validate(self.inventory, self.mapping))
    def test_platform_cannot_own_station(self):
        self.mapping['stations']['ST-1'] = 'platform'
        self.assertIn('station requires enterprise tenant: ST-1', module.validate(self.inventory, self.mapping))
    def test_administrator_cannot_belong_to_other_tenant(self):
        self.mapping['enterpriseAdministrator'] = 'admin@test.invalid'
        self.assertIn('enterprise administrator must belong to demo tenant', module.validate(self.inventory, self.mapping))

if __name__ == '__main__': unittest.main()
