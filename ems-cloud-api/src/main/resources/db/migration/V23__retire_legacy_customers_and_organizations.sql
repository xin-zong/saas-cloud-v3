-- Apply only after the reviewed tenant backfill and coordinated API/UI cutover.
-- No CASCADE: an unexpected dependency must abort the transaction.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM app_user WHERE tenant_id IS NULL) OR EXISTS(SELECT 1 FROM station WHERE tenant_id IS NULL) THEN
  RAISE EXCEPTION 'tenant backfill incomplete';
 END IF;
 IF EXISTS(SELECT 1 FROM member_grant g JOIN app_role r ON r.id=g.role_id WHERE r.tenant_id IS NULL) THEN
  RAISE EXCEPTION 'legacy role grants remain';
 END IF;
END $$;
DROP VIEW effective_permission;
DROP VIEW effective_station_permission;
DROP VIEW effective_organization_permission;
DROP VIEW active_member_grant;
DROP TRIGGER station_customer_ownership ON station;
DROP TRIGGER customer_station_ownership ON customer;
DROP TRIGGER organization_customer_ownership ON organization;
DROP FUNCTION check_customer_station_ownership();
DROP TABLE user_role;
DROP TABLE user_station;
DELETE FROM app_role WHERE tenant_id IS NULL;
ALTER TABLE app_role DROP COLUMN organization_id,ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE station DROP COLUMN customer_id,DROP COLUMN organization_id;
ALTER TABLE app_user DROP COLUMN organization_id,DROP COLUMN management_organization_id,DROP COLUMN email,DROP COLUMN enabled;
ALTER TABLE contract ADD COLUMN tenant_id bigint REFERENCES company_profile(tenant_id);
DO $$ BEGIN
 IF EXISTS(SELECT r.contract_id FROM settlement_record r JOIN station s ON s.id=r.station_id GROUP BY r.contract_id HAVING count(DISTINCT s.tenant_id)>1) THEN
  RAISE EXCEPTION 'contract spans tenants; explicit reconciliation required';
 END IF;
END $$;
UPDATE contract c SET tenant_id=(SELECT min(s.tenant_id) FROM settlement_record r JOIN station s ON s.id=r.station_id WHERE r.contract_id=c.id);
-- The approved initial mapping places all legacy business in the sole demo enterprise.
UPDATE contract SET tenant_id=(SELECT min(tenant_id) FROM company_profile HAVING count(*)=1) WHERE tenant_id IS NULL;
ALTER TABLE contract ALTER COLUMN tenant_id SET NOT NULL,DROP COLUMN customer_id;
DROP TABLE customer;
DROP TABLE organization;
DROP FUNCTION check_organization_cycle();
DELETE FROM permission WHERE code IN ('customer.read','customer.manage','organization.member.read','organization.manage','member.manage.profile','member.grant.manage','role.manage','member.manage');
ALTER TABLE app_user ADD CONSTRAINT normalized_login_email CHECK(account=lower(btrim(account)) AND account~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
CREATE UNIQUE INDEX app_user_normalized_email ON app_user(lower(btrim(account)));
-- A direct SQL disable must also perform responsibility transfer first.
CREATE FUNCTION saas_member_responsibility_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(78291002);
 IF NEW.status<>'active' AND EXISTS(SELECT 1 FROM station WHERE manager_id=NEW.id) THEN
  RAISE EXCEPTION 'transfer station responsibilities before disabling member' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_responsibility_guard BEFORE UPDATE OF status ON app_user FOR EACH ROW EXECUTE FUNCTION saas_member_responsibility_guard();
CREATE FUNCTION saas_settlement_tenant_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (SELECT tenant_id FROM station WHERE id=NEW.station_id) IS DISTINCT FROM (SELECT tenant_id FROM contract WHERE id=NEW.contract_id) THEN
  RAISE EXCEPTION 'settlement contract tenant mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER settlement_tenant_guard BEFORE INSERT OR UPDATE ON settlement_record FOR EACH ROW EXECUTE FUNCTION saas_settlement_tenant_guard();
