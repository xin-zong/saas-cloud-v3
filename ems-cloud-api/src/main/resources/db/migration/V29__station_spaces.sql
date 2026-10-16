DO $$ BEGIN
  IF current_database() <> 'ems_cloud_saas_toyingzhen' OR current_user <> 'ems_toyingzhen_owner' THEN
    RAISE EXCEPTION 'V29 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
  END IF;
END $$;

CREATE TABLE station_space (
  id uuid PRIMARY KEY,
  station_id bigint NOT NULL REFERENCES station(id) ON DELETE CASCADE,
  parent_id uuid,
  name varchar(80) NOT NULL CHECK(name=btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  type integer NOT NULL CHECK(type IN (10,20,30,40,50,60)),
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_by bigint NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(station_id,id),
  FOREIGN KEY(station_id,parent_id) REFERENCES station_space(station_id,id) ON DELETE RESTRICT,
  CHECK(parent_id IS DISTINCT FROM id)
);
-- The 80-character bound is this project's API contract; source did not state a maximum.
CREATE UNIQUE INDEX station_space_sibling_name ON station_space(station_id,parent_id,lower(name)) NULLS NOT DISTINCT;

CREATE TABLE station_space_device (
  device_id bigint PRIMARY KEY REFERENCES device(id) ON DELETE CASCADE,
  station_id bigint NOT NULL REFERENCES station(id) ON DELETE CASCADE,
  space_id uuid NOT NULL,
  created_by bigint NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(station_id,space_id) REFERENCES station_space(station_id,id) ON DELETE RESTRICT
);
CREATE INDEX station_space_device_space ON station_space_device(station_id,space_id);

CREATE FUNCTION station_space_tree_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_station bigint;
BEGIN
  target_station=CASE WHEN TG_OP='DELETE' THEN OLD.station_id ELSE NEW.station_id END;
  PERFORM pg_advisory_xact_lock(hashtextextended('station-space:' || target_station::text,0));
  IF TG_OP='DELETE' THEN
    IF EXISTS(SELECT 1 FROM station_space WHERE parent_id=OLD.id)
        OR EXISTS(SELECT 1 FROM station_space_device WHERE space_id=OLD.id) THEN
      RAISE EXCEPTION 'only empty leaf spaces may be deleted' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' AND (NEW.station_id IS DISTINCT FROM OLD.station_id
      OR NEW.type IS DISTINCT FROM OLD.type OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'space station, type and creator are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.parent_id IS NOT NULL AND EXISTS(
    WITH RECURSIVE ancestors AS (
      SELECT id,parent_id FROM station_space WHERE id=NEW.parent_id AND station_id=NEW.station_id
      UNION SELECT s.id,s.parent_id FROM station_space s JOIN ancestors a ON s.id=a.parent_id
        WHERE s.station_id=NEW.station_id
    ) SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN RAISE EXCEPTION 'space hierarchy cycle' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER station_space_tree BEFORE INSERT OR UPDATE OR DELETE ON station_space
  FOR EACH ROW EXECUTE FUNCTION station_space_tree_guard();

CREATE FUNCTION station_space_device_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE device_station bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('station-space:' || NEW.station_id::text,0));
  SELECT station_id INTO device_station FROM device WHERE id=NEW.device_id FOR SHARE;
  IF device_station IS DISTINCT FROM NEW.station_id THEN
    RAISE EXCEPTION 'space device station mismatch' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (NEW.device_id IS DISTINCT FROM OLD.device_id OR NEW.station_id IS DISTINCT FROM OLD.station_id
      OR NEW.space_id IS DISTINCT FROM OLD.space_id OR NEW.created_by IS DISTINCT FROM OLD.created_by) THEN
    RAISE EXCEPTION 'unbind device before changing its space' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER station_space_device_station BEFORE INSERT OR UPDATE ON station_space_device
  FOR EACH ROW EXECUTE FUNCTION station_space_device_guard();

-- Preserve the relation if another feature later moves a device to a different station.
CREATE FUNCTION station_space_device_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.station_id IS DISTINCT FROM OLD.station_id AND EXISTS(
      SELECT 1 FROM station_space_device WHERE device_id=OLD.id AND station_id IS DISTINCT FROM NEW.station_id) THEN
    RAISE EXCEPTION 'unbind device space before changing station' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER station_space_device_owner BEFORE UPDATE OF station_id ON device
  FOR EACH ROW EXECUTE FUNCTION station_space_device_owner_guard();
