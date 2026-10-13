-- Run only in a disposable copy; fixtures and sequence changes roll back.
BEGIN;
DO $$ BEGIN
 IF current_database() NOT LIKE '%saas%test%' THEN RAISE EXCEPTION 'isolated SaaS test database required'; END IF;
END $$;
CREATE FUNCTION pg_temp.reject_sql(q text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE q;
 EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation OR not_null_violation THEN RETURN;
 END;
 RAISE EXCEPTION 'constraint did not reject: %',label;
END $$;
INSERT INTO tenant(id,kind) VALUES(-101,'enterprise'),(-102,'enterprise');
INSERT INTO company_profile(tenant_id,name,country,province,city,address,postcode,contact_name,phone)
 VALUES(-101,'Test A','DE','Berlin','Berlin','A','10115','A','+49123456'),
       (-102,'Test B','FR','Paris','Paris','B','75001','B','+33123456');
INSERT INTO app_user(id,account,display_name,password_hash,tenant_id,status)
 VALUES(-101,'tenant-a@test.invalid','A','unused',-101,'active'),(-102,'tenant-b@test.invalid','B','unused',-102,'active');
SELECT pg_temp.reject_sql($q$INSERT INTO tenant_administrator VALUES(-101,-102)$q$,'administrator tenant');
INSERT INTO tenant_administrator VALUES(-101,-101),(-102,-102);
SELECT pg_temp.reject_sql($q$UPDATE app_user SET status='disabled' WHERE id=-101$q$,'administrator disable');
SELECT pg_temp.reject_sql($q$DELETE FROM tenant_administrator WHERE tenant_id=-101$q$,'administrator remove');
SELECT pg_temp.reject_sql($q$UPDATE app_user SET tenant_id=-102 WHERE id=-101$q$,'identity tenant immutable');
SELECT pg_temp.reject_sql($q$INSERT INTO app_user(id,account,display_name,password_hash,tenant_id,status) VALUES(-103,'TENANT-A@test.invalid','Bad','unused',-101,'active')$q$,'email normalization');
INSERT INTO app_role(id,code,name,tenant_id) VALUES(-101,'test_role_a','Test',-101),(-102,'test_role_b','Test',-102);
SELECT pg_temp.reject_sql($q$INSERT INTO app_role(id,code,name,tenant_id) VALUES(-103,'test_dup',' Test ',-101)$q$,'same tenant role name');
INSERT INTO station(id,code,name,rated_power_kw,capacity_kwh,tenant_id) VALUES(-101,'TEST-SAAS-A','A',1,1,-101),(-102,'TEST-SAAS-B','B',1,1,-102);
INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(-101,-101,-101,now());
INSERT INTO member_grant_station VALUES(-101,-101);
SELECT pg_temp.reject_sql($q$INSERT INTO member_grant_station VALUES(-101,-102)$q$,'grant station tenant');
SELECT pg_temp.reject_sql($q$INSERT INTO member_grant(id,user_id,role_id,valid_from) VALUES(-102,-101,-102,now())$q$,'grant role tenant');
SELECT pg_temp.reject_sql($q$INSERT INTO member_grant(id,user_id,valid_from) VALUES(-102,-101,now())$q$,'missing grant role');
INSERT INTO role_template(id,name) VALUES(-101,'Test default');
SELECT pg_temp.reject_sql($q$INSERT INTO member_grant(id,user_id,role_id,template_id,valid_from) VALUES(-102,-101,-101,-101,now())$q$,'two grant roles');
SELECT pg_temp.reject_sql($q$INSERT INTO member_grant(id,user_id,template_id,valid_from) VALUES(-102,-101,-101,now())$q$,'template not in tenant package');
INSERT INTO menu(id,name_key,client,kind,applicable_side,sort_order) VALUES(-101,'test.root','web','directory','enterprise',0);
INSERT INTO menu(id,parent_id,name_key,client,kind,sort_order) VALUES(-102,-101,'test.directory','web','directory',0);
INSERT INTO menu(id,parent_id,name_key,client,kind,route_path,permission_code,sort_order) VALUES(-103,-102,'test.page','web','page','assets','asset.read',0);
INSERT INTO menu(id,parent_id,name_key,client,kind,permission_code,sort_order) VALUES(-104,-103,'test.child','web','action','telemetry.read',0);
SELECT pg_temp.reject_sql($q$INSERT INTO menu(id,parent_id,name_key,client,kind,permission_code,sort_order) VALUES(-105,-104,'test.button.child','web','action','asset.edit',0)$q$,'action must be leaf');
SELECT pg_temp.reject_sql($q$UPDATE menu SET kind='action',permission_code='asset.read' WHERE id=-102$q$,'parent cannot become action');
SELECT pg_temp.reject_sql($q$INSERT INTO menu(id,parent_id,name_key,client,kind,permission_code,sort_order) VALUES(-105,-104,'test.deep','web','action','alarm.read',0)$q$,'menu fifth level');
SELECT pg_temp.reject_sql($q$UPDATE menu SET parent_id=-104,applicable_side=NULL WHERE id=-101$q$,'menu cycle');
SELECT pg_temp.reject_sql($q$INSERT INTO menu(id,parent_id,name_key,client,kind,permission_code,sort_order) VALUES(-105,-101,'test.client','app','action','alarm.read',0)$q$,'cross client parent');
SELECT pg_temp.reject_sql($q$INSERT INTO menu(id,name_key,client,kind,route_path,permission_code,applicable_side) VALUES(-105,'test.route','web','page','arbitrary','asset.read','enterprise')$q$,'unknown route');
INSERT INTO menu(id,name_key,client,kind,applicable_side) VALUES(-106,'test.platform','web','directory','platform');
INSERT INTO permission_package(id,name) VALUES(-101,'Test package');
INSERT INTO permission_package_menu VALUES(-101,-101);
SELECT pg_temp.reject_sql($q$DELETE FROM menu WHERE id=-101$q$,'referenced root deletion');
INSERT INTO role_permission(role_id,permission_code,client) VALUES(-101,'telemetry.read','web');
SELECT pg_temp.reject_sql($q$DELETE FROM menu WHERE id=-104$q$,'role referenced leaf deletion');
DELETE FROM role_permission WHERE role_id=-101 AND permission_code='telemetry.read';

SELECT pg_temp.reject_sql($q$INSERT INTO permission_package_menu VALUES(-101,-106)$q$,'platform menu package');
INSERT INTO permission_package_template VALUES(-101,-101);
INSERT INTO tenant_package VALUES(-101,-101);
INSERT INTO member_grant(id,user_id,template_id,valid_from) VALUES(-102,-101,-101,now());
SELECT pg_temp.reject_sql($q$DELETE FROM tenant_package WHERE tenant_id=-101$q$,'last package');
SELECT 'tenant schema constraints passed';
ROLLBACK;
