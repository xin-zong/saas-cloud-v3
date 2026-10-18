import importlib.util
from pathlib import Path
import unittest
P=Path(__file__).resolve().parents[1]/'import-monitor-captures.py'

class MonitorCaptureImportTest(unittest.TestCase):
 def load(self):
  spec=importlib.util.spec_from_file_location('capture_import',P);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
 def sample(self):return {'sourceHost':'ess-cloud-login.qudeox.com','capturedAt':'2026-10-18T00:10:00+08:00','rows':[{'stationSourceId':'example','sourceUpdatedAt':'2026-10-18T00:00:00+08:00','communication':'offline','chargeStatus':'unknown','metrics':{'pvDaily':'0','pvPower':None,'storageTotalCharged':'0.10'}}]}
 def test_zero_and_decimal_are_numeric_json_and_missing_stays_null(self):
  m=self.load();rows=m.normalize(self.sample());self.assertEqual(rows[0]['metricsJson'],'{"pvDaily":0,"pvPower":null,"storageTotalCharged":0.10}')
  self.assertEqual(rows[0]['fingerprint'],m.normalize(self.sample())[0]['fingerprint'])
 def test_arbitrary_fields_booleans_and_future_timestamps_are_rejected(self):
  m=self.load()
  for key,value in [('privateToken','secret'),('pvDaily',True),('pvDaily','NaN')]:
   d=self.sample();d['rows'][0]['metrics'][key]=value
   with self.assertRaises(m.CaptureError):m.normalize(d)
  d=self.sample();d['rows'][0]['sourceUpdatedAt']='2026-10-19T00:00:00+08:00'
  with self.assertRaises(m.CaptureError):m.normalize(d)

if __name__=='__main__':unittest.main()
