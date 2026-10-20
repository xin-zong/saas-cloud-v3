import importlib.util, unittest, tempfile, json
from pathlib import Path
from decimal import Decimal
spec=importlib.util.spec_from_file_location('samples',Path(__file__).with_name('import-reference-device-samples.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class StationDetail(unittest.TestCase):
 def test_station_url_and_pressure(self):
  doc={'url':'https://ess-cloud-login.qudeox.com/monitor/plant/plantDetail/312/device?type=53&childSystemId=312','capturedAt':'2026-10-18T09:00:00Z','text':'TEST：SN\n2026-10-18 10:00:00 UTC+02:00','cards':[['进水压力','1.53Bar']],'summary':[],'radio':[],'packs':[]}
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'detail.json';p.write_text(json.dumps(doc),'utf8')
   rows=m.read_detail(p)
   self.assertEqual(rows[0][2],'Bar');self.assertEqual(rows[0][5],Decimal('1.53'))
   for url in ['https://evil.test/monitor/plant/plantDetail/312/device?type=53&childSystemId=312','https://ess-cloud-login.qudeox.com/monitor/plant/plantDetail/312/settings','https://ess-cloud-login.qudeox.com/monitor/plant/plantDetail/312/device?type=53&childSystemId=312&save=1']:
    doc['url']=url;p.write_text(json.dumps(doc),'utf8')
    with self.assertRaises(ValueError):m.read_detail(p)
class Mapping(unittest.TestCase):
 def test_source_station_must_match_import_mapping(self):
  row=('SN','field','',None,None,None,'','text','https://ess-cloud-login.qudeox.com/monitor/plant/plantDetail/312/device?type=53&childSystemId=312','hash')
  m.validate_station_mapping([row],{'SN':'312'})
  with self.assertRaises(ValueError):m.validate_station_mapping([row],{'SN':'313'})
  with self.assertRaises(ValueError):m.validate_station_mapping([row],{})
  child=row[:8]+(row[8].replace('childSystemId=312','childSystemId=313'),)+row[9:]
  with self.assertRaises(ValueError):m.validate_station_mapping([child],{'SN':'312'})
  global_row=row[:8]+('https://ess-cloud-login.qudeox.com/monitor/device/list',)+row[9:]
  m.validate_station_mapping([global_row],{'SN':'312'})
class Cursor:
 def __init__(self, results):self.results=iter(results);self.calls=[]
 def execute(self, sql, params=None):self.calls.append((sql,params))
 def fetchone(self):return next(self.results)
 def fetchall(self):return []
class Bindings(unittest.TestCase):
 def test_complete_locked_batch_skips_repeated_queries(self):
  class Complete(Cursor):
   def fetchall(self):return [(12,),(13,)]
  c=Complete([]);m.ensure_stored_bindings(c,[12,13,12])
  self.assertEqual(len(c.calls),1)
  self.assertIn('FOR UPDATE',c.calls[0][0])
  self.assertIn('k.name=p.name',c.calls[0][0])
  self.assertIn('b.station_id=d.station_id',c.calls[0][0])
 def test_missing_pressure(self):self.assertEqual(m.parse_value('--Bar','Bar'),(None,'missing'))
 def test_new_binding_null_semantic(self):
  c=Cursor([(8,'压力','Bar',16,m.HOST),None,None,(90,),None])
  m.ensure_stored_bindings(c,[12,12])
  inserts=[(s,p) for s,p in c.calls if s.startswith('INSERT')]
  self.assertEqual(len(inserts),3)
  self.assertEqual(inserts[-1][1],(90,12,16))
  self.assertIn('NULL',inserts[-1][0])
 def test_existing_binding_preserved(self):
  c=Cursor([(8,'压力','Bar',16,m.HOST),('压力','Bar'),(90,'stored_device_12'),(90,), (90,16)])
  m.ensure_stored_bindings(c,[12])
  self.assertFalse(any(s.startswith(('INSERT','UPDATE')) for s,p in c.calls))
 def test_collisions_fail(self):
  scenarios=[[(8,'压力','Bar',16,m.HOST),('OTHER','Bar')],[(8,'压力','Bar',16,m.HOST),('压力','Bar'),(90,'OTHER')],[(8,'压力','Bar',16,m.HOST),('压力','Bar'),(90,'stored_device_12'),(90,),(90,99)],[(8,'压力','Bar',16,'other.host')]]
  for results in scenarios:
   with self.assertRaises(ValueError):m.ensure_stored_bindings(Cursor(results),[12])
if __name__=='__main__':unittest.main()
