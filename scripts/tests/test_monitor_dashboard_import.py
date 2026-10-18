import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('dashboard_import',Path(__file__).parents[1]/'import-monitor-dashboard.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class DashboardImportTest(unittest.TestCase):
 def document(self):
  return dict(capturedAt='2026-10-18T04:00:00Z',sourceUpdatedAt='2026-10-18T03:00:00Z',sourceIds=['a','b'],summary=dict(total=2,PV=0,BESS=1,Hybrid=1,pvCapacity=10,storagePower=20,storageCapacity=40,connecting=0,partial=0,alarmSites=0,offline=1),totals=dict(pvTotal='149830',storageTotalCharged='132320',storageTotalDischarged='217540',storageEfficiency=100),cards={})
 def test_reported_efficiency_is_preserved_independently_of_station_counters(self):
  value=module.normalize(self.document())
  self.assertEqual(value['payload']['summary']['totals']['storageEfficiency']['value'],100)
  self.assertIsNone(value['payload']['summary']['totals']['storageEfficiency']['covered'])
  self.assertEqual(value['sourceIds'],['a','b'])
  self.assertEqual(value['fingerprint'],module.normalize(self.document())['fingerprint'])
 def test_unknown_rank_station_or_nonfinite_values_are_rejected(self):
  for change in ['rank','number','count','duplicate']:
   document=self.document()
   if change=='rank':document['cards']={'pvPeak7':{'verified':True,'value':None,'ranking':[{'sourceId':'foreign','value':1}]}}
   if change=='number':document['totals']['pvTotal']='NaN'
   if change=='count':document['summary']['total']=3
   if change=='duplicate':document['sourceIds']=['a','a']
   with self.assertRaises(module.ImportError):module.normalize(document)
 def test_observed_curve_keeps_null_gaps_zero_and_reported_values(self):
  document=self.document()
  document['cards']={'storageEfficiency7':dict(verified=True,value=100,ranking=[],trend=dict(start='2026-10-11',end='2026-10-17',granularity='day',observedAt='2026-10-18T03:50:00Z',method='ui-tooltip',series=['metric','chargeEnergy','dischargeEnergy'],points=[dict(date='2026-10-11',values=dict(metric=100,chargeEnergy=0,dischargeEnergy=None)),dict(date='2026-10-12',values=dict(metric=None,chargeEnergy=None,dischargeEnergy=None))]))}
  curve=module.normalize(document)['payload']['cards']['storageEfficiency7']['trend']
  self.assertEqual(curve['points'][0]['values']['chargeEnergy'],0)
  self.assertIsNone(curve['points'][0]['values']['dischargeEnergy'])
  for change in ['duplicate','outside','future','unit','nonfinite']:
   import copy
   invalid=copy.deepcopy(document);trend=invalid['cards']['storageEfficiency7']['trend']
   if change=='duplicate':trend['points'].append(trend['points'][0])
   if change=='outside':trend['points'][0]['date']='2026-09-30'
   if change=='future':trend['observedAt']='2099-01-01T00:00:00Z'
   if change=='unit':trend['series']=['arbitrary']
   if change=='nonfinite':trend['points'][0]['values']['metric']='NaN'
   with self.assertRaises(module.ImportError):module.normalize(invalid)
if __name__=='__main__':unittest.main()
