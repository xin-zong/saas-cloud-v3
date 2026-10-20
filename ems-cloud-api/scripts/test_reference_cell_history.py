import importlib.util,unittest
from pathlib import Path
from datetime import datetime,timezone
spec=importlib.util.spec_from_file_location('history',Path(__file__).with_name('import-reference-cell-history.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class History(unittest.TestCase):
 def rows(self,label='单体电压1（V）'):
  return [('设备类型','SN','所属父设备','所属子场站','时间',label),('电池','PACK','LOGGER','SITE','2026/10/18 00:00:33','3.29')]
 def parse(self,rows,offset='+02:00'):
  return m.parse_rows(rows,'PACK','LOGGER','SITE','2026-10-18',offset)
 def test_exact_utc_and_cell(self):
  rows=self.parse(self.rows());self.assertEqual(rows[0][0],'电池包 PACK · 电压 #1');self.assertEqual(rows[0][2].astimezone(timezone.utc).isoformat(),'2026-10-17T22:00:33+00:00')
 def test_temperature(self):self.assertEqual(self.parse(self.rows('单体温度7（℃）'))[0][:2],('电池包 PACK · 温度 #7','℃'))
 def test_reject_ambiguous(self):
  for rows in [self.rows('平均值'),self.rows()+self.rows()[1:],self.rows()[:1]+[('电池','OTHER','LOGGER','SITE','2026/10/18 00:00:33','3.29')]]:
   with self.assertRaises(ValueError):self.parse(rows)
  with self.assertRaises(ValueError):self.parse(self.rows(),'')
if __name__=='__main__':unittest.main()
