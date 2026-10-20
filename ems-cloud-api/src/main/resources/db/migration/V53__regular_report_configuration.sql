DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V53 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
 END IF;
END $$;
-- Personal configuration only. No generated result, schedule runner, or external delivery.
CREATE TABLE regular_report_config (
 id uuid PRIMARY KEY,
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 user_id bigint NOT NULL REFERENCES app_user(id),
 category text NOT NULL CHECK(category IN ('template','task')),
 name varchar(50) NOT NULL CHECK(name=btrim(name) AND char_length(name)>0),
 report_type text NOT NULL CHECK(report_type IN ('daily','monthly','yearly','total')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX regular_report_config_name ON regular_report_config(tenant_id,user_id,category,lower(name));
