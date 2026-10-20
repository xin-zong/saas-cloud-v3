CREATE TABLE agent_resource_owner (
 resource_kind varchar(16) NOT NULL CHECK(resource_kind IN ('conversation','attachment')),
 resource_id varchar(160) NOT NULL CHECK(resource_id ~ '^[a-zA-Z0-9_-]{1,160}$'),
 tenant_id bigint NOT NULL REFERENCES tenant(id),
 user_id bigint NOT NULL REFERENCES app_user(id),
 client varchar(3) NOT NULL CHECK(client IN ('web','app')),
 PRIMARY KEY(resource_kind,resource_id)
);
CREATE INDEX agent_resource_owner_actor_idx ON agent_resource_owner(tenant_id,user_id,client);
CREATE TABLE agent_resource_station (
 resource_kind varchar(16) NOT NULL,
 resource_id varchar(160) NOT NULL,
 station_id bigint NOT NULL REFERENCES station(id),
 PRIMARY KEY(resource_kind,resource_id,station_id),
 FOREIGN KEY(resource_kind,resource_id) REFERENCES agent_resource_owner(resource_kind,resource_id) ON DELETE CASCADE
);
