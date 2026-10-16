import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


class DatabaseDouble:
    """External PostgreSQL seam only; mutations and rollback remain observable state."""
    def __init__(self):
        self.identity=('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner')
        self.versions_ready=True
        self.manager_valid=True
        self.stations={1:{'code':'PROTO-001','tenant':2,'name':'Existing prototype'}}
        self.mappings={}
        self.profiles={}
        self.readonly=False
        self.fail_on_profile=False
        self.fail_profile_number=None
        self.profile_writes=0
        self.plan_stations=set()
        self.market_stations=set()
        self.lock_events=[]
    def transaction(self):
        owner=self
        class Transaction:
            def __enter__(self):
                self.snapshot=copy.deepcopy((owner.stations,owner.mappings,owner.profiles))
                owner.readonly=False
            def __exit__(self,kind,value,tb):
                if kind: owner.stations,owner.mappings,owner.profiles=self.snapshot
        return Transaction()
    def cursor(self): return self
    def __enter__(self): return self
    def __exit__(self,*args): return False
    def close(self): pass
    def execute(self,sql,params=None):
        self.result=[]
        if self.readonly and sql.startswith(('INSERT','UPDATE','DELETE')):
            raise AssertionError('Dry run attempted mutation')
        if sql=='SET TRANSACTION READ ONLY': self.readonly=True
        elif sql.startswith('SELECT current_database'): self.result=[self.identity]
        elif 'pg_advisory_xact_lock' in sql:
            self.lock_events.append(params[0] if params else int(sql.split('(')[1].split(')')[0]))
        elif 'schema_migration' in sql: self.result=[(self.versions_ready,)]
        elif 'saas_active_user' in sql: self.result=[(self.manager_valid,)]
        elif sql.startswith('SELECT i.station_id'):
            mapping=self.mappings.get(params)
            if mapping:
                station=self.stations[mapping[0]]
                self.result=[(mapping[0],mapping[1],station['tenant'],station['code'])]
                if 's.rated_power_kw' in sql:
                    self.result=[self.result[0]+(station['ratedPowerKw'],)]
                if 'FOR UPDATE OF s' in sql: self.lock_events.append(('station-row',mapping[0]))
        elif 'FROM public.operating_plan' in sql:
            self.result=[(params[0] in self.plan_stations or params[1] in self.market_stations,)]
        elif sql.startswith('SELECT id FROM public.station'):
            self.result=[(i,) for i,s in self.stations.items() if s['code']==params[0]]
        elif sql.startswith('INSERT INTO public.station('):
            identity=max(self.stations)+1
            self.stations[identity]={'name':params[0],'code':params[8],'tenant':params[9],
                                     'ratedPowerKw':params[1]}
            self.result=[(identity,)]
        elif sql.startswith('UPDATE public.station SET'):
            self.stations[params[8]]['name']=params[0]
            self.stations[params[8]]['ratedPowerKw']=params[1]
        elif sql.startswith('INSERT INTO public.station_profile'):
            self.profile_writes+=1
            if self.fail_on_profile or self.profile_writes==self.fail_profile_number:
                raise RuntimeError('private password secret')
            self.profiles[params[0]]=params[1:]
        elif sql.startswith('INSERT INTO public.station_reference_import'):
            self.mappings[params[:2]]=(params[2],params[3],params[4])
        else: raise AssertionError('Unhandled SQL seam')
    def fetchone(self): return self.result[0] if self.result else None

SCRIPT = Path(__file__).resolve().parents[1] / 'import-reference-stations.py'


