import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'migrate-toyingzhen.py'
spec = importlib.util.spec_from_file_location('toyingzhen_migrations', SCRIPT)
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)
TARGET = 'ems_cloud_saas_toyingzhen'
ROLE = 'ems_toyingzhen_owner'

class FakeConnection:
    def __init__(self):
        self.identity = (TARGET, ROLE)
        self.versions = list(range(1, 26))
        self.statements = []
        self.ddl = []
        self.committed = []
        self.fail_on = None
        self.rollback_count = 0
    def transaction(self):
        owner = self
        class Transaction:
            def __enter__(self):
                self.versions = owner.versions[:]
                self.ddl = owner.ddl[:]
            def __exit__(self, kind, value, tb):
                if kind:
                    owner.versions = self.versions
                    owner.ddl = self.ddl
                    owner.rollback_count += 1
                else:
                    owner.committed = owner.ddl[:]
        return Transaction()
    def cursor(self):
        return self
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def close(self):
        pass
    def execute(self, sql, params=None):
        self.statements.append((sql, params))
        if sql.startswith('SELECT current_database()'):
            self.result = [self.identity]
        elif 'pg_advisory_xact_lock' in sql:
            self.result = [(None,)]
        elif sql.startswith('SELECT version'):
            self.result = [(v,) for v in self.versions]
        elif sql.startswith('INSERT INTO public.schema_migration'):
            self.versions.append(params[0])
            self.result = []
        elif sql.startswith('CREATE TABLE marker_'):
            self.ddl.append(sql)
            if sql == self.fail_on:
                raise RuntimeError('password=supersecret SQL PRIVATE DETAILS')
        else:
            raise AssertionError('Unexpected SQL: '+sql)
    def fetchone(self):
        return self.result[0]
    def fetchall(self):
        return self.result

class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.directory = self.root/'ems-cloud-api/src/main/resources/db/migration'
        self.directory.mkdir(parents=True)
        for version in range(1, 29):
            (self.directory/f'V{version}__fixture.sql').write_text(f'CREATE TABLE marker_{version};', encoding='utf8')
        self.env = self.root/'private.env'
        self.config = {'EMS_DATABASE_NAME':TARGET,'EMS_DB_URL':f'jdbc:postgresql://127.0.0.1:15435/{TARGET}', 'EMS_DB_USERNAME':ROLE,'EMS_DB_PASSWORD':'supersecret'}
        self.write_env()
        self.connection = FakeConnection()
        self.connection_calls = 0
    def write_env(self):
        self.env.write_text('\n'.join(f'{k}={v}' for k,v in self.config.items()),encoding='utf8')
    def connect(self, **kwargs):
        self.connection_calls += 1
        return self.connection
    def run_migrations(self, apply=True, through=28, branch='develop-toyingzhen'):
        return migration.run(self.root,self.env,through,apply=apply,connect=self.connect,branch_reader=lambda root: branch)
    def test_wrong_settings_or_branch_never_connect_and_never_execute_ddl(self):
        for key in ['EMS_DATABASE_NAME','EMS_DB_URL','EMS_DB_USERNAME']:
            original = self.config[key]
            self.config[key] = 'wrong'
            self.write_env()
            with self.assertRaises(migration.MigrationError):
                self.run_migrations()
            self.config[key] = original
        self.write_env()
        with self.assertRaises(migration.MigrationError):
            self.run_migrations(branch='main')
        self.assertEqual(0,self.connection_calls)
        self.assertEqual([],self.connection.ddl)
    def test_wrong_live_identity_executes_zero_ddl(self):
        for identity in [('ems_cloud_saas_v3',ROLE),(TARGET,'postgres')]:
            self.connection.identity = identity
            with self.assertRaises(migration.MigrationError):
                self.run_migrations()
        self.assertEqual([],self.connection.ddl)
    def test_missing_or_duplicate_repository_version_is_rejected_before_connect(self):
        missing = self.directory/'V27__fixture.sql'
        missing.unlink()
        with self.assertRaises(migration.MigrationError):
            self.run_migrations()
        missing.write_text('CREATE TABLE marker_27;',encoding='utf8')
        (self.directory/'V27__duplicate.sql').write_text('CREATE TABLE other;',encoding='utf8')
        with self.assertRaises(migration.MigrationError):
            self.run_migrations()
        self.assertEqual(0,self.connection_calls)
    def test_dry_run_reads_identity_and_tracking_without_ddl_or_tracking_changes(self):
        result = self.run_migrations(apply=False)
        self.assertEqual([26,27,28],[item['version'] for item in result['migrations']])
        self.assertEqual([],self.connection.ddl)
        self.assertEqual(list(range(1,26)),self.connection.versions)
    def test_apply_is_ordered_recorded_and_idempotent(self):
        result = self.run_migrations()
        self.assertEqual(['CREATE TABLE marker_26;','CREATE TABLE marker_27;','CREATE TABLE marker_28;'],self.connection.committed)
        self.assertEqual(list(range(1,29)),self.connection.versions)
        self.assertTrue(all(item['status']=='applied' for item in result['migrations']))
        before = self.connection.ddl[:]
        again = self.run_migrations()
        self.assertEqual(before,self.connection.ddl)
        self.assertTrue(all(item['status']=='already-applied' for item in again['migrations']))
        sql = [sql for sql,_ in self.connection.statements]
        self.assertEqual(6,sum('pg_advisory_xact_lock' in statement for statement in sql))
    def test_failure_rolls_back_only_failing_version_and_redacts_driver_details(self):
        self.connection.fail_on='CREATE TABLE marker_27;'
        with self.assertRaises(migration.MigrationError) as error:
            self.run_migrations()
        self.assertNotIn('supersecret',str(error.exception))
        self.assertNotIn('PRIVATE DETAILS',str(error.exception))
        self.assertEqual(['CREATE TABLE marker_26;'],self.connection.committed)
        self.assertEqual(list(range(1,27)),self.connection.versions)
        self.assertGreaterEqual(self.connection.rollback_count,1)
    def test_tracking_gap_and_unrequested_historical_bootstrap_are_refused(self):
        self.connection.versions.remove(12)
        with self.assertRaises(migration.MigrationError):
            self.run_migrations()
        self.assertEqual([],self.connection.ddl)
        with self.assertRaises(migration.MigrationError):
            self.run_migrations(through=25)
    def test_corrupt_huge_tracking_version_is_rejected_before_any_large_allocation(self):
        self.connection.versions.append(2147483647)
        oversized_requests = []
        def bounded_range(*args):
            if any(abs(value) > 1000 for value in args):
                oversized_requests.append(args)
                raise AssertionError('Test intercepted an unsafe allocation before it happened')
            return range(*args)
        # Intercept only the migration module; never construct a huge list even in RED.
        with patch.object(migration,'range',bounded_range,create=True):
            with self.assertRaises(migration.MigrationError):
                self.run_migrations()
        self.assertEqual([],oversized_requests,'Reject unknown versions before allocating a sequence')
        self.assertEqual([],self.connection.ddl)
        self.assertEqual([],self.connection.committed)

if __name__ == '__main__':
    unittest.main()
