DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V54 requires isolated toyingzhen database and owner';
 END IF;
END $$;
-- Explicit interval energy, never a difference of cumulative meter readings.
-- No reference business rows or fabricated month history are inserted.
CREATE TABLE device_meter_tou (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 device_id bigint NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
 dataset_id text NOT NULL CHECK(btrim(dataset_id)<>''),
 dataset_version integer NOT NULL CHECK(dataset_version>0),
 local_date date NOT NULL,timezone text NOT NULL CHECK(btrim(timezone)<>''),
 direction text NOT NULL CHECK(direction IN ('positive','negative')),
 interval_index integer NOT NULL CHECK(interval_index BETWEEN 0 AND 95),
 energy_kwh numeric(30,8) CHECK(energy_kwh>=0),
 quality text NOT NULL CHECK(quality IN ('valid','invalid','missing')),
 source_time timestamptz NOT NULL,mocked boolean NOT NULL DEFAULT true CHECK(mocked),
 active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(quality<>'valid' OR energy_kwh IS NOT NULL),
 UNIQUE(device_id,dataset_id,dataset_version,local_date,timezone,direction,interval_index)
);
CREATE UNIQUE INDEX device_meter_tou_active_cell ON device_meter_tou(device_id,local_date,timezone,direction,interval_index) WHERE active;
CREATE INDEX device_meter_tou_month ON device_meter_tou(device_id,local_date,direction) WHERE active;
COMMENT ON TABLE device_meter_tou IS 'Isolated versioned mock 15-minute interval energy read model. No canonical telemetry or inferred counter differences.';