def load_importer():
    if not SCRIPT.exists():
        return None
    spec = importlib.util.spec_from_file_location('reference_import', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.importer = load_importer()
        self.assertIsNotNone(self.importer, 'Reference station importer is missing')
        self.document = {'sourceHost':'ess-cloud-login.qudeox.com',
                         'capturedAt':'2026-10-16T12:00:00+08:00',
                         'stations':[{'sourceId':'external-1','name':'Imported station',
                                      'ratedPowerKw':100,'capacityKwh':215,'assetType':'BESS',
                                      'profile':{'timezone':'Asia/Shanghai','solarCapacityKw':0},
                                      'raw':{'untouched':'evidence'}}]}

    def test_normalization_preserves_raw_and_unknown_fields_without_inventing_data(self):
        self.document['stations'][0]['extra'] = {'status':'offline'}
        rows = self.importer.normalize(self.document)
        self.assertEqual('external-1', rows[0]['sourceId'])
        self.assertEqual(self.document['stations'][0], rows[0]['provenance']['station'])
        self.assertIsNone(rows[0]['region'])
        self.assertEqual(0, rows[0]['profile']['solarCapacityKw'])

    def test_identity_and_content_hash_are_stable_and_capture_time_is_not_content(self):
        first = self.importer.normalize(self.document)[0]
        self.document['capturedAt'] = '2026-10-17T12:00:00+08:00'
        second = self.importer.normalize(self.document)[0]
        self.assertEqual(first['code'], second['code'])
        self.assertEqual(first['contentHash'], second['contentHash'])
        self.document['stations'][0]['name'] = 'Changed'
        third = self.importer.normalize(self.document)[0]
        self.assertEqual(first['code'], third['code'])
        self.assertNotEqual(first['contentHash'], third['contentHash'])

    def test_wrong_host_duplicates_missing_and_nonfinite_capacity_are_rejected(self):
        cases = []
        wrong = copy.deepcopy(self.document); wrong['sourceHost']='evil.example'; cases.append(wrong)
        duplicate=copy.deepcopy(self.document); duplicate['stations']*=2; cases.append(duplicate)
        for value in [None, 0, -1, float('nan'), True, '100 kW']:
            bad=copy.deepcopy(self.document); bad['stations'][0]['ratedPowerKw']=value; cases.append(bad)
        for bad in cases:
            with self.subTest(bad=bad):
                with self.assertRaises(self.importer.ImportError):
                    self.importer.normalize(bad)

    def test_invalid_profile_date_coordinates_and_timezone_are_rejected(self):
        for field,value in [('latitude',91),('longitude',181),('assetType','unknown')]:
            bad=copy.deepcopy(self.document); bad['stations'][0][field]=value
            with self.assertRaises(self.importer.ImportError): self.importer.normalize(bad)
        for field,value in [('commissionedOn','2026-02-30'),('solarCapacityKw',-1),('timezone','junk')]:
            bad=copy.deepcopy(self.document); bad['stations'][0]['profile'][field]=value
            with self.assertRaises(self.importer.ImportError): self.importer.normalize(bad)

    def test_wrong_configuration_and_branch_cannot_connect(self):
        with tempfile.TemporaryDirectory() as directory:
            env=Path(directory)/'.env'
            env.write_text('EMS_DB_URL=wrong',encoding='utf8')
            def forbidden(**kwargs): self.fail('Connected before guards passed')
            with self.assertRaises(self.importer.ImportError):
                self.importer.run(Path(directory),env,self.document,2,2,connect=forbidden)

    def run_database(self, db, apply=False, branch='develop-toyingzhen'):
        with tempfile.TemporaryDirectory() as directory:
            env=Path(directory)/'.env'
            env.write_text('EMS_DATABASE_NAME=ems_cloud_saas_toyingzhen\n'
                           'EMS_DB_URL=jdbc:postgresql://127.0.0.1:15435/ems_cloud_saas_toyingzhen\n'
                           'EMS_DB_USERNAME=ems_toyingzhen_owner\nEMS_DB_PASSWORD=secret',encoding='utf8')
            return self.importer.run(Path(directory),env,self.document,2,2,apply,
                                     connect=lambda **kwargs:db,branch_reader=lambda root:branch)

    def test_dry_run_is_read_only_and_does_not_add_a_station(self):
        db=DatabaseDouble()
        report=self.run_database(db)
        self.assertTrue(db.readonly)
        self.assertEqual([1],list(db.stations))
        self.assertEqual('insert',report['stations'][0]['status'])

    def test_apply_is_repeatable_and_updates_only_owned_mapping(self):
        db=DatabaseDouble()
        first=self.run_database(db,True)
        self.assertEqual('insert',first['stations'][0]['status'])
        self.assertEqual('Existing prototype',db.stations[1]['name'])
        second=self.run_database(db,True)
        self.assertEqual('unchanged',second['stations'][0]['status'])
        self.assertEqual(first['stations'][0]['stationId'],second['stations'][0]['stationId'])
        self.document['stations'][0]['name']='Updated import'
        third=self.run_database(db,True)
        self.assertEqual('update',third['stations'][0]['status'])
        self.assertEqual(2,len(db.stations))
        self.assertEqual('Updated import',db.stations[2]['name'])
        self.assertEqual('Existing prototype',db.stations[1]['name'])

    def test_profile_failure_rolls_back_station_insert_and_redacts_error(self):
        db=DatabaseDouble(); db.fail_on_profile=True
        with self.assertRaises(self.importer.ImportError) as error:
            self.run_database(db,True)
        self.assertNotIn('secret',str(error.exception))
        self.assertEqual([1],list(db.stations))
        self.assertEqual({},db.mappings)
        self.assertEqual({},db.profiles)

    def test_second_station_failure_rolls_back_the_entire_batch(self):
        db=DatabaseDouble(); db.fail_profile_number=2
        second=copy.deepcopy(self.document['stations'][0]); second['sourceId']='external-2'
        self.document['stations'].append(second)
        with self.assertRaises(self.importer.ImportError): self.run_database(db,True)
        self.assertEqual([1],list(db.stations))
        self.assertEqual({},db.mappings)
        self.assertEqual({},db.profiles)

    def test_mapping_cannot_be_reused_across_tenants(self):
        db=DatabaseDouble()
        self.run_database(db,True)
        db.stations[2]['tenant']=3
        self.document['stations'][0]['name']='Changed'
        with self.assertRaises(self.importer.ImportError): self.run_database(db,True)
        self.assertEqual('Imported station',db.stations[2]['name'])

    def test_existing_plan_or_market_allocation_blocks_power_reduction(self):
        for dependency in ('plan_stations','market_stations'):
            with self.subTest(dependency=dependency):
                db=DatabaseDouble()
                self.run_database(db,True)
                before=copy.deepcopy((db.stations,db.mappings,db.profiles))
                getattr(db,dependency).add(2)
                self.document['stations'][0]['ratedPowerKw']=50
                with self.assertRaises(self.importer.ImportError): self.run_database(db,True)
                self.assertEqual(before,(db.stations,db.mappings,db.profiles))
                self.document['stations'][0]['ratedPowerKw']=100

    def test_uncommitted_station_can_reduce_power_and_business_lock_precedes_tenant_lock(self):
        db=DatabaseDouble()
        self.run_database(db,True)
        db.lock_events.clear()
        self.document['stations'][0]['ratedPowerKw']=50
        report=self.run_database(db,True)
        self.assertEqual('update',report['stations'][0]['status'])
        self.assertEqual(50,db.stations[2]['ratedPowerKw'])
        self.assertIn(78291001,db.lock_events)
        self.assertLess(db.lock_events.index(78291001),db.lock_events.index(78291002))
        self.assertIn(('station-row',2),db.lock_events)

    def test_dry_run_also_rejects_unsafe_power_reduction_without_mutating(self):
        db=DatabaseDouble()
        self.run_database(db,True)
        db.plan_stations.add(2)
        self.document['stations'][0]['ratedPowerKw']=50
        with self.assertRaises(self.importer.ImportError): self.run_database(db)
        self.assertEqual(100,db.stations[2]['ratedPowerKw'])

    def test_identity_schema_permission_and_branch_guards_leave_database_untouched(self):
        for option,value in [('identity',('ems_cloud_saas_v3','ems_toyingzhen_owner')),
                             ('identity',('ems_cloud_saas_toyingzhen','postgres')),
                             ('versions_ready',False),('manager_valid',False)]:
            db=DatabaseDouble(); setattr(db,option,value)
            with self.assertRaises(self.importer.ImportError): self.run_database(db,True)
            self.assertEqual([1],list(db.stations))
        db=DatabaseDouble()
        with self.assertRaises(self.importer.ImportError): self.run_database(db,True,branch='main')
        self.assertEqual([1],list(db.stations))

    def test_existing_unmapped_station_cannot_be_adopted_even_with_matching_code(self):
        db=DatabaseDouble()
        code=self.importer.normalize(self.document)[0]['code']
        db.stations[1]['code']=code
        with self.assertRaises(self.importer.ImportError): self.run_database(db,True)
        self.assertEqual('Existing prototype',db.stations[1]['name'])


if __name__ == '__main__':
    unittest.main()
