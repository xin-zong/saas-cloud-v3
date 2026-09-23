\set ON_ERROR_STOP on
SELECT current_database()='ems_cloud_v2_proto' AS correct_database \gset
\if :correct_database
\else
  \quit 3
\endif
BEGIN;
-- This fails before migrations and catches missing real database constraints.
DO $$
DECLARE org bigint; usr bigint; st bigint; p bigint;
BEGIN
  INSERT INTO organization(name) VALUES ('constraint-test') RETURNING id INTO org;
  INSERT INTO app_user(account,display_name,password_hash,organization_id) VALUES ('constraint-test','Test','$2a$hash',org) RETURNING id INTO usr;
  INSERT INTO station(code,name,rated_power_kw,capacity_kwh) VALUES ('constraint-test','Test',100,200) RETURNING id INTO st;
  BEGIN
    INSERT INTO station(code,name,rated_power_kw,capacity_kwh) VALUES ('negative-test','Test',-1,200);
    RAISE EXCEPTION 'negative capacity accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO station(code,name,rated_power_kw,capacity_kwh) VALUES ('constraint-test','Duplicate',1,2);
    RAISE EXCEPTION 'duplicate station accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO user_station VALUES(usr,-999);
    RAISE EXCEPTION 'orphan grant accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  INSERT INTO operating_plan(station_id,service_date,version,kind,created_by) VALUES(st,'2026-09-23',1,'dayAhead',usr) RETURNING id INTO p;
  INSERT INTO plan_period(plan_id,start_minute,end_minute,mode,power_kw) VALUES(p,0,60,'charge',50);
  BEGIN
    INSERT INTO plan_period(plan_id,start_minute,end_minute,mode,power_kw) VALUES(p,30,90,'charge',50);
    RAISE EXCEPTION 'overlap accepted';
  EXCEPTION WHEN exclusion_violation THEN NULL; END;
  BEGIN
    UPDATE organization SET parent_id=id WHERE id=org;
    RAISE EXCEPTION 'organization cycle accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO inspection(station_id,title,due_at,status,completed_at,result) VALUES(st,'invalid inspection',now(),'completed',now(),NULL);
    RAISE EXCEPTION 'completed inspection without result accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
ROLLBACK;
