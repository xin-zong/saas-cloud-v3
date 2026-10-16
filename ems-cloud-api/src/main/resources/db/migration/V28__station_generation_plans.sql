DO $$ BEGIN
  IF current_database() <> 'ems_cloud_saas_toyingzhen' OR current_user <> 'ems_toyingzhen_owner' THEN
    RAISE EXCEPTION 'V28 requires ems_cloud_saas_toyingzhen / ems_toyingzhen_owner';
  END IF;
END $$;

-- Persist explicit annual configuration in kWh; actual generation and KPI algorithms are separate.
CREATE TABLE station_generation_plan (
  id uuid PRIMARY KEY,
  station_id bigint NOT NULL REFERENCES station(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK(year BETWEEN 1 AND 9999),
  created_by bigint NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(station_id,year)
);
CREATE TABLE station_generation_plan_month (
  plan_id uuid NOT NULL REFERENCES station_generation_plan(id) ON DELETE CASCADE,
  month smallint NOT NULL CHECK(month BETWEEN 1 AND 12),
  planned_kwh numeric NOT NULL CHECK(planned_kwh BETWEEN 0.01 AND 99999999.99 AND scale(planned_kwh)<=2),
  excellent_kwh numeric CHECK(excellent_kwh IS NULL OR (excellent_kwh BETWEEN 0.01 AND 99999999.99 AND scale(excellent_kwh)<=2)),
  PRIMARY KEY(plan_id,month)
);
CREATE FUNCTION station_generation_plan_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.station_id IS DISTINCT FROM OLD.station_id OR NEW.year IS DISTINCT FROM OLD.year
      OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'station generation plan identity is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER station_generation_plan_identity BEFORE UPDATE ON station_generation_plan
  FOR EACH ROW EXECUTE FUNCTION station_generation_plan_identity_guard();
