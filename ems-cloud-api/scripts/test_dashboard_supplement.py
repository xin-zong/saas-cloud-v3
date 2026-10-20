import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('supplement',Path(__file__).with_name('seed-dashboard-supplement.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class DashboardSupplement(unittest.TestCase):
 def test_same_day_energy_and_flow(self):
  rows=[dict(dateTime=1,generationPower=6000,usePower=4000,wirePower=-2000,batteryPower=0,batterySoc=50),dict(dateTime=301,generationPower=0,usePower=3000,wirePower=6000,batteryPower=3000,batterySoc=51)]
  s=m.energy_summary(rows)
  self.assertEqual(500,s['generationValue']);self.assertEqual(500,s['buyValue']);self.assertAlmostEqual(1000/6,s['gridValue'],places=5)
  self.assertAlmostEqual(500-1000/6,s['selfUseValue'],places=5);self.assertAlmostEqual(7000/12-500,s['selfSupplyValue'],places=5)
  self.assertEqual(m.flow(rows)['gridKw'],6);self.assertEqual(m.flow(rows)['batterySoc'],51)
 def test_missing_is_null_not_zero(self):
  s=m.energy_summary([dict(dateTime=1,batteryPower=1000)])
  self.assertIsNone(s['generationValue']);self.assertIsNone(s['selfUseValue']);self.assertIsNone(s['gridValue'])
 def test_preserve_legacy_and_aggregate_profiles(self):
  day=dict(stationStatisticPowerList=[dict(dateTime=1792317600,batteryPower=0,wirePower=100,usePower=200,mpptGenerationPower=0)],stationStatisticDay={})
  week=dict(stationStatisticDayDtoList=[dict(chargeValue=3)],stationStatisticWeekDto=dict(chargeValue=3))
  base=[('day','2026-10-18',day,'storage-three-charts'),('week','2026-10-17',week,'storage-three-charts')]
  records=m.build_records(dict(id=21,name='Station',timezone='Asia/Shanghai',rated=100,capacity=261,solar=None),base)
  actual=next(p for period,key,p in records if period=='day')
  self.assertEqual(day['stationStatisticDay'],actual['stationStatisticDay']);self.assertEqual(day['stationStatisticPowerList'],actual['stationStatisticPowerList'])
  self.assertEqual(week,next(p for period,key,p in records if period=='week'))
  self.assertIsNone(actual['dashboardSupplement']['pr']['week']['value'])
  self.assertIsNone(actual['dashboardSupplement']['generationPlan']['year']['plannedKwh'])
  self.assertEqual('Station',actual['dashboardSupplement']['weather']['location'])



class ProfileConsistency(unittest.TestCase):
 def test_profile_day_month_year_total_share_rows(self):
  station=dict(id=16,name='Mock station',timezone='Europe/Madrid',rated=100,capacity=215,solar=120)
  day=m.date(2026,10,17);power=m.mock_day(day,station,True)
  daily=dict(acceptDay='20261017',day=17,month=10,year=2026,chargeValue=-1,generationValue=-1)
  base=[('day','2026-10-17',dict(stationStatisticPowerList=power,stationStatisticDay=daily),'profile'),('month','2026-10',dict(stationStatisticDayDtoList=[daily],stationStatisticMonthDto={}), 'profile'),('year','2026',dict(stationStatisticMonthDtoList=[],stationStatisticYearDto={}), 'profile')]
  records={(p,k):v for p,k,v in m.build_records(station,base)}
  expected=m.energy_summary(power)
  for key in m.ENERGY:
   for period,datekey in [('day','2026-10-17'),('month','2026-10'),('year','2026'),('total','2026:2026')]:
    self.assertEqual(expected[key],records[period,datekey][m.SUMMARY_KEYS[period]][key])
  self.assertEqual(power,records['day','2026-10-17']['stationStatisticPowerList'])
  self.assertEqual(7,len(records['day','2026-10-17']['dashboardSupplement']['weather']['forecast']))
 def test_flow_solar_falls_back_to_mppt_but_not_pcs(self):
  f=m.flow([dict(wirePower=-1000,batteryPower=-500,mpptGenerationPower=800,batterySoc=20)])
  self.assertEqual(.8,f['solarKw']);self.assertIsNone(f['pcsKw']);self.assertEqual(-.5,f['batteryKw'])




class IdentityGuards(unittest.TestCase):
 def test_wrong_branch_stops_before_connection(self):
  from unittest.mock import patch,Mock
  connection=Mock()
  with patch.object(m.subprocess,'check_output',return_value='main\n'):
   with self.assertRaisesRegex(RuntimeError,'Branch guard'):m.run(connection,True)
  connection.cursor.assert_not_called()
 def test_wrong_database_or_role_stops_before_seed(self):
  from unittest.mock import patch,MagicMock
  connection=MagicMock();cursor=connection.cursor.return_value.__enter__.return_value
  cursor.fetchone.return_value=('wrong_database','wrong_role')
  with patch.object(m.subprocess,'check_output',return_value='develop-toyingzhen\n'):
   with self.assertRaisesRegex(RuntimeError,'Database identity'):m.run(connection,True)
  self.assertEqual(1,cursor.execute.call_count)


class MonthlyRange(unittest.TestCase):
 def test_prior_day_month_card_uses_actual_aggregate_cutoff(self):
  station=dict(id=16,name='Mock station',timezone='Europe/Madrid',rated=100,capacity=215,solar=120)
  power={};daily=[];base=[]
  for key,hour in [('2026-10-16',23),('2026-10-17',12)]:
   dt=m.datetime.fromisoformat(key+f'T{hour:02}:00:00').replace(tzinfo=m.ZoneInfo(station['timezone']))
   rows=[dict(dateTime=int(dt.timestamp()),batteryPower=0,wirePower=1000,usePower=1000,generationPower=0)]
   summary=dict(acceptDay=key.replace('-',''),day=int(key[-2:]),month=10,year=2026)
   power[key]=rows;daily.append(summary);base.append(('day',key,dict(stationStatisticPowerList=rows,stationStatisticDay=summary),'profile'))
  base.append(('month','2026-10',dict(stationStatisticDayDtoList=daily,stationStatisticMonthDto={}),'profile'))
  records={(p,k):v for p,k,v in m.build_records(station,base)}
  early=records['day','2026-10-16']['dashboardSupplement'];late=records['day','2026-10-17']['dashboardSupplement']
  self.assertEqual('2026-10-16',early['grid']['month']['from'])
  self.assertEqual('2026-10-17',early['grid']['month']['to'])
  self.assertEqual('2026-10-17T12:00:00+02:00',early['grid']['month']['updatedAt'])
  self.assertEqual(late['grid']['month'],early['grid']['month'])
  self.assertEqual('2026-10-16T23:00:00+02:00',early['updatedAt'])
  self.assertAlmostEqual(sum(m.energy_summary(rows)['buyValue'] for rows in power.values())/1000,early['grid']['month']['buyKwh'])
 def test_missing_month_has_no_invented_range_or_updated_time(self):
  station=dict(id=16,name='Mock station',timezone='Europe/Madrid',rated=100,capacity=215,solar=120)
  rows=m.mock_day(m.date(2026,10,17),station,True)
  records=m.build_records(station,[('day','2026-10-17',dict(stationStatisticPowerList=rows,stationStatisticDay={}),'profile')])
  monthly=records[0][2]['dashboardSupplement']['grid']['month']
  self.assertIsNone(monthly['from']);self.assertIsNone(monthly['to']);self.assertIsNone(monthly['updatedAt'])
if __name__=='__main__':unittest.main()
