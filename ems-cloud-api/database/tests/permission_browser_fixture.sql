-- T12: explicit reviewed provisioning only, psql -X, private environment hash.
-- No existing member receives a grant. The UI workflow creates its target and two roles.
\set ON_ERROR_STOP on
\getenv fixture_password_hash EMS_PERMISSION_TEST_PASSWORD_HASH
BEGIN;
SELECT pg_advisory_xact_lock(78291001);
DO $$ BEGIN
 IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=9) THEN RAISE EXCEPTION 'V9 required'; END IF;
 IF EXISTS(SELECT 1 FROM app_user WHERE id BETWEEN 983001 AND 983009 OR account LIKE 'permission-t12r2-%')
 OR EXISTS(SELECT 1 FROM organization WHERE id BETWEEN 983001 AND 983009 OR name LIKE 'permission-t12r2-%')
 OR EXISTS(SELECT 1 FROM station WHERE id BETWEEN 983001 AND 983009 OR code LIKE 'permission-t12r2-%')
 OR EXISTS(SELECT 1 FROM app_role WHERE id BETWEEN 983001 AND 983009 OR code LIKE 'permission-t12r2-%' OR name LIKE 'permission-t12r2-%')
 OR EXISTS(SELECT 1 FROM member_grant WHERE id BETWEEN 983001 AND 983009) THEN
  RAISE EXCEPTION 'T12 collision; do not overwrite/reuse fixture tombstones';
 END IF;
END $$;
CREATE TEMP TABLE fixture_secret(hash text) ON COMMIT DROP;
INSERT INTO fixture_secret VALUES(:'fixture_password_hash');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM fixture_secret WHERE hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$') THEN RAISE EXCEPTION 'BCrypt hash required'; END IF;
END $$;
INSERT INTO organization(id,name) VALUES(983001,'permission-t12r2-isolated');
INSERT INTO station(id,code,name,organization_id,rated_power_kw,capacity_kwh) VALUES
 (983001,'permission-t12r2-a','permission-t12r2-station-A',983001,10,20),
 (983002,'permission-t12r2-b','permission-t12r2-station-B',983001,10,20);
INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id)
 SELECT 983001,'permission-t12r2-actor','permission-t12r2-actor',hash,983001,983001 FROM fixture_secret;
INSERT INTO app_role(id,code,name,organization_id) VALUES(983001,'permission-t12r2-actor','permission-t12r2-actor',983001);
INSERT INTO role_permission SELECT 983001,c FROM unnest(ARRAY[
 'role.manage','member.grant.manage','organization.member.read','member.manage.profile','asset.read','asset.edit'
]) c;
INSERT INTO member_grant(id,user_id,role_id,valid_from,granted_by) VALUES(983001,983001,983001,statement_timestamp(),NULL);
INSERT INTO member_grant_station VALUES(983001,983001),(983001,983002);
INSERT INTO audit_event(actor_id,action,detail) VALUES(NULL,'permission.fixture.create',
 '{"namespace":"permission-t12r2","actorId":983001,"organizationId":983001,"stationIds":[983001,983002],"targetAccount":"permission-t12r2-target"}');
COMMIT;
