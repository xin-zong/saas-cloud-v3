import importlib.util,unittest
from pathlib import Path
p=Path(__file__).resolve().parents[2]/'ems-cloud-api/scripts/import-reference-device-history.py'
s=importlib.util.spec_from_file_location('history',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class HistoryTests(unittest.TestCase):
 def rows(self):return [('设备类型','SN','所属父设备','所属子场站','时间','单体最高电压（V）','未核验（A）'),('电池','test','parent','station','2026/10/19 00:00:00','3.2','9')]
 def parse(self,rows):return m.parse_rows(rows,'test','parent','station','2026-10-19','+08:00','电池')
 def test_exact_only(self):
  rows=self.parse(self.rows());selected=m.select_records(rows,{('单体最高电压','V'):1})
  self.assertEqual(len(selected),1);self.assertEqual(selected[0][2].isoformat(),'2026-10-19T00:00:00+08:00')
  self.assertEqual(m.select_records(rows,{('单体最高电压','mV'):1}),[])
 def test_reviewed_aliases(self):
  self.assertIn(('SOC','%'),m.candidates('电池容量SOC','%'))
  self.assertIn(('详情 · 电池电压','V'),m.candidates('电池电压','V'))
  rows=[('当前功率','W',None,'-500'),('绝缘阻抗','Ω',None,'10000000')]
  ids={('当前功率','W'):1,('绝缘阻抗','Ω'):2}
  selected=m.select_records(rows,ids,m.ALIASES)
  self.assertEqual(selected[0][3],-0.5);self.assertEqual(selected[1][3],10)
 def test_registration_policy(self):
  self.assertFalse(m.registerable('设备类型',''))
  self.assertTrue(m.registerable('软件主版本号',''))
  self.assertTrue(m.registerable('额定容量','AH'))
  self.assertEqual(m.select_records([('软件主版本号','',None,'S.001')],{('软件主版本号',''):1})[0][-1],'text')
 def test_identity_guard(self):
  rows=self.rows();rows[1]=tuple(['电池','wrong']+list(rows[1][2:]))
  with self.assertRaisesRegex(ValueError,'identity'):self.parse(rows)
 def test_duplicate_guard(self):
  rows=self.rows();rows.append(rows[1])
  with self.assertRaisesRegex(ValueError,'Duplicate'):self.parse(rows)
 def test_formula_guard(self):
  rows=self.rows();rows[1]=tuple(list(rows[1][:-1])+['=1+2'])
  with self.assertRaisesRegex(ValueError,'Formula'):self.parse(rows)
 def test_day_guard(self):
  rows=self.rows();rows[1]=tuple(list(rows[1][:4])+['2026/10/18 00:00:00']+list(rows[1][5:]))
  with self.assertRaises(ValueError):self.parse(rows)
if __name__=='__main__':unittest.main()


