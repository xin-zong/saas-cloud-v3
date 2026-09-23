-- One-time import. Run under database/apply.sql's transaction/advisory lock.
-- Legacy relations remain untouched for coordinated application cutover/rollback.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM member_grant) OR EXISTS (SELECT 1 FROM app_role WHERE organization_id IS NOT NULL) THEN
  RAISE EXCEPTION 'V7 requires an unused grant model; reconcile existing new-model data before migration';
 END IF;
END $$;
LOCK TABLE app_user,app_role,user_role,user_station,role_permission IN SHARE ROW EXCLUSIVE MODE;
UPDATE app_user SET management_organization_id=organization_id;

CREATE TEMP TABLE v7_role_map ON COMMIT DROP AS
 SELECT DISTINCT r.id old_role_id,u.organization_id,
  (CASE WHEN r.code IN ('owner','operator','integrator') THEN r.code ELSE 'legacy' END
   ||'__o'||coalesce(u.organization_id::text,'null')||'__r'||r.id::text) new_code
 FROM user_role ur JOIN app_user u ON u.id=ur.user_id JOIN app_role r ON r.id=ur.role_id;
INSERT INTO app_role(code,name,organization_id,description)
 SELECT m.new_code,left(btrim(r.name),80)||' [历史角色 '||r.id::text||']',m.organization_id,
  '历史授权迁移；原角色代码：'||r.code||'；原始定义保留为只读基线'
 FROM v7_role_map m JOIN app_role r ON r.id=m.old_role_id;
INSERT INTO role_permission(role_id,permission_code)
 SELECT n.id,p.permission_code FROM v7_role_map m JOIN app_role n ON n.code=m.new_code
 JOIN role_permission p ON p.role_id=m.old_role_id;

-- Explicit semantic split only: these capabilities already existed under coarse codes.
-- Catalog availability remains a runtime/editor concern until each endpoint switches.
INSERT INTO permission(code,name) VALUES
 ('customer.read','查看客户'),('customer.manage','管理客户'),('device.health.read','查看设备健康'),
 ('workorder.create','新建工单'),('workorder.edit','编辑工单'),('workorder.handle','处理工单'),
 ('organization.member.read','查看组织与成员'),('organization.manage','管理组织'),
 ('member.manage.profile','管理成员'),('member.grant.manage','分配成员权限')
 ON CONFLICT (code) DO NOTHING;
INSERT INTO role_permission(role_id,permission_code)
 SELECT DISTINCT n.id,x.new_code FROM v7_role_map m JOIN app_role n ON n.code=m.new_code
 JOIN role_permission p ON p.role_id=m.old_role_id
 JOIN (VALUES ('asset.read','customer.read'),('asset.read','device.health.read'),
 ('workorder.manage','workorder.create'),('workorder.manage','workorder.edit'),('workorder.manage','workorder.handle'),
 ('member.manage','organization.member.read'),('member.manage','organization.manage'),
 ('member.manage','member.manage.profile'),('member.manage','member.grant.manage')) x(old_code,new_code)
 ON x.old_code=p.permission_code
 ON CONFLICT DO NOTHING;
INSERT INTO member_grant(user_id,role_id,valid_from,valid_until,granted_by)
 SELECT ur.user_id,n.id,CURRENT_TIMESTAMP,NULL,NULL
 FROM user_role ur JOIN app_user u ON u.id=ur.user_id
 JOIN v7_role_map m ON m.old_role_id=ur.role_id AND m.organization_id IS NOT DISTINCT FROM u.organization_id
 JOIN app_role n ON n.code=m.new_code;
INSERT INTO member_grant_station(grant_id,station_id)
 SELECT g.id,s.station_id FROM member_grant g JOIN user_station s ON s.user_id=g.user_id;

