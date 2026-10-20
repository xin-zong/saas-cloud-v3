import importlib.util,json,unittest,hashlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('history',Path(__file__).with_name('import-reference-station-history.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class HistoryTest(unittest.TestCase):
 def test_week(self):
  data=self.sample();data.update(period='week',sourceUrl='https://ess-cloud-login.qudeox.com/station-s/station/statistic/history/week/42',payload={'stationStatisticDayDtoList':[],'stationStatisticWeekDto':{}})
  self.assertEqual(m.validate(json.dumps(data).encode())[0]['period'],'week')
 def sample(self):return dict(identityVerified=True,timezoneVerified=True,stationId=21,sourceId='42',period='day',date='2026-01-01',timezone='Asia/Shanghai',capturedAt='2026-01-02T00:00:00Z',sourceUrl='https://ess-cloud-login.qudeox.com/station-s/station/statistic/history/day/42',payload={'stationStatisticPowerList':[{'dateTime':1767225600,'power':0,'label':'--'}],'stationStatisticDay':{}})
 def test_preserves_raw(self):
  raw=json.dumps(self.sample()).encode();data,digest=m.validate(raw);self.assertEqual(hashlib.sha256(raw).hexdigest(),digest);self.assertEqual(0,data['payload']['stationStatisticPowerList'][0]['power'])
 def test_invalid(self):
  for key,value in [('identityVerified',False),('date','2026-02-30'),('timezone','bad'),('sourceUrl','https://example.com'),('payload',{}),('capturedAt','2099-01-01T00:00:00Z')]:
   data=self.sample();data[key]=value
   with self.assertRaises(ValueError):m.validate(json.dumps(data).encode())
 def test_bounds(self):
  data=self.sample();data['payload']['stationStatisticPowerList'][0]['dateTime']=0
  with self.assertRaises(ValueError):m.validate(json.dumps(data).encode())
if __name__=='__main__':unittest.main()
