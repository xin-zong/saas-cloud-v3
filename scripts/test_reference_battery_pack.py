import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('pack',Path(__file__).with_name('import-reference-battery-pack.py'));pack=importlib.util.module_from_spec(spec);spec.loader.exec_module(pack)
class PackTest(unittest.TestCase):
 def text(self):return '''  - text: 电池包：PACK
  - generic: 2026-10-19 16:17:56 UTC+08:00
  - generic: 基础信息
  - generic: 连接设备SN
  - generic: PACK
  - generic: 电芯数量
  - generic: "48"
  - generic: 父设备Sensor
  - generic: "1"
  - generic: 单体电压
  - generic: 单体电压1
  - generic: 3.201V
  - generic: 单体温度
  - generic: 单体温度1
  - generic: 0℃
  - generic: 单体温度3
  - generic: --
  - generic: 铭牌定值
  - generic: 设备类型
  - generic: 电池包'''
 def test_missing_index_not_filled_and_zero_preserved(self):
  result=pack.parse(self.text(),'PACK');self.assertEqual(result['cellCount'],48);self.assertEqual([x['index'] for x in result['cells']],[1,1,3]);self.assertEqual(result['cells'][1]['value'],0);self.assertIsNone(result['cells'][2]['value'])
 def test_mismatched_identity_refused(self):
  with self.assertRaises(ValueError):pack.parse(self.text(),'OTHER')
 def test_duplicate_refused(self):
  with self.assertRaises(ValueError):pack.parse(self.text().replace('单体温度3','单体温度1'),'PACK')
 def energy(self,charge='0kWh',discharge='0kWh'):
  return self.text().replace('  - generic: 单体温度\n',f'  - generic: 电池组\n  - generic: 今日充电量\n  - generic: {charge}\n  - generic: 今日放电量\n  - generic: {discharge}\n  - generic: 单体温度\n')
 def test_energy_absent(self):self.assertIsNone(pack.parse(self.text(),'PACK')['energyGroup'])
 def test_energy_zero_and_missing(self):
  self.assertEqual(pack.parse(self.energy(),'PACK')['energyGroup'],dict(chargeKwh=0,dischargeKwh=0))
  self.assertEqual(pack.parse(self.energy('--','-'),'PACK')['energyGroup'],dict(chargeKwh=None,dischargeKwh=None))
 def test_energy_malformed_refused(self):
  for raw in ('NaNkWh','-1kWh','1kW','', '1e3kWh'):
   with self.subTest(raw=raw),self.assertRaises(ValueError):pack.parse(self.energy(raw),'PACK')
  for text in (self.energy().replace('电池组','其他'),self.energy().replace('今日放电量','今日充电量'),self.energy().replace('  - generic: 今日放电量\n  - generic: 0kWh\n','')):
   with self.assertRaises(ValueError):pack.parse(text,'PACK')
 def test_trailing_parent_or_sibling_energy_is_not_pack_energy(self):
  for heading in ('电池簇：PARENT','电池包：OTHER'):
   trailing=f'\n  - text: {heading}\n  - generic: 电池组\n  - generic: 今日充电量\n  - generic: 42kWh\n  - generic: 今日放电量\n  - generic: 43kWh\n  - generic: 单体温度\n'
   self.assertIsNone(pack.parse(self.text()+trailing,'PACK')['energyGroup'])
 def test_truncated_or_ambiguous_detail_rejected(self):
  for text in (self.text().replace('  - generic: 设备类型\n  - generic: 电池包',''),self.text().replace('  - generic: 铭牌定值','  - text: 电池簇：PARENT\n  - generic: 铭牌定值'),self.text().replace('  - generic: 铭牌定值','- dialog:\n  - generic: 铭牌定值')):
   with self.assertRaises(ValueError):pack.parse(text,'PACK')
if __name__=='__main__':unittest.main()
