DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V51 requires isolated toyingzhen database and owner';
 END IF;
END $$;
CREATE TABLE station_dashboard_read_model (
 station_id bigint NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
 dataset_id text NOT NULL,
 dataset_version integer NOT NULL CHECK(dataset_version>0),
 source_time timestamptz NOT NULL,
 mocked boolean NOT NULL DEFAULT true CHECK(mocked),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(station_id,dataset_id,dataset_version)
);
CREATE UNIQUE INDEX station_dashboard_active ON station_dashboard_read_model(station_id) WHERE active;
COMMENT ON TABLE station_dashboard_read_model IS 'Isolated versioned mock page data; never canonical telemetry or remote control state.';
