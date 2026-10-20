import importlib.util
import tempfile
import unittest
import re
from zipfile import ZipFile
from datetime import datetime, timezone
from pathlib import Path
import openpyxl

spec = importlib.util.spec_from_file_location('history', Path(__file__).with_name('import-reference-device-history.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
HEADERS = ('设备类型', 'SN', '所属父设备', '所属子场站', '时间', '功率(W)')
IDENTITY = ('逆变器', 'TEST-SN', 'TEST-PARENT', 'TEST-STATION')

class HistoryRange(unittest.TestCase):
    def parse(self, stamps, start='2026-10-14', end=None):
        rows = [HEADERS] + [IDENTITY + (stamp, '0') for stamp in stamps]
        return m.parse_rows(rows, IDENTITY[1], IDENTITY[2], IDENTITY[3], start, '+02:00', IDENTITY[0], end)

    def test_five_days_include_both_boundaries(self):
        rows = self.parse(['2026/10/14 00:00:00', '2026/10/18 23:59:59'], end='2026-10-18')
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0][2].astimezone(timezone.utc).isoformat(), '2026-10-13T22:00:00+00:00')
        self.assertEqual(rows[-1][2].day, 18)

    def test_default_is_single_day(self):
        self.assertEqual(len(self.parse(['2026/10/14 23:59:59'])), 1)
        with self.assertRaises(ValueError): self.parse(['2026/10/15 00:00:00'])

    def test_calendar_ranges(self):
        for start, end, stamp in [('2024-02-27', '2024-03-02', '2024/02/29 12:00:00'), ('2026-12-30', '2027-01-03', '2027/01/03 12:00:00')]:
            with self.subTest(start=start): self.assertEqual(len(self.parse([stamp], start, end)), 1)

    def test_reject_invalid_or_overlong_ranges(self):
        for start, end in [('2026-10-14', '2026-10-19'), ('2026-10-14', '2026-10-13'), ('2026-02-29', None), ('20261014', None), ('2026-10-14~2026-10-18', None), ('2026-10-14', '2026-10-18T00:00:00'), ('2026-10-14', '')]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError): self.parse(['2026/10/14 00:00:00'], start, end)

    def test_reject_rows_outside_range(self):
        for stamp in ['2026/10/13 23:59:59', '2026/10/19 00:00:00']:
            with self.subTest(stamp=stamp), self.assertRaises(ValueError): self.parse([stamp], end='2026-10-18')

    def test_all_identity_columns_still_enforced(self):
        for column in range(4):
            row = list(IDENTITY + ('2026/10/18 00:00:00', '0'))
            row[column] = 'WRONG'
            with self.subTest(column=column), self.assertRaises(ValueError):
                m.parse_rows([HEADERS, row], IDENTITY[1], IDENTITY[2], IDENTITY[3], '2026-10-14', '+02:00', IDENTITY[0], '2026-10-18')

    def test_single_day_workbook_and_incorrect_export_dimensions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'test.xlsx'
            workbook = openpyxl.Workbook()
            workbook.active.title = '2026-10-14'
            workbook.active.append(HEADERS)
            workbook.active.append(IDENTITY + ('2026/10/14 00:00:00', '0'))
            workbook.save(path)
            workbook.close()
            with ZipFile(path) as archive:
                entries = {name: archive.read(name) for name in archive.namelist()}
            entries['xl/worksheets/sheet1.xml'] = re.sub(rb'<dimension ref="[^"]+"', b'<dimension ref="A1"', entries['xl/worksheets/sheet1.xml'])
            with ZipFile(path, 'w') as archive:
                for name, data in entries.items(): archive.writestr(name, data)
            rows, _ = m.read_history(path, IDENTITY[1], IDENTITY[2], IDENTITY[3], '2026-10-14', '+02:00', IDENTITY[0], '2026-10-15T00:00:00Z')
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0][3], '0')

    def test_exact_workbook_sheet_and_capture_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'test.xlsx'
            for sheet, capture, valid in [('2026-10-14~2026-10-18', '2026-10-19T00:00:00Z', True), ('2026-10-14', '2026-10-19T00:00:00Z', False), ('2026-10-14~2026-10-18', '2026-10-17T00:00:00Z', False), ('2026-10-14~2026-10-18', '2026-10-19T00:00:00', False), ('2026-10-14~2026-10-18', '2999-01-01T00:00:00Z', False)]:
                workbook = openpyxl.Workbook()
                workbook.active.title = sheet
                workbook.active.append(HEADERS)
                workbook.active.append(IDENTITY + ('2026/10/18 00:00:00', '0'))
                workbook.save(path)
                workbook.close()
                args = (path, IDENTITY[1], IDENTITY[2], IDENTITY[3], '2026-10-14', '+02:00', IDENTITY[0], capture, '2026-10-18')
                with self.subTest(sheet=sheet, capture=capture):
                    if valid:
                        rows, captured = m.read_history(*args)
                        self.assertEqual(len(rows), 1)
                        self.assertEqual(captured.isoformat(), '2026-10-19T00:00:00+00:00')
                    else:
                        with self.assertRaises(ValueError): m.read_history(*args)

if __name__ == '__main__': unittest.main()
