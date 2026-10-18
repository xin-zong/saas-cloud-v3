DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V43 requires isolated toyingzhen database and owner';
 END IF;
END $$;
CREATE TABLE substation (
 id uuid PRIMARY KEY,
 station_id bigint NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
 name varchar(50) NOT NULL CHECK(name=btrim(name) AND char_length(name) BETWEEN 1 AND 50),
 configuration jsonb NOT NULL CHECK(jsonb_typeof(configuration)='object'),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 created_by bigint NOT NULL REFERENCES app_user(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(station_id,id)
);
CREATE UNIQUE INDEX substation_name ON substation(station_id,lower(name));
CREATE TABLE substation_device (
 device_id bigint PRIMARY KEY REFERENCES device(id) ON DELETE RESTRICT,
 station_id bigint NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
 substation_id uuid NOT NULL,
 created_by bigint NOT NULL REFERENCES app_user(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(station_id,substation_id) REFERENCES substation(station_id,id) ON DELETE RESTRICT
);
CREATE INDEX substation_device_parent ON substation_device(station_id,substation_id);
CREATE FUNCTION substation_device_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_station bigint;
BEGIN
 SELECT station_id INTO owner_station FROM device WHERE id=NEW.device_id FOR UPDATE;
 IF owner_station IS DISTINCT FROM NEW.station_id THEN
  RAISE EXCEPTION 'substation device must belong to parent station' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER substation_device_guard BEFORE INSERT OR UPDATE ON substation_device FOR EACH ROW EXECUTE FUNCTION substation_device_guard();
CREATE FUNCTION substation_device_move_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.station_id IS DISTINCT FROM OLD.station_id AND EXISTS(SELECT 1 FROM substation_device WHERE device_id=OLD.id) THEN
  RAISE EXCEPTION 'unlink substation before changing canonical station' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER substation_device_move_guard BEFORE UPDATE OF station_id ON device FOR EACH ROW EXECUTE FUNCTION substation_device_move_guard();
COMMENT ON TABLE substation IS 'Distinct child station; inherits current parent permissions. No parent/child energy aggregation implied. Unknown capacity limits stay unknown.';
COMMENT ON TABLE substation_device IS 'Exclusive child membership, independent of station spaces; canonical device.station_id is retained.';