-- asset.edit AND member.manage may come from DIFFERENT old roles. Never add
-- customer.manage to a shared role: members who hold only one side must not gain it.
CREATE TEMP TABLE v7_customer_users ON COMMIT DROP AS
 SELECT u.id,u.organization_id FROM app_user u
 WHERE EXISTS (SELECT 1 FROM user_role ur JOIN role_permission rp ON rp.role_id=ur.role_id
 WHERE ur.user_id=u.id AND rp.permission_code='asset.edit')
 AND EXISTS (SELECT 1 FROM user_role ur JOIN role_permission rp ON rp.role_id=ur.role_id
 WHERE ur.user_id=u.id AND rp.permission_code='member.manage');
INSERT INTO app_role(code,name,organization_id,description)
 SELECT 'customer__u'||id::text,'历史客户管理 [成员 '||id::text||']',organization_id,
  '仅保留该成员历史 asset.edit AND member.manage 联合能力；客户全部站点及组织分支检查仍由服务端执行'
 FROM v7_customer_users;
INSERT INTO role_permission(role_id,permission_code)
 SELECT r.id,'customer.manage' FROM v7_customer_users u JOIN app_role r ON r.code='customer__u'||u.id::text;
WITH inserted AS (
 INSERT INTO member_grant(user_id,role_id,valid_from,valid_until,granted_by)
 SELECT u.id,r.id,CURRENT_TIMESTAMP,NULL,NULL FROM v7_customer_users u JOIN app_role r ON r.code='customer__u'||u.id::text
 RETURNING id,user_id
)
INSERT INTO member_grant_station(grant_id,station_id)
 SELECT g.id,s.station_id FROM inserted g JOIN user_station s ON s.user_id=g.user_id;

-- Frozen T01 available subset of the eight prototype definitions; desired full
-- definitions (including pending entries) live in permission-role-templates.json.
-- These roles are definitions only and receive NO user/member_grant assignment.
CREATE TEMP TABLE v7_templates(code text,name text,description text,permissions text[]) ON COMMIT DROP;
INSERT INTO v7_templates VALUES
 ('owner','项目业主 / 资产方','查看资产、运营收益与分析报告',ARRAY['asset.read','revenue.read','strategy.read','alarm.read','workorder.read','report.export']),
 ('pmo','项目管理方 / 项目公司','项目计划、站点管理与运营协作',ARRAY['asset.read','revenue.read','strategy.read','alarm.read','workorder.read','asset.edit','approval.review']),
 ('ems','EMS 运行管理方','查看站点与收益、编辑运行方案、查询数据、生成报告',ARRAY['asset.read','revenue.read','strategy.read','alarm.read','workorder.read','strategy.manage']),
 ('om','运维服务方','站点运维、设备健康、告警与工单处理',ARRAY['asset.read','strategy.read','alarm.read','alarm.handle','workorder.read','approval.review','report.export']),
 ('epc','EPC / 系统集成方','站点建设与系统集成',ARRAY['asset.read','asset.edit','strategy.read','workorder.read']),
 ('vendor','设备厂家','设备诊断与固件服务',ARRAY['asset.read','alarm.read','workorder.read']),
 ('platform','平台治理方','客户、组织、权限与安全审计治理',ARRAY['asset.read','asset.edit','revenue.read','strategy.read','strategy.manage','alarm.read','alarm.handle','workorder.read','approval.review','report.export','audit.read']),
 ('readonly','只读观察员','查看授权站点的数据，不执行修改和控制',ARRAY['asset.read','revenue.read','strategy.read','alarm.read','workorder.read']);
INSERT INTO app_role(code,name,organization_id,description)
 SELECT 'template_'||t.code||'__o'||o.id::text,t.name,o.id,
 t.description||'；原型中未实现权限保持待接入，完整定义见 permission-role-templates.json；不自动分配'
 FROM organization o CROSS JOIN v7_templates t;
INSERT INTO role_permission(role_id,permission_code)
 SELECT r.id,p.code FROM organization o CROSS JOIN v7_templates t
 JOIN LATERAL unnest(t.permissions) p(code) ON true
 JOIN app_role r ON r.code='template_'||t.code||'__o'||o.id::text;
