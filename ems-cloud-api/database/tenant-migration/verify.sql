-- Read-only deployment reconciliation; application data and raw credentials are not emitted.
SELECT 'legacy_entities_absent',to_regclass('organization') IS NULL AND to_regclass('customer') IS NULL;
SELECT 'unowned_users',count(*) FROM app_user WHERE tenant_id IS NULL;
SELECT 'unowned_stations',count(*) FROM station WHERE tenant_id IS NULL;
SELECT 'cross_tenant_grant_roles',count(*) FROM member_grant g JOIN app_role r ON r.id=g.role_id JOIN app_user u ON u.id=g.user_id WHERE r.tenant_id<>u.tenant_id;
SELECT 'cross_tenant_grant_stations',count(*) FROM member_grant_station gs JOIN member_grant g ON g.id=gs.grant_id JOIN app_user u ON u.id=g.user_id JOIN station s ON s.id=gs.station_id WHERE u.tenant_id<>s.tenant_id;
SELECT 'invalid_managers',count(*) FROM station s JOIN app_user u ON u.id=s.manager_id WHERE u.tenant_id<>s.tenant_id OR u.status<>'active';
SELECT 'invalid_contracts',count(*) FROM settlement_record r JOIN contract c ON c.id=r.contract_id JOIN station s ON s.id=r.station_id WHERE c.tenant_id<>s.tenant_id;
SELECT 'companies_without_assigned_package',count(*) FROM company_profile c WHERE NOT EXISTS(SELECT 1 FROM tenant_package p WHERE p.tenant_id=c.tenant_id);
SELECT 'stations',count(*) FROM station;
SELECT 'devices',count(*) FROM device;
SELECT 'measurement_points',count(*) FROM measurement_point;
SELECT 'ems_binding_periods',count(*) FROM ems_binding_period;
