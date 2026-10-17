DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V34 requires isolated database and owner';
 END IF;
END $$;
CREATE TABLE monitor_layout (
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 user_id bigint NOT NULL REFERENCES app_user(id),
 scope varchar(36) NOT NULL,
 template_id uuid,
 widgets jsonb NOT NULL CHECK(jsonb_typeof(widgets)='array' AND jsonb_array_length(widgets) BETWEEN 1 AND 13),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 PRIMARY KEY(tenant_id,user_id,scope),
 CHECK((template_id IS NULL AND scope='default') OR (template_id IS NOT NULL AND scope=template_id::text)),
 FOREIGN KEY(tenant_id,user_id,template_id) REFERENCES monitor_template(tenant_id,user_id,id) ON DELETE CASCADE
);
COMMENT ON TABLE monitor_layout IS 'Personal 12-column widget geometry, scoped to tenant and user. Version zero means not yet saved.';
