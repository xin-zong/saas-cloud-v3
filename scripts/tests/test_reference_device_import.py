import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'import-reference-devices.py'

class Database:
    def __init__(self):
        self.identity=('ems_cloud_saas_toyingzhen','ems_toyingzhen_owner')
        self.station=(12,2,2)
        self.ready=True
        self.manager=True
        self.devices={}
        self.mapping={}
        self.profiles={}
        self.readonly=False
        self.fail=False
    def transaction(self):
        db=self
        class Transaction:
            def __enter__(self): self.old=copy.deepcopy((db.devices,db.mapping,db.profiles)); db.readonly=False
            def __exit__(self,kind,*rest):
                if kind: db.devices,db.mapping,db.profiles=self.old
        return Transaction()
    def cursor(self): return self
    def __enter__(self): return self
    def __exit__(self,*args): pass
    def close(self): pass
    def execute(self,sql,p=None):
        self.result=[]
        if self.readonly and sql.startswith(('INSERT','UPDATE','DELETE')): raise AssertionError('Dry run mutation')
        if sql=='SET TRANSACTION READ ONLY': self.readonly=True
        elif sql.startswith('SELECT current_database'): self.result=[self.identity]
        elif 'pg_advisory_xact_lock' in sql: pass
        elif 'schema_migration' in sql: self.result=[(self.ready,)]
        elif 'saas_active_user' in sql: self.result=[(self.manager,)]
        elif sql.startswith('SELECT s.id'): self.result=[self.station] if self.station else []
        elif sql.startswith('SELECT i.device_id'):
            m=self.mapping.get(p)
            if m:
                d=self.devices[m[0]]; self.result=[(m[0],m[1],d['station'],d['code'],d['serial'])]
        elif sql.startswith('SELECT id FROM public.device'):
            self.result=[(i,) for i,d in self.devices.items() if (d['station']==p[0] and d['code']==p[1]) or (p[2] is not None and d['serial']==p[2])]
        elif sql.startswith('INSERT INTO public.device('):
            i=len(self.devices)+1; self.devices[i]={'station':p[0],'code':p[1],'name':p[2],'serial':p[3]}; self.result=[(i,)]
        elif sql.startswith('UPDATE public.device SET'):
            self.devices[p[2]]['name']=p[0]; self.devices[p[2]]['serial']=p[1]
        elif sql.startswith('INSERT INTO public.device_reference_profile'):
            if self.fail: raise RuntimeError('secret private data')
            self.profiles[p[0]]=p[1:]
        elif sql.startswith('INSERT INTO public.device_reference_import'): self.mapping[p[:2]]=(p[2],p[4])
        else: raise AssertionError('Unsupported SQL')
    def fetchone(self): return self.result[0] if self.result else None
    def fetchall(self): return self.result

class Tests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.exists(),'Device importer is missing')
        spec=importlib.util.spec_from_file_location('device_import',SCRIPT)
        self.module=importlib.util.module_from_spec(spec); spec.loader.exec_module(self.module)
        self.doc={'sourceHost':'ess-cloud-login.qudeox.com','capturedAt':'2026-10-16T12:00:00+08:00','devices':[{'stationSourceId':'station-1','type':'storage','serialNumber':'SYNTHETIC-001','name':'Synthetic device','raw':{'historicalStatus':'online'}}]}
    def run_db(self,db,apply=False,branch='develop-toyingzhen'):
        with tempfile.TemporaryDirectory() as directory:
            env=Path(directory)/'.env'
            env.write_text('EMS_DATABASE_NAME=ems_cloud_saas_toyingzhen\nEMS_DB_URL=jdbc:postgresql://127.0.0.1:15435/ems_cloud_saas_toyingzhen\nEMS_DB_USERNAME=ems_toyingzhen_owner\nEMS_DB_PASSWORD=secret',encoding='utf8')
            return self.module.run(SCRIPT.parents[1],env,self.doc,2,2,apply,connect=lambda **kw:db,branch_reader=lambda root:branch)
    def test_stable_fallback_and_unknown_attributes_preserve_source_without_live_status(self):
        first=self.module.normalize(self.doc)[0]
        self.assertIsNone(first['ratedPowerKw']); self.assertIsNone(first['capacityKwh'])
        self.assertEqual(self.doc['devices'][0],first['provenance']['device'])
        self.doc['capturedAt']='2026-10-17T12:00:00+08:00'
        self.assertEqual(first['sourceKey'],self.module.normalize(self.doc)[0]['sourceKey'])
        self.assertEqual(first['contentHash'],self.module.normalize(self.doc)[0]['contentHash'])
    def test_rejects_missing_identity_duplicates_nonfinite_and_unknown_category(self):
        for field,value in [('serialNumber',None),('ratedPowerKw',float('nan')),('category','made-up'),('stationSourceId',None)]:
            bad=copy.deepcopy(self.doc); bad['devices'][0][field]=value
            with self.assertRaises(self.module.ImportError): self.module.normalize(bad)
        self.doc['devices']*=2
        with self.assertRaises(self.module.ImportError): self.module.normalize(self.doc)
    def test_dryrun_readonly_and_apply_idempotent_with_real_station_relation(self):
        db=Database(); self.run_db(db)
        self.assertTrue(db.readonly); self.assertEqual({},db.devices)
        first=self.run_db(db,True); self.assertEqual(12,db.devices[1]['station'])
        second=self.run_db(db,True); self.assertEqual('unchanged',second['devices'][0]['status'])
        self.assertEqual(first['devices'][0]['deviceId'],second['devices'][0]['deviceId'])
        self.doc['devices'][0]['name']='Changed'; self.run_db(db,True)
        self.assertEqual('Changed',db.devices[1]['name']); self.assertEqual(1,len(db.devices))
    def test_guard_failure_and_unmapped_or_foreign_station_abort(self):
        for attr,value in [('identity',('ems_cloud_saas_v3','postgres')),('station',None),('station',(12,3,2)),('station',(12,2,3)),('ready',False),('manager',False)]:
            db=Database(); setattr(db,attr,value)
            with self.assertRaises(self.module.ImportError): self.run_db(db,True)
            self.assertEqual({},db.devices)
        with self.assertRaises(self.module.ImportError): self.run_db(Database(),True,'main')
    def test_unmapped_serial_collision_is_not_adopted(self):
        db=Database(); db.devices[99]={'station':99,'code':'original','serial':'SYNTHETIC-001','name':'original'}
        with self.assertRaises(self.module.ImportError): self.run_db(db,True)
        self.assertEqual([99],list(db.devices))
    def test_failure_rolls_back_all_and_redacts_driver_message(self):
        db=Database(); db.fail=True
        with self.assertRaises(self.module.ImportError) as caught: self.run_db(db,True)
        self.assertNotIn('secret',str(caught.exception)); self.assertEqual({},db.devices); self.assertEqual({},db.mapping)

if __name__=='__main__': unittest.main()
