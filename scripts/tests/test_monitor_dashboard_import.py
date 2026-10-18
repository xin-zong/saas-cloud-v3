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
if __name__=='__main__':unittest.main()
