import importlib.util
import pathlib
import unittest
import tempfile
import json
import shutil

class ImportCatalogTest(unittest.TestCase):
    def module(self):
        path = pathlib.Path(__file__).with_name('import-ems-catalog.py')
        self.assertTrue(path.exists(), 'Offline catalog importer must exist')
        spec = importlib.util.spec_from_file_location('catalog_import', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_parses_escaped_sql_names_without_executing_sql(self):
        records = self.module().parse_sql("INSERT INTO \"point_catalog\" VALUES (10001,'O''Brien',0,3);")
        self.assertEqual(records, [{'id': 10001, 'name': "O'Brien", 'dcValueType': 0, 'archivePolicy': 3}])

    def test_rejects_duplicates_and_malformed_insert(self):
        module = self.module()
        row = "INSERT INTO \"point_catalog\" VALUES (10001,'name',0,3);"
        for text in [row + '\n' + row, "INSERT INTO \"point_catalog\" VALUES (10001,'name',0);", "INSERT INTO \"point_catalog\" VALUES (0,'name',0,3);", "INSERT INTO \"point_catalog\" VALUES (10001,'',0,3);"]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                module.parse_sql(text)

    def inputs(self, directory):
        ids = list(range(10001, 10042)) + list(range(20001, 20255)) + [30115]
        sql = directory / 'point_catalog(1).sql'
        sql.write_text('\n'.join(f'INSERT INTO "point_catalog" VALUES ({point_id},\'test_{point_id}\',1,3);' for point_id in ids), encoding='utf-8')
        protocol = directory / 'protocol.md'
        protocol.write_text('| 20021 | BMS | 总电压 | V |\n', encoding='utf-8')
        fixtures = pathlib.Path(__file__).resolve().parents[1] / 'ems-cloud-protocol/src/test/resources/wire'
        for name in ['05_机柜30秒完整报文参考.json', '05_机柜60秒完整报文参考.json', '05_EMS完整报文参考.json']:
            shutil.copyfile(fixtures / name, directory / name)
        return sql, protocol

    def test_deterministic_evidence_counts_and_protocol_overrides(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            directory = pathlib.Path(temp)
            sql, protocol = self.inputs(directory)
            a = module.import_catalog(sql, protocol, directory)
            b = module.import_catalog(sql, protocol, directory)
            self.assertEqual(a, b)
            self.assertEqual(a['counts'], {'sqlDefinitions':296, 'ordinary':295, 'ems':6, 'config':173, 'definitions':475})
            definitions = {(d['namespace'], d['sourcePointId']):d for d in a['definitions']}
            self.assertEqual(definitions['cabinet',20021]['verifiedUnit'], 'V')
            self.assertIsNone(definitions['cabinet',20022]['verifiedUnit'])
            self.assertEqual(definitions['cabinet',20003]['wireType'], 'TEXT')
            self.assertEqual(definitions['cabinet',20062]['wireType'], 'U16_WORDS')
            self.assertEqual(definitions['cabinet',30115]['wireType'], 'UNKNOWN')
            self.assertEqual(definitions['config',101]['sourceMetadata']['scalarType'], 'unknown')
            self.assertIsNone(definitions['ems',90002]['sourceName'])
            protocol.write_text('| 20021 | BMS | 总电压 | A |\n', encoding='utf-8')
            self.assertNotEqual(a['sourceHash'], module.import_catalog(sql,protocol,directory)['sourceHash'])

    def test_missing_sql_definition_cannot_silently_lose_an_ordinary_point(self):
        module = self.module()
        with tempfile.TemporaryDirectory() as temp:
            directory = pathlib.Path(temp)
            sql, protocol = self.inputs(directory)
            sql.write_text('\n'.join(sql.read_text(encoding='utf-8').splitlines()[1:]), encoding='utf-8')
            with self.assertRaises(ValueError):
                module.import_catalog(sql,protocol,directory)

if __name__ == '__main__':
    unittest.main()
