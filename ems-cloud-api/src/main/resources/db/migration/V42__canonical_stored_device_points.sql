DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V42 requires isolated toyingzhen database and owner';
 END IF;
 IF EXISTS(SELECT 1 FROM reference_device_point WHERE length(name)>120 OR length(unit)>30) THEN
  RAISE EXCEPTION 'Reference point name/unit exceeds canonical capacity; refuse lossy truncation';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS stored_device_point_binding (
 measurement_point_id bigint PRIMARY KEY REFERENCES measurement_point(id) ON DELETE RESTRICT,
 reference_point_id bigint NOT NULL UNIQUE REFERENCES reference_device_point(id) ON DELETE RESTRICT,
 station_id bigint NOT NULL REFERENCES station(id) ON DELETE RESTRICT,
 semantic_key varchar(30) CHECK(semantic_key IN ('gridPower','pvPower','loadPower','pcsPower','batteryPower','soc','soh','voltage','current','temperature'))
);
CREATE INDEX IF NOT EXISTS stored_device_point_station ON stored_device_point_binding(station_id,measurement_point_id);
COMMENT ON TABLE stored_device_point_binding IS 'Canonical stored telemetry with immutable original station; no EMS protocol binding or connectivity claim.';

-- One deterministic code per source point preserves exact (including per-cell) names and units.
-- Fail on conflicting pre-existing codes rather than silently borrowing unrelated measurements.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM reference_device_point p JOIN measurement_kind k ON k.code='stored_device_'||p.id
           WHERE k.name<>p.name OR k.unit<>p.unit) THEN
  RAISE EXCEPTION 'Canonical stored kind collision';
 END IF;
 IF EXISTS(SELECT 1 FROM reference_device_point p JOIN measurement_point mp ON mp.device_id=p.device_id AND mp.code='stored_device_'||p.id
           WHERE mp.kind_code<>'stored_device_'||p.id) THEN
  RAISE EXCEPTION 'Canonical stored point collision';
 END IF;
END $$;
INSERT INTO measurement_kind(code,name,unit)
 SELECT 'stored_device_'||id,name,unit FROM reference_device_point ORDER BY id ON CONFLICT(code) DO NOTHING;
INSERT INTO measurement_point(device_id,kind_code,code)
 SELECT device_id,'stored_device_'||id,'stored_device_'||id FROM reference_device_point ORDER BY id
 ON CONFLICT(device_id,code) DO NOTHING;

