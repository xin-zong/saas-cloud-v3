import importlib.util, unittest, tempfile, json
from pathlib import Path
from decimal import Decimal
spec=importlib.util.spec_from_file_location('samples',Path(__file__).with_name('import-reference-device-samples.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Parsing(unittest.TestCase):
    def test_zero_missing_and_negative(self):
        self.assertEqual(m.parse_value('0W','kW'),(Decimal(0),'observed'))
        self.assertEqual(m.parse_value('--V','V'),(None,'missing'))
        self.assertEqual(m.parse_value('-100W','kW'),(Decimal('-.1'),'observed'))
    def test_units(self):
        self.assertEqual(m.parse_value('55.23MΩ','MΩ')[0],Decimal('55.23'))
        self.assertEqual(m.parse_value('32.8MWh','kWh')[0],Decimal('32800'))
        with self.assertRaises(ValueError):m.parse_value('1℃','V')
    def test_precision_text(self):
        self.assertEqual(m.parse_value('9007199254740993.0001','')[0],Decimal('9007199254740993.0001'))
        self.assertEqual(m.parse_value('静止',''),(None,'text'))
    def test_detail_printed_index_and_source_time(self):
        doc={'url':'https://ess-cloud-login.qudeox.com/monitor/device/list','capturedAt':'2026-10-18T09:00:00Z',
             'text':'电池簇：TEST\n2026-10-18 10:00:00 UTC+02:00\nPACK\n3.242\n#23\n',
             'cards':[['当前功率','-100W'],['--','组串电流平均值']], 'summary':[],
             'radio':[{'label':'电压/V','checked':True}], 'packs':[{'header':'#5\nPACK','cells':[{'value':'3.242'}]}]}
        with tempfile.TemporaryDirectory() as t:
            p=Path(t)/'detail.json';p.write_text(json.dumps(doc),'utf8');rows=m.read_detail(p)
            self.assertEqual(rows[0][5],Decimal('-.1'));self.assertEqual(rows[0][3].hour,10)
            self.assertEqual(rows[1][1],'详情 · 组串电流平均值');self.assertEqual(rows[1][7],'missing')
            self.assertTrue(rows[-1][1].endswith('#23'))
            doc['packs'][0]['cells'][0]['value']='3.3';p.write_text(json.dumps(doc),'utf8')
            with self.assertRaises(ValueError):m.read_detail(p)
if __name__=='__main__':unittest.main()
