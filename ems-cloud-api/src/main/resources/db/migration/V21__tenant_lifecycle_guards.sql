-- Approval creates the protected administrator before activation.
CREATE OR REPLACE FUNCTION saas_relation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner bigint;other bigint;side text;
BEGIN
 PERFORM pg_advisory_xact_lock(78291002);
 IF TG_TABLE_NAME='tenant_administrator' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'protected administrator' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'administrator transfer unavailable' USING ERRCODE='23514'; END IF;
  SELECT tenant_id INTO owner FROM app_user WHERE id=NEW.user_id AND status IN ('active','invited');
  IF owner IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'administrator tenant or status' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME IN ('app_user','app_role','station') THEN
  IF TG_OP='DELETE' THEN
   IF TG_TABLE_NAME='app_user' AND EXISTS(SELECT 1 FROM tenant_administrator WHERE user_id=OLD.id) THEN RAISE EXCEPTION 'protected administrator' USING ERRCODE='23514'; END IF;
   RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND OLD.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'tenant immutable' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='app_user' THEN
   IF NEW.status<>'active' AND EXISTS(SELECT 1 FROM tenant_administrator WHERE user_id=NEW.id) THEN RAISE EXCEPTION 'protected administrator' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_TABLE_NAME='station' AND NEW.tenant_id IS NOT NULL THEN
   SELECT kind INTO side FROM tenant WHERE id=NEW.tenant_id;
   IF side<>'enterprise' THEN RAISE EXCEPTION 'station requires enterprise' USING ERRCODE='23514'; END IF;
   IF NEW.manager_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_user WHERE id=NEW.manager_id AND tenant_id=NEW.tenant_id AND status='active') THEN RAISE EXCEPTION 'station manager tenant or status' USING ERRCODE='23514'; END IF;
  END IF;
 ELSIF TG_TABLE_NAME='company_profile' THEN
  IF NOT EXISTS(SELECT 1 FROM tenant WHERE id=NEW.tenant_id AND kind='enterprise') THEN RAISE EXCEPTION 'company requires enterprise' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='member_grant' THEN
  SELECT tenant_id INTO owner FROM app_user WHERE id=NEW.user_id;
  IF owner IS NULL THEN RETURN NEW; END IF; -- expand phase only, NOT an authorization bypass
  IF NEW.role_id IS NOT NULL THEN
   SELECT tenant_id INTO other FROM app_role WHERE id=NEW.role_id;
   IF owner IS DISTINCT FROM other THEN RAISE EXCEPTION 'grant role tenant' USING ERRCODE='23514'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM tenant_package tp JOIN permission_package_template pt ON pt.package_id=tp.package_id JOIN permission_package p ON p.id=tp.package_id JOIN role_template r ON r.id=pt.template_id WHERE tp.tenant_id=owner AND r.id=NEW.template_id AND p.enabled AND r.enabled) THEN RAISE EXCEPTION 'template unavailable to tenant' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM member_grant_station gs JOIN station s ON s.id=gs.station_id WHERE gs.grant_id=NEW.id AND s.tenant_id IS DISTINCT FROM owner) THEN RAISE EXCEPTION 'grant station tenant' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='member_grant_station' THEN
  SELECT u.tenant_id INTO owner FROM member_grant g JOIN app_user u ON u.id=g.user_id WHERE g.id=NEW.grant_id;
  SELECT tenant_id INTO other FROM station WHERE id=NEW.station_id;
  IF owner IS DISTINCT FROM other THEN RAISE EXCEPTION 'grant station tenant' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='permission_package_menu' THEN
  IF NOT EXISTS(SELECT 1 FROM menu WHERE id=NEW.menu_id AND parent_id IS NULL AND applicable_side IN ('enterprise','both')) THEN RAISE EXCEPTION 'package requires enterprise root' USING ERRCODE='23514'; END IF;
 ELSIF TG_TABLE_NAME='tenant_package' THEN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'replace package through transaction' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM tenant_package WHERE tenant_id=OLD.tenant_id AND package_id<>OLD.package_id) THEN RAISE EXCEPTION 'last tenant package' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TABLE application_company_tag(application_id bigint REFERENCES company_application(id),tag_id bigint REFERENCES company_tag(id) ON DELETE CASCADE,PRIMARY KEY(application_id,tag_id));
CREATE FUNCTION saas_company_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE company bigint;
BEGIN
 company=CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
 IF EXISTS(SELECT 1 FROM company_profile WHERE tenant_id=company) AND NOT EXISTS(SELECT 1 FROM tenant_package WHERE tenant_id=company) THEN RAISE EXCEPTION 'enterprise requires an assigned package' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER company_package_required AFTER INSERT OR UPDATE ON company_profile DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION saas_company_package_guard();
CREATE CONSTRAINT TRIGGER package_assignment_required AFTER INSERT OR UPDATE OR DELETE ON tenant_package DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION saas_company_package_guard();
GRANT SELECT,INSERT,UPDATE,DELETE ON application_company_tag TO ems_proto_app;
