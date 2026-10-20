import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('tree',Path(__file__).parents[1]/'import-reference-connections.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class TreeTests(unittest.TestCase):
 def doc(self):
  return {'sourceUrl':'https://ess-cloud-login.qudeox.com/monitor/plant/plantDetail/343/device','capturedAt':'2026-10-19T08:17:09Z','rows':[{'label':'采集器\nTEST-ROOT','depth':0,'cells':['采集器\nTEST-ROOT',' 在线','2026-10-19 15:58:23 UTC+08:00']},{'label':'电池包\nTEST-PACK','depth':1,'cells':['电池包\nTEST-PACK',' 离线','2026-10-19 15:58:23 UTC+08:00']}]}
 def test_parent_order_and_snapshot(self):
  rows=m.normalize(self.doc(),'343');self.assertEqual(rows[1]['parent'],'TEST-ROOT');self.assertEqual(rows[1]['order'],1);self.assertEqual(rows[1]['status'],'offline')
 def test_invalid_hierarchy(self):
  d=self.doc();d['rows'][1]['depth']=2
  with self.assertRaises(ValueError):m.normalize(d,'343')
 def test_duplicate_serial(self):
  d=self.doc();d['rows'][1]=d['rows'][0]
  with self.assertRaises(ValueError):m.normalize(d,'343')
 def test_source_mismatch(self):
  with self.assertRaises(ValueError):m.normalize(self.doc(),'999')
 def test_future_observation(self):
  d=self.doc();d['rows'][1]['cells'][2]='2027-01-01 00:00:00 UTC+08:00'
  with self.assertRaises(ValueError):m.normalize(d,'343')
if __name__=='__main__':unittest.main()