-- Only reviewed exact type/name/unit combinations. Summary and detail duplicates are NOT
-- both assigned to the same semantic role. Meter phase totals have no proven grid/load role.
INSERT INTO stored_device_point_binding(measurement_point_id,reference_point_id,station_id,semantic_key)
 SELECT mp.id,p.id,d.station_id,
 CASE
  WHEN dp.category='BMS' AND dp.source_type IN ('Battery Stack','Battery Cluster') THEN CASE
   WHEN p.name='SOC' AND p.unit='%' THEN 'soc'
   WHEN p.name='SOH' AND p.unit='%' THEN 'soh'
   WHEN p.name='储能充放电功率' AND p.unit='kW' THEN 'batteryPower'
   WHEN p.name='详情 · 电池电压' AND p.unit='V' THEN 'voltage'
   WHEN p.name='详情 · 电池电流' AND p.unit='A' THEN 'current'
   WHEN p.name='详情 · 电池温度' AND p.unit='℃' THEN 'temperature'
   END
  WHEN dp.category='PCS' AND dp.source_type='PCS' THEN CASE
   WHEN p.name='总交流有功功率' AND p.unit='kW' THEN 'pcsPower'
   WHEN p.name='详情 · 总直流电压' AND p.unit='V' THEN 'voltage'
   WHEN p.name='详情 · 总直流电流' AND p.unit='A' THEN 'current'
   WHEN p.name='详情 · 内部温度' AND p.unit='℃' THEN 'temperature'
   END
  WHEN dp.category='PV' AND dp.source_type='Inverter' AND p.name='发电功率' AND p.unit='kW' THEN 'pvPower'
 END
 FROM reference_device_point p JOIN device d ON d.id=p.device_id
 JOIN measurement_point mp ON mp.device_id=p.device_id AND mp.code='stored_device_'||p.id
 LEFT JOIN device_reference_profile dp ON dp.device_id=d.id
 ORDER BY p.id ON CONFLICT(reference_point_id) DO NOTHING;

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM reference_device_point p
   LEFT JOIN stored_device_point_binding b ON b.reference_point_id=p.id
   LEFT JOIN measurement_point mp ON mp.id=b.measurement_point_id
   LEFT JOIN device d ON d.id=p.device_id
   WHERE b.reference_point_id IS NULL OR mp.device_id<>p.device_id OR b.station_id<>d.station_id
     OR mp.code<>'stored_device_'||p.id OR mp.kind_code<>'stored_device_'||p.id) THEN
  RAISE EXCEPTION 'Canonical stored point mapping is incomplete or conflicts with original ownership';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION guard_stored_device_point_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.measurement_point_id,NEW.reference_point_id,NEW.station_id)
    IS DISTINCT FROM (OLD.measurement_point_id,OLD.reference_point_id,OLD.station_id) THEN
  RAISE EXCEPTION 'Stored telemetry identity and original station are immutable';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM measurement_point mp JOIN reference_device_point rp ON rp.device_id=mp.device_id
               JOIN device d ON d.id=mp.device_id
               WHERE mp.id=NEW.measurement_point_id AND rp.id=NEW.reference_point_id AND d.station_id=NEW.station_id) THEN
  RAISE EXCEPTION 'Stored telemetry binding must match original device and station';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stored_device_binding_guard ON stored_device_point_binding;
CREATE TRIGGER stored_device_binding_guard BEFORE INSERT OR UPDATE ON stored_device_point_binding
 FOR EACH ROW EXECUTE FUNCTION guard_stored_device_point_binding();

-- Retain ownership provenance even if future inventory code attempts to re-parent assets.
CREATE OR REPLACE FUNCTION guard_stored_device_lineage() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='device' THEN
  IF NEW.station_id IS DISTINCT FROM OLD.station_id AND EXISTS(
   SELECT 1 FROM stored_device_point_binding b JOIN measurement_point mp ON mp.id=b.measurement_point_id WHERE mp.device_id=OLD.id) THEN
   RAISE EXCEPTION 'Device with stored telemetry cannot change original station';
  END IF;
 ELSIF TG_TABLE_NAME='measurement_point' THEN
  IF NEW.device_id IS DISTINCT FROM OLD.device_id AND EXISTS(SELECT 1 FROM stored_device_point_binding WHERE measurement_point_id=OLD.id) THEN
   RAISE EXCEPTION 'Stored measurement point cannot change original device';
  END IF;
 ELSIF TG_TABLE_NAME='reference_device_point' THEN
  IF NEW.device_id IS DISTINCT FROM OLD.device_id AND EXISTS(SELECT 1 FROM stored_device_point_binding WHERE reference_point_id=OLD.id) THEN
   RAISE EXCEPTION 'Stored source point cannot change original device';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stored_device_lineage_guard ON device;
CREATE TRIGGER stored_device_lineage_guard BEFORE UPDATE OF station_id ON device FOR EACH ROW EXECUTE FUNCTION guard_stored_device_lineage();
DROP TRIGGER IF EXISTS stored_measurement_lineage_guard ON measurement_point;
CREATE TRIGGER stored_measurement_lineage_guard BEFORE UPDATE OF device_id ON measurement_point FOR EACH ROW EXECUTE FUNCTION guard_stored_device_lineage();
DROP TRIGGER IF EXISTS stored_reference_lineage_guard ON reference_device_point;
CREATE TRIGGER stored_reference_lineage_guard BEFORE UPDATE OF device_id ON reference_device_point FOR EACH ROW EXECUTE FUNCTION guard_stored_device_lineage();
