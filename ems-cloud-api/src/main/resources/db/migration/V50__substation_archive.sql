DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V50 requires isolated toyingzhen database and owner';
 END IF;
END $$;
ALTER TABLE substation ADD COLUMN archived_at timestamptz, ADD COLUMN archived_by bigint REFERENCES app_user(id);
DROP INDEX substation_name;
CREATE UNIQUE INDEX substation_name ON substation(station_id,lower(name)) WHERE archived_at IS NULL;
CREATE TABLE substation_device_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 substation_id uuid NOT NULL,
 station_id bigint NOT NULL,
 device_id bigint NOT NULL REFERENCES device(id) ON DELETE RESTRICT,
 linked_at timestamptz NOT NULL,
 archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 archived_by bigint NOT NULL REFERENCES app_user(id),
 FOREIGN KEY(station_id,substation_id) REFERENCES substation(station_id,id) ON DELETE RESTRICT
);
COMMENT ON TABLE substation_device_history IS 'Membership snapshot when a child is archived; canonical devices and telemetry remain intact.';
