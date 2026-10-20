DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN RAISE EXCEPTION 'V65 isolated database required'; END IF;
END $$;
ALTER TABLE station_history_mock_dataset DROP CONSTRAINT station_history_mock_dataset_period_check;
ALTER TABLE station_history_mock_dataset ADD CONSTRAINT station_history_mock_dataset_period_check CHECK(period IN ('day','week','month','year','total'));
CREATE TABLE station_dashboard_history_template (
 id uuid PRIMARY KEY,
 station_id bigint NOT NULL REFERENCES station(id),
 actor_id bigint NOT NULL REFERENCES app_user(id),
 name varchar(60) NOT NULL CHECK(length(trim(name))>0),
 scene varchar(16) NOT NULL CHECK(scene IN ('overall','solar','storage','grid')),
 fields jsonb NOT NULL CHECK(jsonb_typeof(fields)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(station_id,actor_id,scene,name)
);
