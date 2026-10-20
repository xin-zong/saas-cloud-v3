import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('groups',Path(__file__).with_name('seed-station-business-groups.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BusinessGroupSeed(unittest.TestCase):
 def fixture(self):return dict(tenantId=2,datasetId='verified-test',version=1,source='reference-observed',evidenceRef='private-observation',groups=[dict(id='a',parentId=None,name='Observed group',type='group'),dict(id='b',parentId='a',name='Observed project',type='project')],assignments=[])
 def test_evidence_groups_do_not_invent_station_assignments(self):
  result=m.validate(self.fixture());self.assertEqual([],result['assignments']);self.assertEqual('project',result['groups'][1]['type'])
 def test_unknown_parent_cycle_and_duplicate_ids_are_rejected(self):
  for modify in [lambda d:d['groups'][0].update(parentId='missing'),lambda d:d['groups'][0].update(parentId='b'),lambda d:d['groups'].append(dict(d['groups'][0]))]:
   d=self.fixture();modify(d)
   with self.assertRaises(ValueError):m.validate(d)
 def test_unverified_source_and_missing_evidence_are_rejected(self):
  for changes in [dict(source='guessed'),dict(evidenceRef=''),dict(tenantId=True),dict(version=0)]:
   d=self.fixture();d.update(changes)
   with self.assertRaises(ValueError):m.validate(d)
 def test_assignments_require_known_group_and_explicit_station(self):
  d=self.fixture();d['assignments']=[dict(groupId='missing',stationId=16)]
  with self.assertRaises(ValueError):m.validate(d)
  d['assignments']=[dict(groupId='a',stationId=16)];self.assertEqual(16,m.validate(d)['assignments'][0]['stationId'])
if __name__=='__main__':unittest.main()
