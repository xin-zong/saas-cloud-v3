-- This migration is exclusive to the isolated develop-toyingzhen database.
DO $$ BEGIN
 IF current_database() <> 'ems_cloud_saas_toyingzhen' OR current_user <> 'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V27 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
 END IF;
END $$;
CREATE TABLE monitor_template (
 id uuid PRIMARY KEY,
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 user_id bigint NOT NULL REFERENCES app_user(id),
 name varchar(50) NOT NULL CHECK(name=btrim(name) AND char_length(name) BETWEEN 1 AND 50),
 cards text[] NOT NULL CHECK(cardinality(cards) BETWEEN 1 AND 13 AND array_position(cards,NULL) IS NULL
  AND cards <@ ARRAY['站点运营概况','在线运行容量','能源供应与构成','建站与接入进度','设备接入概况','交付就绪度','储能充放趋势','社会与环境效益','收益概览','当班处置态势','运行健康','异常与告警实时监控','子系统可用性与出力']::text[]),
 pinned boolean NOT NULL DEFAULT false,
 sort_order bigint NOT NULL CHECK(sort_order>0),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(tenant_id,user_id,id)
);
CREATE UNIQUE INDEX monitor_template_personal_name ON monitor_template(tenant_id,user_id,lower(name));
CREATE TABLE monitor_template_selection (
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 user_id bigint NOT NULL REFERENCES app_user(id),
 template_id uuid,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id,template_id) REFERENCES monitor_template(tenant_id,user_id,id)
);
