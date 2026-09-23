-- Explicit operator-approved fixture preparation AFTER reviewed cutover only.
-- Run with psql -X; supply a generated BCrypt hash via environment, never an argument/file.
\set ON_ERROR_STOP on
\getenv fixture_password_hash EMS_PERMISSION_TEST_PASSWORD_HASH
BEGIN;
SELECT pg_advisory_xact_lock(78291001);
DO $$ BEGIN
 IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=9) THEN RAISE EXCEPTION 'V9 required'; END IF;
 IF EXISTS(SELECT 1 FROM app_user WHERE id BETWEEN 981001 AND 981008 OR account LIKE 'permission-t11-%')
 OR EXISTS(SELECT 1 FROM organization WHERE id IN (981001,981002))
 OR EXISTS(SELECT 1 FROM station WHERE id IN (981001,981002))
 OR EXISTS(SELECT 1 FROM app_role WHERE id BETWEEN 981001 AND 981008 OR code LIKE 'permission-t11-%')
 OR EXISTS(SELECT 1 FROM member_grant WHERE id BETWEEN 981001 AND 981008) THEN
  RAISE EXCEPTION 'T11 fixture collision; do not overwrite or reuse existing rows';
 END IF;
END $$;
CREATE TEMP TABLE fixture_secret(hash text) ON COMMIT DROP;
INSERT INTO fixture_secret VALUES(:'fixture_password_hash');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM fixture_secret WHERE hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$') THEN RAISE EXCEPTION 'BCrypt hash required'; END IF;
END $$;
INSERT INTO organization(id,name) VALUES(981001,'permission-t11-isolated'),(981002,'permission-t11-outside');
INSERT INTO station(id,code,name,organization_id,rated_power_kw,capacity_kwh) VALUES
 (981001,'permission-t11-a','permission-t11-station-A',981001,10,20),
 (981002,'permission-t11-b','permission-t11-station-B',981002,10,20);
INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id)
 SELECT 981000+n,'permission-t11-'||name,'permission-t11-'||name,hash,
 CASE WHEN n=4 THEN NULL ELSE 981001 END,CASE WHEN n=4 THEN NULL ELSE 981001 END
 FROM (VALUES(1,'actor'),(2,'peer'),(3,'target'),(4,'legacy'),(5,'limited'),(6,'expiring')) names(n,name) CROSS JOIN fixture_secret;
INSERT INTO app_role(id,code,name,organization_id) VALUES
 (981001,'permission-t11-actor','permission-t11-actor',981001),
 (981002,'permission-t11-peer','permission-t11-peer',981001),
 (981004,'permission-t11-legacy','permission-t11-legacy',NULL),
 (981005,'permission-t11-limited','permission-t11-limited',981001),
 (981006,'permission-t11-expiring','permission-t11-expiring',981001),
 (981007,'permission-t11-long-role','permission-t11-long-role',981001);
INSERT INTO role_permission SELECT r,c FROM unnest(ARRAY[981001,981002,981005]) r
 CROSS JOIN unnest(ARRAY['role.manage','member.grant.manage','organization.manage','organization.member.read','member.manage.profile','audit.read','asset.read','asset.edit']) c;
INSERT INTO role_permission VALUES(981004,'organization.manage'),(981004,'asset.read'),(981006,'asset.read'),(981007,'asset.read');
INSERT INTO member_grant(id,user_id,role_id,valid_from,valid_until) VALUES
 (981001,981001,981001,now()-interval '1 day',NULL),
 (981002,981002,981002,now()-interval '1 day',NULL),
 (981004,981004,981004,now()-interval '1 day',NULL),
 (981005,981005,981005,now()-interval '1 day',now()+interval '1 day'),
 (981006,981006,981006,now()-interval '1 day',now()+interval '90 seconds'),
 (981007,981003,981007,now()-interval '1 day',NULL);
INSERT INTO member_grant_station SELECT id,981001 FROM member_grant WHERE id IN (981001,981002,981005,981006,981007);
INSERT INTO audit_event(actor_id,action,detail) VALUES(NULL,'permission.fixture.create','{"namespace":"permission-t11","userIds":[981001,981002,981003,981004,981005,981006]}');
COMMIT;
