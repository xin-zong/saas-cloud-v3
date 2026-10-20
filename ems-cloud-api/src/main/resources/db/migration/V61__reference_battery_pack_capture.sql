DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V61 requires isolated database and owner';
 END IF;
END $$;
CREATE TABLE reference_battery_pack_capture (
 connection_node_id bigint PRIMARY KEY REFERENCES station_reference_connection_node(id) ON DELETE CASCADE,
 parent_device_id bigint NOT NULL REFERENCES device(id),
 parent_serial_number text NOT NULL,
 base_sn text NOT NULL,
 cell_count integer NOT NULL CHECK(cell_count BETWEEN 1 AND 10000),
 parent_sensor text NOT NULL CHECK(length(parent_sensor) BETWEEN 1 AND 120),
 source_at timestamptz NOT NULL,
 captured_at timestamptz NOT NULL CHECK(captured_at>=source_at),
 source_url text NOT NULL CHECK(source_url LIKE 'https://ess-cloud-login.qudeox.com/%'),
 evidence_sha256 char(64) NOT NULL CHECK(evidence_sha256~'^[0-9a-f]{64}$')
);
COMMENT ON TABLE reference_battery_pack_capture IS 'Reviewed pack base fields from private screen evidence. Values are captured observations, never live connectivity or control.';
