-- Exact fixture retirement, on success OR failure. Preserve accounts and all audit/history.
\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(78291001);
DO $$ BEGIN
 IF current_database()<>'ems_cloud_v2_proto' THEN RAISE EXCEPTION 'Wrong database'; END IF;
 IF (SELECT count(*) FROM app_user WHERE (id,account) IN (
 (981001,'permission-t11-actor'),(981002,'permission-t11-peer'),(981003,'permission-t11-target'),
 (981004,'permission-t11-legacy'),(981005,'permission-t11-limited'),(981006,'permission-t11-expiring')))<>6 THEN
  RAISE EXCEPTION 'Fixture identity mismatch; manual reconciliation required';
 END IF;
 IF EXISTS(SELECT 1 FROM member_grant WHERE granted_by BETWEEN 981001 AND 981006 AND user_id NOT BETWEEN 981001 AND 981006) THEN
  RAISE EXCEPTION 'Unexpected non-fixture recipient; preserve records and investigate';
 END IF;
END $$;
UPDATE app_user SET enabled=false WHERE id IN (981001,981002,981003,981004,981005,981006);
DELETE FROM member_grant WHERE user_id IN (981001,981002,981003,981004,981005,981006);
INSERT INTO audit_event(actor_id,action,detail)
 VALUES(NULL,'permission.fixture.cleanup','{"namespace":"permission-t11","disabledUserIds":[981001,981002,981003,981004,981005,981006],"retained":"accounts,roles,organizations,stations,audit"}');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM app_user WHERE id BETWEEN 981001 AND 981006 AND enabled)
 OR EXISTS(SELECT 1 FROM member_grant WHERE user_id BETWEEN 981001 AND 981006) THEN RAISE EXCEPTION 'Fixture cleanup incomplete'; END IF;
END $$;
COMMIT;
