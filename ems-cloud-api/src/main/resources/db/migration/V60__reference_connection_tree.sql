DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V60 requires isolated database and owner';
 END IF;
END $$;
CREATE TABLE station_reference_connection_node (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 station_id bigint NOT NULL REFERENCES station(id),
 source_station_id text NOT NULL,
 serial_number text NOT NULL CHECK(length(serial_number) BETWEEN 1 AND 120),
 source_type text NOT NULL,
 parent_serial_number text,
 sort_order integer NOT NULL CHECK(sort_order>=0),
 source_url text NOT NULL,
 captured_at timestamptz NOT NULL,
 observed_at timestamptz,
 observed_status text NOT NULL CHECK(observed_status IN ('online','offline','unknown')),
 UNIQUE(station_id,serial_number),
 UNIQUE(station_id,sort_order) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(station_id,parent_serial_number) REFERENCES station_reference_connection_node(station_id,serial_number) DEFERRABLE INITIALLY DEFERRED,
 CHECK(parent_serial_number IS DISTINCT FROM serial_number),
 CHECK(observed_at IS NULL OR observed_at<=captured_at)
);
COMMENT ON TABLE station_reference_connection_node IS 'Verified ordered reference tree evidence, not device inventory or live telemetry. Parent edges are explicit captured DOM hierarchy.';
