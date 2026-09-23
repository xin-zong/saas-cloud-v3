"""Rollback-only explicit template initialization rehearsal; --red omits initialization."""
import argparse
from pathlib import Path
import subprocess
import sys

API = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(API / 'database'))
from generate_template_sync import render


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--with-migrations', action='store_true', help='For a V1-V5 database only')
    parser.add_argument('--red', action='store_true')
    parser.add_argument('--emit', action='store_true')
    args = parser.parse_args()
    saved = (API / 'database/initialize_unassigned_templates.sql').read_text(encoding='utf-8')
    assert saved == render(), 'Regenerate canonical template SQL and review its diff'
    parts = ["\\set ON_ERROR_STOP on\nBEGIN;\nDO $$ BEGIN IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF; END $$;\nSELECT pg_advisory_xact_lock(78291002);"]
    if args.with_migrations:
        for version in (6, 7, 8, 9):
            parts.append(next((API / 'src/main/resources/db/migration').glob(f'V{version}__*.sql')).read_text(encoding='utf-8'))
        parts.append('INSERT INTO schema_migration(version) VALUES(6),(7),(8),(9);')
    parts.append("""
INSERT INTO organization(id,name) VALUES(-98001,'template-sync-test');
INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id,enabled)
 VALUES(-98001,'template-sync-enabled','Test','unused',-98001,-98001,true),(-98002,'template-sync-disabled','Test','unused',-98001,-98001,false);
INSERT INTO app_role(id,code,name,organization_id) VALUES
 (-98011,'template_owner__o-98001','Unassigned',-98001),(-98012,'template_pmo__o-98001','Expired',-98001),
 (-98013,'org_-98001_ems','Future',-98001),(-98014,'template_om__o-98001','Disabled',-98001),
 (-98015,'template_epc__o-98001','Active',-98001),(-98016,'template_vendor__o-98001','Legacy',-98001);
INSERT INTO role_permission SELECT id,'asset.read' FROM app_role WHERE id BETWEEN -98016 AND -98011;
INSERT INTO member_grant(id,user_id,role_id,valid_from,valid_until) VALUES
 (-98012,-98001,-98012,now()-interval '2 days',now()-interval '1 day'),
 (-98013,-98001,-98013,now()+interval '1 day',NULL),
 (-98014,-98002,-98014,now()-interval '1 day',NULL),
 (-98015,-98001,-98015,now()-interval '1 day',NULL);
INSERT INTO user_role VALUES(-98001,-98016);
CREATE TEMP TABLE sync_before AS SELECT * FROM role_permission WHERE role_id BETWEEN -98016 AND -98012;
CREATE TEMP TABLE grants_before AS SELECT * FROM member_grant;
""")
    body = saved.replace('BEGIN;\n', '', 1).replace('COMMIT;', '')
    if not args.red:
        parts.append(body)
    parts.append("""
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM role_permission WHERE role_id=-98011 AND permission_code='approval.read') THEN RAISE EXCEPTION 'unassigned default not synchronized'; END IF;
 IF EXISTS((SELECT * FROM sync_before EXCEPT SELECT * FROM role_permission) UNION ALL
   (SELECT * FROM role_permission WHERE role_id BETWEEN -98016 AND -98012 EXCEPT SELECT * FROM sync_before)) THEN RAISE EXCEPTION 'referenced role broadened'; END IF;
 IF EXISTS(SELECT 1 FROM role_permission WHERE role_id=-98011 AND permission_code IN ('analytics.history.read','device.health.read')) THEN RAISE EXCEPTION 'unavailable code initialized'; END IF;
 IF EXISTS((SELECT * FROM grants_before EXCEPT SELECT * FROM member_grant) UNION ALL (SELECT * FROM member_grant EXCEPT SELECT * FROM grants_before)) THEN RAISE EXCEPTION 'user grants changed'; END IF;
END $$;
CREATE TEMP TABLE permissions_once AS SELECT * FROM role_permission;
CREATE TEMP TABLE audits_once AS SELECT * FROM audit_event;
DROP TABLE template_sync_desired;
""")
    if not args.red:
        parts.append(body)
    parts.append("""
DO $$ BEGIN
 IF EXISTS((SELECT * FROM permissions_once EXCEPT SELECT * FROM role_permission) UNION ALL (SELECT * FROM role_permission EXCEPT SELECT * FROM permissions_once)) THEN RAISE EXCEPTION 'sync not idempotent'; END IF;
 IF (SELECT count(*) FROM audit_event)<>(SELECT count(*) FROM audits_once) THEN RAISE EXCEPTION 'idempotent sync added audit'; END IF;
END $$;
SELECT 'template sync: PASS' result;
ROLLBACK;
""")
    sql = '\n'.join(parts)
    if args.emit:
        print(sql)
    else:
        raise SystemExit(subprocess.run(['psql', '-X', '--dbname=ems_cloud_v2_proto'], input=sql, text=True).returncode)


if __name__ == '__main__':
    main()
