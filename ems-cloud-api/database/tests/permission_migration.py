"""Build/run rollback-only V6/V7 rehearsal. Credentials use libpq environment.

--red omits V7 to demonstrate missing capabilities; --emit writes SQL to stdout.
Fixtures use negative IDs; V7 may advance identity sequences even after rollback.
"""
import argparse
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-v6', action='store_true')
    parser.add_argument('--red', action='store_true')
    parser.add_argument('--emit', action='store_true')
    args = parser.parse_args()
    api = Path(__file__).resolve().parents[2]
    migrations = api / 'src/main/resources/db/migration'
    tests = api / 'database/tests'
    parts = ["\\set ON_ERROR_STOP on\nBEGIN;\nDO $$ BEGIN IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;\nSELECT pg_advisory_xact_lock(78291002);"]
    if args.with_v6:
        parts.append((migrations / 'V6__member_grant_schema.sql').read_text(encoding='utf-8'))
    parts.append((tests / 'permission_migration_before.sql').read_text(encoding='utf-8'))
    if not args.red:
        parts.append((migrations / 'V7__migrate_member_grants.sql').read_text(encoding='utf-8'))
    parts.append((tests / 'permission_migration_after.sql').read_text(encoding='utf-8'))
    parts.append('ROLLBACK;')
    sql = '\n'.join(parts)
    if args.emit:
        print(sql)
    else:
        raise SystemExit(subprocess.run(['psql', '-X', '--dbname=ems_cloud_v2_proto'], input=sql, text=True).returncode)


if __name__ == '__main__':
    main()
