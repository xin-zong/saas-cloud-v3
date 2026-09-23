-- Run inside BEGIN/ROLLBACK; permission_grants.py supplies that transaction.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() <> 'ems_cloud_v2_proto' THEN
  RAISE EXCEPTION 'Tests are restricted to ems_cloud_v2_proto';
 END IF;
 IF to_regclass('member_grant') IS NULL OR to_regclass('member_grant_station') IS NULL THEN
  RAISE EXCEPTION 'Missing permission grant schema: V6 is required';
 END IF;
END $$;

-- Each rejected mutation must raise the exact integrity class, never a syntax error.
CREATE FUNCTION pg_temp.expect_grant_failure(statement text, expected_state text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
 BEGIN
  EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  IF actual_state = expected_state THEN RETURN; END IF;
  RAISE EXCEPTION '%: expected SQLSTATE %, got %', label, expected_state, actual_state;
 END;
 RAISE EXCEPTION '%: invalid mutation accepted', label;
END $$;

INSERT INTO organization(id,name) VALUES(-96001,'grant-test-a'),(-96002,'grant-test-b');
INSERT INTO app_user(id,account,display_name,password_hash,organization_id,management_organization_id,email)
VALUES(-96001,'grant-test-member','Member','unused',-96001,-96001,'member@example.test'),
      (-96002,'grant-test-actor','Actor','unused',-96001,-96001,NULL),
      (-96003,'grant-test-legacy','Legacy','unused',NULL,NULL,NULL);
UPDATE organization SET lead_user_id=-96002 WHERE id=-96001;
INSERT INTO app_role(id,code,name,organization_id,description)
VALUES(-96001,'grant-test-arbitrary-code','Operator',-96001,'Test role'),
      (-96002,'grant-test-other-org','Operator',-96002,NULL),
      (-96003,'grant-test-legacy-role','Operator',NULL,NULL);
INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh,organization_id)
VALUES(-96001,'grant-test-station','Test',1,2,-96001);
INSERT INTO member_grant(id,user_id,role_id,valid_from,valid_until,granted_by)
VALUES(-96001,-96001,-96001,'2026-01-01T00:00:00+08','2026-02-01T00:00:00+08',-96002),
      (-96002,-96001,-96001,'2026-01-01T00:00:00+08',NULL,-96002),
      (-96003,-96003,-96003,'2026-01-01T00:00:00+08',NULL,NULL);
INSERT INTO member_grant_station(grant_id,station_id) VALUES(-96001,-96001);

SELECT pg_temp.expect_grant_failure($q$UPDATE member_grant SET role_id=-96999 WHERE id=-96001$q$,'23503','unknown role');
SELECT pg_temp.expect_grant_failure($q$UPDATE member_grant SET user_id=-96999 WHERE id=-96001$q$,'23503','unknown member');
SELECT pg_temp.expect_grant_failure($q$UPDATE member_grant SET role_id=NULL WHERE id=-96001$q$,'23502','missing role');
SELECT pg_temp.expect_grant_failure($q$UPDATE member_grant SET user_id=NULL WHERE id=-96001$q$,'23502','missing member');
SELECT pg_temp.expect_grant_failure($q$UPDATE member_grant SET granted_by=-96999 WHERE id=-96001$q$,'23503','unknown grantor');
SELECT pg_temp.expect_grant_failure($q$UPDATE member_grant SET valid_from=NULL WHERE id=-96001$q$,'23502','missing start');
SELECT pg_temp.expect_grant_failure($q$UPDATE member_grant SET valid_until=valid_from WHERE id=-96001$q$,'23514','equal end');
SELECT pg_temp.expect_grant_failure($q$UPDATE member_grant SET valid_until=valid_from-interval '1 second' WHERE id=-96001$q$,'23514','earlier end');
SELECT pg_temp.expect_grant_failure($q$INSERT INTO member_grant_station VALUES(-96001,-96999)$q$,'23503','unknown station');
SELECT pg_temp.expect_grant_failure($q$INSERT INTO member_grant_station VALUES(-96999,-96001)$q$,'23503','unknown grant');
SELECT pg_temp.expect_grant_failure($q$INSERT INTO member_grant_station VALUES(-96001,-96001)$q$,'23505','duplicate station');
SELECT pg_temp.expect_grant_failure($q$INSERT INTO member_grant_station VALUES(NULL,-96001)$q$,'23502','missing grant key');
SELECT pg_temp.expect_grant_failure($q$INSERT INTO member_grant_station VALUES(-96001,NULL)$q$,'23502','missing station key');
SELECT pg_temp.expect_grant_failure($q$DELETE FROM app_role WHERE id=-96001$q$,'23503','in-use role deletion');
SELECT pg_temp.expect_grant_failure($q$UPDATE app_role SET name='   ' WHERE id=-96001$q$,'23514','blank role name');
SELECT pg_temp.expect_grant_failure($q$UPDATE app_role SET organization_id=-96001,name=' Operator ' WHERE id=-96002$q$,'23505','trimmed name collision within organization');
SELECT pg_temp.expect_grant_failure($q$UPDATE app_role SET code='grant-test-arbitrary-code' WHERE id=-96002$q$,'23505','global code collision');
SELECT pg_temp.expect_grant_failure($q$UPDATE app_role SET organization_id=-96999 WHERE id=-96001$q$,'23503','unknown role owner');
SELECT pg_temp.expect_grant_failure($q$UPDATE app_user SET management_organization_id=-96999 WHERE id=-96001$q$,'23503','unknown administrative owner');
SELECT pg_temp.expect_grant_failure($q$UPDATE organization SET lead_user_id=-96999 WHERE id=-96001$q$,'23503','unknown organization lead');

-- Membership removal retains independent administrative ownership and profile email.
UPDATE app_user SET organization_id=NULL WHERE id=-96001;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM member_grant WHERE id=-96003 AND granted_by IS NULL) THEN
  RAISE EXCEPTION 'Unknown historical issuer was not preserved';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM app_user WHERE id=-96001 AND organization_id IS NULL
               AND management_organization_id=-96001 AND email='member@example.test') THEN
  RAISE EXCEPTION 'Membership removal lost owner or profile';
 END IF;
 IF EXISTS(SELECT 1 FROM member_grant_station WHERE grant_id=-96002) THEN
  RAISE EXCEPTION 'Stationless grant unexpectedly gained station access';
 END IF;
 IF (SELECT valid_from FROM member_grant WHERE id=-96001) <> timestamptz '2025-12-31T16:00:00Z' THEN
  RAISE EXCEPTION 'Grant start did not preserve timezone instant';
 END IF;
END $$;
DELETE FROM member_grant WHERE id=-96001;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM member_grant_station WHERE grant_id=-96001) THEN
  RAISE EXCEPTION 'Deleted grant left station links';
 END IF;
END $$;
SELECT 'permission grant constraints: PASS' AS result;
