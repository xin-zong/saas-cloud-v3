-- Run on success OR failure. Retire exact T12 identities, preserve audit and fixture tombstones.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(78291001);
DO $$ BEGIN
 IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF NOT EXISTS(SELECT 1 FROM schema_migration WHERE version=9) THEN RAISE EXCEPTION 'V9 required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=982001 AND account='permission-t12-actor' AND organization_id=982001 AND management_organization_id=982001)
 OR NOT EXISTS(SELECT 1 FROM organization WHERE id=982001 AND name='permission-t12-isolated' AND parent_id IS NULL)
 OR (SELECT count(*) FROM station WHERE (id,code) IN ((982001,'permission-t12-a'),(982002,'permission-t12-b')) AND organization_id=982001)<>2
 OR NOT EXISTS(SELECT 1 FROM app_role WHERE id=982001 AND code='permission-t12-actor' AND organization_id=982001) THEN
  RAISE EXCEPTION 'T12 fixture identity mismatch; reconcile manually';
 END IF;
 IF EXISTS(SELECT 1 FROM app_user WHERE account='permission-t12-target' AND (management_organization_id IS DISTINCT FROM 982001 OR organization_id IS DISTINCT FROM 982001))
 OR EXISTS(SELECT 1 FROM app_user WHERE account LIKE 'permission-t12-%' AND account NOT IN ('permission-t12-actor','permission-t12-target'))
 OR EXISTS(SELECT 1 FROM app_user WHERE (management_organization_id=982001 OR organization_id=982001) AND account NOT IN ('permission-t12-actor','permission-t12-target')) THEN
  RAISE EXCEPTION 'Unexpected T12 account ownership; preserve records and investigate';
 END IF;
 IF EXISTS(SELECT 1 FROM member_grant g JOIN app_user recipient ON recipient.id=g.user_id
   WHERE (g.granted_by=982001 OR g.role_id IN (SELECT id FROM app_role WHERE organization_id=982001))
   AND recipient.account NOT IN ('permission-t12-actor','permission-t12-target'))
 OR EXISTS(SELECT 1 FROM member_grant g JOIN app_user recipient ON recipient.id=g.user_id
   WHERE recipient.account IN ('permission-t12-actor','permission-t12-target')
   AND (g.role_id NOT IN (SELECT id FROM app_role WHERE organization_id=982001)
     OR EXISTS(SELECT 1 FROM member_grant_station gs WHERE gs.grant_id=g.id AND gs.station_id NOT IN (982001,982002)))) THEN
  RAISE EXCEPTION 'Unexpected cross-fixture grant; preserve records and investigate';
 END IF;
END $$;
CREATE TEMP TABLE t12_retired_users ON COMMIT DROP AS
 SELECT id FROM app_user WHERE (id=982001 AND account='permission-t12-actor') OR account='permission-t12-target';
UPDATE app_user SET enabled=false WHERE id IN (SELECT id FROM t12_retired_users);
DELETE FROM member_grant WHERE user_id IN (SELECT id FROM t12_retired_users);
INSERT INTO audit_event(actor_id,action,detail)
 SELECT NULL,'permission.fixture.cleanup',json_build_object('namespace','permission-t12','disabledUserIds',array_agg(id ORDER BY id),'retained','accounts,roles,organizations,stations,audit')::text FROM t12_retired_users;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM app_user WHERE id IN (SELECT id FROM t12_retired_users) AND enabled)
 OR EXISTS(SELECT 1 FROM member_grant WHERE user_id IN (SELECT id FROM t12_retired_users)) THEN RAISE EXCEPTION 'T12 cleanup incomplete'; END IF;
END $$;
COMMIT;
