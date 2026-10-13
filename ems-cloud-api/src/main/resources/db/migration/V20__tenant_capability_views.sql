ALTER TABLE app_role ADD COLUMN enabled boolean NOT NULL DEFAULT true;
ALTER TABLE permission ADD COLUMN resource_scope varchar(10) NOT NULL DEFAULT 'station' CHECK(resource_scope IN ('tenant','station')),
 ADD COLUMN operation_kind varchar(10) NOT NULL DEFAULT 'read' CHECK(operation_kind IN ('read','write')),
 ADD COLUMN implemented boolean NOT NULL DEFAULT false;
-- Catalog rows are installed by the companion seed script before enabling the new API.
UPDATE permission SET implemented=true,operation_kind=CASE WHEN code~'\.(read|query|export)$' THEN 'read' ELSE 'write' END
 WHERE code IN ('asset.read','asset.edit','asset.create','telemetry.read','alarm.read','alarm.handle','inspection.manage','workorder.read','workorder.create','workorder.edit','workorder.handle','approval.read','approval.review','strategy.read','strategy.manage','tariff.manage','market.read','market.manage','revenue.read','revenue.review','report.export','ems.read','ems.manage','ems.query','audit.read');
UPDATE permission SET resource_scope='tenant' WHERE code IN ('asset.create','audit.read');

CREATE VIEW saas_enabled_menu AS
WITH RECURSIVE tree AS (
 SELECT m.*,m.id root_id,m.applicable_side side,1 depth FROM menu m WHERE m.parent_id IS NULL AND m.enabled
 UNION ALL
 SELECT m.*,t.root_id,t.side,t.depth+1 FROM menu m JOIN tree t ON t.id=m.parent_id WHERE m.enabled
) SELECT * FROM tree;

CREATE VIEW saas_tenant_menu AS
 SELECT DISTINCT tp.tenant_id,m.id menu_id,m.root_id,m.client,m.permission_code,m.side
 FROM tenant_package tp JOIN permission_package p ON p.id=tp.package_id AND p.enabled
 JOIN permission_package_menu pm ON pm.package_id=p.id
 JOIN saas_enabled_menu m ON m.root_id=pm.menu_id
 WHERE m.side IN ('enterprise','both');

CREATE VIEW saas_active_user AS
 SELECT u.id user_id,u.tenant_id,t.kind,EXISTS(SELECT 1 FROM tenant_administrator a WHERE a.user_id=u.id AND a.tenant_id=t.id) administrator
 FROM app_user u JOIN tenant t ON t.id=u.tenant_id WHERE u.status='active' AND t.enabled;

CREATE VIEW saas_active_grant_permission AS
 SELECT g.id grant_id,g.user_id,u.tenant_id,u.kind,rp.permission_code,rp.client
 FROM member_grant g JOIN saas_active_user u ON u.user_id=g.user_id
 JOIN app_role r ON r.id=g.role_id AND r.tenant_id=u.tenant_id AND r.enabled
 JOIN role_permission rp ON rp.role_id=r.id
 WHERE g.valid_from<=statement_timestamp() AND (g.valid_until IS NULL OR statement_timestamp()<g.valid_until)
 UNION
 SELECT g.id,g.user_id,u.tenant_id,u.kind,rp.permission_code,rp.client
 FROM member_grant g JOIN saas_active_user u ON u.user_id=g.user_id AND u.kind='enterprise'
 JOIN role_template r ON r.id=g.template_id AND r.enabled
 JOIN role_template_permission rp ON rp.template_id=r.id
 WHERE g.valid_from<=statement_timestamp() AND (g.valid_until IS NULL OR statement_timestamp()<g.valid_until)
 AND EXISTS(SELECT 1 FROM tenant_package tp JOIN permission_package p ON p.id=tp.package_id AND p.enabled JOIN permission_package_template pt ON pt.package_id=p.id WHERE tp.tenant_id=u.tenant_id AND pt.template_id=r.id);

CREATE VIEW saas_member_capability AS
 SELECT DISTINCT g.grant_id,g.user_id,g.tenant_id,g.kind,g.client,g.permission_code,p.resource_scope,p.operation_kind
 FROM saas_active_grant_permission g JOIN permission p ON p.code=g.permission_code AND p.implemented
 WHERE EXISTS(SELECT 1 FROM saas_enabled_menu m WHERE m.client=g.client AND m.permission_code=g.permission_code AND
   ((g.kind='platform' AND m.side IN ('platform','both')) OR
    (g.kind='enterprise' AND EXISTS(SELECT 1 FROM saas_tenant_menu tm WHERE tm.tenant_id=g.tenant_id AND tm.menu_id=m.id))))
 UNION
 SELECT DISTINCT NULL::bigint,u.user_id,u.tenant_id,u.kind,m.client,m.permission_code,p.resource_scope,p.operation_kind
 FROM saas_active_user u JOIN saas_enabled_menu m ON true JOIN permission p ON p.code=m.permission_code AND p.implemented
 WHERE u.administrator AND ((u.kind='platform' AND m.side IN ('platform','both')) OR
  (u.kind='enterprise' AND EXISTS(SELECT 1 FROM saas_tenant_menu tm WHERE tm.tenant_id=u.tenant_id AND tm.menu_id=m.id)));

CREATE VIEW saas_effective_station_permission AS
 SELECT DISTINCT c.user_id,s.id station_id,c.permission_code,c.client
 FROM saas_member_capability c JOIN station s ON s.tenant_id=c.tenant_id
 WHERE c.kind='enterprise' AND c.resource_scope='station' AND
  (c.grant_id IS NULL OR EXISTS(SELECT 1 FROM member_grant_station gs WHERE gs.grant_id=c.grant_id AND gs.station_id=s.id))
 UNION
 SELECT DISTINCT c.user_id,s.id,c.permission_code,c.client
 FROM saas_member_capability c JOIN station s ON true JOIN tenant t ON t.id=s.tenant_id AND t.enabled
 WHERE c.kind='platform' AND c.resource_scope='station' AND
  EXISTS(SELECT 1 FROM saas_member_capability cross_read WHERE cross_read.user_id=c.user_id AND cross_read.client=c.client AND cross_read.permission_code='tenant.data.read')
  AND (c.operation_kind='read' OR EXISTS(SELECT 1 FROM saas_member_capability cross_write WHERE cross_write.user_id=c.user_id AND cross_write.client=c.client AND cross_write.permission_code='tenant.data.write'));

CREATE VIEW saas_effective_tenant_permission AS
 SELECT DISTINCT user_id,tenant_id,permission_code,client FROM saas_member_capability WHERE resource_scope='tenant';
CREATE VIEW saas_effective_permission AS
 SELECT user_id,permission_code,client FROM saas_effective_tenant_permission
 UNION SELECT user_id,permission_code,client FROM saas_effective_station_permission;
GRANT SELECT ON saas_enabled_menu,saas_tenant_menu,saas_active_user,saas_active_grant_permission,saas_member_capability,saas_effective_station_permission,saas_effective_tenant_permission,saas_effective_permission TO ems_proto_app;
