"""Real PostgreSQL tests; psql credentials come from standard PG* environment/libpq.

python database/tests/permission_grants.py             # installed schema
python database/tests/permission_grants.py --with-v6   # rollback-only V6 rehearsal
Requires versions 1-5; never invokes apply.sql or commits schema/data changes.
"""
import argparse
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-v6', action='store_true')
    args = parser.parse_args()
    api = Path(__file__).resolve().parents[2]
    guard = "DO $$ BEGIN IF current_database() <> 'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;\n"
    sql = '\\set ON_ERROR_STOP on\nBEGIN;\n' + guard
    if args.with_v6:
        sql += (api / 'src/main/resources/db/migration/V6__member_grant_schema.sql').read_text(encoding='utf-8') + '\n'
    sql += Path(__file__).with_suffix('.sql').read_text(encoding='utf-8')
    sql += '\nROLLBACK;\n'
    result = subprocess.run(['psql', '-X', '--dbname=ems_cloud_v2_proto'], input=sql, text=True)
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
