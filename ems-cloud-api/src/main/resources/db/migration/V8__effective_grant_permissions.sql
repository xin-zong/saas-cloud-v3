-- Read-through relations: revocation, role edits and expiry affect the next statement.
CREATE VIEW active_member_grant AS
 SELECT g.* FROM member_grant g JOIN app_user u ON u.id=g.user_id
 WHERE u.enabled AND g.valid_from<=statement_timestamp()
   AND (g.valid_until IS NULL OR statement_timestamp()<g.valid_until);

CREATE VIEW effective_station_permission AS
 SELECT DISTINCT g.user_id, gs.station_id, rp.permission_code
 FROM active_member_grant g JOIN member_grant_station gs ON gs.grant_id=g.id
 JOIN role_permission rp ON rp.role_id=g.role_id
 WHERE rp.permission_code NOT IN ('asset.create','organization.member.read','organization.manage',
   'member.manage.profile','role.manage','member.grant.manage','audit.read','member.manage');

-- Scope belongs to the grant role owner, never the recipient's movable membership.
-- UNION bounds traversal even if legacy hierarchy data contains a cycle.
CREATE VIEW effective_organization_permission AS
 WITH RECURSIVE scope(user_id,organization_id,permission_code) AS (
   SELECT g.user_id,r.organization_id,rp.permission_code
   FROM active_member_grant g JOIN app_role r ON r.id=g.role_id
   JOIN role_permission rp ON rp.role_id=r.id
   WHERE r.organization_id IS NOT NULL AND rp.permission_code IN
     ('asset.create','organization.member.read','organization.manage','member.manage.profile',
      'role.manage','member.grant.manage','audit.read','member.manage')
   UNION
   SELECT s.user_id,o.id,s.permission_code FROM scope s
   JOIN organization o ON o.parent_id=s.organization_id
 ) SELECT user_id,organization_id,permission_code FROM scope;

CREATE VIEW effective_permission AS
 SELECT user_id,permission_code FROM effective_station_permission
 UNION SELECT user_id,permission_code FROM effective_organization_permission
 -- Audit exposes only the actor's own events, including legacy NULL-owner users.
 UNION SELECT g.user_id,rp.permission_code FROM active_member_grant g
 JOIN role_permission rp ON rp.role_id=g.role_id WHERE rp.permission_code='audit.read';

-- Only existing reviewers gain general station-scoped approval visibility.
-- Submitters retain a separate own-record branch; frozen legacy roles remain untouched.
INSERT INTO permission(code,name) VALUES('approval.read','查看审批') ON CONFLICT DO NOTHING;
INSERT INTO role_permission(role_id,permission_code)
 SELECT r.id,'approval.read' FROM app_role r JOIN role_permission rp ON rp.role_id=r.id
 WHERE rp.permission_code='approval.review' AND
   (r.organization_id IS NOT NULL OR EXISTS(SELECT 1 FROM member_grant g WHERE g.role_id=r.id))
 ON CONFLICT DO NOTHING;
