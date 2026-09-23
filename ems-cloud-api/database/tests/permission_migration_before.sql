-- Transaction-only fixtures. Negative IDs avoid advancing business sequences.
INSERT INTO organization(id,name) VALUES (-73001,'migration test organization'),(-73002,'migration test other');
INSERT INTO app_role(id,code,name) VALUES
 (-73001,'migration_test_editor','Shared custom role'),
 (-73002,'migration_test_manager','Shared custom role'),
 (-73003,'migration_test_empty','只读观察员');
INSERT INTO role_permission(role_id,permission_code) VALUES
 (-73001,'asset.edit'),(-73001,'asset.read'),(-73002,'member.manage'),(-73002,'workorder.manage');
INSERT INTO app_user(id,account,display_name,password_hash,organization_id) VALUES
 (-73001,'migration_test_both','Both roles','unused',-73001),
 (-73002,'migration_test_editor','Editor only','unused',-73001),
 (-73003,'migration_test_zero','No stations','unused',-73001),
 (-73004,'migration_test_null','No organization','unused',NULL),
 (-73005,'migration_test_other','Other organization','unused',-73002),
 (-73006,'migration_test_empty','Empty role','unused',-73001),
 (-73007,'migration_test_no_role','No role','unused',-73001),
 (-73008,'migration_test_null_zero','No organization or stations','unused',NULL);
INSERT INTO user_role(user_id,role_id) VALUES
 (-73001,-73001),(-73001,-73002),(-73002,-73001),(-73003,-73002),
 (-73004,-73001),(-73004,-73002),(-73005,-73001),(-73006,-73003),(-73008,-73002);
INSERT INTO station(id,code,name,organization_id,rated_power_kw,capacity_kwh) VALUES
 (-73001,'migration_test_station','Migration test station',-73001,1,1),
 (-73002,'migration_test_station_other','Other station',-73002,1,1);
INSERT INTO user_station(user_id,station_id) VALUES
 (-73001,-73001),(-73001,-73002),(-73002,-73001),(-73004,-73001),
 (-73005,-73002),(-73006,-73001),(-73007,-73001);

CREATE TEMP TABLE migration_before_users ON COMMIT DROP AS SELECT * FROM app_user;
CREATE TEMP TABLE migration_before_roles ON COMMIT DROP AS SELECT * FROM app_role;
CREATE TEMP TABLE migration_before_links ON COMMIT DROP AS SELECT * FROM user_role;
CREATE TEMP TABLE migration_before_stations ON COMMIT DROP AS SELECT * FROM user_station;
CREATE TEMP TABLE migration_before_permissions ON COMMIT DROP AS SELECT * FROM role_permission;
CREATE TEMP TABLE migration_before_codes ON COMMIT DROP AS SELECT code FROM permission;
-- NULL station represents permission held with no site access, never a wildcard.
CREATE TEMP TABLE migration_before_capabilities ON COMMIT DROP AS
 SELECT DISTINCT u.id user_id,rp.permission_code,us.station_id
 FROM app_user u JOIN user_role ur ON ur.user_id=u.id
 JOIN role_permission rp ON rp.role_id=ur.role_id
 LEFT JOIN user_station us ON us.user_id=u.id;
