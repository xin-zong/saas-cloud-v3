CREATE TEMP TABLE migration_after_capabilities ON COMMIT DROP AS
 SELECT DISTINCT g.user_id,rp.permission_code,gs.station_id
 FROM member_grant g JOIN role_permission rp ON rp.role_id=g.role_id
 LEFT JOIN member_grant_station gs ON gs.grant_id=g.id
 WHERE g.valid_from<=CURRENT_TIMESTAMP AND (g.valid_until IS NULL OR CURRENT_TIMESTAMP<g.valid_until);
DO $$
BEGIN
 -- Detect loss or expansion for every original code, across all real and synthetic users.
 IF EXISTS ((SELECT * FROM migration_before_capabilities EXCEPT SELECT * FROM migration_after_capabilities)
 UNION ALL (SELECT a.* FROM migration_after_capabilities a JOIN migration_before_codes c ON c.code=a.permission_code
 EXCEPT SELECT * FROM migration_before_capabilities)) THEN
  RAISE EXCEPTION 'Legacy user/permission/station parity failed';
 END IF;
 IF EXISTS ((SELECT * FROM migration_before_links EXCEPT SELECT * FROM user_role)
 UNION ALL (SELECT * FROM user_role EXCEPT SELECT * FROM migration_before_links))
 OR EXISTS ((SELECT * FROM migration_before_stations EXCEPT SELECT * FROM user_station)
 UNION ALL (SELECT * FROM user_station EXCEPT SELECT * FROM migration_before_stations))
 OR EXISTS (SELECT * FROM migration_before_permissions EXCEPT SELECT * FROM role_permission)
 OR EXISTS (SELECT rp.* FROM role_permission rp JOIN migration_before_roles r ON r.id=rp.role_id
 EXCEPT SELECT * FROM migration_before_permissions)
 OR EXISTS (SELECT * FROM migration_before_roles EXCEPT SELECT * FROM app_role) THEN
  RAISE EXCEPTION 'Legacy baseline changed';
 END IF;
 IF EXISTS (SELECT 1 FROM app_user u JOIN migration_before_users b USING(id)
 WHERE u.organization_id IS DISTINCT FROM b.organization_id OR u.management_organization_id IS DISTINCT FROM b.organization_id
 OR u.account<>b.account OR u.password_hash<>b.password_hash OR u.enabled<>b.enabled) THEN
  RAISE EXCEPTION 'Membership, identity, or management ownership changed incorrectly';
 END IF;
 IF EXISTS (SELECT 1 FROM member_grant WHERE granted_by IS NOT NULL OR valid_until IS NOT NULL OR valid_from<>CURRENT_TIMESTAMP) THEN
  RAISE EXCEPTION 'Fabricated issuer or legacy validity';
 END IF;
 IF EXISTS (SELECT 1 FROM migration_before_links b JOIN migration_before_users u ON u.id=b.user_id
 WHERE NOT EXISTS (SELECT 1 FROM member_grant g JOIN app_role r ON r.id=g.role_id
 WHERE g.user_id=b.user_id AND r.organization_id IS NOT DISTINCT FROM u.organization_id
 AND (SELECT count(*) FROM role_permission rp WHERE rp.role_id=g.role_id)>=
 (SELECT count(*) FROM migration_before_permissions p WHERE p.role_id=b.role_id))) THEN
  RAISE EXCEPTION 'Role or stationless/empty grant was dropped';
 END IF;
 IF EXISTS (SELECT 1 FROM migration_after_capabilities WHERE permission_code IN
 ('role.manage','settlement.read','dispatch.read','dispatch.manage','invitation.read')) THEN
  RAISE EXCEPTION 'Unapproved governance or ambiguous alias assigned';
 END IF;
 IF EXISTS (SELECT 1 FROM organization o WHERE (SELECT count(*) FROM app_role r
 WHERE r.organization_id=o.id AND r.code LIKE 'template\_%' ESCAPE '\')<>8)
 OR EXISTS (SELECT 1 FROM member_grant g JOIN app_role r ON r.id=g.role_id WHERE r.code LIKE 'template\_%' ESCAPE '\') THEN
  RAISE EXCEPTION 'Eight unassigned defaults per organization required';
 END IF;
 -- Independent operation-equivalence oracle, including conjunction across different roles.
 IF EXISTS (
 WITH expected AS (
 SELECT b.user_id,m.new_code permission_code,b.station_id FROM migration_before_capabilities b
 JOIN (VALUES ('asset.read','customer.read'),('asset.read','device.health.read'),
 ('workorder.manage','workorder.create'),('workorder.manage','workorder.edit'),('workorder.manage','workorder.handle'),
 ('member.manage','organization.member.read'),('member.manage','organization.manage'),
 ('member.manage','member.manage.profile'),('member.manage','member.grant.manage')) m(old_code,new_code)
 ON m.old_code=b.permission_code
 UNION SELECT a.user_id,'customer.manage',a.station_id FROM migration_before_capabilities a
 WHERE a.permission_code='asset.edit' AND EXISTS (SELECT 1 FROM migration_before_capabilities b
 WHERE b.user_id=a.user_id AND b.permission_code='member.manage')),
 actual AS (SELECT * FROM migration_after_capabilities WHERE permission_code IN
 ('customer.read','device.health.read','workorder.create','workorder.edit','workorder.handle',
 'organization.member.read','organization.manage','member.manage.profile','member.grant.manage','customer.manage'))
 (SELECT * FROM expected EXCEPT SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
 ) THEN RAISE EXCEPTION 'Granular operation parity failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM migration_after_capabilities WHERE user_id=-73001 AND permission_code='customer.manage' AND station_id=-73001)
 OR EXISTS (SELECT 1 FROM migration_after_capabilities WHERE user_id=-73002 AND permission_code='customer.manage')
 OR EXISTS (SELECT 1 FROM member_grant g JOIN member_grant_station s ON s.grant_id=g.id WHERE g.user_id IN (-73003,-73008))
 OR EXISTS (SELECT 1 FROM member_grant g JOIN app_role r ON r.id=g.role_id WHERE g.user_id IN (-73004,-73008) AND r.organization_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Conjunction, no-site, or null-owner scope regression';
 END IF;
END $$;
SELECT count(*) AS tested_users FROM migration_before_users;
SELECT count(*) AS preserved_legacy_capabilities FROM migration_before_capabilities;
SELECT 'V7 migration parity passed' AS result;
