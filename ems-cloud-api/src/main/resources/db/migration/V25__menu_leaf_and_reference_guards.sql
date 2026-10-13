-- Actions are leaves. Delete only unreferenced leaves; serialize with configuration writes.
CREATE FUNCTION saas_menu_leaf_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(78291002);
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM menu WHERE parent_id=OLD.id)
    OR EXISTS(SELECT 1 FROM permission_package_menu WHERE menu_id=OLD.id)
    OR EXISTS(SELECT 1 FROM role_permission WHERE permission_code=OLD.permission_code AND client=OLD.client)
    OR EXISTS(SELECT 1 FROM role_template_permission WHERE permission_code=OLD.permission_code AND client=OLD.client)
  THEN RAISE EXCEPTION 'menu has children or permission references' USING ERRCODE='23514'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.kind='action' AND EXISTS(SELECT 1 FROM menu WHERE parent_id=NEW.id)
   OR EXISTS(SELECT 1 FROM menu WHERE id=NEW.parent_id AND kind='action')
 THEN RAISE EXCEPTION 'action must be a leaf' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER menu_leaf_guard BEFORE INSERT OR UPDATE OR DELETE ON menu
 FOR EACH ROW EXECUTE FUNCTION saas_menu_leaf_guard();
