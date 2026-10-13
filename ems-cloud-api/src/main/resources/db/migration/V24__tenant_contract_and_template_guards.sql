CREATE FUNCTION saas_contract_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
  RAISE EXCEPTION 'contract tenant immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER contract_tenant_identity BEFORE UPDATE OF tenant_id ON contract FOR EACH ROW EXECUTE FUNCTION saas_contract_identity_guard();
CREATE FUNCTION saas_template_permission_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(
  WITH RECURSIVE tree AS(
   SELECT id,parent_id,client,permission_code,applicable_side side FROM menu WHERE parent_id IS NULL
   UNION ALL SELECT m.id,m.parent_id,m.client,m.permission_code,t.side FROM menu m JOIN tree t ON t.id=m.parent_id
  ) SELECT 1 FROM tree JOIN permission p ON p.code=tree.permission_code AND p.implemented
    WHERE tree.permission_code=NEW.permission_code AND tree.client=NEW.client AND tree.side IN ('enterprise','both')
 ) THEN RAISE EXCEPTION 'template permission requires implemented enterprise menu' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER template_permission_guard BEFORE INSERT OR UPDATE ON role_template_permission FOR EACH ROW EXECUTE FUNCTION saas_template_permission_guard();
