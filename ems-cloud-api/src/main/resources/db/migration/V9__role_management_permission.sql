-- Register the implemented configuration capability, without assigning any role or member.
-- Governance initialization is a separate explicit operational choice.
INSERT INTO permission(code,name) VALUES('role.manage','配置角色权限')
 ON CONFLICT (code) DO NOTHING;
