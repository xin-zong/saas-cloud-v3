DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN RAISE EXCEPTION 'V49 requires isolated toyingzhen database'; END IF;
END $$;
CREATE TABLE station_display_settings(station_id bigint PRIMARY KEY REFERENCES station(id), power_factor_visible boolean, revenue_visible boolean, version bigint NOT NULL CHECK(version>0), updated_at timestamptz NOT NULL DEFAULT now());
