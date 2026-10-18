-- Only the isolated replica database may acquire this lifecycle schema.
DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'asset lifecycle requires isolated database and owner';
 END IF;
END $$;
ALTER TABLE station ADD COLUMN lifecycle_version bigint NOT NULL DEFAULT 0,
 ADD COLUMN archived_at timestamptz, ADD COLUMN replica_visible boolean NOT NULL DEFAULT false;
ALTER TABLE device ADD COLUMN lifecycle_version bigint NOT NULL DEFAULT 0, ADD COLUMN archived_at timestamptz;
-- An unconfigured site has unknown capacities, never fabricated positive capacities.
ALTER TABLE station ALTER COLUMN rated_power_kw DROP NOT NULL, ALTER COLUMN capacity_kwh DROP NOT NULL;
CREATE FUNCTION bump_asset_lifecycle_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.lifecycle_version=OLD.lifecycle_version+1; RETURN NEW;
END $$;
CREATE TRIGGER station_lifecycle_version BEFORE UPDATE ON station FOR EACH ROW EXECUTE FUNCTION bump_asset_lifecycle_version();
CREATE TRIGGER device_lifecycle_version BEFORE UPDATE ON device FOR EACH ROW EXECUTE FUNCTION bump_asset_lifecycle_version();
CREATE INDEX station_active_replica ON station(tenant_id,id) WHERE archived_at IS NULL AND replica_visible;
