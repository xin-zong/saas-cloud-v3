DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V69 isolated database required';
 END IF;
END $$;

CREATE TABLE agent_resource_owner (
 resource_kind varchar(16) NOT NULL CHECK(resource_kind IN ('conversation','attachment')),
 resource_id varchar(160) NOT NULL CHECK(resource_id ~ '^[a-zA-Z0-9_-]{1,160}$'),
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 user_id bigint NOT NULL REFERENCES app_user(id),
 client varchar(3) NOT NULL CHECK(client IN ('web','app')),
 station_scope text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(resource_kind,resource_id)
);
CREATE INDEX agent_resource_owner_actor_idx ON agent_resource_owner(tenant_id,user_id,client);
