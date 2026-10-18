DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V45 requires isolated toyingzhen database and owner';
 END IF;
END $$;
CREATE TABLE station_wiring_diagram (
 station_id bigint PRIMARY KEY REFERENCES station(id) ON DELETE RESTRICT,
 graph jsonb NOT NULL CHECK(jsonb_typeof(graph)='object'),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_by bigint NOT NULL
);
COMMENT ON TABLE station_wiring_diagram IS 'Presentation diagram only; saving never changes physical topology or sends commands.';
