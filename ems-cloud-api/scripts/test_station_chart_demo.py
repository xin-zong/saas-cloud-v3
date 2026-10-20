import unittest,importlib.util
from pathlib import Path
from datetime import date
spec=importlib.util.spec_from_file_location('seed',Path(__file__).with_name('seed-station-chart-demo.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class StationCharts(unittest.TestCase):
 def test_profile_scales_and_periods(self):
  records=m.profile_dataset(date(2026,10,17),'Europe/Madrid',.1,.1,.1,True,19)
  self.assertEqual({'day','week','month','year'},{r[0] for r in records})
  day=next(p for t,k,p in records if t=='day' and k=='2026-10-17')
  self.assertLessEqual(max(abs(r['batteryPower']) for r in day['stationStatisticPowerList']),100)
  self.assertTrue(all(0<=r['batterySoc']<=100 for r in day['stationStatisticPowerList']))
  month=next(p for t,k,p in records if t=='month' and k=='2026-10');self.assertEqual(17,len(month['stationStatisticDayDtoList']))
  self.assertAlmostEqual(month['stationStatisticMonthDto']['chargeValue'],sum(r['chargeValue'] for r in month['stationStatisticDayDtoList']))
 def test_storage_has_no_solar_series(self):
  records=m.profile_dataset(date(2026,10,15),'Asia/Shanghai',100,261,None,False,20)
  self.assertTrue(all(r['generationPower'] is None and r['mpptGenerationPower'] is None for r in records[0][2]['stationStatisticPowerList']))
if __name__=='__main__':unittest.main()
