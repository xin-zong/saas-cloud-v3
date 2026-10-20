DO $$ BEGIN
 IF current_database()<>'ems_cloud_saas_toyingzhen' OR current_user<>'ems_toyingzhen_owner' THEN
  RAISE EXCEPTION 'V62 requires isolated database and owner';
 END IF;
END $$;
ALTER TABLE reference_battery_pack_capture
 ADD COLUMN energy_group_present boolean NOT NULL DEFAULT false,
 ADD COLUMN charge_kwh numeric,
 ADD COLUMN discharge_kwh numeric,
 ADD CONSTRAINT pack_energy_presence CHECK (energy_group_present OR (charge_kwh IS NULL AND discharge_kwh IS NULL)),
 ADD CONSTRAINT pack_charge_energy CHECK (charge_kwh IS NULL OR (charge_kwh>=0 AND charge_kwh<'Infinity'::numeric)),
 ADD CONSTRAINT pack_discharge_energy CHECK (discharge_kwh IS NULL OR (discharge_kwh>=0 AND discharge_kwh<'Infinity'::numeric));
COMMENT ON COLUMN reference_battery_pack_capture.energy_group_present IS 'Optional captured battery energy card; timestamps and provenance are shared with this capture row. Absent differs from present with missing values.';
